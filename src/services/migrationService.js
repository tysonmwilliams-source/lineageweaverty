/**
 * Migration Service - Data Integration Migrations
 *
 * PURPOSE:
 * Handles data migrations for integrating existing records with new systems.
 * Run these migrations after upgrading to ensure full data connectivity.
 *
 * PERFORMANCE:
 * - Migration status is cached in localStorage to skip expensive checks
 * - Each migration has a version number; migrations only run if version is newer
 * - Use forceMigration=true to bypass cache for debugging
 *
 * MIGRATIONS:
 * - migrateHousesToCodex: Creates Codex entries for houses without them
 * - migrateDignitiesToCodex: Creates Codex entries for dignities without them
 * - runAllMigrations: Runs all pending migrations
 */

import { db, getDatabase, DEFAULT_DATASET_ID } from './database';

// ==================== MIGRATION VERSION CACHE ====================

// Current migration version - bump this when adding new migrations
const MIGRATION_VERSION = 3;

// LocalStorage key for migration cache
const MIGRATION_CACHE_KEY = 'lineageweaver-migration-version';

/**
 * Get cached migration version for a user/dataset
 * @param {string} userId
 * @param {string} datasetId
 * @returns {number} Cached version or 0 if not found
 */
function getCachedMigrationVersion(userId, datasetId) {
  try {
    const cache = JSON.parse(localStorage.getItem(MIGRATION_CACHE_KEY) || '{}');
    const key = `${userId}_${datasetId}`;
    return cache[key] || 0;
  } catch {
    return 0;
  }
}

/**
 * Set cached migration version for a user/dataset
 * @param {string} userId
 * @param {string} datasetId
 * @param {number} version
 */
function setCachedMigrationVersion(userId, datasetId, version) {
  try {
    const cache = JSON.parse(localStorage.getItem(MIGRATION_CACHE_KEY) || '{}');
    const key = `${userId}_${datasetId}`;
    cache[key] = version;
    localStorage.setItem(MIGRATION_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    logger.warn('Failed to cache migration version:', error);
  }
}

/**
 * Check if migrations need to run based on cached version
 * @param {string} userId
 * @param {string} datasetId
 * @returns {boolean} True if migrations should run
 */
export function needsMigrationCheck(userId, datasetId) {
  const cachedVersion = getCachedMigrationVersion(userId, datasetId);
  return cachedVersion < MIGRATION_VERSION;
}
import {
  createEntry,
  createLink,
  getEntryByPersonId,
  getEntryByHouseId,
  getEntryByDignityId,
  getOutgoingLinks,
  getAllEntries,
  updateEntry
} from './codexService';
import { getAllDignities, updateDignity, DIGNITY_CLASSES, DIGNITY_NATURES } from './dignityService';
import { syncAddCodexLink } from './dataSyncService';
import {
  createDataset,
  getDataset,
  setActiveDatasetId,
  DEFAULT_DATASET_ID as DATASET_DEFAULT_ID
} from './datasetService';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch
} from 'firebase/firestore';
import { db as firestoreDb } from '../config/firebase';
import { logger } from '../utils/logger';
import { LEGACY_FLAT_COLLECTIONS } from './syncManifest';

// ==================== HOUSE → CODEX MIGRATION ====================

/**
 * Migrate existing houses to have Codex entries
 *
 * Finds all houses that don't have a codexEntryId and creates
 * Codex entries for them.
 *
 * @returns {Promise<Object>} Migration results
 */
export async function migrateHousesToCodex() {
  logger.log('📚 Starting House → Codex migration...');

  const results = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: []
  };

  try {
    const houses = await db.houses.toArray();
    results.total = houses.length;

    for (const house of houses) {
      try {
        // Skip if already has codexEntryId
        if (house.codexEntryId) {
          results.skipped++;
          continue;
        }

        // Check if a Codex entry already exists for this house (by houseId)
        const existingEntry = await getEntryByHouseId(house.id);
        if (existingEntry) {
          // Link the existing entry to the house
          await db.houses.update(house.id, { codexEntryId: existingEntry.id });
          results.skipped++;
          logger.log(`📚 House "${house.houseName}" already has Codex entry, linked.`);
          continue;
        }

        // Create a new Codex entry for this house
        const codexEntryId = await createEntry({
          type: 'house',
          title: house.houseName.startsWith('House ') ? house.houseName : `House ${house.houseName}`,
          subtitle: house.houseType === 'cadet' ? 'Cadet Branch' : 'Noble House',
          content: house.notes || '',
          category: house.houseType || 'main',
          tags: ['house', house.houseType || 'main'].filter(Boolean),
          houseId: house.id
        });

        // Update the house with the codexEntryId
        await db.houses.update(house.id, { codexEntryId });

        results.migrated++;
        logger.log(`📚 Created Codex entry for House "${house.houseName}": ${codexEntryId}`);

      } catch (error) {
        results.errors.push({
          houseId: house.id,
          houseName: house.houseName,
          error: error.message
        });
        logger.error(`❌ Error migrating house "${house.houseName}":`, error);
      }
    }

    logger.log(`📚 House → Codex migration complete:`, results);
    return results;

  } catch (error) {
    logger.error('❌ House → Codex migration failed:', error);
    throw error;
  }
}

