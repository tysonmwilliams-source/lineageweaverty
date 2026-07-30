/**
 * Heraldry Service - The Armory
 * 
 * CRUD operations for the standalone heraldry system.
 * This service manages heraldic devices as first-class entities,
 * similar to how codexService manages encyclopedia entries.
 * 
 * WHAT IS A HERALDRY RECORD?
 * A heraldry record represents a single coat of arms or heraldic device.
 * It can be linked to houses, people, locations, or events via heraldryLinks.
 * 
 * DATABASE TABLES USED:
 * - heraldry: The main heraldry records
 * - heraldryLinks: Junction table linking heraldry to other entities
 */

import { getDatabase } from './database';
import {
  syncAddHeraldry,
  syncUpdateHeraldry,
  syncDeleteHeraldry,
  syncAddHeraldryLink,
  syncDeleteHeraldryLink,
  syncUpdateHouse,
  syncUpdatePerson
} from './dataSyncService';
import { logger } from '../utils/logger';
import { readComposition } from '../utils/heraldry';

// ==================== HERALDRY CRUD OPERATIONS ====================

/**
 * Create a new heraldry record
 * 
 * @param {Object} heraldryData - The heraldry data to save
 * @returns {Promise<number>} The ID of the newly created record
 * 
 * REQUIRED FIELDS:
 * - name: Display name (e.g., "Arms of House Wilfrey")
 * 
 * OPTIONAL FIELDS:
 * - description: Free-form description
 * - blazon: Formal heraldic description (e.g., "Quarterly gules and argent")
 * - heraldrySVG: Primary SVG markup for infinite zoom
 * - heraldrySourceSVG: Original SVG before shield masking
 * - heraldryThumbnail: 40×40 PNG base64
 * - heraldryDisplay: 200×200 PNG base64
 * - heraldryHighRes: 400×400 PNG base64
 * - shieldType: 'heater' | 'french' | 'spanish' | 'english' | 'swiss'
 * - composition: Object describing how the heraldry was built
 * - category: 'noble' | 'ecclesiastical' | 'civic' | 'guild' | 'personal' | 'fantasy'
 * - tags: Array of searchable tags
 * - parentHeraldryId: For derived arms (cadency, marriage)
 * - derivationType: 'cadency' | 'marriage' | 'grant' | 'adoption' | null
 * - isTemplate: Boolean - can be used as starting point
 * - codexEntryId: Link to Codex article about this heraldry
 * @param {string} [userId] - Optional user ID for cloud sync
 */
export async function createHeraldry(heraldryData, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const now = new Date().toISOString();

    const record = {
      // Identity
      name: heraldryData.name || 'Untitled Arms',
      description: heraldryData.description || null,
      blazon: heraldryData.blazon || null,

      // Visual Data
      heraldrySVG: heraldryData.heraldrySVG || null,
      heraldrySourceSVG: heraldryData.heraldrySourceSVG || null,
      heraldryThumbnail: heraldryData.heraldryThumbnail || null,
      heraldryDisplay: heraldryData.heraldryDisplay || heraldryData.heraldryImageData || null,
      heraldryHighRes: heraldryData.heraldryHighRes || null,

      // Composition
      shieldType: heraldryData.shieldType || heraldryData.heraldryShieldType || 'heater',
      composition: heraldryData.composition || null,

      // Classification
      category: heraldryData.category || 'noble',
      tags: heraldryData.tags || [],

      // Lineage
      parentHeraldryId: heraldryData.parentHeraldryId || null,
      derivationType: heraldryData.derivationType || null,

      // Metadata
      isTemplate: heraldryData.isTemplate || false,
      codexEntryId: heraldryData.codexEntryId || null,
      source: heraldryData.source || heraldryData.heraldrySource || null,
      seed: heraldryData.seed || heraldryData.heraldrySeed || null,
      metadata: heraldryData.metadata || heraldryData.heraldryMetadata || null,

      // Timestamps
      created: now,
      updated: now
    };

    const id = await db.heraldry.add(record);
    logger.log('🛡️ Heraldry created with ID:', id);

    // Sync to cloud if userId provided
    if (userId && datasetId) {
      await syncAddHeraldry(userId, datasetId, id, { ...record, id });
    }

    return id;
  } catch (error) {
    logger.error('❌ Error creating heraldry:', error);
    throw error;
  }
}

/**
 * Get a single heraldry record by ID
 * 
 * @param {number} id - The heraldry ID
 * @returns {Promise<Object|undefined>} The heraldry record or undefined
 */
