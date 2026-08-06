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
import { cloudCollections } from './syncManifest';
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
 * Sync all local data to cloud
 * Used for initial upload when user first signs in with existing local data
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} localData - Object containing people, houses, relationships arrays
 */
export async function syncAllToCloud(userId, datasetId, localData) {
  try {
    logger.log('☁️ Starting full sync to cloud for dataset:', datasetId);

    const { people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs } = localData;

    // Use batched writes for efficiency (max 500 operations per batch)
    // We'll create multiple batches if needed

    let operationCount = 0;
    let batch = writeBatch(db);

    // Helper to commit batch if getting full
    const checkBatch = async () => {
      operationCount++;
      if (operationCount >= 450) { // Leave buffer before 500 limit
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
        logger.log('☁️ Committed batch, starting new one...');
      }
    };

    // Sync houses first (people reference houses)
    for (const house of houses || []) {
      const docRef = getUserDoc(userId, datasetId, 'houses', String(house.id));
      batch.set(docRef, {
        ...house,
        localId: house.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync people
    for (const person of people || []) {
      const docRef = getUserDoc(userId, datasetId, 'people', String(person.id));
      batch.set(docRef, {
        ...person,
        localId: person.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync relationships
    for (const rel of relationships || []) {
      const docRef = getUserDoc(userId, datasetId, 'relationships', String(rel.id));
      batch.set(docRef, {
        ...rel,
        localId: rel.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync codex entries
    for (const entry of codexEntries || []) {
      const docRef = getUserDoc(userId, datasetId, 'codexEntries', String(entry.id));
      batch.set(docRef, {
        ...entry,
        localId: entry.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync codex links
    for (const link of codexLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'codexLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync heraldry
    for (const h of heraldry || []) {
      const docRef = getUserDoc(userId, datasetId, 'heraldry', String(h.id));
      batch.set(docRef, {
        ...h,
        localId: h.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync heraldry links
    for (const link of heraldryLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'heraldryLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignities
    for (const dignity of dignities || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignities', String(dignity.id));
      batch.set(docRef, {
        ...dignity,
        localId: dignity.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignity tenures
    for (const tenure of dignityTenures || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignityTenures', String(tenure.id));
      batch.set(docRef, {
        ...tenure,
        localId: tenure.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignity links
    for (const link of dignityLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignityLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync household roles
    for (const role of householdRoles || []) {
      const docRef = getUserDoc(userId, datasetId, 'householdRoles', String(role.id));
      batch.set(docRef, {
        ...role,
        localId: role.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync writings
    for (const writing of writings || []) {
      const docRef = getUserDoc(userId, datasetId, 'writings', String(writing.id));
      batch.set(docRef, {
        ...writing,
        localId: writing.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync chapters
    for (const chapter of chapters || []) {
      const docRef = getUserDoc(userId, datasetId, 'chapters', String(chapter.id));
      batch.set(docRef, {
        ...chapter,
        localId: chapter.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync writing links
    for (const link of writingLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'writingLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story plans
    for (const plan of storyPlans || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyPlans', String(plan.id));
      batch.set(docRef, {
        ...plan,
        localId: plan.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story arcs
    for (const arc of storyArcs || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyArcs', String(arc.id));
      batch.set(docRef, {
        ...arc,
        localId: arc.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story beats
    for (const beat of storyBeats || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyBeats', String(beat.id));
      batch.set(docRef, {
        ...beat,
        localId: beat.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync scene plans
    for (const scene of scenePlans || []) {
      const docRef = getUserDoc(userId, datasetId, 'scenePlans', String(scene.id));
      batch.set(docRef, {
        ...scene,
        localId: scene.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync plot threads
    for (const thread of plotThreads || []) {
      const docRef = getUserDoc(userId, datasetId, 'plotThreads', String(thread.id));
      batch.set(docRef, {
        ...thread,
        localId: thread.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync character arcs
    for (const arc of characterArcs || []) {
      const docRef = getUserDoc(userId, datasetId, 'characterArcs', String(arc.id));
      batch.set(docRef, {
        ...arc,
        localId: arc.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }


    // Commit remaining operations
    if (operationCount > 0) {
      await batch.commit();
    }

    logger.log('☁️ Full sync to cloud complete!', {
      dataset: datasetId,
      houses: houses?.length || 0,
      people: people?.length || 0,
      relationships: relationships?.length || 0,
      codexEntries: codexEntries?.length || 0,
      codexLinks: codexLinks?.length || 0,
      heraldry: heraldry?.length || 0,
      heraldryLinks: heraldryLinks?.length || 0,
      dignities: dignities?.length || 0,
      dignityTenures: dignityTenures?.length || 0,
      dignityLinks: dignityLinks?.length || 0,
      householdRoles: householdRoles?.length || 0,
      writings: writings?.length || 0,
      chapters: chapters?.length || 0,
      writingLinks: writingLinks?.length || 0,
      storyPlans: storyPlans?.length || 0,
      storyArcs: storyArcs?.length || 0,
      storyBeats: storyBeats?.length || 0,
      scenePlans: scenePlans?.length || 0,
      plotThreads: plotThreads?.length || 0,
      characterArcs: characterArcs?.length || 0
    });

    return true;
  } catch (error) {
    logger.error('☁️ Error syncing to cloud:', error);
    throw error;
  }
}

/**
 * Download all cloud data to local
 * Used when user signs in on a new device
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Object} Object containing people, houses, relationships, codexEntries arrays
 */
export async function downloadAllFromCloud(userId, datasetId) {
  try {
    logger.log('☁️ Downloading all data from cloud for dataset:', datasetId);

    const [people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs] = await Promise.all([
      getAllPeopleCloud(userId, datasetId),
      getAllHousesCloud(userId, datasetId),
      getAllRelationshipsCloud(userId, datasetId),
      getAllCodexEntriesCloud(userId, datasetId),
      getAllCodexLinksCloud(userId, datasetId),
      getAllHeraldryCloud(userId, datasetId),
      getAllHeraldryLinksCloud(userId, datasetId),
      getAllDignitiesCloud(userId, datasetId),
      getAllDignityTenuresCloud(userId, datasetId),
      getAllDignityLinksCloud(userId, datasetId),
      getAllHouseholdRolesCloud(userId, datasetId),
      getAllWritingsCloud(userId, datasetId),
      getAllChaptersCloud(userId, datasetId),
      getAllWritingLinksCloud(userId, datasetId),
      getAllStoryPlansCloud(userId, datasetId),
      getAllStoryArcsCloud(userId, datasetId),
      getAllStoryBeatsCloud(userId, datasetId),
      getAllScenePlansCloud(userId, datasetId),
      getAllPlotThreadsCloud(userId, datasetId),
      getAllCharacterArcsCloud(userId, datasetId)
    ]);

    logger.log('☁️ Download complete!', {
      dataset: datasetId,
      houses: houses.length,
      people: people.length,
      relationships: relationships.length,
      codexEntries: codexEntries.length,
      codexLinks: codexLinks.length,
      heraldry: heraldry.length,
      heraldryLinks: heraldryLinks.length,
      dignities: dignities.length,
      dignityTenures: dignityTenures.length,
      dignityLinks: dignityLinks.length,
      householdRoles: householdRoles.length,
      writings: writings.length,
      chapters: chapters.length,
      writingLinks: writingLinks.length,
      storyPlans: storyPlans.length,
      storyArcs: storyArcs.length,
      storyBeats: storyBeats.length,
      scenePlans: scenePlans.length,
      plotThreads: plotThreads.length,
      characterArcs: characterArcs.length
    });

    return { people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs };
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
