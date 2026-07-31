/**
 * What changes if succession is fixed (decision D1).
 *
 * D1 was answered as "correct rules, but show me what moves first". The stated
 * risk is not that the new rules are wrong — it is that the old ones have been
 * displayed for long enough that prose may have been written around them. A
 * line of succession is always *plausible*, so a reordering is not something
 * you notice; it is something you have to be told.
 *
 * This runs both algorithms over every dignity and reports the differences. It
 * writes nothing, and it does not depend on the swap having happened, so it can
 * be run before, during or after.
 */
import { getDatabase } from './database';
import { getAllDignities, SUCCESSION_TYPES, calculateSuccessionLine } from './dignityService';
import { buildSuccessionLine, buildAgnaticSeniorityLine } from '../utils/succession';
import { logger } from '../utils/logger';

/** The relationship maps both algorithms need, built once for the whole run. */
export function buildRelationshipMaps(relationships) {
  const childrenOf = new Map();
  const parentsOf = new Map();
  const spouseMap = new Map();
  const adoptedChildrenOf = new Map();
  const adoptedIds = new Set();

  const push = (map, key, value) => map.set(key, [...(map.get(key) ?? []), value]);

  for (const rel of relationships) {
    if (rel.relationshipType === 'parent') {
      push(parentsOf, rel.person2Id, rel.person1Id);
      push(childrenOf, rel.person1Id, rel.person2Id);
    } else if (rel.relationshipType === 'spouse') {
      spouseMap.set(rel.person1Id, rel.person2Id);
      spouseMap.set(rel.person2Id, rel.person1Id);
    } else if (rel.relationshipType === 'adopted-parent') {
      // Decision D3. These links exist in the schema and the tree, and were
      // invisible to succession entirely — an adopted child inherited only if
      // they happened to also hold a natural parent link.
      push(adoptedChildrenOf, rel.person1Id, rel.person2Id);
      adoptedIds.add(rel.person2Id);
    }
  }

  return { childrenOf, parentsOf, spouseMap, adoptedChildrenOf, adoptedIds };
}

/** The corrected line for one dignity, using the rules module. */
export function buildCorrectedLine(dignity, { people, maps, houses, maxDepth = 10 }) {
  const type = SUCCESSION_TYPES[dignity.successionType];
  if (!type?.autoCalculate || !dignity.currentHolderId) return [];

  if (dignity.successionType === 'agnatic-seniority') {
    return buildAgnaticSeniorityLine({
      holderId: dignity.currentHolderId,
      people,
      houses,
      rules: dignity.successionRules ?? {}
    });
  }

  return buildSuccessionLine({
    holderId: dignity.currentHolderId,
    people,
    childrenOf: maps.childrenOf,
    parentsOf: maps.parentsOf,
    adoptedChildrenOf: maps.adoptedChildrenOf,
    adoptedIds: maps.adoptedIds,
    malePreference: dignity.successionType === 'male-primogeniture',
    rules: dignity.successionRules ?? {},
    maxDepth
  });
}

const nameOf = (person) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(' ') || `#${person?.id ?? '?'}`;

/**
 * Compare two lines and describe the difference in terms a person can check.
 *
 * Reports the *first* position that differs, because that is what a reader
 * actually cares about — "the heir changes" is a different fact from "position
 * nine changes", and burying both in a count would hide it.
 */
