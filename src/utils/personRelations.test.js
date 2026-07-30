/**
 * personRelations tests
 *
 * These back the mobile tree list view, where every failure mode is silent: a
 * half-sibling shown as full, a spouse listed twice, children in arbitrary order.
 * Nothing on screen would tell you.
 */

import { describe, it, expect } from 'vitest';
import { buildRelationshipMaps } from './treeRelationshipMaps';
import {
  getPersonRelations,
  getSpouses,
  getSiblings,
  parentLabel
} from './personRelations';

// ── fixture ──────────────────────────────────────────────────────────────────
//
//   Baudin(1) ═ Signa(2)          Baudin ═ Wren(3)   (second marriage)
//        │                              │
//   ┌────┴────┬─────────┐               │
// Aldric(4) Elenna(5) Corin(6)      Mara(7)          (half-sibling to 4/5/6)
//     ║
//  Rosal(8)
//     │
//   Fen(9)

const people = [
  { id: 1, firstName: 'Baudin', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1650' },
  { id: 2, firstName: 'Signa', lastName: 'Wilfrey', gender: 'female', dateOfBirth: '1652' },
  { id: 3, firstName: 'Wren', lastName: 'Ashford', gender: 'female', dateOfBirth: '1662' },
  { id: 4, firstName: 'Aldric', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1680' },
  { id: 5, firstName: 'Elenna', lastName: 'Wilfrey', gender: 'female', dateOfBirth: '1683' },
  { id: 6, firstName: 'Corin', lastName: 'Wilfrey', gender: 'male' }, // no birth year
  { id: 7, firstName: 'Mara', lastName: 'Wilfrey', gender: 'female', dateOfBirth: '1690' },
  { id: 8, firstName: 'Rosal', lastName: 'Breakmount', gender: 'female', dateOfBirth: '1682' },
  { id: 9, firstName: 'Fen', lastName: 'Wilfrey', gender: 'male', dateOfBirth: '1704' },
  { id: 99, firstName: 'Orphan', lastName: 'Alone', gender: 'male' }
];

const relationships = [
  { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1678' },
  { id: 2, person1Id: 1, person2Id: 3, relationshipType: 'spouse', marriageDate: '1688' },
  { id: 3, person1Id: 1, person2Id: 4, relationshipType: 'parent' },
  { id: 4, person1Id: 2, person2Id: 4, relationshipType: 'parent' },
  { id: 5, person1Id: 1, person2Id: 5, relationshipType: 'parent' },
  { id: 6, person1Id: 2, person2Id: 5, relationshipType: 'parent' },
  { id: 7, person1Id: 1, person2Id: 6, relationshipType: 'parent' },
  { id: 8, person1Id: 2, person2Id: 6, relationshipType: 'parent' },
  { id: 9, person1Id: 1, person2Id: 7, relationshipType: 'parent' },
  { id: 10, person1Id: 3, person2Id: 7, relationshipType: 'parent' },
  { id: 11, person1Id: 4, person2Id: 8, relationshipType: 'spouse', marriageDate: '1702' },
  { id: 12, person1Id: 4, person2Id: 9, relationshipType: 'parent' },
  { id: 13, person1Id: 8, person2Id: 9, relationshipType: 'parent' }
];

const maps = buildRelationshipMaps(people, [], relationships);

describe('getPersonRelations', () => {
  it('returns null for a person who does not exist', () => {
    expect(getPersonRelations(12345, maps, relationships)).toBeNull();
  });

  it('gathers parents, spouse, siblings and children for a person mid-tree', () => {
    const r = getPersonRelations(4, maps, relationships);

    expect(r.person.firstName).toBe('Aldric');
    expect(r.parents).toEqual([1, 2]);
    expect(r.spouses.map(s => s.id)).toEqual([8]);
    expect(r.children).toEqual([9]);
    expect(r.isIsolated).toBe(false);
  });

  it('separates full siblings from half siblings', () => {
    const r = getPersonRelations(4, maps, relationships);

    // Elenna and Corin share both parents; Mara shares only Baudin.
    expect(r.siblings).toEqual([5, 6]);
    expect(r.halfSiblings).toEqual([7]);
  });

  it('sorts siblings by birth year, with undated ones last', () => {
    const r = getPersonRelations(4, maps, relationships);
    // Elenna (1683) before Corin (no year)
    expect(r.siblings).toEqual([5, 6]);
  });

  it('flags a person with no relationships as isolated', () => {
    const r = getPersonRelations(99, maps, relationships);

    expect(r.isIsolated).toBe(true);
    expect(r.parents).toEqual([]);
    expect(r.children).toEqual([]);
  });

  it('does not list the person as their own sibling', () => {
    const r = getPersonRelations(5, maps, relationships);
    expect(r.siblings).not.toContain(5);
    expect(r.halfSiblings).not.toContain(5);
  });
});

describe('getSpouses', () => {
  it('returns every marriage, not just the one spouseMap can hold', () => {
    // This is the point of scanning relationships directly: spouseMap is a flat
    // Map, so Baudin's second marriage overwrites his first.
    expect(maps.spouseMap.get(1)).toBe(3);

    const spouses = getSpouses(1, relationships, maps.peopleById);
    expect(spouses.map(s => s.id).sort()).toEqual([2, 3]);
  });

  it('carries the relationship row so marriage dates can be shown', () => {
    const spouses = getSpouses(4, relationships, maps.peopleById);
    expect(spouses[0].relationship.marriageDate).toBe('1702');
  });

  it('never lists the same spouse twice', () => {
    const dupes = [
      ...relationships,
      { id: 90, person1Id: 4, person2Id: 8, relationshipType: 'spouse' },
      { id: 91, person1Id: 8, person2Id: 4, relationshipType: 'spouse' }
    ];
    expect(getSpouses(4, dupes, maps.peopleById)).toHaveLength(1);
  });

  it('skips spouses who no longer exist', () => {
    const dangling = [
      ...relationships,
      { id: 92, person1Id: 4, person2Id: 777, relationshipType: 'spouse' }
    ];
    expect(getSpouses(4, dangling, maps.peopleById).map(s => s.id)).toEqual([8]);
  });

  it('returns an empty array for someone unmarried', () => {
    expect(getSpouses(9, relationships, maps.peopleById)).toEqual([]);
  });
});

describe('getSiblings', () => {
  it('treats everything as a half sibling when only one parent is known', () => {
    // Mara has both parents here, but view it from a single-parent case:
    const solo = [
      { id: 1, person1Id: 1, person2Id: 4, relationshipType: 'parent' },
      { id: 2, person1Id: 1, person2Id: 5, relationshipType: 'parent' }
    ];
    const m = buildRelationshipMaps(people, [], solo);
    const { full, half } = getSiblings(4, m.parentMap, m.childrenMap, m.peopleById);

    // With one known parent the data cannot support calling anyone a full sibling.
    expect(full).toEqual([]);
    expect(half).toEqual([5]);
  });

  it('returns empty sets for a person with no known parents', () => {
    expect(getSiblings(1, maps.parentMap, maps.childrenMap, maps.peopleById))
      .toEqual({ full: [], half: [] });
  });
});

describe('parentLabel', () => {
  it('uses the parent\'s own gender', () => {
    expect(parentLabel({ gender: 'male' })).toBe('Father');
    expect(parentLabel({ gender: 'female' })).toBe('Mother');
  });

  it('falls back to a neutral label rather than guessing', () => {
    expect(parentLabel({ gender: undefined })).toBe('Parent');
    expect(parentLabel({})).toBe('Parent');
    expect(parentLabel(null)).toBe('Parent');
  });
});