export async function getHeraldry(id, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const heraldry = await db.heraldry.get(id);
    return heraldry;
  } catch (error) {
    logger.error('❌ Error getting heraldry:', error);
    throw error;
  }
}

/**
 * Get all heraldry records
 * 
 * @returns {Promise<Array>} Array of all heraldry records
 */
export async function getAllHeraldry(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const heraldry = await db.heraldry.toArray();
    return heraldry;
  } catch (error) {
    logger.error('❌ Error getting all heraldry:', error);
    throw error;
  }
}

/**
 * Get count of heraldry records without loading all data
 * More efficient than getAllHeraldry().length for stats
 * @param {string} [datasetId] - Dataset ID (optional)
 * @returns {Promise<number>} Count of heraldry records
 */
export async function getHeraldryCount(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    return await db.heraldry.count();
  } catch (error) {
    logger.error('❌ Error getting heraldry count:', error);
    return 0;
  }
}

/**
 * Update an existing heraldry record
 *
 * @param {number} id - The heraldry ID to update
 * @param {Object} updates - The fields to update
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} Number of records updated (1 or 0)
 */
export async function updateHeraldry(id, updates, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const updateData = {
      ...updates,
      updated: new Date().toISOString()
    };
    // Always update the 'updated' timestamp
    const result = await db.heraldry.update(id, updateData);
    logger.log('🛡️ Heraldry updated:', id);

    // Sync to cloud if userId and datasetId provided
    if (userId && datasetId) {
      await syncUpdateHeraldry(userId, datasetId, id, updateData);
    }

    return result;
  } catch (error) {
    logger.error('❌ Error updating heraldry:', error);
    throw error;
  }
}

/**
 * Delete a heraldry record
 * Also removes any associated heraldryLinks
 *
 * @param {number} id - The heraldry ID to delete
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<void>}
 */
export async function deleteHeraldry(id, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    // First, get all links to this heraldry (for cloud sync)
    const links = await db.heraldryLinks.where('heraldryId').equals(id).toArray();

    // Clear the denormalized heraldryId columns that mirror these links.
    // unlinkHeraldry() does this; deleting the heraldry outright used to skip
    // it, leaving houses and people pointing at a record that no longer exists
    // — while the UI promised "this will unlink it from any houses or people".
    const clearedHouses = [];
    const clearedPeople = [];
    for (const link of links) {
      if (link.entityType === 'house' && link.linkType === 'primary') {
        await db.houses.update(link.entityId, { heraldryId: null });
        clearedHouses.push(link.entityId);
      }
      if (link.entityType === 'person' && link.linkType === 'primary') {
        await db.people.update(link.entityId, { heraldryId: null });
        clearedPeople.push(link.entityId);
      }
    }

    // Any house/person that points here without a link row (legacy data)
    // must be cleared too, or the dangling id survives.
    const strayHouses = await db.houses.where('heraldryId').equals(id).toArray();
    for (const h of strayHouses) {
      if (!clearedHouses.includes(h.id)) {
        await db.houses.update(h.id, { heraldryId: null });
        clearedHouses.push(h.id);
      }
    }
    const strayPeople = await db.people.where('heraldryId').equals(id).toArray();
    for (const p of strayPeople) {
      if (!clearedPeople.includes(p.id)) {
        await db.people.update(p.id, { heraldryId: null });
        clearedPeople.push(p.id);
      }
    }

    // Remove all links to this heraldry
    await db.heraldryLinks.where('heraldryId').equals(id).delete();

    // Then delete the heraldry record itself
    await db.heraldry.delete(id);
    logger.log('🛡️ Heraldry deleted:', id);

    // Sync to cloud if userId and datasetId provided
    if (userId && datasetId) {
      for (const houseId of clearedHouses) {
        await syncUpdateHouse(userId, datasetId, houseId, { heraldryId: null });
      }
      for (const personId of clearedPeople) {
        await syncUpdatePerson(userId, datasetId, personId, { heraldryId: null });
      }
      // Delete all the links from cloud
      for (const link of links) {
        await syncDeleteHeraldryLink(userId, datasetId, link.id);
      }
      // Delete the heraldry from cloud
      await syncDeleteHeraldry(userId, datasetId, id);
    }
  } catch (error) {
    logger.error('❌ Error deleting heraldry:', error);
    throw error;
  }
}

// ==================== HERALDRY LINKS ====================

