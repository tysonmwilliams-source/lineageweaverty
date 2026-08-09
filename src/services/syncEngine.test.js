/**
 * Sync engine tests — the first tests this layer has ever had.
 *
 * `dataSyncService.js` and `firestoreService.js` were 4,700 lines with zero
 * coverage, because everything in them ran through the Firebase SDK and the
 * suite has no Firebase. That is why the audit's data-loss findings survived so
 * long: a green suite said nothing about them.
 *
 * `cloudRepo` is the whole boundary now, so mocking that one module makes the
 * engine testable against a real IndexedDB queue (fake-indexeddb) with no
 * network at all. The tests that matter here are the two about *which queue
 * row* gets confirmed — that is the bug, and it is invisible to any test that
 * only checks whether a single write succeeded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./cloudRepo', () => ({
  addCloud: vi.fn(async () => 'doc-id'),
  updateCloud: vi.fn(async () => undefined),
  deleteCloud: vi.fn(async () => undefined)
}));

// Wrapped, not replaced: the engine must genuinely route through the retry
// helper, but three real backoff waits per failing test would make the suite
// crawl. maxRetries: 0 keeps the call path and drops the delays.
vi.mock('../utils/retryWithBackoff', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    retryWithBackoff: vi.fn((fn, config) => actual.retryWithBackoff(fn, { ...config, maxRetries: 0 }))
  };
});

import { addCloud, updateCloud, deleteCloud } from './cloudRepo';
import { retryWithBackoff, SYNC_RETRY_CONFIG } from '../utils/retryWithBackoff';
import {
  syncOp,
  syncDeleteCascade,
  enqueue,
  push,
  sendToCloud,
  isOnline,
  setOnlineForTesting,
  pruneTargets
} from './syncEngine';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset, getPendingChanges } from './database';
import { allEntities } from './syncManifest';

const DATASET = 'sync-engine-test';
const USER = 'test-uid';

/** Every row in the queue, pending or not, oldest first. */
async function allQueueRows() {
  return getDatabase(DATASET).syncQueue.orderBy('id').toArray();
}

beforeEach(async () => {
  vi.clearAllMocks();
  setOnlineForTesting(true);
  await getDatabase(DATASET).syncQueue.clear();
});

afterEach(async () => {
  closeDatabaseInstance(DATASET);
  await deleteDatabaseForDataset(DATASET);
});

describe('syncOp — the happy path', () => {
  it('queues the change, sends it, and marks that row synced', async () => {
    const sent = await syncOp('person', 'add', {
      userId: USER, datasetId: DATASET, id: 7, data: { firstName: 'Aemma' }
    });

    expect(sent).toBe(true);
    expect(addCloud).toHaveBeenCalledTimes(1);

    const rows = await allQueueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: 'person', entityId: '7', operation: 'add', synced: 1 });
  });

  it('folds the local id into the payload, because it becomes the document id', async () => {
    await syncOp('house', 'add', {
      userId: USER, datasetId: DATASET, id: 3, data: { houseName: 'Velaryon' }
    });

    expect(addCloud).toHaveBeenCalledWith('house', USER, DATASET, { houseName: 'Velaryon', id: 3 });
  });

  it('sends an update as its changed fields only, and a delete with no payload', async () => {
    await syncOp('person', 'update', {
      userId: USER, datasetId: DATASET, id: 7, data: { lastName: 'Targaryen' }
    });
    await syncOp('person', 'delete', { userId: USER, datasetId: DATASET, id: 7 });

    expect(updateCloud).toHaveBeenCalledWith('person', USER, DATASET, 7, { lastName: 'Targaryen' });
    expect(deleteCloud).toHaveBeenCalledWith('person', USER, DATASET, 7);
  });
});

