/**
 * Tests for marriage arms (decision C3, step 6).
 *
 * This walks four hops — person → spouse → their house → its arms — and any of
 * them can be missing in a real world file: a spouse with no house, a house
 * with no arms, arms that were uploaded rather than drawn. Every one of those
 * has to produce a *reason* rather than an empty list, because "no marriage
 * arms available" with no explanation is indistinguishable from a bug.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset } from './database';
import { getMarriageArmsOptions, describeMarriageOption } from './marriageArmsService';
import { composeCoat, composeFromRoot, createPlainNode, createMarshalledNode } from '../utils/heraldry';

let datasetId;
let seq = 0;

const drawnArms = (name) => ({
  name,
  composition: composeCoat({ field: { division: 'plain', tincture1: 'gules' } })
});

async function seed({ people = [], houses = [], heraldry = [], relationships = [] }) {
  const db = getDatabase(datasetId);
  for (const h of heraldry) await db.heraldry.add(h);
  for (const h of houses) await db.houses.add(h);
  for (const p of people) await db.people.add(p);
  for (const r of relationships) await db.relationships.add(r);
}

beforeEach(() => { datasetId = `marriage-arms-test-${++seq}`; });
afterEach(async () => {
  closeDatabaseInstance(datasetId);
  await deleteDatabaseForDataset(datasetId);
});

describe('getMarriageArmsOptions — the happy path', () => {
  it('resolves a spouse\'s house arms into a usable composition', async () => {
    await seed({
      heraldry: [{ id: 10, ...drawnArms('Arms of House Shadash') }],
      houses: [{ id: 5, houseName: 'House Shadash', heraldryId: 10 }],
      people: [
        { id: 1, firstName: 'Aldric', lastName: 'Wilfrey', houseId: 4 },
        { id: 2, firstName: 'Salenne', lastName: 'Shadash', houseId: 5 }
      ],
      relationships: [{ id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' }]
    });

    const [option] = await getMarriageArmsOptions(1, datasetId);

    expect(option.usable).toBe(true);
    expect(option.reason).toBeNull();
    expect(option.spouse.firstName).toBe('Salenne');
    expect(option.house.houseName).toBe('House Shadash');
    expect(option.composition.root.field.tincture1).toBe('gules');
  });

  it('works whichever side of the relationship the person is on', async () => {
    // person1Id/person2Id ordering is not meaningful for a spouse row, and
    // reading only one direction would hide half of all marriages.
    await seed({
      heraldry: [{ id: 10, ...drawnArms('Arms') }],
      houses: [{ id: 5, houseName: 'House Shadash', heraldryId: 10 }],
      people: [
        { id: 1, firstName: 'Aldric', lastName: 'Wilfrey', houseId: 4 },
        { id: 2, firstName: 'Salenne', lastName: 'Shadash', houseId: 5 }
      ],
      relationships: [{ id: 1, person1Id: 2, person2Id: 1, relationshipType: 'spouse' }]
    });

    const [option] = await getMarriageArmsOptions(1, datasetId);
    expect(option.spouse.id).toBe(2);
    expect(option.usable).toBe(true);
  });

  it('carries a marshalled coat across whole', async () => {
    // Marrying a house whose own arms are quartered gives an impalement of a
    // quartering, which is what real marshalling does.
    const quartered = composeFromRoot(createMarshalledNode('quartered', [
      createPlainNode({ field: { tincture1: 'azure' } }),
      createPlainNode({ field: { tincture1: 'or' } }),
      createPlainNode({ field: { tincture1: 'vert' } }),
      createPlainNode({ field: { tincture1: 'sable' } })
    ]));

    await seed({
      heraldry: [{ id: 10, name: 'Quartered arms', composition: quartered }],
      houses: [{ id: 5, houseName: 'House Shadash', heraldryId: 10 }],
      people: [
        { id: 1, firstName: 'Aldric', houseId: 4 },
        { id: 2, firstName: 'Salenne', houseId: 5 }
      ],
      relationships: [{ id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' }]
    });

    const [option] = await getMarriageArmsOptions(1, datasetId);
    expect(option.usable).toBe(true);
    expect(option.composition.root.type).toBe('marshalled');
    expect(option.composition.root.parts).toHaveLength(4);
  });

  it('returns one entry per marriage for someone widowed and remarried', async () => {
    await seed({
      heraldry: [{ id: 10, ...drawnArms('A') }, { id: 11, ...drawnArms('B') }],
      houses: [
        { id: 5, houseName: 'House Shadash', heraldryId: 10 },
        { id: 6, houseName: 'House Riverhead', heraldryId: 11 }
      ],
      people: [
        { id: 1, firstName: 'Aldric', houseId: 4 },
        { id: 2, firstName: 'Salenne', houseId: 5 },
        { id: 3, firstName: 'Mirelle', houseId: 6 }
      ],
      relationships: [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' },
        { id: 2, person1Id: 1, person2Id: 3, relationshipType: 'spouse' }
      ]
    });

    const options = await getMarriageArmsOptions(1, datasetId);
    expect(options).toHaveLength(2);
    expect(options.every((o) => o.usable)).toBe(true);
  });
});

describe('getMarriageArmsOptions — says why, rather than saying nothing', () => {
  async function seedSpouseWith(overrides) {
    await seed({
      people: [
        { id: 1, firstName: 'Aldric', houseId: 4 },
        { id: 2, firstName: 'Salenne', ...overrides.spouse }
      ],
      relationships: [{ id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' }],
      houses: overrides.houses ?? [],
      heraldry: overrides.heraldry ?? []
    });
  }

  it('reports a spouse who belongs to no house', async () => {
    await seedSpouseWith({ spouse: { houseId: null } });
    const [option] = await getMarriageArmsOptions(1, datasetId);

    expect(option.usable).toBe(false);
    expect(option.reason).toMatch(/no house/i);
  });

  it('reports a house with no arms drawn yet — the actionable case', async () => {
    await seedSpouseWith({
      spouse: { houseId: 5 },
      houses: [{ id: 5, houseName: 'House Shadash', heraldryId: null }]
    });
    const [option] = await getMarriageArmsOptions(1, datasetId);

    expect(option.usable).toBe(false);
    expect(option.reason).toContain('House Shadash');
  });

  it('reports arms that were uploaded rather than drawn', async () => {
    // Imagery with no composition cannot be marshalled, and inventing one
    // would fabricate a coat nobody drew.
    await seedSpouseWith({
      spouse: { houseId: 5 },
      houses: [{ id: 5, houseName: 'House Shadash', heraldryId: 10 }],
      heraldry: [{ id: 10, name: 'Uploaded arms', composition: null }]
    });
    const [option] = await getMarriageArmsOptions(1, datasetId);

    expect(option.usable).toBe(false);
    expect(option.reason).toMatch(/uploaded/i);
  });

  it('reports a dangling house reference', async () => {
    await seedSpouseWith({ spouse: { houseId: 999 } });
    const [option] = await getMarriageArmsOptions(1, datasetId);
    expect(option.usable).toBe(false);
    expect(option.reason).toMatch(/missing/i);
  });
});

describe('getMarriageArmsOptions — nothing to offer', () => {
  it('returns an empty list for someone unmarried', async () => {
    await seed({ people: [{ id: 1, firstName: 'Aldric', houseId: 4 }] });
    expect(await getMarriageArmsOptions(1, datasetId)).toEqual([]);
  });

  it('ignores relationships that are not marriages', async () => {
    await seed({
      people: [{ id: 1, firstName: 'Aldric' }, { id: 2, firstName: 'Elric' }],
      relationships: [{ id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }]
    });
    expect(await getMarriageArmsOptions(1, datasetId)).toEqual([]);
  });

  it('returns an empty list rather than throwing without a person', async () => {
    expect(await getMarriageArmsOptions(null, datasetId)).toEqual([]);
  });
});

describe('describeMarriageOption', () => {
  it('names the spouse and their house, since a person can marry twice', () => {
    expect(describeMarriageOption({
      spouse: { firstName: 'Salenne', lastName: 'Shadash' },
      house: { houseName: 'House Shadash' }
    })).toBe('Salenne Shadash — House Shadash');
  });

  it('copes with a missing house or name', () => {
    expect(describeMarriageOption({ spouse: { firstName: 'Salenne' }, house: null }))
      .toBe('Salenne');
    expect(describeMarriageOption({ spouse: {}, house: null })).toBe('their spouse');
  });
});
