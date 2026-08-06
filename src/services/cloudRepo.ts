/**
 * Generic Firestore CRUD, driven by the sync manifest.
 *
 * Step 3 of the sync-layer refactor
 * (`docs/audits/2026-07-30-full-audit/sections/02-data-sync.md`). Replaces 79
 * per-entity `*Cloud` functions in `firestoreService.js` — roughly 1,200 lines
 * that were four operations written out twenty times each.
 *
 * ## The audit is not quite right about these, and it matters
 *
 * It describes the 79 as "differing only by a collection-name literal". They do
 * not. Normalising every body and grouping them turns up **six** behavioural
 * variants, not four:
 *
 *   - `delete` — 20 functions, genuinely one shape.
 *   - `getAll` — 21 functions, genuinely one shape.
 *   - `get` one — 3 functions (person, house, heraldry), one shape.
 *   - `add` — **three** shapes: 14 stamp `createdAt` *and* `updatedAt`, 5 stamp
 *     only `createdAt`, and `codexLinks` stamps `syncedAt` instead and returns
 *     nothing.
 *   - `update` — **three** shapes: 13 use `updateDoc` with an `updatedAt`
 *     stamp, `writings` and `chapters` use `setDoc(..., { merge: true })`, and
 *     `dignityTenures` uses `updateDoc` with no stamp at all.
 *
 * Collapsing those to one shape would have been a silent behaviour change in
 * the sync layer — and one of them is load-bearing. The `merge` variant carries
 * a comment explaining it prevents "No document to update" errors when the
 * local row has not reached the cloud yet; rewriting it as `updateDoc` would
 * reintroduce that bug. **`updatedAt` is also not inert**: `WritingStudio.jsx`
 * sorts by it and `entitySearchService` orders four result sets on it.
 *
 * So every variant is preserved exactly, declared per entity in the manifest.
 * The three that look like drift rather than intent are recorded in HANDOFF.md
 * as findings; they are not fixed here, for the same reason nothing else in
 * this refactor is fixed here.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { DocumentSnapshot, DocumentReference, CollectionReference } from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import { createStampFor, getEntity, updateModeFor } from './syncManifest';
import type { CreateStamp, UpdateMode } from './syncManifest';
import { DEFAULT_DATASET_ID } from './database';

/** A cloud document as this codebase passes it around: a bag with an id. */
export type CloudRecord = Record<string, unknown> & { id?: number | string };

/**
 * Reference to a user's subcollection within a dataset.
 *
 * Exported because `firestoreService`'s remaining bulk operations still need
 * it. It moves back out of the public surface at step 5, when those become
 * manifest loops too.
 */
export function getUserCollection(
  userId: string,
  datasetId: string | null | undefined,
  collectionName: string
): CollectionReference {
  const dsId = datasetId || DEFAULT_DATASET_ID;
  return collection(db, 'users', userId, 'datasets', dsId, collectionName);
}

/** Reference to a specific document in a user's subcollection within a dataset. */
export function getUserDoc(
  userId: string,
  datasetId: string | null | undefined,
  collectionName: string,
  docId: string
): DocumentReference {
  const dsId = datasetId || DEFAULT_DATASET_ID;
  return doc(db, 'users', userId, 'datasets', dsId, collectionName, docId);
}

/** Convert a Firestore document to a plain object with its id. */
export function docToObject(docSnap: DocumentSnapshot): CloudRecord | null {
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data()
  };
}

/**
 * Resolve an entity's collection name, or refuse.
 *
 * Throwing on an unknown entity is deliberate and is one of the bug classes
 * this refactor removes: the old dispatch in `syncSingleChange` fell through
 * silently for an entity with no handler, so a queued change was marked
 * processed without ever being sent.
 */
function collectionFor(entityType: string): string {
  const entity = getEntity(entityType);
  if (!entity) {
    throw new Error(
      `Unknown sync entity "${entityType}". Add it to ENTITIES in syncManifest.ts — ` +
      'a collection name that is not in the manifest is not synced by anything.'
    );
  }
  return entity.collection;
}