describe('confirming a write confirms only that write', () => {
  // This is the audit's "markEntitySynced marks every pending row" finding.
  // The old wrappers confirmed by (entityType, entityId), so a second edit
  // queued while the first was in flight was marked synced without ever being
  // sent — and then stopped counting as a pending change, so the guard that
  // blocks a cloud download over unsynced local work stopped protecting it.
  it('leaves a second edit pending when the first one completes', async () => {
    const firstQueueId = await enqueue('person', 'update', {
      datasetId: DATASET, id: 7, data: { firstName: 'Rhaenys' }
    });
    // A second edit to the SAME person, queued before the first send returns.
    const secondQueueId = await enqueue('person', 'update', {
      datasetId: DATASET, id: 7, data: { firstName: 'Rhaenyra' }
    });

    await push('person', 'update', firstQueueId, {
      userId: USER, datasetId: DATASET, id: 7, data: { firstName: 'Rhaenys' }
    });

    const rows = await allQueueRows();
    const first = rows.find(r => r.id === firstQueueId);
    const second = rows.find(r => r.id === secondQueueId);

    expect(first.synced).toBe(1);
    expect(second.synced).toBe(0);

    // And the pending-changes guard still sees the unsent edit.
    const pending = await getPendingChanges(DATASET);
    expect(pending.map(r => r.id)).toEqual([secondQueueId]);
  });

  it('does not confirm a different entity that happens to share an id', async () => {
    const personRow = await enqueue('person', 'delete', { datasetId: DATASET, id: 1 });
    const houseRow = await enqueue('house', 'delete', { datasetId: DATASET, id: 1 });

    await push('person', 'delete', personRow, { userId: USER, datasetId: DATASET, id: 1 });

    const rows = await allQueueRows();
    expect(rows.find(r => r.id === personRow).synced).toBe(1);
    expect(rows.find(r => r.id === houseRow).synced).toBe(0);
  });
});

describe('a change is never lost when the send does not happen', () => {
  it('queues but does not send when signed out', async () => {
    const sent = await syncOp('person', 'add', {
      userId: null, datasetId: DATASET, id: 7, data: { firstName: 'Alicent' }
    });

    expect(sent).toBe(false);
    expect(addCloud).not.toHaveBeenCalled();
    const rows = await allQueueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].synced).toBe(0);
  });

  it('queues but does not send when offline', async () => {
    setOnlineForTesting(false);
    expect(isOnline()).toBe(false);

    const sent = await syncOp('person', 'add', {
      userId: USER, datasetId: DATASET, id: 7, data: { firstName: 'Alicent' }
    });

    expect(sent).toBe(false);
    expect(addCloud).not.toHaveBeenCalled();
    expect((await allQueueRows())[0].synced).toBe(0);
  });

  it('swallows a cloud failure, leaves the row pending, and never throws', async () => {
    addCloud.mockRejectedValueOnce(new Error('permission-denied'));

    // Must not reject: the local write already succeeded, and this runs inside
    // React event handlers.
    const sent = await syncOp('person', 'add', {
      userId: USER, datasetId: DATASET, id: 7, data: { firstName: 'Alicent' }
    });

    expect(sent).toBe(false);
    const rows = await allQueueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].synced).toBe(0);
  });
});

describe('operations the manifest does not declare are refused', () => {
  it('rejects an unknown entity before anything is queued', async () => {
    await expect(
      syncOp('arcMilestone', 'add', { userId: USER, datasetId: DATASET, id: 1, data: {} })
    ).rejects.toThrow(/Unknown sync entity/);

    expect(await allQueueRows()).toHaveLength(0);
  });

  it('rejects an operation the entity does not have', async () => {
    // codexLink is add/delete only — a link is created or removed, never edited.
    await expect(
      syncOp('codexLink', 'update', { userId: USER, datasetId: DATASET, id: 1, data: {} })
    ).rejects.toThrow(/declares no "update" operation/);

    expect(await allQueueRows()).toHaveLength(0);
  });

  it('throws from the replay path too, rather than reporting success', async () => {
    // The old syncSingleChange returned normally for an entity with no handler,
    // and syncPendingChanges then marked the row synced — silently discarding
    // every offline dignityTenure, dignityLink and heraldryLink change.
    await expect(
      sendToCloud('arcMilestone', 'add', USER, DATASET, 1, {})
    ).rejects.toThrow(/Unknown sync entity/);
  });

  it('replays each of the three entities that used to have no handler', async () => {
    for (const entityType of ['dignityTenure', 'dignityLink', 'heraldryLink']) {
      await sendToCloud(entityType, 'add', USER, DATASET, 1, { note: 'x' });
    }
    expect(addCloud).toHaveBeenCalledTimes(3);
  });
});

