/**
 * Building a composition for saving (decision C3, step 3).
 *
 * The write-side counterpart to readComposition. It exists so that the shape
 * of a saved composition is decided in one place: the creator used to build
 * the object inline, complete with its own `version: 2` literal, which is how
 * a format ends up with three spellings and no owner.
 *
 * Everything saved today is a single coat, so `composeCoat` is the only
 * constructor needed yet. Marshalled coats get theirs in step 5, built from
 * `createMarshalledNode` — the point of putting this here now is that step 5
 * changes one module rather than hunting for object literals.
 */
import { COMPOSITION_VERSION, createPlainNode } from './compositionModel';

/**
 * A composition for one undivided coat of arms.
 *
 * @param {Object}   parts
 * @param {Object}   parts.field       Field division and tinctures.
 * @param {Array}    [parts.ordinaries]
 * @param {Array}    [parts.charges]
 * @param {Object}   [parts.cadency]   Brands the whole achievement, so it sits
 *                                     beside the root rather than inside it.
 * @param {string}   [parts.generatedAt] ISO timestamp. Passed in rather than
 *                                     read from the clock here, so this stays
 *                                     a pure function and is testable.
 * @param {Object}   [parts.unmigrated] Keys carried over from a legacy record
 *                                     that the migration did not recognise.
 *                                     Preserved on re-save rather than dropped.
 */
export function composeCoat({
  field,
  ordinaries,
  charges,
  cadency,
  generatedAt,
  unmigrated
} = {}) {
  const composition = {
    version: COMPOSITION_VERSION,
    root: createPlainNode({ field, ordinaries, charges })
  };

  if (cadency) composition.cadency = cadency;
  if (generatedAt) composition.generatedAt = generatedAt;
  if (unmigrated) composition.unmigrated = unmigrated;

  return composition;
}
