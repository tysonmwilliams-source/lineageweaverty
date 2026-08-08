import Dexie from 'dexie';
import type { Table } from 'dexie';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import { syncedTables } from './syncManifest';
import type {
  AcknowledgedDuplicate,
  AppDatabase,
  DatasetId,
  House,
  HouseInput,
  Person,
  PersonInput,
  Relationship,
  RelationshipInput,
  SyncQueueEntry,
  UserId
} from './types';

type ContextNotifier = (
  entityType: string,
  operation: string,
  entity: unknown,
  datasetId?: DatasetId
) => void;

// Context notification - lazy loaded to avoid circular deps
let contextNotify: ContextNotifier | null = null;
async function notifyContextChange(
  entityType: string,
  operation: string,
  entity: unknown,
  datasetId?: DatasetId
): Promise<void> {
  try {
    if (!contextNotify) {
      const { notifyChange } = await import('./contextService.js');
      contextNotify = notifyChange;
    }
    contextNotify(entityType, operation, entity, datasetId);
  } catch {
    // Context service not available - silently skip
  }
}

/**
 * Database Service for Lineageweaver
 *
 * This file sets up IndexedDB (the browser's built-in database) using Dexie,
 * which is a wrapper that makes IndexedDB easier to work with.
 *
 * MULTI-DATASET SUPPORT:
 * Each dataset gets its own IndexedDB database named 'LineageweaverDB_{datasetId}'.
 * This ensures complete data isolation between datasets.
 *
 * Database instances are cached in a Map for performance.
 */

/**
 * A table looked up by a name computed at runtime.
 *
 * `AppDatabase` has no index signature, deliberately — it is what makes
 * `db.peopl` a compile error rather than a runtime undefined. The
 * manifest-driven loops are the one place that legitimately needs a table by
 * string, and the manifest's own test guarantees every name it yields is a real
 * store, so the cast is contained here rather than repeated at each loop.
 *
 * Still returns `undefined` for an absent table: an older database opened
 * before a store was added genuinely will not have it.
 */
function tableByName(database: AppDatabase, name: string): Table<unknown, number> | undefined {
  return (database as unknown as Record<string, Table<unknown, number> | undefined>)[name];
}

/**
 * Options for `addHouse`.
 *
 * Note the shape: `addHouse(data, options)` takes an **object** while
 * `addPerson(data, datasetId)` takes a bare string. That inconsistency is real
 * and long-standing (CLAUDE.md names it), and it is left alone here on purpose
 * — reconciling the two signatures is a behaviour change, and F4 conversions do
 * not carry those. Typing them is what makes it impossible to get wrong by
 * accident, which was most of the risk.
 */
export interface AddHouseOptions {
  /** Skip auto-creation of the Codex entry — used by cloud restore, to avoid duplicates. */
  skipCodexCreation?: boolean;
  datasetId?: DatasetId;
}

export interface DeleteHouseOptions {
  /** Skip cascade deletion of the Codex entry. */
  skipCodexDeletion?: boolean;
  datasetId?: DatasetId;
  /**
   * Propagates the cascading Codex delete to the cloud. Read by the body and
   * absent from the JSDoc that documented this function until now — without it
   * the deleted entry returns on the next download.
   */
  userId?: UserId;
}

/** Whether a person may found a cadet house, and which tier. */
export interface CeremonyEligibility {
  eligible: boolean;
  tier: number | null;
  reason: string | null;
}

export interface CadetCeremonyData {
  founderId: number;
  parentHouseId: number;
  houseName: string;
  ceremonyDate?: string | null;
  motto?: string | null;
  colorCode?: string | null;
  cadetTier?: number;
  foundingType?: string;
}

/** The envelope `exportFullDatabase` produces and `importFullDatabase` accepts. */
export interface FullBackup {
  format: string;
  formatVersion: number;
  schemaVersion: number;
  exportDate: string;
  datasetId: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
}

/** A stale queue entry, summarised for the log before it is deleted. */
export interface ArchivedSyncOperation {
  id: number;
  entityType: string;
  entityId: string;
  operation: string;
  timestamp: number;
  age: string;
}

export interface SyncQueueStats {
  totalPending: number;
  totalSynced: number;
  staleCount: number;
  recentCount: number;
  oldestPendingAge: string;
  healthy: boolean;
  error?: string;
}

// Default dataset ID
export const DEFAULT_DATASET_ID = 'default';

// Cache for database instances (one per dataset)
const dbInstances = new Map<string, AppDatabase>();

/**
 * Create and configure a new Dexie database instance
 *
 * This is the **one** place in the codebase where a bare `Dexie` becomes an
 * `AppDatabase` (decision F4). The stores are declared as version strings by
 * `applySchema`, not as class fields, so nothing about `db.people` is knowable
 * to a type-checker by inference — it has to be asserted exactly once, here, at
 * the point of construction, rather than at every call site that reads a table.
 *
 * @param datasetId - The dataset ID
 * @returns Configured database instance
 */
function createDatabaseInstance(datasetId: string): AppDatabase {
  const dbName = datasetId === DEFAULT_DATASET_ID
    ? 'LineageweaverDB'  // Backward compatible name for default dataset
    : `LineageweaverDB_${datasetId}`;

  const db = new Dexie(dbName) as AppDatabase;

  // Handle blocked database upgrades (multi-tab scenarios)
  // This fires when a database upgrade is needed but another tab has the DB open
  db.on('blocked', () => {
    logger.warn('⚠️ Database upgrade blocked by another tab');
    // Notify the user to close other tabs
    // This uses a custom event that the UI can listen for
    window.dispatchEvent(new CustomEvent('lineageweaver:db-blocked', {
      detail: {
        message: 'Please close other Lineageweaver tabs to complete the database upgrade.',
        database: dbName
      }
    }));
  });

  // Handle when this tab is blocking another tab's upgrade
  db.on('versionchange', (event) => {
    logger.log('📦 Database version change detected, closing connection...');
    db.close();
    // Notify the user that a reload is needed
    window.dispatchEvent(new CustomEvent('lineageweaver:db-versionchange', {
      detail: {
        message: 'Database updated in another tab. Please refresh to continue.',
        database: dbName
      }
    }));
  });

  // Apply all schema versions to this database instance
  applySchema(db);

  return db;
}

/**
 * Get a database instance for a specific dataset
 * Creates a new instance if one doesn't exist, otherwise returns cached instance.
 *
 * Accepts null as well as undefined, because that is what the service layer
 * passes: nearly every function in it defaults `datasetId` to `null`, and a
 * default parameter only fires for `undefined`. The `|| DEFAULT_DATASET_ID`
 * below is what actually handles it, and is why there is no
 * `LineageweaverDB_null` — worth knowing, given the phantom-database bugs
 * Phase 4 found from ids reaching this function by the wrong route.
 *
 * @param datasetId - The dataset ID
 * @returns Database instance for the dataset
 */
export function getDatabase(datasetId: DatasetId = DEFAULT_DATASET_ID): AppDatabase {
  const id = datasetId || DEFAULT_DATASET_ID;

  // One lookup instead of has()-then-get(): the Map never stores undefined, so
  // a miss and an absence are the same thing, and this needs no assertion to
  // prove the instance exists on the way out.
  let instance = dbInstances.get(id);
  if (!instance) {
    instance = createDatabaseInstance(id);
    dbInstances.set(id, instance);
    logger.log('📦 Created database instance for dataset:', id);
  }

  return instance;
}

/**
 * Close and remove a database instance from the cache
 * @param datasetId - The dataset ID
 */
export async function closeDatabaseInstance(datasetId: DatasetId): Promise<void> {
  const id = datasetId || DEFAULT_DATASET_ID;
  const instance = dbInstances.get(id);

  if (instance) {
    await instance.close();
    dbInstances.delete(id);
    logger.log('📦 Closed database instance for dataset:', id);
  }
}

/**
 * Delete an entire database for a dataset
 * WARNING: This permanently deletes all data!
 * @param datasetId - The dataset ID
 */
export async function deleteDatabaseForDataset(datasetId: DatasetId): Promise<void> {
  const id = datasetId || DEFAULT_DATASET_ID;
  const dbName = id === DEFAULT_DATASET_ID
    ? 'LineageweaverDB'
    : `LineageweaverDB_${id}`;

  // Close instance first if it exists
  await closeDatabaseInstance(id);

  // Delete the database
  await Dexie.delete(dbName);
  logger.log('📦 Deleted database for dataset:', id);
}

// Legacy export for backward compatibility
// This returns the default dataset's database
export const db = getDatabase(DEFAULT_DATASET_ID);