/**
 * Create (or overwrite) a document, keyed by the record's local id.
 *
 * The local id becomes the Firestore document id, which is what makes the two
 * stores mappable without a lookup table.
 */
export async function addCloud(
  entityType: string,
  userId: string,
  datasetId: string | null | undefined,
  data: CloudRecord
): Promise<string | undefined> {
  const collectionName = collectionFor(entityType);
  const stamp: CreateStamp = createStampFor(entityType);
  try {
    const docRef = getUserDoc(userId, datasetId, collectionName, String(data.id));

    const stamps =
      stamp === 'created-and-updated'
        ? { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
        : stamp === 'created-only'
          ? { createdAt: serverTimestamp() }
          : { syncedAt: serverTimestamp() };

    await setDoc(docRef, { ...data, localId: data.id, ...stamps });

    logger.log(`☁️ ${entityType} added to cloud:`, data.id);

    // codexLinks alone returned nothing here. Both of its call sites ignore the
    // result, so the difference is invisible — but it is preserved rather than
    // tidied, because "invisible today" is not the same as "safe to change".
    return stamp === 'synced' ? undefined : docRef.id;
  } catch (error) {
    logger.error(`☁️ Error adding ${entityType} to cloud:`, error);
    throw error;
  }
}

/** Read one document by id. Returns null when it does not exist. */
export async function getCloud(
  entityType: string,
  userId: string,
  datasetId: string | null | undefined,
  id: number | string
): Promise<CloudRecord | null> {
  const collectionName = collectionFor(entityType);
  try {
    const docRef = getUserDoc(userId, datasetId, collectionName, String(id));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    logger.error(`☁️ Error getting ${entityType} from cloud:`, error);
    throw error;
  }
}

/** Read every document in the entity's collection. */
export async function getAllCloud(
  entityType: string,
  userId: string,
  datasetId: string | null | undefined
): Promise<CloudRecord[]> {
  const collectionName = collectionFor(entityType);
  try {
    const collRef = getUserCollection(userId, datasetId, collectionName);
    const snapshot = await getDocs(collRef);
    return snapshot.docs.map(docToObject).filter((row): row is CloudRecord => row !== null);
  } catch (error) {
    logger.error(`☁️ Error getting all ${entityType} from cloud:`, error);
    throw error;
  }
}

/**
 * Update a document.
 *
 * `merge` is not a stylistic choice — for writings and chapters it upserts, so
 * an edit to a row the cloud has never seen creates it instead of throwing
 * "No document to update".
 */
export async function updateCloud(
  entityType: string,
  userId: string,
  datasetId: string | null | undefined,
  id: number | string,
  updates: Record<string, unknown>
): Promise<void> {
  const collectionName = collectionFor(entityType);
  const mode: UpdateMode = updateModeFor(entityType);
  try {
    const docRef = getUserDoc(userId, datasetId, collectionName, String(id));

    if (mode === 'merge') {
      await setDoc(
        docRef,
        { ...updates, id, localId: id, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else if (mode === 'unstamped') {
      await updateDoc(docRef, updates);
    } else {
      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
    }

    logger.log(`☁️ ${entityType} updated in cloud:`, id);
  } catch (error) {
    logger.error(`☁️ Error updating ${entityType} in cloud:`, error);
    throw error;
  }
}

/** Delete a document by id. */
export async function deleteCloud(
  entityType: string,
  userId: string,
  datasetId: string | null | undefined,
  id: number | string
): Promise<void> {
  const collectionName = collectionFor(entityType);
  try {
    const docRef = getUserDoc(userId, datasetId, collectionName, String(id));
    await deleteDoc(docRef);
    logger.log(`☁️ ${entityType} deleted from cloud:`, id);
  } catch (error) {
    logger.error(`☁️ Error deleting ${entityType} from cloud:`, error);
    throw error;
  }
}
