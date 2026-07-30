/**
 * Tests for building a composition to save (decision C3, step 3).
 *
 * Step 3 is the first step that changes stored data, and the failure mode is
 * write-shaped: a coat that saves in a form the reader cannot fully recover.
 * The two things most at risk are the fields that live *beside* the root and
 * so are easy to forget when constructing one — cadency, and the unrecognised
 * legacy keys the migration deliberately preserved.
 */
import { describe, it, expect } from 'vitest';
import { composeCoat, composeFromRoot } from './composeCoat';
import { readComposition, primaryLeaf, readCadency } from './readComposition';
import {
  validateComposition,
  COMPOSITION_VERSION,
  createPlainNode,
  createMarshalledNode
} from './compositionModel';

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

describe('composeCoat', () => {
  it('builds a valid version-3 composition', () => {
    const composition = composeCoat({ field, ordinaries, charges });

    expect(composition.version).toBe(COMPOSITION_VERSION);
    expect(composition.root.type).toBe('plain');
    expect(validateComposition(composition).valid).toBe(true);
  });

  it('round-trips through the reader unchanged', () => {
    // The property that matters: what the creator saves is exactly what the
    // creator will load back into its editing panel.
    const composition = composeCoat({ field, ordinaries, charges });
    const leaf = primaryLeaf(composition);

    expect(leaf.field).toEqual(field);
    expect(leaf.ordinaries).toEqual(ordinaries);
    expect(leaf.charges).toEqual(charges);
  });

  it('puts cadency beside the root, where the reader looks for it', () => {
    const cadency = { type: 'triangles', count: 2, position: 'chief', tincture: 'sable' };
    const composition = composeCoat({ field, cadency });

    expect(composition.cadency).toEqual(cadency);
    expect(composition.root).not.toHaveProperty('cadency');
    expect(readCadency(composition)).toEqual(cadency);
  });

  it('omits cadency rather than storing null for undifferenced arms', () => {
    const composition = composeCoat({ field, cadency: null });
    expect(composition).not.toHaveProperty('cadency');
    expect(readCadency(composition)).toBeNull();
  });

  it('carries unrecognised legacy keys through a re-save', () => {
    // The migration preserves what it does not understand; it would be
    // pointless for the first save afterwards to drop it.
    const unmigrated = { someExperimentalField: 'keep me' };
    const composition = composeCoat({ field, unmigrated });

    expect(composition.unmigrated).toEqual(unmigrated);
    expect(readComposition(composition).unmigrated).toEqual(unmigrated);
  });

  it('omits unmigrated entirely when there is nothing to carry', () => {
    expect(composeCoat({ field })).not.toHaveProperty('unmigrated');
  });

  it('defaults ordinaries and charges to empty arrays', () => {
    const composition = composeCoat({ field });
    expect(composition.root.ordinaries).toEqual([]);
    expect(composition.root.charges).toEqual([]);
  });

  it('is pure — it does not stamp its own timestamp', () => {
    // generatedAt is passed in so this stays testable and deterministic.
    expect(composeCoat({ field })).not.toHaveProperty('generatedAt');
    expect(composeCoat({ field, generatedAt: '2026-07-30T00:00:00.000Z' }).generatedAt)
      .toBe('2026-07-30T00:00:00.000Z');
  });

  it('survives being called with nothing', () => {
    const composition = composeCoat();
    expect(validateComposition(composition).valid).toBe(true);
    expect(composition.root.field).toBeTruthy();
  });
});

describe('composeFromRoot — saving a whole tree (step 5c)', () => {
  const azure = createPlainNode({ field: { tincture1: 'azure' } });
  const gules = createPlainNode({ field: { tincture1: 'gules' } });

  it('saves a marshalled shield and reads it back as the same shield', () => {
    // The claim step 5c makes. Before it, the creator rebuilt a single coat
    // from three state variables on save, so a marshalled shield could not have
    // survived a round trip even if something had built one.
    const marriage = createMarshalledNode('impaled', [azure, gules]);
    const composition = composeFromRoot(marriage);

    expect(validateComposition(composition).valid).toBe(true);

    const read = readComposition(composition);
    expect(read.root.type).toBe('marshalled');
    expect(read.root.arrangement).toBe('impaled');
    expect(read.root.parts).toHaveLength(2);
    expect(read.root.parts[0].field.tincture1).toBe('azure');
    expect(read.root.parts[1].field.tincture1).toBe('gules');
  });

  it('survives nesting', () => {
    const inner = createMarshalledNode('quartered', [azure, gules, azure, gules]);
    const grand = createMarshalledNode('quartered', [inner, gules, azure, gules]);

    const read = readComposition(composeFromRoot(grand));
    expect(read.root.parts[0].parts[3].field.tincture1).toBe('gules');
    expect(validateComposition(read).valid).toBe(true);
  });

  it('keeps cadency beside a marshalled root, not inside a quarter', () => {
    const cadency = { type: 'triangles', count: 3, position: 'chief', tincture: 'sable' };
    const composition = composeFromRoot(createMarshalledNode('impaled', [azure, gules]), { cadency });

    expect(composition.cadency).toEqual(cadency);
    expect(composition.root.parts[0]).not.toHaveProperty('cadency');
  });

  it('is what composeCoat is built on, so the two cannot drift', () => {
    const viaCoat = composeCoat({ field, ordinaries, charges });
    const viaRoot = composeFromRoot(createPlainNode({ field, ordinaries, charges }));
    expect(viaCoat).toEqual(viaRoot);
  });
});

describe('composeCoat — a full edit cycle', () => {
  it('a legacy record loaded, edited and saved keeps everything it started with', () => {
    // This is the sequence step 3 actually performs on the owner's data: read a
    // v1/v2 record, edit one thing, save it back as v3.
    const legacy = {
      division: 'chief',
      tincture1: 'azure',
      tincture2: 'or',
      chargeEnabled: true,
      chargeId: 'rose1',
      someExperimentalField: 'keep me'
    };

    const stored = readComposition(legacy);
    const leaf = primaryLeaf(legacy);

    const resaved = composeCoat({
      field: { ...leaf.field, tincture1: 'gules' }, // the user's edit
      ordinaries: leaf.ordinaries,
      charges: leaf.charges,
      unmigrated: stored.unmigrated
    });

    expect(resaved.version).toBe(COMPOSITION_VERSION);
    expect(resaved.root.field.tincture1).toBe('gules');
    // The ordinary the legacy loader used to drop survives the whole cycle.
    expect(resaved.root.ordinaries[0].type).toBe('chief');
    expect(resaved.root.charges[0].chargeId).toBe('rose1');
    expect(resaved.unmigrated).toEqual({ someExperimentalField: 'keep me' });
  });

  it('is stable across repeated save/load cycles', () => {
    let composition = composeCoat({ field, ordinaries, charges });
    for (let i = 0; i < 3; i++) {
      const leaf = primaryLeaf(composition);
      composition = composeCoat({
        field: leaf.field,
        ordinaries: leaf.ordinaries,
        charges: leaf.charges
      });
    }
    expect(primaryLeaf(composition).field).toEqual(field);
    expect(primaryLeaf(composition).charges).toEqual(charges);
  });
});