/**
 * Apply schema versions to a database instance
 * @param {Dexie} db - The database instance
 */
function applySchema(db: Dexie): void {

  // Version 1: Original schema
  db.version(1).stores({
    people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath',
    houses: '++id, houseName',
    relationships: '++id, person1Id, person2Id, relationshipType'
  });

  // Version 2: Add cadet house system fields
  db.version(2).stores({
    // Add indexes for new cadet house fields
    people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus',
    houses: '++id, houseName, parentHouseId, houseType',
    relationships: '++id, person1Id, person2Id, relationshipType'
  }).upgrade(tx => {
    // Upgrade existing houses to have new fields with default values
    return tx.table('houses').toCollection().modify(house => {
      house.parentHouseId = house.parentHouseId || null;
      house.houseType = house.houseType || 'main';
      house.foundedBy = house.foundedBy || null;
      house.foundedDate = house.foundedDate || null;
      house.swornTo = house.swornTo || null;
      house.namePrefix = house.namePrefix || null;
    });
  }).upgrade(tx => {
    // Upgrade existing people to have new bastardStatus field
    return tx.table('people').toCollection().modify(person => {
      // If they're a bastard but don't have bastardStatus, set to 'active'
      if (person.legitimacyStatus === 'bastard' && !person.bastardStatus) {
        person.bastardStatus = 'active';
      } else {
        person.bastardStatus = person.bastardStatus || null;
      }
    });
  });

  // Version 3: Add heraldry system fields
  db.version(3).stores({
    // No changes to indexes, just adding new fields through upgrade function
    people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfBirth, bastardStatus',
    houses: '++id, houseName, parentHouseId, houseType',
    relationships: '++id, person1Id, person2Id, relationshipType'
  }).upgrade(tx => {
    // Add heraldry fields to existing houses with default values
    return tx.table('houses').toCollection().modify(house => {
      // Heraldry image data (base64 encoded PNG, 200x200px, <100KB)
      house.heraldryImageData = house.heraldryImageData || null;

      // Source of heraldry: 'armoria', 'whisk', 'upload', 'composite'
      house.heraldrySource = house.heraldrySource || null;

      // Shield shape type: 'heater', 'french', 'spanish', 'english', 'swiss'
      house.heraldryShieldType = house.heraldryShieldType || 'heater';

      // Armoria seed for reproducibility (if generated via Armoria)
      house.heraldrySeed = house.heraldrySeed || null;

      // AI prompt (if generated via Whisk or other AI)
      house.heraldryPrompt = house.heraldryPrompt || null;

      // Metadata object for additional data (composition sources, version history, etc.)
      house.heraldryMetadata = house.heraldryMetadata || null;

      // Thumbnail version (40x40px base64) - auto-generated from main image
      house.heraldryThumbnail = house.heraldryThumbnail || null;

      // High-res version (400x400px base64) - original before compression
      house.heraldryHighRes = house.heraldryHighRes || null;
    });
  });

// Version 4: Add SVG support for infinite zoom quality
db.version(4).stores({
  // No changes to indexes, just adding new SVG fields through upgrade function
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfBirth, bastardStatus',
  houses: '++id, houseName, parentHouseId, houseType',
  relationships: '++id, person1Id, person2Id, relationshipType'
}).upgrade(tx => {
  // Add SVG heraldry fields for zoom support
  return tx.table('houses').toCollection().modify(house => {
    // Full SVG markup (when available) - PRIMARY for infinite zoom
    house.heraldrySVG = house.heraldrySVG || null;
    
    // Track format type: 'svg', 'png', 'composite'
    house.heraldryType = house.heraldryType || null;
    
    // Original SVG before shield masking (for re-processing)
    house.heraldrySourceSVG = house.heraldrySourceSVG || null;
  });
});

// Version 5: Add The Codex - Encyclopedia System
db.version(5).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  // New tables for The Codex
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type'
}).upgrade(tx => {
  // Add codexEntryId to existing people and houses
  return tx.table('people').toCollection().modify(person => {
    person.codexEntryId = person.codexEntryId || null;
  }).then(() => {
    return tx.table('houses').toCollection().modify(house => {
      house.codexEntryId = house.codexEntryId || null;
    });
  });
});

// Version 6: Add acknowledged duplicates for namesake handling
db.version(6).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  // New table for tracking acknowledged non-duplicates (namesakes)
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt'
});

// Version 7: Add The Armory - Heraldry System
// This creates a standalone heraldry table, separating heraldry from houses
// so heraldry can be its own major system like The Codex
db.version(7).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  // NEW: The Armory - Standalone heraldry system
  heraldry: '++id, name, category, *tags, created, updated',
  // Links heraldry to entities (houses, people, locations, events)
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType'
}).upgrade(tx => {
  // Add heraldryId to existing houses
  return tx.table('houses').toCollection().modify(house => {
    house.heraldryId = house.heraldryId || null;
  });
});

// Version 8: Add The Dignities System - Titles & Feudal Hierarchy
// Based on "The Codified Charter of Driht, Ward, and Service"
// This creates the fifth major system for tracking titles, dignities, and feudal bonds
db.version(8).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
});

// Version 9: Add Epithets System - Descriptive Bynames
// Epithets are descriptive names like "the Bold", "Dragonslayer", "the Wise"
// Stored as an array on people for flexibility and cross-system integration
db.version(9).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  // Dignities tables (from v8)
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
}).upgrade(tx => {
  // Add epithets array to existing people
  return tx.table('people').toCollection().modify(person => {
    // epithets: Array of epithet objects
    // Each epithet: { id, text, isPrimary, source, grantedById, earnedFrom, linkedEntityType, linkedEntityId, dateEarned, notes }
    person.epithets = person.epithets || [];
  });
});

// Version 10: Add Personal Arms - Heraldry Phase 4
// This allows individuals (not just houses) to have their own heraldic devices.
// Personal arms can be derived from house arms with cadency marks (triangles)
// to distinguish birth order among legitimate sons.
db.version(10).stores({
  // Add heraldryId to people for personal arms (quick access like houses have)
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
}).upgrade(tx => {
  // Add heraldryId to existing people
  // This field links directly to a heraldry record for quick access
  // (The heraldryLinks table still provides the full relationship details)
  return tx.table('people').toCollection().modify(person => {
    person.heraldryId = person.heraldryId || null;
  });
});

// Version 11: Add Bug Tracking System
// A global bug tracker accessible from anywhere in the app.
// Includes Claude Code export functionality for AI-assisted debugging.
// 
// WHAT THIS ADDS:
// - bugs: Table for storing bug reports with context
// - Indexes on status, priority for fast filtering
// - created index for chronological sorting
db.version(11).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  // NEW: Bug Tracking System
  bugs: '++id, title, status, priority, system, page, created, resolved'
});

// Version 12: Add Household Roles System
// Tracks non-hereditary household positions like Master-at-Arms, Steward, etc.
// These are service roles tied to a house, not hereditary titles.
db.version(12).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  // NEW: Household Roles System
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated'
});

// Version 13: Add Sync Queue for Data Loss Prevention
// Tracks all local changes pending cloud sync to prevent data loss on refresh.
// If pending changes exist, cloud-overwrite operations are blocked until sync completes.
db.version(13).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated',
  // NEW: Sync Queue - tracks pending changes for data loss prevention
  // entityType: 'person', 'house', 'relationship', 'codexEntry', 'heraldry', etc.
  // operation: 'add', 'update', 'delete'
  // synced: 0 (pending) or 1 (confirmed synced)
  syncQueue: '++id, entityType, entityId, operation, timestamp, synced'
});

// Version 14: Add Writing Studio - Creative Writing System
// A canon-aware creative writing environment integrated with world-building data.
// Supports novels, novellas, short stories with wiki-links to entities.
db.version(14).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated',
  syncQueue: '++id, entityType, entityId, operation, timestamp, synced',
  // NEW: Writing Studio tables
  // writings: Main writing projects (novels, novellas, short stories, notes)
  writings: '++id, title, type, status, *tags, createdAt, updatedAt',
  // chapters: Individual chapters within writings (minimum 1 per writing)
  chapters: '++id, writingId, order, createdAt, updatedAt',
  // writingLinks: Tracks [[wiki-link]] references to entities
  writingLinks: '++id, writingId, chapterId, targetType, targetId, createdAt'
});

