/**
 * AI Data Service - Full Data Collection for AI Context
 *
 * This service collects ALL LineageWeaver data and prepares it for AI consumption.
 * It provides the foundation for the AI Assistant to have complete READ access
 * to all genealogy data, codex entries, heraldry, dignities, and relationships.
 *
 * KEY FEATURES:
 * - Collects data from all major systems (People, Houses, Codex, Heraldry, Dignities)
 * - Builds lookup maps for efficient cross-referencing
 * - Generates statistics for data overview
 * - Formats data for AI consumption with token optimization
 */

import {
  getAllPeople,
  getAllHouses,
  getAllRelationships
} from './database';

import {
  getAllEntries as getAllCodexEntries,
  getCodexStatistics
} from './codexService';

import {
  getAllHeraldry,
  getHeraldryStatistics,
  getHeraldryForEntity
} from './heraldryService';

import {
  getAllDignities,
  getTenuresForPerson,
  getDignityStatistics,
  getAllDisputes
} from './dignityService';

import { getDatabase } from './database';
import { logger } from '../utils/logger';

// ==================== MAIN DATA COLLECTION ====================

/**
 * Collect full data context for AI consumption
 *
 * @param {string} datasetId - The dataset ID to collect data from
 * @returns {Promise<Object>} Complete data context
 */
export async function collectFullDataContext(datasetId = 'default') {
  try {
    logger.log('🤖 AI Data Service: Collecting full data context...');

    // Collect all data in parallel for efficiency
    const [
      people,
      houses,
      relationships,
      codexEntries,
      heraldry,
      dignities,
      householdRoles
    ] = await Promise.all([
      getAllPeople(datasetId),
      getAllHouses(datasetId),
      getAllRelationships(datasetId),
      getAllCodexEntries(datasetId),
      getAllHeraldry(datasetId),
      getAllDignities(datasetId),
      getHouseholdRoles(datasetId)
    ]);

    // Build lookup maps for efficient cross-referencing
    const lookupMaps = buildLookupMaps(people, houses, relationships, dignities, heraldry);

    // Calculate statistics
    const statistics = await calculateStatistics(people, houses, relationships, codexEntries, heraldry, dignities, datasetId);

    // Get dignity tenures for all people
    const dignityTenures = await collectDignityTenures(people, datasetId);

    // Get active disputes
    const activeDisputes = await getAllDisputes(datasetId);

    const context = {
      // Core data
      people,
      houses,
      relationships,
      codexEntries,
      heraldry,
      dignities,
      dignityTenures,
      householdRoles,
      activeDisputes,

      // Lookup maps
      lookupMaps,

      // Statistics
      statistics,

      // Metadata
      datasetId,
      collectedAt: new Date().toISOString()
    };

    logger.log('🤖 AI Data Service: Context collected', {
      people: people.length,
      houses: houses.length,
      relationships: relationships.length,
      codexEntries: codexEntries.length,
      heraldry: heraldry.length,
      dignities: dignities.length
    });

    return context;
  } catch (error) {
    logger.error('❌ AI Data Service: Error collecting data context:', error);
    throw error;
  }
}

/**
 * Get household roles from database
 */
async function getHouseholdRoles(datasetId) {
  try {
    const db = getDatabase(datasetId);
    if (db.householdRoles) {
      return await db.householdRoles.toArray();
    }
    return [];
  } catch (error) {
    logger.warn('Could not fetch household roles:', error);
    return [];
  }
}

/**
 * Collect dignity tenures for all people
 */
async function collectDignityTenures(people, datasetId) {
  const tenuresMap = new Map();

  for (const person of people) {
    try {
      const tenures = await getTenuresForPerson(person.id, datasetId);
      if (tenures.length > 0) {
        tenuresMap.set(person.id, tenures);
      }
    } catch (error) {
      // Skip on error - don't fail the whole collection
    }
  }

  return tenuresMap;
}

// ==================== LOOKUP MAPS ====================

