/**
 * The succession swap, end to end (decision D1).
 *
 * `successionRules.test.js` proves the rules; this proves they are actually
 * what the app runs. Those are different claims, and the gap between them is
 * exactly where a correct module sits unused behind a wrong one — which is the
 * state this codebase was already in for the design system and the charge
 * renderer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset } from './database';
import { calculateSuccessionLine, getHeir } from './dignityService';

let datasetId;
let seq = 0;

const parent = (id, parentId, childId) =>
  ({ id, person1Id: parentId, person2Id: childId, relationshipType: 'parent' });

async function seed({ people = [], relationships = [], houses = [], dignities = [] }) {
  const db = getDatabase(datasetId);
  for (const p of people) await db.people.add(p);
  for (const r of relationships) await db.relationships.add(r);
  for (const h of houses) await db.houses.add(h);
  for (const d of dignities) await db.dignities.add(d);
}

const names = (line) => line.map((c) => c.person.firstName);

beforeEach(() => { datasetId = `dignity-succession-test-${++seq}`; });
afterEach(async () => {
  closeDatabaseInstance(datasetId);
  await deleteDatabaseForDataset(datasetId);
});

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

describe('calculateSuccessionLine — the corrected rules are what runs', () => {
  it('orders depth-first, not by generation', async () => {
    await seed(world);
    const people = await getDatabase(datasetId).people.toArray();
    const relationships = await getDatabase(datasetId).relationships.toArray();

    const line = await calculateSuccessionLine(1, people, relationships, datasetId);
    expect(names(line)).toEqual(['Alfred', 'Bertram', 'Cedric']);
  });

  it('represents through a predeceased heir', async () => {
    await seed({
      ...world,
      people: world.people.map((p) => (p.id === 2 ? { ...p, dateOfDeath: '1740' } : p))
    });
    const db = getDatabase(datasetId);
    const line = await calculateSuccessionLine(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );

    expect(names(line)).toEqual(['Bertram', 'Cedric']);
    expect(line[0].representing).toBe(2);
  });

  it('still labels each person with a relationship word for the UI', async () => {
    // Presentation moved out of the rules module; it must not have been lost.
    await seed(world);
    const db = getDatabase(datasetId);
    const line = await calculateSuccessionLine(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );

    expect(line[0].relationship).toBe('Son');
    expect(line[1].relationship).toBe('Grandson');
  });

  it('builds adopted-parent links from the raw relationships it is given', async () => {
    // Decision D3's silent half: the old call site built parent and spouse maps
    // only, so an adopted-parent link could never reach the algorithm at all.
    await seed({
      ...world,
      people: [...world.people, { id: 5, firstName: 'Adopted', gender: 'male', dateOfBirth: '1690', houseId: 1 }],
      relationships: [
        ...world.relationships,
        { id: 4, person1Id: 1, person2Id: 5, relationshipType: 'adopted-parent' }
      ]
    });
    const db = getDatabase(datasetId);
    const line = await calculateSuccessionLine(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );

    expect(names(line)).toContain('Adopted');
    // After natural issue, despite being the eldest.
    expect(names(line)).toEqual(['Alfred', 'Bertram', 'Cedric', 'Adopted']);
  });

  it('includes cadet branches under agnatic seniority', async () => {
    // Decision D2, through the live path.
    await seed({
      people: [
        { id: 1, firstName: 'Holder', gender: 'male', dateOfBirth: '1700', houseId: 1 },
        { id: 2, firstName: 'CadetUncle', gender: 'male', dateOfBirth: '1670', houseId: 2 },
        { id: 3, firstName: 'Nephew', gender: 'male', dateOfBirth: '1730', houseId: 1 }
      ],
      houses: [
        { id: 1, houseName: 'House Wilfrey', parentHouseId: null },
        { id: 2, houseName: 'Wilfrey of Riverhead', parentHouseId: 1 }
      ],
      dignities: [{ id: 1, name: 'The Crown', currentHolderId: 1, successionType: 'agnatic-seniority' }]
    });
    const db = getDatabase(datasetId);
    const line = await calculateSuccessionLine(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );

    expect(names(line)).toEqual(['CadetUncle', 'Nephew']);
  });

  it('returns a designated heir for a type that is not auto-calculated', async () => {
    await seed({
      people: [{ id: 9, firstName: 'Chosen', gender: 'male', dateOfBirth: '1700' }],
      dignities: [{ id: 1, name: 'Elected Seat', successionType: 'elective', designatedHeirId: 9 }]
    });
    const db = getDatabase(datasetId);
    const line = await calculateSuccessionLine(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );

    expect(names(line)).toEqual(['Chosen']);
    expect(line[0].relationship).toBe('Designated Heir');
  });

  it('returns an empty line for a holder who does not exist', async () => {
    // The broken Crown (D4). It must not throw, and must not silently look
    // like a dignity with no relatives.
    await seed({
      dignities: [{ id: 7, name: 'The Crown', currentHolderId: 82, successionType: 'male-primogeniture' }]
    });
    const db = getDatabase(datasetId);
    expect(await calculateSuccessionLine(
      7, await db.people.toArray(), await db.relationships.toArray(), datasetId
    )).toEqual([]);
  });
});

describe('getHeir — one depth cap, shared', () => {
  it('agrees with position 1 of the line', async () => {
    // getHeir capped at 5 while DignityView asked for 10, so the two could be
    // computed over different trees and disagree.
    await seed(world);
    const db = getDatabase(datasetId);
    const people = await db.people.toArray();
    const relationships = await db.relationships.toArray();

    const heir = await getHeir(1, people, relationships, datasetId);
    const line = await calculateSuccessionLine(1, people, relationships, datasetId);

    expect(heir.personId).toBe(line[0].personId);
    expect(heir.person.firstName).toBe('Alfred');
  });

  it('skips an excluded candidate to find the real heir', async () => {
    await seed({
      ...world,
      people: world.people.map((p) => (
        p.id === 2 ? { ...p, legitimacyStatus: 'bastard' } : p
      )),
      dignities: [{
        id: 1, name: 'Duke of Riverhead', currentHolderId: 1,
        successionType: 'male-primogeniture', successionRules: { excludeBastards: true }
      }]
    });
    const db = getDatabase(datasetId);
    const heir = await getHeir(
      1, await db.people.toArray(), await db.relationships.toArray(), datasetId
    );
    expect(heir.person.firstName).toBe('Cedric');
  });
});

describe('a dignity cannot be given a holder who does not exist (decision D4)', () => {
  // The Crown carried currentHolderId 82 against a person who is not in the
  // database, and nothing stopped it being written. Because 25 of the 26
  // dignities chain up to the Crown, one dangling id at the top made the whole
  // feudal structure describe a kingdom ruled by nobody.
  it('refuses to create one', async () => {
    await seed({ people: [{ id: 1, firstName: 'Real', gender: 'male' }] });
    const { createDignity } = await import('./dignityService');

    await expect(
      createDignity({ name: 'Phantom Crown', currentHolderId: 82 }, null, datasetId)
    ).rejects.toThrow(/no such person/i);
  });

  it('refuses to update one onto an existing dignity', async () => {
    await seed({
      people: [{ id: 1, firstName: 'Real', gender: 'male' }],
      dignities: [{ id: 1, name: 'A Seat', currentHolderId: 1 }]
    });
    const { updateDignity } = await import('./dignityService');

    await expect(
      updateDignity(1, { currentHolderId: 82 }, null, datasetId)
    ).rejects.toThrow(/no such person/i);
  });

  it('allows clearing the holder, which is how a dignity is made vacant', async () => {
    // The fix for the Crown itself must not be blocked by the guard written
    // for it.
    await seed({
      people: [{ id: 1, firstName: 'Real', gender: 'male' }],
      dignities: [{ id: 1, name: 'A Seat', currentHolderId: 1 }]
    });
    const { updateDignity } = await import('./dignityService');

    await updateDignity(1, { currentHolderId: null }, null, datasetId);
    expect((await getDatabase(datasetId).dignities.get(1)).currentHolderId).toBeNull();
  });

  it('leaves an already-broken dignity editable', async () => {
    // Validated only when the field is being written. Otherwise the first thing
    // this guard would do is prevent anyone repairing the record it exists for.
    await seed({
      people: [],
      dignities: [{ id: 7, name: 'The Crown', currentHolderId: 82 }]
    });
    const { updateDignity } = await import('./dignityService');

    await updateDignity(7, { successionType: 'male-primogeniture' }, null, datasetId);
    const stored = await getDatabase(datasetId).dignities.get(7);
    expect(stored.successionType).toBe('male-primogeniture');
    expect(stored.currentHolderId).toBe(82);
  });
});
