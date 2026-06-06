/**
 * BulkFamilyImport.js - Bulk Family Import Utility
 *
 * PURPOSE:
 * Process a family import template with temporary IDs and convert them
 * to real database IDs while maintaining all relationships.
 *
 * SUPPORTS BOTH:
 * - Temp IDs (strings): For new entities defined in the template
 * - Existing IDs (numbers): For referencing entities already in the database
 *
 * WHAT THIS DOES:
 * 1. Validates the template structure (including verifying existing IDs)
 * 2. Creates houses first (since people reference them)
 * 3. Creates people with real house IDs
 * 4. Creates relationships with real person IDs (can link to existing people)
 * 5. Optionally creates Codex entries, heraldry, and dignities
 * 6. Returns a detailed report of what was created
 *
 * USAGE:
 * import { processFamilyImport } from './utils/bulkFamilyImport';
 *
 * const result = await processFamilyImport(templateData);
 * if (result.success) {
 *   console.log('Created:', result.summary);
 * } else {
 *   console.error('Errors:', result.errors);
 * }
 *
 * REFERENCING EXISTING ENTITIES:
 * - Use numeric IDs to reference existing houses/people
 * - Example: "houseId": 24  (references existing House Wilfson)
 * - Example: "person1Id": 343  (references existing Jon Wilfson)
 */

import { getDatabase, addHouse, addPerson, addRelationship } from '../services/database';
import { createEntry } from '../services/codexService';

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR EXISTING ID SUPPORT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an ID is an existing database ID (number) vs a temp ID (string)
 */
