/**
 * dataIntegrity.js - Data Validation & Integrity Utilities
 *
 * PURPOSE:
 * Provides validation functions to detect and prevent data integrity issues:
 * - Circular references in ancestry (person being their own ancestor)
 * - Orphaned records (references to non-existent entities)
 * - Duplicate detection for namesakes
 *
 * USAGE:
 * Import these validators before creating/updating relationships
 * to prevent invalid data from being saved.
 */

/**
 * Relationship types that establish a parent -> child lineage edge.
 * `person1Id` is the parent, `person2Id` is the child.
 *
 * Every check in this file previously matched on 'parent-child' and 'marriage'
 * — values the app has never written. It writes 'parent' / 'adopted-parent' /
 * 'foster-parent' and 'spouse'. That mismatch made this entire module dead:
 * circular-ancestry detection, orphan detection and the bidirectional check
 * all silently matched nothing, while their tests passed because the fixtures
 * used the same fictional vocabulary.
 */
export const LINEAGE_RELATIONSHIP_TYPES = ['parent', 'adopted-parent', 'foster-parent'];

/** The type used for marriages/partnerships. */
export const SPOUSE_RELATIONSHIP_TYPE = 'spouse';

/** True when the relationship forms a parent -> child edge. */
function isLineageEdge(relationship) {
  return LINEAGE_RELATIONSHIP_TYPES.includes(relationship.relationshipType);
}

/**
 * Detects if adding a parent relationship would create a circular reference
 *
 * A circular reference occurs when:
 * - Person A is set as parent of Person B
 * - But Person B is already an ancestor of Person A
 *
 * This would create an impossible loop where someone is their own ancestor.
 *
 * @param {number} childId - The person who would be the child
 * @param {number} proposedParentId - The person being considered as parent
 * @param {Array} relationships - All relationships in the database
 * @param {Set} visited - Internal: tracks visited nodes to detect cycles
 * @returns {{ isCircular: boolean, path?: number[] }} Result with path if circular
 *
 * @example
 * const result = detectCircularAncestry(child.id, parent.id, allRelationships);
 * if (result.isCircular) {
 *   throw new Error(`Cannot set parent: would create circular ancestry: ${result.path.join(' → ')}`);
 * }
 */
export function detectCircularAncestry(childId, proposedParentId, relationships, visited = new Set(), path = []) {
  // Base case: if proposed parent is the child, direct circular reference
  if (childId === proposedParentId) {
    return { isCircular: true, path: [...path, proposedParentId] };
  }

  // Prevent infinite loops on already-visited nodes
  if (visited.has(proposedParentId)) {
    return { isCircular: false };
  }

  visited.add(proposedParentId);
  path.push(proposedParentId);

  // Find all ancestors of the proposed parent
  const parentRelationships = relationships.filter(
    r => isLineageEdge(r) && r.person2Id === proposedParentId
  );

  // For each ancestor of the proposed parent, check if they lead back to child
  for (const rel of parentRelationships) {
    const ancestorId = rel.person1Id; // person1Id is the parent

    // If this ancestor IS the child, we have a circular reference
    if (ancestorId === childId) {
      return { isCircular: true, path: [...path, childId] };
    }

    // Recursively check this ancestor's parents
    const result = detectCircularAncestry(childId, ancestorId, relationships, visited, [...path]);
    if (result.isCircular) {
      return result;
    }
  }

  return { isCircular: false };
}

/**
 * Validates that a parent-child relationship can be created
 *
 * Checks for:
 * 1. Self-reference (person cannot be their own parent)
 * 2. Circular ancestry (would create impossible loop)
 * 3. Duplicate relationship (relationship already exists)
 *
 * @param {number} parentId - The proposed parent
 * @param {number} childId - The proposed child
 * @param {Array} relationships - All existing relationships
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateParentChildRelationship(parentId, childId, relationships) {
  // Check self-reference
  if (parentId === childId) {
    return { valid: false, error: 'A person cannot be their own parent' };
  }

  // Check for existing relationship
  const existingRelationship = relationships.find(
    r => isLineageEdge(r) &&
         r.person1Id === parentId &&
         r.person2Id === childId
  );

  if (existingRelationship) {
    return { valid: false, error: 'This parent-child relationship already exists' };
  }

  // Check for circular ancestry
  // We check if adding parentId as parent of childId would create a loop
  // (i.e., if childId is already an ancestor of parentId)
  const circularCheck = detectCircularAncestry(childId, parentId, relationships);

  if (circularCheck.isCircular) {
    const pathStr = circularCheck.path.join(' → ');
    return {
      valid: false,
      error: `Cannot create relationship: would cause circular ancestry (${pathStr})`
    };
  }

  return { valid: true };
}

/**
 * Finds all orphaned records in the database
 *
 * Orphaned records are:
 * - Relationships referencing non-existent people
 * - People referencing non-existent houses
 * - Codex links referencing non-existent entries
 *
 * @param {Object} data - Database data { people, houses, relationships, codexEntries, codexLinks }
 * @returns {Object} Orphaned records by type
 */