// ==================== DIGNITY → CODEX MIGRATION ====================

/**
 * Migrate existing dignities to have Codex entries
 *
 * Finds all dignities that don't have a codexEntryId and creates
 * Codex entries for them.
 *
 * @returns {Promise<Object>} Migration results
 */
export async function migrateDignitiesToCodex() {
  logger.log('📚 Starting Dignity → Codex migration...');

  const results = {
    total: 0,
    migrated: 0,
    skipped: 0,
    errors: []
  };

  try {
    const dignities = await getAllDignities();
    results.total = dignities.length;

    for (const dignity of dignities) {
      try {
        // Skip if already has codexEntryId
        if (dignity.codexEntryId) {
          results.skipped++;
          continue;
        }

        // Check if a Codex entry already exists for this dignity (by dignityId)
        const existingEntry = await getEntryByDignityId(dignity.id);
        if (existingEntry) {
          // Link the existing entry to the dignity
          await updateDignity(dignity.id, { codexEntryId: existingEntry.id });
          results.skipped++;
          logger.log(`📚 Dignity "${dignity.name}" already has Codex entry, linked.`);
          continue;
        }

        // Create a new Codex entry for this dignity
        const codexEntryId = await createEntry({
          type: 'mysteria',
          title: dignity.name,
          subtitle: dignity.dignityRank
            ? `${DIGNITY_CLASSES[dignity.dignityClass]?.name || dignity.dignityClass} Dignity`
            : 'Dignity',
          content: dignity.notes || '',
          category: dignity.dignityClass || 'driht',
          tags: ['dignity', dignity.dignityClass, dignity.dignityRank].filter(Boolean),
          dignityId: dignity.id
        });

        // Update the dignity with the codexEntryId
        await updateDignity(dignity.id, { codexEntryId });

        results.migrated++;
        logger.log(`📚 Created Codex entry for Dignity "${dignity.name}": ${codexEntryId}`);

      } catch (error) {
        results.errors.push({
          dignityId: dignity.id,
          dignityName: dignity.name,
          error: error.message
        });
        logger.error(`❌ Error migrating dignity "${dignity.name}":`, error);
      }
    }

    logger.log(`📚 Dignity → Codex migration complete:`, results);
    return results;

  } catch (error) {
    logger.error('❌ Dignity → Codex migration failed:', error);
    throw error;
  }
}

// ==================== CROSS-LINKING MIGRATIONS ====================

/**
 * Build a Set-based index from an array of codex links for O(1) existence checks.
 * Keys use min:max ID ordering so bidirectional links are found regardless of direction.
 *
 * @param {Array} allLinks - Array of codex link records from the DB
 * @returns {Set<string>} Set of normalized keys like "member-of:42:108"
 */
function buildLinkIndex(allLinks) {
  const index = new Set();
  for (const link of allLinks) {
    const a = Number(link.sourceId);
    const b = Number(link.targetId);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    index.add(`${link.type}:${lo}:${hi}`);
  }
  return index;
}

/**
 * O(1) check whether a link of the given type exists between two entries.
 *
 * @param {Set<string>} linkIndex - Index built by buildLinkIndex()
 * @param {number} sourceId
 * @param {number} targetId
 * @param {string} linkType
 * @returns {boolean}
 */
function linkExistsInIndex(linkIndex, sourceId, targetId, linkType) {
  const a = Number(sourceId);
  const b = Number(targetId);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return linkIndex.has(`${linkType}:${lo}:${hi}`);
}

/**
 * Check if a link of a specific type already exists between two Codex entries
 * Handles bidirectional links correctly by checking both directions
 *
 * @param {number} sourceId - Source entry ID (e.g., person)
 * @param {number} targetId - Target entry ID (e.g., house)
 * @param {string} linkType - The type of link to check for
 * @returns {Promise<boolean>} True if link of that type exists
 */
async function linkExistsOfType(sourceId, targetId, linkType) {
  // Ensure consistent ID types for comparison
  const sourceIdNum = Number(sourceId);
  const targetIdNum = Number(targetId);

  // Get all codex links directly from DB for accurate check
  const allLinks = await db.codexLinks.toArray();

  // Check for the specific link in either direction
  return allLinks.some(link => {
    if (link.type !== linkType) return false;

    const linkSourceId = Number(link.sourceId);
    const linkTargetId = Number(link.targetId);

    // Case 1: Direct link (source → target)
    if (linkSourceId === sourceIdNum && linkTargetId === targetIdNum) {
      return true;
    }

    // Case 2: Reverse bidirectional link (target → source with bidirectional flag)
    if (link.bidirectional && linkSourceId === targetIdNum && linkTargetId === sourceIdNum) {
      return true;
    }

    return false;
  });
}

/**
 * Create bidirectional link between two Codex entries if it doesn't exist
 *
 * @param {number} entryId1 - First entry ID
 * @param {number} entryId2 - Second entry ID
 * @param {string} type - Link type
 * @param {string} label - Link label
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @param {Set<string>|null} linkIndex - Optional pre-built index for O(1) lookups
 * @returns {Promise<boolean>} True if link was created
 */
