/**
 * dataSyncService.js - Hybrid Local/Cloud Data Synchronization
 * 
 * PURPOSE:
 * This service orchestrates data between local IndexedDB and cloud Firestore.
 * It implements a "local-first" approach where:
 * 1. All operations happen on local DB first (instant UI updates)
 * 2. Changes are then synced to cloud in the background
 * 3. On startup, cloud data is pulled down if newer
 * 
 * SYNC STRATEGY: "Local-First with Cloud Backup"
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                         User Action                                 │
 * │                    (add person, edit house)                         │
 * └─────────────────────────────────────────────────────────────────────┘
 *                                  │
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    1. Update Local IndexedDB                        │
 * │                       (immediate, offline-safe)                     │
 * └─────────────────────────────────────────────────────────────────────┘
 *                                  │
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    2. Update React State                            │
 * │                       (UI updates instantly)                        │
 * └─────────────────────────────────────────────────────────────────────┘
 *                                  │
 *                                  ▼
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │                    3. Sync to Cloud (async)                         │
 * │                       (background, non-blocking)                    │
 * └─────────────────────────────────────────────────────────────────────┘
 * 
 * CONFLICT RESOLUTION:
 * Currently uses "last-write-wins" — the most recent change overwrites.
 * This is simple and works well for single-user scenarios.
 * Future enhancement could add timestamp comparison or merge strategies.
 * 
 * OFFLINE SUPPORT:
 * When offline, operations succeed locally. When back online, changes sync.
 * Firestore has built-in offline persistence that helps with this.
 */

import {
  syncOp,
  enqueue,
  push,
  sendToCloud,
  isOnline
} from './syncEngine';

// The 56 per-entity *Cloud imports are gone: every sync wrapper below now goes
// through syncEngine, which resolves the collection from the manifest. What is
// left are the three bulk operations, which step 5 replaces with manifest loops.
import {
  syncAllToCloud,
  downloadAllFromCloud,
  hasCloudData
} from './firestoreService';

import {
  getAllPeople,
  getAllHouses,
  getAllRelationships,
  addPerson as localAddPerson,
  addHouse as localAddHouse,
  addRelationship as localAddRelationship,
  deleteAllData as localDeleteAllData,
  getDatabase,
  // Sync queue functions for data loss prevention
  markSynced,
  hasPendingChanges,
  getPendingChangeCount,
  getPendingChanges,
  getPendingChangesByType,
  clearSyncQueue,
  clearSyncedItems,
  // Sync queue maintenance
  performSyncQueueMaintenance
} from './database';

// Default dataset ID for backward compatibility
const DEFAULT_DATASET_ID = 'default';

import {
  getAllEntries as getAllCodexEntries,
  restoreEntry as localRestoreCodexEntry // Use restore, not create, to preserve IDs
} from './codexService';

import {
  getAllHeraldry as localGetAllHeraldry,
  createHeraldry as localCreateHeraldry
} from './heraldryService';

import {
  getAllHouseholdRoles as localGetAllHouseholdRoles
} from './householdRoleService';

import {
  getAllWritings as localGetAllWritings,
  restoreWriting as localRestoreWriting
} from './writingService';

import {
  getAllChapters as localGetAllChapters,
  restoreChapter as localRestoreChapter
} from './chapterService';

import {
  getAllWritingLinks as localGetAllWritingLinks,
  restoreWritingLink as localRestoreWritingLink
} from './writingLinkService';

import {
  getAllStoryPlans as localGetAllStoryPlans,
  restoreStoryPlan as localRestoreStoryPlan,
  restoreStoryArc as localRestoreStoryArc,
  restoreStoryBeat as localRestoreStoryBeat,
  restoreScenePlan as localRestoreScenePlan,
  restoreCharacterArc as localRestoreCharacterArc,
  restorePlotThread as localRestorePlotThread
} from './planningService';

import { db as localDb } from './database';
import { logger } from '../utils/logger';

// ==================== SYNC STATE ====================

// Track sync status for UI feedback
let syncStatus = {
  isSyncing: false,
  lastSyncTime: null,
  pendingChanges: 0,
  error: null
};

// Listeners for sync status changes
const syncStatusListeners = new Set();

// Periodic sync interval (5 minutes = 300000ms)
const PERIODIC_SYNC_INTERVAL = 5 * 60 * 1000;
let periodicSyncIntervalId = null;
let periodicSyncUserId = null;
let periodicSyncDatasetId = null;

/**
 * Subscribe to sync status changes
 * @param {Function} callback - Called when sync status changes
 * @returns {Function} Unsubscribe function
 */
export function onSyncStatusChange(callback) {
  syncStatusListeners.add(callback);
  // Immediately call with current status
  callback(syncStatus);
  return () => syncStatusListeners.delete(callback);
}

/**
 * Update sync status and notify listeners
 */
function updateSyncStatus(updates) {
  syncStatus = { ...syncStatus, ...updates };
  syncStatusListeners.forEach(callback => callback(syncStatus));
}

// ==================== ONLINE/OFFLINE HANDLING ====================

// Online/offline tracking lives in syncEngine.ts, which needs it to decide
// whether to attempt a send. One owner, one listener pair — two modules each
// tracking `navigator.onLine` is how the two answers drift apart.

// ==================== PERIODIC SYNC ====================

/**
 * Sync only pending changes to cloud (more efficient than full sync)
 * PERFORMANCE: Only uploads items that have been modified since last sync
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Object} Result with status and counts
 */
export async function syncPendingChanges(userId, datasetId = DEFAULT_DATASET_ID) {
  if (!userId || !isOnline()) {
    return { status: 'skipped', reason: !userId ? 'no-user' : 'offline' };
  }

  const dsId = datasetId || DEFAULT_DATASET_ID;

  try {
    // Get pending changes grouped by type
    const pendingByType = await getPendingChangesByType(dsId);
    const totalPending = Object.values(pendingByType).flat().length;

    if (totalPending === 0) {
      return { status: 'no-changes', synced: 0 };
    }

    logger.log(`🔄 Syncing ${totalPending} pending changes...`);

    let syncedCount = 0;
    const errors = [];

    // Process each entity type
    for (const [entityType, changes] of Object.entries(pendingByType)) {
      for (const change of changes) {
        try {
          await sendToCloud(entityType, change.operation, userId, dsId, change.entityId, change.data);
          // By queue row, not by entity. Marking every pending row for an
          // entity confirmed changes that had not been sent — see syncEngine.ts.
          await markSynced(change.id, dsId);
          syncedCount++;
        } catch (error) {
          errors.push({ entityType, entityId: change.entityId, error: error.message });
          logger.error(`❌ Failed to sync ${entityType}:${change.entityId}:`, error);
        }
      }
    }

    logger.log(`✅ Synced ${syncedCount}/${totalPending} changes`);

    return {
      status: errors.length === 0 ? 'success' : 'partial',
      synced: syncedCount,
      failed: errors.length,
      errors
    };
  } catch (error) {
    logger.error('❌ Pending changes sync failed:', error);
    return { status: 'error', error: error.message };
  }
}

