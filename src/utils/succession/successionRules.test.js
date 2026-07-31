/**
 * Tests for succession (decisions D1, D2, D3).
 *
 * Each of the three confirmed defects gets a test named after it, because the
 * value of this module is not that it is new code — it is that the old
 * behaviour was wrong in ways nobody could see without constructing the family
 * that exposes it. A succession line is always *plausible*; that is exactly why
 * it went wrong for so long.
 */
import { describe, it, expect } from 'vitest';
import { buildSuccessionLine } from './successionRules';
import { buildAgnaticSeniorityLine, collectDynastyHouses } from './dynasty';

/** Compact family builder: people plus parent→children edges. */
function family(rows) {
  const people = new Map();
  const childrenOf = new Map();
  const parentsOf = new Map();

  for (const row of rows) {
    people.set(row.id, { gender: 'male', ...row });
    for (const parentId of row.parents ?? []) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), row.id]);
      parentsOf.set(row.id, [...(parentsOf.get(row.id) ?? []), parentId]);
    }
  }
  return { people, childrenOf, parentsOf };
}

const names = (line) => line.map((c) => c.person.firstName);

describe('D1 — the depth-first walk is no longer discarded', () => {
  // Holder ── Alfred (b.1700) ── Bertram (b.1725)
  //        └─ Cedric (b.1705)
  //
  // The whole point of primogeniture: Alfred's son stands in Alfred's line,
  // ahead of Alfred's younger brother. The old generational sort put Cedric
  // second because he was a generation closer to the holder.
  const { people, childrenOf, parentsOf } = family([
    { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
    { id: 2, firstName: 'Alfred', dateOfBirth: '1700', parents: [1] },
    { id: 3, firstName: 'Cedric', dateOfBirth: '1705', parents: [1] },
    { id: 4, firstName: 'Bertram', dateOfBirth: '1725', parents: [2] }
  ]);

  it('places a grandson through the eldest son ahead of the second son', () => {
    const line = buildSuccessionLine({ holderId: 1, people, childrenOf, parentsOf });
    expect(names(line)).toEqual(['Alfred', 'Bertram', 'Cedric']);
  });

  it('keeps a whole branch together rather than interleaving generations', () => {
    const deep = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Alfred', dateOfBirth: '1700', parents: [1] },
      { id: 3, firstName: 'Cedric', dateOfBirth: '1705', parents: [1] },
      { id: 4, firstName: 'Bertram', dateOfBirth: '1725', parents: [2] },
      { id: 5, firstName: 'Dunstan', dateOfBirth: '1750', parents: [4] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...deep });
    expect(names(line)).toEqual(['Alfred', 'Bertram', 'Dunstan', 'Cedric']);
  });
});

describe('D1 — representation through a predeceased heir', () => {
  // Alfred died before the holder. His son must take his place, not fall to
  // the back of the line. In a world spanning 1680–2016 this is not an edge
  // case; it is most successions.
  const { people, childrenOf, parentsOf } = family([
    { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
    { id: 2, firstName: 'Alfred', dateOfBirth: '1700', dateOfDeath: '1740', parents: [1] },
    { id: 3, firstName: 'Cedric', dateOfBirth: '1705', parents: [1] },
    { id: 4, firstName: 'Bertram', dateOfBirth: '1725', parents: [2] }
  ]);

  it('puts the dead heir\'s son in his father\'s place', () => {
    const line = buildSuccessionLine({ holderId: 1, people, childrenOf, parentsOf });
    expect(names(line)).toEqual(['Bertram', 'Cedric']);
  });

  it('leaves the dead out of the line entirely', () => {
    const line = buildSuccessionLine({ holderId: 1, people, childrenOf, parentsOf });
    expect(names(line)).not.toContain('Alfred');
  });

  it('records whose place is being taken, so the jump is explicable', () => {
    const line = buildSuccessionLine({ holderId: 1, people, childrenOf, parentsOf });
    expect(line[0].representing).toBe(2);
    expect(line[1].representing).toBeNull();
  });

  it('represents through two dead generations', () => {
    const twice = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Alfred', dateOfBirth: '1700', dateOfDeath: '1740', parents: [1] },
      { id: 3, firstName: 'Cedric', dateOfBirth: '1705', parents: [1] },
      { id: 4, firstName: 'Bertram', dateOfBirth: '1725', dateOfDeath: '1739', parents: [2] },
      { id: 5, firstName: 'Dunstan', dateOfBirth: '1738', parents: [4] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...twice });
    expect(names(line)).toEqual(['Dunstan', 'Cedric']);
    expect(line[0].representing).toBe(2);
  });
});

