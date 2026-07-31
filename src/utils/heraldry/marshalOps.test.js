/**
 * Tests for dividing and undividing a coat (decision C3, step 5d).
 *
 * These are the two edits that change the *shape* of a composition, and both
 * can destroy work: dividing puts the user's existing coat somewhere, and
 * undividing throws parts away. Which coat survives is the thing that must not
 * drift.
 */
import { describe, it, expect } from 'vitest';
import {
  divideNode,
  impaleWith,
  undivideNode,
  undivideLoses,
  canDivide,
  isUndivided
} from './marshalOps';
import {
  createPlainNode,
  createMarshalledNode,
  validateComposition,
  COMPOSITION_VERSION,
  MAX_MARSHALLING_DEPTH
} from './compositionModel';

const leaf = (t) => createPlainNode({ field: { tincture1: t } });
const wrap = (root) => ({ version: COMPOSITION_VERSION, root });

describe('divideNode', () => {
  it('impales into two parts and quarters into four', () => {
    expect(divideNode(leaf('azure'), 'impaled').parts).toHaveLength(2);
    expect(divideNode(leaf('azure'), 'quartered').parts).toHaveLength(4);
  });

  it('keeps the existing coat as the first part', () => {
    // The user drew this coat and is now marshalling something with it, so
    // their work belongs in the senior position and must not be discarded.
    for (const arrangement of ['impaled', 'quartered']) {
      const divided = divideNode(leaf('azure'), arrangement);
      expect(divided.parts[0].field.tincture1).toBe('azure');
    }
  });

  it('starts the remaining parts blank', () => {
    // `murrey`, not `azure` — the default field tincture is azure, so an
    // azure original cannot distinguish "kept" from "blank".
    const divided = divideNode(leaf('murrey'), 'quartered');

    expect(divided.parts[0].field.tincture1).toBe('murrey');
    for (const part of divided.parts.slice(1)) {
      expect(part).toEqual(createPlainNode());
    }
  });

  it('produces a composition that validates', () => {
    expect(validateComposition(wrap(divideNode(leaf('azure'), 'quartered'))).valid).toBe(true);
  });

  it('can divide an already-divided node, making a grand quarter', () => {
    const inner = createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]);
    const grand = divideNode(inner, 'quartered');

    expect(grand.parts[0]).toBe(inner);
    expect(validateComposition(wrap(grand)).valid).toBe(true);
  });

  it('refuses an unknown arrangement', () => {
    expect(() => divideNode(leaf('azure'), 'tierced')).toThrow(/Unknown marshalling/);
  });

  it('does not mutate the node it divides', () => {
    const node = leaf('azure');
    const before = structuredClone(node);
    divideNode(node, 'impaled');
    expect(node).toEqual(before);
  });
});

describe('undivideNode', () => {
  it('collapses to the first part', () => {
    const divided = createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]);
    expect(undivideNode(divided).field.tincture1).toBe('azure');
  });

  it('is the exact inverse of dividing', () => {
    // Divide then immediately undivide must return the user to where they were,
    // or the control is a trap rather than an experiment.
    const original = leaf('azure');
    expect(undivideNode(divideNode(original, 'quartered'))).toBe(original);
  });

  it('leaves a single coat alone', () => {
    const single = leaf('azure');
    expect(undivideNode(single)).toBe(single);
  });

  it('keeps nesting in the surviving part', () => {
    const inner = createMarshalledNode('impaled', [leaf('azure'), leaf('gules')]);
    const outer = createMarshalledNode('quartered', [inner, leaf('or'), leaf('vert'), leaf('sable')]);
    expect(undivideNode(outer)).toBe(inner);
  });
});

describe('undivideLoses', () => {
  it('counts the coats that would be discarded', () => {
    expect(undivideLoses(createMarshalledNode('impaled', [leaf('a'), leaf('b')]))).toBe(1);
    expect(undivideLoses(createMarshalledNode('quartered', [leaf('a'), leaf('b'), leaf('c'), leaf('d')]))).toBe(3);
  });

  it('counts leaves, not parts, so a nested quarter reports everything inside it', () => {
    // Reporting "3" for a quartering whose parts are themselves quartered would
    // understate the loss by nine coats.
    const inner = createMarshalledNode('quartered', [leaf('a'), leaf('b'), leaf('c'), leaf('d')]);
    const outer = createMarshalledNode('quartered', [leaf('x'), inner, leaf('y'), leaf('z')]);
    expect(undivideLoses(outer)).toBe(6);
  });

  it('reports nothing lost for a single coat', () => {
    expect(undivideLoses(leaf('azure'))).toBe(0);
  });
});

describe('canDivide', () => {
  it('allows dividing near the top of the tree', () => {
    expect(canDivide(leaf('azure'), [])).toBe(true);
    expect(canDivide(leaf('azure'), [0])).toBe(true);
  });

  it('refuses at the depth the renderer and model stop supporting', () => {
    // The UI disables the control rather than letting someone build something
    // that will then fail validation on save.
    const tooDeep = Array.from({ length: MAX_MARSHALLING_DEPTH }, (_, i) => i);
    expect(canDivide(leaf('azure'), tooDeep)).toBe(false);
  });

  it('agrees with what the model will actually validate', () => {
    let node = leaf('azure');
    let path = [];
    while (canDivide(node, path)) {
      node = divideNode(node, 'impaled');
      path = [...path, 0];
    }
    // Whatever canDivide permitted must be something validateComposition accepts.
    expect(validateComposition(wrap(node)).valid).toBe(true);
  });
});

describe('isUndivided', () => {
  it('is true for every coat stored today', () => {
    expect(isUndivided(leaf('azure'))).toBe(true);
    expect(isUndivided(createMarshalledNode('impaled', [leaf('a'), leaf('b')]))).toBe(false);
  });
});

describe('impaleWith — the marriage case (step 6)', () => {
  const bearer = leaf('azure');
  const spouse = leaf('gules');

  it('puts the bearer dexter and the spouse sinister', () => {
    // Classically the husband takes dexter and the wife sinister. This decides
    // it by *whose arms these are*, not by anyone's gender — same result in the
    // ordinary case, without imposing a rule the world may not share.
    const marriage = impaleWith(bearer, spouse);

    expect(marriage.arrangement).toBe('impaled');
    expect(marriage.parts[0]).toBe(bearer);
    expect(marriage.parts[1]).toBe(spouse);
  });

  it('produces a composition that validates', () => {
    expect(validateComposition(wrap(impaleWith(bearer, spouse))).valid).toBe(true);
  });

  it('carries a marshalled spouse coat across whole', () => {
    // Marrying a house whose arms are quartered gives an impalement of a
    // quartering, which is what real marshalling does.
    const quarteredSpouse = createMarshalledNode('quartered', [
      leaf('a'), leaf('b'), leaf('c'), leaf('d')
    ]);
    const marriage = impaleWith(bearer, quarteredSpouse);

    expect(marriage.parts[1].type).toBe('marshalled');
    expect(validateComposition(wrap(marriage)).valid).toBe(true);
  });

  it('is undone by undivideNode, keeping the bearer', () => {
    // Undo aside, collapsing a marriage should leave the person with their own
    // arms rather than their spouse's.
    expect(undivideNode(impaleWith(bearer, spouse))).toBe(bearer);
  });
});