async function createBidirectionalLink(entryId1, entryId2, type, label, syncContext = null, linkIndex = null) {
  if (!entryId1 || !entryId2 || entryId1 === entryId2) return false;

  // Use index for O(1) check if provided, otherwise fall back to DB query
  const exists = linkIndex
    ? linkExistsInIndex(linkIndex, entryId1, entryId2, type)
    : await linkExistsOfType(entryId1, entryId2, type);
  if (exists) return false;

  const linkData = {
    sourceId: entryId1,
    targetId: entryId2,
    type,
    label,
    bidirectional: true
  };

  const linkId = await createLink(linkData);

  // Add to index so subsequent checks in the same batch are correct
  if (linkIndex) {
    const a = Number(entryId1);
    const b = Number(entryId2);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    linkIndex.add(`${type}:${lo}:${hi}`);
  }

  // Sync to cloud if userId is provided
  if (syncContext?.userId && linkId) {
    syncAddCodexLink(syncContext.userId, syncContext.datasetId, linkId, linkData);
  }

  return true;
}

// ==================== DIGNITY NATURE MIGRATION ====================

/**
 * Migrate existing dignities to have dignityNature field
 *
 * Converts legacy isHereditary boolean to the new dignityNature system:
 * - Knights (sir class) → 'personal-honour'
 * - Non-hereditary non-knights → 'office'
 * - Hereditary titles → 'territorial'
 *
 * Also initializes grant tracking fields (grantedById, grantedByDignityId, grantDate)
 * as null for existing records.
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @returns {Promise<Object>} Migration results
 */
export async function migrateDignityNatures(syncContext = null) {
  logger.log('📜 Starting Dignity Nature migration...');

  const results = {
    total: 0,
    migrated: 0,
    skipped: 0,
    byNature: {
      territorial: 0,
      office: 0,
      'personal-honour': 0,
      courtesy: 0
    },
    errors: []
  };

  try {
    const dignities = await getAllDignities();
    results.total = dignities.length;

    for (const dignity of dignities) {
      try {
        // Skip if already has dignityNature set
        if (dignity.dignityNature && DIGNITY_NATURES[dignity.dignityNature]) {
          results.skipped++;
          results.byNature[dignity.dignityNature] = (results.byNature[dignity.dignityNature] || 0) + 1;
          continue;
        }

        // Determine nature from existing data
        let nature = 'territorial'; // Default

        // Knights are personal honours
        if (dignity.dignityClass === 'sir') {
          nature = 'personal-honour';
        }
        // Non-hereditary non-knights are likely offices
        else if (dignity.isHereditary === false) {
          nature = 'office';
        }
        // Everything else is territorial (hereditary land-based)

        // Update the dignity with nature and empty grant tracking fields
        const updates = {
          dignityNature: nature,
          // Initialize grant tracking fields if not present
          grantedById: dignity.grantedById || null,
          grantedByDignityId: dignity.grantedByDignityId || null,
          grantDate: dignity.grantDate || null
        };

        await updateDignity(dignity.id, updates, syncContext?.userId, syncContext?.datasetId);

        results.migrated++;
        results.byNature[nature] = (results.byNature[nature] || 0) + 1;
        logger.log(`📜 Migrated "${dignity.name}" → ${nature}`);

      } catch (error) {
        logger.error(`❌ Error migrating dignity "${dignity.name}":`, error);
        results.errors.push({
          dignityId: dignity.id,
          dignityName: dignity.name,
          error: error.message
        });
      }
    }

    logger.log(`📜 Dignity Nature migration complete: ${results.migrated} migrated, ${results.skipped} skipped`);
    logger.log('📜 By nature:', results.byNature);

    return results;

  } catch (error) {
    logger.error('❌ Dignity Nature migration failed:', error);
    results.errors.push({ type: 'general', error: error.message });
    return results;
  }
}

// ==================== CROSS-LINKING MIGRATIONS ====================

/**
 * Migrate Person ↔ House Codex cross-links
 *
 * Creates links between a person's Codex entry and their house's Codex entry.
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @returns {Promise<Object>} Migration results
 */
export async function migratePersonHouseLinks(syncContext = null) {
  logger.log('🔗 Starting Person ↔ House cross-linking...');

  const results = {
    total: 0,
    linked: 0,
    skipped: 0,
    skippedNoHouse: 0,
    skippedNoPersonEntry: 0,
    skippedNoHouseEntry: 0,
    skippedLinkExists: 0,
    errors: []
  };

  try {
    const people = await db.people.toArray();
    results.total = people.length;

    // Build link index once for O(1) existence checks
    const allLinks = await db.codexLinks.toArray();
    const linkIndex = buildLinkIndex(allLinks);

    for (const person of people) {
      try {
        // Skip if person has no house
        if (!person.houseId) {
          results.skipped++;
          results.skippedNoHouse++;
          continue;
        }

        // Get person's Codex entry
        const personEntry = await getEntryByPersonId(person.id);
        if (!personEntry) {
          results.skipped++;
          results.skippedNoPersonEntry++;
          continue;
        }

        // Get house's Codex entry
        const houseEntry = await getEntryByHouseId(person.houseId);
        if (!houseEntry) {
          results.skipped++;
          results.skippedNoHouseEntry++;
          continue;
        }

        // Create bidirectional link
        const created = await createBidirectionalLink(
          personEntry.id,
          houseEntry.id,
          'member-of',
          'House Member',
          syncContext,
          linkIndex
        );

        if (created) {
          results.linked++;
          logger.log(`🔗 Linked ${person.firstName} ${person.lastName} ↔ House Codex entry`);
        } else {
          results.skipped++;
          results.skippedLinkExists++;
        }

      } catch (error) {
        results.errors.push({
          personId: person.id,
          personName: `${person.firstName} ${person.lastName}`,
          error: error.message
        });
      }
    }

    logger.log('🔗 Person ↔ House cross-linking complete:', {
      total: results.total,
      linked: results.linked,
      skipped: results.skipped,
      errors: results.errors.length
    });
    return results;

  } catch (error) {
    logger.error('❌ Person ↔ House cross-linking failed:', error);
    throw error;
  }
}

