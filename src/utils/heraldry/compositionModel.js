/**
 * The recursive composition model (decision C3).
 *
 * A coat of arms used to be exactly one thing: a field, up to three ordinaries
 * and up to three charges. That shape cannot express marshalling — combining
 * two or more complete coats into one shield — which is what impalement
 * (marriage) and quartering (descent) are. For a genealogy app that is the
 * central heraldic operation, so the model has to become a tree.
 *
 * A node is one of two things:
 *
 *   plain       a leaf. Exactly what version 2 stored: field + ordinaries +
 *               charges. Every existing coat of arms is a single plain node.
 *
 *   marshalled  a branch. Divides the shield into N parts, each of which holds
 *               another node — which may itself be marshalled. That recursion
 *               is the whole point: a quarter containing a quartered coat is a
 *               "grand quarter", and it is ordinary in real armory.
 *
 * Cadency stays on the composition rather than on a node, because a cadency
 * mark brands the whole achievement, not one quarter of it.
 */

export const COMPOSITION_VERSION = 3;

/**
 * How a marshalled node divides its shield, and how many parts that requires.
 *
 * `order` documents the heraldic numbering, which is not reading order in the
 * way a naive implementation would assume — quarters are numbered dexter chief,
 * sinister chief, dexter base, sinister base, and "dexter" is the *bearer's*
 * right, so quarter 1 is on the viewer's left.
 */
export const MARSHALLING = {
  impaled: {
    label: 'Impaled',
    parts: 2,
    order: ['dexter', 'sinister'],
    description: 'Two coats side by side, divided per pale. How a marriage is borne.'
  },
  quartered: {
    label: 'Quartered',
    parts: 4,
    order: ['dexter chief', 'sinister chief', 'dexter base', 'sinister base'],
    description: 'Four quarters, numbered from the bearer\'s right. How descent is borne.'
  }
};

/**
 * Nesting cap.
 *
 * Real armory nests — grand quarters are normal, and a few historical coats go
 * further. This is not a heraldic limit but an engineering one: depth is
 * multiplicative in the render pipeline (a depth-5 quartered coat is 1,024
 * leaves), and a cycle introduced by a bad edit would otherwise hang the
 * renderer rather than fail. Four levels covers everything a novelist will
 * plausibly draw.
 */
export const MAX_MARSHALLING_DEPTH = 4;

export const DEFAULT_FIELD = {
  division: 'plain',
  tincture1: 'azure',
  tincture2: 'or',
  tincture3: 'gules',
  lineStyle: 'straight',
  count: 6,
  inverted: false
};

export function createPlainNode({ field, ordinaries, charges } = {}) {
  return {
    type: 'plain',
    field: { ...DEFAULT_FIELD, ...(field || {}) },
    ordinaries: Array.isArray(ordinaries) ? ordinaries : [],
    charges: Array.isArray(charges) ? charges : []
  };
}

export function createMarshalledNode(arrangement, parts) {
  return { type: 'marshalled', arrangement, parts: parts || [] };
}

export const isPlainNode = (node) => node?.type === 'plain';
export const isMarshalledNode = (node) => node?.type === 'marshalled';

/**
 * Every plain node in the tree, in heraldic order.
 *
 * This is the function a renderer wants: it turns "draw this coat" back into
 * the flat list of leaves the existing pipeline already knows how to draw.
 */
export function collectLeaves(node, out = []) {
  if (isPlainNode(node)) {
    out.push(node);
  } else if (isMarshalledNode(node)) {
    for (const part of node.parts || []) collectLeaves(part, out);
  }
  return out;
}

/** How deep the tree goes. A single plain node is depth 1. */
export function compositionDepth(node) {
  if (isPlainNode(node)) return 1;
  if (!isMarshalledNode(node)) return 0;
  const parts = node.parts || [];
  if (parts.length === 0) return 1;
  return 1 + Math.max(...parts.map(compositionDepth));
}

/** True when the coat is a single undivided leaf — i.e. everything drawn so far. */
export function isSimpleComposition(composition) {
  return isPlainNode(composition?.root);
}

function validateNode(node, path, depth, errors) {
  if (!node || typeof node !== 'object') {
    errors.push(`${path}: expected a node object, got ${node === null ? 'null' : typeof node}`);
    return;
  }

  if (depth > MAX_MARSHALLING_DEPTH) {
    errors.push(`${path}: nested deeper than ${MAX_MARSHALLING_DEPTH} levels`);
    return;
  }

  if (isPlainNode(node)) {
    if (!node.field || typeof node.field !== 'object') {
      errors.push(`${path}: a plain node needs a field`);
    }
    if (!Array.isArray(node.ordinaries)) errors.push(`${path}: ordinaries must be an array`);
    if (!Array.isArray(node.charges)) errors.push(`${path}: charges must be an array`);
    return;
  }

  if (!isMarshalledNode(node)) {
    errors.push(`${path}: unknown node type "${node.type}"`);
    return;
  }

  const spec = MARSHALLING[node.arrangement];
  if (!spec) {
    errors.push(`${path}: unknown marshalling arrangement "${node.arrangement}"`);
    return;
  }

  const parts = node.parts;
  if (!Array.isArray(parts)) {
    errors.push(`${path}: marshalled parts must be an array`);
    return;
  }

  // An arrangement with the wrong number of parts is the failure that renders
  // as a silently half-empty shield, so it is an error rather than a fill.
  if (parts.length !== spec.parts) {
    errors.push(`${path}: ${node.arrangement} needs exactly ${spec.parts} parts, got ${parts.length}`);
  }

  parts.forEach((part, i) => validateNode(part, `${path}.parts[${i}]`, depth + 1, errors));
}

/**
 * Structural validation. Returns `{ valid, errors }` rather than throwing,
 * because the caller is usually a migration deciding whether to write a record.
 */
export function validateComposition(composition) {
  const errors = [];

  if (composition === null || composition === undefined) {
    // A coat with no composition is legitimate — uploaded and generated arms
    // have imagery but were never built in the creator.
    return { valid: true, errors };
  }

  if (typeof composition !== 'object') {
    return { valid: false, errors: ['composition must be an object or null'] };
  }

  if (composition.version !== COMPOSITION_VERSION) {
    errors.push(`expected version ${COMPOSITION_VERSION}, got ${composition.version}`);
  }

  validateNode(composition.root, 'root', 1, errors);

  return { valid: errors.length === 0, errors };
}
