/**
 * Version-tolerant reading of a stored composition (decision C3, step 2).
 *
 * Every reader used to reach into the stored object directly — `comp.field`,
 * `comp.ordinaries`, `comp.charges` — which silently tied each one to format
 * version 2. Two consequences, both of them quiet:
 *
 *   - A v1 record fell through the `if (comp.field)` check and rendered as a
 *     blank shield, or was rebuilt from an inline copy of the legacy conversion.
 *   - Once anything writes v3, those same checks fail again, for the same
 *     reason, in the other direction.
 *
 * These accessors take a composition in *any* stored version and answer the
 * question the reader actually has. That decouples the read path from the
 * migration entirely: it does not matter whether a record has been migrated
 * yet, so the data migration and the code can land in either order.
 *
 * Normalisation is in-memory only. Nothing here writes.
 */
import { migrateComposition } from './migrateComposition';
import { collectLeaves } from './compositionModel';

/**
 * The stored composition as version 3, whatever version it is on disk.
 * Returns null for a record that has no composition, or a malformed one.
 */
export function readComposition(stored) {
  return migrateComposition(stored);
}

/**
 * The single coat a non-marshalled renderer should draw.
 *
 * Today every stored coat is one plain node, so this is simply "the coat".
 * When marshalling arrives it becomes "the first quarter", which is the
 * correct fallback for any surface that can only draw one — a thumbnail, or
 * the creator's editing panel before it learns to edit a tree.
 *
 * Returns null when there is nothing to draw, so callers can keep their
 * existing "no composition" branch rather than gaining a new empty-shield case.
 */
export function primaryLeaf(stored) {
  const composition = readComposition(stored);
  if (!composition) return null;
  return collectLeaves(composition.root)[0] ?? null;
}

/**
 * Every coat in the shield, in heraldic order. One entry for an unmarshalled
 * coat, two for an impaled one, four for a quartered one.
 */
export function allLeaves(stored) {
  const composition = readComposition(stored);
  if (!composition) return [];
  return collectLeaves(composition.root);
}

/**
 * The cadency mark, which brands the whole achievement rather than one quarter.
 *
 * Tolerates it sitting on the composition (v3, and v2 records written by
 * createPersonalArmsFromHouse, which spread the house composition and added
 * `cadency` alongside).
 */
export function readCadency(stored) {
  return readComposition(stored)?.cadency ?? null;
}