describe('the restore order covers the manifest', () => {
  // restoreAllFromCloud walks RESTORE_ORDER, not the manifest, because local
  // restore goes through service functions that can validate and the original
  // order has to be preserved. That makes it the one list in the sync layer
  // that can fall behind ENTITIES again — which is the exact failure the
  // manifest exists to prevent, so it is asserted rather than trusted.
  it('lists every synced entity exactly once', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/services/dataSyncService.js', 'utf8');

    const listed = src
      .match(/const RESTORE_ORDER = \[([\s\S]*?)\];/)[1]
      .match(/'([^']+)'/g)
      .map(s => s.slice(1, -1));

    const declared = allEntities().map(e => e.entityType);

    expect(listed.slice().sort()).toEqual(declared.slice().sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});

describe('syncDeleteCascade — a cascade cannot silently miss a child', () => {
  it('queues the parent and every cascaded child', async () => {
    await syncDeleteCascade('writing', {
      userId: USER, datasetId: DATASET, id: 5,
      cascaded: { chapter: [11, 12], writingLink: [21] }
    });

    const rows = await allQueueRows();
    expect(rows.map(r => `${r.entityType}:${r.entityId}`)).toEqual([
      'writing:5', 'chapter:11', 'chapter:12', 'writingLink:21'
    ]);
    expect(rows.every(r => r.synced === 1)).toBe(true);
    expect(deleteCloud).toHaveBeenCalledTimes(4);
  });

  it('queues everything before sending anything', async () => {
    // The guarantee that makes an interrupted cascade recoverable. If the
    // connection drops mid-cascade, the queue still describes the whole delete.
    const queuedWhenFirstSent = [];
    deleteCloud.mockImplementation(async () => {
      queuedWhenFirstSent.push((await allQueueRows()).length);
    });

    await syncDeleteCascade('writing', {
      userId: USER, datasetId: DATASET, id: 5,
      cascaded: { chapter: [11, 12], writingLink: [21] }
    });

    // All four rows already existed by the time the first send ran.
    expect(queuedWhenFirstSent[0]).toBe(4);
  });

  it('sends children before the parent', async () => {
    const order = [];
    deleteCloud.mockImplementation(async (entityType) => { order.push(entityType); });

    await syncDeleteCascade('writing', {
      userId: USER, datasetId: DATASET, id: 5,
      cascaded: { chapter: [11], writingLink: [21] }
    });

    expect(order[order.length - 1]).toBe('writing');
  });

  // The bug this whole step exists for. Deleting a writing removed its chapters
  // locally and synced only the writing.
  it('refuses a cascade that omits a declared child', async () => {
    await expect(
      syncDeleteCascade('writing', {
        userId: USER, datasetId: DATASET, id: 5,
        cascaded: { chapter: [11] }          // writingLink forgotten
      })
    ).rejects.toThrow(/cascades to writingLink/);

    // And nothing was queued, so the caller's local delete is unaffected.
    expect(await allQueueRows()).toHaveLength(0);
  });

  it('accepts an empty array — none found is not the same as forgotten', async () => {
    await syncDeleteCascade('writing', {
      userId: USER, datasetId: DATASET, id: 5,
      cascaded: { chapter: [], writingLink: [] }
    });

    const rows = await allQueueRows();
    expect(rows.map(r => r.entityType)).toEqual(['writing']);
  });

  it('rejects a child the manifest does not declare', async () => {
    await expect(
      syncDeleteCascade('chapter', {
        userId: USER, datasetId: DATASET, id: 5,
        cascaded: { writingLink: [], person: [1] }
      })
    ).rejects.toThrow(/does not cascade to person/);
  });

  it('queues the whole cascade while offline, sending none of it', async () => {
    setOnlineForTesting(false);

    await syncDeleteCascade('person', {
      userId: USER, datasetId: DATASET, id: 3, cascaded: { relationship: [7, 8] }
    });

    const rows = await allQueueRows();
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.synced === 0)).toBe(true);
    expect(deleteCloud).not.toHaveBeenCalled();
  });

  it('still deletes the parent when a child fails to send', async () => {
    deleteCloud.mockImplementation(async (entityType) => {
      if (entityType === 'relationship') throw new Error('permission-denied');
    });

    await syncDeleteCascade('person', {
      userId: USER, datasetId: DATASET, id: 3, cascaded: { relationship: [7] }
    });

    const rows = await allQueueRows();
    expect(rows.find(r => r.entityType === 'relationship').synced).toBe(0);
    expect(rows.find(r => r.entityType === 'person').synced).toBe(1);
  });
});