// Version 15: Add Intelligent Writing Planner System
// A comprehensive story planning system with multi-level narrative structure support.
// Integrates with writings, codex, and genealogy for canon-aware planning.
db.version(15).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated',
  syncQueue: '++id, entityType, entityId, operation, timestamp, synced',
  writings: '++id, title, type, status, *tags, createdAt, updatedAt',
  chapters: '++id, writingId, order, createdAt, updatedAt',
  writingLinks: '++id, writingId, chapterId, targetType, targetId, createdAt',
  // NEW: Intelligent Writing Planner tables
  // storyPlans: Top-level planning container for a writing
  storyPlans: '++id, writingId, framework, *genre, createdAt, updatedAt',
  // storyArcs: Narrative arcs (main plot + subplots)
  storyArcs: '++id, storyPlanId, type, status, order, createdAt, updatedAt',
  // storyBeats: Framework-specific story beats (Save the Cat, Hero's Journey, etc.)
  storyBeats: '++id, storyPlanId, storyArcId, beatType, status, order, createdAt, updatedAt',
  // scenePlans: Detailed scene-level planning
  scenePlans: '++id, storyPlanId, chapterId, povCharacterId, status, order, createdAt, updatedAt',
  // characterArcs: Track character development through the story
  characterArcs: '++id, storyPlanId, characterId, arcType, status, createdAt, updatedAt',
  // plotThreads: Track narrative threads and their resolution
  plotThreads: '++id, storyPlanId, threadType, status, createdAt, updatedAt'
});

// Version 16: Add Context Library System
// Auto-generated, threshold-based context files for AI tools and reference.
// Dynamically discovers which houses qualify for their own context based on data volume.
// Tracks changes and auto-regenerates contexts when source data changes.
db.version(16).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated',
  syncQueue: '++id, entityType, entityId, operation, timestamp, synced',
  writings: '++id, title, type, status, *tags, createdAt, updatedAt',
  chapters: '++id, writingId, order, createdAt, updatedAt',
  writingLinks: '++id, writingId, chapterId, targetType, targetId, createdAt',
  storyPlans: '++id, writingId, framework, *genre, createdAt, updatedAt',
  storyArcs: '++id, storyPlanId, type, status, order, createdAt, updatedAt',
  storyBeats: '++id, storyPlanId, storyArcId, beatType, status, order, createdAt, updatedAt',
  scenePlans: '++id, storyPlanId, chapterId, povCharacterId, status, order, createdAt, updatedAt',
  characterArcs: '++id, storyPlanId, characterId, arcType, status, createdAt, updatedAt',
  plotThreads: '++id, storyPlanId, threadType, status, createdAt, updatedAt',
  // NEW: Context Library tables
  // contextRegistry: Master registry of all contexts (one per house that meets threshold, plus master)
  contextRegistry: '++id, contextId, contextType, houseId, status, lastGenerated, lastSourceChange, *tags',
  // contextFiles: Individual files within a context (people/breakmount.json, codex/locations.json, etc.)
  contextFiles: '++id, contextId, filePath, fileType, content, size, itemCount, generatedAt',
  // contextLog: History of context generation events for auditing
  contextLog: '++id, contextId, event, trigger, timestamp, duration, stats'
});
// Version 17: Add per-person allegiance for bastard-elevation cadet branches
// swornToHouseId on people allows individual members of bastard cadets (Dum/Dun prefix)
// to be sworn to different parent seats (e.g., one Dumwilfrey to Bramblehall, another to Fourhearth)
db.version(17).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId, swornToHouseId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated',
  syncQueue: '++id, entityType, entityId, operation, timestamp, synced',
  writings: '++id, title, type, status, *tags, createdAt, updatedAt',
  chapters: '++id, writingId, order, createdAt, updatedAt',
  writingLinks: '++id, writingId, chapterId, targetType, targetId, createdAt',
  storyPlans: '++id, writingId, framework, *genre, createdAt, updatedAt',
  storyArcs: '++id, storyPlanId, type, status, order, createdAt, updatedAt',
  storyBeats: '++id, storyPlanId, storyArcId, beatType, status, order, createdAt, updatedAt',
  scenePlans: '++id, storyPlanId, chapterId, povCharacterId, status, order, createdAt, updatedAt',
  characterArcs: '++id, storyPlanId, characterId, arcType, status, createdAt, updatedAt',
  plotThreads: '++id, storyPlanId, threadType, status, createdAt, updatedAt',
  contextRegistry: '++id, contextId, contextType, houseId, status, lastGenerated, lastSourceChange, *tags',
  contextFiles: '++id, contextId, filePath, fileType, content, size, itemCount, generatedAt',
  contextLog: '++id, contextId, event, trigger, timestamp, duration, stats'
}).upgrade(tx => {
  return tx.table('people').toCollection().modify(person => {
    person.swornToHouseId = person.swornToHouseId || null;
  });
});

// ============================================================================
// VERSION 18: Index the codexEntries back-references
// ============================================================================
// codexEntries carries personId / houseId / dignityId / heraldryId but none
// were indexed, so getEntryByPersonId and friends fell back to .filter() —
// a full deserialisation of every entry per lookup. In the cross-linking
// migration that runs 513 of those lookups over 403 entries, this measured
// 8,292ms; with the index it is ~4ms.
//
// Only the changed store is listed. Dexie inherits every unchanged table from
// the previous version, so there is no need to restate all 26 (which is how
// the dateOfDeath index went missing in v3/v4). No upgrade function is needed:
// adding an index makes Dexie re-index existing rows automatically.
db.version(18).stores({
  codexEntries: '++id, type, title, category, *tags, era, created, updated, personId, houseId, dignityId, heraldryId'
});

} // End of applySchema function

/**
 * Database Helper Functions
 * These are the CRUD operations (Create, Read, Update, Delete) for each entity
 *
 * All functions accept an optional datasetId parameter. If not provided,
 * they default to the 'default' dataset for backward compatibility.
 */

// ==================== PEOPLE OPERATIONS ====================

export async function addPerson(
  personData: PersonInput,
  datasetId?: DatasetId
): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const id = await database.people.add(personData);
    logger.log('Person added with ID:', id);

    // Notify context system
    notifyContextChange('person', 'create', { ...personData, id }, datasetId);

    return id;
  } catch (error) {
    logger.error('Error adding person:', error);
    throw error;
  }
}

export async function getPerson(
  id: number,
  datasetId?: DatasetId
): Promise<Person | undefined> {
  try {
    const database = getDatabase(datasetId);
    const person = await database.people.get(id);
    return person;
  } catch (error) {
    logger.error('Error getting person:', error);
    throw error;
  }
}

export async function getAllPeople(datasetId?: DatasetId): Promise<Person[]> {
  try {
    const database = getDatabase(datasetId);
    const people = await database.people.toArray();
    return people;
  } catch (error) {
    logger.error('Error getting all people:', error);
    throw error;
  }
}

/**
 * Get count of people without loading all data
 * More efficient than getAllPeople().length for stats
 */
export async function getPeopleCount(datasetId?: DatasetId): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    return await database.people.count();
  } catch (error) {
    logger.error('Error getting people count:', error);
    return 0;
  }
}

export async function getPeopleByHouse(
  houseId: number,
  datasetId?: DatasetId
): Promise<Person[]> {
  try {
    const database = getDatabase(datasetId);
    const people = await database.people.where('houseId').equals(houseId).toArray();
    return people;
  } catch (error) {
    logger.error('Error getting people by house:', error);
    throw error;
  }
}

/**
 * Push a renamed entity's name onto its linked Codex entry title.
 *
 * The Codex stores the title denormalized, so nothing kept it in step with the
 * person/house/dignity it describes. Two consequences, both silent: the Codex
 * kept showing the old name, and since wiki-links resolve on lowercased title,
 * `[[New Name]]` resolved to nothing while `[[Old Name]]` still worked.
 *
 * Deliberately a no-op when there is no linked entry, when the title is already
 * correct, or when the new name is empty — a half-typed rename must not blank a
 * Codex title. Failures are logged, never thrown: renaming a person must not be
 * blocked by Codex bookkeeping.
 *
 * @param {number|null} codexEntryId - The linked entry, if any
 * @param {string} newTitle - The title the entry should now have
 * @param {string} [datasetId]
 * @param {string} [userId] - When present, the title change is synced
 */