/**
 * Link a heraldry record to an entity (house, person, location, event)
 *
 * @param {Object} linkData - The link data
 * @param {number} linkData.heraldryId - The heraldry record ID
 * @param {string} linkData.entityType - 'house' | 'person' | 'location' | 'event'
 * @param {number} linkData.entityId - The entity's ID
 * @param {string} linkData.linkType - 'primary' | 'quartered' | 'impaled' | 'banner' | 'seal'
 * @param {string} [linkData.since] - Optional date when link started
 * @param {string} [linkData.until] - Optional date when link ended
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} The link ID
 */
export async function linkHeraldryToEntity(linkData, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const link = {
      heraldryId: linkData.heraldryId,
      entityType: linkData.entityType,
      entityId: linkData.entityId,
      linkType: linkData.linkType || 'primary',
      since: linkData.since || null,
      until: linkData.until || null,
      created: new Date().toISOString()
    };

    const id = await db.heraldryLinks.add(link);

    // If linking to a house, also update the house's heraldryId for quick access
    if (linkData.entityType === 'house' && linkData.linkType === 'primary') {
      await db.houses.update(linkData.entityId, { heraldryId: linkData.heraldryId });
    }

    // If linking to a person, also update the person's heraldryId for quick access
    // (Personal arms - Phase 4 feature)
    if (linkData.entityType === 'person' && linkData.linkType === 'primary') {
      await db.people.update(linkData.entityId, { heraldryId: linkData.heraldryId });
    }

    logger.log('🔗 Heraldry linked to', linkData.entityType, linkData.entityId);

    // Sync to cloud if userId and datasetId provided
    if (userId && datasetId) {
      await syncAddHeraldryLink(userId, datasetId, id, { ...link, id });
    }

    return id;
  } catch (error) {
    logger.error('❌ Error linking heraldry:', error);
    throw error;
  }
}

/**
 * Remove a heraldry link
 *
 * @param {number} linkId - The link ID to remove
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<void>}
 */
export async function unlinkHeraldry(linkId, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const link = await db.heraldryLinks.get(linkId);

    if (link) {
      // If this was a primary house link, clear the house's heraldryId
      if (link.entityType === 'house' && link.linkType === 'primary') {
        await db.houses.update(link.entityId, { heraldryId: null });
      }

      // If this was a primary person link, clear the person's heraldryId
      // (Personal arms - Phase 4 feature)
      if (link.entityType === 'person' && link.linkType === 'primary') {
        await db.people.update(link.entityId, { heraldryId: null });
      }

      await db.heraldryLinks.delete(linkId);
      logger.log('🔗 Heraldry link removed:', linkId);

      // Sync to cloud if userId and datasetId provided
      if (userId && datasetId) {
        await syncDeleteHeraldryLink(userId, datasetId, linkId);
      }
    }
  } catch (error) {
    logger.error('❌ Error unlinking heraldry:', error);
    throw error;
  }
}

/**
 * Get all links for a specific heraldry record
 * 
 * @param {number} heraldryId - The heraldry ID
 * @returns {Promise<Array>} Array of link records
 */
export async function getHeraldryLinks(heraldryId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const links = await db.heraldryLinks.where('heraldryId').equals(heraldryId).toArray();
    return links;
  } catch (error) {
    logger.error('❌ Error getting heraldry links:', error);
    throw error;
  }
}

/**
 * Get heraldry for a specific entity
 * 
 * @param {string} entityType - 'house' | 'person' | 'location' | 'event'
 * @param {number} entityId - The entity's ID
 * @returns {Promise<Array>} Array of heraldry records linked to this entity
 */
export async function getHeraldryForEntity(entityType, entityId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    // Get all links for this entity
    const links = await db.heraldryLinks
      .where('entityType').equals(entityType)
      .and(link => link.entityId === entityId)
      .toArray();
    
    // Fetch the actual heraldry records
    const heraldryIds = links.map(link => link.heraldryId);
    const heraldry = await db.heraldry.where('id').anyOf(heraldryIds).toArray();
    
    // Combine with link info
    return heraldry.map(h => {
      const link = links.find(l => l.heraldryId === h.id);
      return {
        ...h,
        linkType: link?.linkType,
        since: link?.since,
        until: link?.until
      };
    });
  } catch (error) {
    logger.error('❌ Error getting heraldry for entity:', error);
    throw error;
  }
}

// ==================== QUERY HELPERS ====================

/**
 * Get heraldry by category
 * 
 * @param {string} category - The category to filter by
 * @returns {Promise<Array>} Array of heraldry records in that category
 */
export async function getHeraldryByCategory(category, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.heraldry.toArray();
    return all.filter(h => h.category === category);
  } catch (error) {
    logger.error('❌ Error getting heraldry by category:', error);
    throw error;
  }
}

