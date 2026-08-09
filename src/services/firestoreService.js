/**
 * firestoreService.js - Cloud Database Operations for Lineageweaver
 * 
 * PURPOSE:
 * This service handles all Firestore (cloud database) operations.
 * It mirrors the structure of database.js but saves to Firebase instead of IndexedDB.
 * 
 * DATA STRUCTURE IN FIRESTORE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  /users/{userId}/                                           │
 * │    ├── /people/{personId}      → Person documents          │
 * │    ├── /houses/{houseId}       → House documents           │
 * │    ├── /relationships/{id}     → Relationship documents    │
 * │    ├── /codexEntries/{id}      → Codex entry documents     │
 * │    ├── /codexLinks/{id}        → Codex link documents      │
 * │    └── /acknowledgedDuplicates/{id} → Namesake tracking    │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHY THIS STRUCTURE?
 * - Each user has their own "folder" (collection) of data
 * - Security rules can enforce that users only access their own data
 * - Clean separation between users' genealogy projects
 * 
 * FIRESTORE CONCEPTS:
 * - Collection: A group of documents (like a folder or database table)
 * - Document: A single record with fields (like a row or JSON object)
 * - Subcollection: A collection inside a document (nested folders)
 * 
 * DOCUMENT IDS:
 * We use Firestore's auto-generated IDs for cloud documents, but store
 * the original local ID in a field so we can map between local and cloud.
 */