async function propagateNameToCodex(
  codexEntryId: number | null | undefined,
  newTitle: string | null | undefined,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<void> {
  if (!codexEntryId || !newTitle?.trim()) return;

  try {
    const database = getDatabase(datasetId);
    const entry = await database.codexEntries.get(codexEntryId);
    if (!entry || entry.title === newTitle) return;

    await database.codexEntries.update(codexEntryId, {
      title: newTitle,
      updated: new Date().toISOString()
    });
    logger.log(`📚 Codex title follows rename: "${entry.title}" → "${newTitle}"`);

    if (userId) {
      const { syncUpdateCodexEntry } = await import('./dataSyncService.js');
      try {
        await syncUpdateCodexEntry(userId, datasetId, codexEntryId, { title: newTitle });
      } catch (syncError) {
        logger.error('☁️ Failed to sync Codex title rename:', syncError);
      }
    }
  } catch (error) {
    logger.error('Error propagating rename to Codex:', error);
  }
}

export async function updatePerson(
  id: number,
  updates: Partial<Person>,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const result = await database.people.update(id, updates);
    logger.log('Person updated:', result);

    const person = await database.people.get(id);

    // Keep the linked Codex entry's title in step with the person's name.
    // The title is denormalized into codexEntries, so renaming a person used to
    // leave the Codex showing the old name — and because wiki-links resolve on
    // lowercased title, every [[New Name]] link silently failed to resolve while
    // [[Old Name]] kept working.
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      await propagateNameToCodex(
        person?.codexEntryId,
        `${person?.firstName || ''} ${person?.lastName || ''}`.trim(),
        datasetId,
        userId
      );
    }

    // Notify context system
    notifyContextChange('person', 'update', person, datasetId);

    return result;
  } catch (error) {
    logger.error('Error updating person:', error);
    throw error;
  }
}

export async function deletePerson(
  id: number,
  datasetId?: DatasetId
): Promise<{ deletedRelationships: number }> {
  try {
    const database = getDatabase(datasetId);

    // Get person before deleting for context notification
    const person = await database.people.get(id);

    // CASCADE DELETE: Remove all relationships involving this person
    // This prevents orphaned relationships when a person is deleted
    const relationshipsToDelete = await database.relationships
      .filter(rel => rel.person1Id === id || rel.person2Id === id)
      .toArray();

    if (relationshipsToDelete.length > 0) {
      const relationshipIds = relationshipsToDelete.map(r => r.id).filter((relId): relId is number => relId !== undefined);
      await database.relationships.bulkDelete(relationshipIds);
      logger.log(`Cascade deleted ${relationshipIds.length} relationships for person ${id}`);
    }

    // Now delete the person
    await database.people.delete(id);
    logger.log('Person deleted:', id);

    // Notify context system
    if (person) {
      notifyContextChange('person', 'delete', person, datasetId);
    }

    return { deletedRelationships: relationshipsToDelete.length };
  } catch (error) {
    logger.error('Error deleting person:', error);
    throw error;
  }
}

// ==================== HOUSE OPERATIONS ====================

/**
 * Add a new house with optional auto-creation of Codex entry
 *
 * @param {Object} houseData - House data to add
 * @param {Object} [options] - Options for house creation
 * @param {boolean} [options.skipCodexCreation=false] - Skip auto-creation of Codex entry
 * @param {string} [options.datasetId] - Dataset ID (optional, defaults to 'default')
 * @returns {Promise<number>} The new house ID
 */
export async function addHouse(
  houseData: HouseInput,
  options: AddHouseOptions = {}
): Promise<number> {
  try {
    const database = getDatabase(options.datasetId);
    const id = await database.houses.add(houseData);
    logger.log('House added with ID:', id);

    // Auto-create Codex entry for the house (unless explicitly skipped)
    // This is skipped during cloud sync restore to prevent duplicates
    if (!options.skipCodexCreation) {
      try {
        // Use dynamic import to avoid circular dependency
        const { createEntry, updateEntry } = await import('./codexService.js');

        // Create a Codex entry for this house
        const codexEntryId = await createEntry({
          type: 'house',
          title: (houseData.houseName ?? '').startsWith('House ') ? houseData.houseName ?? '' : `House ${houseData.houseName ?? ''}`,
          subtitle: houseData.houseType === 'cadet' ? 'Cadet Branch' : 'Noble House',
          content: houseData.notes || '',
          category: houseData.houseType || 'main',
          tags: ['house', houseData.houseType || 'main'].filter(Boolean),
          houseId: id
        }, options.datasetId);

        // Update the house with the codexEntryId
        await database.houses.update(id, { codexEntryId });
        logger.log('📚 Auto-created Codex entry for house:', codexEntryId);
      } catch (codexError) {
        // Log but don't fail the house creation if Codex creation fails
        logger.warn('⚠️ Could not auto-create Codex entry for house:', codexError);
      }
    }

    // Notify context system
    const house = await database.houses.get(id);
    notifyContextChange('house', 'create', house, options.datasetId);

    return id;
  } catch (error) {
    logger.error('Error adding house:', error);
    throw error;
  }
}

export async function getHouse(
  id: number,
  datasetId?: DatasetId
): Promise<House | undefined> {
  try {
    const database = getDatabase(datasetId);
    const house = await database.houses.get(id);
    return house;
  } catch (error) {
    logger.error('Error getting house:', error);
    throw error;
  }
}

export async function getAllHouses(datasetId?: DatasetId): Promise<House[]> {
  try {
    const database = getDatabase(datasetId);
    const houses = await database.houses.toArray();
    return houses;
  } catch (error) {
    logger.error('Error getting all houses:', error);
    throw error;
  }
}

/**
 * Get count of houses without loading all data
 * More efficient than getAllHouses().length for stats
 */
export async function getHousesCount(datasetId?: DatasetId): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    return await database.houses.count();
  } catch (error) {
    logger.error('Error getting houses count:', error);
    return 0;
  }
}

export async function getCadetHouses(
  parentHouseId: number,
  datasetId?: DatasetId
): Promise<House[]> {
  try {
    const database = getDatabase(datasetId);
    const cadetHouses = await database.houses
      .where('parentHouseId')
      .equals(parentHouseId)
      .toArray();
    return cadetHouses;
  } catch (error) {
    logger.error('Error getting cadet houses:', error);
    throw error;
  }
}

/**
 * Get all people personally sworn to a specific house.
 * These are members of bastard-elevation cadet branches who have individual allegiance.
 */
export async function getPeopleSwornToHouse(
  houseId: number,
  datasetId?: DatasetId
): Promise<Person[]> {
  try {
    const database = getDatabase(datasetId);
    return await database.people
      .where('swornToHouseId')
      .equals(houseId)
      .toArray();
  } catch (error) {
    logger.error('Error getting people sworn to house:', error);
    throw error;
  }
}

/**
 * Determine if a house is a bastard-elevation cadet branch.
 * Uses cadetTier/foundingType as primary, falls back to Dum/Dun name prefix for legacy data.
 */
export function isBastardCadet(house: House | null | undefined): boolean {
  if (!house) return false;
  if (house.cadetTier === 2 || house.foundingType === 'bastard-elevation') return true;
  if (house.cadetTier === 1) return false;
  // Fallback: name prefix for legacy data without cadetTier
  return /^(Dum|Dun)/i.test(house.houseName ?? '');
}

export async function updateHouse(
  id: number,
  updates: Partial<House>,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const result = await database.houses.update(id, updates);
    logger.log('House updated:', result);

    const house = await database.houses.get(id);

    // Same as updatePerson, using the "House X" convention addHouse applies when
    // it auto-creates the entry, so a rename can't drift from the original title.
    if (updates.houseName !== undefined) {
      const houseName = house?.houseName || '';
      await propagateNameToCodex(
        house?.codexEntryId,
        houseName.startsWith('House ') ? houseName : `House ${houseName}`,
        datasetId,
        userId
      );
    }

    // Notify context system
    notifyContextChange('house', 'update', house, datasetId);

    return result;
  } catch (error) {
    logger.error('Error updating house:', error);
    throw error;
  }
}

/**
 * Delete a house with cascade handling
 *
 * @param {number} id - House ID to delete
 * @param {Object} [options] - Options for deletion
 * @param {boolean} [options.skipCodexDeletion=false] - Skip cascade deletion of Codex entry
 * @param {string} [options.datasetId] - Dataset ID (optional, defaults to 'default')
 * @returns {Promise<Object>} Info about cascade operations
 */