/**
 * Migrate Person ↔ Dignity Codex cross-links
 *
 * Creates links between a person's Codex entry and their dignity's Codex entry.
 * Links current holders of dignities.
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @returns {Promise<Object>} Migration results
 */
export async function migratePersonDignityLinks(syncContext = null) {
  logger.log('🔗 Starting Person ↔ Dignity cross-linking...');

  const results = {
    total: 0,
    linked: 0,
    skipped: 0,
    errors: []
  };

  try {
    const dignities = await getAllDignities();
    results.total = dignities.length;

    // Build link index once for O(1) existence checks
    const allLinks = await db.codexLinks.toArray();
    const linkIndex = buildLinkIndex(allLinks);

    for (const dignity of dignities) {
      try {
        // Skip if dignity has no current holder
        if (!dignity.currentHolderId) {
          results.skipped++;
          continue;
        }

        // Get dignity's Codex entry
        const dignityEntry = await getEntryByDignityId(dignity.id);
        if (!dignityEntry) {
          results.skipped++;
          continue;
        }

        // Get person's Codex entry
        const personEntry = await getEntryByPersonId(dignity.currentHolderId);
        if (!personEntry) {
          results.skipped++;
          continue;
        }

        // Create bidirectional link
        const created = await createBidirectionalLink(
          personEntry.id,
          dignityEntry.id,
          'holds-title',
          'Current Holder',
          syncContext,
          linkIndex
        );

        if (created) {
          results.linked++;
          logger.log(`🔗 Linked Person ↔ Dignity "${dignity.name}" Codex entries`);
        } else {
          results.skipped++;
        }

      } catch (error) {
        results.errors.push({
          dignityId: dignity.id,
          dignityName: dignity.name,
          error: error.message
        });
      }
    }

    logger.log('🔗 Person ↔ Dignity cross-linking complete:', results);
    return results;

  } catch (error) {
    logger.error('❌ Person ↔ Dignity cross-linking failed:', error);
    throw error;
  }
}

/**
 * Migrate House ↔ Dignity Codex cross-links
 *
 * Creates links between a house's Codex entry and dignities held by that house.
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @returns {Promise<Object>} Migration results
 */
export async function migrateHouseDignityLinks(syncContext = null) {
  logger.log('🔗 Starting House ↔ Dignity cross-linking...');

  const results = {
    total: 0,
    linked: 0,
    skipped: 0,
    errors: []
  };

  try {
    const dignities = await getAllDignities();
    results.total = dignities.length;

    // Build link index once for O(1) existence checks
    const allLinks = await db.codexLinks.toArray();
    const linkIndex = buildLinkIndex(allLinks);

    for (const dignity of dignities) {
      try {
        // Skip if dignity has no current house
        if (!dignity.currentHouseId) {
          results.skipped++;
          continue;
        }

        // Get dignity's Codex entry
        const dignityEntry = await getEntryByDignityId(dignity.id);
        if (!dignityEntry) {
          results.skipped++;
          continue;
        }

        // Get house's Codex entry
        const houseEntry = await getEntryByHouseId(dignity.currentHouseId);
        if (!houseEntry) {
          results.skipped++;
          continue;
        }

        // Create bidirectional link
        const created = await createBidirectionalLink(
          houseEntry.id,
          dignityEntry.id,
          'house-holds',
          'House Title',
          syncContext,
          linkIndex
        );

        if (created) {
          results.linked++;
          logger.log(`🔗 Linked House ↔ Dignity "${dignity.name}" Codex entries`);
        } else {
          results.skipped++;
        }

      } catch (error) {
        results.errors.push({
          dignityId: dignity.id,
          dignityName: dignity.name,
          error: error.message
        });
      }
    }

    logger.log('🔗 House ↔ Dignity cross-linking complete:', results);
    return results;

  } catch (error) {
    logger.error('❌ House ↔ Dignity cross-linking failed:', error);
    throw error;
  }
}

/**
 * Run all cross-linking migrations
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId }
 * @returns {Promise<Object>} Combined results
 */
