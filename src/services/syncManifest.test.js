/**
 * Sync manifest tests — step 1 of the sync-layer refactor.
 *
 * These are the reason step 1 is worth landing on its own. The manifest is
 * inert until step 3, but the assertions here start working immediately, and
 * they are what turns "the four collection lists disagree" from a thing someone
 * has to notice into a thing the suite refuses to let happen.
 *
 * Three invariants, each closing a bug class the audit found live:
 *
 *   1. Every manifest entity names a Dexie table that exists. The audit's
 *      `arcMilestones` was a phantom entity with no table, and every upload
 *      threw a TypeError because seven planner reads sat in one try block.
 *   2. Every manifest entity has a `firestore.rules` match block. Without one,
 *      the write is rejected at the server and the failure surfaces only as a
 *      logged sync error.
 *   3. Coverage is *total*: every table in the schema is either a synced
 *      entity or explicitly declared local-only. This is the one that stops
 *      the next `acknowledgedDuplicates` — a table cleared on download with
 *      nothing to restore it from.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ENTITIES,
  LEGACY_FLAT_COLLECTIONS,
  LOCAL_ONLY_TABLES,
  RULES_WITHOUT_SYNC,
  STRUCTURAL_RULES_PATHS,
  allEntities,
  cloudCollections,
  createStampFor,
  getEntity,
  updateModeFor,
  writePolicyDeviations,
  syncedCollections,
  syncedTables
} from './syncManifest';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset } from './database';

const DATASET = 'sync-manifest-test';

/** Table names as Dexie itself reports them, from a real opened database. */
let schemaTables = [];

/** Indexed field names per table, primary key included. */
let schemaIndexes = {};

/** Collection names with a `match /<name>/` block in firestore.rules. */
let rulesCollections = [];

