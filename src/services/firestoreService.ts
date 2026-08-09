/**
 * firestoreService.ts — the three whole-dataset cloud operations.
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
import type { CloudRecord } from './cloudRepo';
import type { DatasetId } from './types';
import type { LocalSnapshot } from './syncEngine';

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
 * `prune` is opt-in and deletes cloud documents. See `pruneTargets` for the two
 * guards that decide what is eligible; nothing here overrides them.
 */
export async function syncAllToCloud(
  userId: string,
  datasetId: DatasetId,
  localData: LocalSnapshot,
  options: { prune?: boolean } = {}
): Promise<boolean> {
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

    const counts: Record<string, number> = {};

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

      // Read into {table, ids} pairs rather than two parallel arrays indexed by
      // position. Same result, but nothing here depends on the two staying the
      // same length — and under `noUncheckedIndexedAccess` the parallel-array
      // form needs a `?? []` that would read like a meaningful default for a
      // value that decides what gets deleted.
      const cloudIdsByTable: Record<string, string[]> = {};
      const reads = await Promise.all(
        present.map(async (entity) => ({
          table: entity.table,
          ids: (await getDocs(getUserCollection(userId, datasetId, entity.collection)))
            .docs.map((docSnap) => docSnap.id)
        }))
      );
      for (const read of reads) cloudIdsByTable[read.table] = read.ids;

      const targets = pruneTargets(localData, cloudIdsByTable);

      for (const entity of present) {
        for (const docId of targets[entity.table] ?? []) {
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
 * Returns rows keyed by **table** name, matching what `syncAllToCloud` accepts.
 */
export async function downloadAllFromCloud(
  userId: string,
  datasetId: DatasetId
): Promise<Record<string, CloudRecord[]>> {
  try {
    logger.log('☁️ Downloading all data from cloud for dataset:', datasetId);

    const reads = await Promise.all(
      allEntities().map(async (entity) => ({
        table: entity.table,
        rows: await getAllCloud(entity.entityType, userId, datasetId)
      }))
    );

    const data: Record<string, CloudRecord[]> = {};
    const counts: Record<string, number> = {};
    for (const read of reads) {
      data[read.table] = read.rows;
      counts[read.table] = read.rows.length;
    }

    logger.log('☁️ Download complete!', { dataset: datasetId, ...counts });

    return data;
  } catch (error) {
    logger.error('☁️ Error downloading from cloud:', error);
    throw error;
  }
}

/**
 * Does this dataset exist in the cloud at all?
 *
 * Returns false on error rather than throwing, which is load-bearing: the
 * caller uses this to choose between "restore from cloud" and "upload local",
 * and an exception here would abort startup sync entirely.
 *
 * **Two known defects, not fixed here.** The audit records both
 * (`sections/02-data-sync.md`, "hasCloudData probes only houses"), and this is a
 * conversion commit — the value of one is that nothing runs differently after
 * it.
 *
 *   1. It probes `houses` alone. A dataset holding people, a Codex and no
 *      houses answers *false*, which routes `initializeSync` into "fresh start
 *      / upload local" and can overwrite real cloud data.
 *   2. There is no `limit(1)`. The whole collection is read to compute a
 *      boolean, so 500 houses is 500 document reads on every sign-in.
 *
 * Fixing (2) is a one-line change. Fixing (1) means deciding what "has data"
 * means when the answer is used to choose which side wins, which is why neither
 * is done in passing.
 */
export async function hasCloudData(userId: string, datasetId: DatasetId): Promise<boolean> {
  try {
    const housesRef = getUserCollection(userId, datasetId, 'houses');
    const snapshot = await getDocs(query(housesRef));
    return !snapshot.empty;
  } catch (error) {
    logger.error('☁️ Error checking cloud data:', error);
    return false;
  }
}
