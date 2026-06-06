/**
 * DataMigrationTool.jsx - Data Integration Migration Tool
 *
 * PURPOSE:
 * Provides a collapsible UI for running data migrations that integrate
 * houses and dignities with the Codex system, and creates cross-links
 * between related entities.
 *
 * FEATURES:
 * - Collapsible panel with status badge
 * - Detailed status for each migration type
 * - Run all migrations at once or individual migrations
 * - Progress tracking and result display
 * - Cloud sync support when logged in
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import {
  getMigrationStatus,
  runAllMigrations,
  migrateHousesToCodex,
  migrateDignitiesToCodex,
  runCrossLinkingMigrations,
  fixHouseHousePrefixes
} from '../services/migrationService';
import './DataMigrationTool.css';

/**
 * DataMigrationTool Component
 *
 * Props:
 * - syncContext: Object with { userId, datasetId } for cloud sync (optional)
 * - defaultCollapsed: Whether to start collapsed (default: true)
 * - onMigrationComplete: Callback when any migration completes (optional)
 */
function DataMigrationTool({ syncContext, defaultCollapsed = true, onMigrationComplete }) {
  // State
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [runningMigration, setRunningMigration] = useState(null); // 'all' | 'houses' | 'dignities' | 'crosslinks' | null
  const [results, setResults] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null); // For showing details

  // Load status when expanded
  useEffect(() => {
    if (!isCollapsed) {
      loadStatus();
    }
  }, [isCollapsed]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const migrationStatus = await getMigrationStatus();
      setStatus(migrationStatus);
    } catch (error) {
      console.error('Error loading migration status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate total issues
  const getTotalIssues = useCallback(() => {
    if (!status) return 0;
    let total = 0;
    if (status.houses?.needsMigration) total += status.houses.needsMigration;
    if (status.dignities?.needsMigration) total += status.dignities.needsMigration;
    if (status.crossLinks?.total?.needsMigration) {
      const crossLinkIssues =
        Math.max(0, (status.crossLinks.personHouse?.potential || 0) - (status.crossLinks.personHouse?.existing || 0)) +
        Math.max(0, (status.crossLinks.personDignity?.potential || 0) - (status.crossLinks.personDignity?.existing || 0)) +
        Math.max(0, (status.crossLinks.houseDignity?.potential || 0) - (status.crossLinks.houseDignity?.existing || 0));
      total += crossLinkIssues;
    }
    return total;
  }, [status]);

  // Run all migrations
  const handleRunAll = useCallback(async () => {
    if (!window.confirm('Create all links?\n\nThis will:\n• Create Codex entries for houses without them\n• Create Codex entries for dignities without them\n• Create cross-links between related entities')) {
      return;
    }

    setRunningMigration('all');
    setResults(null);

    try {
      const migrationResults = await runAllMigrations(syncContext);
      setResults(migrationResults);

      // Refresh status
      await loadStatus();
      onMigrationComplete?.();

      if (migrationResults.success) {
        const summary = `Migration complete!\n\n` +
          `Houses: ${migrationResults.houses?.migrated || 0} migrated\n` +
          `Dignities: ${migrationResults.dignities?.migrated || 0} migrated\n` +
          `Cross-links: ${migrationResults.crossLinks?.totalLinked || 0} created`;
        alert(summary);
      } else {
        alert(`Migration completed with ${migrationResults.errors.length} errors. Check console for details.`);
      }
    } catch (error) {
      alert('Migration failed: ' + error.message);
    } finally {
      setRunningMigration(null);
    }
  }, [syncContext, loadStatus, onMigrationComplete]);

  // Run house migration only
  const handleMigrateHouses = useCallback(async () => {
    if (!window.confirm('Create Codex entries for houses that don\'t have them?')) {
      return;
    }

    setRunningMigration('houses');
    try {
      const result = await migrateHousesToCodex();
      setResults(prev => ({ ...prev, houses: result }));
      await loadStatus();
      onMigrationComplete?.();
      alert(`House migration complete!\n\n${result.migrated} houses migrated\n${result.skipped} already had entries\n${result.errors.length} errors`);
    } catch (error) {
      alert('House migration failed: ' + error.message);
    } finally {
      setRunningMigration(null);
    }
  }, [loadStatus, onMigrationComplete]);

  // Run dignity migration only
  const handleMigrateDignities = useCallback(async () => {
    if (!window.confirm('Create Codex entries for dignities that don\'t have them?')) {
      return;
    }

    setRunningMigration('dignities');
    try {
      const result = await migrateDignitiesToCodex();
      setResults(prev => ({ ...prev, dignities: result }));
      await loadStatus();
      onMigrationComplete?.();
      alert(`Dignity migration complete!\n\n${result.migrated} dignities migrated\n${result.skipped} already had entries\n${result.errors.length} errors`);
    } catch (error) {
      alert('Dignity migration failed: ' + error.message);
    } finally {
      setRunningMigration(null);
    }
  }, [loadStatus, onMigrationComplete]);

  // Run cross-linking only
  const handleRunCrossLinks = useCallback(async () => {
    if (!window.confirm('Create cross-links between related Codex entries?\n\nThis will link:\n• Person ↔ House\n• Person ↔ Dignity\n• House ↔ Dignity')) {
      return;
    }

    setRunningMigration('crosslinks');
    try {
      const result = await runCrossLinkingMigrations(syncContext);
      setResults(prev => ({ ...prev, crossLinks: result }));
      await loadStatus();
      onMigrationComplete?.();
      alert(`Cross-linking complete!\n\n${result.totalLinked} links created\n${result.errors.length} errors`);
    } catch (error) {
      alert('Cross-linking failed: ' + error.message);
    } finally {
      setRunningMigration(null);
    }
  }, [syncContext, loadStatus, onMigrationComplete]);

  // Fix "House House" prefix duplicates
  const handleFixHouseHouse = useCallback(async () => {
    if (!window.confirm('Fix all codex entries with duplicate "House House" prefix?\n\nThis will rename entries like "House House Wilfsbane" → "House Wilfsbane".')) {
      return;
    }

    setRunningMigration('housefix');
    try {
      const result = await fixHouseHousePrefixes();
      await loadStatus();
      onMigrationComplete?.();
      if (result.fixed === 0) {
        alert('No "House House" entries found — nothing to fix!');
      } else {
        alert(`Fixed ${result.fixed} entries:\n\n${result.entries.join('\n')}`);
      }
    } catch (error) {
      alert('Fix failed: ' + error.message);
    } finally {
      setRunningMigration(null);
    }
  }, [loadStatus, onMigrationComplete]);

  // Check if any migration is needed
  const needsMigration = status?.needsMigration || false;
  const totalIssues = getTotalIssues();

  // Collapsible header
  const CollapsibleHeader = () => (
    <button
      className={`data-migration__header ${isCollapsed ? 'data-migration__header--collapsed' : ''}`}
      onClick={() => setIsCollapsed(!isCollapsed)}
      type="button"
    >
      <div className="data-migration__title">
        <Icon
          name={needsMigration ? 'database' : 'check-circle'}
          size={20}
          className={`data-migration__title-icon ${needsMigration ? 'data-migration__title-icon--warning' : 'data-migration__title-icon--success'}`}
        />
        <h3>Data Integration</h3>
        {!isCollapsed && needsMigration && totalIssues > 0 && (
          <span className="data-migration__badge">{totalIssues} unlinked</span>
        )}
      </div>
      <Icon
        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
        size={20}
        className="data-migration__collapse-icon"
      />
    </button>
  );

  // Status row component
  const StatusRow = ({ icon, label, current, total, needsFix, onRun, isRunning, runLabel }) => (
    <div className="data-migration__status-row">
      <div className="data-migration__status-label">
        <Icon name={icon} size={16} />
        <span>{label}</span>
      </div>
      <div className="data-migration__status-values">
        <span className="data-migration__status-count">{current}</span>
        <span className="data-migration__status-separator">/</span>
        <span className="data-migration__status-total">{total}</span>
      </div>
      <div className="data-migration__status-badge-container">
        {needsFix ? (
          <span className="data-migration__status-badge data-migration__status-badge--warning">
            Not yet created
          </span>
        ) : total > 0 ? (
          <span className="data-migration__status-badge data-migration__status-badge--success">
            <Icon name="check" size={12} /> Complete
          </span>
        ) : (
          <span className="data-migration__status-badge data-migration__status-badge--empty">
            No data
          </span>
        )}
      </div>
      {onRun && needsFix && (
        <button
          className="data-migration__status-action"
          onClick={onRun}
          disabled={runningMigration !== null}
          title={runLabel}
        >
          <Icon name={isRunning ? 'loader' : 'play'} size={14} className={isRunning ? 'data-migration__spinner' : ''} />
        </button>
      )}
    </div>
  );

  // Cross-link status row
  const CrossLinkRow = ({ icon, label, existing, potential }) => {
    const needsFix = existing < potential;
    return (
      <div className="data-migration__crosslink-row">
        <div className="data-migration__crosslink-label">
          <Icon name={icon} size={14} />
          <span>{label}</span>
        </div>
        <div className="data-migration__crosslink-values">
          <span className="data-migration__crosslink-count">{existing}</span>
          <span className="data-migration__crosslink-separator">/</span>
          <span className="data-migration__crosslink-total">{potential}</span>
        </div>
        {needsFix ? (
          <span className="data-migration__crosslink-badge data-migration__crosslink-badge--warning">
            Unlinked
          </span>
        ) : potential > 0 ? (
          <span className="data-migration__crosslink-badge data-migration__crosslink-badge--success">
            <Icon name="check" size={10} />
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="data-migration">
      <CollapsibleHeader />

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="data-migration__content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="data-migration__description">
              Create cross-links between <strong>people</strong>, <strong>houses</strong>, and <strong>dignities</strong> for
              Codex navigation and discovery.
            </p>

            {loading ? (
              <div className="data-migration__loading">
                <Icon name="loader" size={24} className="data-migration__spinner" />
                <span>Loading migration status...</span>
              </div>
            ) : !status ? (
              <div className="data-migration__error">
                <Icon name="alert-circle" size={24} />
                <span>Failed to load migration status</span>
                <ActionButton icon="refresh-cw" variant="ghost" onClick={loadStatus}>
                  Retry
                </ActionButton>
              </div>
            ) : !needsMigration ? (
              <div className="data-migration__success">
                <Icon name="check-circle" size={48} className="data-migration__success-icon" />
                <p className="data-migration__success-text">
                  All data is fully integrated!
                </p>
                <p className="data-migration__success-subtext">
                  {status.houses?.withCodex || 0} houses and {status.dignities?.withCodex || 0} dignities have Codex entries.
                </p>
              </div>
            ) : (
              <>
                {/* Codex Entry Creation Section — hidden when all entries exist */}
                {(status.houses?.needsMigration > 0 || status.dignities?.needsMigration > 0) && (
                  <div className="data-migration__section">
                    <h4 className="data-migration__section-title">
                      <Icon name="book-open" size={16} />
                      Codex Entry Creation
                    </h4>

                    <div className="data-migration__status-list">
                      <StatusRow
                        icon="castle"
                        label="Houses"
                        current={status.houses?.withCodex || 0}
                        total={status.houses?.total || 0}
                        needsFix={status.houses?.needsMigration > 0}
                        onRun={handleMigrateHouses}
                        isRunning={runningMigration === 'houses'}
                        runLabel="Create house Codex entries"
                      />
                      <StatusRow
                        icon="crown"
                        label="Dignities"
                        current={status.dignities?.withCodex || 0}
                        total={status.dignities?.total || 0}
                        needsFix={status.dignities?.needsMigration > 0}
                        onRun={handleMigrateDignities}
                        isRunning={runningMigration === 'dignities'}
                        runLabel="Create dignity Codex entries"
                      />
                    </div>
                  </div>
                )}

                {/* Cross-Links Section */}
                <div className="data-migration__section">
                  <div className="data-migration__section-header">
                    <h4 className="data-migration__section-title">
                      <Icon name="link" size={16} />
                      Cross-Links
                    </h4>
                    {status.crossLinks?.total?.needsMigration && (
                      <button
                        className="data-migration__section-action"
                        onClick={handleRunCrossLinks}
                        disabled={runningMigration !== null}
                        title="Run cross-linking"
                      >
                        <Icon name={runningMigration === 'crosslinks' ? 'loader' : 'play'} size={14} className={runningMigration === 'crosslinks' ? 'data-migration__spinner' : ''} />
                        <span>Create Links</span>
                      </button>
                    )}
                  </div>

                  <div className="data-migration__crosslink-list">
                    <CrossLinkRow
                      icon="users"
                      label="Person ↔ House"
                      existing={status.crossLinks?.personHouse?.existing || 0}
                      potential={status.crossLinks?.personHouse?.potential || 0}
                    />
                    <CrossLinkRow
                      icon="user"
                      label="Person ↔ Dignity"
                      existing={status.crossLinks?.personDignity?.existing || 0}
                      potential={status.crossLinks?.personDignity?.potential || 0}
                    />
                    <CrossLinkRow
                      icon="castle"
                      label="House ↔ Dignity"
                      existing={status.crossLinks?.houseDignity?.existing || 0}
                      potential={status.crossLinks?.houseDignity?.potential || 0}
                    />
                  </div>
                </div>

                {/* Run All Button */}
                <div className="data-migration__actions">
                  <ActionButton
                    icon={runningMigration === 'all' ? 'loader' : 'play'}
                    variant="primary"
                    onClick={handleRunAll}
                    disabled={runningMigration !== null}
                  >
                    {runningMigration === 'all' ? 'Creating All Links...' : 'Create All Links'}
                  </ActionButton>
                  <p className="data-migration__actions-note">
                    Creates Codex entries and cross-links in one operation.
                    {syncContext?.userId && ' Changes will sync to cloud.'}
                  </p>

                  <ActionButton
                    icon={runningMigration === 'housefix' ? 'loader' : 'edit-3'}
                    variant="secondary"
                    onClick={handleFixHouseHouse}
                    disabled={runningMigration !== null}
                  >
                    {runningMigration === 'housefix' ? 'Fixing...' : 'Fix "House House" Prefixes'}
                  </ActionButton>
                </div>

                {/* Results Display */}
                {results && (
                  <motion.div
                    className={`data-migration__results ${results.success ? 'data-migration__results--success' : 'data-migration__results--error'}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <h4 className="data-migration__results-title">
                      <Icon name={results.success ? 'check-circle' : 'alert-circle'} size={16} />
                      Last Migration Results
                    </h4>
                    <ul className="data-migration__results-list">
                      {results.houses && (
                        <li>
                          <Icon name="castle" size={12} />
                          Houses: {results.houses.migrated} migrated, {results.houses.skipped} skipped
                        </li>
                      )}
                      {results.dignities && (
                        <li>
                          <Icon name="crown" size={12} />
                          Dignities: {results.dignities.migrated} migrated, {results.dignities.skipped} skipped
                        </li>
                      )}
                      {results.crossLinks && (
                        <li>
                          <Icon name="link" size={12} />
                          Cross-links: {results.crossLinks.totalLinked} created
                        </li>
                      )}
                      {results.errors?.length > 0 && (
                        <li className="data-migration__results-errors">
                          <Icon name="alert-triangle" size={12} />
                          {results.errors.length} error{results.errors.length !== 1 ? 's' : ''} occurred
                        </li>
                      )}
                    </ul>
                  </motion.div>
                )}
              </>
            )}

            {/* Help Text */}
            <div className="data-migration__help">
              <Icon name="info" size={14} />
              <p>
                <strong>Codex entries</strong> enable rich linking between houses, dignities, and people.
                <strong> Cross-links</strong> connect related entries for navigation and discovery.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DataMigrationTool;
