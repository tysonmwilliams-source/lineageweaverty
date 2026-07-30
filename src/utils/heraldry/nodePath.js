/**
 * Addressing a node inside a composition tree (decision C3, step 5c).
 *
 * A path is an array of part indices from the root: `[]` is the whole shield,
 * `[0]` is its first part, `[0, 2]` the third part of that first part. It is
 * deliberately plain data — it survives being held in component state, compared
 * with `===` on its string form, and logged.
 *
 * Every function here is immutable. The editor replaces a node by rebuilding
 * the spine above it, which is what lets React see a changed root and what
 * stops an edit to one quarter silently aliasing into another.
 */
import { isMarshalledNode } from './compositionModel';

/** The node at `path`, or null if the path does not lead anywhere. */
export function getNodeAtPath(root, path = []) {
  let node = root;
  for (const index of path) {
    if (!isMarshalledNode(node)) return null;
    node = node.parts?.[index];
    if (!node) return null;
  }
  return node ?? null;
}

/**
 * A copy of the tree with the node at `path` replaced.
 *
 * Nodes off the path are carried over by reference, not cloned: a quarter the
 * user did not touch should stay identical so that memoised rendering can skip
 * it. Only the spine from the root down to the edit is rebuilt.
 */
export function setNodeAtPath(root, path, nextNode) {
  if (!path || path.length === 0) return nextNode;

  const [index, ...rest] = path;
  if (!isMarshalledNode(root)) return root;

  const parts = root.parts ?? [];
  if (index < 0 || index >= parts.length) return root;

  const updatedChild = setNodeAtPath(parts[index], rest, nextNode);

  // Nothing below actually changed — a path that ran through a leaf, or off the
  // end. Returning a fresh object here would signal a change that did not
  // happen, re-rendering the shield and defeating the identity checks this
  // function exists to support.
  if (updatedChild === parts[index]) return root;

  const updated = [...parts];
  updated[index] = updatedChild;
  return { ...root, parts: updated };
}

/**
 * The nearest path that still resolves, walking up from `path`.
 *
 * Needed because a path can outlive the shape it referred to: un-marshalling a
 * quarter while it is selected leaves the selection pointing into a node that
 * no longer has parts. Without this the editor renders nothing and looks broken.
 */
export function clampPath(root, path = []) {
  const safe = [];
  let node = root;

  for (const index of path) {
    if (!isMarshalledNode(node)) break;
    const next = node.parts?.[index];
    if (!next) break;
    safe.push(index);
    node = next;
  }

  return safe;
}

/** Every path in the tree, root first, in heraldic order. */
export function listPaths(node, prefix = [], out = []) {
  out.push(prefix);
  if (isMarshalledNode(node)) {
    (node.parts ?? []).forEach((part, i) => listPaths(part, [...prefix, i], out));
  }
  return out;
}

/**
 * A human label for a path, for breadcrumbs.
 *
 * Uses the arrangement of the *parent* to name the part, because "quarter 2"
 * and "sinister half" are properties of how the parent divides, not of the
 * child itself.
 */
export function describePath(root, path = []) {
  if (!path || path.length === 0) return 'Whole shield';

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const parent = getNodeAtPath(root, parentPath);

  if (!isMarshalledNode(parent)) return `Part ${index + 1}`;
  if (parent.arrangement === 'impaled') return index === 0 ? 'Dexter half' : 'Sinister half';
  return `Quarter ${index + 1}`;
}

/** Path equality, for selection state. */
export const samePath = (a = [], b = []) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