/**
 * Build lookup maps for efficient cross-referencing
 *
 * @param {Array} people - All people
 * @param {Array} houses - All houses
 * @param {Array} relationships - All relationships
 * @param {Array} dignities - All dignities
 * @param {Array} heraldry - All heraldry
 * @returns {Object} Lookup maps
 */
export function buildLookupMaps(people, houses, relationships, dignities, heraldry) {
  // People by ID
  const peopleById = new Map(people.map(p => [p.id, p]));

  // Houses by ID
  const housesById = new Map(houses.map(h => [h.id, h]));

  // Heraldry by ID
  const heraldryById = new Map(heraldry.map(h => [h.id, h]));

  // Dignities by ID
  const dignitiesById = new Map(dignities.map(d => [d.id, d]));

  // Parent map: childId -> [parentIds]
  const parentMap = new Map();

  // Children map: parentId -> [childIds]
  const childrenMap = new Map();

  // Spouse map: personId -> [spouseIds]
  const spouseMap = new Map();

  // Sibling map: personId -> [siblingIds]
  const siblingMap = new Map();

  // Process relationships
  relationships.forEach(rel => {
    const { person1Id, person2Id, relationshipType } = rel;

    if (relationshipType === 'parent') {
      // person1Id is parent of person2Id
      if (!childrenMap.has(person1Id)) {
        childrenMap.set(person1Id, []);
      }
      childrenMap.get(person1Id).push(person2Id);

      if (!parentMap.has(person2Id)) {
        parentMap.set(person2Id, []);
      }
      parentMap.get(person2Id).push(person1Id);

    } else if (relationshipType === 'child') {
      // person1Id is child of person2Id
      if (!parentMap.has(person1Id)) {
        parentMap.set(person1Id, []);
      }
      parentMap.get(person1Id).push(person2Id);

      if (!childrenMap.has(person2Id)) {
        childrenMap.set(person2Id, []);
      }
      childrenMap.get(person2Id).push(person1Id);

    } else if (relationshipType === 'spouse' || relationshipType === 'married') {
      // Bidirectional spouse relationship
      if (!spouseMap.has(person1Id)) {
        spouseMap.set(person1Id, []);
      }
      if (!spouseMap.has(person2Id)) {
        spouseMap.set(person2Id, []);
      }
      spouseMap.get(person1Id).push(person2Id);
      spouseMap.get(person2Id).push(person1Id);

    } else if (relationshipType === 'sibling') {
      // Bidirectional sibling relationship
      if (!siblingMap.has(person1Id)) {
        siblingMap.set(person1Id, []);
      }
      if (!siblingMap.has(person2Id)) {
        siblingMap.set(person2Id, []);
      }
      siblingMap.get(person1Id).push(person2Id);
      siblingMap.get(person2Id).push(person1Id);
    }
  });

  // Dignities by person
  const dignitiesByPerson = new Map();
  dignities.forEach(d => {
    if (d.currentHolderId) {
      if (!dignitiesByPerson.has(d.currentHolderId)) {
        dignitiesByPerson.set(d.currentHolderId, []);
      }
      dignitiesByPerson.get(d.currentHolderId).push(d);
    }
  });

  // Dignities by house
  const dignitiesByHouse = new Map();
  dignities.forEach(d => {
    if (d.currentHouseId) {
      if (!dignitiesByHouse.has(d.currentHouseId)) {
        dignitiesByHouse.set(d.currentHouseId, []);
      }
      dignitiesByHouse.get(d.currentHouseId).push(d);
    }
  });

  // Heraldry by house
  const heraldryByHouse = new Map();
  houses.forEach(h => {
    if (h.heraldryId) {
      heraldryByHouse.set(h.id, heraldryById.get(h.heraldryId));
    }
  });

  // People by house
  const peopleByHouse = new Map();
  people.forEach(p => {
    if (p.houseId) {
      if (!peopleByHouse.has(p.houseId)) {
        peopleByHouse.set(p.houseId, []);
      }
      peopleByHouse.get(p.houseId).push(p);
    }
  });

  return {
    peopleById,
    housesById,
    heraldryById,
    dignitiesById,
    parentMap,
    childrenMap,
    spouseMap,
    siblingMap,
    dignitiesByPerson,
    dignitiesByHouse,
    heraldryByHouse,
    peopleByHouse
  };
}

