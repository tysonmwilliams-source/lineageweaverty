/**
 * Who counts as "the dynasty" (decision D2).
 *
 * Agnatic seniority passes a dignity to the oldest male of the dynasty — uncle
 * before nephew — and the previous implementation resolved "the dynasty" as
 * `p.houseId === holder.houseId`. That silently excluded every cadet branch,
 * which is precisely the population this system exists to include: a junior
 * line is still of the dynasty, and its senior man may well be the oldest.
 *
 * The house tree already says so. `parentHouseId` exists to record that a house
 * is a cadet branch of another, alongside `cadetTier` and `foundingType`. So
 * the dynasty is a house *and everything descended from it*, and this walks
 * that tree rather than comparing one field.
 */

import type { Person, House, SuccessionRules, SuccessionEntry } from './types';

/**
 * Every house id in the dynasty rooted at `houseId`, including itself.
 *
 * Cycle-safe: a house tree edited by hand can end up with a loop, and an
 * unguarded walk would hang the succession panel rather than report anything.
 */
export function collectDynastyHouses(
  houseId: number | null | undefined,
  houses: House[]
): Set<number> {
  if (houseId === null || houseId === undefined) return new Set();

  const childrenByParent = new Map<number, number[]>();
  for (const house of houses) {
    if (house.parentHouseId === null || house.parentHouseId === undefined) continue;
    const siblings = childrenByParent.get(house.parentHouseId) ?? [];
    siblings.push(house.id);
    childrenByParent.set(house.parentHouseId, siblings);
  }

  const dynasty = new Set<number>();
  const queue: number[] = [houseId];

  while (queue.length > 0) {
    const current = queue.shift() as number;
    if (dynasty.has(current)) continue;
    dynasty.add(current);
    for (const child of childrenByParent.get(current) ?? []) queue.push(child);
  }

  return dynasty;
}

/**
 * The line under agnatic seniority: living men of the dynasty, eldest first.
 *
 * Seniority is by age, not by descent, so there is no tree walk here — the
 * order really is "oldest first". That is what makes an uncle outrank a nephew.
 */
export function buildAgnaticSeniorityLine({
  holderId,
  people,
  houses = [],
  rules = {}
}: {
  holderId: number;
  people: Map<number, Person>;
  houses?: House[];
  rules?: SuccessionRules;
}): SuccessionEntry[] {
  const holder = people.get(holderId);
  if (!holder) return [];

  const dynasty = collectDynastyHouses(holder.houseId, houses);

  const candidates = [...people.values()]
    .filter((person) => (
      person.id !== holderId
      && person.gender === 'male'
      && !person.dateOfDeath
      && person.houseId !== null
      && person.houseId !== undefined
      && dynasty.has(person.houseId)
    ))
    .sort((a, b) => {
      const aYear = parseInt(String(a.dateOfBirth), 10);
      const bYear = parseInt(String(b.dateOfBirth), 10);
      // Unknown birth years sort last: an undated man cannot be shown as the
      // senior of the dynasty on the strength of having no date.
      const aKey = Number.isFinite(aYear) ? aYear : Number.POSITIVE_INFINITY;
      const bKey = Number.isFinite(bYear) ? bYear : Number.POSITIVE_INFINITY;
      return aKey - bKey;
    });

  return candidates.map((person, i) => {
    const bastard = person.legitimacyStatus === 'bastard'
      && !(person.bastardStatus === 'legitimized' && rules.legitimizedBastardsEligible);
    const excluded = bastard && Boolean(rules.excludeBastards);

    return {
      personId: person.id,
      person,
      position: i + 1,
      excluded,
      exclusionReason: excluded ? 'Illegitimate birth' : null,
      representing: null,
      // Surfaced so the UI can say why a man from another house is in this
      // line at all — which is the whole point of decision D2.
      cadet: person.houseId !== holder.houseId
    };
  });
}
