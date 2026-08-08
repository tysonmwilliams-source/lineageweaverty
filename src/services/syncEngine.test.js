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

import { addCloud, updateCloud, deleteCloud } from './cloudRepo';
import { syncOp, enqueue, push, sendToCloud, isOnline, setOnlineForTesting } from './syncEngine';
import { getDatabase, closeDatabaseInstance, deleteDatabaseForDataset, getPendingChanges } from './database';

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

describe('the retry wart is pinned, not blessed', () => {
  // `retryWithBackoff` wraps the cloud call in 5 of the 56 wrappers. It is
  // almost certainly accidental — it splits within an entity, so relationship
  // add retries and relationship update does not — and turning it on
  // everywhere is a live question for the owner. Until that is decided, this
  // test exists so the set cannot drift in either direction unnoticed: making
  // it uniform is a decision, not a tidy-up.
  const EXPECTED_RETRYING = [
    'syncAddPerson',
    'syncUpdatePerson',
    'syncAddHouse',
    'syncUpdateHouse',
    'syncAddRelationship'
  ];

  it('is passed by exactly the five wrappers that always had it', async () => {
    const { readFileSync } = await import('node:fs');
    // Read from disk rather than importing: pulling in dataSyncService would
    // drag firestoreService and the Firebase SDK into a suite that has neither.
    // Path is relative to the Vitest working directory, which is the repo root.
    const src = readFileSync('src/services/dataSyncService.js', 'utf8');

    const retrying = [...src.matchAll(
      /export async function (sync\w+)\([^)]*\)\s*\{([\s\S]*?)\n\}/g
    )].filter(([, , body]) => /retry:\s*true/.test(body)).map(([, name]) => name);

    expect(retrying.sort()).toEqual([...EXPECTED_RETRYING].sort());
  });
});