export function findOrphanedRecords(data) {
  const {
    people = [],
    houses = [],
    relationships = [],
    codexEntries = [],
    codexLinks = [],
    dignities = [],
    heraldry = []
  } = data;

  const peopleIds = new Set(people.map(p => p.id));
  const houseIds = new Set(houses.map(h => h.id));
  const codexIds = new Set(codexEntries.map(e => e.id));
  const dignityIds = new Set(dignities.map(d => d.id));
  const heraldryIds = new Set(heraldry.map(h => h.id));

  const orphans = {
    relationships: [],
    peopleWithMissingHouse: [],
    codexLinks: [],
    dignities: [],
    heraldryRefs: []
  };

  // Check relationships for missing people
  for (const rel of relationships) {
    if (!peopleIds.has(rel.person1Id) || !peopleIds.has(rel.person2Id)) {
      orphans.relationships.push({
        id: rel.id,
        missingPerson1: !peopleIds.has(rel.person1Id) ? rel.person1Id : null,
        missingPerson2: !peopleIds.has(rel.person2Id) ? rel.person2Id : null
      });
    }
  }

  // Check people for missing houses
  for (const person of people) {
    if (person.houseId && !houseIds.has(person.houseId)) {
      orphans.peopleWithMissingHouse.push({
        personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        missingHouseId: person.houseId
      });
    }
  }

  // Check codex links for missing entries
  for (const link of codexLinks) {
    if (!codexIds.has(link.sourceId) || !codexIds.has(link.targetId)) {
      orphans.codexLinks.push({
        id: link.id,
        missingSource: !codexIds.has(link.sourceId) ? link.sourceId : null,
        missingTarget: !codexIds.has(link.targetId) ? link.targetId : null
      });
    }
  }

  // Check dignities for dangling references.
  //
  // This is the check that matters most and was missing entirely: a dignity
  // whose currentHolderId points at a deleted person breaks
  // calculateSuccessionLine, which returns an empty array and only warns. If
  // that dignity is a superior in the feudal chain, every dignity beneath it is
  // affected. Silent failure with a wide blast radius.
  for (const dignity of dignities) {
    const missing = {};

    if (dignity.currentHolderId && !peopleIds.has(dignity.currentHolderId)) {
      missing.missingHolderId = dignity.currentHolderId;
    }
    if (dignity.currentHouseId && !houseIds.has(dignity.currentHouseId)) {
      missing.missingHouseId = dignity.currentHouseId;
    }
    if (dignity.swornToId && !dignityIds.has(dignity.swornToId)) {
      missing.missingSwornToId = dignity.swornToId;
    }
    if (dignity.grantedById && !peopleIds.has(dignity.grantedById)) {
      missing.missingGrantedById = dignity.grantedById;
    }
    if (dignity.codexEntryId && !codexIds.has(dignity.codexEntryId)) {
      missing.missingCodexEntryId = dignity.codexEntryId;
    }

    if (Object.keys(missing).length > 0) {
      orphans.dignities.push({
        id: dignity.id,
        dignityName: dignity.name || `Dignity ${dignity.id}`,
        ...missing
      });
    }
  }

  // Check people and houses for dangling heraldryId. deleteHeraldry used to
  // leave these behind, so a house could claim arms that no longer exist.
  for (const person of people) {
    if (person.heraldryId && !heraldryIds.has(person.heraldryId)) {
      orphans.heraldryRefs.push({
        entityType: 'person',
        entityId: person.id,
        entityName: `${person.firstName || ''} ${person.lastName || ''}`.trim() || `Person ${person.id}`,
        missingHeraldryId: person.heraldryId
      });
    }
  }
  for (const house of houses) {
    if (house.heraldryId && !heraldryIds.has(house.heraldryId)) {
      orphans.heraldryRefs.push({
        entityType: 'house',
        entityId: house.id,
        entityName: house.houseName || `House ${house.id}`,
        missingHeraldryId: house.heraldryId
      });
    }
  }

  return orphans;
}

