/**
 * The sync engine — one path from a local mutation to the cloud.
 *
 * Step 4 of the sync-layer refactor
 * (`docs/audits/2026-07-30-full-audit/sections/02-data-sync.md`). Where
 * `cloudRepo.ts` collapsed the 79 `*Cloud` functions into four generic
 * operations, this collapses the 56 `sync*` wrappers in `dataSyncService.js`
 * into one.
 *
 * ## What the wrappers actually did
 *
 * All 56 shared a five-step body: queue the change, bail if offline or signed
 * out, call the cloud, mark it synced, swallow any error so a failed sync can
 * never break the local write that already succeeded. That last step is the
 * golden rule in `CLAUDE.md`, and it is why nothing here throws once a change
 * has been queued — a queued-but-unsent change is recoverable, an exception
 * escaping into a React event handler is not.
 *
 * Two of the five steps were subtly wrong in every one of the 56, and both are
 * fixed structurally here rather than by hand:
 *
 * ### `markSynced(queueId)`, not `markEntitySynced(type, id)`
 *
 * The wrappers confirmed a write by marking **every pending queue row for that
 * entity**, not the row they had just sent. Edit a person, and while that
 * upload is in flight edit them again: the second edit queues row 2, the first
 * upload returns, and `markEntitySynced('person', id)` flips rows 1 *and* 2 to
 * synced. The second edit is never uploaded, and — worse — it no longer counts
 * as a pending change, so the data-loss guard that blocks a cloud download over
 * unsynced local work stops protecting it. That is the audit's
 * "markEntitySynced marks every pending row" finding, and it is a real
 * data-loss path, not a tidiness point.
 *
 * `addToSyncQueue` has always returned the row id and `markSynced` has always
 * taken one. The wrappers simply never used them. `push()` below threads that
 * id through, so confirming a write can no longer confirm anything else.
 *
 * ### An unsupported operation is refused before it is queued
 *
 * `syncSingleChange`'s old dispatch table fell through silently for an entity
 * it had no handler for, and the caller then marked the row synced anyway.
 * `cloudRepo` already refuses an unknown entity; `assertSupported` below also
 * refuses an operation the manifest says the entity does not have — a link
 * type has `add` and `delete` and no `update`, and asking for one is a
 * programming error, not a network failure.
 *
 * It throws **before** queueing, and that placement is the whole point. Once a
 * row is in the queue, throwing would break the local write; before it, there
 * is nothing to lose and the mistake is loud. It cannot fire from the 56 shims
 * — every one was checked against the manifest — so this guards new callers.
 *
 * ### Every send retries
 *
 * `retryWithBackoff` used to wrap the cloud call in exactly 5 of the 56
 * wrappers — add and update for person and house, add for relationship. Not
 * `syncUpdateRelationship`. No delete. Nothing in the Codex, the Armory,
 * Dignities, the Writing Studio or the Story Planner. That was not a policy
 * anyone chose: it was a feature that reached the first few wrappers and
 * stopped, and it split *within* an entity, so it could not even be expressed
 * per-entity in the manifest the way the write policies are.
 *
 * It is now unconditional, on the owner's decision. The 51 paths that gained it
 * were never at risk of losing data without it — a failed send leaves the queue
 * row pending either way — they just waited up to five minutes for the periodic
 * sync to reattempt something a transient blip would have cleared on the second
 * try.
 *
 * The cost of retrying is bounded and worth naming: `SYNC_RETRY_CONFIG` is 3
 * attempts over roughly 7 seconds, so a *permanently* failing write (a rules
 * rejection, say) now occupies its caller for that long before falling back to
 * the queue. Sync calls are fire-and-forget by design — nothing awaits them on
 * a render path — so this delays the queue row being marked, not the UI.
 */
import { addToSyncQueue, markSynced } from './database';
import type { DatasetId } from './types';
import { addCloud, updateCloud, deleteCloud } from './cloudRepo';
import { getEntity } from './syncManifest';
import type { SyncOperation } from './syncManifest';
import { retryWithBackoff, SYNC_RETRY_CONFIG } from '../utils/retryWithBackoff';
import { logger } from '../utils/logger';

/** The payload of an add or update. Deletes carry none. */
export type SyncPayload = Record<string, unknown>;

export interface SyncOpArgs {
  /** Firebase UID. Falsy means signed out — queue only, never send. */
  userId?: string | null;
  datasetId?: DatasetId;
  /** The local (Dexie) id. Becomes the Firestore document id. */
  id: number | string;
  /** Required for `add` and `update`; ignored for `delete`. */
  data?: SyncPayload;
  /**
   * How a failed send is logged. Defaults to `error`.
   *
   * `warn` exists for one caller: the relationship cascade inside
   * `syncDeletePerson` logged each failed relationship at `warn`. Since
   * `logger.warn` is a DEV-only no-op and `logger.error` always reports,
   * collapsing the two would have started surfacing cascade failures in
   * production — a change worth making on purpose, not as a side effect of a
   * refactor.
   */
  logLevel?: 'error' | 'warn';
}

/**
 * Refuse an entity or operation the manifest does not declare.
 *
 * Called before anything is queued, so it is safe to throw.
 */