export async function deleteHouse(
  id: number,
  options: DeleteHouseOptions = {}
): Promise<{
  clearedPeopleCount: number;
  clearedPersonIds: number[];
  deletedCodexEntryId: number | null;
}> {
  try {
    const database = getDatabase(options.datasetId);
    let clearedPeopleCount = 0;

    // Get house before deleting for context notification
    const house = await database.houses.get(id);

    // Clear houseId for all people belonging to this house
    // This prevents orphaned references when a house is deleted.
    // `houseId` is indexed, so use the index rather than a full table scan.
    const peopleInHouse = await database.people
      .where('houseId')
      .equals(id)
      .toArray();

    const clearedPersonIds = peopleInHouse.map(p => p.id);

    if (peopleInHouse.length > 0) {
      await database.people.where('houseId').equals(id).modify({ houseId: null });
      clearedPeopleCount = peopleInHouse.length;
      logger.log(`Cleared houseId for ${clearedPeopleCount} people from house ${id}`);
    }

    // Cascade delete Codex entry if it exists (unless explicitly skipped)
    let deletedCodexEntryId = null;
    if (!options.skipCodexDeletion) {
      try {
        // Use dynamic import to avoid circular dependency
        const { getEntryByHouseId, deleteEntry } = await import('./codexService.js');

        // Find and delete the associated Codex entry
        const codexEntry = await getEntryByHouseId(id, options.datasetId);
        if (codexEntry) {
          await deleteEntry(codexEntry.id, options.datasetId, options.userId);
          deletedCodexEntryId = codexEntry.id;
          logger.log('📚 Cascade deleted Codex entry for house:', codexEntry.id);
        }
      } catch (codexError) {
        // Log but don't fail the house deletion if Codex deletion fails
        logger.warn('⚠️ Could not cascade delete Codex entry for house:', codexError);
      }
    }

    await database.houses.delete(id);
    logger.log('House deleted:', id);

    // Notify context system
    if (house) {
      notifyContextChange('house', 'delete', house, options.datasetId);
    }

    // Callers need the affected ids so they can propagate the cascade to the
    // cloud and to React state. Without them, the next download restored every
    // member's houseId and the orphaned Codex entry.
    return { clearedPeopleCount, clearedPersonIds, deletedCodexEntryId };
  } catch (error) {
    logger.error('Error deleting house:', error);
    throw error;
  }
}

// ==================== RELATIONSHIP OPERATIONS ====================

/**
 * Add a new relationship with validation
 *
 * For parent-child relationships, validates that:
 * 1. No self-reference (person cannot be their own parent)
 * 2. No circular ancestry (would create impossible loop)
 *
 * @param {Object} relationshipData - Relationship data to add
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} The new relationship ID
 * @throws {Error} If validation fails (circular reference, self-reference)
 */
export async function addRelationship(
  relationshipData: RelationshipInput,
  datasetId?: DatasetId
): Promise<number> {
  try {
    const database = getDatabase(datasetId);

    // Validate parent-child relationships for circular references
    // Import dynamically to avoid circular dependency
    const { detectCircularAncestry, LINEAGE_RELATIONSHIP_TYPES } =
      await import('../utils/dataIntegrity.js');

    // This guard used to test for 'parent-child', which the app never writes,
    // so it never ran and nothing prevented a person becoming their own
    // grandparent.
    if (LINEAGE_RELATIONSHIP_TYPES.includes(relationshipData.relationshipType)) {
      const parentId = relationshipData.person1Id;
      const childId = relationshipData.person2Id;

      // Check self-reference
      if (parentId === childId) {
        throw new Error('A person cannot be their own parent');
      }

      // Get all existing relationships to check for circular references
      const allRelationships = await database.relationships.toArray();

      // Signature is (childId, proposedParentId, ...) — the arguments were
      // also passed the wrong way round here.
      const circularCheck = detectCircularAncestry(childId, parentId, allRelationships);

      if (circularCheck.isCircular) {
        const pathStr = (circularCheck.path ?? []).join(' → ');
        throw new Error(`Cannot create parent-child relationship: would cause circular ancestry (${pathStr})`);
      }
    }

    const id = await database.relationships.add(relationshipData);
    logger.log('Relationship added with ID:', id);

    // Notify context system
    notifyContextChange('relationship', 'create', { ...relationshipData, id }, datasetId);

    return id;
  } catch (error) {
    logger.error('Error adding relationship:', error);
    throw error;
  }
}

export async function getRelationshipsForPerson(
  personId: number,
  datasetId?: DatasetId
): Promise<Relationship[]> {
  try {
    const database = getDatabase(datasetId);
    const relationships = await database.relationships
      .where('person1Id').equals(personId)
      .or('person2Id').equals(personId)
      .toArray();
    return relationships;
  } catch (error) {
    logger.error('Error getting relationships:', error);
    throw error;
  }
}

export async function getAllRelationships(datasetId?: DatasetId): Promise<Relationship[]> {
  try {
    const database = getDatabase(datasetId);
    const relationships = await database.relationships.toArray();
    return relationships;
  } catch (error) {
    logger.error('Error getting all relationships:', error);
    throw error;
  }
}

/**
 * Get count of relationships without loading all data
 * More efficient than getAllRelationships().length for stats
 */
export async function getRelationshipsCount(datasetId?: DatasetId): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    return await database.relationships.count();
  } catch (error) {
    logger.error('Error getting relationships count:', error);
    return 0;
  }
}

export async function updateRelationship(
  id: number,
  updates: Partial<Relationship>,
  datasetId?: DatasetId
): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const result = await database.relationships.update(id, updates);
    logger.log('Relationship updated:', result);
    return result;
  } catch (error) {
    logger.error('Error updating relationship:', error);
    throw error;
  }
}

export async function deleteRelationship(id: number, datasetId?: DatasetId): Promise<void> {
  try {
    const database = getDatabase(datasetId);

    // Get relationship before deleting for context notification
    const relationship = await database.relationships.get(id);

    await database.relationships.delete(id);
    logger.log('Relationship deleted:', id);

    // Notify context system
    if (relationship) {
      notifyContextChange('relationship', 'delete', relationship, datasetId);
    }
  } catch (error) {
    logger.error('Error deleting relationship:', error);
    throw error;
  }
}

// ==================== CADET HOUSE OPERATIONS ====================