export async function runCrossLinkingMigrations(syncContext = null) {
  logger.log('🔗 Running all cross-linking migrations...');

  const results = {
    personHouse: null,
    personDignity: null,
    houseDignity: null,
    success: true,
    totalLinked: 0,
    errors: []
  };

  try {
    results.personHouse = await migratePersonHouseLinks(syncContext);
    results.totalLinked += results.personHouse.linked;
    if (results.personHouse.errors.length > 0) {
      results.errors.push(...results.personHouse.errors);
    }

    results.personDignity = await migratePersonDignityLinks(syncContext);
    results.totalLinked += results.personDignity.linked;
    if (results.personDignity.errors.length > 0) {
      results.errors.push(...results.personDignity.errors);
    }

    results.houseDignity = await migrateHouseDignityLinks(syncContext);
    results.totalLinked += results.houseDignity.linked;
    if (results.houseDignity.errors.length > 0) {
      results.errors.push(...results.houseDignity.errors);
    }

    results.success = results.errors.length === 0;

    logger.log('🔗 All cross-linking migrations complete!', {
      personHouseLinked: results.personHouse?.linked || 0,
      personDignityLinked: results.personDignity?.linked || 0,
      houseDignityLinked: results.houseDignity?.linked || 0,
      totalLinked: results.totalLinked
    });

    return results;

  } catch (error) {
    logger.error('❌ Cross-linking migrations failed:', error);
    results.success = false;
    results.errors.push({ type: 'fatal', error: error.message });
    return results;
  }
}

// ==================== RUN ALL MIGRATIONS ====================

/**
 * Run all pending data migrations
 *
 * This is the main entry point for running all migrations.
 * Safe to run multiple times - migrations are idempotent.
 *
 * @param {Object} syncContext - Optional sync context { userId, datasetId } for cloud sync
 * @returns {Promise<Object>} Combined migration results
 */
export async function runAllMigrations(syncContext = null) {
  logger.log('🔄 Running all data migrations...');

  const results = {
    houses: null,
    dignities: null,
    dignityNatures: null,
    crossLinks: null,
    success: true,
    errors: []
  };

  try {
    // Run House → Codex migration
    results.houses = await migrateHousesToCodex();
    if (results.houses.errors.length > 0) {
      results.errors.push(...results.houses.errors);
    }

    // Run Dignity → Codex migration
    results.dignities = await migrateDignitiesToCodex();
    if (results.dignities.errors.length > 0) {
      results.errors.push(...results.dignities.errors);
    }

    // Run Dignity Nature migration (v3)
    results.dignityNatures = await migrateDignityNatures(syncContext);
    if (results.dignityNatures.errors.length > 0) {
      results.errors.push(...results.dignityNatures.errors);
    }

    // Run cross-linking migrations (with sync context for cloud persistence)
    results.crossLinks = await runCrossLinkingMigrations(syncContext);
    if (results.crossLinks.errors.length > 0) {
      results.errors.push(...results.crossLinks.errors);
    }

    results.success = results.errors.length === 0;

    logger.log('🔄 All migrations complete!', {
      housesMigrated: results.houses?.migrated || 0,
      dignitiesMigrated: results.dignities?.migrated || 0,
      dignityNaturesMigrated: results.dignityNatures?.migrated || 0,
      crossLinksCreated: results.crossLinks?.totalLinked || 0,
      totalErrors: results.errors.length
    });

    return results;

  } catch (error) {
    logger.error('❌ Migration process failed:', error);
    results.success = false;
    results.errors.push({ type: 'fatal', error: error.message });
    return results;
  }
}

// ==================== FIX "HOUSE HOUSE" PREFIX ====================

/**
 * Fix codex entries with duplicate "House House" prefix
 *
 * Finds all codex entries whose title starts with "House House " and
 * renames them to remove the duplicate prefix.
 *
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Object>} { fixed: number, entries: string[] }
 */
export async function fixHouseHousePrefixes(datasetId) {
  const allEntries = await getAllEntries(datasetId);
  const bad = allEntries.filter(e => e.title && e.title.startsWith('House House '));
  const fixed = [];

  for (const entry of bad) {
    const newTitle = entry.title.replace(/^House /, '');
    await updateEntry(entry.id, { title: newTitle }, datasetId);
    fixed.push(`${entry.title} → ${newTitle}`);
  }

  return { fixed: fixed.length, entries: fixed };
}

// ==================== MIGRATION STATUS ====================

/**
 * Check migration status - how many records need migration
 *
 * @returns {Promise<Object>} Status of pending migrations
 */