// ==================== STATISTICS ====================

/**
 * Calculate comprehensive statistics about the data
 */
async function calculateStatistics(people, houses, relationships, codexEntries, heraldry, dignities, datasetId) {
  // People statistics
  const peopleStats = {
    total: people.length,
    byGender: {},
    byLegitimacy: {},
    withCodexEntry: people.filter(p => p.codexEntryId).length,
    withHeraldry: people.filter(p => p.heraldryId).length,
    deceased: people.filter(p => p.dateOfDeath).length,
    living: people.filter(p => !p.dateOfDeath).length
  };

  people.forEach(p => {
    const gender = p.gender || 'unknown';
    const legitimacy = p.legitimacyStatus || 'unknown';
    peopleStats.byGender[gender] = (peopleStats.byGender[gender] || 0) + 1;
    peopleStats.byLegitimacy[legitimacy] = (peopleStats.byLegitimacy[legitimacy] || 0) + 1;
  });

  // House statistics
  const houseStats = {
    total: houses.length,
    byType: {},
    withHeraldry: houses.filter(h => h.heraldryId).length,
    withCodexEntry: houses.filter(h => h.codexEntryId).length,
    cadetBranches: houses.filter(h => h.houseType === 'cadet').length
  };

  houses.forEach(h => {
    const type = h.houseType || 'main';
    houseStats.byType[type] = (houseStats.byType[type] || 0) + 1;
  });

  // Relationship statistics
  const relationshipStats = {
    total: relationships.length,
    byType: {}
  };

  relationships.forEach(r => {
    const type = r.relationshipType || 'unknown';
    relationshipStats.byType[type] = (relationshipStats.byType[type] || 0) + 1;
  });

  // Codex statistics
  const codexStats = {
    total: codexEntries.length,
    byType: {}
  };

  codexEntries.forEach(e => {
    const type = e.type || 'custom';
    codexStats.byType[type] = (codexStats.byType[type] || 0) + 1;
  });

  // Heraldry statistics
  const heraldryStats = {
    total: heraldry.length,
    byCategory: {},
    unlinked: 0
  };

  heraldry.forEach(h => {
    const category = h.category || 'uncategorized';
    heraldryStats.byCategory[category] = (heraldryStats.byCategory[category] || 0) + 1;
  });

  // Dignity statistics
  const dignityStats = {
    total: dignities.length,
    byClass: {},
    vacant: dignities.filter(d => d.isVacant || !d.currentHolderId).length,
    hereditary: dignities.filter(d => d.isHereditary).length
  };

  dignities.forEach(d => {
    const cls = d.dignityClass || 'other';
    dignityStats.byClass[cls] = (dignityStats.byClass[cls] || 0) + 1;
  });

  return {
    people: peopleStats,
    houses: houseStats,
    relationships: relationshipStats,
    codex: codexStats,
    heraldry: heraldryStats,
    dignities: dignityStats
  };
}

// ==================== DATA FORMATTING FOR AI ====================

/**
 * Format data for AI consumption
 *
 * @param {Object} data - Full data context
 * @param {Object} options - Formatting options
 * @returns {string} Formatted data string
 */
