/**
 * Relationship maps for succession (decisions D1, D3).
 *
 * Lives in the pure module rather than beside a service so that both the
 * dignity service and the change report can build maps the same way without
 * importing each other — the report needs the old algorithm, the old
 * algorithm's replacement needs the maps, and a shared owner is what stops
 * that becoming a cycle.
 */

import type { Relationship, RelationshipMaps } from './types';

/** Build parent, child, spouse and adoption maps from raw relationship rows. */
export function buildRelationshipMaps(
  relationships: Relationship[] = []
): RelationshipMaps {
  const childrenOf = new Map<number, number[]>();
  const parentsOf = new Map<number, number[]>();
  const spouseMap = new Map<number, number>();
  const adoptedChildrenOf = new Map<number, number[]>();
  const adoptedIds = new Set<number>();

  const push = (map: Map<number, number[]>, key: number, value: number) =>
    map.set(key, [...(map.get(key) ?? []), value]);

  for (const rel of relationships) {
    if (rel.relationshipType === 'parent') {
      push(parentsOf, rel.person2Id, rel.person1Id);
      push(childrenOf, rel.person1Id, rel.person2Id);
    } else if (rel.relationshipType === 'spouse') {
      spouseMap.set(rel.person1Id, rel.person2Id);
      spouseMap.set(rel.person2Id, rel.person1Id);
    } else if (rel.relationshipType === 'adopted-parent') {
      // Decision D3. These links exist in the schema and render in the tree,
      // and were invisible to succession entirely — an adopted child inherited
      // only if they happened to also hold a natural parent link.
      push(adoptedChildrenOf, rel.person1Id, rel.person2Id);
      adoptedIds.add(rel.person2Id);
    }
  }

  return { childrenOf, parentsOf, spouseMap, adoptedChildrenOf, adoptedIds };
}
