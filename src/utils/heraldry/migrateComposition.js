/**
 * Composition migration to the recursive model (decision C3).
 *
 * Three shapes exist in stored data:
 *
 *   v1  a flat object — division, tinctures, and a single optional charge
 *       spread across `chargeEnabled` / `chargeId` / `chargeTincture` / …
 *   v2  `{ field, ordinaries, charges }`, tagged `version: 2`
 *   v3  `{ version: 3, root }`, where root is a recursive node
 *
 * A v1→v2 conversion already existed, but it ran in `HeraldryCreator`'s load
 * effect and was **never written back** — so a v1 record that was never opened
 * stayed v1 forever, and one that was opened silently became v2 on next save.
 * It was also documented as incomplete: legacy compositions stored ordinaries
 * *as* divisions, and the comment at HeraldryCreator.jsx:1528 admits it left
 * ordinaries empty rather than detecting them. That loses a charge-bearing band
 * from the coat with no warning. This module completes that detection and makes
 * the conversion a real, persisted, idempotent migration.
 *
 * Rule followed throughout: **preserve, never normalise.** Ordinary and charge
 * objects pass through untouched, because `visible` is read as `!== false` —
 * writing an explicit `visible: true` would be a behaviour-preserving change to
 * data, and a migration that rewrites what it does not have to is a migration
 * that can corrupt what it does not understand.
 */
import { ORDINARIES } from '../../data/heraldicData';
import { COMPOSITION_VERSION, DEFAULT_FIELD } from './compositionModel';

/** v1 keys this module knows how to read. Anything else is preserved verbatim. */
const KNOWN_LEGACY_KEYS = new Set([
  'division', 'tincture1', 'tincture2', 'tincture3', 'lineStyle', 'count', 'inverted',
  'chargeEnabled', 'chargeId', 'externalChargeId', 'chargeTincture', 'chargeSize',
  'chargeCount', 'chargeArrangement',
  // Carried across rather than read as field data.
  'cadency', 'generatedAt', 'version'
]);

/**
 * A legacy `division` naming an ordinary rather than a field division.
 *
 * `chief`, `fess`, `pale`, `bend` and friends are ordinaries; the field
 * divisions that resemble them are `perFess`, `perPale`, `perBend`. The two
 * vocabularies are disjoint, which is what makes this recoverable — the earlier
 * migration gave up here and dropped the band entirely.
 */
function legacyDivisionIsOrdinary(division) {
  return typeof division === 'string' && Object.hasOwn(ORDINARIES, division);
}

function legacyCharges(legacy) {
  if (!legacy.chargeEnabled || !legacy.chargeId) return [];
  return [{
    chargeId: legacy.externalChargeId || legacy.chargeId,
    tincture: legacy.chargeTincture || 'or',
    size: legacy.chargeSize || 'medium',
    count: legacy.chargeCount || 1,
    arrangement: legacy.chargeArrangement || 'fessPoint'
  }];
}

/**
 * v1 → a plain node.
 *
 * Field defaults match `HeraldryCreator`'s load path exactly, so a v1 record
 * migrates to the coat the app has been showing for it, not to a new one.
 */
function legacyToPlainNode(legacy) {
  const divisionIsOrdinary = legacyDivisionIsOrdinary(legacy.division);

  const field = {
    division: divisionIsOrdinary ? 'plain' : (legacy.division || DEFAULT_FIELD.division),
    tincture1: legacy.tincture1 || DEFAULT_FIELD.tincture1,
    tincture2: legacy.tincture2 || DEFAULT_FIELD.tincture2,
    tincture3: legacy.tincture3 || DEFAULT_FIELD.tincture3,
    lineStyle: legacy.lineStyle || DEFAULT_FIELD.lineStyle,
    count: legacy.count || DEFAULT_FIELD.count,
    inverted: legacy.inverted || DEFAULT_FIELD.inverted
  };

  const ordinaries = divisionIsOrdinary
    ? [{
        type: legacy.division,
        // The band took the second tincture in the legacy renderer, because a
        // division painted its two halves with tincture1/tincture2.
        tincture: legacy.tincture2 || DEFAULT_FIELD.tincture2,
        lineStyle: legacy.lineStyle || DEFAULT_FIELD.lineStyle,
        thickness: 'normal',
        count: 1,
        inverted: legacy.inverted || false
      }]
    : [];

  return { type: 'plain', field, ordinaries, charges: legacyCharges(legacy) };
}

/** Anything in a v1 object this module did not read. Never silently dropped. */
function unreadLegacyKeys(legacy) {
  const leftovers = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (!KNOWN_LEGACY_KEYS.has(key)) leftovers[key] = value;
  }
  return Object.keys(leftovers).length > 0 ? leftovers : null;
}

function isLayeredV2(composition) {
  // The v2 detector is `field`, not `version`, because personal arms are built
  // by spreading a house composition and can arrive without the version tag.
  return Boolean(composition.field) || composition.version === 2;
}

/**
 * Migrate any stored composition to version 3.
 *
 * Returns `null` for a record that has no composition — uploaded and generated
 * arms carry imagery but were never built in the creator, and inventing a
 * composition for them would fabricate a coat nobody drew.
 *
 * Idempotent: a v3 composition is returned unchanged, by identity.
 */
export function migrateComposition(composition) {
  if (composition === null || composition === undefined) return null;
  if (typeof composition !== 'object' || Array.isArray(composition)) return null;

  if (composition.version === COMPOSITION_VERSION && composition.root) {
    return composition;
  }

  const migrated = {
    version: COMPOSITION_VERSION,
    root: isLayeredV2(composition)
      ? {
          type: 'plain',
          // Passed through, not merged with defaults: a v2 record already holds
          // the field the app has been drawing.
          field: composition.field || { ...DEFAULT_FIELD },
          ordinaries: Array.isArray(composition.ordinaries) ? composition.ordinaries : [],
          charges: Array.isArray(composition.charges) ? composition.charges : []
        }
      : legacyToPlainNode(composition)
  };

  // Cadency brands the whole achievement, so it lives beside the root, not in it.
  if (composition.cadency) migrated.cadency = composition.cadency;
  if (composition.generatedAt) migrated.generatedAt = composition.generatedAt;

  if (!isLayeredV2(composition)) {
    const leftovers = unreadLegacyKeys(composition);
    if (leftovers) migrated.unmigrated = leftovers;
  }

  return migrated;
}

/**
 * What kind of stored composition this is.
 *
 *   absent     no composition — uploaded or generated arms. Correct as-is.
 *   malformed  present but not an object. Migration cannot help; a human must look.
 *   current    already version 3.
 *   legacy     v1 or v2, and migratable.
 *
 * This exists because a single boolean conflated the last three. A malformed
 * composition and an up-to-date one both answered "no, does not need
 * migrating", so a corrupt record was counted as healthy and never surfaced —
 * the record was correctly left alone and incorrectly reported as fine.
 */
export function classifyComposition(composition) {
  if (composition === null || composition === undefined) return 'absent';
  if (typeof composition !== 'object' || Array.isArray(composition)) return 'malformed';
  if (composition.version === COMPOSITION_VERSION && composition.root) return 'current';
  return 'legacy';
}

/**
 * Whether migrating this record would change it.
 *
 * Lets a caller skip records instead of rewriting every row — which matters
 * because every heraldry write is also a cloud sync. Note that a malformed
 * composition answers `false`: migration will not fix it. Use
 * `classifyComposition` when you need to tell the two apart.
 */
export function needsCompositionMigration(composition) {
  return classifyComposition(composition) === 'legacy';
}
