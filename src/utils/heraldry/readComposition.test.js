/**
 * Tests for version-tolerant composition reading (decision C3, step 2).
 *
 * The bug class this replaces is a reader that recognises one storage version
 * and silently does nothing for the others. `HeraldryCreator` had two:
 *
 *   - the edit-load path branched on `comp.field` and otherwise rebuilt the
 *     coat from an inline copy of the legacy conversion
 *   - the personal-arms derivation path branched on `comp?.field` and had no
 *     else at all, so deriving from a legacy record opened a blank shield —
 *     and would have done the same for every record once step 3 writes v3
 *
 * Both failed by rendering an empty or wrong shield, never by erroring. So
 * these tests assert on all three storage versions, every time.
 */
import { describe, it, expect } from 'vitest';
import { readComposition, primaryLeaf, allLeaves, readCadency } from './readComposition';
import { migrateComposition } from './migrateComposition';
import { createPlainNode, createMarshalledNode, COMPOSITION_VERSION } from './compositionModel';

const field = {
  division: 'perPale',
  tincture1: 'azure',
  tincture2: 'argent',
  tincture3: 'gules',
  lineStyle: 'straight',
  count: 6,
  inverted: false
};
const ordinaries = [{ type: 'chief', tincture: 'or', visible: true }];
const charges = [{ chargeId: 'lion4', tincture: 'gules', size: 'medium', count: 1, arrangement: 'fessPoint', visible: true }];

const v1 = {
  division: 'perFess',
  tincture1: 'gules',
  tincture2: 'or',
  lineStyle: 'embattled',
  chargeEnabled: true,
  chargeId: 'rose1',
  chargeTincture: 'argent'
};
const v2 = { field, ordinaries, charges, version: 2 };
const v3 = migrateComposition(v2);

describe('primaryLeaf across every stored version', () => {
  it('reads version 2 — the format all real coats are in today', () => {
    const leaf = primaryLeaf(v2);
    expect(leaf.field).toEqual(field);
    expect(leaf.ordinaries).toEqual(ordinaries);
    expect(leaf.charges).toEqual(charges);
  });

  it('reads version 3 — which the old `comp.field` check would have missed', () => {
    // This is the regression that step 3 would otherwise introduce: a migrated
    // record has no top-level `field`, so every reader branching on it fails.
    expect(v3).not.toHaveProperty('field');
    const leaf = primaryLeaf(v3);
    expect(leaf.field).toEqual(field);
    expect(leaf.ordinaries).toEqual(ordinaries);
    expect(leaf.charges).toEqual(charges);
  });

  it('reads version 1 — which the derivation path silently rendered blank', () => {
    const leaf = primaryLeaf(v1);
    expect(leaf.field.division).toBe('perFess');
    expect(leaf.field.tincture1).toBe('gules');
    expect(leaf.charges).toEqual([
      { chargeId: 'rose1', tincture: 'argent', size: 'medium', count: 1, arrangement: 'fessPoint' }
    ]);
  });

  it('gives the same answer for a record before and after migration', () => {
    // The property that lets the data migration and the code ship in either
    // order: a reader cannot tell whether a record has been migrated.
    expect(primaryLeaf(v2)).toEqual(primaryLeaf(migrateComposition(v2)));
    expect(primaryLeaf(v1)).toEqual(primaryLeaf(migrateComposition(v1)));
  });
});

describe('primaryLeaf — nothing to draw', () => {
  it.each([[null], [undefined]])('returns null for %s rather than an empty coat', (input) => {
    // Callers keep their existing "no composition" branch; they must not gain a
    // new blank-shield case that looks like a real but empty coat.
    expect(primaryLeaf(input)).toBeNull();
  });

  it('returns null for a malformed composition', () => {
    expect(primaryLeaf('not a composition')).toBeNull();
    expect(primaryLeaf(42)).toBeNull();
  });
});

describe('primaryLeaf on a marshalled coat', () => {
  const dexter = createPlainNode({ field: { tincture1: 'azure' } });
  const sinister = createPlainNode({ field: { tincture1: 'gules' } });

  it('gives the first quarter to a renderer that can only draw one', () => {
    const impaled = { version: COMPOSITION_VERSION, root: createMarshalledNode('impaled', [dexter, sinister]) };
    expect(primaryLeaf(impaled).field.tincture1).toBe('azure');
  });

  it('reaches through nesting to the first actual coat', () => {
    const inner = createMarshalledNode('quartered', [dexter, sinister, dexter, sinister]);
    const grand = { version: COMPOSITION_VERSION, root: createMarshalledNode('quartered', [inner, sinister, dexter, sinister]) };
    expect(primaryLeaf(grand).field.tincture1).toBe('azure');
  });
});

describe('allLeaves', () => {
  it('returns exactly one coat for everything stored today', () => {
    expect(allLeaves(v1)).toHaveLength(1);
    expect(allLeaves(v2)).toHaveLength(1);
    expect(allLeaves(v3)).toHaveLength(1);
  });

  it('returns every coat of a marshalled shield, in heraldic order', () => {
    const parts = ['first', 'second', 'third', 'fourth'].map((t) => createPlainNode({ field: { tincture1: t } }));
    const quartered = { version: COMPOSITION_VERSION, root: createMarshalledNode('quartered', parts) };
    expect(allLeaves(quartered).map((l) => l.field.tincture1)).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('returns an empty array rather than null when there is no composition', () => {
    // So callers can map over it without a guard.
    expect(allLeaves(null)).toEqual([]);
    expect(allLeaves('nonsense')).toEqual([]);
  });
});

describe('readCadency', () => {
  const cadency = { type: 'triangles', count: 2, position: 'chief', tincture: 'sable' };

  it('finds cadency on a v2 record written by createPersonalArmsFromHouse', () => {
    // That function spreads the house composition and adds `cadency` beside it,
    // so cadency arrives on a version-2 shaped object.
    expect(readCadency({ ...v2, cadency })).toEqual(cadency);
  });

  it('finds cadency on a migrated record', () => {
    expect(readCadency(migrateComposition({ ...v2, cadency }))).toEqual(cadency);
  });

  it('is null when the arms bear no cadency', () => {
    expect(readCadency(v2)).toBeNull();
    expect(readCadency(null)).toBeNull();
  });
});

describe('readComposition', () => {
  it('normalises in memory without touching the input', () => {
    const stored = { field, ordinaries, charges, version: 2 };
    const snapshot = structuredClone(stored);

    readComposition(stored);

    // A read path that mutates stored data is how a "safe" refactor corrupts a
    // record on a page that never saved anything.
    expect(stored).toEqual(snapshot);
  });

  it('reports version 3 whatever went in', () => {
    for (const input of [v1, v2, v3]) {
      expect(readComposition(input).version).toBe(COMPOSITION_VERSION);
    }
  });
});