export async function getMigrationStatus() {
  try {
    const houses = await db.houses.toArray();
    const dignities = await getAllDignities();
    const people = await db.people.toArray();
    const codexEntries = await db.codexEntries.toArray();
    const codexLinks = await db.codexLinks.toArray();

    const housesWithoutCodex = houses.filter(h => !h.codexEntryId).length;
    const dignitiesWithoutCodex = dignities.filter(d => !d.codexEntryId).length;

    // Build lookup maps for Codex entries by entity ID
    const codexByPersonId = new Map();
    const codexByHouseId = new Map();
    const codexByDignityId = new Map();

    for (const entry of codexEntries) {
      if (entry.personId) codexByPersonId.set(entry.personId, entry);
      if (entry.houseId) codexByHouseId.set(entry.houseId, entry);
      if (entry.dignityId) codexByDignityId.set(entry.dignityId, entry);
    }

    // Count LINKABLE cross-links (both entities must have Codex entries)
    // AND count how many are actually linked

    // Person ↔ House links: person has Codex entry AND house has Codex entry
    let linkablePersonHouse = 0;
    let linkedPersonHouse = 0;
    for (const person of people) {
      if (person.houseId && codexByPersonId.has(person.id) && codexByHouseId.has(person.houseId)) {
        linkablePersonHouse++;

        // Check if this specific person→house link exists
        const personEntry = codexByPersonId.get(person.id);
        const houseEntry = codexByHouseId.get(person.houseId);
        const personEntryId = Number(personEntry.id);
        const houseEntryId = Number(houseEntry.id);

        const hasLink = codexLinks.some(link => {
          if (link.type !== 'member-of') return false;
          const linkSourceId = Number(link.sourceId);
          const linkTargetId = Number(link.targetId);

          // Direct link: person → house
          if (linkSourceId === personEntryId && linkTargetId === houseEntryId) return true;
          // Reverse bidirectional: house → person
          if (link.bidirectional && linkSourceId === houseEntryId && linkTargetId === personEntryId) return true;
          return false;
        });

        if (hasLink) linkedPersonHouse++;
      }
    }

    // Person ↔ Dignity links: dignity has holder AND both have Codex entries
    let linkablePersonDignity = 0;
    let linkedPersonDignity = 0;
    for (const dignity of dignities) {
      if (dignity.currentHolderId && codexByDignityId.has(dignity.id) && codexByPersonId.has(dignity.currentHolderId)) {
        linkablePersonDignity++;

        // Check if this specific person→dignity link exists
        const dignityEntry = codexByDignityId.get(dignity.id);
        const personEntry = codexByPersonId.get(dignity.currentHolderId);
        const dignityEntryId = Number(dignityEntry.id);
        const personEntryId = Number(personEntry.id);

        const hasLink = codexLinks.some(link => {
          if (link.type !== 'holds-title') return false;
          const linkSourceId = Number(link.sourceId);
          const linkTargetId = Number(link.targetId);

          // Direct: person → dignity
          if (linkSourceId === personEntryId && linkTargetId === dignityEntryId) return true;
          // Reverse bidirectional: dignity → person
          if (link.bidirectional && linkSourceId === dignityEntryId && linkTargetId === personEntryId) return true;
          return false;
        });

        if (hasLink) linkedPersonDignity++;
      }
    }

    // House ↔ Dignity links: dignity has house AND both have Codex entries
    let linkableHouseDignity = 0;
    let linkedHouseDignity = 0;
    for (const dignity of dignities) {
      if (dignity.currentHouseId && codexByDignityId.has(dignity.id) && codexByHouseId.has(dignity.currentHouseId)) {
        linkableHouseDignity++;

        // Check if this specific house→dignity link exists
        const dignityEntry = codexByDignityId.get(dignity.id);
        const houseEntry = codexByHouseId.get(dignity.currentHouseId);
        const dignityEntryId = Number(dignityEntry.id);
        const houseEntryId = Number(houseEntry.id);

        const hasLink = codexLinks.some(link => {
          if (link.type !== 'house-holds') return false;
          const linkSourceId = Number(link.sourceId);
          const linkTargetId = Number(link.targetId);

          // Direct: house → dignity
          if (linkSourceId === houseEntryId && linkTargetId === dignityEntryId) return true;
          // Reverse bidirectional: dignity → house
          if (link.bidirectional && linkSourceId === dignityEntryId && linkTargetId === houseEntryId) return true;
          return false;
        });

        if (hasLink) linkedHouseDignity++;
      }
    }

    const potentialCrossLinks = linkablePersonHouse + linkablePersonDignity + linkableHouseDignity;
    const existingCrossLinks = linkedPersonHouse + linkedPersonDignity + linkedHouseDignity;

    // Check if cross-links need migration (existing < potential)
    const personHouseNeedsMigration = linkedPersonHouse < linkablePersonHouse;
    const personDignityNeedsMigration = linkedPersonDignity < linkablePersonDignity;
    const houseDignityNeedsMigration = linkedHouseDignity < linkableHouseDignity;
    const crossLinksNeedMigration = personHouseNeedsMigration || personDignityNeedsMigration || houseDignityNeedsMigration;

    // Count dignities without nature set
    const dignitiesWithoutNature = dignities.filter(d => !d.dignityNature).length;

    return {
      houses: {
        total: houses.length,
        withCodex: houses.length - housesWithoutCodex,
        needsMigration: housesWithoutCodex
      },
      dignities: {
        total: dignities.length,
        withCodex: dignities.length - dignitiesWithoutCodex,
        needsMigration: dignitiesWithoutCodex
      },
      dignityNatures: {
        total: dignities.length,
        withNature: dignities.length - dignitiesWithoutNature,
        needsMigration: dignitiesWithoutNature
      },
      crossLinks: {
        personHouse: {
          potential: linkablePersonHouse,
          existing: linkedPersonHouse
        },
        personDignity: {
          potential: linkablePersonDignity,
          existing: linkedPersonDignity
        },
        houseDignity: {
          potential: linkableHouseDignity,
          existing: linkedHouseDignity
        },
        total: {
          potential: potentialCrossLinks,
          existing: existingCrossLinks,
          needsMigration: crossLinksNeedMigration
        }
      },
      needsMigration: housesWithoutCodex > 0 || dignitiesWithoutCodex > 0 || dignitiesWithoutNature > 0 || crossLinksNeedMigration
    };
  } catch (error) {
    logger.error('❌ Error checking migration status:', error);
    throw error;
  }
}