function isExistingId(id) {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

/**
 * Check if an ID is a temp ID (string)
 */
function isTempId(id) {
  return typeof id === 'string' && id.length > 0;
}

/**
 * Resolve a house ID - returns the real database ID
 * @param {string|number} id - Either a temp ID or existing database ID
 * @param {Map} houseIdMap - Map of temp IDs to real IDs
 * @returns {number|null} - The real database ID or null if not found
 */
function resolveHouseId(id, houseIdMap) {
  if (isExistingId(id)) {
    return id; // Already a real ID
  }
  if (isTempId(id)) {
    return houseIdMap.get(id) || null;
  }
  return null;
}

/**
 * Resolve a person ID - returns the real database ID
 * @param {string|number} id - Either a temp ID or existing database ID
 * @param {Map} personIdMap - Map of temp IDs to real IDs
 * @returns {number|null} - The real database ID or null if not found
 */
function resolvePersonId(id, personIdMap) {
  if (isExistingId(id)) {
    return id; // Already a real ID
  }
  if (isTempId(id)) {
    return personIdMap.get(id) || null;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate the template structure before processing
 * Now supports both temp IDs (strings) and existing database IDs (numbers)
 *
 * @param {Object} template - The import template
 * @param {Object} options - Validation options
 * @param {string} options.datasetId - Dataset ID for checking existing entities
 * @returns {Promise<Object>} - { valid: boolean, errors: string[], existingRefs: object }
 */
export async function validateTemplate(template, options = {}) {
  const { datasetId = 'default' } = options;
  const errors = [];
  const warnings = [];

  // Track references to existing entities for the report
  const existingRefs = {
    houses: [],
    people: []
  };

  // Check for required sections - houses array is now optional if using all existing houses
  if (!template.houses) {
    template.houses = []; // Default to empty array
  }
  if (!Array.isArray(template.houses)) {
    errors.push('Invalid "houses" - must be an array');
  }
  if (!template.people || !Array.isArray(template.people)) {
    errors.push('Missing or invalid "people" array');
  }
  if (!template.relationships || !Array.isArray(template.relationships)) {
    errors.push('Missing or invalid "relationships" array');
  }

  // Early return if structure is fundamentally broken
  if (errors.length > 0) {
    return { valid: false, errors, warnings, existingRefs };
  }

  // Get database for checking existing entities
  const db = getDatabase(datasetId);

  // Collect all temp IDs for reference checking
  const houseTempIds = new Set(template.houses.map((h) => h._tempId).filter(Boolean));
  const peopleTempIds = new Set(template.people.map((p) => p._tempId).filter(Boolean));

  // Cache for existing entity lookups (avoid repeated DB calls)
  const existingHouseCache = new Map();
  const existingPersonCache = new Map();

  /**
   * Check if a house ID is valid (either temp ID or existing in DB)
   */
  async function isValidHouseRef(id) {
    if (isTempId(id)) {
      return houseTempIds.has(id);
    }
    if (isExistingId(id)) {
      if (existingHouseCache.has(id)) {
        return existingHouseCache.get(id);
      }
      try {
        const house = await db.houses.get(id);
        const exists = !!house;
        existingHouseCache.set(id, exists);
        if (exists) {
          existingRefs.houses.push({ id, name: house.houseName });
        }
        return exists;
      } catch {
        existingHouseCache.set(id, false);
        return false;
      }
    }
    return false;
  }

  /**
   * Check if a person ID is valid (either temp ID or existing in DB)
   */
  async function isValidPersonRef(id) {
    if (isTempId(id)) {
      return peopleTempIds.has(id);
    }
    if (isExistingId(id)) {
      if (existingPersonCache.has(id)) {
        return existingPersonCache.get(id);
      }
      try {
        const person = await db.people.get(id);
        const exists = !!person;
        existingPersonCache.set(id, exists);
        if (exists) {
          existingRefs.people.push({
            id,
            name: `${person.firstName} ${person.lastName}`
          });
        }
        return exists;
      } catch {
        existingPersonCache.set(id, false);
        return false;
      }
    }
    return false;
  }

  // Validate houses
  for (const [index, house] of template.houses.entries()) {
    if (!house._tempId) {
      errors.push(`House at index ${index}: Missing _tempId`);
    }
    if (!house.houseName) {
      errors.push(`House "${house._tempId || index}": Missing houseName`);
    }
    // Check parentHouseId references (can be temp ID or existing ID)
    if (house.parentHouseId) {
      const isValid = await isValidHouseRef(house.parentHouseId);
      if (!isValid) {
        errors.push(
          `House "${house._tempId}": parentHouseId "${house.parentHouseId}" not found`
        );
      }
    }
    // Check foundedBy references (can be temp ID or existing ID)
    if (house.foundedBy) {
      const isValid = await isValidPersonRef(house.foundedBy);
      if (!isValid) {
        errors.push(
          `House "${house._tempId}": foundedBy "${house.foundedBy}" not found`
        );
      }
    }
  }

  // Validate people
  for (const [index, person] of template.people.entries()) {
    if (!person._tempId) {
      errors.push(`Person at index ${index}: Missing _tempId`);
    }
    if (!person.firstName) {
      errors.push(`Person "${person._tempId || index}": Missing firstName`);
    }
    if (!person.lastName) {
      errors.push(`Person "${person._tempId || index}": Missing lastName`);
    }
    if (!person.gender) {
      errors.push(`Person "${person._tempId || index}": Missing gender`);
    }
    if (person.houseId === undefined || person.houseId === null) {
      errors.push(`Person "${person._tempId || index}": Missing houseId`);
    } else {
      const isValid = await isValidHouseRef(person.houseId);
      if (!isValid) {
        errors.push(
          `Person "${person._tempId}": houseId "${person.houseId}" not found (must be a temp ID from houses array or existing house ID number)`
        );
      }
    }

    // Validate gender
    if (person.gender && !['male', 'female', 'other'].includes(person.gender)) {
      errors.push(`Person "${person._tempId}": Invalid gender "${person.gender}"`);
    }

    // Validate legitimacyStatus
    if (
      person.legitimacyStatus &&
      !['legitimate', 'bastard', 'adopted', 'unknown'].includes(person.legitimacyStatus)
    ) {
      errors.push(
        `Person "${person._tempId}": Invalid legitimacyStatus "${person.legitimacyStatus}"`
      );
    }
  }

  // Validate relationships
  for (const [index, rel] of template.relationships.entries()) {
    if (rel.person1Id === undefined || rel.person1Id === null) {
      errors.push(`Relationship at index ${index}: Missing person1Id`);
    } else {
      const isValid = await isValidPersonRef(rel.person1Id);
      if (!isValid) {
        errors.push(
          `Relationship ${index}: person1Id "${rel.person1Id}" not found (must be a temp ID or existing person ID number)`
        );
      }
    }

    if (rel.person2Id === undefined || rel.person2Id === null) {
      errors.push(`Relationship at index ${index}: Missing person2Id`);
    } else {
      const isValid = await isValidPersonRef(rel.person2Id);
      if (!isValid) {
        errors.push(
          `Relationship ${index}: person2Id "${rel.person2Id}" not found (must be a temp ID or existing person ID number)`
        );
      }
    }

    if (!rel.relationshipType) {
      errors.push(`Relationship at index ${index}: Missing relationshipType`);
    } else if (
      !['parent', 'spouse', 'adopted-parent', 'foster-parent', 'mentor', 'named-after'].includes(
        rel.relationshipType
      )
    ) {
      errors.push(`Relationship ${index}: Invalid relationshipType "${rel.relationshipType}"`);
    }
  }

  // Validate codex entries if present
  if (template.codexEntries && Array.isArray(template.codexEntries)) {
    for (const [index, entry] of template.codexEntries.entries()) {
      if (!entry._tempId) {
        errors.push(`Codex entry at index ${index}: Missing _tempId`);
      }
      if (!entry.type) {
        errors.push(`Codex entry "${entry._tempId || index}": Missing type`);
      }
      if (!entry.title) {
        errors.push(`Codex entry "${entry._tempId || index}": Missing title`);
      }

      // Check auto-link references (can be temp ID or existing ID)
      if (entry._autoLink) {
        if (entry._autoLink.entityType === 'house' && entry._autoLink.entityId) {
          const isValid = await isValidHouseRef(entry._autoLink.entityId);
          if (!isValid) {
            errors.push(
              `Codex entry "${entry._tempId}": _autoLink.entityId "${entry._autoLink.entityId}" not found`
            );
          }
        }
        if (entry._autoLink.entityType === 'person' && entry._autoLink.personId) {
          const isValid = await isValidPersonRef(entry._autoLink.personId);
          if (!isValid) {
            errors.push(
              `Codex entry "${entry._tempId}": _autoLink.personId "${entry._autoLink.personId}" not found`
            );
          }
        }
      }
    }
  }

  // Add info about existing references found
  if (existingRefs.houses.length > 0 || existingRefs.people.length > 0) {
    warnings.push(
      `Template references ${existingRefs.houses.length} existing house(s) and ${existingRefs.people.length} existing person(s)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    existingRefs
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a family import template and create all entities
 * @param {Object} template - The import template
 * @param {Object} options - Import options
 * @param {boolean} options.skipCodex - Skip creating Codex entries
 * @param {boolean} options.skipHeraldry - Skip creating heraldry
 * @param {boolean} options.skipDignities - Skip creating dignities
 * @param {Function} options.onProgress - Progress callback (step, message)
 * @param {string} options.datasetId - Dataset ID for multi-dataset support
 * @returns {Object} - Import result with summary and ID mappings
 */
export async function processFamilyImport(template, options = {}) {
  const {
    skipCodex = false,
    skipHeraldry = true,  // Default to skip since heraldry needs visual design
    skipDignities = true, // Default to skip for simpler imports
    onProgress = () => {},
    datasetId = 'default' // CRITICAL: Must pass dataset ID for correct database
  } = options;
  
  // Get the correct database instance for this dataset
  const db = getDatabase(datasetId);
  
  // Validate first (async - checks existing IDs in database)
  const validation = await validateTemplate(template, { datasetId });
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings || [],
      existingRefs: validation.existingRefs || { houses: [], people: [] },
      summary: null,
      idMappings: null
    };
  }
  
  // ID mapping objects: tempId -> realId
  const houseIdMap = new Map();
  const personIdMap = new Map();
  const codexIdMap = new Map();
  const heraldryIdMap = new Map();
  const dignityIdMap = new Map();
  
  // Results tracking
  const created = {
    houses: [],
    people: [],
    relationships: [],
    codexEntries: [],
    heraldry: [],
    dignities: []
  };
  
  const errors = [];
  
  try {
    // ─────────────────────────────────────────────────────────────────────
    // STEP 1: Create Houses
    // ─────────────────────────────────────────────────────────────────────
    onProgress('houses', `Creating ${template.houses.length} houses...`);
    
    // Sort houses so parent houses are created before cadet branches
    const sortedHouses = sortHousesByDependency(template.houses);
    
    for (const house of sortedHouses) {
      try {
        // Clean the house data (remove template-specific fields)
        const houseData = {
          houseName: house.houseName,
          houseType: house.houseType || 'main',
          colorCode: house.colorCode || '#4169E1',
          motto: house.motto || null,
          sigil: house.sigil || null,
          foundedDate: house.foundedDate || null,
          foundedBy: null, // Will update after people are created
          swornTo: null,   // Will update after all houses are created
          notes: house.notes || ''
        };
        
        // Resolve parentHouseId if present - supports both temp IDs and existing IDs
        if (house.parentHouseId) {
          const realParentId = resolveHouseId(house.parentHouseId, houseIdMap);
          if (realParentId) {
            houseData.parentHouseId = realParentId;
          } else {
            errors.push(`House "${house._tempId}": Could not resolve parentHouseId`);
          }
        }
        
        // Create the house (skipCodexCreation to prevent auto-creation)
        const realId = await addHouse(houseData, { skipCodexCreation: true, datasetId });
        houseIdMap.set(house._tempId, realId);
        
        created.houses.push({
          tempId: house._tempId,
          realId,
          name: house.houseName
        });
        
      } catch (err) {
        errors.push(`Failed to create house "${house._tempId}": ${err.message}`);
      }
    }
    
    // Update swornTo references now that all houses exist
    for (const house of template.houses) {
      if (house.swornTo) {
        const realId = houseIdMap.get(house._tempId);
        const realSwornToId = resolveHouseId(house.swornTo, houseIdMap);
        if (realId && realSwornToId) {
          await db.houses.update(realId, { swornTo: realSwornToId });
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // STEP 2: Create People
    // ─────────────────────────────────────────────────────────────────────
    onProgress('people', `Creating ${template.people.length} people...`);

    for (const person of template.people) {
      try {
        // Resolve houseId - supports both temp IDs and existing IDs
        const realHouseId = resolveHouseId(person.houseId, houseIdMap);
        if (!realHouseId) {
          errors.push(
            `Person "${person._tempId}": Could not resolve houseId "${person.houseId}"`
          );
          continue;
        }

        // Resolve swornToHouseId (can be temp ID or existing DB ID)
        const resolvedSwornTo = person.swornToHouseId
          ? resolveHouseId(person.swornToHouseId, houseIdMap) || null
          : null;

        // Clean the person data
        const personData = {
          firstName: person.firstName,
          lastName: person.lastName,
          maidenName: person.maidenName || null,
          dateOfBirth: person.dateOfBirth || null,
          dateOfDeath: person.dateOfDeath || null,
          gender: person.gender,
          houseId: realHouseId,
          swornToHouseId: resolvedSwornTo,
          legitimacyStatus: person.legitimacyStatus || 'legitimate',
          bastardStatus: person.bastardStatus || null,
          notes: person.notes || '',
          epithets: person.epithets || [],
          codexEntryId: null // Will be set if Codex entries are created
        };

        // Create the person
        const realId = await addPerson(personData, datasetId);
        personIdMap.set(person._tempId, realId);

        created.people.push({
          tempId: person._tempId,
          realId,
          name: `${person.firstName} ${person.lastName}`
        });
      } catch (err) {
        errors.push(`Failed to create person "${person._tempId}": ${err.message}`);
      }
    }
    
    // Update foundedBy references now that people exist
    // Supports both temp IDs and existing person IDs
    for (const house of template.houses) {
      if (house.foundedBy) {
        const realHouseId = houseIdMap.get(house._tempId);
        const realFounderId = resolvePersonId(house.foundedBy, personIdMap);
        if (realHouseId && realFounderId) {
          await db.houses.update(realHouseId, { foundedBy: realFounderId });
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // STEP 3: Create Relationships
    // ─────────────────────────────────────────────────────────────────────
    onProgress('relationships', `Creating ${template.relationships.length} relationships...`);

    for (const rel of template.relationships) {
      try {
        // Resolve person IDs - supports both temp IDs and existing IDs
        const realPerson1Id = resolvePersonId(rel.person1Id, personIdMap);
        const realPerson2Id = resolvePersonId(rel.person2Id, personIdMap);

        if (!realPerson1Id) {
          errors.push(`Relationship: Could not resolve person1Id "${rel.person1Id}"`);
          continue;
        }
        if (!realPerson2Id) {
          errors.push(`Relationship: Could not resolve person2Id "${rel.person2Id}"`);
          continue;
        }

        // Clean the relationship data
        const relData = {
          person1Id: realPerson1Id,
          person2Id: realPerson2Id,
          relationshipType: rel.relationshipType,
          biologicalParent: rel.biologicalParent ?? null,
          marriageDate: rel.marriageDate || null,
          divorceDate: rel.divorceDate || null,
          marriageStatus: rel.marriageStatus || null
        };

        // Create the relationship
        const realId = await addRelationship(relData, datasetId);

        created.relationships.push({
          realId,
          type: rel.relationshipType,
          person1: rel.person1Id,
          person2: rel.person2Id
        });
      } catch (err) {
        errors.push(`Failed to create relationship: ${err.message}`);
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // STEP 4: Create Codex Entries (Optional)
    // ─────────────────────────────────────────────────────────────────────
    if (!skipCodex && template.codexEntries && template.codexEntries.length > 0) {
      onProgress('codex', `Creating ${template.codexEntries.length} Codex entries...`);
      
      for (const entry of template.codexEntries) {
        try {
          // Build entry data
          const entryData = {
            type: entry.type,
            title: entry.title,
            subtitle: entry.subtitle || '',
            content: entry.content || '',
            category: entry.category || null,
            tags: entry.tags || [],
            era: entry.era || null
          };
          
          // Handle auto-linking - supports both temp IDs and existing IDs
          if (entry._autoLink) {
            if (entry._autoLink.entityType === 'house' && entry._autoLink.entityId) {
              const realHouseId = resolveHouseId(entry._autoLink.entityId, houseIdMap);
              if (realHouseId) {
                entryData.houseId = realHouseId;
              }
            }
            if (entry._autoLink.entityType === 'person' && entry._autoLink.personId) {
              const realPersonId = resolvePersonId(entry._autoLink.personId, personIdMap);
              if (realPersonId) {
                entryData.personId = realPersonId;
              }
            }
          }
          
          // Create the entry
          const realId = await createEntry(entryData);
          codexIdMap.set(entry._tempId, realId);
          
          // Update the linked entity with codexEntryId
          if (entryData.houseId) {
            await db.houses.update(entryData.houseId, { codexEntryId: realId });
          }
          if (entryData.personId) {
            await db.people.update(entryData.personId, { codexEntryId: realId });
          }
          
          created.codexEntries.push({
            tempId: entry._tempId,
            realId,
            title: entry.title
          });
          
        } catch (err) {
          errors.push(`Failed to create Codex entry "${entry._tempId}": ${err.message}`);
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // STEP 5: Summary
    // ─────────────────────────────────────────────────────────────────────
    onProgress('complete', 'Import complete!');
    
    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : null,
      summary: {
        housesCreated: created.houses.length,
        peopleCreated: created.people.length,
        relationshipsCreated: created.relationships.length,
        codexEntriesCreated: created.codexEntries.length,
        heraldryCreated: created.heraldry.length,
        dignitiesCreated: created.dignities.length
      },
      created,
      idMappings: {
        houses: Object.fromEntries(houseIdMap),
        people: Object.fromEntries(personIdMap),
        codex: Object.fromEntries(codexIdMap),
        heraldry: Object.fromEntries(heraldryIdMap),
        dignities: Object.fromEntries(dignityIdMap)
      }
    };
    
  } catch (err) {
    return {
      success: false,
      errors: [`Critical error during import: ${err.message}`],
      summary: null,
      idMappings: null
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sort houses so parent houses are created before their cadet branches
 * This ensures parentHouseId can be resolved during creation
 */
function sortHousesByDependency(houses) {
  const result = [];
  const processed = new Set();
  const tempIdToHouse = new Map(houses.map(h => [h._tempId, h]));
  
  function addHouse(house) {
    if (processed.has(house._tempId)) return;
    
    // If this house has a parent, add the parent first
    if (house.parentHouseId) {
      const parent = tempIdToHouse.get(house.parentHouseId);
      if (parent && !processed.has(parent._tempId)) {
        addHouse(parent);
      }
    }
    
    result.push(house);
    processed.add(house._tempId);
  }
  
  houses.forEach(addHouse);
  return result;
}

/**
 * Generate a summary report of the import
 */
export function generateImportReport(result) {
  if (!result.success) {
    return {
      title: 'Import Failed',
      message: `Import encountered ${result.errors.length} error(s)`,
      errors: result.errors
    };
  }
  
  const lines = [
    '✅ Import Successful!',
    '',
    '📊 Summary:',
    `   • ${result.summary.housesCreated} house(s) created`,
    `   • ${result.summary.peopleCreated} people created`,
    `   • ${result.summary.relationshipsCreated} relationship(s) created`
  ];
  
  if (result.summary.codexEntriesCreated > 0) {
    lines.push(`   • ${result.summary.codexEntriesCreated} Codex entries created`);
  }
  
  if (result.created.houses.length > 0) {
    lines.push('', '🏰 Houses:');
    result.created.houses.forEach(h => {
      lines.push(`   • ${h.name} (ID: ${h.realId})`);
    });
  }
  
  return {
    title: 'Import Successful',
    message: lines.join('\n'),
    errors: null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
  validateTemplate,
  processFamilyImport,
  generateImportReport
};
