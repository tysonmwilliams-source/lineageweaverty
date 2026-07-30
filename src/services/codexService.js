/**
 * Codex Service
 * 
 * Handles all database operations for The Codex encyclopedia system.
 * Manages codex entries (character bios, locations, events, etc.) and their links.
 */

import { getDatabase } from './database.js';
import { logger } from '../utils/logger';

// Context notification - lazy loaded to avoid circular deps
let contextNotify = null;
async function notifyContextChange(entityType, operation, entity, datasetId) {
  try {
    if (!contextNotify) {
      const { notifyChange } = await import('./contextService.js');
      contextNotify = notifyChange;
    }
    contextNotify(entityType, operation, entity, datasetId);
  } catch (e) {
    // Context service not available - silently skip
  }
}

// ==================== CODEX ENTRY OPERATIONS ====================

/**
 * Create a new codex entry
 * @param {Object} entryData - Entry data with required fields
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<number>} - ID of created entry
 */
export async function createEntry(entryData, datasetId) {
  try {
    const db = getDatabase(datasetId);

    // Ensure required fields
    const entry = {
      // Core identity
      type: entryData.type, // Required: 'personage', 'house', 'location', 'event', 'mysteria', 'custom'
      title: entryData.title, // Required
      subtitle: entryData.subtitle || null,

      // Content
      content: entryData.content || '', // Markdown text with [[wiki-links]]
      sections: entryData.sections || [], // Array of section objects

      // Organization
      category: entryData.category || null,
      tags: entryData.tags || [], // Array of strings
      era: entryData.era || null, // Time period

      // Links (for external references - personId, houseId, heraldryId, dignityId, etc.)
      personId: entryData.personId || null, // Link to Person entity
      houseId: entryData.houseId || null, // Link to House entity
      heraldryId: entryData.heraldryId || null, // Link to Heraldry entity (Phase 5)
      dignityId: entryData.dignityId || null, // Link to Dignity entity

      // Metadata
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      wordCount: calculateWordCount(entryData.content || ''),

      // Version control (future)
      version: 1,
      changelog: []
    };

    const id = await db.codexEntries.add(entry);
    logger.log('Codex entry created with ID:', id);

    // Notify context system of change
    notifyContextChange('codex', 'create', { ...entry, id }, datasetId);

    return id;
  } catch (error) {
    logger.error('Error creating codex entry:', error);
    throw error;
  }
}

/**
 * Restore a codex entry with a specific ID
 * 
 * IMPORTANT: This is different from createEntry() because it uses .put()
 * which preserves the original ID instead of auto-generating a new one.
 * 
 * Used during cloud sync to restore entries without creating duplicates.
 * 
 * @param {Object} entryData - Entry data including the original ID
 * @returns {Promise<number>} - The ID of the restored entry
 */
export async function restoreEntry(entryData, datasetId) {
  try {
    const db = getDatabase(datasetId);

    // Build the entry object, preserving the original ID
    const entry = {
      id: parseInt(entryData.id) || entryData.id, // CRITICAL: preserve original ID

      // Core identity
      type: entryData.type,
      title: entryData.title,
      subtitle: entryData.subtitle || null,

      // Content
      content: entryData.content || '',
      sections: entryData.sections || [],

      // Organization
      category: entryData.category || null,
      tags: entryData.tags || [],
      era: entryData.era || null,

      // Links
      personId: entryData.personId || null,
      houseId: entryData.houseId || null,
      heraldryId: entryData.heraldryId || null,
      dignityId: entryData.dignityId || null,

      // Metadata - preserve original timestamps if available
      created: entryData.created || new Date().toISOString(),
      updated: entryData.updated || new Date().toISOString(),
      wordCount: entryData.wordCount || calculateWordCount(entryData.content || ''),

      // Version control
      version: entryData.version || 1,
      changelog: entryData.changelog || []
    };

    // Use .put() which creates OR updates based on the key
    // This prevents duplicates by using the original ID
    const id = await db.codexEntries.put(entry);
    logger.log('Codex entry restored with ID:', id);
    return id;
  } catch (error) {
    logger.error('Error restoring codex entry:', error);
    throw error;
  }
}

/**
 * Get a single codex entry by ID
 */
export async function getEntry(id, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const entry = await db.codexEntries.get(id);
    return entry;
  } catch (error) {
    logger.error('Error getting codex entry:', error);
    throw error;
  }
}

/**
 * Get a codex entry by personId
 *
 * TREE-CODEX INTEGRATION: Used to find the Codex entry for a person
 * when navigating from the Family Tree or Data Management.
 *
 * @param {number} personId - The person's database ID
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Object|null} The codex entry or null if not found
 */