describe('D1 — male preference applies within a sibling set, not globally', () => {
  // Holder ── Matilda (daughter)
  //        └─ (brother) ── (nephew) ── Rowan (great-nephew)
  //
  // The old sort demoted every woman below every man anywhere in the tree, so
  // the holder's own daughter ranked behind a distant male cousin.
  const { people, childrenOf, parentsOf } = family([
    { id: 0, firstName: 'Grandsire', dateOfBirth: '1640' },
    { id: 1, firstName: 'Holder', dateOfBirth: '1670', parents: [0] },
    { id: 2, firstName: 'Matilda', gender: 'female', dateOfBirth: '1700', parents: [1] },
    { id: 3, firstName: 'Brother', dateOfBirth: '1675', parents: [0] },
    { id: 4, firstName: 'Nephew', dateOfBirth: '1705', parents: [3] },
    { id: 5, firstName: 'Rowan', dateOfBirth: '1730', parents: [4] }
  ]);

  it('keeps a daughter ahead of a collateral male line', () => {
    const line = buildSuccessionLine({
      holderId: 1, people, childrenOf, parentsOf, malePreference: true
    });
    expect(names(line)).toEqual(['Matilda', 'Brother', 'Nephew', 'Rowan']);
  });

  it('still prefers a younger brother to an elder sister among siblings', () => {
    const sibs = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Elder', gender: 'female', dateOfBirth: '1700', parents: [1] },
      { id: 3, firstName: 'Younger', dateOfBirth: '1705', parents: [1] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...sibs, malePreference: true });
    expect(names(line)).toEqual(['Younger', 'Elder']);
  });

  it('orders purely by birth under absolute primogeniture', () => {
    const sibs = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Elder', gender: 'female', dateOfBirth: '1700', parents: [1] },
      { id: 3, firstName: 'Younger', dateOfBirth: '1705', parents: [1] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...sibs, malePreference: false });
    expect(names(line)).toEqual(['Elder', 'Younger']);
  });
});