// Track sync cycle count for periodic maintenance
let periodicSyncCycleCount = 0;
const MAINTENANCE_FREQUENCY = 6; // Run maintenance every 6 syncs (30 minutes with 5-minute intervals)

/**
 * Perform a periodic sync - uploads only pending changes to cloud
 * PERFORMANCE: Uses change tracking instead of uploading everything
 * Only runs if online and not currently syncing
 *
 * Also runs queue maintenance every MAINTENANCE_FREQUENCY cycles.
 */
async function performPeriodicSync() {
  // Skip if offline, already syncing, or no user
  if (!isOnline() || syncStatus.isSyncing || !periodicSyncUserId) {
    return;
  }

  periodicSyncCycleCount++;

  // Check if there are any pending changes first (cheap check)
  const pendingCount = await getPendingChangeCount(periodicSyncDatasetId);

  // Run maintenance every MAINTENANCE_FREQUENCY cycles (even if no pending changes)
  if (periodicSyncCycleCount >= MAINTENANCE_FREQUENCY) {
    periodicSyncCycleCount = 0;
    try {
      logger.log('🔧 Running scheduled sync queue maintenance...');
      await performSyncQueueMaintenance(periodicSyncDatasetId);
    } catch (error) {
      logger.warn('⚠️ Sync queue maintenance failed:', error);
    }
  }

  if (pendingCount === 0) {
    // No pending changes, skip sync
    return;
  }

  logger.log(`⏰ Periodic sync triggered (${pendingCount} pending changes)...`);

  try {
    // Use the smarter pending-only sync
    const result = await syncPendingChanges(periodicSyncUserId, periodicSyncDatasetId);
    if (result.status === 'success' || result.status === 'no-changes') {
      logger.log('✅ Periodic sync complete:', result.synced || 0, 'changes synced');
    } else if (result.status === 'partial') {
      logger.warn(`⚠️ Periodic sync partial: ${result.synced} synced, ${result.failed} failed`);
    } else if (result.status !== 'skipped') {
      logger.warn('⚠️ Periodic sync issue:', result);
    }
  } catch (error) {
    logger.error('❌ Periodic sync failed:', error);
  }
}

/**
 * Start the periodic sync interval
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export function startPeriodicSync(userId, datasetId = DEFAULT_DATASET_ID) {
  // Stop any existing interval
  stopPeriodicSync();

  if (!userId) {
    logger.warn('⚠️ Cannot start periodic sync without userId');
    return;
  }

  periodicSyncUserId = userId;
  periodicSyncDatasetId = datasetId || DEFAULT_DATASET_ID;

  // Start the interval
  periodicSyncIntervalId = setInterval(performPeriodicSync, PERIODIC_SYNC_INTERVAL);
  logger.log(`⏰ Periodic sync started (every ${PERIODIC_SYNC_INTERVAL / 60000} minutes)`);
}

/**
 * Stop the periodic sync interval
 */
export function stopPeriodicSync() {
  if (periodicSyncIntervalId) {
    clearInterval(periodicSyncIntervalId);
    periodicSyncIntervalId = null;
    logger.log('⏰ Periodic sync stopped');
  }
  periodicSyncUserId = null;
  periodicSyncDatasetId = null;
}

// ==================== INITIALIZATION ====================

/**
 * Initialize sync for a user
 * Determines whether to upload local data or download cloud data
 *
 * SCENARIOS:
 * 1. New user, no local data, no cloud data → Do nothing
 * 2. New user with local data, no cloud data → Upload local to cloud
 * 3. Returning user, no local data, has cloud data → Download cloud to local
 * 4. Returning user, has both → Cloud takes precedence (most common case)
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} [datasetId='default'] - The dataset ID
 * @returns {Object} Sync result with status and data
 */