import {
  getDocs,
  query,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import { allEntities, cloudCollections } from './syncManifest';
import { pruneTargets } from './syncEngine';
import {
  addCloud,
  getCloud,
  getAllCloud,
  updateCloud,
  deleteCloud,
  getUserCollection,
  getUserDoc
} from './cloudRepo';

// ==================== ENTITY CRUD (generated shims) ====================
//
// These 79 names were 79 hand-written function bodies — about 1,200 lines that
// were five operations repeated twenty times (sync manifest, step 3). They are
// kept as one-line aliases so every existing call site keeps working; the
// bodies now live in `cloudRepo.ts`, driven by the manifest.
//
// The six behavioural variants those bodies actually contained are preserved,
// declared per entity in the manifest as `create` and `update` policies. See
// the header of `cloudRepo.ts` — the audit's claim that they differed "only by
// a collection-name literal" is not true, and collapsing them would have been a
// silent change to what gets written to the user's Firestore.
//
// Steps 4 and 7 migrate the call sites onto `syncOp`, after which these go.

export const addChapterCloud = (userId, datasetId, chapterData) =>
  addCloud('chapter', userId, datasetId, chapterData);

export const getAllChaptersCloud = (userId, datasetId) =>
  getAllCloud('chapter', userId, datasetId);

export const updateChapterCloud = (userId, datasetId, chapterId, updates) =>
  updateCloud('chapter', userId, datasetId, chapterId, updates);

export const deleteChapterCloud = (userId, datasetId, chapterId) =>
  deleteCloud('chapter', userId, datasetId, chapterId);

export const addCharacterArcCloud = (userId, datasetId, arcData) =>
  addCloud('characterArc', userId, datasetId, arcData);

export const getAllCharacterArcsCloud = (userId, datasetId) =>
  getAllCloud('characterArc', userId, datasetId);

export const updateCharacterArcCloud = (userId, datasetId, arcId, updates) =>
  updateCloud('characterArc', userId, datasetId, arcId, updates);

export const deleteCharacterArcCloud = (userId, datasetId, arcId) =>
  deleteCloud('characterArc', userId, datasetId, arcId);

export const addCodexEntryCloud = (userId, datasetId, entryData) =>
  addCloud('codexEntry', userId, datasetId, entryData);

export const getAllCodexEntriesCloud = (userId, datasetId) =>
  getAllCloud('codexEntry', userId, datasetId);

export const updateCodexEntryCloud = (userId, datasetId, entryId, updates) =>
  updateCloud('codexEntry', userId, datasetId, entryId, updates);

export const deleteCodexEntryCloud = (userId, datasetId, entryId) =>
  deleteCloud('codexEntry', userId, datasetId, entryId);

export const addCodexLinkCloud = (userId, datasetId, linkData) =>
  addCloud('codexLink', userId, datasetId, linkData);

export const getAllCodexLinksCloud = (userId, datasetId) =>
  getAllCloud('codexLink', userId, datasetId);

export const deleteCodexLinkCloud = (userId, datasetId, linkId) =>
  deleteCloud('codexLink', userId, datasetId, linkId);

export const addDignityCloud = (userId, datasetId, dignityData) =>
  addCloud('dignity', userId, datasetId, dignityData);

export const getAllDignitiesCloud = (userId, datasetId) =>
  getAllCloud('dignity', userId, datasetId);

export const updateDignityCloud = (userId, datasetId, dignityId, updates) =>
  updateCloud('dignity', userId, datasetId, dignityId, updates);

export const deleteDignityCloud = (userId, datasetId, dignityId) =>
  deleteCloud('dignity', userId, datasetId, dignityId);

export const addDignityLinkCloud = (userId, datasetId, linkData) =>
  addCloud('dignityLink', userId, datasetId, linkData);

export const getAllDignityLinksCloud = (userId, datasetId) =>
  getAllCloud('dignityLink', userId, datasetId);

export const deleteDignityLinkCloud = (userId, datasetId, linkId) =>
  deleteCloud('dignityLink', userId, datasetId, linkId);

export const addDignityTenureCloud = (userId, datasetId, tenureData) =>
  addCloud('dignityTenure', userId, datasetId, tenureData);

export const getAllDignityTenuresCloud = (userId, datasetId) =>
  getAllCloud('dignityTenure', userId, datasetId);

export const updateDignityTenureCloud = (userId, datasetId, tenureId, updates) =>
  updateCloud('dignityTenure', userId, datasetId, tenureId, updates);

export const deleteDignityTenureCloud = (userId, datasetId, tenureId) =>
  deleteCloud('dignityTenure', userId, datasetId, tenureId);

export const addHeraldryCloud = (userId, datasetId, heraldryData) =>
  addCloud('heraldry', userId, datasetId, heraldryData);

export const getHeraldryCloud = (userId, datasetId, heraldryId) =>
  getCloud('heraldry', userId, datasetId, heraldryId);

export const getAllHeraldryCloud = (userId, datasetId) =>
  getAllCloud('heraldry', userId, datasetId);

export const updateHeraldryCloud = (userId, datasetId, heraldryId, updates) =>
  updateCloud('heraldry', userId, datasetId, heraldryId, updates);

export const deleteHeraldryCloud = (userId, datasetId, heraldryId) =>
  deleteCloud('heraldry', userId, datasetId, heraldryId);

export const addHeraldryLinkCloud = (userId, datasetId, linkData) =>
  addCloud('heraldryLink', userId, datasetId, linkData);

export const getAllHeraldryLinksCloud = (userId, datasetId) =>
  getAllCloud('heraldryLink', userId, datasetId);

export const deleteHeraldryLinkCloud = (userId, datasetId, linkId) =>
  deleteCloud('heraldryLink', userId, datasetId, linkId);

export const addHouseCloud = (userId, datasetId, houseData) =>
  addCloud('house', userId, datasetId, houseData);

export const getHouseCloud = (userId, datasetId, houseId) =>
  getCloud('house', userId, datasetId, houseId);

export const getAllHousesCloud = (userId, datasetId) =>
  getAllCloud('house', userId, datasetId);

export const updateHouseCloud = (userId, datasetId, houseId, updates) =>
  updateCloud('house', userId, datasetId, houseId, updates);

export const deleteHouseCloud = (userId, datasetId, houseId) =>
  deleteCloud('house', userId, datasetId, houseId);

export const addHouseholdRoleCloud = (userId, datasetId, roleData) =>
  addCloud('householdRole', userId, datasetId, roleData);

export const getAllHouseholdRolesCloud = (userId, datasetId) =>
  getAllCloud('householdRole', userId, datasetId);

export const updateHouseholdRoleCloud = (userId, datasetId, roleId, updates) =>
  updateCloud('householdRole', userId, datasetId, roleId, updates);

export const deleteHouseholdRoleCloud = (userId, datasetId, roleId) =>
  deleteCloud('householdRole', userId, datasetId, roleId);

export const addPersonCloud = (userId, datasetId, personData) =>
  addCloud('person', userId, datasetId, personData);

export const getPersonCloud = (userId, datasetId, personId) =>
  getCloud('person', userId, datasetId, personId);

export const getAllPeopleCloud = (userId, datasetId) =>
  getAllCloud('person', userId, datasetId);

export const updatePersonCloud = (userId, datasetId, personId, updates) =>
  updateCloud('person', userId, datasetId, personId, updates);

export const deletePersonCloud = (userId, datasetId, personId) =>
  deleteCloud('person', userId, datasetId, personId);

export const addPlotThreadCloud = (userId, datasetId, threadData) =>
  addCloud('plotThread', userId, datasetId, threadData);

export const getAllPlotThreadsCloud = (userId, datasetId) =>
  getAllCloud('plotThread', userId, datasetId);

export const updatePlotThreadCloud = (userId, datasetId, threadId, updates) =>
  updateCloud('plotThread', userId, datasetId, threadId, updates);

export const deletePlotThreadCloud = (userId, datasetId, threadId) =>
  deleteCloud('plotThread', userId, datasetId, threadId);

export const addRelationshipCloud = (userId, datasetId, relationshipData) =>
  addCloud('relationship', userId, datasetId, relationshipData);

export const getAllRelationshipsCloud = (userId, datasetId) =>
  getAllCloud('relationship', userId, datasetId);

export const updateRelationshipCloud = (userId, datasetId, relationshipId, updates) =>
  updateCloud('relationship', userId, datasetId, relationshipId, updates);

export const deleteRelationshipCloud = (userId, datasetId, relationshipId) =>
  deleteCloud('relationship', userId, datasetId, relationshipId);

export const addScenePlanCloud = (userId, datasetId, sceneData) =>
  addCloud('scenePlan', userId, datasetId, sceneData);

export const getAllScenePlansCloud = (userId, datasetId) =>
  getAllCloud('scenePlan', userId, datasetId);

export const updateScenePlanCloud = (userId, datasetId, sceneId, updates) =>
  updateCloud('scenePlan', userId, datasetId, sceneId, updates);

export const deleteScenePlanCloud = (userId, datasetId, sceneId) =>
  deleteCloud('scenePlan', userId, datasetId, sceneId);

export const addStoryArcCloud = (userId, datasetId, arcData) =>
  addCloud('storyArc', userId, datasetId, arcData);

export const getAllStoryArcsCloud = (userId, datasetId) =>
  getAllCloud('storyArc', userId, datasetId);

export const updateStoryArcCloud = (userId, datasetId, arcId, updates) =>
  updateCloud('storyArc', userId, datasetId, arcId, updates);

export const deleteStoryArcCloud = (userId, datasetId, arcId) =>
  deleteCloud('storyArc', userId, datasetId, arcId);

export const addStoryBeatCloud = (userId, datasetId, beatData) =>
  addCloud('storyBeat', userId, datasetId, beatData);

export const getAllStoryBeatsCloud = (userId, datasetId) =>
  getAllCloud('storyBeat', userId, datasetId);

export const updateStoryBeatCloud = (userId, datasetId, beatId, updates) =>
  updateCloud('storyBeat', userId, datasetId, beatId, updates);

export const deleteStoryBeatCloud = (userId, datasetId, beatId) =>
  deleteCloud('storyBeat', userId, datasetId, beatId);

export const addStoryPlanCloud = (userId, datasetId, planData) =>
  addCloud('storyPlan', userId, datasetId, planData);

export const getAllStoryPlansCloud = (userId, datasetId) =>
  getAllCloud('storyPlan', userId, datasetId);

export const updateStoryPlanCloud = (userId, datasetId, planId, updates) =>
  updateCloud('storyPlan', userId, datasetId, planId, updates);

export const deleteStoryPlanCloud = (userId, datasetId, planId) =>
  deleteCloud('storyPlan', userId, datasetId, planId);

export const addWritingCloud = (userId, datasetId, writingData) =>
  addCloud('writing', userId, datasetId, writingData);

export const getAllWritingsCloud = (userId, datasetId) =>
  getAllCloud('writing', userId, datasetId);

export const updateWritingCloud = (userId, datasetId, writingId, updates) =>
  updateCloud('writing', userId, datasetId, writingId, updates);

export const deleteWritingCloud = (userId, datasetId, writingId) =>
  deleteCloud('writing', userId, datasetId, writingId);

export const addWritingLinkCloud = (userId, datasetId, linkData) =>
  addCloud('writingLink', userId, datasetId, linkData);

export const getAllWritingLinksCloud = (userId, datasetId) =>
  getAllCloud('writingLink', userId, datasetId);

export const deleteWritingLinkCloud = (userId, datasetId, linkId) =>
  deleteCloud('writingLink', userId, datasetId, linkId);










// ==================== HOUSE OPERATIONS ====================











// ==================== RELATIONSHIP OPERATIONS ====================









// ==================== CODEX OPERATIONS ====================









// ==================== CODEX LINK OPERATIONS ====================







// ==================== PLANNING: STORY PLANS ====================









// ==================== PLANNING: STORY ARCS ====================









// ==================== PLANNING: STORY BEATS ====================









// ==================== PLANNING: SCENE PLANS ====================









// ==================== PLANNING: PLOT THREADS ====================









// ==================== PLANNING: CHARACTER ARCS ====================









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







// ==================== ADDITIONAL BULK OPERATIONS ====================

/**
 * Delete all data from a specific dataset in cloud
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function deleteAllCloudData(userId, datasetId) {
  try {
    logger.log('☁️ Deleting all cloud data for dataset:', datasetId);

    // Was a hand-written list of 22 names, one of four such lists that had
    // drifted apart (sync manifest, step 2). `cloudCollections()` is the same
    // 22 and stays right when an entity is added.
    for (const collName of cloudCollections()) {
      const collRef = getUserCollection(userId, datasetId, collName);
      const snapshot = await getDocs(collRef);

      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (!snapshot.empty) {
        await batch.commit();
      }
    }

    logger.log('☁️ All cloud data deleted for dataset:', datasetId);
    return true;
  } catch (error) {
    logger.error('☁️ Error deleting cloud data:', error);
    throw error;
  }
}

export default {
  // People
  addPersonCloud,
  getPersonCloud,
  getAllPeopleCloud,
  updatePersonCloud,
  deletePersonCloud,

  // Houses
  addHouseCloud,
  getHouseCloud,
  getAllHousesCloud,
  updateHouseCloud,
  deleteHouseCloud,

  // Relationships
  addRelationshipCloud,
  getAllRelationshipsCloud,
  updateRelationshipCloud,
  deleteRelationshipCloud,

  // Codex Entries
  addCodexEntryCloud,
  getAllCodexEntriesCloud,
  updateCodexEntryCloud,
  deleteCodexEntryCloud,

  // Codex Links
  addCodexLinkCloud,
  getAllCodexLinksCloud,
  deleteCodexLinkCloud,

  // Heraldry
  addHeraldryCloud,
  getHeraldryCloud,
  getAllHeraldryCloud,
  updateHeraldryCloud,
  deleteHeraldryCloud,

  // Heraldry Links
  addHeraldryLinkCloud,
  getAllHeraldryLinksCloud,
  deleteHeraldryLinkCloud,

  // Dignities
  addDignityCloud,
  getAllDignitiesCloud,
  updateDignityCloud,
  deleteDignityCloud,

  // Dignity Tenures
  addDignityTenureCloud,
  getAllDignityTenuresCloud,
  updateDignityTenureCloud,
  deleteDignityTenureCloud,

  // Dignity Links
  addDignityLinkCloud,
  getAllDignityLinksCloud,
  deleteDignityLinkCloud,

  // Household Roles
  addHouseholdRoleCloud,
  getAllHouseholdRolesCloud,
  updateHouseholdRoleCloud,
  deleteHouseholdRoleCloud,

  // Writings
  addWritingCloud,
  getAllWritingsCloud,
  updateWritingCloud,
  deleteWritingCloud,

  // Chapters
  addChapterCloud,
  getAllChaptersCloud,
  updateChapterCloud,
  deleteChapterCloud,

  // Writing Links
  addWritingLinkCloud,
  getAllWritingLinksCloud,
  deleteWritingLinkCloud,

  // Story Plans
  addStoryPlanCloud,
  getAllStoryPlansCloud,
  updateStoryPlanCloud,
  deleteStoryPlanCloud,

  // Story Arcs
  addStoryArcCloud,
  getAllStoryArcsCloud,
  updateStoryArcCloud,
  deleteStoryArcCloud,

  // Story Beats
  addStoryBeatCloud,
  getAllStoryBeatsCloud,
  updateStoryBeatCloud,
  deleteStoryBeatCloud,

  // Scene Plans
  addScenePlanCloud,
  getAllScenePlansCloud,
  updateScenePlanCloud,
  deleteScenePlanCloud,

  // Plot Threads
  addPlotThreadCloud,
  getAllPlotThreadsCloud,
  updatePlotThreadCloud,
  deletePlotThreadCloud,

  // Character Arcs
  addCharacterArcCloud,
  getAllCharacterArcsCloud,
  updateCharacterArcCloud,
  deleteCharacterArcCloud,

  // Arc Milestones

  // Bulk operations
  syncAllToCloud,
  downloadAllFromCloud,
  hasCloudData,
  deleteAllCloudData
};
