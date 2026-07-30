/**
 * Migration tests for the recursive composition model (decision C3).
 *
 * This migration rewrites saved coats of arms, which are hand-drawn creative
 * work with no source to regenerate from. Every failure mode here is silent —
 * a dropped ordinary or a reset tincture produces a shield that renders
 * perfectly and is simply not the one the owner drew. So the tests assert
 * preservation, not just shape.
 */
import { describe, it, expect } from 'vitest';
import {
  migrateComposition,
  needsCompositionMigration
} from './migrateComposition';
import {
  COMPOSITION_VERSION,
  validateComposition,
  collectLeaves,
  compositionDepth,
  isSimpleComposition,
  createPlainNode,
  createMarshalledNode,
  MARSHALLING,
  MAX_MARSHALLING_DEPTH
} from './compositionModel';

// A realistic v2 record, as HeraldryCreator writes them today.
const v2Composition = {
  field: {
    division: 'perPale',
    tincture1: 'azure',
    tincture2: 'argent',
    tincture3: 'gules',
    lineStyle: 'wavy',
    count: 6,
    inverted: false
  },
  ordinaries: [
    { type: 'chief', tincture: 'or', lineStyle: 'straight', thickness: 'normal', count: 1, inverted: false, visible: true }
  ],
  charges: [
    { chargeId: 'lion4', tincture: 'gules', size: 'large', count: 1, arrangement: 'fessPoint', visible: true }
  ],
  generatedAt: '2026-03-04T10:00:00.000Z',
  version: 2
};

describe('migrateComposition — v2 (the format nearly all real coats are in)', () => {
  it('wraps the layered format in a single plain root', () => {
    const migrated = migrateComposition(v2Composition);

    expect(migrated.version).toBe(COMPOSITION_VERSION);
    expect(migrated.root.type).toBe('plain');
    expect(isSimpleComposition(migrated)).toBe(true);
    expect(compositionDepth(migrated.root)).toBe(1);
    expect(validateComposition(migrated).valid).toBe(true);
  });

  it('preserves the field exactly, without merging defaults over it', () => {
    const migrated = migrateComposition(v2Composition);
    // Not toMatchObject — an extra or altered key here is a changed coat.
    expect(migrated.root.field).toEqual(v2Composition.field);
  });

  it('preserves ordinaries and charges byte-for-byte', () => {
    const migrated = migrateComposition(v2Composition);
    expect(migrated.root.ordinaries).toEqual(v2Composition.ordinaries);
    expect(migrated.root.charges).toEqual(v2Composition.charges);
  });

  it('does not invent a `visible` flag on items that lack one', () => {
    // `visible` is read as `!== false`, so writing an explicit true would be a
    // behaviour-preserving data rewrite — still a rewrite, still not our call.
    const noVisible = {
      ...v2Composition,
      ordinaries: [{ type: 'fess', tincture: 'sable' }],
      charges: [{ chargeId: 'rose1', tincture: 'argent' }]
    };
    const migrated = migrateComposition(noVisible);

    expect(migrated.root.ordinaries[0]).not.toHaveProperty('visible');
    expect(migrated.root.charges[0]).not.toHaveProperty('visible');
  });

  it('carries cadency beside the root, not inside it', () => {
    const personal = { ...v2Composition, cadency: { type: 'triangles', count: 2, position: 'chief', tincture: 'sable' } };
    const migrated = migrateComposition(personal);

    expect(migrated.cadency).toEqual(personal.cadency);
    expect(migrated.root).not.toHaveProperty('cadency');
  });

  it('recognises personal arms that arrive without a version tag', () => {
    // createPersonalArms spreads the house composition, so `version` can be
    // absent while `field` is present. Detecting on `version` alone would send
    // these down the legacy path and rebuild the coat from defaults.
    const { version, ...untagged } = v2Composition;
    expect(version).toBe(2);

    const migrated = migrateComposition(untagged);
    expect(migrated.root.field).toEqual(v2Composition.field);
    expect(migrated.root.charges).toEqual(v2Composition.charges);
  });

  it('tolerates missing ordinaries/charges arrays', () => {
    const migrated = migrateComposition({ field: v2Composition.field, version: 2 });
    expect(migrated.root.ordinaries).toEqual([]);
    expect(migrated.root.charges).toEqual([]);
  });
});

