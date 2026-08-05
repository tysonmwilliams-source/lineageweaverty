/**
 * The shapes the heraldry composition model stores (decision F4).
 *
 * The handoff said these types "already exist in `utils/heraldry`". They did
 * not — the whole module is plain `.js` with no JSDoc typedefs. This file is
 * that claim made true, written narrow in the beachhead's style: it describes
 * the fields code actually reads, not every key a drawn coat can carry.
 *
 * One thing worth understanding before widening any of this. A stored
 * composition can be **any of three versions** — v1 and v2 are flat (`field`,
 * `ordinaries`, `charges` at the top level), v3 is a recursive tree under
 * `root` (decision C3). Readers accept all three on purpose, so the stored
 * shape is a union rather than a single record, and the optional keys below are
 * optional because of *which version* they came from, not because they are
 * incidental. `readComposition` and `migrateComposition` are what turn this
 * into something uniform; type against their output, not against this, wherever
 * you can.
 */

/** One node of a v3 composition tree: a plain coat, or a divided one with parts. */
export interface CompositionNode {
  type?: string;
  field?: unknown;
  ordinaries?: Array<{ type?: string; [key: string]: unknown }>;
  charges?: unknown[];
  parts?: CompositionNode[];
  [key: string]: unknown;
}

/**
 * A composition as it comes off a stored record, in any version.
 *
 * `root` present means v3. `field`/`ordinaries`/`charges` at the top level mean
 * v1 or v2. Use `classifyComposition` rather than sniffing these by hand.
 */
export interface StoredComposition {
  version?: number;
  /** v3 only — the recursive tree. */
  root?: CompositionNode;
  cadency?: unknown;
  generatedAt?: string;
  /** Keys the migration did not recognise, preserved rather than dropped. */
  unmigrated?: Record<string, unknown>;
  /** v1/v2 only — flat, superseded by `root`. */
  field?: unknown;
  ordinaries?: unknown[];
  charges?: unknown[];
  [key: string]: unknown;
}
