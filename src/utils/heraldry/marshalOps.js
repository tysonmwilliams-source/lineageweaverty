/**
 * Dividing and undividing a coat (decision C3, step 5d).
 *
 * These are the two edits the tree UI makes to the *shape* of a composition, as
 * opposed to the contents of a single coat. Both are pure and both are
 * deliberately conservative about the user's existing work.
 */
import {
  MARSHALLING,
  createPlainNode,
  createMarshalledNode,
  isMarshalledNode,
  collectLeaves,
  compositionDepth,
  MAX_MARSHALLING_DEPTH
} from './compositionModel';

/**
 * Divide a node into an impalement or a quartering.
 *
 * The node being divided becomes the **first** part, and the remaining parts
 * start blank. That is the behaviour that matches what the user is doing: they
 * have drawn a coat and now want to marshal something with it, so their work
 * belongs in the senior position — dexter for an impalement, quarter 1 for a
 * quartering — and nothing they drew is discarded.
 */
export function divideNode(node, arrangement) {
  const spec = MARSHALLING[arrangement];
  if (!spec) throw new Error(`Unknown marshalling arrangement "${arrangement}"`);

  const parts = [node];
  while (parts.length < spec.parts) parts.push(createPlainNode());

  return createMarshalledNode(arrangement, parts);
}

/**
 * Collapse a marshalled node back to a single coat.
 *
 * Returns the first part, because that is where `divideNode` put the coat the
 * user already had — so dividing and immediately undividing gets them back
 * exactly where they started. Anything in the other parts is lost, which is why
 * `undivideLoses` exists: the UI is expected to say so first.
 */
export function undivideNode(node) {
  if (!isMarshalledNode(node)) return node;
  return node.parts?.[0] ?? createPlainNode();
}

/**
 * How many coats would be discarded by undividing this node.
 *
 * Counts leaves rather than parts, so collapsing a quarter that is itself
 * quartered reports all of what is inside it, not just "3".
 */
export function undivideLoses(node) {
  if (!isMarshalledNode(node)) return 0;
  const kept = collectLeaves(node.parts?.[0] ?? null).length;
  return collectLeaves(node).length - kept;
}

/**
 * Whether this node can be divided again.
 *
 * The depth cap is an engineering limit, not a heraldic one — depth is
 * multiplicative in the renderer, and the model refuses to validate past it.
 * Checking here lets the UI disable the control rather than letting the user
 * build something that will not save.
 */
export function canDivide(root, path = []) {
  const depthAtNode = path.length + 1;
  return depthAtNode < MAX_MARSHALLING_DEPTH;
}

/** True when the whole shield is a single undivided coat. */
export function isUndivided(root) {
  return !isMarshalledNode(root);
}

export { compositionDepth };