export function formatDataForAI(data, options = {}) {
  const {
    contextLevel = 'standard', // 'minimal' | 'standard' | 'full'
    focusEntity = null, // { type: 'house' | 'person', id: number }
    maxTokens = 50000
  } = options;

  let output = [];

  // Add statistics overview
  output.push('=== DATA OVERVIEW ===');
  output.push(`People: ${data.statistics.people.total} (${data.statistics.people.living} living, ${data.statistics.people.deceased} deceased)`);
  output.push(`Houses: ${data.statistics.houses.total} (${data.statistics.houses.cadetBranches} cadet branches)`);
  output.push(`Relationships: ${data.statistics.relationships.total}`);
  output.push(`Codex Entries: ${data.statistics.codex.total}`);
  output.push(`Heraldry Records: ${data.statistics.heraldry.total}`);
  output.push(`Dignities: ${data.statistics.dignities.total} (${data.statistics.dignities.vacant} vacant)`);
  output.push('');

  // If focusing on a specific entity, prioritize that data
  if (focusEntity) {
    output.push(formatFocusEntity(data, focusEntity));
    output.push('');
  }

  // Format based on context level
  if (contextLevel === 'minimal') {
    output.push(formatMinimalContext(data));
  } else if (contextLevel === 'standard') {
    output.push(formatStandardContext(data));
  } else {
    output.push(formatFullContext(data));
  }

  let result = output.join('\n');

  // Truncate if needed
  if (result.length > maxTokens * 4) { // rough character to token ratio
    result = result.substring(0, maxTokens * 4) + '\n... [Data truncated for token limits]';
  }

  return result;
}

/**
 * Format a focused entity view
 */
function formatFocusEntity(data, focusEntity) {
  const { type, id } = focusEntity;
  const output = [`=== FOCUSED ENTITY: ${type.toUpperCase()} #${id} ===`];

  if (type === 'person') {
    const person = data.people.find(p => p.id === id);
    if (person) {
      output.push(formatPersonDetail(person, data));
    }
  } else if (type === 'house') {
    const house = data.houses.find(h => h.id === id);
    if (house) {
      output.push(formatHouseDetail(house, data));
    }
  }

  return output.join('\n');
}

/**
 * Format minimal context (statistics + key entities only)
 */
function formatMinimalContext(data) {
  const output = ['=== KEY ENTITIES ==='];

  // List houses with member counts
  output.push('\nHOUSES:');
  data.houses.forEach(house => {
    const members = data.people.filter(p => p.houseId === house.id).length;
    output.push(`- ${house.houseName} (${members} members) [ID: ${house.id}]`);
  });

  return output.join('\n');
}

/**
 * Format standard context (summaries + key relationships)
 */
function formatStandardContext(data) {
  const output = ['=== FULL DATASET ==='];

  // Houses with summary
  output.push('\nHOUSES:');
  data.houses.forEach(house => {
    output.push(formatHouseSummary(house, data));
  });

  // People summary by house
  output.push('\n\nPEOPLE:');
  data.houses.forEach(house => {
    const members = data.people.filter(p => p.houseId === house.id);
    if (members.length > 0) {
      output.push(`\n${house.houseName}:`);
      members.forEach(person => {
        output.push(`  - ${formatPersonSummary(person, data)}`);
      });
    }
  });

  // Unaffiliated people
  const unaffiliated = data.people.filter(p => !p.houseId);
  if (unaffiliated.length > 0) {
    output.push('\nUnaffiliated:');
    unaffiliated.forEach(person => {
      output.push(`  - ${formatPersonSummary(person, data)}`);
    });
  }

  // Dignities
  if (data.dignities.length > 0) {
    output.push('\n\nDIGNITIES:');
    data.dignities.forEach(dignity => {
      output.push(`- ${formatDignitySummary(dignity, data)}`);
    });
  }

  return output.join('\n');
}

/**
 * Format full context (everything)
 */