export async function getEntryByPersonId(personId, datasetId) {
  try {
    if (personId === null || personId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // personId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('personId').equals(personId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by personId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by houseId
 *
 * HOUSE-CODEX INTEGRATION: Used to find the Codex entry for a house
 * when navigating from Data Management or for cascade delete.
 *
 * @param {number} houseId - The house's database ID
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Object|null} The codex entry or null if not found
 */
export async function getEntryByHouseId(houseId, datasetId) {
  try {
    if (houseId === null || houseId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // houseId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('houseId').equals(houseId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by houseId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by dignityId
 *
 * DIGNITY-CODEX INTEGRATION: Used to find the Codex entry for a dignity
 * when navigating from the Dignities system or for cascade delete.
 *
 * @param {number} dignityId - The dignity's database ID
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Object|null} The codex entry or null if not found
 */
export async function getEntryByDignityId(dignityId, datasetId) {
  try {
    if (dignityId === null || dignityId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // dignityId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('dignityId').equals(dignityId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by dignityId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by heraldryId
 *
 * PHASE 5 - CODEX-HERALDRY INTEGRATION: Used to find the Codex entry
 * for a heraldry record when navigating from The Armory.
 *
 * @param {number} heraldryId - The heraldry record's database ID
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Object|null} The codex entry or null if not found
 */
export async function getEntryByHeraldryId(heraldryId, datasetId) {
  try {
    if (heraldryId === null || heraldryId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // heraldryId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('heraldryId').equals(heraldryId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by heraldryId:', error);
    throw error;
  }
}

/**
 * Get all codex entries
 */
export async function getAllEntries(datasetId) {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting all codex entries:', error);
    throw error;
  }
}

/**
 * Get count of codex entries without loading all data
 * More efficient than getAllEntries().length for stats
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<number>} Count of entries
 */
export async function getEntriesCount(datasetId) {
  try {
    const db = getDatabase(datasetId);
    return await db.codexEntries.count();
  } catch (error) {
    logger.error('Error getting codex entries count:', error);
    return 0;
  }
}

/**
 * Get entries by type
 * @param {string} type - Entry type (personage, house, location, event, mysteria, custom, or 'all')
 * @param {string} [datasetId] - Dataset ID (optional)
 */
export async function getEntriesByType(type, datasetId) {
  try {
    const db = getDatabase(datasetId);
    // Handle 'all' type to return all entries
    if (type === 'all') {
      return await db.codexEntries.toArray();
    }
    const entries = await db.codexEntries.where('type').equals(type).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by type:', error);
    throw error;
  }
}

/**
 * Get entries by category
 */
export async function getEntriesByCategory(category, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.where('category').equals(category).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by category:', error);
    throw error;
  }
}

/**
 * Get entries by era
 */
export async function getEntriesByEra(era, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.where('era').equals(era).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by era:', error);
    throw error;
  }
}

/**
 * Get entries by tag
 */
export async function getEntriesByTag(tag, datasetId) {
  try {
    const db = getDatabase(datasetId);
    // Dexie's multi-entry index (the * prefix) allows this
    const entries = await db.codexEntries.where('tags').equals(tag).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by tag:', error);
    throw error;
  }
}

/**
 * Search entries by title (case-insensitive)
 */
export async function searchEntriesByTitle(searchTerm, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const allEntries = await db.codexEntries.toArray();
    const searchLower = searchTerm.toLowerCase();

    return allEntries.filter(entry =>
      entry.title.toLowerCase().includes(searchLower)
    );
  } catch (error) {
    logger.error('Error searching entries:', error);
    throw error;
  }
}

/**
 * Full-text search across all entry content
 */
export async function searchEntriesFullText(searchTerm, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const allEntries = await db.codexEntries.toArray();
    const searchLower = searchTerm.toLowerCase();

    return allEntries.filter(entry => {
      const titleMatch = entry.title.toLowerCase().includes(searchLower);
      const subtitleMatch = entry.subtitle?.toLowerCase().includes(searchLower);
      const contentMatch = entry.content.toLowerCase().includes(searchLower);

      return titleMatch || subtitleMatch || contentMatch;
    });
  } catch (error) {
    logger.error('Error in full-text search:', error);
    throw error;
  }
}

/**
 * Update an existing codex entry
 */
export async function updateEntry(id, updates, datasetId) {
  try {
    const db = getDatabase(datasetId);
    // Always update the 'updated' timestamp and recalculate word count
    const modifiedUpdates = {
      ...updates,
      updated: new Date().toISOString()
    };

    if (updates.content !== undefined) {
      modifiedUpdates.wordCount = calculateWordCount(updates.content);
    }

    const result = await db.codexEntries.update(id, modifiedUpdates);
    logger.log('Codex entry updated:', result);

    // Notify context system of change
    const updatedEntry = await db.codexEntries.get(id);
    notifyContextChange('codex', 'update', updatedEntry, datasetId);

    return result;
  } catch (error) {
    logger.error('Error updating codex entry:', error);
    throw error;
  }
}

/**
 * Delete a codex entry
 */
export async function deleteEntry(id, datasetId, userId = null) {
  try {
    const db = getDatabase(datasetId);

    // Get entry before deleting for context notification
    const entry = await db.codexEntries.get(id);

    // Delete the entry
    await db.codexEntries.delete(id);

    // Delete all links associated with this entry
    await deleteLinksForEntry(id, datasetId, userId);

    logger.log('Codex entry deleted:', id);

    // Propagate to the cloud. Without this the entry was restored on the next
    // download — which made the Codex cleanup tool actively counter-productive,
    // since the duplicates it removed always came back.
    if (userId) {
      const { syncDeleteCodexEntry } = await import('./dataSyncService.js');
      try {
        await syncDeleteCodexEntry(userId, datasetId, id);
      } catch (syncError) {
        logger.error('☁️ Failed to sync codex entry delete:', syncError);
      }
    }

    // Notify context system of change
    if (entry) {
      notifyContextChange('codex', 'delete', entry, datasetId);
    }
  } catch (error) {
    logger.error('Error deleting codex entry:', error);
    throw error;
  }
}

// ==================== CODEX LINK OPERATIONS ====================

/**
 * Create a link between two entries
 * @param {Object} linkData - Link data
 * @param {string} [datasetId] - Dataset ID (optional)
 */
export async function createLink(linkData, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const link = {
      sourceId: linkData.sourceId, // Entry ID that contains the link
      targetId: linkData.targetId, // Entry ID being linked to
      type: linkData.type || 'reference', // Type of relationship
      label: linkData.label || null, // Optional label for the link
      bidirectional: linkData.bidirectional !== undefined ? linkData.bidirectional : true
    };

    const id = await db.codexLinks.add(link);
    logger.log('Codex link created with ID:', id);
    return id;
  } catch (error) {
    logger.error('Error creating codex link:', error);
    throw error;
  }
}

/**
 * Get all outgoing links from an entry (links this entry makes to others)
 */
export async function getOutgoingLinks(entryId, datasetId) {
  try {
    const db = getDatabase(datasetId);
    const links = await db.codexLinks.where('sourceId').equals(entryId).toArray();
    return links;
  } catch (error) {
    logger.error('Error getting outgoing links:', error);
    throw error;
  }
}

/**
 * Get all incoming links to an entry (backlinks - other entries that mention this one)
 * 
 * BIDIRECTIONAL SUPPORT: This function now returns both:
 * 1. Links where this entry is the TARGET (traditional backlinks)
 * 2. Links where this entry is the SOURCE AND the link is marked bidirectional
 * 
 * This ensures that if Entry A links to Entry B with bidirectional=true,
 * BOTH entries will show each other in their backlinks panel.
 * 
 * @param {number} entryId - The entry to get backlinks for
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Array>} - Array of link objects with added `direction` property
 */
export async function getIncomingLinks(entryId, datasetId) {
  try {
    const db = getDatabase(datasetId);
    
    // 1. Traditional backlinks: links pointing TO this entry
    const incomingLinks = await db.codexLinks
      .where('targetId')
      .equals(entryId)
      .toArray();
    
    // Mark these as 'incoming' direction for context snippet handling
    const markedIncoming = incomingLinks.map(link => ({
      ...link,
      direction: 'incoming',
      // For incoming links, sourceId is the entry that references us
      referringEntryId: link.sourceId
    }));
    
    // 2. Bidirectional reverse links: links FROM this entry that are bidirectional
    const outgoingBidirectional = await db.codexLinks
      .where('sourceId')
      .equals(entryId)
      .filter(link => link.bidirectional === true)
      .toArray();
    
    // Mark these as 'outgoing-bidirectional' and swap the reference
    const markedOutgoing = outgoingBidirectional.map(link => ({
      ...link,
      direction: 'outgoing-bidirectional',
      // For bidirectional outgoing links, targetId is the entry we link to
      // but we want to show IT in OUR backlinks, so referringEntryId = targetId
      referringEntryId: link.targetId
    }));
    
    // 3. Combine and deduplicate (in case of circular references)
    const allLinks = [...markedIncoming, ...markedOutgoing];
    
    // Deduplicate by referringEntryId to avoid showing same entry twice
    const seen = new Set();
    const deduplicated = allLinks.filter(link => {
      if (seen.has(link.referringEntryId)) {
        return false;
      }
      seen.add(link.referringEntryId);
      return true;
    });
    
    return deduplicated;
  } catch (error) {
    logger.error('Error getting incoming links:', error);
    throw error;
  }
}

/**
 * Get all links for an entry (both incoming and outgoing)
 */
export async function getAllLinksForEntry(entryId, datasetId) {
  try {
    const [outgoing, incoming] = await Promise.all([
      getOutgoingLinks(entryId, datasetId),
      getIncomingLinks(entryId, datasetId)
    ]);

    return {
      outgoing,
      incoming
    };
  } catch (error) {
    logger.error('Error getting all links for entry:', error);
    throw error;
  }
}

/**
 * Delete all links associated with an entry
 */
export async function deleteLinksForEntry(entryId, datasetId, userId = null) {
  try {
    const db = getDatabase(datasetId);

    // Collect ids first so the cloud copies can be removed too — a bulk
    // .delete() drops them locally and leaves Firestore to restore them.
    const doomed = userId
      ? [
          ...await db.codexLinks.where('sourceId').equals(entryId).toArray(),
          ...await db.codexLinks.where('targetId').equals(entryId).toArray()
        ]
      : [];

    // Delete where this entry is the source
    await db.codexLinks.where('sourceId').equals(entryId).delete();

    // Delete where this entry is the target
    await db.codexLinks.where('targetId').equals(entryId).delete();

    if (userId && doomed.length > 0) {
      const { syncDeleteCodexLink } = await import('./dataSyncService.js');
      const seen = new Set();
      for (const link of doomed) {
        if (seen.has(link.id)) continue;
        seen.add(link.id);
        try {
          await syncDeleteCodexLink(userId, datasetId, link.id);
        } catch (syncError) {
          logger.error('☁️ Failed to sync codex link delete:', syncError);
        }
      }
    }

    logger.log('All links deleted for entry:', entryId);
  } catch (error) {
    logger.error('Error deleting links for entry:', error);
    throw error;
  }
}

/**
 * Delete a specific link
 */
export async function deleteLink(linkId, datasetId) {
  try {
    const db = getDatabase(datasetId);
    await db.codexLinks.delete(linkId);
    logger.log('Codex link deleted:', linkId);
  } catch (error) {
    logger.error('Error deleting codex link:', error);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate word count from markdown content
 */
function calculateWordCount(content) {
  if (!content) return 0;
  
  // Remove markdown syntax for more accurate count
  const cleanText = content
    .replace(/\[\[.*?\]\]/g, '') // Remove wiki links
    .replace(/[#*_`]/g, '') // Remove markdown formatting
    .trim();
  
  const words = cleanText.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Get entry statistics
 */
export async function getCodexStatistics(datasetId) {
  try {
    const allEntries = await getAllEntries(datasetId);

    const stats = {
      total: allEntries.length,
      byType: {},
      totalWords: 0,
      recentlyUpdated: []
    };

    // Count by type
    allEntries.forEach(entry => {
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      stats.totalWords += entry.wordCount || 0;
    });

    // Get 5 most recently updated
    stats.recentlyUpdated = allEntries
      .sort((a, b) => new Date(b.updated) - new Date(a.updated))
      .slice(0, 5)
      .map(e => ({ id: e.id, title: e.title, updated: e.updated }));

    return stats;
  } catch (error) {
    logger.error('Error getting codex statistics:', error);
    throw error;
  }
}

/**
 * Migrate mysteria entries to the Heraldry & Titles section
 *
 * This moves all entries with type 'mysteria' to type 'heraldry'
 * with category 'titles', placing them in the Dignities & Titles subsection.
 *
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Object>} Migration results with count of migrated entries
 */
export async function migrateMysteriaToDignities(datasetId) {
  try {
    const db = getDatabase(datasetId);

    // Get all mysteria entries
    const mysteriaEntries = await db.codexEntries
      .filter(entry => entry.type === 'mysteria')
      .toArray();

    let migratedCount = 0;
    const errors = [];

    for (const entry of mysteriaEntries) {
      try {
        // Update entry to be heraldry type with titles category
        await db.codexEntries.update(entry.id, {
          type: 'heraldry',
          category: 'titles',
          updated: new Date().toISOString()
        });
        migratedCount++;
      } catch (err) {
        errors.push({ id: entry.id, title: entry.title, error: err.message });
      }
    }

    logger.log(`Migrated ${migratedCount} mysteria entries to Dignities & Titles`);

    return {
      success: errors.length === 0,
      total: mysteriaEntries.length,
      migrated: migratedCount,
      errors
    };
  } catch (error) {
    logger.error('Error migrating mysteria entries:', error);
    throw error;
  }
}

/**
 * Get count of mysteria entries that can be migrated
 * Excludes entries marked with skipMigration flag
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<number>} Count of mysteria entries
 */
export async function getMysteriaMigrationCount(datasetId) {
  try {
    const db = getDatabase(datasetId);
    const count = await db.codexEntries
      .filter(entry => entry.type === 'mysteria' && !entry.skipMigration)
      .count();
    return count;
  } catch (error) {
    logger.error('Error getting mysteria count:', error);
    return 0;
  }
}

/**
 * Get all mysteria entries that can be migrated
 * Excludes entries marked with skipMigration flag
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Array>} Array of mysteria entries
 */
export async function getMysteriaMigrationEntries(datasetId) {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries
      .filter(entry => entry.type === 'mysteria' && !entry.skipMigration)
      .toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting mysteria entries:', error);
    return [];
  }
}

/**
 * Migrate selected mysteria entries to Dignities & Titles
 * @param {Array<number>} entryIds - Array of entry IDs to migrate
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Object>} Migration results
 */
export async function migrateSelectedMysteria(entryIds, datasetId) {
  try {
    const db = getDatabase(datasetId);

    let migratedCount = 0;
    const errors = [];

    for (const id of entryIds) {
      try {
        // Get entry to verify it exists and is mysteria type
        const entry = await db.codexEntries.get(id);
        if (!entry || entry.type !== 'mysteria') {
          errors.push({ id, title: entry?.title || 'Unknown', error: 'Entry not found or not mysteria type' });
          continue;
        }

        // Update entry to be heraldry type with titles category
        await db.codexEntries.update(id, {
          type: 'heraldry',
          category: 'titles',
          modified: new Date().toISOString()
        });
        migratedCount++;
      } catch (err) {
        errors.push({ id, title: 'Unknown', error: err.message });
      }
    }

    logger.log(`Migrated ${migratedCount} selected mysteria entries to Dignities & Titles`);

    return {
      success: errors.length === 0,
      total: entryIds.length,
      migrated: migratedCount,
      errors
    };
  } catch (error) {
    logger.error('Error migrating selected mysteria entries:', error);
    throw error;
  }
}

/**
 * Mark mysteria entries to skip migration
 * These entries will no longer appear in the migration list
 * @param {Array<number>} entryIds - Array of entry IDs to mark
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<Object>} Result with count of marked entries
 */
export async function markMysteriaSkipMigration(entryIds, datasetId) {
  try {
    const db = getDatabase(datasetId);

    let markedCount = 0;
    const errors = [];

    for (const id of entryIds) {
      try {
        await db.codexEntries.update(id, {
          skipMigration: true,
          modified: new Date().toISOString()
        });
        markedCount++;
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    logger.log(`Marked ${markedCount} entries to skip migration`);

    return {
      success: errors.length === 0,
      total: entryIds.length,
      marked: markedCount,
      errors
    };
  } catch (error) {
    logger.error('Error marking entries to skip migration:', error);
    throw error;
  }
}

export default {
  // Entry operations
  createEntry,
  restoreEntry, // Used for cloud sync - preserves original IDs
  getEntry,
  getEntryByPersonId, // TREE-CODEX INTEGRATION
  getEntryByHouseId, // HOUSE-CODEX INTEGRATION
  getEntryByDignityId, // DIGNITY-CODEX INTEGRATION
  getEntryByHeraldryId, // PHASE 5 - CODEX-HERALDRY INTEGRATION
  getAllEntries,
  getEntriesByType,
  getEntriesByCategory,
  getEntriesByEra,
  getEntriesByTag,
  searchEntriesByTitle,
  searchEntriesFullText,
  updateEntry,
  deleteEntry,
  
  // Link operations
  createLink,
  getOutgoingLinks,
  getIncomingLinks,
  getAllLinksForEntry,
  deleteLinksForEntry,
  deleteLink,
  
  // Statistics
  getCodexStatistics,

  // Migration utilities
  migrateMysteriaToDignities,
  getMysteriaMigrationCount,
  getMysteriaMigrationEntries,
  migrateSelectedMysteria,
  markMysteriaSkipMigration
};