/**
 * Succession, as a pure function (decision D1).
 *
 * The previous implementation walked the descent tree depth-first — correctly —
 * and then sorted the result by generation, which discarded the walk. That one
 * line is the whole bug: it produced an order matching no real system, in which
 * a holder's grandson through his eldest son ranked behind his second son.
 *
 * The rule this implements is the ordinary one:
 *
 *   **A person is immediately followed by their own descendants, before any of
 *   their siblings.** Everything else — male preference, legitimacy, adoption —
 *   decides the order of a sibling set, not the shape of the walk.
 *
 * From that single rule, representation falls out for free. A predeceased heir
 * is walked *through* rather than around, so his children occupy the place he
 * would have held. The old code could not do this at all, because a dead person
 * was flagged excluded and sorted to the end, taking his line's position with
 * him.
 *
 * Deliberately pure and dependency-free: it takes maps and returns an array. No
 * database, no dignity record, no async. That is what makes a rule this fiddly
 * testable at all, and the old one had no tests because it was none of those.
 */

import type { Person, SuccessionRules, SuccessionEntry } from './types';

/** Everything the walk needs, threaded through instead of closed over. */
interface WalkContext {
  people: Map<number, Person>;
  childrenOf: Map<number, number[]>;
  adoptedChildrenOf: Map<number, number[]>;
  adoptedIds: Set<number>;
  malePreference: boolean;
  rules: SuccessionRules;
  maxDepth: number;
  seen: Set<number>;
}

/** An entry before positions are assigned. */
interface PendingEntry {
  personId: number;
  person: Person;
  excluded: boolean;
  exclusionReason: string | null;
  representing: number | null;
  depth: number;
}

/** Sort key for birth order. Unknown dates sort last, not first. */
const birthKey = (person: Person | undefined): number => {
  const year = parseInt(String(person?.dateOfBirth), 10);
  return Number.isFinite(year) ? year : Number.POSITIVE_INFINITY;
};

/**
 * Rank within a sibling set. Lower sorts earlier.
 *
 * Decision D3: adopted children are eligible but rank after natural legitimate
 * issue — the usual compromise, and the least surprising, since an adopted heir
 * normally matters when there is no natural one.
 */
function siblingRank(person: Person, ctx: WalkContext): number {
  const adopted = ctx.adoptedIds.has(person.id);
  const bastard = person.legitimacyStatus === 'bastard'
    && !(person.bastardStatus === 'legitimized' && ctx.rules.legitimizedBastardsEligible);

  if (bastard) return 3;
  if (adopted) return 2;
  return 1;
}

function orderSiblings(ids: number[], ctx: WalkContext): number[] {
  // `.filter(Boolean)` does not narrow the element type, so the predicate is
  // written out. Not ceremony: an id with no matching person is a real state
  // here — the Crown pointed at one for months (decision D4).
  return ids
    .map((id) => ctx.people.get(id))
    .filter((person): person is Person => person !== undefined)
    .sort((a, b) => {
      const rankDiff = siblingRank(a, ctx) - siblingRank(b, ctx);
      if (rankDiff !== 0) return rankDiff;

      // Male preference applies *within* a sibling set only. Applying it
      // globally is what put a daughter behind a distant male cousin.
      if (ctx.malePreference) {
        const aMale = a.gender === 'male';
        const bMale = b.gender === 'male';
        if (aMale !== bMale) return aMale ? -1 : 1;
      }

      return birthKey(a) - birthKey(b);
    })
    .map((p) => p.id);
}

function eligibilityOf(person: Person, ctx: WalkContext): { eligible: boolean; reason: string | null } {
  if (person.legitimacyStatus === 'bastard' && ctx.rules.excludeBastards) {
    const legitimised = person.bastardStatus === 'legitimized'
      && ctx.rules.legitimizedBastardsEligible;
    if (!legitimised) return { eligible: false, reason: 'Illegitimate birth' };
  }
  return { eligible: true, reason: null };
}