/**
 * Search heraldry by name or tags
 * 
 * @param {string} searchTerm - The search term
 * @returns {Promise<Array>} Matching heraldry records
 */
export async function searchHeraldry(searchTerm, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const term = searchTerm.toLowerCase();
    const all = await db.heraldry.toArray();
    
    return all.filter(h => {
      // Search in name
      if (h.name && h.name.toLowerCase().includes(term)) return true;
      
      // Search in description
      if (h.description && h.description.toLowerCase().includes(term)) return true;
      
      // Search in blazon
      if (h.blazon && h.blazon.toLowerCase().includes(term)) return true;
      
      // Search in tags
      if (h.tags && h.tags.some(tag => tag.toLowerCase().includes(term))) return true;
      
      return false;
    });
  } catch (error) {
    logger.error('❌ Error searching heraldry:', error);
    throw error;
  }
}

/**
 * Get heraldry statistics
 * 
 * @returns {Promise<Object>} Statistics object
 */
export async function getHeraldryStatistics(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.heraldry.toArray();
    const links = await db.heraldryLinks.toArray();
    
    // Count by category
    const byCategory = {};
    all.forEach(h => {
      const cat = h.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    
    // Count by shield type
    const byShieldType = {};
    all.forEach(h => {
      const type = h.shieldType || 'heater';
      byShieldType[type] = (byShieldType[type] || 0) + 1;
    });
    
    // Count linked entities
    const linkedHouses = new Set(links.filter(l => l.entityType === 'house').map(l => l.entityId)).size;
    const linkedPeople = new Set(links.filter(l => l.entityType === 'person').map(l => l.entityId)).size;
    
    return {
      total: all.length,
      byCategory,
      byShieldType,
      linkedHouses,
      linkedPeople,
      templates: all.filter(h => h.isTemplate).length,
      withBlazon: all.filter(h => h.blazon).length
    };
  } catch (error) {
    logger.error('❌ Error getting heraldry statistics:', error);
    throw error;
  }
}

/**
 * Get recently updated heraldry
 * 
 * @param {number} limit - Maximum number to return
 * @returns {Promise<Array>} Recent heraldry records
 */
export async function getRecentHeraldry(limit = 5, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.heraldry.toArray();
    return all
      .sort((a, b) => new Date(b.updated) - new Date(a.updated))
      .slice(0, limit);
  } catch (error) {
    logger.error('❌ Error getting recent heraldry:', error);
    throw error;
  }
}

/**
 * Get heraldry templates
 * 
 * @returns {Promise<Array>} Heraldry records marked as templates
 */
export async function getHeraldryTemplates(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.heraldry.toArray();
    return all.filter(h => h.isTemplate);
  } catch (error) {
    logger.error('❌ Error getting heraldry templates:', error);
    throw error;
  }
}

// ==================== PERSONAL ARMS HELPERS (Phase 4) ====================

/**
 * Get personal arms for a specific person
 * 
 * @param {number} personId - The person's ID
 * @returns {Promise<Object|null>} The person's primary heraldry record or null
 */
export async function getPersonalArms(personId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    // First try quick lookup via person's heraldryId
    const person = await db.people.get(personId);
    if (person?.heraldryId) {
      const heraldry = await db.heraldry.get(person.heraldryId);
      if (heraldry) return heraldry;
    }

    // Fallback to links table
    const heraldryList = await getHeraldryForEntity('person', personId, datasetId);
    const primary = heraldryList.find(h => h.linkType === 'primary');
    return primary || null;
  } catch (error) {
    logger.error('❌ Error getting personal arms:', error);
    return null;
  }
}

/**
 * Create personal arms derived from house arms with cadency marks
 * 
 * This is the main function for creating differenced arms for legitimate sons.
 * It copies the parent house's arms and adds cadency information.
 * 
 * @param {Object} options - Creation options
 * @param {number} options.personId - The person to create arms for
 * @param {number} options.houseHeraldryId - The house heraldry to derive from
 * @param {number} options.birthPosition - Birth order position (1st, 2nd, etc.)
 * @param {Object} options.cadencyComposition - The cadency marks configuration
 * @param {string} [options.name] - Custom name for the arms
 * @returns {Promise<number>} The new heraldry ID
 */