/**
 * Validates bidirectional integrity of relationships
 *
 * In some relationship types, both directions should be consistent.
 * For example, if A is married to B, B should be married to A.
 *
 * @param {Array} relationships - All relationships
 * @returns {Array} Inconsistent relationships
 */
export function validateBidirectionalRelationships(relationships) {
  const inconsistencies = [];
  const checkedPairs = new Set();

  // Marriage relationships should be bidirectional
  const marriageRelationships = relationships.filter(
    r => r.relationshipType === SPOUSE_RELATIONSHIP_TYPE
  );

  for (const marriage of marriageRelationships) {
    // Create a unique key for this pair (order-independent)
    const pairKey = [marriage.person1Id, marriage.person2Id].sort().join('-');

    // Skip if we've already checked this pair
    if (checkedPairs.has(pairKey)) {
      continue;
    }
    checkedPairs.add(pairKey);

    // Check if reverse relationship exists
    const reverse = marriageRelationships.find(
      m => m.person1Id === marriage.person2Id && m.person2Id === marriage.person1Id
    );

    // Marriages typically stored once (not bidirectionally), so this is informational
    // But if both directions exist, they should have consistent data
    if (reverse && marriage.id !== reverse.id) {
      if (marriage.marriageDate !== reverse.marriageDate) {
        inconsistencies.push({
          type: 'marriage-date-mismatch',
          relationship1: marriage.id,
          relationship2: reverse.id,
          person1: marriage.person1Id,
          person2: marriage.person2Id
        });
      }
    }
  }

  return inconsistencies;
}

/**
 * Run a full data integrity check
 *
 * @param {Object} data - All database data
 * @returns {Object} Full integrity report
 */
export function runIntegrityCheck(data) {
  const orphans = findOrphanedRecords(data);
  const bidirectionalIssues = validateBidirectionalRelationships(data.relationships || []);

  // Check for circular references in parent-child relationships
  // We detect cycles by checking if any person appears in their own ancestry
  const circularIssues = [];
  const parentChildRels = (data.relationships || []).filter(isLineageEdge);

  // Build a map of child -> parents for efficient lookup
  const parentMap = new Map();
  for (const rel of parentChildRels) {
    const parents = parentMap.get(rel.person2Id) || [];
    parents.push(rel.person1Id);
    parentMap.set(rel.person2Id, parents);
  }

  // For each person who is a child, check if they appear in their own ancestry
  const checkedPeople = new Set();
  for (const rel of parentChildRels) {
    const childId = rel.person2Id;
    if (checkedPeople.has(childId)) continue;
    checkedPeople.add(childId);

    const visited = new Set();
    const path = [];
    let current = [childId];

    while (current.length > 0) {
      const next = [];
      for (const personId of current) {
        if (visited.has(personId)) {
          // Found a cycle
          circularIssues.push({
            personId: childId,
            cycleAt: personId,
            path: [...path, personId]
          });
          break;
        }
        visited.add(personId);
        path.push(personId);

        const parents = parentMap.get(personId) || [];
        next.push(...parents);
      }
      current = next;
    }
  }

  const hasIssues =
    orphans.relationships.length > 0 ||
    orphans.peopleWithMissingHouse.length > 0 ||
    orphans.codexLinks.length > 0 ||
    orphans.dignities.length > 0 ||
    orphans.heraldryRefs.length > 0 ||
    bidirectionalIssues.length > 0 ||
    circularIssues.length > 0;

  return {
    healthy: !hasIssues,
    timestamp: new Date().toISOString(),
    issues: {
      orphanedRelationships: orphans.relationships,
      orphanedPeopleHouses: orphans.peopleWithMissingHouse,
      orphanedCodexLinks: orphans.codexLinks,
      orphanedDignities: orphans.dignities,
      orphanedHeraldryRefs: orphans.heraldryRefs,
      bidirectionalInconsistencies: bidirectionalIssues,
      circularAncestry: circularIssues
    },
    summary: {
      totalOrphanedRelationships: orphans.relationships.length,
      totalOrphanedPeopleHouses: orphans.peopleWithMissingHouse.length,
      totalOrphanedCodexLinks: orphans.codexLinks.length,
      totalOrphanedDignities: orphans.dignities.length,
      totalOrphanedHeraldryRefs: orphans.heraldryRefs.length,
      totalBidirectionalIssues: bidirectionalIssues.length,
      totalCircularIssues: circularIssues.length
    }
  };
}

export default {
  detectCircularAncestry,
  validateParentChildRelationship,
  findOrphanedRecords,
  validateBidirectionalRelationships,
  runIntegrityCheck
};
