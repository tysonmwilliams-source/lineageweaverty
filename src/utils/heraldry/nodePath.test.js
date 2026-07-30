/**
 * Tests for addressing nodes in a composition tree (decision C3, step 5c).
 *
 * Two failure modes here are silent rather than loud, and both are covered
 * deliberately:
 *
 *   - **Aliasing.** If replacing one quarter returns a tree that shares array
 *     or object identity with the old one in the wrong places, editing quarter
 *     1 can change quarter 3, or React can miss the change entirely. Neither
 *     throws.
 *   - **A stale path.** A selection can outlive the shape it referred to — the
 *     user un-marshals a quarter while standing inside it. Resolving to null
 *     and rendering nothing looks like a broken editor, not like an error.
 */
import { describe, it, expect } from 'vitest';
import {
  getNodeAtPath,
  setNodeAtPath,
  clampPath,
  listPaths,
  describePath,
  samePath
} from './nodePath';
import { createPlainNode, createMarshalledNode } from './compositionModel';

const leaf = (t) => createPlainNode({ field: { tincture1: t } });

//        root (quartered)
//        ├─ 0: azure
//        ├─ 1: impaled ─ 0: gules
//        │              └ 1: vert
//        ├─ 2: sable
//        └─ 3: or
const tree = () => createMarshalledNode('quartered', [
  leaf('azure'),
  createMarshalledNode('impaled', [leaf('gules'), leaf('vert')]),
  leaf('sable'),
  leaf('or')
]);

describe('getNodeAtPath', () => {
  it('returns the whole shield for an empty path', () => {
    const root = tree();
    expect(getNodeAtPath(root, [])).toBe(root);
  });

  it('walks into a part', () => {
    expect(getNodeAtPath(tree(), [0]).field.tincture1).toBe('azure');
    expect(getNodeAtPath(tree(), [3]).field.tincture1).toBe('or');
  });

  it('walks into a nested part', () => {
    expect(getNodeAtPath(tree(), [1, 1]).field.tincture1).toBe('vert');
  });

  it('returns null rather than throwing for a path that leads nowhere', () => {
    expect(getNodeAtPath(tree(), [9])).toBeNull();
    expect(getNodeAtPath(tree(), [0, 0])).toBeNull(); // a leaf has no parts
    expect(getNodeAtPath(leaf('azure'), [0])).toBeNull();
  });
});

describe('setNodeAtPath', () => {
  it('replaces the root when the path is empty', () => {
    const next = leaf('argent');
    expect(setNodeAtPath(tree(), [], next)).toBe(next);
  });

  it('replaces a part and leaves its siblings equal', () => {
    const root = tree();
    const updated = setNodeAtPath(root, [0], leaf('argent'));

    expect(updated.parts[0].field.tincture1).toBe('argent');
    expect(updated.parts[2].field.tincture1).toBe('sable');
    expect(updated.parts[3].field.tincture1).toBe('or');
  });

  it('replaces a nested part without disturbing its sibling', () => {
    const updated = setNodeAtPath(tree(), [1, 0], leaf('argent'));
    expect(updated.parts[1].parts[0].field.tincture1).toBe('argent');
    expect(updated.parts[1].parts[1].field.tincture1).toBe('vert');
  });

  it('does not mutate the tree it was given', () => {
    // A mutating edit still renders correctly in React right up until
    // something memoises, and then edits stop appearing.
    const root = tree();
    const before = structuredClone(root);
    setNodeAtPath(root, [1, 1], leaf('argent'));
    expect(root).toEqual(before);
  });

  it('rebuilds only the spine, keeping untouched parts by reference', () => {
    // Not merely an optimisation: identity is how memoised rendering knows a
    // quarter did not change, and re-cloning everything would defeat it.
    const root = tree();
    const updated = setNodeAtPath(root, [1, 0], leaf('argent'));

    expect(updated).not.toBe(root);
    expect(updated.parts[1]).not.toBe(root.parts[1]);
    expect(updated.parts[0]).toBe(root.parts[0]);
    expect(updated.parts[2]).toBe(root.parts[2]);
    expect(updated.parts[1].parts[1]).toBe(root.parts[1].parts[1]);
  });

  it('ignores an out-of-range index instead of growing the tree', () => {
    const root = tree();
    expect(setNodeAtPath(root, [9], leaf('argent'))).toBe(root);
    expect(setNodeAtPath(root, [-1], leaf('argent'))).toBe(root);
  });

  it('ignores a path that runs through a leaf', () => {
    const root = tree();
    expect(setNodeAtPath(root, [0, 0], leaf('argent'))).toBe(root);
  });
});

describe('clampPath', () => {
  it('leaves a valid path alone', () => {
    expect(clampPath(tree(), [1, 1])).toEqual([1, 1]);
  });

  it('walks back to the nearest path that still resolves', () => {
    // The un-marshalling case: the user was editing [1, 1] when part 1 stopped
    // being marshalled. Falling back to [1] keeps them where they were rather
    // than throwing them out to the root.
    const flattened = setNodeAtPath(tree(), [1], leaf('argent'));
    expect(clampPath(flattened, [1, 1])).toEqual([1]);
  });

  it('falls back to the root when nothing resolves', () => {
    expect(clampPath(leaf('azure'), [2, 3])).toEqual([]);
    expect(clampPath(tree(), [9, 9])).toEqual([]);
  });

  it('treats an empty path as already safe', () => {
    expect(clampPath(tree(), [])).toEqual([]);
  });
});

describe('listPaths', () => {
  it('lists the root and every descendant in heraldic order', () => {
    expect(listPaths(tree())).toEqual([
      [], [0], [1], [1, 0], [1, 1], [2], [3]
    ]);
  });

  it('lists just the root for a single coat', () => {
    expect(listPaths(leaf('azure'))).toEqual([[]]);
  });
});

describe('describePath', () => {
  it('names the whole shield', () => {
    expect(describePath(tree(), [])).toBe('Whole shield');
  });

  it('names quarters by number', () => {
    expect(describePath(tree(), [0])).toBe('Quarter 1');
    expect(describePath(tree(), [3])).toBe('Quarter 4');
  });

  it('names impaled parts by side, not by number', () => {
    // The label comes from how the *parent* divides, which is why an impaled
    // part is a half and a quartered one is a quarter.
    expect(describePath(tree(), [1, 0])).toBe('Dexter half');
    expect(describePath(tree(), [1, 1])).toBe('Sinister half');
  });
});

describe('samePath', () => {
  it('compares by value, since a path is rebuilt on every render', () => {
    expect(samePath([1, 0], [1, 0])).toBe(true);
    expect(samePath([1, 0], [1, 1])).toBe(false);
    expect(samePath([1], [1, 0])).toBe(false);
    expect(samePath([], [])).toBe(true);
  });
});
