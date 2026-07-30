/**
 * Tests for the persisted composition migration (decision C3).
 *
 * These run against a real (fake-indexeddb) database rather than mocks,
 * because the properties that matter are about what ends up written: that a
 * dry run writes nothing, that a second run is a no-op, that a record which
 * fails validation is left alone rather than half-migrated, and that arms with
 * no composition are not given one.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset } from './database';
import { migrateHeraldryCompositions, heraldryNeedsCompositionMigration } from './heraldryCompositionMigration';
import { COMPOSITION_VERSION } from '../utils/heraldry';

let datasetId;
let seq = 0;

const v2Composition = {
  field: { division: 'perPale', tincture1: 'azure', tincture2: 'argent', tincture3: 'gules', lineStyle: 'straight', count: 6, inverted: false },
  ordinaries: [{ type: 'chief', tincture: 'or', visible: true }],
  charges: [{ chargeId: 'lion4', tincture: 'gules', size: 'medium', count: 1, arrangement: 'fessPoint', visible: true }],
  version: 2
};

async function seed(records) {
  const db = getDatabase(datasetId);
  for (const record of records) await db.heraldry.add(record);
}

async function readAll() {
  return getDatabase(datasetId).heraldry.toArray();
}

beforeEach(() => {
  datasetId = `heraldry-migration-test-${++seq}`;
});

afterEach(async () => {
  closeDatabaseInstance(datasetId);
  await deleteDatabaseForDataset(datasetId);
});

describe('migrateHeraldryCompositions — dry run', () => {
  it('reports what would change without writing anything', async () => {
    await seed([{ name: 'Arms of House Wilfrey', composition: v2Composition }]);

    const report = await migrateHeraldryCompositions({ datasetId });

    expect(report.apply).toBe(false);
    expect(report.total).toBe(1);
    expect(report.migrated).toBe(1);

    // The record on disk must be untouched — this is the whole point of a dry run.
    const [stored] = await readAll();
    expect(stored.composition).toEqual(v2Composition);
    expect(stored.composition.version).toBe(2);
  });

  it('defaults to a dry run when no options are passed at all', async () => {
    await seed([{ name: 'Arms', composition: v2Composition }]);
    await migrateHeraldryCompositions({ datasetId });

    const [stored] = await readAll();
    expect(stored.composition.version).toBe(2);
  });
});

describe('migrateHeraldryCompositions — applying', () => {
  it('writes the migrated composition', async () => {
    await seed([{ name: 'Arms of House Wilfrey', composition: v2Composition }]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });
    expect(report.migrated).toBe(1);

    const [stored] = await readAll();
    expect(stored.composition.version).toBe(COMPOSITION_VERSION);
    expect(stored.composition.root.type).toBe('plain');
    expect(stored.composition.root.field).toEqual(v2Composition.field);
    expect(stored.composition.root.ordinaries).toEqual(v2Composition.ordinaries);
    expect(stored.composition.root.charges).toEqual(v2Composition.charges);
  });

  it('leaves every other field on the record alone', async () => {
    // The migration touches `composition` and nothing else. Blazon, imagery and
    // links are the parts that would be expensive to lose.
    await seed([{
      name: 'Arms of House Wilfrey',
      blazon: 'Per pale azure and argent, a chief or',
      heraldrySVG: '<svg>original</svg>',
      heraldryThumbnail: 'data:image/png;base64,AAAA',
      category: 'noble',
      tags: ['house', 'wilfrey'],
      codexEntryId: 412,
      composition: v2Composition
    }]);

    await migrateHeraldryCompositions({ datasetId, apply: true });

    const [stored] = await readAll();
    expect(stored.blazon).toBe('Per pale azure and argent, a chief or');
    expect(stored.heraldrySVG).toBe('<svg>original</svg>');
    expect(stored.heraldryThumbnail).toBe('data:image/png;base64,AAAA');
    expect(stored.category).toBe('noble');
    expect(stored.tags).toEqual(['house', 'wilfrey']);
    expect(stored.codexEntryId).toBe(412);
  });

  it('is a no-op on a second run', async () => {
    await seed([{ name: 'Arms', composition: v2Composition }]);

    await migrateHeraldryCompositions({ datasetId, apply: true });
    const afterFirst = await readAll();

    const second = await migrateHeraldryCompositions({ datasetId, apply: true });
    expect(second.migrated).toBe(0);
    expect(second.alreadyCurrent).toBe(1);

    expect(await readAll()).toEqual(afterFirst);
  });
});

describe('migrateHeraldryCompositions — records it must not touch', () => {
  it('does not fabricate a composition for uploaded or generated arms', async () => {
    // Armoria and upload records carry imagery and no composition. Giving them
    // one would claim the owner drew a coat they never drew.
    await seed([
      { name: 'Uploaded arms', composition: null, heraldrySVG: '<svg/>' },
      { name: 'Generated arms', heraldryThumbnail: 'data:image/png;base64,BBBB' }
    ]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(report.noComposition).toBe(2);
    expect(report.migrated).toBe(0);

    const stored = await readAll();
    expect(stored[0].composition).toBeNull();
    expect(stored[1].composition).toBeUndefined();
  });

  it('leaves a malformed composition in place and reports it', async () => {
    await seed([{ name: 'Broken arms', composition: 'this is not a composition' }]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(report.failed).toBe(1);
    expect(report.migrated).toBe(0);
    expect(report.errors[0].name).toBe('Broken arms');

    // Untouched, not half-migrated.
    const [stored] = await readAll();
    expect(stored.composition).toBe('this is not a composition');
  });

  it('keeps going after one bad record', async () => {
    await seed([
      { name: 'Broken', composition: 42 },
      { name: 'Good', composition: v2Composition }
    ]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(report.failed).toBe(1);
    expect(report.migrated).toBe(1);

    const stored = await readAll();
    expect(stored.find((r) => r.name === 'Good').composition.version).toBe(COMPOSITION_VERSION);
  });
});

describe('migrateHeraldryCompositions — reporting', () => {
  it('names the coats that got an ordinary back', async () => {
    // The legacy loader dropped these silently, so the owner should be told
    // which shields changed rather than discovering it visually.
    await seed([{
      name: 'Arms of House Shadash',
      composition: { division: 'chief', tincture1: 'azure', tincture2: 'or', lineStyle: 'straight' }
    }]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(report.recoveredOrdinaries).toEqual([
      { heraldryId: expect.any(Number), name: 'Arms of House Shadash', ordinary: 'chief' }
    ]);

    const [stored] = await readAll();
    expect(stored.composition.root.ordinaries[0].type).toBe('chief');
    expect(stored.composition.root.field.division).toBe('plain');
  });

  it('names the coats carrying keys it did not understand', async () => {
    await seed([{
      name: 'Experimental arms',
      composition: { division: 'perPale', tincture1: 'azure', someFutureThing: { a: 1 } }
    }]);

    const report = await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(report.withUnmigratedKeys).toEqual([
      { heraldryId: expect.any(Number), name: 'Experimental arms', keys: ['someFutureThing'] }
    ]);

    // Preserved on the record, not dropped.
    const [stored] = await readAll();
    expect(stored.composition.unmigrated).toEqual({ someFutureThing: { a: 1 } });
  });

  it('counts an empty dataset without failing', async () => {
    const report = await migrateHeraldryCompositions({ datasetId });
    expect(report).toMatchObject({ total: 0, migrated: 0, failed: 0, errors: [] });
  });
});

describe('heraldryNeedsCompositionMigration', () => {
  it('is true while any record is behind', async () => {
    await seed([
      { name: 'Current', composition: { version: COMPOSITION_VERSION, root: { type: 'plain', field: {}, ordinaries: [], charges: [] } } },
      { name: 'Behind', composition: v2Composition }
    ]);

    expect(await heraldryNeedsCompositionMigration(datasetId)).toBe(true);
  });

  it('is false once everything is migrated', async () => {
    await seed([{ name: 'Behind', composition: v2Composition }]);
    await migrateHeraldryCompositions({ datasetId, apply: true });

    expect(await heraldryNeedsCompositionMigration(datasetId)).toBe(false);
  });

  it('is false for a dataset whose arms have no compositions', async () => {
    await seed([{ name: 'Uploaded', composition: null }]);
    expect(await heraldryNeedsCompositionMigration(datasetId)).toBe(false);
  });
});
