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
  syncDeleteCascade,
  sendToCloud,
  isOnline
} from './syncEngine';

import { allEntities, getEntity } from './syncManifest';

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
  getPendingChangeCount,
  getPendingChangesByType,
  clearSyncQueue,
  // Sync queue maintenance
  performSyncQueueMaintenance
} from './database';

// Default dataset ID for backward compatibility
const DEFAULT_DATASET_ID = 'default';

import {
  getAllEntries as getAllCodexEntries,
  restoreEntry as localRestoreCodexEntry // Use restore, not create, to preserve IDs
} from './codexService';

import { getAllHeraldry as localGetAllHeraldry } from './heraldryService';

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
  restoreStoryPlan as localRestoreStoryPlan,
  restoreStoryArc as localRestoreStoryArc,
  restoreStoryBeat as localRestoreStoryBeat,
  restoreScenePlan as localRestoreScenePlan,
  restoreCharacterArc as localRestoreCharacterArc,
  restorePlotThread as localRestorePlotThread
} from './planningService';

import { logger } from '../utils/logger';
import { tableByName } from './database';
import { errorMessage } from '../utils/errorMessage';
import type { DatasetId } from './types';
import type { SyncOperation } from './syncManifest';
import type { LocalSnapshot, SnapshotRow } from './syncEngine';
import type { CloudRecord } from './cloudRepo';
import type { SyncPayload } from './syncEngine';

// ==================== SYNC STATE ====================

// Track sync status for UI feedback
/** UI-facing sync state. `getSyncStatus` returns a copy of this plus `isOnline`. */
export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  error: string | null;
}

let syncStatus: SyncStatus = {
  isSyncing: false,
  lastSyncTime: null,
  pendingChanges: 0,
  error: null
};

// Listeners for sync status changes
const syncStatusListeners = new Set<(status: SyncStatus) => void>();

// Periodic sync interval (5 minutes = 300000ms)
const PERIODIC_SYNC_INTERVAL = 5 * 60 * 1000;
let periodicSyncIntervalId: ReturnType<typeof setInterval> | null = null;
let periodicSyncUserId: string | null = null;
let periodicSyncDatasetId: DatasetId = null;

/**
 * Subscribe to sync status changes
 * @param {Function} callback - Called when sync status changes
 * @returns {Function} Unsubscribe function
 */
export function onSyncStatusChange(callback: (status: SyncStatus) => void): () => void {
  syncStatusListeners.add(callback);
  // Immediately call with current status
  callback(syncStatus);
  return () => syncStatusListeners.delete(callback);
}

/**
 * Update sync status and notify listeners
 */
