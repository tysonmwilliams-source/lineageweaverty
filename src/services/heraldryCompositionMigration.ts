/**
 * Persists the composition migration to version 3 (decision C3).
 *
 * Lives here rather than in `migrationService.js` because that file is already
 * 1,412 lines against a 400-line convention, and CLAUDE.md says to extract
 * rather than add to oversized files.
 *
 * This rewrites saved coats of arms — hand-drawn creative work with no source
 * to regenerate from — so it is deliberately conservative:
 *
 *   - **Dry run by default.** Nothing is written unless the caller asks. The
 *     report is the primary product; the write is the secondary one.
 *   - **Validate before writing.** A record whose migrated form fails
 *     validation is left alone and reported, never written.
 *   - **Skip what does not need it.** Every heraldry write is also a Firestore
 *     write, so migrating an already-migrated row costs a sync for nothing.
 *   - **Never invent a composition.** Uploaded and generated arms have imagery
 *     and no composition; they stay that way.
 *
 * It does NOT run automatically. Migrations in this codebase are invoked
 * explicitly (see CLAUDE.md), and this one especially should be run once,
 * deliberately, after reading its dry-run report.
 */
import { getAllHeraldry, updateHeraldry } from './heraldryService';
import {
  migrateComposition,
  classifyComposition,
  validateComposition,
  COMPOSITION_VERSION
} from '../utils/heraldry';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import type { StoredComposition } from '../utils/heraldry/types';
import type { DatasetId, HeraldryRecord, UserId } from './types';

/** Which record a report line is about. A null id means the whole read failed. */
interface RecordLabel {
  heraldryId: number | null;
  name?: string | null;
}

export interface MigrationFailure extends RecordLabel {
  error: string;
}

export interface RecoveredOrdinary extends RecordLabel {
  ordinary: string | undefined;
}

export interface UnmigratedKeys extends RecordLabel {
  keys: string[];
}

export interface HeraldryMigrationReport {
  apply: boolean;
  targetVersion: number;
  total: number;
  migrated: number;
  alreadyCurrent: number;
  noComposition: number;
  failed: number;
  /** Records where the migration recovered an ordinary the old loader dropped. */
  recoveredOrdinaries: RecoveredOrdinary[];
  /** Records carrying keys the migration did not understand. */
  withUnmigratedKeys: UnmigratedKeys[];
  errors: MigrationFailure[];
}

export interface MigrationOptions {
  /** Dataset to migrate. Defaults to the active default. */
  datasetId?: DatasetId;
  /**
   * Passed to updateHeraldry so writes sync to the cloud. Applying without it
   * rewrites every record locally while the cloud keeps the old copies, and the
   * next download silently undoes the migration.
   */
  userId?: UserId;
  /** Write the changes. Omit for a dry run. */
  apply?: boolean;
}

/**
 * Migrate every heraldry record in a dataset to composition version 3.
 *
 * @returns A report — counts, per-record detail, and errors.
 */
export async function migrateHeraldryCompositions({
  datasetId = null,
  userId = null,
  apply = false
}: MigrationOptions = {}): Promise<HeraldryMigrationReport> {
  const report: HeraldryMigrationReport = {
    apply,
    targetVersion: COMPOSITION_VERSION,
    total: 0,
    migrated: 0,
    alreadyCurrent: 0,
    noComposition: 0,
    failed: 0,
    recoveredOrdinaries: [],
    withUnmigratedKeys: [],
    errors: []
  };

  logger.log(`🛡️ Heraldry composition migration (${apply ? 'APPLYING' : 'dry run'})…`);

  let records: HeraldryRecord[];
  try {
    records = await getAllHeraldry(datasetId);
  } catch (error) {
    logger.error('❌ Could not read heraldry records:', error);
    report.errors.push({ heraldryId: null, name: null, error: errorMessage(error) });
    return report;
  }

  report.total = records.length;

  for (const record of records) {
    const label: RecordLabel = { heraldryId: record.id, name: record.name };

    try {
      const kind = classifyComposition(record.composition);

      if (kind === 'absent') {
        report.noComposition++;
        continue;
      }

      // Reported rather than counted as healthy. A single boolean used to
      // collapse this case into "already current", so a corrupt record looked
      // like a migrated one.
      if (kind === 'malformed') {
        report.failed++;
        report.errors.push({
          ...label,
          error: `composition is ${Array.isArray(record.composition) ? 'an array' : typeof record.composition}, not an object — left untouched for review`
        });
        continue;
      }

      if (kind === 'current') {
        report.alreadyCurrent++;
        continue;
      }

      const composition: StoredComposition | null = migrateComposition(record.composition);

      // Unreachable as written: `absent` and `malformed` are the only inputs
      // that make migrateComposition return null, and both are handled above.
      // It is a guard rather than a non-null assertion because the failure it
      // prevents is silent — `validateComposition(null)` answers *valid*, so a
      // future change to either function would write `composition: null` over a
      // drawn coat and report it as a successful migration.
      if (!composition) {
        report.failed++;
        report.errors.push({ ...label, error: 'migration returned no composition' });
        continue;
      }

      const { valid, errors } = validateComposition(composition);
      if (!valid) {
        report.failed++;
        report.errors.push({ ...label, error: `migrated form failed validation: ${errors.join('; ')}` });
        continue;
      }

      // Worth surfacing: this is the band the previous migration silently
      // dropped, so the owner should know which coats gained one back.
      const ordinaries = composition.root?.ordinaries;
      if (ordinaries && ordinaries.length > 0 && !record.composition?.ordinaries) {
        report.recoveredOrdinaries.push({
          ...label,
          ordinary: ordinaries[0]?.type
        });
      }

      if (composition.unmigrated) {
        report.withUnmigratedKeys.push({ ...label, keys: Object.keys(composition.unmigrated) });
      }

      if (apply) {
        await updateHeraldry(record.id, { composition }, userId, datasetId);
      }

      report.migrated++;
    } catch (error) {
      report.failed++;
      report.errors.push({ ...label, error: errorMessage(error) });
      logger.error(`❌ Failed to migrate heraldry ${record.id} ("${record.name}"):`, error);
    }
  }

  logger.log(
    `🛡️ ${apply ? 'Migrated' : 'Would migrate'} ${report.migrated} of ${report.total} — ` +
    `${report.alreadyCurrent} already current, ${report.noComposition} without composition, ` +
    `${report.failed} failed`
  );
  if (report.recoveredOrdinaries.length > 0) {
    logger.log(`🛡️ Recovered ${report.recoveredOrdinaries.length} ordinaries the legacy loader dropped`);
  }

  return report;
}

/**
 * Whether anything in this dataset would change.
 *
 * Cheap enough to call before offering the migration in a UI, and it reads
 * rather than writes, so it is safe to call on every load.
 */
export async function heraldryNeedsCompositionMigration(
  datasetId: DatasetId = null
): Promise<boolean> {
  try {
    const records: HeraldryRecord[] = await getAllHeraldry(datasetId);
    return records.some((record) => classifyComposition(record.composition) === 'legacy');
  } catch (error) {
    logger.error('❌ Could not check heraldry composition versions:', error);
    return false;
  }
}