describe('D3 — adopted children', () => {
  const rows = [
    { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
    { id: 2, firstName: 'Natural', dateOfBirth: '1705', parents: [1] },
    { id: 3, firstName: 'Adopted', dateOfBirth: '1700' }
  ];

  it('places an adopted child after natural issue, despite being older', () => {
    const { people, childrenOf, parentsOf } = family(rows);
    const line = buildSuccessionLine({
      holderId: 1,
      people,
      childrenOf,
      parentsOf,
      adoptedChildrenOf: new Map([[1, [3]]]),
      adoptedIds: new Set([3])
    });
    expect(names(line)).toEqual(['Natural', 'Adopted']);
  });

  it('gives an adopted child a place at all — the silent half of D3', () => {
    // An adopted-parent link created no succession path before, so an adopted
    // child inherited only if they happened to have a natural parent link too.
    const { people, childrenOf, parentsOf } = family(rows);
    const line = buildSuccessionLine({
      holderId: 1,
      people,
      childrenOf,
      parentsOf,
      adoptedChildrenOf: new Map([[1, [3]]]),
      adoptedIds: new Set([3])
    });
    expect(names(line)).toContain('Adopted');
  });

  it('does not list a child twice who holds both link types', () => {
    const { people, childrenOf, parentsOf } = family(rows);
    const line = buildSuccessionLine({
      holderId: 1,
      people,
      childrenOf,
      parentsOf,
      adoptedChildrenOf: new Map([[1, [2]]]),
      adoptedIds: new Set()
    });
    expect(names(line)).toEqual(['Natural']);
  });

  it('carries an adopted child\'s own descent with them', () => {
    const withIssue = family([...rows, { id: 4, firstName: 'Grandchild', dateOfBirth: '1730', parents: [3] }]);
    const line = buildSuccessionLine({
      holderId: 1,
      ...withIssue,
      adoptedChildrenOf: new Map([[1, [3]]]),
      adoptedIds: new Set([3])
    });
    expect(names(line)).toEqual(['Natural', 'Adopted', 'Grandchild']);
  });
});

describe('legitimacy', () => {
  const rows = [
    { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
    { id: 2, firstName: 'Bastard', dateOfBirth: '1700', legitimacyStatus: 'bastard', parents: [1] },
    { id: 3, firstName: 'Trueborn', dateOfBirth: '1705', parents: [1] }
  ];

  it('ranks a bastard after trueborn issue even when older', () => {
    const line = buildSuccessionLine({ holderId: 1, ...family(rows) });
    expect(names(line)).toEqual(['Trueborn', 'Bastard']);
  });

  it('marks a bastard excluded when the dignity says so, without hiding them', () => {
    const line = buildSuccessionLine({
      holderId: 1, ...family(rows), rules: { excludeBastards: true }
    });
    const bastard = line.find((c) => c.person.firstName === 'Bastard');
    expect(bastard.excluded).toBe(true);
    expect(bastard.exclusionReason).toBe('Illegitimate birth');
  });

  it('admits a legitimised bastard when the dignity allows it', () => {
    const legitimised = rows.map((r) => (
      r.id === 2 ? { ...r, bastardStatus: 'legitimized' } : r
    ));
    const line = buildSuccessionLine({
      holderId: 1,
      ...family(legitimised),
      rules: { excludeBastards: true, legitimizedBastardsEligible: true }
    });
    expect(line.find((c) => c.person.firstName === 'Bastard').excluded).toBe(false);
  });
});

describe('collateral lines', () => {
  it('sweeps outward: own issue, then siblings, then uncles', () => {
    const tree = family([
      { id: 0, firstName: 'Grandsire', dateOfBirth: '1640' },
      { id: 1, firstName: 'Holder', dateOfBirth: '1670', parents: [0] },
      { id: 2, firstName: 'Son', dateOfBirth: '1700', parents: [1] },
      { id: 3, firstName: 'Brother', dateOfBirth: '1675', parents: [0] },
      { id: 9, firstName: 'GreatGrandsire', dateOfBirth: '1610' },
      { id: 4, firstName: 'Uncle', dateOfBirth: '1645', parents: [9] }
    ]);
    tree.parentsOf.set(0, [9]);
    tree.childrenOf.set(9, [0, 4]);

    const line = buildSuccessionLine({ holderId: 1, ...tree });
    expect(names(line)).toEqual(['Son', 'Brother', 'Uncle']);
  });

  it('does not put the holder\'s own ancestors in the line', () => {
    // A dignity descends. The holder's father and grandfather are walked
    // *through*, to reach their other children, but they are not themselves
    // heirs to their own descendant — which is what "line of succession"
    // means. Worth an explicit test: it is the kind of rule that looks like an
    // omission until someone writes it down.
    const tree = family([
      { id: 0, firstName: 'Father', dateOfBirth: '1640' },
      { id: 1, firstName: 'Holder', dateOfBirth: '1670', parents: [0] },
      { id: 2, firstName: 'Brother', dateOfBirth: '1675', parents: [0] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...tree });

    expect(names(line)).toEqual(['Brother']);
    expect(names(line)).not.toContain('Father');
  });

  it('never lists anyone twice, however the tree loops back', () => {
    const tree = family([
      { id: 0, firstName: 'Grandsire', dateOfBirth: '1640' },
      { id: 1, firstName: 'Holder', dateOfBirth: '1670', parents: [0] },
      { id: 2, firstName: 'Brother', dateOfBirth: '1675', parents: [0] }
    ]);
    const line = buildSuccessionLine({ holderId: 1, ...tree });
    expect(new Set(line.map((c) => c.personId)).size).toBe(line.length);
  });

  it('excludes the holder from their own line', () => {
    const tree = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Son', dateOfBirth: '1700', parents: [1] }
    ]);
    expect(names(buildSuccessionLine({ holderId: 1, ...tree }))).toEqual(['Son']);
  });
});

describe('robustness', () => {
  it('returns an empty line for an unknown holder', () => {
    expect(buildSuccessionLine({
      holderId: 99, people: new Map(), childrenOf: new Map(), parentsOf: new Map()
    })).toEqual([]);
  });

  it('returns an empty line for a holder with no relatives', () => {
    const tree = family([{ id: 1, firstName: 'Holder', dateOfBirth: '1670' }]);
    expect(buildSuccessionLine({ holderId: 1, ...tree })).toEqual([]);
  });

  it('sorts people with no birth date last rather than first', () => {
    const tree = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'Undated', parents: [1] },
      { id: 3, firstName: 'Dated', dateOfBirth: '1710', parents: [1] }
    ]);
    expect(names(buildSuccessionLine({ holderId: 1, ...tree }))).toEqual(['Dated', 'Undated']);
  });

  it('honours the depth cap without throwing', () => {
    const rows = [{ id: 1, firstName: 'P1', dateOfBirth: '1600' }];
    for (let i = 2; i <= 30; i++) {
      rows.push({ id: i, firstName: `P${i}`, dateOfBirth: String(1600 + i * 5), parents: [i - 1] });
    }
    const line = buildSuccessionLine({ holderId: 1, ...family(rows), maxDepth: 4 });
    expect(line.length).toBe(4);
  });

  it('numbers positions consecutively from one', () => {
    const tree = family([
      { id: 1, firstName: 'Holder', dateOfBirth: '1670' },
      { id: 2, firstName: 'A', dateOfBirth: '1700', parents: [1] },
      { id: 3, firstName: 'B', dateOfBirth: '1705', parents: [1] }
    ]);
    expect(buildSuccessionLine({ holderId: 1, ...tree }).map((c) => c.position)).toEqual([1, 2]);
  });
});

