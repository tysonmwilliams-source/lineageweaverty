/**
 * personRelations.js
 *
 * Derives the immediate family around one person from the tree's existing lookup
 * maps — parents, spouses, siblings, children — in the order a reader expects.
 *
 * Extracted as a pure function rather than living inside the list view because
 * every part of it can be subtly wrong in a way the UI won't reveal: a
 * half-sibling that looks full, a spouse that appears twice, children in
 * arbitrary order. It is unit-tested.
 *
 * Note on maps: `buildRelationshipMaps` collapses `parent` and `adopted-parent`
 * into the same parentMap/childrenMap, so an adopted child is indistinguishable
 * here. That is the tree's existing behaviour and this deliberately matches it —
 * diverging would make the list disagree with the canvas. Distinguishing them is
 * audit decision D3.
 */

/** Sort helper: by birth year when both have one, then by name. */
function byBirthThenName(peopleById) {
  return (a, b) => {
    const pa = peopleById.get(a);
    const pb = peopleById.get(b);
    const ya = parseInt(pa?.dateOfBirth, 10);
    const yb = parseInt(pb?.dateOfBirth, 10);
    const aHas = Number.isFinite(ya);
    const bHas = Number.isFinite(yb);

    if (aHas && bHas && ya !== yb) return ya - yb;
    // People with a known year sort before those without, so an undated person
    // doesn't land in the middle of a dated sibling set.
    if (aHas !== bHas) return aHas ? -1 : 1;

    const na = `${pa?.firstName || ''} ${pa?.lastName || ''}`.trim();
    const nb = `${pb?.firstName || ''} ${pb?.lastName || ''}`.trim();
    return na.localeCompare(nb);
  };
}

/**
 * Every spouse of a person.
 *
 * `spouseMap` holds only one spouse per person — it is a flat Map, so a second
 * marriage overwrites the first. That's the known single-spouse limitation
 * (decision C6). Relationships are scanned directly here so the list shows all
 * marriages even though the canvas can only draw one; a widowed-and-remarried
 * person is common enough in a genealogy that hiding it would be a real loss.
 *
 * @param {number} personId
 * @param {Array} relationships - Raw relationship rows
 * @param {Map} peopleById
 * @returns {Array<{id: number, relationship: Object}>}
 */
export function getSpouses(personId, relationships, peopleById) {
  const seen = new Set();
  const out = [];

  for (const rel of relationships || []) {
    if (rel.relationshipType !== 'spouse') continue;

    let otherId = null;
    if (rel.person1Id === personId) otherId = rel.person2Id;
    else if (rel.person2Id === personId) otherId = rel.person1Id;
    if (otherId === null) continue;

    if (!peopleById.has(otherId) || seen.has(otherId)) continue;
    seen.add(otherId);
    out.push({ id: otherId, relationship: rel });
  }

  return out;
}

/**
 * Siblings, split by whether they share both parents or one.
 *
 * @returns {{full: number[], half: number[]}}
 */
export function getSiblings(personId, parentMap, childrenMap, peopleById) {
  const myParents = (parentMap.get(personId) || []).filter(id => peopleById.has(id));
  if (myParents.length === 0) return { full: [], half: [] };

  // Count how many of my parents each candidate shares.
  const shared = new Map();
  for (const parentId of myParents) {
    for (const childId of childrenMap.get(parentId) || []) {
      if (childId === personId || !peopleById.has(childId)) continue;
      shared.set(childId, (shared.get(childId) || 0) + 1);
    }
  }

  const full = [];
  const half = [];
  for (const [childId, count] of shared) {
    // "Full" only means it when I actually have two known parents. With one
    // known parent everything is a half-sibling as far as the data can say.
    if (myParents.length >= 2 && count >= 2) full.push(childId);
    else half.push(childId);
  }

  const sort = byBirthThenName(peopleById);
  return { full: full.sort(sort), half: half.sort(sort) };
}

/**
 * The full immediate-family model for one person.
 *
 * @param {number} personId
 * @param {Object} maps - from buildRelationshipMaps
 * @param {Array} relationships - Raw relationship rows, for multiple spouses
 * @returns {Object|null} null when the person doesn't exist
 */
export function getPersonRelations(personId, maps, relationships) {
  const { peopleById, parentMap, childrenMap } = maps;
  const person = peopleById.get(personId);
  if (!person) return null;

  const sort = byBirthThenName(peopleById);

  const parents = (parentMap.get(personId) || [])
    .filter(id => peopleById.has(id))
    .sort(sort);

  const children = (childrenMap.get(personId) || [])
    .filter(id => peopleById.has(id))
    .sort(sort);

  const spouses = getSpouses(personId, relationships, peopleById);
  const { full, half } = getSiblings(personId, parentMap, childrenMap, peopleById);

  return {
    person,
    parents,
    spouses,
    siblings: full,
    halfSiblings: half,
    children,
    // Cheap emptiness check for the empty state, so callers don't repeat it.
    isIsolated:
      parents.length === 0 &&
      spouses.length === 0 &&
      full.length === 0 &&
      half.length === 0 &&
      children.length === 0
  };
}

/**
 * A parental label, where the data supports one.
 *
 * Returns 'Father'/'Mother' from the parent's own gender, and a neutral 'Parent'
 * when gender is unset — rather than guessing from position in the array, which
 * carries no meaning.
 */
export function parentLabel(parent) {
  if (parent?.gender === 'male') return 'Father';
  if (parent?.gender === 'female') return 'Mother';
  return 'Parent';
}

export default { getPersonRelations, getSpouses, getSiblings, parentLabel };
