/**
 * Tree Relationship Maps Builder
 *
 * Pure utility function extracted from FamilyTree.jsx.
 * Builds lookup maps (peopleById, housesById, parentMap, childrenMap,
 * spouseMap, spouseRelationshipMap) from raw people/houses/relationships arrays.
 */
import type { House, Person, Relationship } from '../services/types';


/**
 * Build relationship lookup maps from raw data arrays.
 *
 * @param {Array} people - Array of person objects
 * @param {Array} houses - Array of house objects
 * @param {Array} relationships - Array of relationship objects
 * @returns {{ peopleById: Map, housesById: Map, parentMap: Map, childrenMap: Map, spouseMap: Map, spouseRelationshipMap: Map }}
 */
export function buildRelationshipMaps(
  people: Person[],
  houses: House[],
  relationships: Relationship[]
) {
  const peopleById = new Map(people.map(p => [p.id, p]));
  const housesById = new Map(houses.map(h => [h.id, h]));
  const parentMap = new Map<number, number[]>();
  const childrenMap = new Map<number, number[]>();
  const spouseMap = new Map<number, number>();
  const spouseRelationshipMap = new Map<string, Relationship>();

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
      // `has`-then-`get` does not narrow, so read the bucket and create it when
      // missing. Same two operations, one lookup fewer, and no assertion.
      let parents = parentMap.get(childId);
      if (!parents) { parents = []; parentMap.set(childId, parents); }
      parents.push(parentId);

      let children = childrenMap.get(parentId);
      if (!children) { children = []; childrenMap.set(parentId, children); }
      children.push(childId);
    }
  });

  return { peopleById, housesById, parentMap, childrenMap, spouseMap, spouseRelationshipMap };
}