/** All children of a person, natural first then adopted (decision D3). */
function childrenOf(personId: number, ctx: WalkContext): number[] {
  const natural = ctx.childrenOf.get(personId) ?? [];
  const adopted = ctx.adoptedChildrenOf.get(personId) ?? [];
  // Deduplicated: a child can hold both a parent and an adopted-parent link.
  return orderSiblings([...new Set([...natural, ...adopted])], ctx);
}

/**
 * Depth-first pre-order walk of a person's descent.
 *
 * `representing` carries the nearest deceased ancestor whose place this person
 * is taking, so the UI can say "in place of his late father" rather than
 * leaving the jump unexplained.
 */
function walkDescent(
  personId: number,
  ctx: WalkContext,
  out: PendingEntry[],
  depth: number,
  representing: number | null
): void {
  if (depth > ctx.maxDepth) return;
  if (ctx.seen.has(personId)) return;
  ctx.seen.add(personId);

  const person = ctx.people.get(personId);
  if (!person) return;

  const deceased = Boolean(person.dateOfDeath);

  if (!deceased) {
    const { eligible, reason } = eligibilityOf(person, ctx);
    out.push({
      personId,
      person,
      excluded: !eligible,
      exclusionReason: reason,
      representing: representing ?? null,
      depth
    });
  }

  // Walked through either way. A dead man is not in the line, but his children
  // stand where he stood — that is representation, and omitting the walk here
  // is precisely what the old implementation got wrong.
  const nextRepresenting = deceased ? (representing ?? personId) : null;
  for (const childId of childrenOf(personId, ctx)) {
    walkDescent(childId, ctx, out, depth + 1, nextRepresenting);
  }
}

/**
 * The line of succession for a holder.
 *
 * Order: the holder's own descent, then their parents' other descent (siblings
 * and theirs), then the grandparents' (uncles, aunts and theirs), outward. That
 * outward sweep is the collateral rule, and it is the same descent walk applied
 * to each ancestor in turn.
 */
export function buildSuccessionLine({
  holderId,
  people,
  childrenOf: childMap,
  parentsOf,
  adoptedChildrenOf = new Map(),
  adoptedIds = new Set(),
  malePreference = false,
  rules = {},
  maxDepth = 10
}: {
  holderId: number;
  people: Map<number, Person>;
  childrenOf: Map<number, number[]>;
  parentsOf: Map<number, number[]>;
  adoptedChildrenOf?: Map<number, number[]>;
  adoptedIds?: Set<number>;
  malePreference?: boolean;
  rules?: SuccessionRules;
  maxDepth?: number;
}): SuccessionEntry[] {
  const holder = people.get(holderId);
  if (!holder) return [];

  const ctx: WalkContext = {
    people,
    childrenOf: childMap,
    adoptedChildrenOf,
    adoptedIds,
    malePreference,
    rules,
    maxDepth,
    seen: new Set([holderId])
  };

  const out: PendingEntry[] = [];

  // 1. The holder's own descent.
  for (const childId of childrenOf(holderId, ctx)) {
    walkDescent(childId, ctx, out, 1, null);
  }

  // 2. Outward through the ancestors: siblings, then uncles and aunts, and so
  //    on. Each ancestor's other children are a sibling set in their own right.
  let generation: number[] = [holderId];
  let rise = 0;

  while (rise < maxDepth && generation.length > 0) {
    const ancestors = [...new Set(generation.flatMap((id) => parentsOf.get(id) ?? []))];
    if (ancestors.length === 0) break;

    for (const ancestorId of ancestors) {
      ctx.seen.add(ancestorId);
      for (const siblingId of childrenOf(ancestorId, ctx)) {
        walkDescent(siblingId, ctx, out, rise + 1, null);
      }
    }

    generation = ancestors;
    rise += 1;
  }

  return out.map((entry, i) => ({
    personId: entry.personId,
    person: entry.person,
    position: i + 1,
    excluded: entry.excluded,
    exclusionReason: entry.exclusionReason,
    representing: entry.representing
  }));
}