function assertSupported(entityType: string, operation: SyncOperation): void {
  const entity = getEntity(entityType);
  if (!entity) {
    throw new Error(
      `Unknown sync entity "${entityType}". Add it to ENTITIES in syncManifest.ts — ` +
      'an entity that is not in the manifest is not synced by anything.'
    );
  }
  if (!entity.ops.includes(operation)) {
    throw new Error(
      `Entity "${entityType}" declares no "${operation}" operation ` +
      `(it has: ${entity.ops.join(', ')}). Either the call is wrong, or the ` +
      'manifest needs updating — but do not add an op without a cloud path for it.'
    );
  }
}

/**
 * Send one operation to the cloud. Throws on failure.
 *
 * This is the raw send, without the queue around it. `push` wraps it for the
 * write path; `syncPendingChanges` calls it directly when replaying rows that
 * are already queued, and needs the exception so it can report *why* a
 * particular row failed.
 *
 * It replaces a 100-line `syncMap` of 20 entity types × 3 closures that had to
 * be extended by hand for every new entity — and was not, three times over:
 * `dignityTenure`, `dignityLink` and `heraldryLink` were queued by their
 * wrappers with no entry here, so replaying them fell through to a `return`
 * that the caller read as success and marked synced. Those three changes were
 * discarded silently. Validating against the manifest instead of a
 * hand-maintained table is what makes that unrepresentable.
 *
 * `async` so that a refused entity *rejects* rather than throwing before the
 * promise is returned. Both are caught by an `await` inside a `try`, so it made
 * no difference to either caller — but a promise-returning function that
 * sometimes throws synchronously is a trap for the next one.
 */
export async function sendToCloud(
  entityType: string,
  operation: SyncOperation,
  userId: string,
  datasetId: DatasetId | undefined,
  id: number | string,
  data: SyncPayload | undefined
): Promise<unknown> {
  assertSupported(entityType, operation);
  switch (operation) {
    case 'add':
      // The local id is folded into the record because it becomes the
      // Firestore document id — this is what makes the two stores mappable
      // without a lookup table.
      return addCloud(entityType, userId, datasetId, { ...(data ?? {}), id });
    case 'update':
      return updateCloud(entityType, userId, datasetId, id, data ?? {});
    case 'delete':
      return deleteCloud(entityType, userId, datasetId, id);
  }
}

/**
 * Record a change in the sync queue and return its row id.
 *
 * Separate from `push` so that a multi-entity operation can queue *everything*
 * before sending *anything*. `syncDeletePerson` depends on that: it queues the
 * person and every cascaded relationship up front, so a crash or a dropped
 * connection part-way through leaves a complete record of what still needs
 * sending. Queue-then-send-then-queue-the-next would lose the tail.
 */
export async function enqueue(
  entityType: string,
  operation: SyncOperation,
  args: { datasetId?: DatasetId; id: number | string; data?: SyncPayload }
): Promise<number> {
  assertSupported(entityType, operation);
  return addToSyncQueue(
    { entityType, entityId: args.id, operation, data: args.data },
    args.datasetId ?? undefined
  );
}

/**
 * Send a queued change to the cloud and confirm exactly that row.
 *
 * Never throws. Returns whether the change reached the cloud — `false` covers
 * both "not attempted" (offline or signed out) and "attempted and failed"; in
 * either case the queue row stays pending and the next periodic sync retries
 * it, which is why the two do not need distinguishing here.
 */
export async function push(
  entityType: string,
  operation: SyncOperation,
  queueId: number,
  args: SyncOpArgs
): Promise<boolean> {
  const { userId, datasetId, id, data, logLevel = 'error' } = args;

  if (!userId || !isOnline()) return false;

  try {
    const send = () => sendToCloud(entityType, operation, userId, datasetId, id, data);
    await retryWithBackoff(send, SYNC_RETRY_CONFIG);

    // The row that was sent, and only that row. See the header note.
    await markSynced(queueId, datasetId ?? undefined);
    return true;
  } catch (error) {
    logger[logLevel](`☁️ Failed to sync ${entityType} ${operation} ${id}:`, error);
    // Deliberately swallowed. The local write already succeeded and the queue
    // row is still pending, so the change is not lost — it is deferred.
    return false;
  }
}

/**
 * Queue a change and send it. The shape all 56 sync wrappers reduce to.
 */
export async function syncOp(
  entityType: string,
  operation: SyncOperation,
  args: SyncOpArgs
): Promise<boolean> {
  const queueId = await enqueue(entityType, operation, {
    datasetId: args.datasetId,
    id: args.id,
    data: args.data
  });
  return push(entityType, operation, queueId, args);
}

// ==================== ONLINE STATE ====================

/**
 * Whether the browser believes it has a connection.
 *
 * This lived in `dataSyncService.js` as a module-level `let` read by 60 call
 * sites. It moves here because `push` is now one of those readers and the
 * alternative — two modules each tracking it — is how the two copies drift.
 *
 * `navigator.onLine` is a weak signal (it reports the link, not reachability),
 * but it is the signal the app has always used, and a false positive costs
 * nothing: the send fails, the row stays queued, the periodic sync retries.
 */
let online = typeof navigator !== 'undefined' ? navigator.onLine : true;

export function isOnline(): boolean {
  return online;
}

/** Test seam. Production state comes from the listeners below. */
export function setOnlineForTesting(value: boolean): void {
  online = value;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    logger.log('🌐 Back online');
    online = true;
  });

  window.addEventListener('offline', () => {
    logger.log('📴 Gone offline');
    online = false;
  });
}