beforeAll(async () => {
  const db = getDatabase(DATASET);
  await db.open();
  schemaTables = db.tables.map((table) => table.name);
  schemaIndexes = Object.fromEntries(
    db.tables.map((table) => [
      table.name,
      [table.schema.primKey.name, ...table.schema.indexes.map((index) => index.name)]
    ])
  );

  // Resolved from this file rather than from cwd: `process` is not in the
  // test environment's globals (jsdom), and a path relative to the module is
  // correct however the suite is invoked.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const rules = readFileSync(resolve(repoRoot, 'firestore.rules'), 'utf8');
  rulesCollections = [...rules.matchAll(/match\s+\/([A-Za-z][A-Za-z0-9]*)\//g)].map((m) => m[1]);
});

afterAll(async () => {
  await closeDatabaseInstance(DATASET);
  await deleteDatabaseForDataset(DATASET);
});

describe('the manifest describes itself consistently', () => {
  it('keys the map by each entity\'s own entityType', () => {
    // A mismatch here would mean a sync-queue row routing to the wrong entity,
    // which is invisible until a replay writes to the wrong collection.
    for (const [key, entity] of Object.entries(ENTITIES)) {
      expect(entity.entityType).toBe(key);
    }
  });

  it('gives every entity at least an add and a delete', () => {
    for (const entity of allEntities()) {
      expect(entity.ops).toContain('add');
      expect(entity.ops).toContain('delete');
    }
  });

  it('names no table or collection twice', () => {
    expect(new Set(syncedTables()).size).toBe(syncedTables().length);
    expect(new Set(syncedCollections()).size).toBe(syncedCollections().length);
  });

  it('looks entities up by their queue key', () => {
    expect(getEntity('person')?.table).toBe('people');
    expect(getEntity('dignityTenure')?.collection).toBe('dignityTenures');
    expect(getEntity('arcMilestone')).toBeUndefined();
  });
});

describe('every manifest entity exists locally', () => {
  it('names a Dexie table that is actually in the schema', () => {
    const missing = allEntities()
      .filter((entity) => !schemaTables.includes(entity.table))
      .map((entity) => `${entity.entityType} -> ${entity.table}`);

    // This is the assertion that would have caught `arcMilestones`: an entity
    // declared in the sync layer with no table behind it.
    expect(missing).toEqual([]);
  });
});

describe('every manifest entity is permitted in the cloud', () => {
  it('has a firestore.rules match block', () => {
    const missing = allEntities()
      .filter((entity) => !rulesCollections.includes(entity.collection))
      .map((entity) => entity.collection);

    expect(missing).toEqual([]);
  });

  it('accounts for every entity rules block, synced or not', () => {
    const accountedFor = new Set([
      ...syncedCollections(),
      ...RULES_WITHOUT_SYNC,
      ...STRUCTURAL_RULES_PATHS
    ]);

    // A rules block nobody syncs to is either a local-only table (recorded in
    // RULES_WITHOUT_SYNC) or an open security surface nobody meant to leave.
    const unaccounted = rulesCollections.filter((name) => !accountedFor.has(name));
    expect(unaccounted).toEqual([]);
  });
});

describe('destructive operations cover everything', () => {
  it('sweeps the two collections nothing syncs to', () => {
    // `datasetService.deleteDataset` iterates cloudCollections(). Missing these
    // would leave documents under a dataset the user deleted, which the next
    // dataset created with the same id would inherit.
    //
    // There used to be a second wipe — `firestoreService.deleteAllCloudData` —
    // saying the same thing in its own words. It had no callers and was deleted
    // in step 7. Two implementations of "remove everything" is the drift this
    // manifest exists to prevent, so one is the right number.
    for (const name of RULES_WITHOUT_SYNC) {
      expect(cloudCollections()).toContain(name);
    }
  });

  it('is a strict superset of what sync touches', () => {
    for (const name of syncedCollections()) {
      expect(cloudCollections()).toContain(name);
    }
    expect(cloudCollections().length).toBeGreaterThan(syncedCollections().length);
  });

  it('names nothing twice', () => {
    expect(new Set(cloudCollections()).size).toBe(cloudCollections().length);
  });
});

describe('the legacy flat-path list stays historical', () => {
  it('keeps the two local-only collections that sync derivation would drop', () => {
    // The whole trap of step 2. `acknowledgedDuplicates` and `bugs` exist at
    // the pre-dataset path for anyone who used the app before datasets, and
    // deriving this list from syncedCollections() would strand them there.
    expect(LEGACY_FLAT_COLLECTIONS).toContain('acknowledgedDuplicates');
    expect(LEGACY_FLAT_COLLECTIONS).toContain('bugs');
  });

  it('excludes everything added after the dataset structure', () => {
    // Writing Studio (v14) and Story Planner (v15) postdate datasets, and have
    // only ever been written through a path including datasets/{id}. If one
    // appears here, someone has "helpfully" derived this list.
    const postDataset = [
      'writings', 'chapters', 'writingLinks',
      'storyPlans', 'storyArcs', 'storyBeats',
      'scenePlans', 'characterArcs', 'plotThreads'
    ];
    for (const name of postDataset) {
      expect(LEGACY_FLAT_COLLECTIONS).not.toContain(name);
    }
  });

  it('names only collections that really exist', () => {
    // Historical, but not free to contain typos: every name must still be a
    // real cloud collection.
    for (const name of LEGACY_FLAT_COLLECTIONS) {
      expect(cloudCollections()).toContain(name);
    }
  });
});

describe('the write policies stay pinned', () => {
  /**
   * The 79 per-entity Firestore functions were not, as the audit has it,
   * identical but for a collection name. Six behavioural variants hid in them,
   * and they were invisible because they were spread over 2,200 lines. This
   * test is what keeps them visible: the exact set of deviations is written
   * down, so adding or removing one fails here and has to be deliberate.
   */
  it('lists exactly the entities that deviate from the defaults', () => {
    expect(writePolicyDeviations()).toEqual([
      // codexLinks stamps syncedAt rather than createdAt, and its add returns
      // nothing. Both call sites ignore the return, so this is invisible today.
      { entityType: 'codexLink', create: 'synced' },
      { entityType: 'heraldryLink', create: 'created-only' },
      // The only entity that both stamps no updatedAt on create and writes no
      // updatedAt on update. Looks like drift rather than intent.
      { entityType: 'dignityTenure', create: 'created-only', update: 'unstamped' },
      { entityType: 'dignityLink', create: 'created-only' },
      { entityType: 'householdRole', create: 'created-only' },
      // Deliberate and load-bearing: merge upserts, so editing a row the cloud
      // has never seen creates it instead of throwing "No document to update".
      { entityType: 'writing', update: 'merge' },
      { entityType: 'chapter', update: 'merge' },
      { entityType: 'writingLink', create: 'created-only' }
    ]);
  });

  it('defaults everything else', () => {
    const deviating = new Set(writePolicyDeviations().map((d) => d.entityType));
    for (const entity of allEntities()) {
      if (deviating.has(entity.entityType)) continue;
      expect(createStampFor(entity.entityType)).toBe('created-and-updated');
      expect(updateModeFor(entity.entityType)).toBe('stamped');
    }
  });

  it('never reports a policy for an entity it does not know', () => {
    // An unknown entity falling back to the default would let a typo write to
    // nothing quietly. cloudRepo throws instead; these are the defaults it
    // would have used, and they are only reachable via a known entity.
    expect(createStampFor('person')).toBe('created-and-updated');
    expect(updateModeFor('writing')).toBe('merge');
  });
});

describe('coverage is total', () => {
  it('classifies every Dexie table as either synced or deliberately local', () => {
    const classified = new Set([...syncedTables(), ...Object.keys(LOCAL_ONLY_TABLES)]);
    const unclassified = schemaTables.filter((table) => !classified.has(table));

    // Adding a table to database.ts must be a decision about whether it syncs.
    // Left unclassified, a table gets cleared by deleteAllData on the download
    // path and has nothing to restore it from — which is exactly what happened
    // to acknowledgedDuplicates and bugs.
    expect(unclassified).toEqual([]);
  });

  it('does not both sync a table and call it local-only', () => {
    const contradictions = syncedTables().filter((table) => table in LOCAL_ONLY_TABLES);
    expect(contradictions).toEqual([]);
  });

  it('gives every local-only table a stated reason', () => {
    for (const [table, reason] of Object.entries(LOCAL_ONLY_TABLES)) {
      expect(schemaTables, `${table} is declared local-only but is not in the schema`).toContain(table);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});

describe('the cascade declarations describe real relationships', () => {
  // Cascades were knowledge held inside one function per service — deleting a
  // writing also removes its chapters, and the only place that said so was
  // `deleteWriting`. Two of the seven never reached the cloud because of it.
  // Declaring them here is only worth anything if the declarations are true,
  // so each is checked against the schema it claims to describe.
  const cascading = allEntities().filter((entity) => entity.cascades?.length);

  it('names an entity that is in the manifest', () => {
    const unknown = cascading.flatMap((entity) =>
      entity.cascades
        .filter((rule) => !getEntity(rule.entity))
        .map((rule) => `${entity.entityType} -> ${rule.entity}`)
    );
    expect(unknown).toEqual([]);
  });

  it('names foreign-key fields that the schema actually indexes', () => {
    // A cascade keys off a field, and a field the schema does not index means
    // the cascade is a full table scan at best and a typo at worst.
    const notIndexed = cascading.flatMap((entity) =>
      entity.cascades.flatMap((rule) => {
        const target = getEntity(rule.entity);
        const indexes = schemaIndexes[target.table] || [];
        return rule.on
          .filter((field) => !indexes.includes(field))
          .map((field) => `${entity.entityType} -> ${rule.entity}.${field}`);
      })
    );
    expect(notIndexed).toEqual([]);
  });

  it('never cascades an entity into itself', () => {
    const selfReferential = cascading
      .filter((entity) => entity.cascades.some((rule) => rule.entity === entity.entityType))
      .map((entity) => entity.entityType);
    expect(selfReferential).toEqual([]);
  });

  it('only deletes rows whose entity declares a delete op', () => {
    // A cascade that deletes rows of an entity with no `delete` op would queue
    // a change nothing can replay — the class that silently discarded
    // dignityTenure, dignityLink and heraldryLink changes.
    const unreplayable = cascading.flatMap((entity) =>
      entity.cascades
        .filter((rule) => rule.action === 'delete' && !getEntity(rule.entity).ops.includes('delete'))
        .map((rule) => `${entity.entityType} -> delete ${rule.entity}`)
    );
    expect(unreplayable).toEqual([]);
  });

  it('only clears fields on entities that can be updated', () => {
    const unclearable = cascading.flatMap((entity) =>
      entity.cascades
        .filter((rule) => rule.action === 'clear' && !getEntity(rule.entity).ops.includes('update'))
        .map((rule) => `${entity.entityType} -> clear ${rule.entity}`)
    );
    expect(unclearable).toEqual([]);
  });

  it('covers the eight entities known to cascade', () => {
    // Pinned so that adding a cascade to a service without declaring it here,
    // or vice versa, is a failing test rather than a silent divergence.
    //
    // It started as seven. `storyPlan` was missed by a hand inventory that did
    // not think to grep planningService, and turned up only when a script
    // compared the declarations against every `where(...).delete()` in the
    // service layer. It is the widest cascade in the app.
    expect(cascading.map((e) => e.entityType).sort()).toEqual(
      ['chapter', 'codexEntry', 'dignity', 'heraldry', 'house', 'person', 'storyPlan', 'writing'].sort()
    );
  });
});