describe('migrateComposition — v1 legacy flat format', () => {
  const v1Plain = {
    division: 'perFess',
    tincture1: 'gules',
    tincture2: 'or',
    lineStyle: 'embattled',
    count: 4,
    inverted: true
  };

  it('reproduces the field the app has been showing for the record', () => {
    // These defaults mirror HeraldryCreator's load path exactly, so migrating
    // must not change what the owner sees.
    const migrated = migrateComposition(v1Plain);

    expect(migrated.root.field).toEqual({
      division: 'perFess',
      tincture1: 'gules',
      tincture2: 'or',
      tincture3: 'gules',
      lineStyle: 'embattled',
      count: 4,
      inverted: true
    });
  });

  it('migrates a legacy single charge', () => {
    const migrated = migrateComposition({
      ...v1Plain,
      chargeEnabled: true,
      chargeId: 'lion4',
      chargeTincture: 'sable',
      chargeSize: 'large',
      chargeCount: 3,
      chargeArrangement: 'chief'
    });

    expect(migrated.root.charges).toEqual([
      { chargeId: 'lion4', tincture: 'sable', size: 'large', count: 3, arrangement: 'chief' }
    ]);
  });

  it('prefers externalChargeId over chargeId, as the old loader did', () => {
    const migrated = migrateComposition({
      ...v1Plain, chargeEnabled: true, chargeId: 'lion4', externalChargeId: 'ext-oak-77'
    });
    expect(migrated.root.charges[0].chargeId).toBe('ext-oak-77');
  });

  it('ignores a charge id when the charge was disabled', () => {
    const migrated = migrateComposition({ ...v1Plain, chargeEnabled: false, chargeId: 'lion4' });
    expect(migrated.root.charges).toEqual([]);
  });

  // The bug the previous migration documented and gave up on.
  describe('a legacy division that is really an ordinary', () => {
    it.each(['chief', 'fess', 'pale', 'bend', 'chevron', 'cross', 'saltire'])(
      'recovers "%s" as an ordinary instead of dropping it',
      (ordinaryName) => {
        const migrated = migrateComposition({
          division: ordinaryName, tincture1: 'azure', tincture2: 'or', lineStyle: 'straight'
        });

        // The old loader left ordinaries empty here — the band vanished.
        expect(migrated.root.ordinaries).toHaveLength(1);
        expect(migrated.root.ordinaries[0].type).toBe(ordinaryName);
        expect(migrated.root.ordinaries[0].tincture).toBe('or');
        expect(migrated.root.field.division).toBe('plain');
      }
    );

    it('leaves real field divisions alone', () => {
      // perPale/perFess/perBend are divisions, not ordinaries, despite the
      // near-identical names. Misclassifying these would be the mirror bug.
      for (const division of ['perPale', 'perFess', 'perBend', 'perSaltire', 'quarterly', 'gyronny']) {
        const migrated = migrateComposition({ division, tincture1: 'azure', tincture2: 'or' });
        expect(migrated.root.field.division).toBe(division);
        expect(migrated.root.ordinaries).toEqual([]);
      }
    });
  });

  it('preserves keys it does not understand rather than dropping them', () => {
    const migrated = migrateComposition({
      ...v1Plain, someExperimentalField: 'keep me', anotherOne: { nested: true }
    });

    expect(migrated.unmigrated).toEqual({
      someExperimentalField: 'keep me',
      anotherOne: { nested: true }
    });
  });

  it('records nothing under `unmigrated` when everything was understood', () => {
    expect(migrateComposition(v1Plain)).not.toHaveProperty('unmigrated');
  });
});

describe('migrateComposition — records with no composition', () => {
  it.each([[null], [undefined]])('returns null for %s', (input) => {
    expect(migrateComposition(input)).toBeNull();
  });

  it('does not fabricate a coat for uploaded or generated arms', () => {
    // Armoria/upload records have imagery and no composition. Inventing a
    // default composition would claim the owner drew something they didn't.
    expect(migrateComposition(null)).toBeNull();
    expect(needsCompositionMigration(null)).toBe(false);
  });

  it('refuses malformed input instead of guessing', () => {
    expect(migrateComposition('not an object')).toBeNull();
    expect(migrateComposition([1, 2, 3])).toBeNull();
    expect(migrateComposition(42)).toBeNull();
  });
});

