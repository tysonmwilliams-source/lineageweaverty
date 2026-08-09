/**
 * firestoreService.js — the three whole-dataset cloud operations.
 *
 * Once 2,238 lines and 87 functions; now three. Per-entity CRUD moved to
 * `cloudRepo.ts` in step 3 of the sync-layer refactor and the 79 compatibility
 * aliases were deleted in step 7, having never acquired a single caller outside
 * this file. What is left is the work that is genuinely about a *dataset* rather
 * than a row:
 *
 *   syncAllToCloud      upload every local row, optionally pruning cloud
 *                       documents that no longer exist locally
 *   downloadAllFromCloud  read every cloud row, keyed by table name
 *   hasCloudData        does this dataset exist in the cloud at all
 *
 * ## Layout
 *
 *   users/{userId}/datasets/{datasetId}/{collection}/{documentId}
 *
 * The `datasets/{datasetId}` segment is not optional and is easy to forget —
 * a path without it writes to a legacy location that only `migrationService`
 * reads. `getUserCollection` and `getUserDoc` in `cloudRepo.ts` are the only
 * two places that build these paths, for exactly that reason.
 *
 * ## Document ids are the local ids
 *
 * The document id is `String(row.id)` — the Dexie autoincrement key, as a
 * string. Firestore's auto-generated ids are never used. That is what makes the
 * two stores mappable without a lookup table, and it is load-bearing rather
 * than incidental: pruning compares cloud document ids against local row ids
 * directly, so the coercion is the thing that makes "does this still exist
 * locally?" answerable at all.
 *
 * (`localId` is also written into each document as a field. It duplicates the
 * document id and predates the id convention above.)
 */

import {
  getDocs,
  query,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import { allEntities } from './syncManifest';
import { pruneTargets } from './syncEngine';
import { getAllCloud, getUserCollection, getUserDoc } from './cloudRepo';

// ==================== BULK OPERATIONS ====================

/**
 * Upload every local row to the cloud, in batches.
 *
 * Sync manifest, step 5. This was twenty copies of the same eight-line loop —
 * one per entity, each naming its collection as a literal — followed by a
 * twenty-key destructure and a twenty-line log object. The manifest already
 * knows every table and the collection it maps to, so the whole thing is one
 * loop over `allEntities()`.
 *
 * `localData` is keyed by **table** name, which is what every caller already
 * passes and why `entity.table` and `entity.collection` are separate fields on
 * the manifest rather than one.
 *
 * Note what this writes: `syncedAt` only, no `createdAt` or `updatedAt`. That
 * differs from `addCloud`, which stamps per the entity's create policy — a bulk
 * upload is a snapshot of local state, not twenty thousand individual creates,
 * and it deliberately does not claim to know when each row was made. Preserved
 * exactly as it was.
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} localData - Rows keyed by table name
 */
export async function syncAllToCloud(userId, datasetId, localData, options = {}) {
  const { prune = false } = options;
  try {
    logger.log('☁️ Starting full sync to cloud for dataset:', datasetId);

    // Firestore caps a batch at 500 operations, so commit and start a fresh one
    // as we approach it. 450 leaves room for the loop to overshoot by a row.
    let operationCount = 0;
    let batch = writeBatch(db);

    const checkBatch = async () => {
      operationCount++;
      if (operationCount >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
        logger.log('☁️ Committed batch, starting new one...');
      }
    };

    const counts = {};

    // The old code ran houses before people, with a comment saying people
    // reference houses. That ordering was inert — Firestore has no referential
    // integrity and a batch is not ordered — so manifest order is used instead.
    for (const entity of allEntities()) {
      const rows = localData[entity.table] || [];
      counts[entity.table] = rows.length;

      for (const row of rows) {
        const docRef = getUserDoc(userId, datasetId, entity.collection, String(row.id));
        batch.set(docRef, {
          ...row,
          localId: row.id,
          syncedAt: serverTimestamp()
        });
        await checkBatch();
      }
    }

    let pruned = 0;

    if (prune) {
      // Read what is in the cloud before deciding what to remove. Only the
      // tables actually present in the snapshot are read — a table the snapshot
      // omitted could not be read locally, and must not be pruned.
      const present = allEntities().filter((entity) => localData[entity.table] !== undefined);
      const snapshots = await Promise.all(
        present.map((entity) => getDocs(getUserCollection(userId, datasetId, entity.collection)))
      );

      const cloudIdsByTable = {};
      present.forEach((entity, index) => {
        cloudIdsByTable[entity.table] = snapshots[index].docs.map((docSnap) => docSnap.id);
      });

      const targets = pruneTargets(localData, cloudIdsByTable);

      for (const entity of present) {
        for (const docId of targets[entity.table] || []) {
          batch.delete(getUserDoc(userId, datasetId, entity.collection, docId));
          pruned++;
          await checkBatch();
        }
      }

      if (pruned > 0) logger.log(`☁️ Pruned ${pruned} cloud documents with no local counterpart`);
    }

    if (operationCount > 0) {
      await batch.commit();
    }

    logger.log('☁️ Full sync to cloud complete!', { dataset: datasetId, pruned, ...counts });

    return true;
  } catch (error) {
    logger.error('☁️ Error syncing to cloud:', error);
    throw error;
  }
}

/**
 * Read every cloud row for a dataset, keyed by table name.
 *
 * Sync manifest, step 5. Was a twenty-entry `Promise.all`, a twenty-name array
 * destructure, a twenty-line log object and a twenty-key return literal — four
 * separate lists that had to agree, in the function whose whole job is to not
 * miss a collection.
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Object} Rows keyed by table name
 */
export async function downloadAllFromCloud(userId, datasetId) {
  try {
    logger.log('☁️ Downloading all data from cloud for dataset:', datasetId);

    const entities = allEntities();
    const results = await Promise.all(
      entities.map((entity) => getAllCloud(entity.entityType, userId, datasetId))
    );

    const data = {};
    const counts = {};
    entities.forEach((entity, index) => {
      data[entity.table] = results[index];
      counts[entity.table] = results[index].length;
    });

    logger.log('☁️ Download complete!', { dataset: datasetId, ...counts });

    return data;
  } catch (error) {
    logger.error('☁️ Error downloading from cloud:', error);
    throw error;
  }
}

/**
 * Check if user has any data in cloud for a specific dataset
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {boolean} True if user has cloud data in this dataset
 */
export async function hasCloudData(userId, datasetId) {
  try {
    // Just check if there are any houses (quick check)
    const housesRef = getUserCollection(userId, datasetId, 'houses');
    const snapshot = await getDocs(query(housesRef));
    return !snapshot.empty;
  } catch (error) {
    logger.error('☁️ Error checking cloud data:', error);
    return false;
  }
}

// ==================== HERALDRY OPERATIONS ====================











// ==================== DIGNITIES OPERATIONS ====================









// ==================== DIGNITY TENURES OPERATIONS ====================









// ==================== DIGNITY LINKS OPERATIONS ====================







// ==================== HERALDRY LINKS OPERATIONS ====================







// ==================== HOUSEHOLD ROLES OPERATIONS ====================









// ==================== WRITINGS OPERATIONS ====================









// ==================== CHAPTERS OPERATIONS ====================









// ==================== WRITING LINKS OPERATIONS ====================
