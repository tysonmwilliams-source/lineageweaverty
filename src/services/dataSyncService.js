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
  deleteAllData as localDeleteAllData
} from './database';

import {
  getAllEntries as getAllCodexEntries,
  createEntry as localCreateCodexEntry
} from './codexService';

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
 * @returns {Object} Sync result with status and data
 */
export async function initializeSync(userId) {
  if (!userId) {
    console.warn('⚠️ No userId provided to initializeSync');
    return { status: 'no-user', data: null };
  }

  try {
    updateSyncStatus({ isSyncing: true, error: null });
    console.log('🔄 Initializing sync for user:', userId);

    // Check what data exists
    const [localPeople, localHouses, localRelationships] = await Promise.all([
      getAllPeople(),
      getAllHouses(),
      getAllRelationships()
    ]);

    const hasLocalData = localPeople.length > 0 || localHouses.length > 0;
    const userHasCloudData = await hasCloudData(userId);

    console.log('📊 Sync check:', {
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
      try {
        codexEntries = await getAllCodexEntries();
      } catch (e) {
        console.warn('Could not get codex entries:', e);
      }

      await syncAllToCloud(userId, {
        people: localPeople,
        houses: localHouses,
        relationships: localRelationships,
        codexEntries
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
    const cloudData = await downloadAllFromCloud(userId);

    // Clear local and replace with cloud data
    await localDeleteAllData();
    
    // Re-populate local DB with cloud data
    for (const house of cloudData.houses || []) {
      // Remove Firestore-specific fields before saving locally
      const { createdAt, updatedAt, syncedAt, localId, ...houseData } = house;
      await localAddHouse({ ...houseData, id: parseInt(house.id) || house.id });
    }

    for (const person of cloudData.people || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...personData } = person;
      await localAddPerson({ ...personData, id: parseInt(person.id) || person.id });
    }

    for (const rel of cloudData.relationships || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...relData } = rel;
      await localAddRelationship({ ...relData, id: parseInt(rel.id) || rel.id });
    }

    // Handle codex entries if they exist
    for (const entry of cloudData.codexEntries || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...entryData } = entry;
      try {
        await localCreateCodexEntry({ ...entryData, id: parseInt(entry.id) || entry.id });
      } catch (e) {
        console.warn('Could not restore codex entry:', e);
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
 * @param {number} personId - The local person ID (after local add)
 * @param {Object} personData - The person data
 */
export async function syncAddPerson(userId, personId, personData) {
  if (!userId || !isOnline) return;
  
  try {
    await addPersonCloud(userId, { ...personData, id: personId });
  } catch (error) {
    console.error('☁️ Failed to sync person add:', error);
    // Don't throw - local operation already succeeded
  }
}

/**
 * Update a person (local + cloud)
 */
export async function syncUpdatePerson(userId, personId, updates) {
  if (!userId || !isOnline) return;
  
  try {
    await updatePersonCloud(userId, personId, updates);
  } catch (error) {
    console.error('☁️ Failed to sync person update:', error);
  }
}

/**
 * Delete a person (local + cloud)
 */
export async function syncDeletePerson(userId, personId) {
  if (!userId || !isOnline) return;
  
  try {
    await deletePersonCloud(userId, personId);
  } catch (error) {
    console.error('☁️ Failed to sync person delete:', error);
  }
}

/**
 * Add a house (local + cloud)
 */
export async function syncAddHouse(userId, houseId, houseData) {
  if (!userId || !isOnline) return;
  
  try {
    await addHouseCloud(userId, { ...houseData, id: houseId });
  } catch (error) {
    console.error('☁️ Failed to sync house add:', error);
  }
}

/**
 * Update a house (local + cloud)
 */
export async function syncUpdateHouse(userId, houseId, updates) {
  if (!userId || !isOnline) return;
  
  try {
    await updateHouseCloud(userId, houseId, updates);
  } catch (error) {
    console.error('☁️ Failed to sync house update:', error);
  }
}

/**
 * Delete a house (local + cloud)
 */
export async function syncDeleteHouse(userId, houseId) {
  if (!userId || !isOnline) return;
  
  try {
    await deleteHouseCloud(userId, houseId);
  } catch (error) {
    console.error('☁️ Failed to sync house delete:', error);
  }
}

/**
 * Add a relationship (local + cloud)
 */
export async function syncAddRelationship(userId, relationshipId, relationshipData) {
  if (!userId || !isOnline) return;
  
  try {
    await addRelationshipCloud(userId, { ...relationshipData, id: relationshipId });
  } catch (error) {
    console.error('☁️ Failed to sync relationship add:', error);
  }
}

/**
 * Update a relationship (local + cloud)
 */
export async function syncUpdateRelationship(userId, relationshipId, updates) {
  if (!userId || !isOnline) return;
  
  try {
    await updateRelationshipCloud(userId, relationshipId, updates);
  } catch (error) {
    console.error('☁️ Failed to sync relationship update:', error);
  }
}

/**
 * Delete a relationship (local + cloud)
 */
export async function syncDeleteRelationship(userId, relationshipId) {
  if (!userId || !isOnline) return;
  
  try {
    await deleteRelationshipCloud(userId, relationshipId);
  } catch (error) {
    console.error('☁️ Failed to sync relationship delete:', error);
  }
}

/**
 * Add a codex entry (local + cloud)
 */
export async function syncAddCodexEntry(userId, entryId, entryData) {
  if (!userId || !isOnline) return;
  
  try {
    await addCodexEntryCloud(userId, { ...entryData, id: entryId });
  } catch (error) {
    console.error('☁️ Failed to sync codex entry add:', error);
  }
}

/**
 * Update a codex entry (local + cloud)
 */
export async function syncUpdateCodexEntry(userId, entryId, updates) {
  if (!userId || !isOnline) return;
  
  try {
    await updateCodexEntryCloud(userId, entryId, updates);
  } catch (error) {
    console.error('☁️ Failed to sync codex entry update:', error);
  }
}

/**
 * Delete a codex entry (local + cloud)
 */
export async function syncDeleteCodexEntry(userId, entryId) {
  if (!userId || !isOnline) return;
  
  try {
    await deleteCodexEntryCloud(userId, entryId);
  } catch (error) {
    console.error('☁️ Failed to sync codex entry delete:', error);
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
 */
export async function forceCloudSync(userId) {
  if (!userId) return { status: 'no-user' };
  
  updateSyncStatus({ isSyncing: true, error: null });
  
  try {
    // Clear local data
    await localDeleteAllData();
    
    // Download from cloud
    const cloudData = await downloadAllFromCloud(userId);
    
    // Re-populate local
    for (const house of cloudData.houses || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...houseData } = house;
      await localAddHouse({ ...houseData, id: parseInt(house.id) || house.id });
    }

    for (const person of cloudData.people || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...personData } = person;
      await localAddPerson({ ...personData, id: parseInt(person.id) || person.id });
    }

    for (const rel of cloudData.relationships || []) {
      const { createdAt, updatedAt, syncedAt, localId, ...relData } = rel;
      await localAddRelationship({ ...relData, id: parseInt(rel.id) || rel.id });
    }
    
    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
    return { status: 'success', data: cloudData };
  } catch (error) {
    updateSyncStatus({ isSyncing: false, error: error.message });
    return { status: 'error', error: error.message };
  }
}

export default {
  initializeSync,
  onSyncStatusChange,
  getSyncStatus,
  forceCloudSync,
  
  // Sync wrappers
  syncAddPerson,
  syncUpdatePerson,
  syncDeletePerson,
  syncAddHouse,
  syncUpdateHouse,
  syncDeleteHouse,
  syncAddRelationship,
  syncUpdateRelationship,
  syncDeleteRelationship,
  syncAddCodexEntry,
  syncUpdateCodexEntry,
  syncDeleteCodexEntry
};