describe('migrateComposition — idempotence', () => {
  it('returns an already-migrated composition unchanged, by identity', () => {
    const once = migrateComposition(v2Composition);
    expect(migrateComposition(once)).toBe(once);
  });

  it('is stable across repeated runs', () => {
    // A migration that runs on app load must be safe to run every load.
    const once = migrateComposition(v2Composition);
    const thrice = migrateComposition(migrateComposition(migrateComposition(once)));
    expect(thrice).toEqual(once);
  });

  it('reports whether a record needs writing at all', () => {
    // Every heraldry write is also a cloud sync, so migrating rows that do not
    // need it is 33 needless Firestore writes.
    expect(needsCompositionMigration(v2Composition)).toBe(true);
    expect(needsCompositionMigration(migrateComposition(v2Composition))).toBe(false);
  });

  it('treats a version-3 tag without a root as still needing migration', () => {
    expect(needsCompositionMigration({ version: 3 })).toBe(true);
  });
});

describe('the recursive model itself', () => {
  const azure = createPlainNode({ field: { tincture1: 'azure' } });
  const gules = createPlainNode({ field: { tincture1: 'gules' } });

  it('models a marriage as an impaled pair', () => {
    const marriage = createMarshalledNode('impaled', [azure, gules]);
    const composition = { version: COMPOSITION_VERSION, root: marriage };

    expect(validateComposition(composition).valid).toBe(true);
    expect(collectLeaves(marriage)).toHaveLength(2);
    expect(compositionDepth(marriage)).toBe(2);
    expect(isSimpleComposition(composition)).toBe(false);
  });

  it('models descent as four quarters', () => {
    const quartered = createMarshalledNode('quartered', [azure, gules, azure, gules]);
    expect(validateComposition({ version: COMPOSITION_VERSION, root: quartered }).valid).toBe(true);
    expect(collectLeaves(quartered)).toHaveLength(4);
  });

  it('supports a grand quarter — a quarter that is itself quartered', () => {
    // This is the case the old flat model could not express at all, and the
    // reason the model had to become recursive rather than gain two more fields.
    const inner = createMarshalledNode('quartered', [azure, gules, azure, gules]);
    const grand = createMarshalledNode('quartered', [inner, gules, azure, gules]);

    expect(validateComposition({ version: COMPOSITION_VERSION, root: grand }).valid).toBe(true);
    expect(compositionDepth(grand)).toBe(3);
    expect(collectLeaves(grand)).toHaveLength(7);
  });

  it('returns leaves in heraldic order', () => {
    // Quarters are numbered dexter chief, sinister chief, dexter base, sinister
    // base. A renderer that draws them out of order draws the wrong descent.
    const parts = ['first', 'second', 'third', 'fourth'].map(
      (name) => createPlainNode({ field: { tincture1: name } })
    );
    const leaves = collectLeaves(createMarshalledNode('quartered', parts));
    expect(leaves.map((l) => l.field.tincture1)).toEqual(['first', 'second', 'third', 'fourth']);
  });

  describe('validation', () => {
    it('rejects an arrangement with the wrong number of parts', () => {
      // Renders as a half-empty shield rather than an error, so it must not pass.
      const { valid, errors } = validateComposition({
        version: COMPOSITION_VERSION,
        root: createMarshalledNode('quartered', [azure, gules])
      });
      expect(valid).toBe(false);
      expect(errors[0]).toMatch(/needs exactly 4 parts, got 2/);
    });

    it('rejects an unknown arrangement', () => {
      const { valid, errors } = validateComposition({
        version: COMPOSITION_VERSION,
        root: createMarshalledNode('tierced', [azure, gules])
      });
      expect(valid).toBe(false);
      expect(errors[0]).toMatch(/unknown marshalling arrangement/);
    });

    it('rejects nesting beyond the depth cap', () => {
      let node = azure;
      for (let i = 0; i < MAX_MARSHALLING_DEPTH + 1; i++) {
        node = createMarshalledNode('impaled', [node, gules]);
      }
      const { valid, errors } = validateComposition({ version: COMPOSITION_VERSION, root: node });
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('nested deeper than'))).toBe(true);
    });

    it('accepts a null composition — not every coat was drawn in the creator', () => {
      expect(validateComposition(null).valid).toBe(true);
    });

    it('flags a wrong version tag', () => {
      const { valid, errors } = validateComposition({ version: 2, root: azure });
      expect(valid).toBe(false);
      expect(errors.some((e) => e.includes('expected version 3'))).toBe(true);
    });

    it('reports every declared arrangement as internally consistent', () => {
      for (const [name, spec] of Object.entries(MARSHALLING)) {
        const parts = Array.from({ length: spec.parts }, () => azure);
        const result = validateComposition({
          version: COMPOSITION_VERSION,
          root: createMarshalledNode(name, parts)
        });
        expect(result.valid, `${name} should validate with ${spec.parts} parts`).toBe(true);
      }
    });
  });
});