export function calculateAge(dateOfBirth: string | number | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * Check if a person is eligible to found a cadet house
 * 
 * TIER 1 (Noble Cadet) eligibility:
 * - Must be legitimate
 * - Must be at least 18
 * - Must not have already founded a house
 * - Typically second/third sons (not enforced here)
 * 
 * TIER 2 (Bastard Elevation) eligibility:
 * - Must be a bastard
 * - Must be at least 18
 * - Must not have already founded a house (bastardStatus !== 'founded')
 * - Must not have been legitimized (bastardStatus !== 'legitimized')
 * 
 * @param {Object} person - Person object
 * @param {string} person.dateOfBirth - Date of birth
 * @param {string} person.legitimacyStatus - Legitimacy status
 * @param {string} [person.bastardStatus] - Bastard status if applicable
 * @returns {{eligible: boolean, tier: number|null, reason: string|null}}
 */
export function isEligibleForCeremony(person: Person): CeremonyEligibility {
  // Must have a birth date
  if (!person.dateOfBirth) {
    return { eligible: false, tier: null, reason: 'No birth date recorded' };
  }
  
  // Must be at least 18
  const age = calculateAge(person.dateOfBirth);
  // `null < 18` was already true by coercion, so this is the same branch —
  // written out because the coercion was doing load-bearing work invisibly.
  if (age === null || age < 18) {
    return { eligible: false, tier: null, reason: `Must be at least 18 (currently ${age})` };
  }
  
  // Check for bastards (Tier 2)
  if (person.legitimacyStatus === 'bastard') {
    // Already founded a house
    if (person.bastardStatus === 'founded') {
      return { eligible: false, tier: null, reason: 'Already founded a cadet house' };
    }
    // Already legitimized (no longer a bastard)
    if (person.bastardStatus === 'legitimized') {
      return { eligible: false, tier: null, reason: 'Has been legitimized' };
    }
    // Eligible for Tier 2
    return { eligible: true, tier: 2, reason: null };
  }
  
  // Check for legitimate nobles (Tier 1)
  if (person.legitimacyStatus === 'legitimate') {
    // Must belong to a house
    if (!person.houseId) {
      return { eligible: false, tier: null, reason: 'Must belong to a noble house' };
    }
    // Eligible for Tier 1
    return { eligible: true, tier: 1, reason: null };
  }
  
  // Other statuses (adopted, commoner, unknown) are not eligible
  return { eligible: false, tier: null, reason: `Cannot found house with status: ${person.legitimacyStatus}` };
}

/**
 * Legacy function for backward compatibility
 * Returns boolean instead of object
 * @deprecated Use isEligibleForCeremony(person).eligible instead
 */
export function canFoundCadetHouse(person: Person): boolean {
  return isEligibleForCeremony(person).eligible;
}

/**
 * Found a cadet house - supports two-tier system
 * 
 * TIER 1 - Noble Cadet Branch:
 * - Founder: Legitimate second/third son
 * - Naming: First 4 letters of parent house + suffix (e.g., Wilfford)
 * - Status: Full noble standing
 * 
 * TIER 2 - Bastard Elevation Branch:
 * - Founder: Acknowledged bastard who has proven themselves
 * - Naming: "Dun" + first 4 letters + suffix (e.g., Dunwilfhollow)
 * - Status: Recognized but lesser standing, bastard origins visible
 * 
 * @param {Object} ceremonyData - Ceremony details
 * @param {number} ceremonyData.founderId - ID of the person founding the house
 * @param {string} ceremonyData.houseName - Name of the new house
 * @param {number} ceremonyData.parentHouseId - ID of the parent house
 * @param {number} [ceremonyData.cadetTier] - 1 for noble cadet, 2 for bastard elevation
 * @param {string} [ceremonyData.foundingType] - 'noble' or 'bastard-elevation'
 * @param {string} [ceremonyData.ceremonyDate] - Date of founding (ISO format)
 * @param {string} [ceremonyData.motto] - House motto
 * @param {string} [ceremonyData.colorCode] - House color (hex)
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<{house: Object, founder: Object}>}
 */
export async function foundCadetHouse(
  ceremonyData: CadetCeremonyData,
  datasetId?: DatasetId
): Promise<{ house: House | undefined; founder: Person | undefined }> {
  const {
    founderId,
    houseName,
    parentHouseId,
    cadetTier = 1,
    foundingType = 'noble',
    ceremonyDate,
    motto = null,
    colorCode = null
  } = ceremonyData;

  try {
    const founder = await getPerson(founderId, datasetId);
    if (!founder) {
      throw new Error('Founder not found');
    }

    const parentHouse = await getHouse(parentHouseId, datasetId);
    if (!parentHouse) {
      throw new Error('Parent house not found');
    }

    // Determine if this is a bastard-founded house
    const isBastardFounded = cadetTier === 2 || foundingType === 'bastard-elevation' || founder.legitimacyStatus === 'bastard';
    const actualTier = isBastardFounded ? 2 : 1;
    const actualFoundingType = isBastardFounded ? 'bastard-elevation' : 'noble';

    // Build notes based on tier
    const tierDescription = actualTier === 2 
      ? `Bastard-elevated branch of ${parentHouse.houseName}` 
      : `Cadet branch of ${parentHouse.houseName}`;

    const newHouseId = await addHouse({
      houseName: houseName,
      parentHouseId: parentHouseId,
      houseType: 'cadet',
      cadetTier: actualTier,
      foundingType: actualFoundingType,
      foundedBy: founderId,
      foundedDate: ceremonyDate,
      swornTo: parentHouseId,
      namePrefix: parentHouse.namePrefix || (parentHouse.houseName ?? '').substring(0, 4),
      sigil: null,
      motto: motto,
      colorCode: colorCode || parentHouse.colorCode,
      notes: `${tierDescription}, founded by ${founder.firstName} ${founder.lastName}`
    }, { datasetId });

    // Update founder - for bastard elevation, they become legitimate within their new house
    // but the Dun- prefix in the house name marks their origins
    await updatePerson(founderId, {
      houseId: newHouseId,
      lastName: houseName,
      bastardStatus: isBastardFounded ? 'founded' : null,
      legitimacyStatus: 'legitimate' // Now legitimate as head of their own house
    }, datasetId);

    const newHouse = await getHouse(newHouseId, datasetId);
    const updatedFounder = await getPerson(founderId, datasetId);

    logger.log(`🏰 Founded ${actualTier === 2 ? 'Tier 2 (Bastard Elevation)' : 'Tier 1 (Noble Cadet)'} house: ${houseName}`);

    return {
      house: newHouse,
      founder: updatedFounder
    };
  } catch (error) {
    logger.error('Error founding cadet house:', error);
    throw error;
  }
}

// ==================== FULL BACKUP ====================

/**
 * Tables excluded from a full backup.
 *
 * `syncQueue` is transient bookkeeping and restoring it would replay stale
 * operations. The `context*` tables are a derived search/context index that
 * contextService regenerates from the primary data.
 */
const BACKUP_EXCLUDED_TABLES = new Set([
  'syncQueue',
  'contextRegistry',
  'contextFiles',
  'contextLog'
]);

export const FULL_BACKUP_FORMAT = 'lineageweaver-full-backup';
export const FULL_BACKUP_FORMAT_VERSION = 1;

/**
 * Dump every table in a dataset, verbatim.
 *
 * Tables are enumerated from the live Dexie schema rather than a hand-written
 * list, and rows are copied whole rather than field-whitelisted. The previous
 * export covered 4 of 26 tables and dropped fields within those four (notably
 * `parentHouseId`, which flattened every cadet branch on restore) while the UI
 * described it as "a complete backup".
 *
 * @param {string} [datasetId]
 * @returns {Promise<Object>} Backup envelope with a `tables` map
 */
export async function exportFullDatabase(datasetId?: DatasetId): Promise<FullBackup> {
  const database = getDatabase(datasetId);

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of database.tables) {
    if (BACKUP_EXCLUDED_TABLES.has(table.name)) continue;
    const rows = await table.toArray();
    tables[table.name] = rows;
    counts[table.name] = rows.length;
  }

  return {
    format: FULL_BACKUP_FORMAT,
    formatVersion: FULL_BACKUP_FORMAT_VERSION,
    schemaVersion: database.verno,
    exportDate: new Date().toISOString(),
    datasetId: datasetId || 'default',
    counts,
    tables
  };
}

/**
 * Restore a full backup produced by exportFullDatabase().
 *
 * Runs inside a single transaction so a mid-import failure rolls back rather
 * than leaving a half-populated world. Unknown tables in the file are skipped
 * (forward compatibility) and reported.
 *
 * @param {Object} backup - Parsed backup envelope
 * @param {string} [datasetId]
 * @param {Object} [options]
 * @param {boolean} [options.replace=true] - Clear each table before writing
 * @returns {Promise<Object>} { restored: {table: count}, skipped: string[] }
 */
export async function importFullDatabase(
  backup: FullBackup | null | undefined,
  datasetId?: DatasetId,
  options: { replace?: boolean } = {}
): Promise<{ restored: Record<string, number>; skipped: string[] }> {
  const { replace = true } = options;

  if (!backup || backup.format !== FULL_BACKUP_FORMAT || !backup.tables) {
    throw new Error('Not a Lineageweaver full backup file');
  }

  const database = getDatabase(datasetId);
  const known = new Map(database.tables.map(t => [t.name, t]));

  const incoming = Object.keys(backup.tables).filter(
    name => known.has(name) && !BACKUP_EXCLUDED_TABLES.has(name)
  );
  const skipped = Object.keys(backup.tables).filter(name => !incoming.includes(name));

  const restored: Record<string, number> = {};

  // Resolved once, as [name, table] pairs, rather than re-fetched three times
  // per iteration. `incoming` was already filtered on `known.has(name)`, so the
  // filter below removes nothing — it is how that guarantee is stated to the
  // type-checker without an assertion.
  const targets = incoming
    .map(name => [name, known.get(name)] as const)
    .filter((pair): pair is [string, NonNullable<(typeof pair)[1]>] => pair[1] !== undefined);

  await database.transaction('rw', targets.map(([, table]) => table), async () => {
    for (const [name, table] of targets) {
      const rows = backup.tables[name] || [];
      if (replace) await table.clear();
      if (rows.length > 0) await table.bulkPut(rows);
      restored[name] = rows.length;
    }
  });

  logger.log('📦 Full backup restored:', restored);
  if (skipped.length > 0) {
    logger.warn('📦 Skipped unknown tables in backup:', skipped);
  }

  return { restored, skipped };
}

// ==================== DELETE ALL DATA ====================

/**
 * Delete all data from all tables
 *
 * IMPORTANT: This clears ALL tables including Codex data.
 * Used primarily during cloud sync when downloading fresh data.
 *
 * NOTE: syncQueue is intentionally NOT cleared - it tracks pending changes
 * that must be preserved to prevent data loss.
 *
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 * @param {Object} [options] - Options
 * @param {boolean} [options.clearSyncQueue=false] - Also clear sync queue (only after successful full sync)
 */