function updateSyncStatus(updates: Partial<SyncStatus>): void {
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
export async function syncPendingChanges(userId: SyncUserId, datasetId: SyncDatasetId = DEFAULT_DATASET_ID) {
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
          await sendToCloud(
            entityType,
            change.operation,
            userId,
            dsId,
            change.entityId,
            // `syncQueue.data` is typed `unknown` because the queue stores rows
            // of twenty different shapes. Everything downstream treats a
            // payload as an opaque bag of fields, which is exactly what
            // `SyncPayload` is.
            change.data as SyncPayload | undefined
          );
          // By queue row, not by entity. Marking every pending row for an
          // entity confirmed changes that had not been sent — see syncEngine.ts.
          await markSynced(change.id, dsId);
          syncedCount++;
        } catch (error) {
          errors.push({ entityType, entityId: change.entityId, error: errorMessage(error) });
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
    return { status: 'error', error: errorMessage(error) };
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
export function startPeriodicSync(userId: string, datasetId: SyncDatasetId = DEFAULT_DATASET_ID): void {
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

// ==================== LOCAL SNAPSHOT ====================

/**
 * How each entity's rows are read out of the local database.
 *
 * Same shape as `CLOUD_RESTORE`, and the same rule: the default is a plain
 * `toArray()` on the manifest's table, so only the nine entities that need a
 * service function are listed. They need one because reading them is not just
 * a table scan — `getAllPeople` and friends apply the service layer's own
 * shaping, and uploading rows that differ from what the app reads would put a
 * different world in the cloud than the one on screen.
 *
 * `storyPlans` deliberately reads the raw table rather than going through
 * `planningService.getAllStoryPlans`. The assembly this replaced read the raw
 * table, and the service getter is not a drop-in for it — so the import went in
 * step 7 rather than the read changing.
 */
type LocalReader = (dsId: SyncDatasetId) => Promise<SnapshotRow[]>;

const LOCAL_READ: Record<string, LocalReader | undefined> = {
  person: (dsId) => getAllPeople(dsId),
  house: (dsId) => getAllHouses(dsId),
  relationship: (dsId) => getAllRelationships(dsId),
  codexEntry: (dsId) => getAllCodexEntries(dsId),
  heraldry: (dsId) => localGetAllHeraldry(dsId),
  householdRole: (dsId) => localGetAllHouseholdRoles(dsId),
  writing: (dsId) => localGetAllWritings(dsId),
  chapter: (dsId) => localGetAllChapters(dsId),
  writingLink: (dsId) => localGetAllWritingLinks(dsId)
};

/**
 * Read every local table for a dataset, keyed by table name.
 *
 * Replaces ~70 lines of hand-written assembly that existed twice, and fixes the
 * flaw that made pruning unsafe to add.
 *
 * **A table that could not be read is absent from `data`, not empty.** The old
 * assembly initialised every array to `[]` and overwrote it inside a `try`, so
 * a throwing Dexie call left `[]` behind and "no rows" and "could not read"
 * became the same value. That was harmless while upload was pure upsert — you
 * simply uploaded nothing for that table — and it is exactly what makes a
 * prune leg dangerous, since "nothing locally" is the signal to delete the
 * cloud copy. Omitting the key instead means a failed read cannot be mistaken
 * for an empty table by anything downstream.
 *
 * Failures are also isolated per entity now. The old code grouped reads into
 * six `try` blocks, so one throwing call skipped every later read in its group
 * — a failure to read codex entries silently zeroed codex links too.
 *
 * @param {string} dsId - The dataset ID
 * @returns {Promise<{data: Object, failed: string[]}>} Rows by table name, and
 *   the entity types that could not be read.
 */
async function collectLocalData(dsId: DatasetId): Promise<{ data: LocalSnapshot; failed: string[] }> {
  const database = getDatabase(dsId);
  const data: LocalSnapshot = {};
  const failed: string[] = [];

  for (const entity of allEntities()) {
    const read: LocalReader = LOCAL_READ[entity.entityType]
      ?? (async () => {
        const table = tableByName(database, entity.table);
        if (!table) throw new Error(`No local table "${entity.table}"`);
        return table.toArray() as Promise<SnapshotRow[]>;
      });

    try {
      data[entity.table] = await read(dsId);
    } catch (e) {
      failed.push(entity.entityType);
      logger.warn(`Could not read local ${entity.table} for upload:`, e);
    }
  }

  if (failed.length > 0) {
    logger.error(
      `⚠️ Local snapshot is incomplete — could not read: ${failed.join(', ')}. ` +
      'Upload will skip those tables and must not prune them.'
    );
  }

  return { data, failed };
}


// ==================== RESTORE FROM CLOUD ====================

/**
 * How each entity is written back into the local database on restore.
 *
 * Sync manifest, step 5. This replaces two copies of the same 190-line block —
 * one in `initializeSync`, one in `forceCloudSync` — which were functionally
 * identical (verified line by line; they differed only in comments and in
 * whether the warning said "during force sync"). Two copies of a restore path
 * is how the two drift, and a restore that drifts loses whichever entity the
 * other copy learned about.
 *
 * Most entities restore with a plain `put`, so the default is exactly that and
 * only the thirteen that need a service function are listed. A service function
 * is required wherever restoring has to do more than write the row: `house`
 * must not re-create a Codex entry, and the writing and planning tables have
 * restore helpers that preserve ids rather than autoincrementing new ones.
 */
type CloudRestorer = (row: Record<string, unknown>, dsId: SyncDatasetId) => Promise<unknown>;

/**
 * Hand a cloud row to a local writer that wants a typed input.
 *
 * The row arrived from Firestore as untyped JSON. It was written there by this
 * same app, from a local row of exactly the type being asserted — so the claim
 * is sound in the only way an assertion ever is, by writer and reader agreeing
 * on a shape. There is no validation layer to turn the claim into a check, and
 * adding one is a behaviour change rather than a conversion.
 *
 * Confined to the four restorers whose callee is itself converted; the rest go
 * to `.js` services that take `any` regardless.
 */
function restored<T>(row: Record<string, unknown>): T {
  return row as T;
}

const CLOUD_RESTORE: Record<string, CloudRestorer | undefined> = {
  house: (row, dsId) => localAddHouse(restored(row), { skipCodexCreation: true, datasetId: dsId }),
  person: (row, dsId) => localAddPerson(restored(row), dsId),
  relationship: (row, dsId) => localAddRelationship(restored(row), dsId),
  codexEntry: (row, dsId) => localRestoreCodexEntry(restored(row), dsId),
  writing: (row, dsId) => localRestoreWriting(row, dsId),
  chapter: (row, dsId) => localRestoreChapter(row, dsId),
  writingLink: (row, dsId) => localRestoreWritingLink(row, dsId),
  storyPlan: (row, dsId) => localRestoreStoryPlan(row, dsId),
  storyArc: (row, dsId) => localRestoreStoryArc(row, dsId),
  storyBeat: (row, dsId) => localRestoreStoryBeat(row, dsId),
  scenePlan: (row, dsId) => localRestoreScenePlan(row, dsId),
  plotThread: (row, dsId) => localRestorePlotThread(row, dsId),
  characterArc: (row, dsId) => localRestoreCharacterArc(row, dsId)
};

/**
 * Entities whose restore failure aborts the whole restore.
 *
 * The other seventeen catch per row and warn. That asymmetry is preserved
 * because it is defensible, not because it was designed: a missing person or
 * house makes everything referencing them meaningless, so failing loudly beats
 * a half-populated tree. A dropped link or beat does not.
 */
const RESTORE_MUST_SUCCEED = new Set<string>(['house', 'person', 'relationship']);

/**
 * The order entities are restored in.
 *
 * Spelled out rather than taken from the manifest, which orders `person` before
 * `house`. Unlike the cloud upload — where ordering is inert because Firestore
 * has no referential integrity — this writes through local service functions
 * that can validate, so the original order is preserved exactly.
 * `syncEngine.test.js` asserts this covers every manifest entity, so adding one
 * without placing it here fails rather than silently skipping it on restore.
 */
const RESTORE_ORDER: string[] = [
  'house', 'person', 'relationship',
  'codexEntry', 'codexLink',
  'heraldry', 'heraldryLink',
  'dignity', 'dignityTenure', 'dignityLink',
  'householdRole',
  'writing', 'chapter', 'writingLink',
  'storyPlan', 'storyArc', 'storyBeat', 'scenePlan', 'plotThread', 'characterArc'
];

/**
 * Strip the fields Firestore added, leaving the row as local storage wants it.
 *
 * Five entities used to omit `updatedAt` from this list. That was safe rather
 * than meaningful — their manifest write policies (`created-only`, `synced`,
 * `unstamped`) mean none of them can ever carry an `updatedAt` — so stripping
 * it uniformly changes nothing today and stays correct if a policy changes.
 */
function stripCloudFields(row: CloudRecord): Record<string, unknown> {
  const { createdAt, updatedAt, syncedAt, localId, ...data } = row;
  return data;
}

/**
 * Re-populate the local database from a cloud snapshot.
 *
 * @param {Object} cloudData - Rows keyed by table name, from downloadAllFromCloud
 * @param {string} dsId - The dataset ID
 * @param {Object} [options]
 * @param {string} [options.logSuffix] - Appended to warnings, to say which caller
 */
async function restoreAllFromCloud(
  cloudData: Record<string, CloudRecord[] | undefined>,
  dsId: SyncDatasetId,
  { logSuffix = '' }: { logSuffix?: string } = {}
): Promise<void> {
  const database = getDatabase(dsId);

  for (const entityType of RESTORE_ORDER) {
    const entity = getEntity(entityType);
    // RESTORE_ORDER is asserted by syncEngine.test.js to cover exactly the
    // manifest, so this cannot miss — but the type says it can, and a silent
    // skip here would drop an entity from every restore.
    if (!entity) throw new Error(`RESTORE_ORDER names "${entityType}", which is not in the manifest`);
    const rows = cloudData[entity.table] ?? [];
    if (rows.length === 0) continue;

    const restore: CloudRestorer = CLOUD_RESTORE[entityType]
      ?? (async (row) => {
        const table = tableByName(database, entity.table);
        if (!table) throw new Error(`No local table "${entity.table}"`);
        return table.put(row);
      });
    const mustSucceed = RESTORE_MUST_SUCCEED.has(entityType);

    for (const row of rows) {
      // `parseInt(x) || x` leaves a non-numeric id untouched instead of turning
      // it into NaN. It also mishandles id 0 — unreachable, because Dexie's
      // autoincrement never issues one. Was written out 42 times; now once.
      // `String()` because `parseInt` takes one; `parseInt(5)` coerced identically
      // at runtime, so this is the same value for every input including a
      // non-numeric id, which `|| row.id` leaves untouched.
      const data = { ...stripCloudFields(row), id: parseInt(String(row.id)) || row.id };

      if (mustSucceed) {
        await restore(data, dsId);
      } else {
        try {
          await restore(data, dsId);
        } catch (e) {
          logger.warn(`Could not restore ${entityType}${logSuffix}:`, e);
        }
      }
    }
  }
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
export async function initializeSync(userId: SyncUserId, datasetId: SyncDatasetId = DEFAULT_DATASET_ID) {
  if (!userId) {
    logger.warn('⚠️ No userId provided to initializeSync');
    return { status: 'no-user', data: null };
  }

  const dsId = datasetId || DEFAULT_DATASET_ID;

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

      const { data: localData, failed } = await collectLocalData(dsId);

      await syncAllToCloud(userId, dsId, localData);

      updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
      return {
        status: 'uploaded',
        data: {
          people: localPeople,
          houses: localHouses,
          relationships: localRelationships
        },
        // Empty unless a local table could not be read. Non-empty means what
        // reached the cloud is a partial snapshot of this dataset.
        unreadable: failed
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
    await restoreAllFromCloud(cloudData, dsId);


    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });

    return {
      status: 'downloaded',
      data: cloudData
    };

  } catch (error) {
    logger.error('❌ Sync initialization failed:', error);
    updateSyncStatus({ isSyncing: false, error: errorMessage(error) });

    // Don't throw - return error status so app can continue with local data
    return { status: 'error', error: errorMessage(error) };
  }
}

// ==================== SYNC WRAPPERS ====================

/**
 * The four positional arguments every sync wrapper takes, in order.
 *
 * Typing these is the single highest-value thing in this conversion. The shape
 * is `(userId, datasetId, localId, data)` and it has been got wrong before:
 * Phase 4 found live calls passing `(userId, id, data, datasetId)`, which put an
 * entity id where the dataset id belongs and spun up phantom
 * `LineageweaverDB_<id>` databases — a whole parallel world per mistyped call,
 * silently. Two `string | null` parameters side by side is exactly the shape a
 * transposition hides in, so the two that are *not* strings are now the wrong
 * type rather than merely the wrong position.
 */

/** A Firebase UID, or null/undefined when signed out. Wrappers queue either way. */
type SyncUserId = string | null | undefined;

/**
 * A dataset id as the wrappers receive it.
 *
 * `| undefined` because most callers hold an optional `datasetId` and pass it
 * straight through; `getDatabase` already treats undefined as the default
 * dataset. Making the wrappers reject it would push a `?? 'default'` to every
 * call site, which is the version of this that goes wrong.
 */
type SyncDatasetId = DatasetId | undefined;

/** A local Dexie key. Autoincrement integers in practice. */
type LocalId = number;

/** The row, or the changed fields of it, depending on the operation. */
type SyncData = Record<string, unknown>;

/**
 * Ids of the rows a writing or chapter delete cascaded to locally.
 *
 * Required rather than optional on the two wrappers that take it — see
 * `syncDeleteWriting`. `chapterIds` is absent for a chapter, which cascades
 * only to links.
 */
interface WritingCascade {
  chapterIds?: LocalId[];
  linkIds?: LocalId[];
}
// These wrap the local operations and add cloud sync

/**
 * Add a person (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} personId - The local person ID (after local add)
 * @param {Object} personData - The person data
 */
export async function syncAddPerson(userId: SyncUserId, datasetId: SyncDatasetId, personId: LocalId, personData: SyncData) {
  await syncOp('person', 'add', { userId, datasetId, id: personId, data: personData });
}

/**
 * Update a person (local + cloud)
 */
export async function syncUpdatePerson(userId: SyncUserId, datasetId: SyncDatasetId, personId: LocalId, updates: SyncData) {
  await syncOp('person', 'update', { userId, datasetId, id: personId, data: updates });
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
export async function syncDeletePerson(userId: SyncUserId, datasetId: SyncDatasetId, personId: LocalId, relationshipIds: LocalId[]= []) {
  // The manifest declares that deleting a person cascades to relationships, so
  // this is now the generic cascade rather than the one hand-written wrapper.
  // The relationship ids are passed in because the local cascade has already
  // run by the time this is called and the rows are gone.
  await syncDeleteCascade('person', {
    userId,
    datasetId,
    id: personId,
    cascaded: { relationship: relationshipIds }
  });
}

/**
 * Add a house (local + cloud)
 */
export async function syncAddHouse(userId: SyncUserId, datasetId: SyncDatasetId, houseId: LocalId, houseData: SyncData) {
  await syncOp('house', 'add', { userId, datasetId, id: houseId, data: houseData });
}

/**
 * Update a house (local + cloud)
 */
export async function syncUpdateHouse(userId: SyncUserId, datasetId: SyncDatasetId, houseId: LocalId, updates: SyncData) {
  await syncOp('house', 'update', { userId, datasetId, id: houseId, data: updates });
}

/**
 * Delete a house (local + cloud)
 */
export async function syncDeleteHouse(userId: SyncUserId, datasetId: SyncDatasetId, houseId: LocalId) {
  await syncOp('house', 'delete', { userId, datasetId, id: houseId });
}

/**
 * Add a relationship (local + cloud)
 */
export async function syncAddRelationship(userId: SyncUserId, datasetId: SyncDatasetId, relationshipId: LocalId, relationshipData: SyncData) {
  await syncOp('relationship', 'add', { userId, datasetId, id: relationshipId, data: relationshipData });
}

/**
 * Update a relationship (local + cloud)
 */
export async function syncUpdateRelationship(userId: SyncUserId, datasetId: SyncDatasetId, relationshipId: LocalId, updates: SyncData) {
  await syncOp('relationship', 'update', { userId, datasetId, id: relationshipId, data: updates });
}

/**
 * Delete a relationship (local + cloud)
 */
export async function syncDeleteRelationship(userId: SyncUserId, datasetId: SyncDatasetId, relationshipId: LocalId) {
  await syncOp('relationship', 'delete', { userId, datasetId, id: relationshipId });
}

/**
 * Add a codex entry (local + cloud)
 */
export async function syncAddCodexEntry(userId: SyncUserId, datasetId: SyncDatasetId, entryId: LocalId, entryData: SyncData) {
  await syncOp('codexEntry', 'add', { userId, datasetId, id: entryId, data: entryData });
}

/**
 * Update a codex entry (local + cloud)
 */
export async function syncUpdateCodexEntry(userId: SyncUserId, datasetId: SyncDatasetId, entryId: LocalId, updates: SyncData) {
  await syncOp('codexEntry', 'update', { userId, datasetId, id: entryId, data: updates });
}

/**
 * Delete a codex entry (local + cloud)
 */
export async function syncDeleteCodexEntry(userId: SyncUserId, datasetId: SyncDatasetId, entryId: LocalId) {
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
export async function syncAddCodexLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId, linkData: SyncData) {
  await syncOp('codexLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete codex link (local + cloud)
 */
export async function syncDeleteCodexLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId) {
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
export async function syncAddHeraldry(userId: SyncUserId, datasetId: SyncDatasetId, heraldryId: LocalId, heraldryData: SyncData) {
  await syncOp('heraldry', 'add', { userId, datasetId, id: heraldryId, data: heraldryData });
}

/**
 * Update heraldry (local + cloud)
 */
export async function syncUpdateHeraldry(userId: SyncUserId, datasetId: SyncDatasetId, heraldryId: LocalId, updates: SyncData) {
  await syncOp('heraldry', 'update', { userId, datasetId, id: heraldryId, data: updates });
}

/**
 * Delete heraldry (local + cloud)
 */
export async function syncDeleteHeraldry(userId: SyncUserId, datasetId: SyncDatasetId, heraldryId: LocalId) {
  await syncOp('heraldry', 'delete', { userId, datasetId, id: heraldryId });
}

/**
 * Add heraldry link (local + cloud)
 */
export async function syncAddHeraldryLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId, linkData: SyncData) {
  await syncOp('heraldryLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete heraldry link (local + cloud)
 */
export async function syncDeleteHeraldryLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId) {
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
export async function syncAddDignity(userId: SyncUserId, datasetId: SyncDatasetId, dignityId: LocalId, dignityData: SyncData) {
  await syncOp('dignity', 'add', { userId, datasetId, id: dignityId, data: dignityData });
}

/**
 * Update dignity (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} dignityId - The local id (after the local write)
 * @param {Object} updates - The changed fields
 */
export async function syncUpdateDignity(userId: SyncUserId, datasetId: SyncDatasetId, dignityId: LocalId, updates: SyncData) {
  await syncOp('dignity', 'update', { userId, datasetId, id: dignityId, data: updates });
}

/**
 * Delete dignity (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} dignityId - The local id
 */
export async function syncDeleteDignity(userId: SyncUserId, datasetId: SyncDatasetId, dignityId: LocalId) {
  await syncOp('dignity', 'delete', { userId, datasetId, id: dignityId });
}

/**
 * Add dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id (after the local write)
 * @param {Object} tenureData - The tenure data
 */
export async function syncAddDignityTenure(userId: SyncUserId, datasetId: SyncDatasetId, tenureId: LocalId, tenureData: SyncData) {
  await syncOp('dignityTenure', 'add', { userId, datasetId, id: tenureId, data: tenureData });
}

/**
 * Update dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id (after the local write)
 * @param {Object} updates - The changed fields
 */
export async function syncUpdateDignityTenure(userId: SyncUserId, datasetId: SyncDatasetId, tenureId: LocalId, updates: SyncData) {
  await syncOp('dignityTenure', 'update', { userId, datasetId, id: tenureId, data: updates });
}

/**
 * Delete dignity tenure (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} tenureId - The local id
 */
export async function syncDeleteDignityTenure(userId: SyncUserId, datasetId: SyncDatasetId, tenureId: LocalId) {
  await syncOp('dignityTenure', 'delete', { userId, datasetId, id: tenureId });
}

/**
 * Add dignity link (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} linkId - The local id (after the local write)
 * @param {Object} linkData - The link data
 */
export async function syncAddDignityLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId, linkData: SyncData) {
  await syncOp('dignityLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete dignity link (local + cloud)
 * @param {string|null} userId - The user's Firebase UID; null when signed out
 * @param {string|null} datasetId - The dataset ID
 * @param {number} linkId - The local id
 */
export async function syncDeleteDignityLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId) {
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
export async function syncAddHouseholdRole(userId: SyncUserId, datasetId: SyncDatasetId, roleId: LocalId, roleData: SyncData) {
  await syncOp('householdRole', 'add', { userId, datasetId, id: roleId, data: roleData });
}

/**
 * Update household role (local + cloud)
 */
export async function syncUpdateHouseholdRole(userId: SyncUserId, datasetId: SyncDatasetId, roleId: LocalId, updates: SyncData) {
  await syncOp('householdRole', 'update', { userId, datasetId, id: roleId, data: updates });
}

/**
 * Delete household role (local + cloud)
 */
export async function syncDeleteHouseholdRole(userId: SyncUserId, datasetId: SyncDatasetId, roleId: LocalId) {
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
export async function syncAddWriting(userId: SyncUserId, datasetId: SyncDatasetId, writingId: LocalId, writingData: SyncData) {
  await syncOp('writing', 'add', { userId, datasetId, id: writingId, data: writingData });
}

/**
 * Update writing (local + cloud)
 */
export async function syncUpdateWriting(userId: SyncUserId, datasetId: SyncDatasetId, writingId: LocalId, updates: SyncData) {
  await syncOp('writing', 'update', { userId, datasetId, id: writingId, data: updates });
}

/**
 * Delete writing (local + cloud)
 */
export async function syncDeleteWriting(userId: SyncUserId, datasetId: SyncDatasetId, writingId: LocalId, cascade: WritingCascade) {
  // Required, not defaulted. A default of `{}` would turn "the caller forgot
  // the cascade" into "this writing had no chapters" — which is the exact bug
  // step 6 exists to make unrepresentable. `deleteWriting` returns the ids.
  if (!cascade) {
    throw new Error(
      'syncDeleteWriting needs the cascade ids returned by deleteWriting(): ' +
      '{ chapterIds, linkIds }. Without them the chapters survive in the cloud ' +
      'and come back on the next download.'
    );
  }
  const { chapterIds = [], linkIds = [] } = cascade;
  await syncDeleteCascade('writing', {
    userId,
    datasetId,
    id: writingId,
    cascaded: { chapter: chapterIds, writingLink: linkIds }
  });
}

// ==================== CHAPTERS SYNC ====================

/**
 * Add chapter (local + cloud)
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} chapterId - The local chapter ID (after local add)
 * @param {Object} chapterData - The chapter data
 */
export async function syncAddChapter(userId: SyncUserId, datasetId: SyncDatasetId, chapterId: LocalId, chapterData: SyncData) {
  await syncOp('chapter', 'add', { userId, datasetId, id: chapterId, data: chapterData });
}

/**
 * Update chapter (local + cloud)
 */
export async function syncUpdateChapter(userId: SyncUserId, datasetId: SyncDatasetId, chapterId: LocalId, updates: SyncData) {
  await syncOp('chapter', 'update', { userId, datasetId, id: chapterId, data: updates });
}

/**
 * Delete chapter (local + cloud)
 */
export async function syncDeleteChapter(userId: SyncUserId, datasetId: SyncDatasetId, chapterId: LocalId, cascade: WritingCascade) {
  // Required for the same reason as syncDeleteWriting. `deleteChapter` returns
  // `linkIds`, and also `reorderedChapterIds` — those are updates rather than
  // cascade deletes, and the caller syncs them separately.
  if (!cascade) {
    throw new Error(
      'syncDeleteChapter needs the cascade ids returned by deleteChapter(): ' +
      '{ linkIds }. Without them the links survive in the cloud.'
    );
  }
  const { linkIds = [] } = cascade;
  await syncDeleteCascade('chapter', {
    userId,
    datasetId,
    id: chapterId,
    cascaded: { writingLink: linkIds }
  });
}

// ==================== WRITING LINKS SYNC ====================

/**
 * Add writing link (local + cloud)
 */
export async function syncAddWritingLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId, linkData: SyncData) {
  await syncOp('writingLink', 'add', { userId, datasetId, id: linkId, data: linkData });
}

/**
 * Delete writing link (local + cloud)
 */
export async function syncDeleteWritingLink(userId: SyncUserId, datasetId: SyncDatasetId, linkId: LocalId) {
  await syncOp('writingLink', 'delete', { userId, datasetId, id: linkId });
}

// ==================== PLANNING: STORY PLANS SYNC ====================

/**
 * Add story plan (local + cloud)
 */
export async function syncAddStoryPlan(userId: SyncUserId, datasetId: SyncDatasetId, planId: LocalId, planData: SyncData) {
  await syncOp('storyPlan', 'add', { userId, datasetId, id: planId, data: planData });
}

/**
 * Update story plan (local + cloud)
 */
export async function syncUpdateStoryPlan(userId: SyncUserId, datasetId: SyncDatasetId, planId: LocalId, updates: SyncData) {
  await syncOp('storyPlan', 'update', { userId, datasetId, id: planId, data: updates });
}

/**
 * Delete story plan (local + cloud)
 */
export async function syncDeleteStoryPlan(userId: SyncUserId, datasetId: SyncDatasetId, planId: LocalId) {
  await syncOp('storyPlan', 'delete', { userId, datasetId, id: planId });
}

// ==================== PLANNING: STORY ARCS SYNC ====================

/**
 * Add story arc (local + cloud)
 */
export async function syncAddStoryArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId, arcData: SyncData) {
  await syncOp('storyArc', 'add', { userId, datasetId, id: arcId, data: arcData });
}

/**
 * Update story arc (local + cloud)
 */
export async function syncUpdateStoryArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId, updates: SyncData) {
  await syncOp('storyArc', 'update', { userId, datasetId, id: arcId, data: updates });
}

/**
 * Delete story arc (local + cloud)
 */
export async function syncDeleteStoryArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId) {
  await syncOp('storyArc', 'delete', { userId, datasetId, id: arcId });
}

// ==================== PLANNING: STORY BEATS SYNC ====================

/**
 * Add story beat (local + cloud)
 */
export async function syncAddStoryBeat(userId: SyncUserId, datasetId: SyncDatasetId, beatId: LocalId, beatData: SyncData) {
  await syncOp('storyBeat', 'add', { userId, datasetId, id: beatId, data: beatData });
}

/**
 * Update story beat (local + cloud)
 */
export async function syncUpdateStoryBeat(userId: SyncUserId, datasetId: SyncDatasetId, beatId: LocalId, updates: SyncData) {
  await syncOp('storyBeat', 'update', { userId, datasetId, id: beatId, data: updates });
}

/**
 * Delete story beat (local + cloud)
 */
export async function syncDeleteStoryBeat(userId: SyncUserId, datasetId: SyncDatasetId, beatId: LocalId) {
  await syncOp('storyBeat', 'delete', { userId, datasetId, id: beatId });
}

// ==================== PLANNING: SCENE PLANS SYNC ====================

/**
 * Add scene plan (local + cloud)
 */
export async function syncAddScenePlan(userId: SyncUserId, datasetId: SyncDatasetId, sceneId: LocalId, sceneData: SyncData) {
  await syncOp('scenePlan', 'add', { userId, datasetId, id: sceneId, data: sceneData });
}

/**
 * Update scene plan (local + cloud)
 */
export async function syncUpdateScenePlan(userId: SyncUserId, datasetId: SyncDatasetId, sceneId: LocalId, updates: SyncData) {
  await syncOp('scenePlan', 'update', { userId, datasetId, id: sceneId, data: updates });
}

/**
 * Delete scene plan (local + cloud)
 */
export async function syncDeleteScenePlan(userId: SyncUserId, datasetId: SyncDatasetId, sceneId: LocalId) {
  await syncOp('scenePlan', 'delete', { userId, datasetId, id: sceneId });
}

// ==================== PLANNING: PLOT THREADS SYNC ====================

/**
 * Add plot thread (local + cloud)
 */
export async function syncAddPlotThread(userId: SyncUserId, datasetId: SyncDatasetId, threadId: LocalId, threadData: SyncData) {
  await syncOp('plotThread', 'add', { userId, datasetId, id: threadId, data: threadData });
}

/**
 * Update plot thread (local + cloud)
 */
export async function syncUpdatePlotThread(userId: SyncUserId, datasetId: SyncDatasetId, threadId: LocalId, updates: SyncData) {
  await syncOp('plotThread', 'update', { userId, datasetId, id: threadId, data: updates });
}

/**
 * Delete plot thread (local + cloud)
 */
export async function syncDeletePlotThread(userId: SyncUserId, datasetId: SyncDatasetId, threadId: LocalId) {
  await syncOp('plotThread', 'delete', { userId, datasetId, id: threadId });
}

// ==================== PLANNING: CHARACTER ARCS SYNC ====================

/**
 * Add character arc (local + cloud)
 */
export async function syncAddCharacterArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId, arcData: SyncData) {
  await syncOp('characterArc', 'add', { userId, datasetId, id: arcId, data: arcData });
}

/**
 * Update character arc (local + cloud)
 */
export async function syncUpdateCharacterArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId, updates: SyncData) {
  await syncOp('characterArc', 'update', { userId, datasetId, id: arcId, data: updates });
}

/**
 * Delete character arc (local + cloud)
 */
export async function syncDeleteCharacterArc(userId: SyncUserId, datasetId: SyncDatasetId, arcId: LocalId) {
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
export async function forceCloudSync(
  userId: SyncUserId,
  datasetId: SyncDatasetId = DEFAULT_DATASET_ID,
  options: { forceClear?: boolean } = {}
) {
  if (!userId) return { status: 'no-user' };

  const dsId = datasetId || DEFAULT_DATASET_ID;

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
    await restoreAllFromCloud(cloudData, dsId, { logSuffix: ' during force sync' });


    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
    return { status: 'success', data: cloudData };
  } catch (error) {
    updateSyncStatus({ isSyncing: false, error: errorMessage(error) });
    return { status: 'error', error: errorMessage(error) };
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
export async function forceUploadToCloud(userId: SyncUserId, datasetId: SyncDatasetId = DEFAULT_DATASET_ID) {
  if (!userId) return { status: 'no-user' };

  const dsId = datasetId || DEFAULT_DATASET_ID;

  updateSyncStatus({ isSyncing: true, error: null });

  try {
    logger.log('⬆️ Force uploading all local data to cloud...');

    // Gather all local data
    const { data: localData, failed } = await collectLocalData(dsId);

    // Upload everything, and remove cloud documents with no local counterpart.
    //
    // Pruning is what makes this function honest. Without it the upload was
    // upsert-only, so deleting fifty people offline and then forcing an upload
    // left all fifty in Firestore — and the clearSyncQueue below then destroyed
    // the pending deletes that would have removed them, so the next download
    // brought them all back.
    //
    // It only prunes when every local table was readable. A partial snapshot
    // must never be treated as the truth about what should exist, and
    // `pruneTargets` independently refuses any table the snapshot omitted.
    const snapshotComplete = failed.length === 0;
    if (!snapshotComplete) {
      logger.error(
        `⚠️ Skipping prune: could not read ${failed.join(', ')}. ` +
        'Cloud documents deleted locally will remain until a complete upload runs.'
      );
    }

    await syncAllToCloud(userId, dsId, localData, { prune: snapshotComplete });

    // Clear the sync queue since everything is now synced
    await clearSyncQueue(dsId);

    const counts = (table: string) => localData[table]?.length ?? 0;

    logger.log('✅ Force upload complete:', {
      people: counts('people'),
      houses: counts('houses'),
      relationships: counts('relationships'),
      codexEntries: counts('codexEntries'),
      writings: counts('writings'),
      // Empty unless a local table could not be read. Non-empty means the
      // upload was a partial snapshot, and says which tables are missing.
      unreadable: failed
    });

    updateSyncStatus({ isSyncing: false, lastSyncTime: new Date() });
    return {
      status: 'success',
      uploaded: {
        people: counts('people'),
        houses: counts('houses'),
        relationships: counts('relationships'),
        codexEntries: counts('codexEntries')
      },
      unreadable: failed
    };
  } catch (error) {
    logger.error('❌ Force upload failed:', error);
    updateSyncStatus({ isSyncing: false, error: errorMessage(error) });
    return { status: 'error', error: errorMessage(error) };
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
