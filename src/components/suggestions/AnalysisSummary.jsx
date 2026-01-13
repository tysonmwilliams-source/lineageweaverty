/**
 * AnalysisSummary.jsx - Analysis statistics overview
 *
 * PURPOSE:
 * Displays analysis results statistics including counts
 * by severity and type, data snapshot info, and timing.
 *
 * USAGE:
 * <AnalysisSummary
 *   stats={stats}
 *   lastAnalyzed={timestamp}
 *   onRunAnalysis={handleRun}
 * />
 */

import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import './AnalysisSummary.css';

/**
 * AnalysisSummary Component
 *
 * @param {Object} props
 * @param {Object} props.stats - Statistics from runFullAnalysis
 * @param {string} props.lastAnalyzed - ISO timestamp of last analysis
 * @param {Object} props.dataSnapshot - Data counts at analysis time
 * @param {boolean} props.loading - Analysis in progress
 * @param {Function} props.onRunAnalysis - Trigger new analysis
 * @param {boolean} props.compact - Compact display mode
 */
function AnalysisSummary({
  stats,
  lastAnalyzed,
  dataSnapshot,
  loading = false,
  onRunAnalysis,
  compact = false
}) {
  // Format timestamp
  const formattedTime = useMemo(() => {
    if (!lastAnalyzed) return 'Never';
    const date = new Date(lastAnalyzed);
    return date.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }, [lastAnalyzed]);

  // Calculate health score (0-100)
  const healthScore = useMemo(() => {
    if (!stats || stats.total === 0) return 100;

    // Weighted scoring: critical=-10, warning=-3, info=-1
    const criticalPenalty = (stats.bySeverity?.critical || 0) * 10;
    const warningPenalty = (stats.bySeverity?.warning || 0) * 3;
    const infoPenalty = (stats.bySeverity?.info || 0) * 1;

    const totalPenalty = criticalPenalty + warningPenalty + infoPenalty;
    return Math.max(0, 100 - totalPenalty);
  }, [stats]);

  // Health status label
  const healthStatus = useMemo(() => {
    if (healthScore >= 90) return { label: 'Excellent', color: 'success' };
    if (healthScore >= 70) return { label: 'Good', color: 'info' };
    if (healthScore >= 50) return { label: 'Fair', color: 'warning' };
    return { label: 'Needs Attention', color: 'error' };
  }, [healthScore]);

  // No stats yet
  if (!stats && !loading) {
    return (
      <div className={`analysis-summary analysis-summary--empty ${compact ? 'analysis-summary--compact' : ''}`}>
        <div className="analysis-summary__empty-state">
          <Icon name="lightbulb" size={32} />
          <p>No analysis run yet</p>
          {onRunAnalysis && (
            <ActionButton
              icon="zap"
              variant="primary"
              onClick={onRunAnalysis}
              disabled={loading}
            >
              Run Analysis
            </ActionButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={`analysis-summary ${compact ? 'analysis-summary--compact' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header with health score */}
      <div className="analysis-summary__header">
        <div className="analysis-summary__health">
          <div
            className={`analysis-summary__score analysis-summary__score--${healthStatus.color}`}
          >
            <span className="analysis-summary__score-value">{healthScore}</span>
            <span className="analysis-summary__score-label">Health</span>
          </div>
          <span className={`analysis-summary__status analysis-summary__status--${healthStatus.color}`}>
            {healthStatus.label}
          </span>
        </div>

        {onRunAnalysis && (
          <ActionButton
            icon={loading ? 'refresh' : 'zap'}
            variant="secondary"
            size="sm"
            onClick={onRunAnalysis}
            disabled={loading}
            loading={loading}
          >
            {loading ? 'Analyzing' : 'Re-run'}
          </ActionButton>
        )}
      </div>

      {/* Severity breakdown */}
      {stats && (
        <div className="analysis-summary__breakdown">
          <div className="analysis-summary__stat analysis-summary__stat--critical">
            <Icon name="alert" size={16} />
            <span className="analysis-summary__stat-value">
              {stats.bySeverity?.critical || 0}
            </span>
            <span className="analysis-summary__stat-label">Critical</span>
          </div>

          <div className="analysis-summary__stat analysis-summary__stat--warning">
            <Icon name="warning" size={16} />
            <span className="analysis-summary__stat-value">
              {stats.bySeverity?.warning || 0}
            </span>
            <span className="analysis-summary__stat-label">Warnings</span>
          </div>

          <div className="analysis-summary__stat analysis-summary__stat--info">
            <Icon name="info" size={16} />
            <span className="analysis-summary__stat-value">
              {stats.bySeverity?.info || 0}
            </span>
            <span className="analysis-summary__stat-label">Info</span>
          </div>

          <div className="analysis-summary__stat analysis-summary__stat--total">
            <Icon name="list" size={16} />
            <span className="analysis-summary__stat-value">
              {stats.total || 0}
            </span>
            <span className="analysis-summary__stat-label">Total</span>
          </div>
        </div>
      )}

      {/* Data snapshot info */}
      {!compact && dataSnapshot && (
        <div className="analysis-summary__snapshot">
          <span className="analysis-summary__snapshot-label">Analyzed:</span>
          <span className="analysis-summary__snapshot-item">
            <Icon name="users" size={12} />
            {dataSnapshot.peopleCount || 0} people
          </span>
          <span className="analysis-summary__snapshot-item">
            <Icon name="house" size={12} />
            {dataSnapshot.housesCount || 0} houses
          </span>
          <span className="analysis-summary__snapshot-item">
            <Icon name="crown" size={12} />
            {dataSnapshot.dignitiesCount || 0} dignities
          </span>
        </div>
      )}

      {/* Footer with timestamp */}
      <div className="analysis-summary__footer">
        <span className="analysis-summary__timestamp">
          <Icon name="clock" size={12} />
          Last run: {formattedTime}
        </span>
      </div>
    </motion.div>
  );
}

export default memo(AnalysisSummary);