export async function createPersonalArmsFromHouse(options, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const { personId, houseHeraldryId, birthPosition, cadencyComposition, name } = options;

    // Get the parent house's heraldry
    const houseHeraldry = await db.heraldry.get(houseHeraldryId);
    if (!houseHeraldry) {
      throw new Error('House heraldry not found');
    }

    // Get the person for naming
    const person = await db.people.get(personId);
    if (!person) {
      throw new Error('Person not found');
    }

    // Create the personal arms record
    const heraldryId = await createHeraldry({
      name: name || `Arms of ${person.firstName} ${person.lastName}`,
      description: `Personal arms derived from house arms with ${birthPosition} son cadency`,
      
      // Copy visual data from house (will be modified with cadency overlay)
      heraldrySVG: houseHeraldry.heraldrySVG,
      heraldrySourceSVG: houseHeraldry.heraldrySourceSVG,
      heraldryThumbnail: houseHeraldry.heraldryThumbnail,
      heraldryDisplay: houseHeraldry.heraldryDisplay,
      heraldryHighRes: houseHeraldry.heraldryHighRes,
      shieldType: houseHeraldry.shieldType,
      
      // Decision C3, step 3. This spread the house composition raw, which had
      // two problems. It propagated whatever storage version the house record
      // happened to be in, so derived arms inherited a legacy format; and when
      // the house had *no* composition — uploaded or generated arms — the
      // spread of null produced `{ cadency }` alone, an object with no field
      // and no root. Read back, that parses as a legacy composition and
      // migrates into a default azure coat, fabricating arms for a house whose
      // arms were only ever an image.
      //
      // Now: normalise to the current version, and if there is nothing to
      // derive from, derive nothing.
      composition: (() => {
        const base = readComposition(houseHeraldry.composition);
        if (!base) return null;
        return {
          ...base,
          cadency: cadencyComposition || {
            type: 'triangles',
            count: birthPosition,
            position: 'chief',
            tincture: 'sable'
          }
        };
      })(),
      
      // Classification
      category: 'personal',
      tags: ['personal arms', 'cadency', `${birthPosition} son`, person.lastName],
      
      // Lineage - link to parent house's heraldry
      parentHeraldryId: houseHeraldryId,
      derivationType: 'cadency',
      
      // Metadata
      metadata: {
        personId,
        birthPosition,
        derivedFrom: houseHeraldry.name
      }
    }, null, datasetId);

    // Link the heraldry to the person
    await linkHeraldryToEntity({
      heraldryId,
      entityType: 'person',
      entityId: personId,
      linkType: 'primary'
    }, null, datasetId);
    
    logger.log('�\udee1️ Personal arms created for', person.firstName, person.lastName, 'with ID:', heraldryId);
    return heraldryId;
  } catch (error) {
    logger.error('❌ Error creating personal arms:', error);
    throw error;
  }
}

/**
 * Check if a person already has personal arms
 * 
 * @param {number} personId - The person's ID
 * @returns {Promise<boolean>} True if person has personal arms
 */
export async function hasPersonalArms(personId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const person = await db.people.get(personId);
    if (person?.heraldryId) return true;

    // Check links table as fallback
    const links = await db.heraldryLinks
      .where('entityType').equals('person')
      .and(link => link.entityId === personId && link.linkType === 'primary')
      .first();
    
    return !!links;
  } catch (error) {
    logger.error('❌ Error checking personal arms:', error);
    return false;
  }
}

/**
 * Get all people with personal arms
 * 
 * @returns {Promise<Array>} Array of {person, heraldry} objects
 */
export async function getPeopleWithPersonalArms(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    // Get all person links
    const personLinks = await db.heraldryLinks
      .where('entityType').equals('person')
      .and(link => link.linkType === 'primary')
      .toArray();
    
    const results = [];
    
    for (const link of personLinks) {
      const person = await db.people.get(link.entityId);
      const heraldry = await db.heraldry.get(link.heraldryId);
      
      if (person && heraldry) {
        results.push({ person, heraldry });
      }
    }
    
    return results;
  } catch (error) {
    logger.error('❌ Error getting people with personal arms:', error);
    return [];
  }
}

export default {
  // CRUD
  createHeraldry,
  getHeraldry,
  getAllHeraldry,
  updateHeraldry,
  deleteHeraldry,
  
  // Links
  linkHeraldryToEntity,
  unlinkHeraldry,
  getHeraldryLinks,
  getHeraldryForEntity,
  
  // Queries
  getHeraldryByCategory,
  searchHeraldry,
  getHeraldryStatistics,
  getRecentHeraldry,
  getHeraldryTemplates,
  
  // Personal Arms (Phase 4)
  getPersonalArms,
  createPersonalArmsFromHouse,
  hasPersonalArms,
  getPeopleWithPersonalArms
};
