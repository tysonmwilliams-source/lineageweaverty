/**
 * Dry-run report for the composition migration (decision C3, step 1).
 *
 * A development-only panel. The migration rewrites hand-drawn coats of arms
 * with no source to regenerate from, and it will visibly change some of them —
 * it restores ordinaries that the legacy loader was silently dropping. That is
 * a fix, but a fix to creative work should be previewed before it is applied,
 * and there is no other way to preview it: the composition data lives in
 * IndexedDB behind the sign-in, so it cannot be inspected from a terminal.
 *
 * This panel only ever reads. There is deliberately no "apply" button —
 * applying belongs with step 3, once the read path understands version 3, so
 * that a migrated record has something that can render it.
 */
import { useState } from 'react';
import { migrateHeraldryCompositions } from '../../services/heraldryCompositionMigration';
import { useDataset } from '../../contexts/DatasetContext';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../icons';
import { logger } from '../../utils/logger';
import './CompositionMigrationPanel.css';

function Stat({ label, value, tone }) {
  return (
    <div className={`composition-migration__stat${tone ? ` composition-migration__stat--${tone}` : ''}`}>
      <span className="composition-migration__stat-value">{value}</span>
      <span className="composition-migration__stat-label">{label}</span>
    </div>
  );
}

function CompositionMigrationPanel() {
  const { activeDataset } = useDataset();
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingApply, setConfirmingApply] = useState(false);

  const run = async ({ apply }) => {
    setRunning(true);
    setError(null);
    setConfirmingApply(false);
    try {
      // For a dry run `apply` is omitted entirely rather than passed as false,
      // so the service's own default is what protects the data.
      const result = await migrateHeraldryCompositions({
        datasetId: activeDataset?.id,
        // updateHeraldry only syncs when it is given a userId, and this repo's
        // conflict resolution is last-write-wins. Without this, applying would
        // rewrite 33 records locally and leave the cloud holding the old ones,
        // so the next download would quietly undo the migration.
        userId: user?.uid ?? null,
        ...(apply ? { apply: true } : {})
      });
      setReport(result);
    } catch (err) {
      logger.error(`Composition migration ${apply ? 'apply' : 'dry run'} failed:`, err);
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const applied = report?.apply === true;
  const canApply = report && !applied && report.migrated > 0;

  return (
    <section className="composition-migration">
      <header className="composition-migration__header">
        <Icon name="shield" size={18} className="composition-migration__icon" />
        <div>
          <h2 className="composition-migration__title">Composition migration — dry run</h2>
          <p className="composition-migration__subtitle">
            Development only. Reads your arms and reports what would change. Writes nothing.
          </p>
        </div>
        <button
          className="composition-migration__run"
          onClick={() => run({ apply: false })}
          disabled={running}
        >
          <Icon name={running ? 'loader-2' : 'play'} size={16} className={running ? 'is-spinning' : undefined} />
          <span>{running ? 'Reading…' : 'Run dry run'}</span>
        </button>
      </header>

      {error && (
        <p className="composition-migration__error">
          <Icon name="x-circle" size={14} /> {error}
        </p>
      )}

      {/* Deliberately unanimated. A debug panel does not need framer-motion,
          and importing it here would add a `no-unused-vars` warning to the lint
          gate — this repo has no eslint-plugin-react, so `motion.div` in JSX
          does not register as a use of `motion`. */}
      {report && (
        <div className="composition-migration__report">
            <div className="composition-migration__stats">
              <Stat label="arms total" value={report.total} />
              <Stat label="would migrate" value={report.migrated} tone={report.migrated > 0 ? 'change' : undefined} />
              <Stat label="already current" value={report.alreadyCurrent} />
              <Stat label="no composition" value={report.noComposition} />
              <Stat label="failed" value={report.failed} tone={report.failed > 0 ? 'bad' : undefined} />
            </div>

            {/* The headline finding. These are the shields that will look
                different afterwards, because a band comes back. */}
            {report.recoveredOrdinaries.length > 0 && (
              <div className="composition-migration__group composition-migration__group--change">
                <h3>
                  <Icon name="alert-triangle" size={14} />
                  {report.recoveredOrdinaries.length} coat(s) would visibly change
                </h3>
                <p>
                  These carry an ordinary that the old loader dropped, so the band is
                  missing from what you see today and would come back.
                </p>
                <ul>
                  {report.recoveredOrdinaries.map((item) => (
                    <li key={item.heraldryId}>
                      <strong>{item.name}</strong> — gains a <em>{item.ordinary}</em>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.withUnmigratedKeys.length > 0 && (
              <div className="composition-migration__group">
                <h3><Icon name="info" size={14} /> Unrecognised data, preserved</h3>
                <ul>
                  {report.withUnmigratedKeys.map((item) => (
                    <li key={item.heraldryId}>
                      <strong>{item.name}</strong> — {item.keys.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.errors.length > 0 && (
              <div className="composition-migration__group composition-migration__group--bad">
                <h3><Icon name="x-circle" size={14} /> Left untouched for review</h3>
                <ul>
                  {report.errors.map((item, i) => (
                    <li key={item.heraldryId ?? i}>
                      <strong>{item.name || 'unknown'}</strong> — {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.migrated === 0 && report.failed === 0 && (
              <p className="composition-migration__clean">
                <Icon name="check-circle" size={14} /> Nothing to migrate.
              </p>
            )}

            {applied ? (
              <p className="composition-migration__clean">
                <Icon name="check-circle" size={14} />
                Applied. {report.migrated} record(s) rewritten to version 3.
              </p>
            ) : canApply && (
              /* Two-step on purpose. This is the only control in the app that
                 rewrites saved coats of arms, and a single click next to a
                 "Run dry run" button is too easy to hit by accident. */
              <div className="composition-migration__apply">
                {confirmingApply ? (
                  <>
                    <span className="composition-migration__apply-warning">
                      <Icon name="alert-triangle" size={14} />
                      Rewrite {report.migrated} saved record(s)? This also syncs to the cloud.
                    </span>
                    <button
                      className="composition-migration__confirm"
                      onClick={() => run({ apply: true })}
                      disabled={running}
                    >
                      Yes, apply
                    </button>
                    <button
                      className="composition-migration__cancel"
                      onClick={() => setConfirmingApply(false)}
                      disabled={running}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="composition-migration__confirm"
                    onClick={() => setConfirmingApply(true)}
                    disabled={running}
                  >
                    <Icon name="check" size={14} />
                    <span>Apply migration</span>
                  </button>
                )}
              </div>
            )}

            <p className="composition-migration__footnote">
              {applied
                ? 'Records were rewritten. Re-run the dry run to confirm nothing is left behind.'
                : 'Nothing was written.'}
            </p>
        </div>
      )}
    </section>
  );
}

export default CompositionMigrationPanel;