export async function deleteAllData(
  datasetId?: DatasetId,
  options: { clearSyncQueue?: boolean; includeLocalOnly?: boolean } = {}
): Promise<boolean> {
  try {
    const database = getDatabase(datasetId);

    // Clear every table that participates in cloud sync.
    //
    // Was twenty hand-written `.clear()` lines — the fourth of the four
    // divergent entity lists (sync manifest, step 2). Driving it from the
    // manifest means a new entity is cleared on the download path the moment it
    // is declared. Forgetting that line is how a table keeps stale rows that
    // the restore then duplicates.
    //
    // The three `context*` tables are deliberately not cleared here, which is a
    // documented quirk rather than an oversight: contextService regenerates
    // them from the primary data.
    for (const name of syncedTables()) {
      await tableByName(database, name)?.clear();
    }

    // `acknowledgedDuplicates` and `bugs` are local-only: neither appears in
    // syncAllToCloud or downloadAllFromCloud. Clearing them on the cloud-restore
    // path (which is most calls) destroyed them permanently with nothing to
    // restore from, so they are only cleared for a deliberate user-initiated
    // wipe, which passes includeLocalOnly.
    if (options.includeLocalOnly) {
      await database.acknowledgedDuplicates.clear();
      if (database.bugs) await database.bugs.clear();
    }

    // Only clear syncQueue if explicitly requested (after successful full sync)
    if (options.clearSyncQueue && database.syncQueue) {
      await database.syncQueue.clear();
      logger.log('✅ All data deleted including sync queue');
    } else {
      logger.log('✅ All data deleted successfully (sync queue preserved)');
    }

    return true;
  } catch (error) {
    logger.error('❌ Error deleting all data:', error);
    throw error;
  }
}

/**
 * Delete only genealogy data (people, houses, relationships)
 * Preserves Codex entries - useful for some operations
 *
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function deleteGenealogyData(datasetId?: DatasetId): Promise<boolean> {
  try {
    const database = getDatabase(datasetId);
    await database.people.clear();
    await database.houses.clear();
    await database.relationships.clear();
    await database.acknowledgedDuplicates.clear();

    logger.log('✅ Genealogy data deleted (Codex preserved)');
    return true;
  } catch (error) {
    logger.error('❌ Error deleting genealogy data:', error);
    throw error;
  }
}

// ==================== ACKNOWLEDGED DUPLICATES (NAMESAKES) ====================

/**
 * Check if two people have been acknowledged as not-duplicates
 * Returns true if they've been acknowledged (in either direction)
 *
 * @param {number} person1Id - First person ID
 * @param {number} person2Id - Second person ID
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function isAcknowledgedDuplicate(
  person1Id: number,
  person2Id: number,
  datasetId?: DatasetId
): Promise<boolean> {
  try {
    const database = getDatabase(datasetId);
    const found = await database.acknowledgedDuplicates
      .where('person1Id').equals(person1Id)
      .and(item => item.person2Id === person2Id)
      .first();

    if (found) return true;

    // Check reverse direction
    const foundReverse = await database.acknowledgedDuplicates
      .where('person1Id').equals(person2Id)
      .and(item => item.person2Id === person1Id)
      .first();

    return !!foundReverse;
  } catch (error) {
    logger.error('Error checking acknowledged duplicate:', error);
    return false;
  }
}

/**
 * Get all acknowledged duplicate pairs
 *
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function getAllAcknowledgedDuplicates(
  datasetId?: DatasetId
): Promise<AcknowledgedDuplicate[]> {
  try {
    const database = getDatabase(datasetId);
    return await database.acknowledgedDuplicates.toArray();
  } catch (error) {
    logger.error('Error getting acknowledged duplicates:', error);
    return [];
  }
}

/**
 * Acknowledge that two people are NOT duplicates (they're namesakes)
 * This prevents future duplicate warnings for this pair
 *
 * @param {number} person1Id - First person ID
 * @param {number} person2Id - Second person ID
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function acknowledgeDuplicate(
  person1Id: number,
  person2Id: number,
  datasetId?: DatasetId
): Promise<number | null> {
  try {
    const database = getDatabase(datasetId);

    // Check if already acknowledged
    const exists = await isAcknowledgedDuplicate(person1Id, person2Id, datasetId);
    if (exists) {
      logger.log('Duplicate already acknowledged');
      return null;
    }

    const id = await database.acknowledgedDuplicates.add({
      // `parseInt(number)` was a no-op that only worked because parseInt
      // stringifies first. Both parameters are ids and are already numbers.
      person1Id,
      person2Id,
      acknowledgedAt: new Date().toISOString()
    });

    logger.log('Duplicate acknowledged with ID:', id);
    return id;
  } catch (error) {
    logger.error('Error acknowledging duplicate:', error);
    throw error;
  }
}

/**
 * Remove an acknowledged duplicate (if you want warnings again)
 *
 * @param {number} person1Id - First person ID
 * @param {number} person2Id - Second person ID
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function removeAcknowledgedDuplicate(
  person1Id: number,
  person2Id: number,
  datasetId?: DatasetId
): Promise<boolean> {
  try {
    const database = getDatabase(datasetId);

    // Delete in both directions
    await database.acknowledgedDuplicates
      .where('person1Id').equals(person1Id)
      .and(item => item.person2Id === person2Id)
      .delete();

    await database.acknowledgedDuplicates
      .where('person1Id').equals(person2Id)
      .and(item => item.person2Id === person1Id)
      .delete();

    logger.log('Acknowledged duplicate removed');
    return true;
  } catch (error) {
    logger.error('Error removing acknowledged duplicate:', error);
    throw error;
  }
}

/**
 * Get all "named-after" relationships for a person
 * These are relationships where relationshipType === 'named-after'
 *
 * @param {number} personId - Person ID
 * @param {string} [datasetId] - Dataset ID (optional, defaults to 'default')
 */
export async function getNamedAfterRelationships(
  personId: number,
  datasetId?: DatasetId
): Promise<{ namedAfter: Relationship[]; namesakes: Relationship[] }> {
  try {
    const database = getDatabase(datasetId);
    const relationships = await database.relationships
      .where('person1Id').equals(personId)
      .and(item => item.relationshipType === 'named-after')
      .toArray();

    // Also check reverse (person is the one someone was named after)
    const reverseRelationships = await database.relationships
      .where('person2Id').equals(personId)
      .and(item => item.relationshipType === 'named-after')
      .toArray();

    return {
      namedAfter: relationships,      // People this person was named after
      namesakes: reverseRelationships  // People named after this person
    };
  } catch (error) {
    logger.error('Error getting named-after relationships:', error);
    return { namedAfter: [], namesakes: [] };
  }
}

// ==================== SYNC QUEUE OPERATIONS ====================
// These functions manage the pending changes queue for data loss prevention

/**
 * Add a change to the sync queue (called before each local operation)
 *
 * @param {Object} change - The change to track
 * @param {string} change.entityType - Type: 'person', 'house', 'relationship', etc.
 * @param {number|string} change.entityId - The entity's local ID
 * @param {string} change.operation - Operation: 'add', 'update', 'delete'
 * @param {Object} [change.data] - Optional data snapshot for add/update operations
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} The sync queue entry ID
 */
export async function addToSyncQueue(
  change: {
    entityType: string;
    entityId: number | string;
    operation: string;
    data?: unknown;
  },
  datasetId?: DatasetId
): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const entry = {
      entityType: change.entityType,
      entityId: String(change.entityId),
      operation: change.operation,
      data: change.data || null,
      timestamp: Date.now(),
      synced: 0 as const // 0 = pending, 1 = synced
    };
    const id = await database.syncQueue.add(entry);
    logger.log(`📝 Queued ${change.operation} for ${change.entityType}:${change.entityId}`);
    return id;
  } catch (error) {
    logger.error('Error adding to sync queue:', error);
    throw error;
  }
}

/**
 * Mark a sync queue entry as synced (called after cloud confirms)
 *
 * @param {number} queueId - The sync queue entry ID
 * @param {string} [datasetId] - Dataset ID
 */
export async function markSynced(queueId: number, datasetId?: DatasetId): Promise<void> {
  try {
    const database = getDatabase(datasetId);
    await database.syncQueue.update(queueId, { synced: 1 });
    logger.log(`✓ Marked queue entry ${queueId} as synced`);
  } catch (error) {
    logger.error('Error marking as synced:', error);
  }
}

/**
 * Mark **every** pending sync queue entry for an entity as synced.
 *
 * **This has no call sites, and confirming a cloud write is not one.** It was
 * how all 56 sync wrappers used to confirm a write, and it is why a second edit
 * made while the first was still uploading was marked synced without ever being
 * sent — see the note in `syncEngine.ts`. Use `markSynced(queueId)` to confirm a
 * write; `addToSyncQueue` returns the id you need.
 *
 * Kept because "retire every pending row for this entity" is a coherent
 * operation for queue maintenance to want. If nothing has claimed it by the
 * time the sync refactor finishes, delete it.
 *
 * @param {string} entityType - The entity type
 * @param {number|string} entityId - The entity ID
 * @param {string} [datasetId] - Dataset ID
 */