function formatFullContext(data) {
  const output = [formatStandardContext(data)];

  // Add codex entries
  if (data.codexEntries.length > 0) {
    output.push('\n\n=== CODEX ENTRIES ===');
    data.codexEntries.forEach(entry => {
      output.push(`\n[${entry.type}] ${entry.title}`);
      if (entry.subtitle) output.push(`  Subtitle: ${entry.subtitle}`);
      if (entry.category) output.push(`  Category: ${entry.category}`);
      if (entry.content) output.push(`  Content: ${entry.content.substring(0, 200)}${entry.content.length > 200 ? '...' : ''}`);
    });
  }

  // Add active disputes
  if (data.activeDisputes && data.activeDisputes.length > 0) {
    output.push('\n\n=== ACTIVE DISPUTES ===');
    data.activeDisputes.forEach(dispute => {
      if (dispute.resolution === 'ongoing') {
        output.push(`- ${dispute.dignityName}: ${dispute.claimType} claim (${dispute.claimStrength})`);
      }
    });
  }

  return output.join('\n');
}

// ==================== ENTITY FORMATTERS ====================

/**
 * Format person summary for AI
 */
function formatPersonSummary(person, data) {
  const parts = [`${person.firstName} ${person.lastName} [ID: ${person.id}]`];

  if (person.gender) parts.push(person.gender);
  if (person.legitimacyStatus && person.legitimacyStatus !== 'legitimate') {
    parts.push(`(${person.legitimacyStatus})`);
  }
  if (person.dateOfBirth) parts.push(`b.${person.dateOfBirth}`);
  if (person.dateOfDeath) parts.push(`d.${person.dateOfDeath}`);

  // Add dignities
  const dignities = data.lookupMaps.dignitiesByPerson.get(person.id);
  if (dignities && dignities.length > 0) {
    parts.push(`| Titles: ${dignities.map(d => d.shortName || d.name).join(', ')}`);
  }

  return parts.join(' ');
}

/**
 * Format person detail for AI
 */
function formatPersonDetail(person, data) {
  const output = [];

  output.push(`Name: ${person.firstName} ${person.lastName}`);
  output.push(`ID: ${person.id}`);
  if (person.gender) output.push(`Gender: ${person.gender}`);
  if (person.dateOfBirth) output.push(`Born: ${person.dateOfBirth}`);
  if (person.dateOfDeath) output.push(`Died: ${person.dateOfDeath}`);
  if (person.legitimacyStatus) output.push(`Legitimacy: ${person.legitimacyStatus}`);

  // House
  if (person.houseId) {
    const house = data.lookupMaps.housesById.get(person.houseId);
    if (house) output.push(`House: ${house.houseName}`);
  }

  // Parents
  const parents = data.lookupMaps.parentMap.get(person.id);
  if (parents && parents.length > 0) {
    const parentNames = parents.map(pid => {
      const p = data.lookupMaps.peopleById.get(pid);
      return p ? `${p.firstName} ${p.lastName}` : `Unknown (#${pid})`;
    });
    output.push(`Parents: ${parentNames.join(', ')}`);
  }

  // Spouses
  const spouses = data.lookupMaps.spouseMap.get(person.id);
  if (spouses && spouses.length > 0) {
    const spouseNames = spouses.map(sid => {
      const s = data.lookupMaps.peopleById.get(sid);
      return s ? `${s.firstName} ${s.lastName}` : `Unknown (#${sid})`;
    });
    output.push(`Spouse(s): ${spouseNames.join(', ')}`);
  }

  // Children
  const children = data.lookupMaps.childrenMap.get(person.id);
  if (children && children.length > 0) {
    const childNames = children.map(cid => {
      const c = data.lookupMaps.peopleById.get(cid);
      return c ? `${c.firstName} ${c.lastName}` : `Unknown (#${cid})`;
    });
    output.push(`Children: ${childNames.join(', ')}`);
  }

  // Dignities
  const dignities = data.lookupMaps.dignitiesByPerson.get(person.id);
  if (dignities && dignities.length > 0) {
    output.push(`Titles: ${dignities.map(d => d.name).join(', ')}`);
  }

  return output.join('\n');
}

/**
 * Format house summary for AI
 */
