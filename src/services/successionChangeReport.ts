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
 * writes nothing.
 *
 * "Both algorithms" means the corrected rules against `legacySuccession.ts`, a
 * preserved copy of the old one — not against whatever the app currently uses.
 * That distinction is load-bearing: comparing against the live path would
 * compare the new rules with themselves the moment the swap landed, and report
 * that nothing had changed.
 */
import { getDatabase } from './database';
import { getAllDignities, SUCCESSION_TYPES } from './dignityService';
import { legacySuccessionLine } from './legacySuccession';
import {
  buildSuccessionLine,
  buildAgnaticSeniorityLine,
  buildRelationshipMaps
} from '../utils/succession';
import type {
  House,
  Person,
  RelationshipMaps,
  SuccessionEntry
} from '../utils/succession';

// Re-exported because the report's tests cover it and it was defined here
// before the dignity service needed it too (decision D1).
export { buildRelationshipMaps };
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import type { DatasetId, DignityRecord } from './types';

/**
 * The fields both algorithms' entries share.
 *
 * The two lines being compared are genuinely different shapes — the legacy
 * entry carries `relationship` and `branch`, the corrected one carries
 * `representing` and `cadet`. Typing the diff against what they have in common
 * is what makes it honest that the comparison only ever looks at three fields.
 */
interface ComparableEntry {
  personId: number;
  person: Person;
  excluded: boolean;
}

export interface LineDiff {
  changed: boolean;
  firstChangedPosition: number | null;
  heirChanged: boolean;
  heirBefore: string | null;
  heirAfter: string | null;
  added: string[];
  removed: string[];
  beforeTop: string[];
  afterTop: string[];
  countBefore: number;
  countAfter: number;
}

export interface DignityDiff extends LineDiff {
  id: number;
  name: string | undefined;
  successionType: string | undefined;
}

export interface SkippedDignity {
  name: string | undefined;
  reason: string;
}

export interface ReportError {
  name: string | null | undefined;
  error: string;
}

export interface SuccessionChangeReport {
  total: number;
  autoCalculated: number;
  unchanged: number;
  changed: number;
  heirsChanged: number;
  skipped: SkippedDignity[];
  dignities: DignityDiff[];
  errors: ReportError[];
}

export interface CorrectedLineContext {
  people: Map<number, Person>;
  maps: RelationshipMaps;
  houses: House[];
  maxDepth?: number;
}

/** The corrected line for one dignity, using the rules module. */
export function buildCorrectedLine(
  dignity: DignityRecord,
  { people, maps, houses, maxDepth = 10 }: CorrectedLineContext
): SuccessionEntry[] {
  const type = dignity.successionType ? SUCCESSION_TYPES[dignity.successionType] : undefined;
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

const nameOf = (person: Person | undefined): string =>
  [person?.firstName, person?.lastName].filter(Boolean).join(' ') || `#${person?.id ?? '?'}`;

/**
 * Compare two lines and describe the difference in terms a person can check.
 *
 * Reports the *first* position that differs, because that is what a reader
 * actually cares about — "the heir changes" is a different fact from "position
 * nine changes", and burying both in a count would hide it.
 */
function diffLines(before: ComparableEntry[], after: ComparableEntry[]): LineDiff {
  const beforeIds = before.map((c) => c.personId);
  const afterIds = after.map((c) => c.personId);

  const beforeSet = new Set(beforeIds);
  const afterSet = new Set(afterIds);

  const added = after.filter((c) => !beforeSet.has(c.personId));
  const removed = before.filter((c) => !afterSet.has(c.personId));

  let firstChangedPosition: number | null = null;
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
export async function buildSuccessionChangeReport(
  datasetId: DatasetId = null
): Promise<SuccessionChangeReport> {
  const report: SuccessionChangeReport = {
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
      const type = dignity.successionType ? SUCCESSION_TYPES[dignity.successionType] : undefined;

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
        // The *preserved* old algorithm, not the live one. Once the live path
        // was swapped to the corrected rules, comparing against it compared the
        // new rules with themselves and could only ever report "no change".
        const before = legacySuccessionLine(
          dignity, people, maps.parentsOf, maps.childrenOf, maps.spouseMap, 10
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
        report.errors.push({ name: dignity.name, error: errorMessage(error) });
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
    report.errors.push({ name: null, error: errorMessage(error) });
    return report;
  }
}