export async function markEntitySynced(
  entityType: string,
  entityId: number | string,
  datasetId?: DatasetId
): Promise<void> {
  try {
    const database = getDatabase(datasetId);
    await database.syncQueue
      .where('entityType').equals(entityType)
      .and(item => item.entityId === String(entityId) && item.synced === 0)
      .modify({ synced: 1 });
    logger.log(`✓ Marked ${entityType}:${entityId} as synced`);
  } catch (error) {
    logger.error('Error marking entity as synced:', error);
  }
}

/**
 * Get all pending (unsynced) changes from the queue
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of pending changes
 */
export async function getPendingChanges(datasetId?: DatasetId): Promise<SyncQueueEntry[]> {
  try {
    const database = getDatabase(datasetId);
    const pending = await database.syncQueue
      .where('synced').equals(0)
      .toArray();
    return pending;
  } catch (error) {
    logger.error('Error getting pending changes:', error);
    return [];
  }
}

/**
 * Check if there are any pending (unsynced) changes
 * CRITICAL: Used to block cloud-overwrite operations
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<boolean>} True if pending changes exist
 */
export async function hasPendingChanges(datasetId?: DatasetId): Promise<boolean> {
  try {
    const database = getDatabase(datasetId);
    const count = await database.syncQueue
      .where('synced').equals(0)
      .count();
    return count > 0;
  } catch (error) {
    logger.error('Error checking pending changes:', error);
    return false; // Fail open to avoid blocking users
  }
}

/**
 * Get count of pending changes (for UI display)
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Count of pending changes
 */
export async function getPendingChangeCount(datasetId?: DatasetId): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const count = await database.syncQueue
      .where('synced').equals(0)
      .count();
    return count;
  } catch (error) {
    logger.error('Error getting pending change count:', error);
    return 0;
  }
}

/**
 * Clear all synced entries from the queue (cleanup)
 * Should be called periodically or after successful full sync
 *
 * On failure this reports 0 rather than throwing: the delete is transactional,
 * so a thrown error means nothing was removed, and 0 is the honest count. It
 * does not throw because the only caller, performSyncQueueMaintenance, runs
 * stale *pending* cleanup in the step after this one — and stale pending
 * entries are what the startup data-loss guard reads. A failure to tidy up
 * already-synced rows must not skip that. The error is still reported:
 * logger.error is the one level that is not a DEV-only no-op.
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Rows deleted; 0 if the delete failed
 */
export async function clearSyncedItems(datasetId?: DatasetId): Promise<number> {
  try {
    const database = getDatabase(datasetId);
    const deleted = await database.syncQueue
      .where('synced').equals(1)
      .delete();
    logger.log(`🧹 Cleared ${deleted} synced items from queue`);
    return deleted;
  } catch (error) {
    logger.error('Error clearing synced items:', error);
    return 0;
  }
}

/**
 * Clear entire sync queue (use with caution - only after verified full sync)
 *
 * @param {string} [datasetId] - Dataset ID
 */
export async function clearSyncQueue(datasetId?: DatasetId): Promise<void> {
  try {
    const database = getDatabase(datasetId);
    await database.syncQueue.clear();
    logger.log('🧹 Sync queue cleared');
  } catch (error) {
    logger.error('Error clearing sync queue:', error);
  }
}

/**
 * Get pending changes grouped by entity type (for debugging/UI)
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Object with entity types as keys and arrays of changes as values
 */
export async function getPendingChangesByType(datasetId?: DatasetId): Promise<Record<string, SyncQueueEntry[]>> {
  try {
    const pending = await getPendingChanges(datasetId);
    const grouped: Record<string, SyncQueueEntry[]> = {};
    for (const change of pending) {
      const bucket = grouped[change.entityType] ?? (grouped[change.entityType] = []);
      bucket.push(change);
    }
    return grouped;
  } catch (error) {
    logger.error('Error grouping pending changes:', error);
    return {};
  }
}

// ==================== SYNC QUEUE MAINTENANCE ====================

/**
 * Default maximum age for stale operations (24 hours)
 * Operations older than this are considered "dead" and should be cleaned up
 */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up stale pending operations from the sync queue
 *
 * Stale operations are those that:
 * 1. Have been pending for longer than the threshold
 * 2. Are likely to never succeed (network issues, deleted accounts, etc.)
 *
 * This prevents the sync queue from growing indefinitely when operations fail.
 *
 * @param {string} [datasetId] - Dataset ID
 * @param {number} [maxAgeMs=24h] - Maximum age in milliseconds before operation is considered stale
 * @returns {Promise<{ deleted: number, archived: Array }>} Cleanup results
 */
export async function cleanupStaleSyncOperations(
  datasetId?: DatasetId,
  maxAgeMs: number = STALE_THRESHOLD_MS
): Promise<{ deleted: number; archived: ArchivedSyncOperation[]; error?: string }> {
  try {
    const database = getDatabase(datasetId);
    const cutoffTime = Date.now() - maxAgeMs;

    // Find stale operations
    const staleOperations = await database.syncQueue
      .where('synced').equals(0)
      .and(item => item.timestamp < cutoffTime)
      .toArray();

    if (staleOperations.length === 0) {
      return { deleted: 0, archived: [] };
    }

    // Archive the stale operations (for debugging)
    const archived = staleOperations.map(op => ({
      id: op.id,
      entityType: op.entityType,
      entityId: op.entityId,
      operation: op.operation,
      timestamp: op.timestamp,
      age: Math.round((Date.now() - op.timestamp) / 1000 / 60 / 60) + ' hours'
    }));

    logger.warn(`⚠️ Found ${staleOperations.length} stale sync operations (older than ${maxAgeMs / 1000 / 60 / 60} hours)`);
    logger.warn('Archived operations:', archived);

    // Delete stale operations
    const staleIds = staleOperations.map(op => op.id);
    await database.syncQueue.bulkDelete(staleIds);

    logger.log(`🧹 Cleaned up ${staleIds.length} stale sync operations`);

    return { deleted: staleIds.length, archived };
  } catch (error) {
    logger.error('Error cleaning up stale sync operations:', error);
    return { deleted: 0, archived: [], error: errorMessage(error) };
  }
}

/**
 * Get sync queue health statistics
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Queue statistics
 */
export async function getSyncQueueStats(datasetId?: DatasetId): Promise<SyncQueueStats> {
  try {
    const database = getDatabase(datasetId);

    const totalPending = await database.syncQueue
      .where('synced').equals(0)
      .count();

    const totalSynced = await database.syncQueue
      .where('synced').equals(1)
      .count();

    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    // Get pending items and calculate age distribution
    const pendingItems = await database.syncQueue
      .where('synced').equals(0)
      .toArray();

    const staleCount = pendingItems.filter(item => item.timestamp < oneDayAgo).length;
    const recentCount = pendingItems.filter(item => item.timestamp > oneHourAgo).length;

    // Find oldest pending item
    const oldestPending = pendingItems.reduce(
      (oldest, item) => (item.timestamp < oldest ? item.timestamp : oldest),
      now
    );

    return {
      totalPending,
      totalSynced,
      staleCount,
      recentCount,
      oldestPendingAge: pendingItems.length > 0
        ? Math.round((now - oldestPending) / 1000 / 60) + ' minutes'
        : 'none',
      healthy: staleCount === 0 && totalPending < 100
    };
  } catch (error) {
    logger.error('Error getting sync queue stats:', error);
    return {
      totalPending: 0,
      totalSynced: 0,
      staleCount: 0,
      recentCount: 0,
      oldestPendingAge: 'unknown',
      healthy: false,
      error: errorMessage(error)
    };
  }
}

/**
 * Perform full sync queue maintenance
 *
 * 1. Clears successfully synced items
 * 2. Cleans up stale pending operations
 * 3. Returns health statistics
 *
 * Should be called periodically (e.g., on app startup or after successful sync)
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Maintenance results
 */
export async function performSyncQueueMaintenance(datasetId?: DatasetId) {
  try {
    logger.log('🔧 Running sync queue maintenance...');

    // 1. Clear synced items
    const clearedSynced = await clearSyncedItems(datasetId);

    // 2. Clean up stale pending operations
    const staleCleanup = await cleanupStaleSyncOperations(datasetId);

    // 3. Get current stats
    const stats = await getSyncQueueStats(datasetId);

    logger.log('✅ Sync queue maintenance complete:', {
      clearedSynced,
      clearedStale: staleCleanup.deleted,
      currentStats: stats
    });

    return {
      clearedSynced,
      clearedStale: staleCleanup.deleted,
      archivedStale: staleCleanup.archived,
      stats
    };
  } catch (error) {
    logger.error('Error during sync queue maintenance:', error);
    return { error: errorMessage(error) };
  }
}

export default db;
