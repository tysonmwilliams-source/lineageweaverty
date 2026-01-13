/**
 * Dignity Analysis Service
 *
 * Analyzes genealogical data to generate intelligent suggestions
 * for dignities, tenures, and succession.
 *
 * DESIGN PRINCIPLES:
 * - Pure functions (no side effects, easy to test)
 * - Uses Maps for O(1) lookups per development guidelines
 * - Returns standardized Suggestion objects
 * - Confidence scores help users prioritize
 *
 * @module dignityAnalysisService
 */

import { getAllPeople, getAllHouses, getAllRelationships } from './database';
import { getAllDignities, getTenuresForDignity } from './dignityService';
import { SUGGESTION_TYPES, ACTION_TYPES } from '../data/suggestionTypes';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate a unique suggestion ID
 * @returns {string} UUID-like string
 */
function generateSuggestionId() {
  return `sug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build lookup maps from arrays for O(1) access
 * @param {Array} people - All people
 * @param {Array} houses - All houses
 * @param {Array} dignities - All dignities
 * @param {Array} relationships - All relationships
 * @returns {Object} Maps for quick lookups
 */
function buildLookupMaps(people, houses, dignities, relationships) {
  const peopleById = new Map(people.map(p => [p.id, p]));
  const housesById = new Map(houses.map(h => [h.id, h]));
  const dignitiesById = new Map(dignities.map(d => [d.id, d]));

  // Build relationship maps
  const parentMap = new Map(); // childId -> [parentIds]
  const childrenMap = new Map(); // parentId -> [childIds]
  const spouseMap = new Map(); // personId -> spouseId

  for (const rel of relationships) {
    if (rel.relationshipType === 'parent') {
      // rel.person1Id is parent, rel.person2Id is child
      const existingParents = parentMap.get(rel.person2Id) || [];
      parentMap.set(rel.person2Id, [...existingParents, rel.person1Id]);

      const existingChildren = childrenMap.get(rel.person1Id) || [];
      childrenMap.set(rel.person1Id, [...existingChildren, rel.person2Id]);
    } else if (rel.relationshipType === 'spouse') {
      spouseMap.set(rel.person1Id, rel.person2Id);
      spouseMap.set(rel.person2Id, rel.person1Id);
    }
  }

  // Build house members map
  const houseMembersMap = new Map(); // houseId -> [personIds]
  for (const person of people) {
    if (person.houseId) {
      const members = houseMembersMap.get(person.houseId) || [];
      members.push(person.id);
      houseMembersMap.set(person.houseId, members);
    }
  }

  // Build dignities by house map
  const dignitiesByHouse = new Map(); // houseId -> [dignities]
  for (const dignity of dignities) {
    if (dignity.currentHouseId) {
      const houseDignities = dignitiesByHouse.get(dignity.currentHouseId) || [];
      houseDignities.push(dignity);
      dignitiesByHouse.set(dignity.currentHouseId, houseDignities);
    }
  }

  // Build dignities by person map
  const dignitiesByPerson = new Map(); // personId -> [dignities]
  for (const dignity of dignities) {
    if (dignity.currentHolderId) {
      const personDignities = dignitiesByPerson.get(dignity.currentHolderId) || [];
      personDignities.push(dignity);
      dignitiesByPerson.set(dignity.currentHolderId, personDignities);
    }
  }

  return {
    peopleById,
    housesById,
    dignitiesById,
    parentMap,
    childrenMap,
    spouseMap,
    houseMembersMap,
    dignitiesByHouse,
    dignitiesByPerson
  };
}

/**
 * Get person display name
 */
function getPersonName(person) {
  if (!person) return 'Unknown';
  return `${person.firstName} ${person.lastName}`;
}

/**
 * Check if person is deceased
 */
function isDeceased(person) {
  return person && person.dateOfDeath;
}

/**
 * Check if person is living
 */
function isLiving(person) {
  return person && !person.dateOfDeath;
}

/**
 * Check if person is legitimate (not a bastard, or legitimized)
 */
function isLegitimate(person) {
  if (!person) return false;
  if (person.legitimacyStatus !== 'bastard') return true;
  return person.bastardStatus === 'legitimized';
}

/**
 * Find eldest living legitimate member of a house
 */
function findEldestLivingLegitimate(houseId, maps) {
  const memberIds = maps.houseMembersMap.get(houseId) || [];
  const members = memberIds
    .map(id => maps.peopleById.get(id))
    .filter(p => p && isLiving(p) && isLegitimate(p));

  // Sort by birth date (oldest first)
  members.sort((a, b) => {
    const aYear = parseInt(a.dateOfBirth) || 9999;
    const bYear = parseInt(b.dateOfBirth) || 9999;
    return aYear - bYear;
  });

  return members[0] || null;
}

// ==================== ANALYZER FUNCTIONS ====================

/**
 * Analyze houses without hereditary dignities
 *
 * Detects houses with 5+ members that have no associated dignity.
 * Suggests creating a "Head of House" title.
 *
 * @param {Array} houses - All houses
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for houses without titles
 */
function analyzeHousesWithoutTitles(houses, maps) {
  const suggestions = [];
  const MIN_MEMBERS_FOR_HEAD = 5;

  for (const house of houses) {
    const memberIds = maps.houseMembersMap.get(house.id) || [];
    const houseDignities = maps.dignitiesByHouse.get(house.id) || [];

    // Skip if house already has dignities
    if (houseDignities.length > 0) continue;

    // Skip small houses
    if (memberIds.length < MIN_MEMBERS_FOR_HEAD) continue;

    // Find eldest living legitimate member
    const patriarch = findEldestLivingLegitimate(house.id, maps);

    const suggestion = {
      id: generateSuggestionId(),
      type: 'house-no-head',
      severity: memberIds.length >= 20 ? 'warning' : 'info',
      confidence: 0.9,
      title: `${house.houseName} has no Head of House`,
      description: `A house of ${memberIds.length} members across multiple generations should have a designated head.`,
      reasoning: patriarch
        ? `${getPersonName(patriarch)} is the eldest living legitimate member and could hold this title.`
        : 'No obvious candidate found - consider creating a title and assigning manually.',
      affectedEntities: [
        { type: 'house', id: house.id, name: house.houseName },
        ...(patriarch ? [{ type: 'person', id: patriarch.id, name: getPersonName(patriarch) }] : [])
      ],
      suggestedAction: {
        type: 'create-dignity',
        label: 'Create Head of House Title',
        data: {
          name: `Lord of ${house.houseName}`,
          shortName: house.houseName,
          dignityClass: 'driht',
          dignityRank: 'drith',
          currentHouseId: house.id,
          currentHolderId: patriarch?.id || null,
          isHereditary: true,
          successionType: 'male-primogeniture'
        },
        preview: patriarch
          ? `Create "Lord of ${house.houseName}" held by ${getPersonName(patriarch)}`
          : `Create "Lord of ${house.houseName}" (vacant)`
      },
      alternativeActions: [
        {
          type: 'create-dignity',
          label: 'Create as Wardship',
          data: {
            name: `Wardyn of ${house.houseName}`,
            dignityClass: 'ward',
            dignityRank: 'wardyn',
            currentHouseId: house.id,
            isHereditary: false
          },
          preview: `Create "Wardyn of ${house.houseName}" as non-hereditary position`
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze dignities with deceased holders
 *
 * Detects dignities where currentHolderId is a deceased person.
 * Suggests transferring to calculated heir.
 *
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for deceased holders
 */
function analyzeDeceasedHolders(dignities, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    if (!dignity.currentHolderId) continue;

    const holder = maps.peopleById.get(dignity.currentHolderId);
    if (!holder || !isDeceased(holder)) continue;

    // This is a critical issue - deceased person still holds title
    const suggestion = {
      id: generateSuggestionId(),
      type: 'deceased-holder',
      severity: 'critical',
      confidence: 1.0, // 100% certain this is an issue
      title: `${dignity.name} held by deceased person`,
      description: `${getPersonName(holder)} died in ${holder.dateOfDeath} but is still listed as holding this dignity.`,
      reasoning: 'The title should be transferred to the heir or marked as vacant.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        { type: 'person', id: holder.id, name: getPersonName(holder) }
      ],
      suggestedAction: {
        type: 'transfer-dignity',
        label: 'Transfer to Heir',
        data: {
          dignityId: dignity.id,
          endCurrentTenure: {
            dateEnded: holder.dateOfDeath,
            endType: 'death'
          },
          // Heir will be calculated in apply function
          calculateHeir: true
        },
        preview: `End ${getPersonName(holder)}'s tenure (d. ${holder.dateOfDeath}) and transfer to heir`
      },
      alternativeActions: [
        {
          type: 'mark-vacant',
          label: 'Mark as Vacant',
          data: {
            dignityId: dignity.id,
            currentHolderId: null,
            isVacant: true
          },
          preview: 'Remove holder and mark dignity as vacant'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze dignities with no tenure records
 *
 * Detects dignities that have a current holder but no tenure history.
 * Suggests creating tenure records.
 *
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for missing tenure records
 */
function analyzeNoTenureRecords(dignities, tenuresByDignity, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    if (!dignity.currentHolderId) continue;

    const tenures = tenuresByDignity.get(dignity.id) || [];
    if (tenures.length > 0) continue;

    const holder = maps.peopleById.get(dignity.currentHolderId);

    const suggestion = {
      id: generateSuggestionId(),
      type: 'no-tenure-records',
      severity: 'info',
      confidence: 0.85,
      title: `${dignity.name} has no tenure history`,
      description: `${getPersonName(holder)} is the current holder but no tenure records exist.`,
      reasoning: 'Adding tenure records documents when and how the title was acquired.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        { type: 'person', id: holder.id, name: getPersonName(holder) }
      ],
      suggestedAction: {
        type: 'create-tenure',
        label: 'Create Tenure Record',
        data: {
          dignityId: dignity.id,
          personId: holder.id,
          dateStarted: null, // User should fill in
          acquisitionType: 'inheritance'
        },
        preview: `Create tenure record for ${getPersonName(holder)}`
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze tenure gaps and suggest chains from death dates
 *
 * For dignities with incomplete tenure history, analyzes deceased
 * house members and suggests a tenure chain based on death dates.
 *
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for tenure chains
 */
function analyzeTenureGaps(dignities, tenuresByDignity, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    if (!dignity.currentHouseId || !dignity.isHereditary) continue;

    const tenures = tenuresByDignity.get(dignity.id) || [];
    const memberIds = maps.houseMembersMap.get(dignity.currentHouseId) || [];

    // Get deceased members who could have held this title
    const deceasedMembers = memberIds
      .map(id => maps.peopleById.get(id))
      .filter(p => p && isDeceased(p) && isLegitimate(p))
      .filter(p => {
        // Check they're not already in tenure records
        return !tenures.some(t => t.personId === p.id);
      });

    if (deceasedMembers.length === 0) continue;

    // Sort by death date (oldest first)
    deceasedMembers.sort((a, b) => {
      const aYear = parseInt(a.dateOfDeath) || 9999;
      const bYear = parseInt(b.dateOfDeath) || 9999;
      return aYear - bYear;
    });

    // Only suggest if we have at least 2 deceased members to form a chain
    if (deceasedMembers.length < 2) continue;

    // Build suggested chain
    const chainData = deceasedMembers.map((person, index) => {
      return {
        personId: person.id,
        personName: getPersonName(person),
        dateEnded: person.dateOfDeath,
        endType: 'death',
        dateStarted: index === 0 ? null : deceasedMembers[index - 1].dateOfDeath
      };
    });

    const chainPreview = chainData
      .map(c => `${c.personName} (d. ${c.dateEnded})`)
      .join(' -> ');

    const suggestion = {
      id: generateSuggestionId(),
      type: 'tenure-chain-suggestion',
      severity: 'info',
      confidence: 0.7, // Lower confidence since we're inferring
      title: `Suggested tenure chain for ${dignity.name}`,
      description: `Based on death dates of ${maps.housesById.get(dignity.currentHouseId)?.houseName || 'house'} members, a tenure chain can be inferred.`,
      reasoning: `${deceasedMembers.length} deceased house members could have held this title in succession.`,
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        ...deceasedMembers.map(p => ({ type: 'person', id: p.id, name: getPersonName(p) }))
      ],
      suggestedAction: {
        type: 'create-tenure-chain',
        label: 'Create Tenure Chain',
        data: {
          dignityId: dignity.id,
          tenures: chainData
        },
        preview: chainPreview
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze orphaned dignities (no holder AND no house)
 *
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for orphaned dignities
 */
function analyzeOrphanedDignities(dignities, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    // Skip if has either holder or house
    if (dignity.currentHolderId || dignity.currentHouseId) continue;

    // Skip if explicitly marked vacant (intentional)
    if (dignity.isVacant && dignity.notes?.includes('intentionally vacant')) continue;

    const suggestion = {
      id: generateSuggestionId(),
      type: 'orphaned-dignity',
      severity: 'warning',
      confidence: 0.95,
      title: `${dignity.name} has no holder or house`,
      description: 'This dignity is not associated with any person or house.',
      reasoning: 'Orphaned dignities may be forgotten entries or data entry errors.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name }
      ],
      suggestedAction: {
        type: 'link-to-house',
        label: 'Link to House',
        data: {
          dignityId: dignity.id,
          // User selects house
          promptForHouse: true
        },
        preview: 'Associate this dignity with a house'
      },
      alternativeActions: [
        {
          type: 'delete-dignity',
          label: 'Delete Dignity',
          data: { dignityId: dignity.id },
          preview: 'Remove this dignity record'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze temporal impossibilities
 *
 * Detects tenure records where dates conflict with person's lifespan.
 *
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for temporal issues
 */
function analyzeTemporalIssues(dignities, tenuresByDignity, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    const tenures = tenuresByDignity.get(dignity.id) || [];

    for (const tenure of tenures) {
      const person = maps.peopleById.get(tenure.personId);
      if (!person) continue;

      const birthYear = parseInt(person.dateOfBirth);
      const deathYear = parseInt(person.dateOfDeath);
      const tenureStartYear = parseInt(tenure.dateStarted);
      const tenureEndYear = parseInt(tenure.dateEnded);

      let issue = null;

      // Check if tenure started before birth
      if (birthYear && tenureStartYear && tenureStartYear < birthYear) {
        issue = `Tenure started (${tenureStartYear}) before ${getPersonName(person)} was born (${birthYear})`;
      }

      // Check if tenure ended after death
      if (deathYear && tenureEndYear && tenureEndYear > deathYear) {
        issue = `Tenure ended (${tenureEndYear}) after ${getPersonName(person)} died (${deathYear})`;
      }

      // Check if tenure started after death
      if (deathYear && tenureStartYear && tenureStartYear > deathYear) {
        issue = `Tenure started (${tenureStartYear}) after ${getPersonName(person)} died (${deathYear})`;
      }

      if (issue) {
        const suggestion = {
          id: generateSuggestionId(),
          type: 'temporal-impossibility',
          severity: 'critical',
          confidence: 1.0,
          title: `Temporal impossibility in ${dignity.name}`,
          description: issue,
          reasoning: 'This is likely a data entry error that should be corrected.',
          affectedEntities: [
            { type: 'dignity', id: dignity.id, name: dignity.name },
            { type: 'tenure', id: tenure.id, name: `Tenure of ${getPersonName(person)}` },
            { type: 'person', id: person.id, name: getPersonName(person) }
          ],
          suggestedAction: {
            type: 'update-tenure',
            label: 'Fix Dates',
            data: {
              tenureId: tenure.id,
              promptForCorrection: true
            },
            preview: 'Manually correct the tenure dates'
          },
          alternativeActions: [],
          dependsOn: [],
          enables: [],
          created: new Date().toISOString(),
          dismissed: false,
          dismissedReason: null,
          applied: false,
          appliedAt: null,
          deferred: false
        };

        suggestions.push(suggestion);
      }
    }
  }

  return suggestions;
}

/**
 * Analyze circular feudal chains
 *
 * Detects when feudal hierarchy contains loops (A sworn to B sworn to C sworn to A).
 *
 * @param {Array} dignities - All dignities
 * @returns {Suggestion[]} Suggestions for circular chains
 */
function analyzeCircularFeudalChains(dignities) {
  const suggestions = [];
  const dignitiesById = new Map(dignities.map(d => [d.id, d]));
  const foundCycles = new Set(); // Track cycles we've already reported

  for (const dignity of dignities) {
    if (!dignity.swornToId) continue;

    // Traverse up the chain looking for cycles
    const visited = new Set([dignity.id]);
    let current = dignitiesById.get(dignity.swornToId);
    const chain = [dignity.name];

    while (current) {
      chain.push(current.name);

      if (visited.has(current.id)) {
        // Found a cycle! Create a unique key to avoid duplicates
        const cycleKey = [...visited].sort().join('-');
        if (!foundCycles.has(cycleKey)) {
          foundCycles.add(cycleKey);

          const suggestion = {
            id: generateSuggestionId(),
            type: 'circular-feudal-chain',
            severity: 'critical',
            confidence: 1.0,
            title: `Circular feudal chain detected`,
            description: `The feudal hierarchy contains a loop: ${chain.join(' -> ')}`,
            reasoning: 'This is a data integrity error that breaks feudal chain calculations.',
            affectedEntities: [
              { type: 'dignity', id: dignity.id, name: dignity.name }
            ],
            suggestedAction: {
              type: 'fix-feudal-chain',
              label: 'Break Cycle',
              data: {
                dignityId: dignity.id,
                removeSwornTo: true
              },
              preview: `Remove ${dignity.name}'s sworn allegiance to break the cycle`
            },
            alternativeActions: [],
            dependsOn: [],
            enables: [],
            created: new Date().toISOString(),
            dismissed: false,
            dismissedReason: null,
            applied: false,
            appliedAt: null,
            deferred: false
          };

          suggestions.push(suggestion);
        }
        break;
      }

      visited.add(current.id);
      current = current.swornToId ? dignitiesById.get(current.swornToId) : null;
    }
  }

  return suggestions;
}

/**
 * Analyze over-titled people
 *
 * Detects people holding an unusually high number of major titles.
 *
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for potential errors
 */
function analyzeOverTitledPeople(maps) {
  const suggestions = [];
  const THRESHOLD = 5; // More than 5 titles is suspicious

  for (const [personId, dignities] of maps.dignitiesByPerson) {
    if (dignities.length <= THRESHOLD) continue;

    const person = maps.peopleById.get(personId);
    if (!person) continue;

    const suggestion = {
      id: generateSuggestionId(),
      type: 'over-titled-person',
      severity: 'info',
      confidence: 0.6, // Low confidence - might be intentional
      title: `${getPersonName(person)} holds ${dignities.length} titles`,
      description: `This person holds an unusually high number of dignities, which may indicate data entry errors.`,
      reasoning: `Titles: ${dignities.map(d => d.name).join(', ')}`,
      affectedEntities: [
        { type: 'person', id: person.id, name: getPersonName(person) },
        ...dignities.map(d => ({ type: 'dignity', id: d.id, name: d.name }))
      ],
      suggestedAction: {
        type: 'review',
        label: 'Review Titles',
        data: { personId: person.id },
        preview: 'Review and confirm all titles are correct'
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze widowed dignities (linked to deleted houses)
 *
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for orphaned links
 */
function analyzeWidowedDignities(dignities, maps) {
  const suggestions = [];

  for (const dignity of dignities) {
    if (!dignity.currentHouseId) continue;

    const house = maps.housesById.get(dignity.currentHouseId);
    if (house) continue; // House exists, no problem

    const suggestion = {
      id: generateSuggestionId(),
      type: 'widowed-dignity',
      severity: 'critical',
      confidence: 1.0,
      title: `${dignity.name} linked to non-existent house`,
      description: `This dignity references house ID ${dignity.currentHouseId} which no longer exists.`,
      reasoning: 'The house may have been deleted. The dignity should be relinked or cleaned up.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name }
      ],
      suggestedAction: {
        type: 'link-to-house',
        label: 'Relink to House',
        data: {
          dignityId: dignity.id,
          clearCurrentHouseId: true,
          promptForHouse: true
        },
        preview: 'Select a new house for this dignity'
      },
      alternativeActions: [
        {
          type: 'update-dignity',
          label: 'Clear House Link',
          data: {
            dignityId: dignity.id,
            currentHouseId: null
          },
          preview: 'Remove the broken house reference'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

/**
 * Analyze cadet houses without their own title
 *
 * @param {Array} houses - All houses
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for cadet houses
 */
function analyzeCadetHousesWithoutTitles(houses, maps) {
  const suggestions = [];

  for (const house of houses) {
    // Only check cadet houses
    if (!house.parentHouseId || house.houseType !== 'cadet') continue;

    const houseDignities = maps.dignitiesByHouse.get(house.id) || [];
    if (houseDignities.length > 0) continue;

    const parentHouse = maps.housesById.get(house.parentHouseId);
    const patriarch = findEldestLivingLegitimate(house.id, maps);

    const suggestion = {
      id: generateSuggestionId(),
      type: 'cadet-no-title',
      severity: 'info',
      confidence: 0.75,
      title: `Cadet branch ${house.houseName} has no title`,
      description: `This cadet house of ${parentHouse?.houseName || 'unknown'} has no associated dignity.`,
      reasoning: patriarch
        ? `${getPersonName(patriarch)} could be granted a title as head of this cadet branch.`
        : 'Consider creating a dignity for this branch.',
      affectedEntities: [
        { type: 'house', id: house.id, name: house.houseName },
        ...(patriarch ? [{ type: 'person', id: patriarch.id, name: getPersonName(patriarch) }] : [])
      ],
      suggestedAction: {
        type: 'create-dignity',
        label: 'Create Cadet Title',
        data: {
          name: `Drithling of ${house.houseName}`,
          dignityClass: 'driht',
          dignityRank: 'drithling',
          currentHouseId: house.id,
          currentHolderId: patriarch?.id || null,
          isHereditary: true
        },
        preview: `Create "Drithling of ${house.houseName}"`
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };

    suggestions.push(suggestion);
  }

  return suggestions;
}

// ==================== MAIN ANALYSIS FUNCTION ====================

/**
 * Run full analysis on all data
 *
 * This is the main entry point. It:
 * 1. Fetches all needed data from IndexedDB
 * 2. Builds lookup maps for O(1) access
 * 3. Runs each analyzer function
 * 4. Deduplicates and sorts results
 * 5. Returns unified analysis result
 *
 * @param {Object} options - Analysis options
 * @param {string[]} options.analyzers - Which analyzers to run (default: all)
 * @param {string[]} options.severities - Which severities to include (default: all)
 * @param {number} options.minConfidence - Minimum confidence threshold (default: 0)
 * @returns {Promise<AnalysisResult>} Analysis results
 */
export async function runFullAnalysis(options = {}) {
  const {
    analyzers = 'all',
    severities = ['critical', 'warning', 'info'],
    minConfidence = 0
  } = options;

  if (import.meta.env.DEV) {
    console.log('Starting dignity analysis...');
  }
  const startTime = Date.now();

  try {
    // 1. Fetch all data
    const [people, houses, dignities, relationships] = await Promise.all([
      getAllPeople(),
      getAllHouses(),
      getAllDignities(),
      getAllRelationships()
    ]);

    // Fetch all tenures
    const tenuresByDignity = new Map();
    for (const dignity of dignities) {
      const tenures = await getTenuresForDignity(dignity.id);
      tenuresByDignity.set(dignity.id, tenures);
    }

    if (import.meta.env.DEV) {
      console.log(`Data loaded: ${people.length} people, ${houses.length} houses, ${dignities.length} dignities`);
    }

    // 2. Build lookup maps
    const maps = buildLookupMaps(people, houses, dignities, relationships);

    // 3. Run analyzers
    let allSuggestions = [];

    const analyzerFunctions = {
      'house-no-head': () => analyzeHousesWithoutTitles(houses, maps),
      'deceased-holder': () => analyzeDeceasedHolders(dignities, maps),
      'no-tenure-records': () => analyzeNoTenureRecords(dignities, tenuresByDignity, maps),
      'tenure-gaps': () => analyzeTenureGaps(dignities, tenuresByDignity, maps),
      'orphaned-dignity': () => analyzeOrphanedDignities(dignities, maps),
      'temporal-issues': () => analyzeTemporalIssues(dignities, tenuresByDignity, maps),
      'circular-chains': () => analyzeCircularFeudalChains(dignities),
      'over-titled': () => analyzeOverTitledPeople(maps),
      'widowed-dignity': () => analyzeWidowedDignities(dignities, maps),
      'cadet-no-title': () => analyzeCadetHousesWithoutTitles(houses, maps)
    };

    const analyzersToRun = analyzers === 'all'
      ? Object.keys(analyzerFunctions)
      : analyzers;

    for (const analyzerName of analyzersToRun) {
      const analyzerFn = analyzerFunctions[analyzerName];
      if (analyzerFn) {
        const suggestions = analyzerFn();
        allSuggestions.push(...suggestions);
        if (import.meta.env.DEV) {
          console.log(`  ${analyzerName}: ${suggestions.length} suggestions`);
        }
      }
    }

    // 4. Filter by severity and confidence
    allSuggestions = allSuggestions.filter(s =>
      severities.includes(s.severity) && s.confidence >= minConfidence
    );

    // 5. Sort by severity (critical first) then confidence (highest first)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    allSuggestions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });

    // 6. Calculate statistics
    const stats = {
      total: allSuggestions.length,
      bySeverity: {
        critical: allSuggestions.filter(s => s.severity === 'critical').length,
        warning: allSuggestions.filter(s => s.severity === 'warning').length,
        info: allSuggestions.filter(s => s.severity === 'info').length
      },
      byType: {}
    };

    for (const suggestion of allSuggestions) {
      stats.byType[suggestion.type] = (stats.byType[suggestion.type] || 0) + 1;
    }

    const duration = Date.now() - startTime;
    if (import.meta.env.DEV) {
      console.log(`Analysis complete: ${allSuggestions.length} suggestions in ${duration}ms`);
    }

    return {
      suggestions: allSuggestions,
      stats,
      analyzedAt: new Date().toISOString(),
      duration,
      dataSnapshot: {
        peopleCount: people.length,
        housesCount: houses.length,
        dignitiesCount: dignities.length
      }
    };

  } catch (error) {
    console.error('Analysis failed:', error);
    throw error;
  }
}

/**
 * Run analysis for a specific entity
 *
 * Returns only suggestions relevant to a particular house, person, or dignity.
 *
 * @param {string} entityType - 'house' | 'person' | 'dignity'
 * @param {number} entityId - Entity ID
 * @returns {Promise<Suggestion[]>} Relevant suggestions
 */
export async function analyzeEntity(entityType, entityId) {
  const result = await runFullAnalysis();

  return result.suggestions.filter(suggestion =>
    suggestion.affectedEntities.some(e =>
      e.type === entityType && e.id === entityId
    )
  );
}

// ==================== EXPORTS ====================

export {
  generateSuggestionId,
  buildLookupMaps,
  analyzeHousesWithoutTitles,
  analyzeDeceasedHolders,
  analyzeNoTenureRecords,
  analyzeTenureGaps,
  analyzeOrphanedDignities,
  analyzeTemporalIssues,
  analyzeCircularFeudalChains,
  analyzeOverTitledPeople,
  analyzeWidowedDignities,
  analyzeCadetHousesWithoutTitles
};

export default {
  runFullAnalysis,
  analyzeEntity
};
