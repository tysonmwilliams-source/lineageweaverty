/**
 * Tree Relationship Maps Builder
 *
 * Pure utility function extracted from FamilyTree.jsx.
 * Builds lookup maps (peopleById, housesById, parentMap, childrenMap,
 * spouseMap, spouseRelationshipMap) from raw people/houses/relationships arrays.
 */

/**
 * Build relationship lookup maps from raw data arrays.
 *
 * @param {Array} people - Array of person objects
 * @param {Array} houses - Array of house objects
 * @param {Array} relationships - Array of relationship objects
 * @returns {{ peopleById: Map, housesById: Map, parentMap: Map, childrenMap: Map, spouseMap: Map, spouseRelationshipMap: Map }}
 */
export function buildRelationshipMaps(people, houses, relationships) {
  const peopleById = new Map(people.map(p => [p.id, p]));
  const housesById = new Map(houses.map(h => [h.id, h]));
  const parentMap = new Map();
  const childrenMap = new Map();
  const spouseMap = new Map();
  const spouseRelationshipMap = new Map();

  relationships.forEach(rel => {
    if (rel.relationshipType === 'spouse') {
      if (peopleById.has(rel.person1Id) && peopleById.has(rel.person2Id)) {
        spouseMap.set(rel.person1Id, rel.person2Id);
        spouseMap.set(rel.person2Id, rel.person1Id);
        const key = [rel.person1Id, rel.person2Id].sort((a, b) => a - b).join('-');
        spouseRelationshipMap.set(key, rel);
      }
    } else if (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') {
      const parentId = rel.person1Id;
      const childId = rel.person2Id;
      if (!parentMap.has(childId)) parentMap.set(childId, []);
      parentMap.get(childId).push(parentId);
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId).push(childId);
    }
  });

  return { peopleById, housesById, parentMap, childrenMap, spouseMap, spouseRelationshipMap };
}