describe('pruneTargets — what a full upload is allowed to delete', () => {
  it('deletes cloud documents with no local counterpart', () => {
    const targets = pruneTargets(
      { people: [{ id: 1 }, { id: 3 }] },
      { people: ['1', '2', '3', '4'] }
    );
    expect(targets).toEqual({ people: ['2', '4'] });
  });

  it('compares numeric local ids against string document ids', () => {
    // The upload writes String(row.id) as the document id. Comparing without
    // coercing would find nothing in common and delete the entire collection.
    const targets = pruneTargets({ houses: [{ id: 7 }] }, { houses: ['7'] });
    expect(targets).toEqual({});
  });

  it('deletes everything in a collection the user genuinely emptied', () => {
    const targets = pruneTargets({ dignities: [] }, { dignities: ['1', '2'] });
    expect(targets).toEqual({ dignities: ['1', '2'] });
  });

  // The guard. An unreadable table is absent from the snapshot, and absent must
  // never be read as empty — that is the difference between "the user deleted
  // their dignities" and "one Dexie call threw".
  it('refuses to prune a table the snapshot does not contain', () => {
    const targets = pruneTargets(
      { people: [{ id: 1 }] },        // dignities could not be read
      { people: ['1'], dignities: ['1', '2', '3'] }
    );
    expect(targets).toEqual({});
  });

  it('still prunes the readable tables when another one failed', () => {
    const targets = pruneTargets(
      { people: [] },                  // readable, genuinely empty
      { people: ['9'], heraldry: ['1'] } // heraldry unreadable
    );
    expect(targets).toEqual({ people: ['9'] });
  });

  it('treats an empty snapshot as authorising nothing', () => {
    expect(pruneTargets({}, { people: ['1'], houses: ['2'] })).toEqual({});
  });

  it('omits tables with nothing to delete rather than listing them empty', () => {
    const targets = pruneTargets(
      { people: [{ id: 1 }], houses: [{ id: 2 }] },
      { people: ['1'], houses: ['2', '99'] }
    );
    expect(Object.keys(targets)).toEqual(['houses']);
  });
});

describe('nothing in the sync path forgets the dataset', () => {
  // Every local read and write in dataSyncService is dataset-scoped, and each
  // takes the dataset as an argument that defaults to 'default' when omitted.
  // That default is what made the two codex bugs silent: uploading a
  // non-default dataset read the default world's Codex into it, and restoring
  // one wrote its Codex back into the default world. Both looked like ordinary
  // calls. A zero-argument call in this file is the shape of that bug.
  it('has no zero-argument calls to dataset-scoped helpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/services/dataSyncService.js', 'utf8');

    const bare = [...src.matchAll(/await ([a-zA-Z][a-zA-Z0-9]*)\(\)/g)].map(m => m[1]);

    expect(bare).toEqual([]);
  });
});

describe('every send retries', () => {
  // Retry used to be opt-in and only 5 of the 56 wrappers opted in — not
  // syncUpdateRelationship, no delete, nothing outside genealogy. It is now
  // unconditional. These cover the paths that previously had none, so a
  // regression to per-call opt-in fails here rather than silently halving the
  // resilience of the other 51.
  it.each([
    ['relationship', 'update'],
    ['codexEntry', 'delete'],
    ['dignityTenure', 'add'],
    ['chapter', 'update'],
    ['storyBeat', 'delete']
  ])('routes %s %s through retryWithBackoff', async (entityType, operation) => {
    await syncOp(entityType, operation, {
      userId: USER, datasetId: DATASET, id: 1, data: { note: 'x' }
    });

    expect(retryWithBackoff).toHaveBeenCalledTimes(1);
    // Passed the shared sync config, not an ad-hoc one.
    expect(retryWithBackoff).toHaveBeenCalledWith(expect.any(Function), SYNC_RETRY_CONFIG);
  });

  it('retries the cascade legs of a person delete too', async () => {
    const queueId = await enqueue('relationship', 'delete', { datasetId: DATASET, id: 4 });
    await push('relationship', 'delete', queueId, {
      userId: USER, datasetId: DATASET, id: 4, logLevel: 'warn'
    });

    expect(retryWithBackoff).toHaveBeenCalledTimes(1);
  });

  it('does not reach the retry helper at all when offline', async () => {
    setOnlineForTesting(false);
    await syncOp('person', 'add', { userId: USER, datasetId: DATASET, id: 1, data: {} });
    expect(retryWithBackoff).not.toHaveBeenCalled();
  });
});