function formatHouseSummary(house, data) {
  const parts = [`${house.houseName} [ID: ${house.id}]`];

  if (house.houseType && house.houseType !== 'main') {
    parts.push(`(${house.houseType})`);
  }

  const members = data.people.filter(p => p.houseId === house.id);
  parts.push(`- ${members.length} members`);

  if (house.heraldryId) parts.push('| Has heraldry');

  // House dignities
  const dignities = data.lookupMaps.dignitiesByHouse.get(house.id);
  if (dignities && dignities.length > 0) {
    parts.push(`| Dignities: ${dignities.map(d => d.shortName || d.name).join(', ')}`);
  }

  return parts.join(' ');
}

/**
 * Format house detail for AI
 */
function formatHouseDetail(house, data) {
  const output = [];

  output.push(`House: ${house.houseName}`);
  output.push(`ID: ${house.id}`);
  if (house.houseType) output.push(`Type: ${house.houseType}`);
  if (house.motto) output.push(`Motto: ${house.motto}`);

  // Parent house
  if (house.parentHouseId) {
    const parent = data.lookupMaps.housesById.get(house.parentHouseId);
    if (parent) output.push(`Parent House: ${parent.houseName}`);
  }

  // Members
  const members = data.people.filter(p => p.houseId === house.id);
  output.push(`\nMembers (${members.length}):`);
  members.forEach(person => {
    output.push(`  - ${formatPersonSummary(person, data)}`);
  });

  // Dignities
  const dignities = data.lookupMaps.dignitiesByHouse.get(house.id);
  if (dignities && dignities.length > 0) {
    output.push(`\nDignities held by this house:`);
    dignities.forEach(d => {
      output.push(`  - ${d.name}`);
    });
  }

  return output.join('\n');
}

/**
 * Format dignity summary for AI
 */
function formatDignitySummary(dignity, data) {
  const parts = [`${dignity.name} [ID: ${dignity.id}]`];

  if (dignity.dignityClass) parts.push(`(${dignity.dignityClass})`);

  if (dignity.currentHolderId) {
    const holder = data.lookupMaps.peopleById.get(dignity.currentHolderId);
    if (holder) {
      parts.push(`- Held by: ${holder.firstName} ${holder.lastName}`);
    }
  } else if (dignity.isVacant) {
    parts.push('- VACANT');
  }

  return parts.join(' ');
}

// ==================== ISSUE DETECTION ====================

/**
 * Analyze data for potential issues
 *
 * @param {Object} data - Full data context
 * @returns {Array} Array of detected issues
 */