export async function initializeSync(userId, datasetId = DEFAULT_DATASET_ID) {
  if (!userId) {
    logger.warn('⚠️ No userId provided to initializeSync');
    return { status: 'no-user', data: null };
  }

  const dsId = datasetId || DEFAULT_DATASET_ID;
  const localDb = getDatabase(dsId);

  try {
    updateSyncStatus({ isSyncing: true, error: null });
    logger.log('🔄 Initializing sync for user:', userId, 'dataset:', dsId);

    // Check what data exists
    const [localPeople, localHouses, localRelationships] = await Promise.all([
      getAllPeople(dsId),
      getAllHouses(dsId),
      getAllRelationships(dsId)
    ]);

    const hasLocalData = localPeople.length > 0 || localHouses.length > 0;
    const userHasCloudData = await hasCloudData(userId, dsId);

    logger.log('📊 Sync check:', {
      dataset: dsId,
      hasLocalData,
      hasCloudData: userHasCloudData,
      localPeople: localPeople.length,
      localHouses: localHouses.length
    });

    // Scenario 1: No data anywhere
    if (!hasLocalData && !userHasCloudData) {
      logger.log('✨ Fresh start - no data to sync');
      updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
      return { status: 'fresh', data: null };
    }

    // Scenario 2: Local data but no cloud data → Upload
    if (hasLocalData && !userHasCloudData) {
      logger.log('⬆️ Uploading local data to cloud...');

      let codexEntries = [];
      let codexLinks = [];
      let heraldry = [];
      let heraldryLinks = [];

      try {
        codexEntries = await getAllCodexEntries();
        codexLinks = await localDb.codexLinks.toArray();
      } catch (e) {
        logger.warn('Could not get codex entries/links:', e);
      }

      try {
        heraldry = await localGetAllHeraldry(dsId);
        heraldryLinks = await localDb.heraldryLinks.toArray();
      } catch (e) {
        logger.warn('Could not get heraldry:', e);
      }

      // Get dignities data
      let dignities = [];
      let dignityTenures = [];
      let dignityLinks = [];

      try {
        dignities = await localDb.dignities.toArray();
        dignityTenures = await localDb.dignityTenures.toArray();
        dignityLinks = await localDb.dignityLinks.toArray();
      } catch (e) {
        logger.warn('Could not get dignities:', e);
      }

      // Get household roles
      let householdRoles = [];
      try {
        householdRoles = await localGetAllHouseholdRoles(dsId);
      } catch (e) {
        logger.warn('Could not get household roles:', e);
      }

      // Get writings data
      let writings = [];
      let chapters = [];
      let writingLinks = [];
      try {
        writings = await localGetAllWritings(dsId);
        chapters = await localGetAllChapters(dsId);
        writingLinks = await localGetAllWritingLinks(dsId);
      } catch (e) {
        logger.warn('Could not get writings data:', e);
      }

      // Get planning data
      let storyPlans = [];
      let storyArcs = [];
      let storyBeats = [];
      let scenePlans = [];
      let plotThreads = [];
      let characterArcs = [];
        try {
        storyPlans = await localDb.storyPlans.toArray();
        storyArcs = await localDb.storyArcs.toArray();
        storyBeats = await localDb.storyBeats.toArray();
        scenePlans = await localDb.scenePlans.toArray();
        plotThreads = await localDb.plotThreads.toArray();
        characterArcs = await localDb.characterArcs.toArray();
      } catch (e) {
        logger.warn('Could not get planning data:', e);
      }

      await syncAllToCloud(userId, dsId, {
        people: localPeople,
        houses: localHouses,
        relationships: localRelationships,
        codexEntries,
        codexLinks,
        heraldry,
        heraldryLinks,
        dignities,
        dignityTenures,
        dignityLinks,
        householdRoles,
        writings,
        chapters,
        writingLinks,
        storyPlans,
        storyArcs,
        storyBeats,
        scenePlans,
        plotThreads,
        characterArcs
      });

      updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
      return {
        status: 'uploaded',
        data: {
          people: localPeople,
          houses: localHouses,
          relationships: localRelationships
        }
      };
    }

    // Scenario 3 & 4: Cloud data exists → Download (cloud is source of truth)
    logger.log('⬇️ Downloading cloud data...');

    // CRITICAL: Check for pending changes before wiping local data
    // This prevents data loss when local changes haven't synced yet
    const pendingCount = await getPendingChangeCount(dsId);
    if (pendingCount > 0) {
      logger.warn(`⚠️ BLOCKING SYNC: ${pendingCount} pending changes not yet synced to cloud`);
      logger.warn('⚠️ Local data will be preserved to prevent data loss');
      updateSyncStatus({
        isSyncing: false,
        error: `${pendingCount} pending changes - sync blocked to prevent data loss`,
        pendingChanges: pendingCount
      });
      return {
        status: 'blocked',
        reason: 'pending-changes',
        pendingCount,
        data: { people: localPeople, houses: localHouses, relationships: localRelationships }
      };
    }

    const cloudData = await downloadAllFromCloud(userId, dsId);

    // Clear local and replace with cloud data (safe - no pending changes)
    await localDeleteAllData(dsId, { clearSyncQueue: true });

    // Re-populate local DB with cloud data
    for (const house of cloudData.houses || []) {
      // Remove Firestore-specific fields before saving locally
      const { createdAt, updatedAt, syncedAt, localId, ...houseData } = house;
      // Skip Codex auto-creation during sync restore to prevent duplicates
      await localAddHouse({ ...houseData, id: parseInt(house.id) || house.id }, { skipCodexCreation: true, datasetId: dsId });
    }

    for (const person of cloudData.people || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...personData } = person;
      await localAddPerson({ ...personData, id: parseInt(person.id) || person.id }, dsId);
    }

    for (const rel of cloudData.relationships || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...relData } = rel;
      await localAddRelationship({ ...relData, id: parseInt(rel.id) || rel.id }, dsId);
    }

    // Handle codex entries if they exist
    // IMPORTANT: Use restoreEntry (not createEntry) to preserve original IDs
    // This prevents duplicate entries during sync
    for (const entry of cloudData.codexEntries || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...entryData } = entry;
      try {
        await localRestoreCodexEntry({ ...entryData, id: parseInt(entry.id) || entry.id });
      } catch (e) {
        logger.warn('Could not restore codex entry:', e);
      }
    }

    // Handle codex links if they exist
    for (const link of cloudData.codexLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.codexLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore codex link:', e);
      }
    }

    // Handle heraldry if it exists
    for (const h of cloudData.heraldry || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...heraldryData } = h;
      try {
        // Use put to insert with specific ID
        await localDb.heraldry.put({ ...heraldryData, id: parseInt(h.id) || h.id });
      } catch (e) {
        logger.warn('Could not restore heraldry:', e);
      }
    }

    // Handle heraldry links if they exist
    for (const link of cloudData.heraldryLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.heraldryLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore heraldry link:', e);
      }
    }

    // Handle dignities if they exist
    for (const dignity of cloudData.dignities || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...dignityData } = dignity;
      try {
        await localDb.dignities.put({ ...dignityData, id: parseInt(dignity.id) || dignity.id });
      } catch (e) {
        logger.warn('Could not restore dignity:', e);
      }
    }

    // Handle dignity tenures if they exist
    for (const tenure of cloudData.dignityTenures || []) {
      const { createdAt, syncedAt, localId, ...tenureData } = tenure;
      try {
        await localDb.dignityTenures.put({ ...tenureData, id: parseInt(tenure.id) || tenure.id });
      } catch (e) {
        logger.warn('Could not restore dignity tenure:', e);
      }
    }

    // Handle dignity links if they exist
    for (const link of cloudData.dignityLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.dignityLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore dignity link:', e);
      }
    }

    // Handle household roles if they exist
    for (const role of cloudData.householdRoles || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...roleData } = role;
      try {
        await localDb.householdRoles.put({ ...roleData, id: parseInt(role.id) || role.id });
      } catch (e) {
        logger.warn('Could not restore household role:', e);
      }
    }

    // Handle writings if they exist
    for (const writing of cloudData.writings || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...writingData } = writing;
      try {
        await localRestoreWriting({ ...writingData, id: parseInt(writing.id) || writing.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore writing:', e);
      }
    }

    // Handle chapters if they exist
    for (const chapter of cloudData.chapters || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...chapterData } = chapter;
      try {
        await localRestoreChapter({ ...chapterData, id: parseInt(chapter.id) || chapter.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore chapter:', e);
      }
    }

    // Handle writing links if they exist
    for (const link of cloudData.writingLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localRestoreWritingLink({ ...linkData, id: parseInt(link.id) || link.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore writing link:', e);
      }
    }

    // Handle story plans if they exist
    for (const plan of cloudData.storyPlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...planData } = plan;
      try {
        await localRestoreStoryPlan({ ...planData, id: parseInt(plan.id) || plan.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story plan:', e);
      }
    }

    // Handle story arcs if they exist
    for (const arc of cloudData.storyArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreStoryArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story arc:', e);
      }
    }

    // Handle story beats if they exist
    for (const beat of cloudData.storyBeats || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...beatData } = beat;
      try {
        await localRestoreStoryBeat({ ...beatData, id: parseInt(beat.id) || beat.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story beat:', e);
      }
    }

    // Handle scene plans if they exist
    for (const scene of cloudData.scenePlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...sceneData } = scene;
      try {
        await localRestoreScenePlan({ ...sceneData, id: parseInt(scene.id) || scene.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore scene plan:', e);
      }
    }

    // Handle plot threads if they exist
    for (const thread of cloudData.plotThreads || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...threadData } = thread;
      try {
        await localRestorePlotThread({ ...threadData, id: parseInt(thread.id) || thread.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore plot thread:', e);
      }
    }

    // Handle character arcs if they exist
    for (const arc of cloudData.characterArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreCharacterArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore character arc:', e);
      }
    }


    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });

    return {
      status: 'downloaded',
      data: cloudData
    };

  } catch (error) {
    logger.error('❌ Sync initialization failed:', error);
    updateSyncStatus({ isSyncing: false, error: error.message });

    // Don't throw - return error status so app can continue with local data
    return { status: 'error', error: error.message };
  }
}

// ==================== SYNC WRAPPERS ====================
// These wrap the local operations and add cloud sync

/**
 * Add a person (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} personId - The local person ID (after local add)
 * @param {Object} personData - The person data
 */
export async function syncAddPerson(userId, datasetId, personId, personData) {
  await syncOp('person', 'add', { userId, datasetId, id: personId, data: personData, retry: true });
}

/**
 * Update a person (local + cloud)
 */
export async function syncUpdatePerson(userId, datasetId, personId, updates) {
  await syncOp('person', 'update', { userId, datasetId, id: personId, data: updates, retry: true });
}

/**
 * Delete a person (local + cloud) with CASCADE delete of relationships
 * This ensures relationships are also deleted from cloud when a person is deleted
 *
 * @param {string} userId - Firebase user ID
 * @param {string} datasetId - Dataset ID
 * @param {number} personId - Person ID to delete
 * @param {number[]} relationshipIds - IDs of relationships to cascade delete (captured before local delete)
 */
export async function syncDeletePerson(userId, datasetId, personId, relationshipIds = []) {
  // The only wrapper that is not a one-liner, because it is the only one that
  // touches two entity types. Queue *everything* before sending *anything*:
  // if the tab closes or the connection drops half way through, the queue then
  // still describes the whole delete. Queueing each relationship immediately
  // before its own send would leave the untouched tail unrecorded, and a
  // relationship that is gone locally but present in the cloud comes back on
  // the next download as an edge pointing at a person who no longer exists.
  const personQueueId = await enqueue('person', 'delete', { datasetId, id: personId });

  const relationshipQueueIds = [];
  for (const relId of relationshipIds) {
    relationshipQueueIds.push(await enqueue('relationship', 'delete', { datasetId, id: relId }));
    logger.log(`☁️ Queued cascade delete for relationship ${relId} (person ${personId})`);
  }

  // Relationships before the person, so an interrupted cascade leaves orphaned
  // people rather than orphaned edges — the former is visible in the UI and
  // fixable, the latter is not.
  for (const [index, relId] of relationshipIds.entries()) {
    const sent = await push('relationship', 'delete', relationshipQueueIds[index], {
      userId,
      datasetId,
      id: relId,
      // Preserved from the original: a failed cascade leg warns rather than
      // errors. See the note on `logLevel` in syncEngine.ts.
      logLevel: 'warn'
    });
    if (sent) logger.log(`☁️ Cascade deleted relationship ${relId} from cloud`);
  }

  await push('person', 'delete', personQueueId, { userId, datasetId, id: personId });
}

/**
 * Add a house (local + cloud)
 */
export async function syncAddHouse(userId, datasetId, houseId, houseData) {
  await syncOp('house', 'add', { userId, datasetId, id: houseId, data: houseData, retry: true });
}

/**
 * Update a house (local + cloud)
 */
export async function syncUpdateHouse(userId, datasetId, houseId, updates) {
  await syncOp('house', 'update', { userId, datasetId, id: houseId, data: updates, retry: true });
}

/**
 * Delete a house (local + cloud)
 */
export async function syncDeleteHouse(userId, datasetId, houseId) {
  await syncOp('house', 'delete', { userId, datasetId, id: houseId });
}

/**
 * Add a relationship (local + cloud)
 */
export async function syncAddRelationship(userId, datasetId, relationshipId, relationshipData) {
  await syncOp('relationship', 'add', {
    userId,
    datasetId,
    id: relationshipId,
    data: relationshipData,
    retry: true
  });
}

/**
 * Update a relationship (local + cloud)
 */
export async function syncUpdateRelationship(userId, datasetId, relationshipId, updates) {
  await syncOp('relationship', 'update', { userId, datasetId, id: relationshipId, data: updates });
}

/**
 * Delete a relationship (local + cloud)
 */
export async function syncDeleteRelationship(userId, datasetId, relationshipId) {
  await syncOp('relationship', 'delete', { userId, datasetId, id: relationshipId });
}

/**
 * Add a codex entry (local + cloud)
 */
export async function syncAddCodexEntry(userId, datasetId, entryId, entryData) {
  await syncOp('codexEntry', 'add', { userId, datasetId, id: entryId, data: entryData });
}

/**
 * Update a codex entry (local + cloud)
 */
export async function syncUpdateCodexEntry(userId, datasetId, entryId, updates) {
  await syncOp('codexEntry', 'update', { userId, datasetId, id: entryId, data: updates });
}

/**
 * Delete a codex entry (local + cloud)
 */
export async function syncDeleteCodexEntry(userId, datasetId, entryId) {
  await syncOp('codexEntry', 'delete', { userId, datasetId, id: entryId });
}

// ==================== CODEX LINK SYNC WRAPPERS ====================

/**
 * Add codex link (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} linkId - The local link ID (after local add)
 * @param {Object} linkData - The link data
 */
export async function syncAddCodexLink(userId, datasetId, linkId, linkData) {
  await syncOp('codexLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete codex link (local + cloud)
 */
export async function syncDeleteCodexLink(userId, datasetId, linkId) {
  await syncOp('codexLink', 'delete', { userId, datasetId, id: linkId });
}

// ==================== HERALDRY SYNC WRAPPERS ====================

/**
 * Add heraldry (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} heraldryId - The local heraldry ID (after local add)
 * @param {Object} heraldryData - The heraldry data
 */
export async function syncAddHeraldry(userId, datasetId, heraldryId, heraldryData) {
  await syncOp('heraldry', 'add', { userId, datasetId, id: heraldryId, data: heraldryData });
}

/**
 * Update heraldry (local + cloud)
 */
export async function syncUpdateHeraldry(userId, datasetId, heraldryId, updates) {
  await syncOp('heraldry', 'update', { userId, datasetId, id: heraldryId, data: updates });
}

/**
 * Delete heraldry (local + cloud)
 */
export async function syncDeleteHeraldry(userId, datasetId, heraldryId) {
  await syncOp('heraldry', 'delete', { userId, datasetId, id: heraldryId });
}

/**
 * Add heraldry link (local + cloud)
 */
export async function syncAddHeraldryLink(userId, datasetId, linkId, linkData) {
  await syncOp('heraldryLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete heraldry link (local + cloud)
 */
export async function syncDeleteHeraldryLink(userId, datasetId, linkId) {
  await syncOp('heraldryLink', 'delete', { userId, datasetId, id: linkId });
}

// ==================== DIGNITIES SYNC WRAPPERS ====================

/**
 * Add dignity (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} dignityId - The local id (after the local write)
 * @param {Object} dignityData - The dignity data
 */
export async function syncAddDignity(userId, datasetId, dignityId, dignityData) {
  await syncOp('dignity', 'add', { userId, datasetId, id: dignityId, data: dignityData });
}

/**
 * Update dignity (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} dignityId - The local id (after the local write)
 * @param {Object} updates - The changed fields
 */
export async function syncUpdateDignity(userId, datasetId, dignityId, updates) {
  await syncOp('dignity', 'update', { userId, datasetId, id: dignityId, data: updates });
}

/**
 * Delete dignity (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} dignityId - The local id
 */
export async function syncDeleteDignity(userId, datasetId, dignityId) {
  await syncOp('dignity', 'delete', { userId, datasetId, id: dignityId });
}

/**
 * Add dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id (after the local write)
 * @param {Object} tenureData - The tenure data
 */
export async function syncAddDignityTenure(userId, datasetId, tenureId, tenureData) {
  await syncOp('dignityTenure', 'add', { userId, datasetId, id: tenureId, data: tenureData });
}

/**
 * Update dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id (after the local write)
 * @param {Object} updates - The changed fields
 */
export async function syncUpdateDignityTenure(userId, datasetId, tenureId, updates) {
  await syncOp('dignityTenure', 'update', { userId, datasetId, id: tenureId, data: updates });
}

/**
 * Delete dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id
 */
export async function syncDeleteDignityTenure(userId, datasetId, tenureId) {
  await syncOp('dignityTenure', 'delete', { userId, datasetId, id: tenureId });
}

/**
 * Add dignity link (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} linkId - The local id (after the local write)
 * @param {Object} linkData - The link data
 */
export async function syncAddDignityLink(userId, datasetId, linkId, linkData) {
  await syncOp('dignityLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete dignity link (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} linkId - The local id
 */
export async function syncDeleteDignityLink(userId, datasetId, linkId) {
  await syncOp('dignityLink', 'delete', { userId, datasetId, id: linkId });
}

// ==================== HOUSEHOLD ROLES SYNC ====================

/**
 * Add household role (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} roleId - The local role ID (after local add)
 * @param {Object} roleData - The role data
 */
export async function syncAddHouseholdRole(userId, datasetId, roleId, roleData) {
  await syncOp('householdRole', 'add', { userId, datasetId, id: roleId, data: roleData });
}

/**
 * Update household role (local + cloud)
 */
export async function syncUpdateHouseholdRole(userId, datasetId, roleId, updates) {
  await syncOp('householdRole', 'update', { userId, datasetId, id: roleId, data: updates });
}

/**
 * Delete household role (local + cloud)
 */
export async function syncDeleteHouseholdRole(userId, datasetId, roleId) {
  await syncOp('householdRole', 'delete', { userId, datasetId, id: roleId });
}

// ==================== WRITINGS SYNC ====================

/**
 * Add writing (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} writingId - The local writing ID (after local add)
 * @param {Object} writingData - The writing data
 */
export async function syncAddWriting(userId, datasetId, writingId, writingData) {
  await syncOp('writing', 'add', { userId, datasetId, id: writingId, data: writingData });
}

/**
 * Update writing (local + cloud)
 */
export async function syncUpdateWriting(userId, datasetId, writingId, updates) {
  await syncOp('writing', 'update', { userId, datasetId, id: writingId, data: updates });
}

/**
 * Delete writing (local + cloud)
 */
export async function syncDeleteWriting(userId, datasetId, writingId) {
  await syncOp('writing', 'delete', { userId, datasetId, id: writingId });
}

// ==================== CHAPTERS SYNC ====================

/**
 * Add chapter (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} chapterId - The local chapter ID (after local add)
 * @param {Object} chapterData - The chapter data
 */
export async function syncAddChapter(userId, datasetId, chapterId, chapterData) {
  await syncOp('chapter', 'add', { userId, datasetId, id: chapterId, data: chapterData });
}

/**
 * Update chapter (local + cloud)
 */
export async function syncUpdateChapter(userId, datasetId, chapterId, updates) {
  await syncOp('chapter', 'update', { userId, datasetId, id: chapterId, data: updates });
}

/**
 * Delete chapter (local + cloud)
 */
export async function syncDeleteChapter(userId, datasetId, chapterId) {
  await syncOp('chapter', 'delete', { userId, datasetId, id: chapterId });
}

// ==================== WRITING LINKS SYNC ====================

/**
 * Add writing link (local + cloud)
 */
export async function syncAddWritingLink(userId, datasetId, linkId, linkData) {
  await syncOp('writingLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete writing link (local + cloud)
 */
export async function syncDeleteWritingLink(userId, datasetId, linkId) {
  await syncOp('writingLink', 'delete', { userId, datasetId, id: linkId });
}

// ==================== PLANNING: STORY PLANS SYNC ====================

/**
 * Add story plan (local + cloud)
 */
export async function syncAddStoryPlan(userId, datasetId, planId, planData) {
  await syncOp('storyPlan', 'add', { userId, datasetId, id: planId, data: planData });
}

/**
 * Update story plan (local + cloud)
 */
export async function syncUpdateStoryPlan(userId, datasetId, planId, updates) {
  await syncOp('storyPlan', 'update', { userId, datasetId, id: planId, data: updates });
}

/**
 * Delete story plan (local + cloud)
 */
export async function syncDeleteStoryPlan(userId, datasetId, planId) {
  await syncOp('storyPlan', 'delete', { userId, datasetId, id: planId });
}

// ==================== PLANNING: STORY ARCS SYNC ====================

/**
 * Add story arc (local + cloud)
 */
export async function syncAddStoryArc(userId, datasetId, arcId, arcData) {
  await syncOp('storyArc', 'add', { userId, datasetId, id: arcId, data: arcData });
}

/**
 * Update story arc (local + cloud)
 */
export async function syncUpdateStoryArc(userId, datasetId, arcId, updates) {
  await syncOp('storyArc', 'update', { userId, datasetId, id: arcId, data: updates });
}

/**
 * Delete story arc (local + cloud)
 */
export async function syncDeleteStoryArc(userId, datasetId, arcId) {
  await syncOp('storyArc', 'delete', { userId, datasetId, id: arcId });
}

// ==================== PLANNING: STORY BEATS SYNC ====================

/**
 * Add story beat (local + cloud)
 */
export async function syncAddStoryBeat(userId, datasetId, beatId, beatData) {
  await syncOp('storyBeat', 'add', { userId, datasetId, id: beatId, data: beatData });
}

/**
 * Update story beat (local + cloud)
 */
export async function syncUpdateStoryBeat(userId, datasetId, beatId, updates) {
  await syncOp('storyBeat', 'update', { userId, datasetId, id: beatId, data: updates });
}

/**
 * Delete story beat (local + cloud)
 */
export async function syncDeleteStoryBeat(userId, datasetId, beatId) {
  await syncOp('storyBeat', 'delete', { userId, datasetId, id: beatId });
}

// ==================== PLANNING: SCENE PLANS SYNC ====================

/**
 * Add scene plan (local + cloud)
 */
export async function syncAddScenePlan(userId, datasetId, sceneId, sceneData) {
  await syncOp('scenePlan', 'add', { userId, datasetId, id: sceneId, data: sceneData });
}

/**
 * Update scene plan (local + cloud)
 */
export async function syncUpdateScenePlan(userId, datasetId, sceneId, updates) {
  await syncOp('scenePlan', 'update', { userId, datasetId, id: sceneId, data: updates });
}

/**
 * Delete scene plan (local + cloud)
 */
export async function syncDeleteScenePlan(userId, datasetId, sceneId) {
  await syncOp('scenePlan', 'delete', { userId, datasetId, id: sceneId });
}

// ==================== PLANNING: PLOT THREADS SYNC ====================

/**
 * Add plot thread (local + cloud)
 */
export async function syncAddPlotThread(userId, datasetId, threadId, threadData) {
  await syncOp('plotThread', 'add', { userId, datasetId, id: threadId, data: threadData });
}

/**
 * Update plot thread (local + cloud)
 */
export async function syncUpdatePlotThread(userId, datasetId, threadId, updates) {
  await syncOp('plotThread', 'update', { userId, datasetId, id: threadId, data: updates });
}

/**
 * Delete plot thread (local + cloud)
 */
export async function syncDeletePlotThread(userId, datasetId, threadId) {
  await syncOp('plotThread', 'delete', { userId, datasetId, id: threadId });
}

// ==================== PLANNING: CHARACTER ARCS SYNC ====================

/**
 * Add character arc (local + cloud)
 */
export async function syncAddCharacterArc(userId, datasetId, arcId, arcData) {
  await syncOp('characterArc', 'add', { userId, datasetId, id: arcId, data: arcData });
}

/**
 * Update character arc (local + cloud)
 */
export async function syncUpdateCharacterArc(userId, datasetId, arcId, updates) {
  await syncOp('characterArc', 'update', { userId, datasetId, id: arcId, data: updates });
}

/**
 * Delete character arc (local + cloud)
 */
export async function syncDeleteCharacterArc(userId, datasetId, arcId) {
  await syncOp('characterArc', 'delete', { userId, datasetId, id: arcId });
}

// ==================== PLANNING: ARC MILESTONES SYNC ====================





// ==================== UTILITY ====================

/**
 * Get current sync status
 */
export function getSyncStatus() {
  return { ...syncStatus, isOnline: isOnline() };
}

/**
 * Force a full re-sync from cloud
 * Useful if user wants to restore from cloud backup
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} [datasetId='default'] - The dataset ID
 */
export async function forceCloudSync(userId, datasetId = DEFAULT_DATASET_ID, options = {}) {
  if (!userId) return { status: 'no-user' };

  const dsId = datasetId || DEFAULT_DATASET_ID;
  const localDb = getDatabase(dsId);

  updateSyncStatus({ isSyncing: true, error: null });

  try {
    // CRITICAL: Check for pending changes unless explicitly overridden
    // This prevents accidental data loss
    if (!options.forceClear) {
      const pendingCount = await getPendingChangeCount(dsId);
      if (pendingCount > 0) {
        logger.warn(`⚠️ BLOCKING FORCE SYNC: ${pendingCount} pending changes not synced`);
        updateSyncStatus({
          isSyncing: false,
          error: `${pendingCount} pending changes - use forceClear option to override`,
          pendingChanges: pendingCount
        });
        return {
          status: 'blocked',
          reason: 'pending-changes',
          pendingCount,
          message: 'Set forceClear: true to override and lose pending changes'
        };
      }
    } else {
      logger.warn('⚠️ Force clear requested - pending changes will be lost');
    }

    // Clear ALL local data (including Codex and sync queue)
    await localDeleteAllData(dsId, { clearSyncQueue: true });

    // Download from cloud
    const cloudData = await downloadAllFromCloud(userId, dsId);

    // Re-populate local - houses first (people reference houses)
    for (const house of cloudData.houses || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...houseData } = house;
      // Skip Codex auto-creation during sync restore to prevent duplicates
      await localAddHouse({ ...houseData, id: parseInt(house.id) || house.id }, { skipCodexCreation: true, datasetId: dsId });
    }

    for (const person of cloudData.people || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...personData } = person;
      await localAddPerson({ ...personData, id: parseInt(person.id) || person.id }, dsId);
    }

    for (const rel of cloudData.relationships || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...relData } = rel;
      await localAddRelationship({ ...relData, id: parseInt(rel.id) || rel.id }, dsId);
    }

    // Restore codex entries (using restoreEntry to preserve IDs)
    for (const entry of cloudData.codexEntries || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...entryData } = entry;
      try {
        await localRestoreCodexEntry({ ...entryData, id: parseInt(entry.id) || entry.id });
      } catch (e) {
        logger.warn('Could not restore codex entry during force sync:', e);
      }
    }

    // Restore codex links
    for (const link of cloudData.codexLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.codexLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore codex link during force sync:', e);
      }
    }

    // Restore heraldry
    for (const h of cloudData.heraldry || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...heraldryData } = h;
      try {
        await localDb.heraldry.put({ ...heraldryData, id: parseInt(h.id) || h.id });
      } catch (e) {
        logger.warn('Could not restore heraldry during force sync:', e);
      }
    }

    // Restore heraldry links
    for (const link of cloudData.heraldryLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.heraldryLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore heraldry link during force sync:', e);
      }
    }

    // Restore dignities
    for (const dignity of cloudData.dignities || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...dignityData } = dignity;
      try {
        await localDb.dignities.put({ ...dignityData, id: parseInt(dignity.id) || dignity.id });
      } catch (e) {
        logger.warn('Could not restore dignity during force sync:', e);
      }
    }

    // Restore dignity tenures
    for (const tenure of cloudData.dignityTenures || []) {
      const { createdAt, syncedAt, localId, ...tenureData } = tenure;
      try {
        await localDb.dignityTenures.put({ ...tenureData, id: parseInt(tenure.id) || tenure.id });
      } catch (e) {
        logger.warn('Could not restore dignity tenure during force sync:', e);
      }
    }

    // Restore dignity links
    for (const link of cloudData.dignityLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.dignityLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        logger.warn('Could not restore dignity link during force sync:', e);
      }
    }

    // Restore household roles
    for (const role of cloudData.householdRoles || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...roleData } = role;
      try {
        await localDb.householdRoles.put({ ...roleData, id: parseInt(role.id) || role.id });
      } catch (e) {
        logger.warn('Could not restore household role during force sync:', e);
      }
    }

    // Restore writings
    for (const writing of cloudData.writings || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...writingData } = writing;
      try {
        await localRestoreWriting({ ...writingData, id: parseInt(writing.id) || writing.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore writing during force sync:', e);
      }
    }

    // Restore chapters
    for (const chapter of cloudData.chapters || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...chapterData } = chapter;
      try {
        await localRestoreChapter({ ...chapterData, id: parseInt(chapter.id) || chapter.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore chapter during force sync:', e);
      }
    }

    // Restore writing links
    for (const link of cloudData.writingLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localRestoreWritingLink({ ...linkData, id: parseInt(link.id) || link.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore writing link during force sync:', e);
      }
    }

    // Restore story plans
    for (const plan of cloudData.storyPlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...planData } = plan;
      try {
        await localRestoreStoryPlan({ ...planData, id: parseInt(plan.id) || plan.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story plan during force sync:', e);
      }
    }

    // Restore story arcs
    for (const arc of cloudData.storyArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreStoryArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story arc during force sync:', e);
      }
    }

    // Restore story beats
    for (const beat of cloudData.storyBeats || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...beatData } = beat;
      try {
        await localRestoreStoryBeat({ ...beatData, id: parseInt(beat.id) || beat.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore story beat during force sync:', e);
      }
    }

    // Restore scene plans
    for (const scene of cloudData.scenePlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...sceneData } = scene;
      try {
        await localRestoreScenePlan({ ...sceneData, id: parseInt(scene.id) || scene.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore scene plan during force sync:', e);
      }
    }

    // Restore plot threads
    for (const thread of cloudData.plotThreads || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...threadData } = thread;
      try {
        await localRestorePlotThread({ ...threadData, id: parseInt(thread.id) || thread.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore plot thread during force sync:', e);
      }
    }

    // Restore character arcs
    for (const arc of cloudData.characterArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreCharacterArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        logger.warn('Could not restore character arc during force sync:', e);
      }
    }


    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
    return { status: 'success', data: cloudData };
  } catch (error) {
    updateSyncStatus({ isSyncing: false, error: error.message });
    return { status: 'error', error: error.message };
  }
}

/**
 * Force upload all local data to cloud
 * CRITICAL: Call this after bulk imports to prevent data loss
 *
 * This uploads the current local database state to cloud, ensuring
 * imported data is persisted and won't be lost on next sync.
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} [datasetId='default'] - The dataset ID
 * @returns {Promise<Object>} Upload result
 */
export async function forceUploadToCloud(userId, datasetId = DEFAULT_DATASET_ID) {
  if (!userId) return { status: 'no-user' };

  const dsId = datasetId || DEFAULT_DATASET_ID;
  const localDb = getDatabase(dsId);

  updateSyncStatus({ isSyncing: true, error: null });

  try {
    logger.log('⬆️ Force uploading all local data to cloud...');

    // Gather all local data
    const localPeople = await getAllPeople(dsId);
    const localHouses = await getAllHouses(dsId);
    const localRelationships = await getAllRelationships(dsId);

    let codexEntries = [];
    let codexLinks = [];
    let heraldry = [];
    let heraldryLinks = [];
    let dignities = [];
    let dignityTenures = [];
    let dignityLinks = [];
    let householdRoles = [];

    try {
      codexEntries = await getAllCodexEntries();
      codexLinks = await localDb.codexLinks.toArray();
    } catch (e) {
      logger.warn('Could not get codex data for upload:', e);
    }

    try {
      heraldry = await localGetAllHeraldry(dsId);
      heraldryLinks = await localDb.heraldryLinks.toArray();
    } catch (e) {
      logger.warn('Could not get heraldry data for upload:', e);
    }

    try {
      dignities = await localDb.dignities.toArray();
      dignityTenures = await localDb.dignityTenures.toArray();
      dignityLinks = await localDb.dignityLinks.toArray();
    } catch (e) {
      logger.warn('Could not get dignities data for upload:', e);
    }

    try {
      householdRoles = await localGetAllHouseholdRoles(dsId);
    } catch (e) {
      logger.warn('Could not get household roles for upload:', e);
    }

    // Get writings data
    let writings = [];
    let chapters = [];
    let writingLinks = [];
    try {
      writings = await localGetAllWritings(dsId);
      chapters = await localGetAllChapters(dsId);
      writingLinks = await localGetAllWritingLinks(dsId);
    } catch (e) {
      logger.warn('Could not get writings data for upload:', e);
    }

    // Get planning data
    let storyPlans = [];
    let storyArcs = [];
    let storyBeats = [];
    let scenePlans = [];
    let plotThreads = [];
    let characterArcs = [];
    try {
      storyPlans = await localDb.storyPlans.toArray();
      storyArcs = await localDb.storyArcs.toArray();
      storyBeats = await localDb.storyBeats.toArray();
      scenePlans = await localDb.scenePlans.toArray();
      plotThreads = await localDb.plotThreads.toArray();
      characterArcs = await localDb.characterArcs.toArray();
    } catch (e) {
      logger.warn('Could not get planning data for upload:', e);
    }

    // Upload everything to cloud
    await syncAllToCloud(userId, dsId, {
      people: localPeople,
      houses: localHouses,
      relationships: localRelationships,
      codexEntries,
      codexLinks,
      heraldry,
      heraldryLinks,
      dignities,
      dignityTenures,
      dignityLinks,
      householdRoles,
      writings,
      chapters,
      writingLinks,
      storyPlans,
      storyArcs,
      storyBeats,
      scenePlans,
      plotThreads,
      characterArcs
    });

    // Clear the sync queue since everything is now synced
    await clearSyncQueue(dsId);

    logger.log('✅ Force upload complete:', {
      people: localPeople.length,
      houses: localHouses.length,
      relationships: localRelationships.length,
      codexEntries: codexEntries.length,
      writings: writings.length
    });

    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
    return {
      status: 'success',
      uploaded: {
        people: localPeople.length,
        houses: localHouses.length,
        relationships: localRelationships.length,
        codexEntries: codexEntries.length
      }
    };
  } catch (error) {
    logger.error('❌ Force upload failed:', error);
    updateSyncStatus({ isSyncing: false, error: error.message });
    return { status: 'error', error: error.message };
  }
}

export default {
  initializeSync,
  onSyncStatusChange,
  getSyncStatus,
  forceCloudSync,
  forceUploadToCloud,
  startPeriodicSync,
  stopPeriodicSync,

  // Sync wrappers - People
  syncAddPerson,
  syncUpdatePerson,
  syncDeletePerson,

  // Sync wrappers - Houses
  syncAddHouse,
  syncUpdateHouse,
  syncDeleteHouse,

  // Sync wrappers - Relationships
  syncAddRelationship,
  syncUpdateRelationship,
  syncDeleteRelationship,

  // Sync wrappers - Codex Entries
  syncAddCodexEntry,
  syncUpdateCodexEntry,
  syncDeleteCodexEntry,

  // Sync wrappers - Codex Links
  syncAddCodexLink,
  syncDeleteCodexLink,

  // Sync wrappers - Heraldry
  syncAddHeraldry,
  syncUpdateHeraldry,
  syncDeleteHeraldry,
  syncAddHeraldryLink,
  syncDeleteHeraldryLink,

  // Sync wrappers - Dignities
  syncAddDignity,
  syncUpdateDignity,
  syncDeleteDignity,
  syncAddDignityTenure,
  syncUpdateDignityTenure,
  syncDeleteDignityTenure,
  syncAddDignityLink,
  syncDeleteDignityLink,

  // Sync wrappers - Writings
  syncAddWriting,
  syncUpdateWriting,
  syncDeleteWriting,
  syncAddChapter,
  syncUpdateChapter,
  syncDeleteChapter,
  syncAddWritingLink,
  syncDeleteWritingLink,

  // Sync wrappers - Planning: Story Plans
  syncAddStoryPlan,
  syncUpdateStoryPlan,
  syncDeleteStoryPlan,

  // Sync wrappers - Planning: Story Arcs
  syncAddStoryArc,
  syncUpdateStoryArc,
  syncDeleteStoryArc,

  // Sync wrappers - Planning: Story Beats
  syncAddStoryBeat,
  syncUpdateStoryBeat,
  syncDeleteStoryBeat,

  // Sync wrappers - Planning: Scene Plans
  syncAddScenePlan,
  syncUpdateScenePlan,
  syncDeleteScenePlan,

  // Sync wrappers - Planning: Plot Threads
  syncAddPlotThread,
  syncUpdatePlotThread,
  syncDeletePlotThread,

  // Sync wrappers - Planning: Character Arcs
  syncAddCharacterArc,
  syncUpdateCharacterArc,
  syncDeleteCharacterArc
};