describe('D2 — the dynasty includes cadet branches', () => {
  const houses = [
    { id: 1, houseName: 'House Wilfrey', parentHouseId: null },
    { id: 2, houseName: 'Wilfrey of Riverhead', parentHouseId: 1 },
    { id: 3, houseName: 'Wilfrey of Blackmount', parentHouseId: 2 },
    { id: 4, houseName: 'House Shadash', parentHouseId: null }
  ];

  it('collects a house and everything descended from it', () => {
    expect(collectDynastyHouses(1, houses)).toEqual(new Set([1, 2, 3]));
  });

  it('does not sweep in unrelated houses', () => {
    expect(collectDynastyHouses(1, houses).has(4)).toBe(false);
  });

  it('starts from a cadet branch without climbing to the senior line', () => {
    expect(collectDynastyHouses(2, houses)).toEqual(new Set([2, 3]));
  });

  it('survives a cycle in the house tree rather than hanging', () => {
    // A hand-edited house tree can loop; an unguarded walk would hang the
    // succession panel with no error to show for it.
    const looped = [
      { id: 1, houseName: 'A', parentHouseId: 2 },
      { id: 2, houseName: 'B', parentHouseId: 1 }
    ];
    expect(collectDynastyHouses(1, looped)).toEqual(new Set([1, 2]));
  });

  it('includes a cadet-branch uncle who was previously invisible', () => {
    const people = new Map([
      [1, { id: 1, firstName: 'Holder', gender: 'male', houseId: 1, dateOfBirth: '1700' }],
      [2, { id: 2, firstName: 'Uncle', gender: 'male', houseId: 2, dateOfBirth: '1670' }],
      [3, { id: 3, firstName: 'Nephew', gender: 'male', houseId: 1, dateOfBirth: '1730' }],
      [4, { id: 4, firstName: 'Stranger', gender: 'male', houseId: 4, dateOfBirth: '1650' }]
    ]);

    const line = buildAgnaticSeniorityLine({ holderId: 1, people, houses });

    // Uncle before nephew — the point of agnatic seniority — and the unrelated
    // house stays out despite being the oldest man alive.
    expect(names(line)).toEqual(['Uncle', 'Nephew']);
    expect(line[0].cadet).toBe(true);
    expect(line[1].cadet).toBe(false);
  });

  it('leaves out women and the dead', () => {
    const people = new Map([
      [1, { id: 1, gender: 'male', houseId: 1, dateOfBirth: '1700' }],
      [2, { id: 2, firstName: 'Sister', gender: 'female', houseId: 1, dateOfBirth: '1660' }],
      [3, { id: 3, firstName: 'Late', gender: 'male', houseId: 1, dateOfBirth: '1665', dateOfDeath: '1699' }],
      [4, { id: 4, firstName: 'Living', gender: 'male', houseId: 1, dateOfBirth: '1710' }]
    ]);
    expect(names(buildAgnaticSeniorityLine({ holderId: 1, people, houses }))).toEqual(['Living']);
  });

  it('leaves out people of no house at all', () => {
    const people = new Map([
      [1, { id: 1, gender: 'male', houseId: 1, dateOfBirth: '1700' }],
      [2, { id: 2, firstName: 'Houseless', gender: 'male', houseId: null, dateOfBirth: '1650' }]
    ]);
    expect(buildAgnaticSeniorityLine({ holderId: 1, people, houses })).toEqual([]);
  });
});