function diffLines(before, after) {
  const beforeIds = before.map((c) => c.personId);
  const afterIds = after.map((c) => c.personId);

  const beforeSet = new Set(beforeIds);
  const afterSet = new Set(afterIds);

  const added = after.filter((c) => !beforeSet.has(c.personId));
  const removed = before.filter((c) => !afterSet.has(c.personId));

  let firstChangedPosition = null;
  const limit = Math.max(beforeIds.length, afterIds.length);
  for (let i = 0; i < limit; i++) {
    if (beforeIds[i] !== afterIds[i]) { firstChangedPosition = i + 1; break; }
  }

  const heirBefore = before.find((c) => !c.excluded) ?? null;
  const heirAfter = after.find((c) => !c.excluded) ?? null;

  return {
    changed: firstChangedPosition !== null,
    firstChangedPosition,
    heirChanged: (heirBefore?.personId ?? null) !== (heirAfter?.personId ?? null),
    heirBefore: heirBefore ? nameOf(heirBefore.person) : null,
    heirAfter: heirAfter ? nameOf(heirAfter.person) : null,
    added: added.map((c) => nameOf(c.person)),
    removed: removed.map((c) => nameOf(c.person)),
    beforeTop: before.slice(0, 5).map((c) => nameOf(c.person)),
    afterTop: after.slice(0, 5).map((c) => nameOf(c.person)),
    countBefore: before.length,
    countAfter: after.length
  };
}

/**
 * Run both algorithms over every dignity and report the differences.
 *
 * Read-only. Nothing here can alter a dignity, a person or a line.
 */
export async function buildSuccessionChangeReport(datasetId = null) {
  const report = {
    total: 0,
    autoCalculated: 0,
    unchanged: 0,
    changed: 0,
    heirsChanged: 0,
    skipped: [],
    dignities: [],
    errors: []
  };

  try {
    const db = getDatabase(datasetId);
    const [people, relationships, houses, dignities] = await Promise.all([
      db.people.toArray(),
      db.relationships.toArray(),
      db.houses.toArray(),
      getAllDignities(datasetId)
    ]);

    const peopleById = new Map(people.map((p) => [p.id, p]));
    const maps = buildRelationshipMaps(relationships);
    report.total = dignities.length;

    for (const dignity of dignities) {
      const type = SUCCESSION_TYPES[dignity.successionType];

      // Elective, appointed and conquered dignities have no computed line to
      // change. Listed rather than dropped, so the counts add up.
      if (!type?.autoCalculate) {
        report.skipped.push({ name: dignity.name, reason: dignity.successionType || 'no succession type' });
        continue;
      }
      if (!dignity.currentHolderId || !peopleById.has(dignity.currentHolderId)) {
        report.skipped.push({
          name: dignity.name,
          reason: dignity.currentHolderId ? `holder #${dignity.currentHolderId} does not exist` : 'no holder'
        });
        continue;
      }

      report.autoCalculated++;

      try {
        const before = await calculateSuccessionLine(
          dignity.id, people, maps.parentsOf, maps.childrenOf, maps.spouseMap, 10, datasetId
        );
        const after = buildCorrectedLine(dignity, { people: peopleById, maps, houses });

        const diff = diffLines(before, after);
        if (diff.changed) {
          report.changed++;
          if (diff.heirChanged) report.heirsChanged++;
        } else {
          report.unchanged++;
        }

        report.dignities.push({
          id: dignity.id,
          name: dignity.name,
          successionType: dignity.successionType,
          ...diff
        });
      } catch (error) {
        report.errors.push({ name: dignity.name, error: error.message });
        logger.error(`Could not compare succession for "${dignity.name}":`, error);
      }
    }

    // Most-consequential first: an heir change matters more than a shuffle at
    // position nine, and a reader scanning 26 dignities should meet it first.
    report.dignities.sort((a, b) => {
      if (a.heirChanged !== b.heirChanged) return a.heirChanged ? -1 : 1;
      if (a.changed !== b.changed) return a.changed ? -1 : 1;
      return (a.firstChangedPosition ?? 99) - (b.firstChangedPosition ?? 99);
    });

    logger.log(
      `👑 Succession change report: ${report.changed} of ${report.autoCalculated} lines change, ` +
      `${report.heirsChanged} of them at the heir`
    );

    return report;
  } catch (error) {
    logger.error('Could not build the succession change report:', error);
    report.errors.push({ name: null, error: error.message });
    return report;
  }
}