// ==================== DATASET STRUCTURE MIGRATION ====================

/**
 * Collections that need to be migrated to the new dataset structure.
 *
 * Moved to the manifest as `LEGACY_FLAT_COLLECTIONS` (sync manifest, step 2) so
 * that collection names are declared in one file — but **not** derived from the
 * entity list, and the distinction matters. These thirteen are the collections
 * that existed at the flat `users/{uid}/{collection}` path, which is the set as
 * of Dexie v12, when this migration was written. Deriving them from
 * `syncedCollections()` would add nine that cannot exist there and drop
 * `acknowledgedDuplicates` and `bugs`, which can — stranding them permanently.
 * The full reasoning is on the export.
 */
const ENTITY_COLLECTIONS = LEGACY_FLAT_COLLECTIONS;

/**
 * Check if user needs dataset structure migration
 *
 * Returns true if:
 * - User has data in old structure (users/{userId}/{collection})
 * - AND does NOT have datasetsMetadata collection
 *
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<boolean>} True if migration is needed
 */
export async function needsDatasetMigration(userId) {
  if (!userId) return false;

  try {
    // Check if datasetsMetadata collection exists
    const metadataRef = collection(firestoreDb, 'users', userId, 'datasetsMetadata');
    const metadataSnapshot = await getDocs(metadataRef);

    // If user already has dataset metadata, no migration needed
    if (!metadataSnapshot.empty) {
      logger.log('📂 User already has dataset structure');
      return false;
    }

    // Check if user has any data in old structure
    // Just check 'people' collection as a quick test
    const oldPeopleRef = collection(firestoreDb, 'users', userId, 'people');
    const oldPeopleSnapshot = await getDocs(oldPeopleRef);

    if (!oldPeopleSnapshot.empty) {
      logger.log('📂 User has old structure data, migration needed');
      return true;
    }

    // No old data and no new structure = new user, will be set up fresh
    logger.log('📂 New user, no migration needed');
    return false;

  } catch (error) {
    logger.error('❌ Error checking dataset migration:', error);
    return false;
  }
}

/**
 * Migrate existing user data to the new dataset structure
 *
 * This migration:
 * 1. Creates "Default" dataset metadata in Firestore
 * 2. Moves all existing data from users/{userId}/{collection}
 *    to users/{userId}/datasets/default/{collection}
 * 3. Cleans up old data structure
 * 4. Sets activeDatasetId in localStorage to 'default'
 *
 * Safe to run multiple times - checks if migration is needed first.
 *
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<Object>} Migration results
 */
export async function migrateToDatasetStructure(userId) {
  logger.log('📂 Starting dataset structure migration for user:', userId);

  const results = {
    success: false,
    collectionsProcessed: 0,
    documentsMovedTotal: 0,
    documentsByCollection: {},
    errors: []
  };

  if (!userId) {
    results.errors.push({ type: 'validation', error: 'No userId provided' });
    return results;
  }

  try {
    // Check if migration is actually needed
    const needsMigration = await needsDatasetMigration(userId);
    if (!needsMigration) {
      logger.log('📂 No migration needed, skipping');
      results.success = true;
      return results;
    }

    // Step 1: Create Default dataset metadata
    logger.log('📂 Step 1: Creating Default dataset metadata...');
    const existingDefault = await getDataset(userId, DATASET_DEFAULT_ID);
    if (!existingDefault) {
      await createDataset(userId, {
        id: DATASET_DEFAULT_ID,
        name: 'Default',
        isDefault: true
      });
      logger.log('📂 Created Default dataset metadata');
    } else {
      logger.log('📂 Default dataset metadata already exists');
    }

    // Step 2: Move data from old structure to new structure
    logger.log('📂 Step 2: Moving data to new structure...');

    for (const collectionName of ENTITY_COLLECTIONS) {
      try {
        // Get all documents from old location
        const oldCollRef = collection(firestoreDb, 'users', userId, collectionName);
        const snapshot = await getDocs(oldCollRef);

        if (snapshot.empty) {
          logger.log(`📂 Collection "${collectionName}" is empty, skipping`);
          results.documentsByCollection[collectionName] = 0;
          continue;
        }

        const docCount = snapshot.docs.length;
        logger.log(`📂 Moving ${docCount} documents from "${collectionName}"...`);

        // Use batched writes for efficiency (max 500 operations per batch)
        const batchSize = 250; // Each doc needs 2 ops: set + delete
        let processed = 0;

        while (processed < snapshot.docs.length) {
          const batch = writeBatch(firestoreDb);
          const batchDocs = snapshot.docs.slice(processed, processed + batchSize);

          for (const docSnap of batchDocs) {
            const data = docSnap.data();

            // New location: users/{userId}/datasets/default/{collection}/{docId}
            const newDocRef = doc(
              firestoreDb,
              'users',
              userId,
              'datasets',
              DATASET_DEFAULT_ID,
              collectionName,
              docSnap.id
            );

            // Copy to new location
            batch.set(newDocRef, data);

            // Delete from old location
            batch.delete(docSnap.ref);
          }

          await batch.commit();
          processed += batchDocs.length;
          logger.log(`📂 Batch processed: ${processed}/${docCount} in "${collectionName}"`);
        }

        results.collectionsProcessed++;
        results.documentsMovedTotal += docCount;
        results.documentsByCollection[collectionName] = docCount;
        logger.log(`📂 Completed "${collectionName}": ${docCount} documents moved`);

      } catch (collError) {
        logger.error(`❌ Error migrating collection "${collectionName}":`, collError);
        results.errors.push({
          type: 'collection',
          collection: collectionName,
          error: collError.message
        });
      }
    }

    // Step 3: Set active dataset in localStorage
    logger.log('📂 Step 3: Setting active dataset...');
    setActiveDatasetId(DATASET_DEFAULT_ID);

    results.success = results.errors.length === 0;

    logger.log('📂 Dataset structure migration complete:', {
      collectionsProcessed: results.collectionsProcessed,
      documentsMovedTotal: results.documentsMovedTotal,
      errors: results.errors.length
    });

    return results;

  } catch (error) {
    logger.error('❌ Dataset structure migration failed:', error);
    results.errors.push({ type: 'fatal', error: error.message });
    return results;
  }
}

