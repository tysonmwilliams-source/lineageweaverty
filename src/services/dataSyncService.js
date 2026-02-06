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

import { retryWithBackoff, SYNC_RETRY_CONFIG } from '../utils/retryWithBackoff';

import {
  addPersonCloud,
  updatePersonCloud,
  deletePersonCloud,
  addHouseCloud,
  updateHouseCloud,
  deleteHouseCloud,
  addRelationshipCloud,
  updateRelationshipCloud,
  deleteRelationshipCloud,
  addCodexEntryCloud,
  updateCodexEntryCloud,
  deleteCodexEntryCloud,
  addCodexLinkCloud,
  deleteCodexLinkCloud,
  addHeraldryCloud,
  updateHeraldryCloud,
  deleteHeraldryCloud,
  addHeraldryLinkCloud,
  deleteHeraldryLinkCloud,
  addDignityCloud,
  updateDignityCloud,
  deleteDignityCloud,
  addDignityTenureCloud,
  updateDignityTenureCloud,
  deleteDignityTenureCloud,
  addDignityLinkCloud,
  deleteDignityLinkCloud,
  addHouseholdRoleCloud,
  updateHouseholdRoleCloud,
  deleteHouseholdRoleCloud,
  addWritingCloud,
  updateWritingCloud,
  deleteWritingCloud,
  addChapterCloud,
  updateChapterCloud,
  deleteChapterCloud,
  addWritingLinkCloud,
  deleteWritingLinkCloud,
  addStoryPlanCloud,
  updateStoryPlanCloud,
  deleteStoryPlanCloud,
  addStoryArcCloud,
  updateStoryArcCloud,
  deleteStoryArcCloud,
  addStoryBeatCloud,
  updateStoryBeatCloud,
  deleteStoryBeatCloud,
  addScenePlanCloud,
  updateScenePlanCloud,
  deleteScenePlanCloud,
  addPlotThreadCloud,
  updatePlotThreadCloud,
  deletePlotThreadCloud,
  addCharacterArcCloud,
  updateCharacterArcCloud,
  deleteCharacterArcCloud,
  addArcMilestoneCloud,
  updateArcMilestoneCloud,
  deleteArcMilestoneCloud,
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
  addToSyncQueue,
  markEntitySynced,
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

// ==================== SYNC STATE ====================

// Track if we're currently online
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

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

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Back online');
    isOnline = true;
    // Could trigger a sync here if there are pending changes
  });

  window.addEventListener('offline', () => {
    console.log('📴 Gone offline');
    isOnline = false;
  });
}

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
  if (!userId || !isOnline) {
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

    console.log(`🔄 Syncing ${totalPending} pending changes...`);

    let syncedCount = 0;
    const errors = [];

    // Process each entity type
    for (const [entityType, changes] of Object.entries(pendingByType)) {
      for (const change of changes) {
        try {
          await syncSingleChange(userId, dsId, entityType, change);
          await markEntitySynced(entityType, change.entityId, dsId);
          syncedCount++;
        } catch (error) {
          errors.push({ entityType, entityId: change.entityId, error: error.message });
          console.error(`❌ Failed to sync ${entityType}:${change.entityId}:`, error);
        }
      }
    }

    console.log(`✅ Synced ${syncedCount}/${totalPending} changes`);

    return {
      status: errors.length === 0 ? 'success' : 'partial',
      synced: syncedCount,
      failed: errors.length,
      errors
    };
  } catch (error) {
    console.error('❌ Pending changes sync failed:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Sync a single change to cloud
 * @private
 */
async function syncSingleChange(userId, datasetId, entityType, change) {
  const { operation, entityId, data } = change;

  // Map entity types to their cloud sync functions
  const syncMap = {
    person: {
      add: () => addPersonCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updatePersonCloud(userId, datasetId, entityId, data),
      delete: () => deletePersonCloud(userId, datasetId, entityId)
    },
    house: {
      add: () => addHouseCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateHouseCloud(userId, datasetId, entityId, data),
      delete: () => deleteHouseCloud(userId, datasetId, entityId)
    },
    relationship: {
      add: () => addRelationshipCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateRelationshipCloud(userId, datasetId, entityId, data),
      delete: () => deleteRelationshipCloud(userId, datasetId, entityId)
    },
    codexEntry: {
      add: () => addCodexEntryCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateCodexEntryCloud(userId, datasetId, entityId, data),
      delete: () => deleteCodexEntryCloud(userId, datasetId, entityId)
    },
    codexLink: {
      add: () => addCodexLinkCloud(userId, datasetId, { ...data, id: entityId }),
      delete: () => deleteCodexLinkCloud(userId, datasetId, entityId)
    },
    heraldry: {
      add: () => addHeraldryCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateHeraldryCloud(userId, datasetId, entityId, data),
      delete: () => deleteHeraldryCloud(userId, datasetId, entityId)
    },
    dignity: {
      add: () => addDignityCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateDignityCloud(userId, datasetId, entityId, data),
      delete: () => deleteDignityCloud(userId, datasetId, entityId)
    },
    householdRole: {
      add: () => addHouseholdRoleCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateHouseholdRoleCloud(userId, datasetId, entityId, data),
      delete: () => deleteHouseholdRoleCloud(userId, datasetId, entityId)
    },
    writing: {
      add: () => addWritingCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateWritingCloud(userId, datasetId, entityId, data),
      delete: () => deleteWritingCloud(userId, datasetId, entityId)
    },
    chapter: {
      add: () => addChapterCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateChapterCloud(userId, datasetId, entityId, data),
      delete: () => deleteChapterCloud(userId, datasetId, entityId)
    },
    writingLink: {
      add: () => addWritingLinkCloud(userId, datasetId, { ...data, id: entityId }),
      delete: () => deleteWritingLinkCloud(userId, datasetId, entityId)
    },
    storyPlan: {
      add: () => addStoryPlanCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateStoryPlanCloud(userId, datasetId, entityId, data),
      delete: () => deleteStoryPlanCloud(userId, datasetId, entityId)
    },
    storyArc: {
      add: () => addStoryArcCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateStoryArcCloud(userId, datasetId, entityId, data),
      delete: () => deleteStoryArcCloud(userId, datasetId, entityId)
    },
    storyBeat: {
      add: () => addStoryBeatCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateStoryBeatCloud(userId, datasetId, entityId, data),
      delete: () => deleteStoryBeatCloud(userId, datasetId, entityId)
    },
    scenePlan: {
      add: () => addScenePlanCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateScenePlanCloud(userId, datasetId, entityId, data),
      delete: () => deleteScenePlanCloud(userId, datasetId, entityId)
    },
    plotThread: {
      add: () => addPlotThreadCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updatePlotThreadCloud(userId, datasetId, entityId, data),
      delete: () => deletePlotThreadCloud(userId, datasetId, entityId)
    },
    characterArc: {
      add: () => addCharacterArcCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateCharacterArcCloud(userId, datasetId, entityId, data),
      delete: () => deleteCharacterArcCloud(userId, datasetId, entityId)
    },
    arcMilestone: {
      add: () => addArcMilestoneCloud(userId, datasetId, { ...data, id: entityId }),
      update: () => updateArcMilestoneCloud(userId, datasetId, entityId, data),
      delete: () => deleteArcMilestoneCloud(userId, datasetId, entityId)
    }
  };

  const handler = syncMap[entityType]?.[operation];
  if (!handler) {
    console.warn(`Unknown sync operation: ${entityType}.${operation}`);
    return;
  }

  await handler();
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
  if (!isOnline || syncStatus.isSyncing || !periodicSyncUserId) {
    return;
  }

  periodicSyncCycleCount++;

  // Check if there are any pending changes first (cheap check)
  const pendingCount = await getPendingChangeCount(periodicSyncDatasetId);

  // Run maintenance every MAINTENANCE_FREQUENCY cycles (even if no pending changes)
  if (periodicSyncCycleCount >= MAINTENANCE_FREQUENCY) {
    periodicSyncCycleCount = 0;
    try {
      console.log('🔧 Running scheduled sync queue maintenance...');
      await performSyncQueueMaintenance(periodicSyncDatasetId);
    } catch (error) {
      console.warn('⚠️ Sync queue maintenance failed:', error);
    }
  }

  if (pendingCount === 0) {
    // No pending changes, skip sync
    return;
  }

  console.log(`⏰ Periodic sync triggered (${pendingCount} pending changes)...`);

  try {
    // Use the smarter pending-only sync
    const result = await syncPendingChanges(periodicSyncUserId, periodicSyncDatasetId);
    if (result.status === 'success' || result.status === 'no-changes') {
      console.log('✅ Periodic sync complete:', result.synced || 0, 'changes synced');
    } else if (result.status === 'partial') {
      console.warn(`⚠️ Periodic sync partial: ${result.synced} synced, ${result.failed} failed`);
    } else if (result.status !== 'skipped') {
      console.warn('⚠️ Periodic sync issue:', result);
    }
  } catch (error) {
    console.error('❌ Periodic sync failed:', error);
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
    console.warn('⚠️ Cannot start periodic sync without userId');
    return;
  }

  periodicSyncUserId = userId;
  periodicSyncDatasetId = datasetId || DEFAULT_DATASET_ID;

  // Start the interval
  periodicSyncIntervalId = setInterval(performPeriodicSync, PERIODIC_SYNC_INTERVAL);
  console.log(`⏰ Periodic sync started (every ${PERIODIC_SYNC_INTERVAL / 60000} minutes)`);
}

/**
 * Stop the periodic sync interval
 */
export function stopPeriodicSync() {
  if (periodicSyncIntervalId) {
    clearInterval(periodicSyncIntervalId);
    periodicSyncIntervalId = null;
    console.log('⏰ Periodic sync stopped');
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
    console.warn('⚠️ No userId provided to initializeSync');
    return { status: 'no-user', data: null };
  }

  const dsId = datasetId || DEFAULT_DATASET_ID;
  const localDb = getDatabase(dsId);

  try {
    updateSyncStatus({ isSyncing: true, error: null });
    console.log('🔄 Initializing sync for user:', userId, 'dataset:', dsId);

    // Check what data exists
    const [localPeople, localHouses, localRelationships] = await Promise.all([
      getAllPeople(dsId),
      getAllHouses(dsId),
      getAllRelationships(dsId)
    ]);

    const hasLocalData = localPeople.length > 0 || localHouses.length > 0;
    const userHasCloudData = await hasCloudData(userId, dsId);

    console.log('📊 Sync check:', {
      dataset: dsId,
      hasLocalData,
      hasCloudData: userHasCloudData,
      localPeople: localPeople.length,
      localHouses: localHouses.length
    });

    // Scenario 1: No data anywhere
    if (!hasLocalData && !userHasCloudData) {
      console.log('✨ Fresh start - no data to sync');
      updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
      return { status: 'fresh', data: null };
    }

    // Scenario 2: Local data but no cloud data → Upload
    if (hasLocalData && !userHasCloudData) {
      console.log('⬆️ Uploading local data to cloud...');

      let codexEntries = [];
      let codexLinks = [];
      let heraldry = [];
      let heraldryLinks = [];

      try {
        codexEntries = await getAllCodexEntries();
        codexLinks = await localDb.codexLinks.toArray();
      } catch (e) {
        console.warn('Could not get codex entries/links:', e);
      }

      try {
        heraldry = await localGetAllHeraldry(dsId);
        heraldryLinks = await localDb.heraldryLinks.toArray();
      } catch (e) {
        console.warn('Could not get heraldry:', e);
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
        console.warn('Could not get dignities:', e);
      }

      // Get household roles
      let householdRoles = [];
      try {
        householdRoles = await localGetAllHouseholdRoles(dsId);
      } catch (e) {
        console.warn('Could not get household roles:', e);
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
        console.warn('Could not get writings data:', e);
      }

      // Get planning data
      let storyPlans = [];
      let storyArcs = [];
      let storyBeats = [];
      let scenePlans = [];
      let plotThreads = [];
      let characterArcs = [];
      let arcMilestones = [];
      try {
        storyPlans = await localDb.storyPlans.toArray();
        storyArcs = await localDb.storyArcs.toArray();
        storyBeats = await localDb.storyBeats.toArray();
        scenePlans = await localDb.scenePlans.toArray();
        plotThreads = await localDb.plotThreads.toArray();
        characterArcs = await localDb.characterArcs.toArray();
        arcMilestones = await localDb.arcMilestones.toArray();
      } catch (e) {
        console.warn('Could not get planning data:', e);
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
        characterArcs,
        arcMilestones
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
    console.log('⬇️ Downloading cloud data...');

    // CRITICAL: Check for pending changes before wiping local data
    // This prevents data loss when local changes haven't synced yet
    const pendingCount = await getPendingChangeCount(dsId);
    if (pendingCount > 0) {
      console.warn(`⚠️ BLOCKING SYNC: ${pendingCount} pending changes not yet synced to cloud`);
      console.warn('⚠️ Local data will be preserved to prevent data loss');
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
        console.warn('Could not restore codex entry:', e);
      }
    }

    // Handle codex links if they exist
    for (const link of cloudData.codexLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.codexLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore codex link:', e);
      }
    }

    // Handle heraldry if it exists
    for (const h of cloudData.heraldry || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...heraldryData } = h;
      try {
        // Use put to insert with specific ID
        await localDb.heraldry.put({ ...heraldryData, id: parseInt(h.id) || h.id });
      } catch (e) {
        console.warn('Could not restore heraldry:', e);
      }
    }

    // Handle heraldry links if they exist
    for (const link of cloudData.heraldryLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.heraldryLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore heraldry link:', e);
      }
    }

    // Handle dignities if they exist
    for (const dignity of cloudData.dignities || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...dignityData } = dignity;
      try {
        await localDb.dignities.put({ ...dignityData, id: parseInt(dignity.id) || dignity.id });
      } catch (e) {
        console.warn('Could not restore dignity:', e);
      }
    }

    // Handle dignity tenures if they exist
    for (const tenure of cloudData.dignityTenures || []) {
      const { createdAt, syncedAt, localId, ...tenureData } = tenure;
      try {
        await localDb.dignityTenures.put({ ...tenureData, id: parseInt(tenure.id) || tenure.id });
      } catch (e) {
        console.warn('Could not restore dignity tenure:', e);
      }
    }

    // Handle dignity links if they exist
    for (const link of cloudData.dignityLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.dignityLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore dignity link:', e);
      }
    }

    // Handle household roles if they exist
    for (const role of cloudData.householdRoles || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...roleData } = role;
      try {
        await localDb.householdRoles.put({ ...roleData, id: parseInt(role.id) || role.id });
      } catch (e) {
        console.warn('Could not restore household role:', e);
      }
    }

    // Handle writings if they exist
    for (const writing of cloudData.writings || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...writingData } = writing;
      try {
        await localRestoreWriting({ ...writingData, id: parseInt(writing.id) || writing.id }, dsId);
      } catch (e) {
        console.warn('Could not restore writing:', e);
      }
    }

    // Handle chapters if they exist
    for (const chapter of cloudData.chapters || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...chapterData } = chapter;
      try {
        await localRestoreChapter({ ...chapterData, id: parseInt(chapter.id) || chapter.id }, dsId);
      } catch (e) {
        console.warn('Could not restore chapter:', e);
      }
    }

    // Handle writing links if they exist
    for (const link of cloudData.writingLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localRestoreWritingLink({ ...linkData, id: parseInt(link.id) || link.id }, dsId);
      } catch (e) {
        console.warn('Could not restore writing link:', e);
      }
    }

    // Handle story plans if they exist
    for (const plan of cloudData.storyPlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...planData } = plan;
      try {
        await localRestoreStoryPlan({ ...planData, id: parseInt(plan.id) || plan.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story plan:', e);
      }
    }

    // Handle story arcs if they exist
    for (const arc of cloudData.storyArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreStoryArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story arc:', e);
      }
    }

    // Handle story beats if they exist
    for (const beat of cloudData.storyBeats || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...beatData } = beat;
      try {
        await localRestoreStoryBeat({ ...beatData, id: parseInt(beat.id) || beat.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story beat:', e);
      }
    }

    // Handle scene plans if they exist
    for (const scene of cloudData.scenePlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...sceneData } = scene;
      try {
        await localRestoreScenePlan({ ...sceneData, id: parseInt(scene.id) || scene.id }, dsId);
      } catch (e) {
        console.warn('Could not restore scene plan:', e);
      }
    }

    // Handle plot threads if they exist
    for (const thread of cloudData.plotThreads || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...threadData } = thread;
      try {
        await localRestorePlotThread({ ...threadData, id: parseInt(thread.id) || thread.id }, dsId);
      } catch (e) {
        console.warn('Could not restore plot thread:', e);
      }
    }

    // Handle character arcs if they exist
    for (const arc of cloudData.characterArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreCharacterArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        console.warn('Could not restore character arc:', e);
      }
    }

    // Handle arc milestones if they exist
    for (const milestone of cloudData.arcMilestones || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...milestoneData } = milestone;
      try {
        await localDb.arcMilestones.put({ ...milestoneData, id: parseInt(milestone.id) || milestone.id });
      } catch (e) {
        console.warn('Could not restore arc milestone:', e);
      }
    }

    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });

    return {
      status: 'downloaded',
      data: cloudData
    };

  } catch (error) {
    console.error('❌ Sync initialization failed:', error);
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
  // Track in sync queue immediately (even if offline)
  await addToSyncQueue({ entityType: 'person', entityId: personId, operation: 'add', data: personData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    // Use retry with exponential backoff for cloud operations
    await retryWithBackoff(
      () => addPersonCloud(userId, datasetId, { ...personData, id: personId }),
      SYNC_RETRY_CONFIG
    );
    // Mark as synced on success
    await markEntitySynced('person', personId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync person add after retries:', error);
    // Don't throw - local operation already succeeded
    // Entry remains in queue as pending for next periodic sync
  }
}

/**
 * Update a person (local + cloud)
 */
export async function syncUpdatePerson(userId, datasetId, personId, updates) {
  await addToSyncQueue({ entityType: 'person', entityId: personId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await retryWithBackoff(
      () => updatePersonCloud(userId, datasetId, personId, updates),
      SYNC_RETRY_CONFIG
    );
    await markEntitySynced('person', personId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync person update after retries:', error);
  }
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
  await addToSyncQueue({ entityType: 'person', entityId: personId, operation: 'delete' }, datasetId);

  // CASCADE: Queue all relationships for cloud deletion
  // The relationship IDs are passed in because local DB cascade already happened
  for (const relId of relationshipIds) {
    await addToSyncQueue({ entityType: 'relationship', entityId: relId, operation: 'delete' }, datasetId);
    console.log(`☁️ Queued cascade delete for relationship ${relId} (person ${personId})`);
  }

  if (!userId || !isOnline) return;

  try {
    // First delete relationships from cloud (cascade)
    for (const relId of relationshipIds) {
      try {
        await deleteRelationshipCloud(userId, datasetId, relId);
        await markEntitySynced('relationship', relId, datasetId);
        console.log(`☁️ Cascade deleted relationship ${relId} from cloud`);
      } catch (relError) {
        console.warn(`☁️ Could not cascade delete relationship ${relId}:`, relError);
      }
    }

    // Then delete the person from cloud
    await deletePersonCloud(userId, datasetId, personId);
    await markEntitySynced('person', personId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync person delete:', error);
  }
}

/**
 * Add a house (local + cloud)
 */
export async function syncAddHouse(userId, datasetId, houseId, houseData) {
  await addToSyncQueue({ entityType: 'house', entityId: houseId, operation: 'add', data: houseData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await retryWithBackoff(
      () => addHouseCloud(userId, datasetId, { ...houseData, id: houseId }),
      SYNC_RETRY_CONFIG
    );
    await markEntitySynced('house', houseId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync house add after retries:', error);
  }
}

/**
 * Update a house (local + cloud)
 */
export async function syncUpdateHouse(userId, datasetId, houseId, updates) {
  await addToSyncQueue({ entityType: 'house', entityId: houseId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await retryWithBackoff(
      () => updateHouseCloud(userId, datasetId, houseId, updates),
      SYNC_RETRY_CONFIG
    );
    await markEntitySynced('house', houseId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync house update after retries:', error);
  }
}

/**
 * Delete a house (local + cloud)
 */
export async function syncDeleteHouse(userId, datasetId, houseId) {
  await addToSyncQueue({ entityType: 'house', entityId: houseId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteHouseCloud(userId, datasetId, houseId);
    await markEntitySynced('house', houseId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync house delete:', error);
  }
}

/**
 * Add a relationship (local + cloud)
 */
export async function syncAddRelationship(userId, datasetId, relationshipId, relationshipData) {
  await addToSyncQueue({ entityType: 'relationship', entityId: relationshipId, operation: 'add', data: relationshipData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await retryWithBackoff(
      () => addRelationshipCloud(userId, datasetId, { ...relationshipData, id: relationshipId }),
      SYNC_RETRY_CONFIG
    );
    await markEntitySynced('relationship', relationshipId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync relationship add after retries:', error);
  }
}

/**
 * Update a relationship (local + cloud)
 */
export async function syncUpdateRelationship(userId, datasetId, relationshipId, updates) {
  await addToSyncQueue({ entityType: 'relationship', entityId: relationshipId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateRelationshipCloud(userId, datasetId, relationshipId, updates);
    await markEntitySynced('relationship', relationshipId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync relationship update:', error);
  }
}

/**
 * Delete a relationship (local + cloud)
 */
export async function syncDeleteRelationship(userId, datasetId, relationshipId) {
  await addToSyncQueue({ entityType: 'relationship', entityId: relationshipId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteRelationshipCloud(userId, datasetId, relationshipId);
    await markEntitySynced('relationship', relationshipId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync relationship delete:', error);
  }
}

/**
 * Add a codex entry (local + cloud)
 */
export async function syncAddCodexEntry(userId, datasetId, entryId, entryData) {
  await addToSyncQueue({ entityType: 'codexEntry', entityId: entryId, operation: 'add', data: entryData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addCodexEntryCloud(userId, datasetId, { ...entryData, id: entryId });
    await markEntitySynced('codexEntry', entryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync codex entry add:', error);
  }
}

/**
 * Update a codex entry (local + cloud)
 */
export async function syncUpdateCodexEntry(userId, datasetId, entryId, updates) {
  await addToSyncQueue({ entityType: 'codexEntry', entityId: entryId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateCodexEntryCloud(userId, datasetId, entryId, updates);
    await markEntitySynced('codexEntry', entryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync codex entry update:', error);
  }
}

/**
 * Delete a codex entry (local + cloud)
 */
export async function syncDeleteCodexEntry(userId, datasetId, entryId) {
  await addToSyncQueue({ entityType: 'codexEntry', entityId: entryId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteCodexEntryCloud(userId, datasetId, entryId);
    await markEntitySynced('codexEntry', entryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync codex entry delete:', error);
  }
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
  await addToSyncQueue({ entityType: 'codexLink', entityId: linkId, operation: 'add', data: linkData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addCodexLinkCloud(userId, datasetId, { ...linkData, id: linkId });
    await markEntitySynced('codexLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync codex link add:', error);
  }
}

/**
 * Delete codex link (local + cloud)
 */
export async function syncDeleteCodexLink(userId, datasetId, linkId) {
  await addToSyncQueue({ entityType: 'codexLink', entityId: linkId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteCodexLinkCloud(userId, datasetId, linkId);
    await markEntitySynced('codexLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync codex link delete:', error);
  }
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
  await addToSyncQueue({ entityType: 'heraldry', entityId: heraldryId, operation: 'add', data: heraldryData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addHeraldryCloud(userId, datasetId, { ...heraldryData, id: heraldryId });
    await markEntitySynced('heraldry', heraldryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync heraldry add:', error);
  }
}

/**
 * Update heraldry (local + cloud)
 */
export async function syncUpdateHeraldry(userId, datasetId, heraldryId, updates) {
  await addToSyncQueue({ entityType: 'heraldry', entityId: heraldryId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateHeraldryCloud(userId, datasetId, heraldryId, updates);
    await markEntitySynced('heraldry', heraldryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync heraldry update:', error);
  }
}

/**
 * Delete heraldry (local + cloud)
 */
export async function syncDeleteHeraldry(userId, datasetId, heraldryId) {
  await addToSyncQueue({ entityType: 'heraldry', entityId: heraldryId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteHeraldryCloud(userId, datasetId, heraldryId);
    await markEntitySynced('heraldry', heraldryId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync heraldry delete:', error);
  }
}

/**
 * Add heraldry link (local + cloud)
 */
export async function syncAddHeraldryLink(userId, datasetId, linkId, linkData) {
  await addToSyncQueue({ entityType: 'heraldryLink', entityId: linkId, operation: 'add', data: linkData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addHeraldryLinkCloud(userId, datasetId, { ...linkData, id: linkId });
    await markEntitySynced('heraldryLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync heraldry link add:', error);
  }
}

/**
 * Delete heraldry link (local + cloud)
 */
export async function syncDeleteHeraldryLink(userId, datasetId, linkId) {
  await addToSyncQueue({ entityType: 'heraldryLink', entityId: linkId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteHeraldryLinkCloud(userId, datasetId, linkId);
    await markEntitySynced('heraldryLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync heraldry link delete:', error);
  }
}

// ==================== DIGNITIES SYNC WRAPPERS ====================

/**
 * Add dignity (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} dignityId - The local dignity ID (after local add)
 * @param {Object} dignityData - The dignity data
 */
export async function syncAddDignity(userId, datasetId, dignityId, dignityData) {
  await addToSyncQueue({ entityType: 'dignity', entityId: dignityId, operation: 'add', data: dignityData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addDignityCloud(userId, datasetId, { ...dignityData, id: dignityId });
    await markEntitySynced('dignity', dignityId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity add:', error);
  }
}

/**
 * Update dignity (local + cloud)
 */
export async function syncUpdateDignity(userId, datasetId, dignityId, updates) {
  await addToSyncQueue({ entityType: 'dignity', entityId: dignityId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateDignityCloud(userId, datasetId, dignityId, updates);
    await markEntitySynced('dignity', dignityId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity update:', error);
  }
}

/**
 * Delete dignity (local + cloud)
 */
export async function syncDeleteDignity(userId, datasetId, dignityId) {
  await addToSyncQueue({ entityType: 'dignity', entityId: dignityId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteDignityCloud(userId, datasetId, dignityId);
    await markEntitySynced('dignity', dignityId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity delete:', error);
  }
}

/**
 * Add dignity tenure (local + cloud)
 */
export async function syncAddDignityTenure(userId, datasetId, tenureId, tenureData) {
  await addToSyncQueue({ entityType: 'dignityTenure', entityId: tenureId, operation: 'add', data: tenureData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addDignityTenureCloud(userId, datasetId, { ...tenureData, id: tenureId });
    await markEntitySynced('dignityTenure', tenureId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity tenure add:', error);
  }
}

/**
 * Update dignity tenure (local + cloud)
 */
export async function syncUpdateDignityTenure(userId, datasetId, tenureId, updates) {
  await addToSyncQueue({ entityType: 'dignityTenure', entityId: tenureId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateDignityTenureCloud(userId, datasetId, tenureId, updates);
    await markEntitySynced('dignityTenure', tenureId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity tenure update:', error);
  }
}

/**
 * Delete dignity tenure (local + cloud)
 */
export async function syncDeleteDignityTenure(userId, datasetId, tenureId) {
  await addToSyncQueue({ entityType: 'dignityTenure', entityId: tenureId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteDignityTenureCloud(userId, datasetId, tenureId);
    await markEntitySynced('dignityTenure', tenureId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity tenure delete:', error);
  }
}

/**
 * Add dignity link (local + cloud)
 */
export async function syncAddDignityLink(userId, datasetId, linkId, linkData) {
  await addToSyncQueue({ entityType: 'dignityLink', entityId: linkId, operation: 'add', data: linkData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addDignityLinkCloud(userId, datasetId, { ...linkData, id: linkId });
    await markEntitySynced('dignityLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity link add:', error);
  }
}

/**
 * Delete dignity link (local + cloud)
 */
export async function syncDeleteDignityLink(userId, datasetId, linkId) {
  await addToSyncQueue({ entityType: 'dignityLink', entityId: linkId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteDignityLinkCloud(userId, datasetId, linkId);
    await markEntitySynced('dignityLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync dignity link delete:', error);
  }
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
  await addToSyncQueue({ entityType: 'householdRole', entityId: roleId, operation: 'add', data: roleData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addHouseholdRoleCloud(userId, datasetId, { ...roleData, id: roleId });
    await markEntitySynced('householdRole', roleId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync household role add:', error);
  }
}

/**
 * Update household role (local + cloud)
 */
export async function syncUpdateHouseholdRole(userId, datasetId, roleId, updates) {
  await addToSyncQueue({ entityType: 'householdRole', entityId: roleId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateHouseholdRoleCloud(userId, datasetId, roleId, updates);
    await markEntitySynced('householdRole', roleId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync household role update:', error);
  }
}

/**
 * Delete household role (local + cloud)
 */
export async function syncDeleteHouseholdRole(userId, datasetId, roleId) {
  await addToSyncQueue({ entityType: 'householdRole', entityId: roleId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteHouseholdRoleCloud(userId, datasetId, roleId);
    await markEntitySynced('householdRole', roleId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync household role delete:', error);
  }
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
  await addToSyncQueue({ entityType: 'writing', entityId: writingId, operation: 'add', data: writingData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addWritingCloud(userId, datasetId, { ...writingData, id: writingId });
    await markEntitySynced('writing', writingId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync writing add:', error);
  }
}

/**
 * Update writing (local + cloud)
 */
export async function syncUpdateWriting(userId, datasetId, writingId, updates) {
  await addToSyncQueue({ entityType: 'writing', entityId: writingId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateWritingCloud(userId, datasetId, writingId, updates);
    await markEntitySynced('writing', writingId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync writing update:', error);
  }
}

/**
 * Delete writing (local + cloud)
 */
export async function syncDeleteWriting(userId, datasetId, writingId) {
  await addToSyncQueue({ entityType: 'writing', entityId: writingId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteWritingCloud(userId, datasetId, writingId);
    await markEntitySynced('writing', writingId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync writing delete:', error);
  }
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
  await addToSyncQueue({ entityType: 'chapter', entityId: chapterId, operation: 'add', data: chapterData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addChapterCloud(userId, datasetId, { ...chapterData, id: chapterId });
    await markEntitySynced('chapter', chapterId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync chapter add:', error);
  }
}

/**
 * Update chapter (local + cloud)
 */
export async function syncUpdateChapter(userId, datasetId, chapterId, updates) {
  await addToSyncQueue({ entityType: 'chapter', entityId: chapterId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateChapterCloud(userId, datasetId, chapterId, updates);
    await markEntitySynced('chapter', chapterId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync chapter update:', error);
  }
}

/**
 * Delete chapter (local + cloud)
 */
export async function syncDeleteChapter(userId, datasetId, chapterId) {
  await addToSyncQueue({ entityType: 'chapter', entityId: chapterId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteChapterCloud(userId, datasetId, chapterId);
    await markEntitySynced('chapter', chapterId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync chapter delete:', error);
  }
}

// ==================== WRITING LINKS SYNC ====================

/**
 * Add writing link (local + cloud)
 */
export async function syncAddWritingLink(userId, datasetId, linkId, linkData) {
  await addToSyncQueue({ entityType: 'writingLink', entityId: linkId, operation: 'add', data: linkData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addWritingLinkCloud(userId, datasetId, { ...linkData, id: linkId });
    await markEntitySynced('writingLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync writing link add:', error);
  }
}

/**
 * Delete writing link (local + cloud)
 */
export async function syncDeleteWritingLink(userId, datasetId, linkId) {
  await addToSyncQueue({ entityType: 'writingLink', entityId: linkId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteWritingLinkCloud(userId, datasetId, linkId);
    await markEntitySynced('writingLink', linkId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync writing link delete:', error);
  }
}

// ==================== PLANNING: STORY PLANS SYNC ====================

/**
 * Add story plan (local + cloud)
 */
export async function syncAddStoryPlan(userId, datasetId, planId, planData) {
  await addToSyncQueue({ entityType: 'storyPlan', entityId: planId, operation: 'add', data: planData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addStoryPlanCloud(userId, datasetId, { ...planData, id: planId });
    await markEntitySynced('storyPlan', planId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story plan add:', error);
  }
}

/**
 * Update story plan (local + cloud)
 */
export async function syncUpdateStoryPlan(userId, datasetId, planId, updates) {
  await addToSyncQueue({ entityType: 'storyPlan', entityId: planId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateStoryPlanCloud(userId, datasetId, planId, updates);
    await markEntitySynced('storyPlan', planId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story plan update:', error);
  }
}

/**
 * Delete story plan (local + cloud)
 */
export async function syncDeleteStoryPlan(userId, datasetId, planId) {
  await addToSyncQueue({ entityType: 'storyPlan', entityId: planId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteStoryPlanCloud(userId, datasetId, planId);
    await markEntitySynced('storyPlan', planId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story plan delete:', error);
  }
}

// ==================== PLANNING: STORY ARCS SYNC ====================

/**
 * Add story arc (local + cloud)
 */
export async function syncAddStoryArc(userId, datasetId, arcId, arcData) {
  await addToSyncQueue({ entityType: 'storyArc', entityId: arcId, operation: 'add', data: arcData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addStoryArcCloud(userId, datasetId, { ...arcData, id: arcId });
    await markEntitySynced('storyArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story arc add:', error);
  }
}

/**
 * Update story arc (local + cloud)
 */
export async function syncUpdateStoryArc(userId, datasetId, arcId, updates) {
  await addToSyncQueue({ entityType: 'storyArc', entityId: arcId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateStoryArcCloud(userId, datasetId, arcId, updates);
    await markEntitySynced('storyArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story arc update:', error);
  }
}

/**
 * Delete story arc (local + cloud)
 */
export async function syncDeleteStoryArc(userId, datasetId, arcId) {
  await addToSyncQueue({ entityType: 'storyArc', entityId: arcId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteStoryArcCloud(userId, datasetId, arcId);
    await markEntitySynced('storyArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story arc delete:', error);
  }
}

// ==================== PLANNING: STORY BEATS SYNC ====================

/**
 * Add story beat (local + cloud)
 */
export async function syncAddStoryBeat(userId, datasetId, beatId, beatData) {
  await addToSyncQueue({ entityType: 'storyBeat', entityId: beatId, operation: 'add', data: beatData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addStoryBeatCloud(userId, datasetId, { ...beatData, id: beatId });
    await markEntitySynced('storyBeat', beatId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story beat add:', error);
  }
}

/**
 * Update story beat (local + cloud)
 */
export async function syncUpdateStoryBeat(userId, datasetId, beatId, updates) {
  await addToSyncQueue({ entityType: 'storyBeat', entityId: beatId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateStoryBeatCloud(userId, datasetId, beatId, updates);
    await markEntitySynced('storyBeat', beatId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story beat update:', error);
  }
}

/**
 * Delete story beat (local + cloud)
 */
export async function syncDeleteStoryBeat(userId, datasetId, beatId) {
  await addToSyncQueue({ entityType: 'storyBeat', entityId: beatId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteStoryBeatCloud(userId, datasetId, beatId);
    await markEntitySynced('storyBeat', beatId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync story beat delete:', error);
  }
}

// ==================== PLANNING: SCENE PLANS SYNC ====================

/**
 * Add scene plan (local + cloud)
 */
export async function syncAddScenePlan(userId, datasetId, sceneId, sceneData) {
  await addToSyncQueue({ entityType: 'scenePlan', entityId: sceneId, operation: 'add', data: sceneData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addScenePlanCloud(userId, datasetId, { ...sceneData, id: sceneId });
    await markEntitySynced('scenePlan', sceneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync scene plan add:', error);
  }
}

/**
 * Update scene plan (local + cloud)
 */
export async function syncUpdateScenePlan(userId, datasetId, sceneId, updates) {
  await addToSyncQueue({ entityType: 'scenePlan', entityId: sceneId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateScenePlanCloud(userId, datasetId, sceneId, updates);
    await markEntitySynced('scenePlan', sceneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync scene plan update:', error);
  }
}

/**
 * Delete scene plan (local + cloud)
 */
export async function syncDeleteScenePlan(userId, datasetId, sceneId) {
  await addToSyncQueue({ entityType: 'scenePlan', entityId: sceneId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteScenePlanCloud(userId, datasetId, sceneId);
    await markEntitySynced('scenePlan', sceneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync scene plan delete:', error);
  }
}

// ==================== PLANNING: PLOT THREADS SYNC ====================

/**
 * Add plot thread (local + cloud)
 */
export async function syncAddPlotThread(userId, datasetId, threadId, threadData) {
  await addToSyncQueue({ entityType: 'plotThread', entityId: threadId, operation: 'add', data: threadData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addPlotThreadCloud(userId, datasetId, { ...threadData, id: threadId });
    await markEntitySynced('plotThread', threadId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync plot thread add:', error);
  }
}

/**
 * Update plot thread (local + cloud)
 */
export async function syncUpdatePlotThread(userId, datasetId, threadId, updates) {
  await addToSyncQueue({ entityType: 'plotThread', entityId: threadId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updatePlotThreadCloud(userId, datasetId, threadId, updates);
    await markEntitySynced('plotThread', threadId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync plot thread update:', error);
  }
}

/**
 * Delete plot thread (local + cloud)
 */
export async function syncDeletePlotThread(userId, datasetId, threadId) {
  await addToSyncQueue({ entityType: 'plotThread', entityId: threadId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deletePlotThreadCloud(userId, datasetId, threadId);
    await markEntitySynced('plotThread', threadId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync plot thread delete:', error);
  }
}

// ==================== PLANNING: CHARACTER ARCS SYNC ====================

/**
 * Add character arc (local + cloud)
 */
export async function syncAddCharacterArc(userId, datasetId, arcId, arcData) {
  await addToSyncQueue({ entityType: 'characterArc', entityId: arcId, operation: 'add', data: arcData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addCharacterArcCloud(userId, datasetId, { ...arcData, id: arcId });
    await markEntitySynced('characterArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync character arc add:', error);
  }
}

/**
 * Update character arc (local + cloud)
 */
export async function syncUpdateCharacterArc(userId, datasetId, arcId, updates) {
  await addToSyncQueue({ entityType: 'characterArc', entityId: arcId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateCharacterArcCloud(userId, datasetId, arcId, updates);
    await markEntitySynced('characterArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync character arc update:', error);
  }
}

/**
 * Delete character arc (local + cloud)
 */
export async function syncDeleteCharacterArc(userId, datasetId, arcId) {
  await addToSyncQueue({ entityType: 'characterArc', entityId: arcId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteCharacterArcCloud(userId, datasetId, arcId);
    await markEntitySynced('characterArc', arcId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync character arc delete:', error);
  }
}

// ==================== PLANNING: ARC MILESTONES SYNC ====================

/**
 * Add arc milestone (local + cloud)
 */
export async function syncAddArcMilestone(userId, datasetId, milestoneId, milestoneData) {
  await addToSyncQueue({ entityType: 'arcMilestone', entityId: milestoneId, operation: 'add', data: milestoneData }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await addArcMilestoneCloud(userId, datasetId, { ...milestoneData, id: milestoneId });
    await markEntitySynced('arcMilestone', milestoneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync arc milestone add:', error);
  }
}

/**
 * Update arc milestone (local + cloud)
 */
export async function syncUpdateArcMilestone(userId, datasetId, milestoneId, updates) {
  await addToSyncQueue({ entityType: 'arcMilestone', entityId: milestoneId, operation: 'update', data: updates }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await updateArcMilestoneCloud(userId, datasetId, milestoneId, updates);
    await markEntitySynced('arcMilestone', milestoneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync arc milestone update:', error);
  }
}

/**
 * Delete arc milestone (local + cloud)
 */
export async function syncDeleteArcMilestone(userId, datasetId, milestoneId) {
  await addToSyncQueue({ entityType: 'arcMilestone', entityId: milestoneId, operation: 'delete' }, datasetId);

  if (!userId || !isOnline) return;

  try {
    await deleteArcMilestoneCloud(userId, datasetId, milestoneId);
    await markEntitySynced('arcMilestone', milestoneId, datasetId);
  } catch (error) {
    console.error('☁️ Failed to sync arc milestone delete:', error);
  }
}

// ==================== UTILITY ====================

/**
 * Get current sync status
 */
export function getSyncStatus() {
  return { ...syncStatus, isOnline };
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
        console.warn(`⚠️ BLOCKING FORCE SYNC: ${pendingCount} pending changes not synced`);
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
      console.warn('⚠️ Force clear requested - pending changes will be lost');
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
        console.warn('Could not restore codex entry during force sync:', e);
      }
    }

    // Restore codex links
    for (const link of cloudData.codexLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.codexLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore codex link during force sync:', e);
      }
    }

    // Restore heraldry
    for (const h of cloudData.heraldry || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...heraldryData } = h;
      try {
        await localDb.heraldry.put({ ...heraldryData, id: parseInt(h.id) || h.id });
      } catch (e) {
        console.warn('Could not restore heraldry during force sync:', e);
      }
    }

    // Restore heraldry links
    for (const link of cloudData.heraldryLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.heraldryLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore heraldry link during force sync:', e);
      }
    }

    // Restore dignities
    for (const dignity of cloudData.dignities || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...dignityData } = dignity;
      try {
        await localDb.dignities.put({ ...dignityData, id: parseInt(dignity.id) || dignity.id });
      } catch (e) {
        console.warn('Could not restore dignity during force sync:', e);
      }
    }

    // Restore dignity tenures
    for (const tenure of cloudData.dignityTenures || []) {
      const { createdAt, syncedAt, localId, ...tenureData } = tenure;
      try {
        await localDb.dignityTenures.put({ ...tenureData, id: parseInt(tenure.id) || tenure.id });
      } catch (e) {
        console.warn('Could not restore dignity tenure during force sync:', e);
      }
    }

    // Restore dignity links
    for (const link of cloudData.dignityLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localDb.dignityLinks.put({ ...linkData, id: parseInt(link.id) || link.id });
      } catch (e) {
        console.warn('Could not restore dignity link during force sync:', e);
      }
    }

    // Restore household roles
    for (const role of cloudData.householdRoles || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...roleData } = role;
      try {
        await localDb.householdRoles.put({ ...roleData, id: parseInt(role.id) || role.id });
      } catch (e) {
        console.warn('Could not restore household role during force sync:', e);
      }
    }

    // Restore writings
    for (const writing of cloudData.writings || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...writingData } = writing;
      try {
        await localRestoreWriting({ ...writingData, id: parseInt(writing.id) || writing.id }, dsId);
      } catch (e) {
        console.warn('Could not restore writing during force sync:', e);
      }
    }

    // Restore chapters
    for (const chapter of cloudData.chapters || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...chapterData } = chapter;
      try {
        await localRestoreChapter({ ...chapterData, id: parseInt(chapter.id) || chapter.id }, dsId);
      } catch (e) {
        console.warn('Could not restore chapter during force sync:', e);
      }
    }

    // Restore writing links
    for (const link of cloudData.writingLinks || []) {
      const { createdAt, syncedAt, localId, ...linkData } = link;
      try {
        await localRestoreWritingLink({ ...linkData, id: parseInt(link.id) || link.id }, dsId);
      } catch (e) {
        console.warn('Could not restore writing link during force sync:', e);
      }
    }

    // Restore story plans
    for (const plan of cloudData.storyPlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...planData } = plan;
      try {
        await localRestoreStoryPlan({ ...planData, id: parseInt(plan.id) || plan.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story plan during force sync:', e);
      }
    }

    // Restore story arcs
    for (const arc of cloudData.storyArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreStoryArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story arc during force sync:', e);
      }
    }

    // Restore story beats
    for (const beat of cloudData.storyBeats || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...beatData } = beat;
      try {
        await localRestoreStoryBeat({ ...beatData, id: parseInt(beat.id) || beat.id }, dsId);
      } catch (e) {
        console.warn('Could not restore story beat during force sync:', e);
      }
    }

    // Restore scene plans
    for (const scene of cloudData.scenePlans || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...sceneData } = scene;
      try {
        await localRestoreScenePlan({ ...sceneData, id: parseInt(scene.id) || scene.id }, dsId);
      } catch (e) {
        console.warn('Could not restore scene plan during force sync:', e);
      }
    }

    // Restore plot threads
    for (const thread of cloudData.plotThreads || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...threadData } = thread;
      try {
        await localRestorePlotThread({ ...threadData, id: parseInt(thread.id) || thread.id }, dsId);
      } catch (e) {
        console.warn('Could not restore plot thread during force sync:', e);
      }
    }

    // Restore character arcs
    for (const arc of cloudData.characterArcs || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...arcData } = arc;
      try {
        await localRestoreCharacterArc({ ...arcData, id: parseInt(arc.id) || arc.id }, dsId);
      } catch (e) {
        console.warn('Could not restore character arc during force sync:', e);
      }
    }

    // Restore arc milestones
    for (const milestone of cloudData.arcMilestones || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...milestoneData } = milestone;
      try {
        await localDb.arcMilestones.put({ ...milestoneData, id: parseInt(milestone.id) || milestone.id });
      } catch (e) {
        console.warn('Could not restore arc milestone during force sync:', e);
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
    console.log('⬆️ Force uploading all local data to cloud...');

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
      console.warn('Could not get codex data for upload:', e);
    }

    try {
      heraldry = await localGetAllHeraldry(dsId);
      heraldryLinks = await localDb.heraldryLinks.toArray();
    } catch (e) {
      console.warn('Could not get heraldry data for upload:', e);
    }

    try {
      dignities = await localDb.dignities.toArray();
      dignityTenures = await localDb.dignityTenures.toArray();
      dignityLinks = await localDb.dignityLinks.toArray();
    } catch (e) {
      console.warn('Could not get dignities data for upload:', e);
    }

    try {
      householdRoles = await localGetAllHouseholdRoles(dsId);
    } catch (e) {
      console.warn('Could not get household roles for upload:', e);
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
      console.warn('Could not get writings data for upload:', e);
    }

    // Get planning data
    let storyPlans = [];
    let storyArcs = [];
    let storyBeats = [];
    let scenePlans = [];
    let plotThreads = [];
    let characterArcs = [];
    let arcMilestones = [];
    try {
      storyPlans = await localDb.storyPlans.toArray();
      storyArcs = await localDb.storyArcs.toArray();
      storyBeats = await localDb.storyBeats.toArray();
      scenePlans = await localDb.scenePlans.toArray();
      plotThreads = await localDb.plotThreads.toArray();
      characterArcs = await localDb.characterArcs.toArray();
      arcMilestones = await localDb.arcMilestones.toArray();
    } catch (e) {
      console.warn('Could not get planning data for upload:', e);
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
      characterArcs,
      arcMilestones
    });

    // Clear the sync queue since everything is now synced
    await clearSyncQueue(dsId);

    console.log('✅ Force upload complete:', {
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
    console.error('❌ Force upload failed:', error);
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
  syncDeleteCharacterArc,

  // Sync wrappers - Planning: Arc Milestones
  syncAddArcMilestone,
  syncUpdateArcMilestone,
  syncDeleteArcMilestone
};