export function analyzeDataForIssues(data) {
  const issues = [];

  // Check for missing relationships (same lastName, no connection)
  const peopleByLastName = new Map();
  data.people.forEach(p => {
    const lastName = p.lastName?.toLowerCase();
    if (lastName) {
      if (!peopleByLastName.has(lastName)) {
        peopleByLastName.set(lastName, []);
      }
      peopleByLastName.get(lastName).push(p);
    }
  });

  peopleByLastName.forEach((sameName, lastName) => {
    if (sameName.length > 1) {
      // Check if they're connected
      for (let i = 0; i < sameName.length; i++) {
        for (let j = i + 1; j < sameName.length; j++) {
          const p1 = sameName[i];
          const p2 = sameName[j];

          // Check if there's a relationship between them
          const hasConnection = data.relationships.some(r =>
            (r.person1Id === p1.id && r.person2Id === p2.id) ||
            (r.person1Id === p2.id && r.person2Id === p1.id)
          );

          if (!hasConnection && p1.houseId === p2.houseId) {
            issues.push({
              type: 'missing_relationship',
              severity: 'warning',
              entityType: 'person',
              entities: [p1.id, p2.id],
              message: `${p1.firstName} ${p1.lastName} and ${p2.firstName} ${p2.lastName} share the same last name and house but have no recorded relationship`,
              suggestion: 'Consider adding a family relationship (parent/child, sibling, etc.)'
            });
          }
        }
      }
    }
  });

  // Check for unconnected heraldry
  data.houses.forEach(house => {
    if (!house.heraldryId) {
      issues.push({
        type: 'missing_heraldry',
        severity: 'info',
        entityType: 'house',
        entityId: house.id,
        message: `House ${house.houseName} has no heraldry assigned`,
        suggestion: 'Consider creating or linking heraldry for this house'
      });
    }
  });

  // Check for houses without members
  data.houses.forEach(house => {
    const members = data.people.filter(p => p.houseId === house.id);
    if (members.length === 0) {
      issues.push({
        type: 'empty_house',
        severity: 'warning',
        entityType: 'house',
        entityId: house.id,
        message: `House ${house.houseName} has no members`,
        suggestion: 'Consider adding members or deleting the house'
      });
    }
  });

  // Check for vacant dignities
  data.dignities.forEach(dignity => {
    if (dignity.isVacant || !dignity.currentHolderId) {
      issues.push({
        type: 'vacant_dignity',
        severity: 'info',
        entityType: 'dignity',
        entityId: dignity.id,
        message: `Dignity "${dignity.name}" is currently vacant`,
        suggestion: 'Consider assigning a holder to this dignity'
      });
    }
  });

  // Check for date inconsistencies
  data.people.forEach(person => {
    // Birth after death
    if (person.dateOfBirth && person.dateOfDeath) {
      const birth = parseInt(person.dateOfBirth);
      const death = parseInt(person.dateOfDeath);
      if (!isNaN(birth) && !isNaN(death) && birth > death) {
        issues.push({
          type: 'date_inconsistency',
          severity: 'critical',
          entityType: 'person',
          entityId: person.id,
          message: `${person.firstName} ${person.lastName}'s birth date (${birth}) is after death date (${death})`,
          suggestion: 'Correct the birth or death date'
        });
      }
    }

    // Child older than parent
    const parents = data.lookupMaps.parentMap.get(person.id);
    if (parents && person.dateOfBirth) {
      const childBirth = parseInt(person.dateOfBirth);
      parents.forEach(parentId => {
        const parent = data.lookupMaps.peopleById.get(parentId);
        if (parent?.dateOfBirth) {
          const parentBirth = parseInt(parent.dateOfBirth);
          if (!isNaN(childBirth) && !isNaN(parentBirth) && childBirth <= parentBirth) {
            issues.push({
              type: 'date_inconsistency',
              severity: 'critical',
              entityType: 'person',
              entityId: person.id,
              message: `${person.firstName} ${person.lastName} (b. ${childBirth}) is born same year or before parent ${parent.firstName} ${parent.lastName} (b. ${parentBirth})`,
              suggestion: 'Check the birth dates and parent-child relationship'
            });
          }
        }
      });
    }
  });

  // Check for orphaned codex entries
  data.codexEntries.forEach(entry => {
    if (entry.personId) {
      const person = data.lookupMaps.peopleById.get(entry.personId);
      if (!person) {
        issues.push({
          type: 'orphaned_codex',
          severity: 'warning',
          entityType: 'codexEntry',
          entityId: entry.id,
          message: `Codex entry "${entry.title}" references deleted person #${entry.personId}`,
          suggestion: 'Delete the codex entry or relink to another person'
        });
      }
    }
    if (entry.houseId) {
      const house = data.lookupMaps.housesById.get(entry.houseId);
      if (!house) {
        issues.push({
          type: 'orphaned_codex',
          severity: 'warning',
          entityType: 'codexEntry',
          entityId: entry.id,
          message: `Codex entry "${entry.title}" references deleted house #${entry.houseId}`,
          suggestion: 'Delete the codex entry or relink to another house'
        });
      }
    }
  });

  logger.log(`🔍 AI Data Service: Found ${issues.length} potential issues`);
  return issues;
}

// ==================== EXPORTS ====================

export default {
  collectFullDataContext,
  buildLookupMaps,
  formatDataForAI,
  analyzeDataForIssues
};
