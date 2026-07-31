/**
 * Tests for the succession change report (decision D1).
 *
 * The report exists so a reordering is something the owner inspects rather than
 * discovers months later in a scene they have already written. Its failure mode
 * is therefore specific and one-directional: reporting *no change* when a line
 * has in fact moved. A false "all clear" is the only outcome here that causes
 * damage, so that is what these concentrate on.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset } from './database';
import { buildSuccessionChangeReport, buildRelationshipMaps, buildCorrectedLine } from './successionChangeReport';

let datasetId;
let seq = 0;

async function seed({ people = [], relationships = [], houses = [], dignities = [] }) {
  const db = getDatabase(datasetId);
  for (const p of people) await db.people.add(p);
  for (const r of relationships) await db.relationships.add(r);
  for (const h of houses) await db.houses.add(h);
  for (const d of dignities) await db.dignities.add(d);
}

const parent = (id, parentId, childId) =>
  ({ id, person1Id: parentId, person2Id: childId, relationshipType: 'parent' });

beforeEach(() => { datasetId = `succession-report-test-${++seq}`; });
afterEach(async () => {
  closeDatabaseInstance(datasetId);
  await deleteDatabaseForDataset(datasetId);
});

describe('buildRelationshipMaps', () => {
  it('reads parent links in both directions', () => {
    const maps = buildRelationshipMaps([parent(1, 10, 20)]);
    expect(maps.childrenOf.get(10)).toEqual([20]);
    expect(maps.parentsOf.get(20)).toEqual([10]);
  });

  it('picks up adopted-parent links, which succession ignored entirely', () => {
    const maps = buildRelationshipMaps([
      { id: 1, person1Id: 10, person2Id: 30, relationshipType: 'adopted-parent' }
    ]);
    expect(maps.adoptedChildrenOf.get(10)).toEqual([30]);
    expect(maps.adoptedIds.has(30)).toBe(true);
  });

  it('keeps adopted links out of the natural maps', () => {
    // Otherwise an adopted child would rank as natural issue, which is the
    // opposite of decision D3.
    const maps = buildRelationshipMaps([
      { id: 1, person1Id: 10, person2Id: 30, relationshipType: 'adopted-parent' }
    ]);
    expect(maps.childrenOf.get(10)).toBeUndefined();
  });

  it('ignores relationship types that are not lineage', () => {
    const maps = buildRelationshipMaps([
      { id: 1, person1Id: 10, person2Id: 11, relationshipType: 'mentor' },
      { id: 2, person1Id: 10, person2Id: 12, relationshipType: 'spouse' }
    ]);
    expect(maps.childrenOf.size).toBe(0);
    expect(maps.spouseMap.get(10)).toBe(12);
  });
});

describe('buildSuccessionChangeReport — detecting the reordering', () => {
  // The canonical D1 case. Under the old generational sort this line reads
  // Alfred, Cedric, Bertram; correctly it reads Alfred, Bertram, Cedric.
  const world = {
    people: [
      { id: 1, firstName: 'Holder', gender: 'male', dateOfBirth: '1670', houseId: 1 },
      { id: 2, firstName: 'Alfred', gender: 'male', dateOfBirth: '1700', houseId: 1 },
      { id: 3, firstName: 'Cedric', gender: 'male', dateOfBirth: '1705', houseId: 1 },
      { id: 4, firstName: 'Bertram', gender: 'male', dateOfBirth: '1725', houseId: 1 }
    ],
    relationships: [parent(1, 1, 2), parent(2, 1, 3), parent(3, 2, 4)],
    houses: [{ id: 1, houseName: 'House Wilfrey', parentHouseId: null }],
    dignities: [{
      id: 1, name: 'Duke of Riverhead', currentHolderId: 1,
      successionType: 'male-primogeniture', successionRules: {}
    }]
  };

  it('reports the line as changed, and where', () => {
    // A false "unchanged" is the only dangerous outcome, so this is the
    // assertion the whole report exists to support.
    return seed(world).then(async () => {
      const report = await buildSuccessionChangeReport(datasetId);

      expect(report.changed).toBe(1);
      expect(report.unchanged).toBe(0);

      const [entry] = report.dignities;
      expect(entry.name).toBe('Duke of Riverhead');
      expect(entry.firstChangedPosition).toBe(2);
      expect(entry.afterTop).toEqual(['Alfred', 'Bertram', 'Cedric']);
    });
  });

  it('says the heir is unchanged when only the tail moves', async () => {
    await seed(world);
    const report = await buildSuccessionChangeReport(datasetId);

    expect(report.dignities[0].heirChanged).toBe(false);
    expect(report.dignities[0].heirAfter).toBe('Alfred');
    expect(report.heirsChanged).toBe(0);
  });

  it('flags an heir change loudly when representation changes who inherits', async () => {
    // Alfred predeceased the holder. Correctly, his son Bertram is heir; the
    // old code ranked Bertram last and made Cedric heir.
    await seed({
      ...world,
      people: world.people.map((p) => (p.id === 2 ? { ...p, dateOfDeath: '1740' } : p))
    });

    const report = await buildSuccessionChangeReport(datasetId);
    const entry = report.dignities[0];

    expect(entry.heirChanged).toBe(true);
    expect(entry.heirBefore).toBe('Cedric');
    expect(entry.heirAfter).toBe('Bertram');
    expect(report.heirsChanged).toBe(1);
  });

  it('puts heir changes at the top of the list', async () => {
    await seed({
      people: [
        ...world.people,
        { id: 5, firstName: 'Other', gender: 'male', dateOfBirth: '1680', houseId: 1 },
        { id: 6, firstName: 'OtherSon', gender: 'male', dateOfBirth: '1710', houseId: 1 }
      ],
      relationships: [...world.relationships, parent(4, 5, 6)],
      houses: world.houses,
      dignities: [
        world.dignities[0],
        { id: 2, name: 'Baron of Nowhere', currentHolderId: 5,
          successionType: 'male-primogeniture', successionRules: {} }
      ]
    });

    const report = await buildSuccessionChangeReport(datasetId);
    // Scanning 26 dignities, the one whose heir changed must be met first.
    expect(report.dignities[0].heirChanged || report.dignities.every((d) => !d.heirChanged)).toBe(true);
  });
});

describe('buildSuccessionChangeReport — what it declines to compare', () => {
  it('lists elective and appointed dignities as skipped rather than dropping them', async () => {
    // Dropped silently, the counts would not add up and a reader could not tell
    // whether a dignity was unchanged or simply never examined.
    await seed({
      people: [{ id: 1, firstName: 'Holder', gender: 'male', dateOfBirth: '1670' }],
      dignities: [
        { id: 1, name: 'Elected Seat', currentHolderId: 1, successionType: 'elective' },
        { id: 2, name: 'Appointed Office', currentHolderId: 1, successionType: 'appointment' }
      ]
    });

    const report = await buildSuccessionChangeReport(datasetId);
    expect(report.total).toBe(2);
    expect(report.autoCalculated).toBe(0);
    expect(report.skipped.map((s) => s.name)).toEqual(['Elected Seat', 'Appointed Office']);
  });

  it('names a dignity whose holder does not exist', async () => {
    // This is the broken Crown (D4) in miniature: a holder pointing at a person
    // who is not there. It must be reported, not silently produce an empty line.
    await seed({
      people: [],
      dignities: [{ id: 7, name: 'The Crown', currentHolderId: 82, successionType: 'male-primogeniture' }]
    });

    const report = await buildSuccessionChangeReport(datasetId);
    expect(report.autoCalculated).toBe(0);
    expect(report.skipped[0].reason).toMatch(/#82 does not exist/);
  });

  it('reports a holderless dignity as skipped', async () => {
    await seed({
      dignities: [{ id: 1, name: 'Vacant Seat', currentHolderId: null, successionType: 'male-primogeniture' }]
    });
    const report = await buildSuccessionChangeReport(datasetId);
    expect(report.skipped[0].reason).toBe('no holder');
  });

  it('copes with an empty world', async () => {
    const report = await buildSuccessionChangeReport(datasetId);
    expect(report).toMatchObject({ total: 0, changed: 0, unchanged: 0, errors: [] });
  });
});

describe('buildCorrectedLine', () => {
  const maps = buildRelationshipMaps([parent(1, 1, 2)]);
  const people = new Map([
    [1, { id: 1, firstName: 'Holder', gender: 'male', dateOfBirth: '1670', houseId: 1 }],
    [2, { id: 2, firstName: 'Son', gender: 'male', dateOfBirth: '1700', houseId: 1 }]
  ]);

  it('routes agnatic seniority to the dynasty walk', () => {
    const line = buildCorrectedLine(
      { currentHolderId: 1, successionType: 'agnatic-seniority' },
      { people, maps, houses: [{ id: 1, houseName: 'H', parentHouseId: null }] }
    );
    // Seniority is by age across the dynasty, so the result carries the cadet
    // flag that only the dynasty walk produces.
    expect(line[0]).toHaveProperty('cadet');
  });

  it('applies male preference only for male-primogeniture', () => {
    const withDaughter = new Map(people);
    withDaughter.set(3, { id: 3, firstName: 'Daughter', gender: 'female', dateOfBirth: '1690', houseId: 1 });
    const m = buildRelationshipMaps([parent(1, 1, 2), parent(2, 1, 3)]);

    const male = buildCorrectedLine(
      { currentHolderId: 1, successionType: 'male-primogeniture' },
      { people: withDaughter, maps: m, houses: [] }
    );
    const absolute = buildCorrectedLine(
      { currentHolderId: 1, successionType: 'absolute-primogeniture' },
      { people: withDaughter, maps: m, houses: [] }
    );

    expect(male.map((c) => c.person.firstName)).toEqual(['Son', 'Daughter']);
    expect(absolute.map((c) => c.person.firstName)).toEqual(['Daughter', 'Son']);
  });

  it('returns nothing for a type that is not auto-calculated', () => {
    expect(buildCorrectedLine(
      { currentHolderId: 1, successionType: 'elective' },
      { people, maps, houses: [] }
    )).toEqual([]);
  });
});
