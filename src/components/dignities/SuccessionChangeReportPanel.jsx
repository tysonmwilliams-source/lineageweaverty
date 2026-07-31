/**
 * What the succession fix would change (decision D1).
 *
 * Development-only. D1 was answered as "correct rules, but show me what moves
 * first", and this is that report: it runs the old and the new algorithm over
 * every dignity and lists the differences.
 *
 * It only ever reads. There is deliberately no "apply" here — swapping the
 * algorithm is a code change, not a button, and it should follow reading this
 * rather than sit next to it.
 */
import { useState } from 'react';
import { buildSuccessionChangeReport } from '../../services/successionChangeReport';
import { useDataset } from '../../contexts/DatasetContext';
import Icon from '../icons';
import { logger } from '../../utils/logger';
import './SuccessionChangeReportPanel.css';

function Stat({ label, value, tone }) {
  return (
    <div className={`succession-report__stat${tone ? ` succession-report__stat--${tone}` : ''}`}>
      <span className="succession-report__stat-value">{value}</span>
      <span className="succession-report__stat-label">{label}</span>
    </div>
  );
}

function SuccessionChangeReportPanel() {
  const { activeDataset } = useDataset();
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await buildSuccessionChangeReport(activeDataset?.id));
    } catch (err) {
      logger.error('Succession change report failed:', err);
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const changedOnes = report?.dignities.filter((d) => d.changed) ?? [];

  return (
    <section className="succession-report">
      <header className="succession-report__header">
        <Icon name="crown" size={18} className="succession-report__icon" />
        <div>
          <h2 className="succession-report__title">Succession change report</h2>
          <p className="succession-report__subtitle">
            Development only. Compares today&rsquo;s succession order with the corrected
            rules. Changes nothing.
          </p>
        </div>
        <button className="succession-report__run" onClick={run} disabled={running}>
          <Icon name={running ? 'loader-2' : 'play'} size={16} className={running ? 'is-spinning' : undefined} />
          <span>{running ? 'Comparing…' : 'Compare'}</span>
        </button>
      </header>

      {error && (
        <p className="succession-report__error">
          <Icon name="x-circle" size={14} /> {error}
        </p>
      )}

      {report && (
        <div className="succession-report__body">
          <div className="succession-report__stats">
            <Stat label="dignities" value={report.total} />
            <Stat label="with a computed line" value={report.autoCalculated} />
            <Stat label="lines unchanged" value={report.unchanged} />
            <Stat label="lines that change" value={report.changed} tone={report.changed > 0 ? 'change' : undefined} />
            <Stat label="heir changes" value={report.heirsChanged} tone={report.heirsChanged > 0 ? 'bad' : undefined} />
          </div>

          {/* The headline. An heir change is the one a reader must not miss. */}
          {report.heirsChanged > 0 && (
            <div className="succession-report__group succession-report__group--bad">
              <h3><Icon name="alert-triangle" size={14} /> Who inherits changes</h3>
              <ul>
                {report.dignities.filter((d) => d.heirChanged).map((d) => (
                  <li key={d.id}>
                    <strong>{d.name}</strong> — heir becomes{' '}
                    <em>{d.heirAfter ?? 'nobody'}</em>, was <em>{d.heirBefore ?? 'nobody'}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {changedOnes.length > 0 && (
            <div className="succession-report__group succession-report__group--change">
              <h3><Icon name="list" size={14} /> Lines that reorder</h3>
              <ul className="succession-report__lines">
                {changedOnes.map((d) => (
                  <li key={d.id}>
                    <strong>{d.name}</strong>
                    <span className="succession-report__where">
                      first change at position {d.firstChangedPosition}
                    </span>
                    <span className="succession-report__before">was: {d.beforeTop.join(' → ') || '—'}</span>
                    <span className="succession-report__after">now: {d.afterTop.join(' → ') || '—'}</span>
                    {d.added.length > 0 && (
                      <span className="succession-report__delta">
                        joins the line: {d.added.join(', ')}
                      </span>
                    )}
                    {d.removed.length > 0 && (
                      <span className="succession-report__delta">
                        leaves the line: {d.removed.join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.skipped.length > 0 && (
            <div className="succession-report__group">
              <h3><Icon name="info" size={14} /> Not compared</h3>
              <ul>
                {report.skipped.map((s, i) => (
                  <li key={i}><strong>{s.name}</strong> — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {report.errors.length > 0 && (
            <div className="succession-report__group succession-report__group--bad">
              <h3><Icon name="x-circle" size={14} /> Failed to compare</h3>
              <ul>
                {report.errors.map((e, i) => (
                  <li key={i}><strong>{e.name ?? 'report'}</strong> — {e.error}</li>
                ))}
              </ul>
            </div>
          )}

          {report.changed === 0 && report.autoCalculated > 0 && (
            <p className="succession-report__clean">
              <Icon name="check-circle" size={14} /> No line changes.
            </p>
          )}

          <p className="succession-report__footnote">
            Nothing was changed. Adopting the corrected rules is a separate step.
          </p>
        </div>
      )}
    </section>
  );
}

export default SuccessionChangeReportPanel;