/**
 * Migrate local IndexedDB to new dataset-aware structure
 *
 * Note: This is handled automatically by the database.js changes.
 * The old "LineageweaverDB" will be replaced by "LineageweaverDB_default".
 * This function is provided for explicit migration if needed.
 *
 * @returns {Promise<Object>} Migration results
 */
export async function migrateLocalDatabase() {
  logger.log('📂 Checking local database migration...');

  const results = {
    success: false,
    action: 'none',
    error: null
  };

  try {
    // Check if old database exists
    const databases = await indexedDB.databases();
    const oldDbExists = databases.some(db => db.name === 'LineageweaverDB');
    const newDbExists = databases.some(db => db.name === `LineageweaverDB_${DEFAULT_DATASET_ID}`);

    if (!oldDbExists) {
      logger.log('📂 No old local database found');
      results.success = true;
      results.action = 'none';
      return results;
    }

    if (newDbExists) {
      logger.log('📂 New database already exists, cleaning up old database');
      // Delete old database
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('LineageweaverDB');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      results.action = 'cleaned_old';
      results.success = true;
      return results;
    }

    // Old database exists, new doesn't - we need to migrate
    // The simplest approach is to let the sync process repopulate from Firestore
    // since we've already migrated Firestore data
    logger.log('📂 Old database found, will be repopulated from cloud on next sync');
    results.action = 'will_repopulate';
    results.success = true;

    return results;

  } catch (error) {
    logger.error('❌ Local database migration check failed:', error);
    results.error = error.message;
    return results;
  }
}

/**
 * Run full dataset migration (Firestore + local)
 *
 * PERFORMANCE: Uses version caching to skip expensive checks on subsequent loads.
 * Pass forceMigration=true to bypass cache for debugging.
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} [datasetId='default'] - The dataset ID
 * @param {boolean} [forceMigration=false] - Force migration even if cached
 * @returns {Promise<Object>} Combined results
 */
export async function runDatasetMigration(userId, datasetId = 'default', forceMigration = false) {
  const results = {
    firestore: null,
    local: null,
    success: false,
    skipped: false
  };

  // Check if we can skip based on cached version
  if (!forceMigration && !needsMigrationCheck(userId, datasetId)) {
    logger.log('📂 Migration check skipped (cached version is current)');
    results.success = true;
    results.skipped = true;
    return results;
  }

  logger.log('📂 Running full dataset migration...');

  try {
    // Migrate Firestore structure
    results.firestore = await migrateToDatasetStructure(userId);

    // Check local database
    results.local = await migrateLocalDatabase();

    results.success = results.firestore.success && results.local.success;

    // Cache the migration version on success
    if (results.success) {
      setCachedMigrationVersion(userId, datasetId, MIGRATION_VERSION);
    }

    logger.log('📂 Full dataset migration complete:', {
      firestoreSuccess: results.firestore.success,
      localAction: results.local.action
    });

    return results;

  } catch (error) {
    logger.error('❌ Full dataset migration failed:', error);
    results.success = false;
    return results;
  }
}

// ==================== EXPORTS ====================

export { buildLinkIndex, linkExistsInIndex };

export default {
  migrateHousesToCodex,
  migrateDignitiesToCodex,
  migrateDignityNatures,
  migratePersonHouseLinks,
  migratePersonDignityLinks,
  migrateHouseDignityLinks,
  runCrossLinkingMigrations,
  runAllMigrations,
  getMigrationStatus,
  buildLinkIndex,
  linkExistsInIndex,
  // Dataset migration
  needsDatasetMigration,
  needsMigrationCheck,
  migrateToDatasetStructure,
  migrateLocalDatabase,
  runDatasetMigration
};
