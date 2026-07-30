/**
 * MysteriaMigrationTool.jsx - Mysteria to Dignities & Titles Migration Tool
 *
 * PURPOSE:
 * Provides a UI for migrating Mysteria codex entries to the Dignities & Titles
 * subsection under Heraldry & Titles. Allows selective migration and the ability
 * to mark entries as "never migrate".
 *
 * FEATURES:
 * - Collapsible panel with entry count badge
 * - List of entries with selection checkboxes
 * - Migrate selected entries to Dignities & Titles
 * - Mark entries to never migrate (excludes from future lists)
 * - Bulk select/deselect all
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import {
  getMysteriaMigrationEntries,
  migrateSelectedMysteria,
  markMysteriaSkipMigration
} from '../services/codexService';
import './MysteriaMigrationTool.css';
import { logger } from '../utils/logger';
import { formatShortDate as formatDate } from '../utils/formatDate';

/**
 * MysteriaMigrationTool Component
 *
 * Props:
 * - datasetId: Current dataset ID
 * - onMigrationComplete: Callback when migration completes (optional)
 * - defaultCollapsed: Whether to start collapsed (default: true)
 */
function MysteriaMigrationTool({ datasetId, onMigrationComplete, defaultCollapsed = true }) {
  // State
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [processingAction, setProcessingAction] = useState(null); // 'migrate' | 'skip' | null

  // Load entries when expanded
  useEffect(() => {
    if (!isCollapsed) {
      loadEntries();
    }
  }, [isCollapsed, datasetId]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMysteriaMigrationEntries(datasetId);
      setEntries(data);
      // Clear selections that no longer exist
      setSelectedIds(prev => {
        const validIds = new Set(data.map(e => e.id));
        return new Set([...prev].filter(id => validIds.has(id)));
      });
    } catch (error) {
      logger.error('Error loading mysteria entries:', error);
    } finally {
      setLoading(false);
    }
  }, [datasetId]);

  // Toggle selection for a single item
  const toggleSelection = useCallback((entryId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  }, []);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  }, [selectedIds.size, entries]);

  // Migrate selected entries
  const handleMigrateSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const selectedEntries = entries.filter(e => selectedIds.has(e.id));
    const confirmMessage = `Migrate ${selectedIds.size} ${selectedIds.size === 1 ? 'entry' : 'entries'} to Dignities & Titles?\n\n` +
      selectedEntries.slice(0, 5).map(e => `• ${e.title}`).join('\n') +
      (selectedEntries.length > 5 ? `\n...and ${selectedEntries.length - 5} more` : '');

    if (!window.confirm(confirmMessage)) return;

    setProcessingAction('migrate');
    try {
      const result = await migrateSelectedMysteria([...selectedIds], datasetId);

      if (result.success) {
        // Refresh entries list
        await loadEntries();
        setSelectedIds(new Set());
        onMigrationComplete?.();
      } else {
        alert(`Migration completed with ${result.errors.length} errors. Check console for details.`);
        logger.error('Migration errors:', result.errors);
      }
    } catch (error) {
      alert('Migration failed: ' + error.message);
    } finally {
      setProcessingAction(null);
    }
  }, [selectedIds, entries, datasetId, loadEntries, onMigrationComplete]);

  // Mark selected as "never migrate"
  const handleSkipSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const selectedEntries = entries.filter(e => selectedIds.has(e.id));
    const confirmMessage = `Mark ${selectedIds.size} ${selectedIds.size === 1 ? 'entry' : 'entries'} to never migrate?\n\n` +
      selectedEntries.slice(0, 5).map(e => `• ${e.title}`).join('\n') +
      (selectedEntries.length > 5 ? `\n...and ${selectedEntries.length - 5} more` : '') +
      '\n\nThese entries will remain as Mysteria and won\'t appear in this list again.';

    if (!window.confirm(confirmMessage)) return;

    setProcessingAction('skip');
    try {
      const result = await markMysteriaSkipMigration([...selectedIds], datasetId);

      if (result.success) {
        // Refresh entries list
        await loadEntries();
        setSelectedIds(new Set());
      } else {
        alert(`Operation completed with ${result.errors.length} errors.`);
      }
    } catch (error) {
      alert('Operation failed: ' + error.message);
    } finally {
      setProcessingAction(null);
    }
  }, [selectedIds, entries, datasetId, loadEntries]);


  // Collapsible header
  const CollapsibleHeader = () => (
    <button
      className={`mysteria-migration__header ${isCollapsed ? 'mysteria-migration__header--collapsed' : ''}`}
      onClick={() => setIsCollapsed(!isCollapsed)}
      type="button"
    >
      <div className="mysteria-migration__title">
        <Icon
          name={entries.length > 0 ? 'sparkles' : 'check-circle'}
          size={20}
          className={`mysteria-migration__title-icon ${entries.length > 0 ? 'mysteria-migration__title-icon--warning' : 'mysteria-migration__title-icon--success'}`}
        />
        <h3>Mysteria to Dignities & Titles</h3>
        {entries.length > 0 && (
          <span className="mysteria-migration__badge">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        )}
      </div>
      <Icon
        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
        size={20}
        className="mysteria-migration__collapse-icon"
      />
    </button>
  );

  return (
    <div className="mysteria-migration">
      <CollapsibleHeader />

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="mysteria-migration__content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="mysteria-migration__description">
              Move Mysteria codex entries to the <strong>Dignities & Titles</strong> subsection
              under Heraldry & Titles. Select entries to migrate or mark them to keep as Mysteria.
            </p>

            {loading ? (
              <div className="mysteria-migration__loading">
                <Icon name="loader" size={24} className="mysteria-migration__spinner" />
                <span>Loading entries...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="mysteria-migration__success">
                <Icon name="check-circle" size={48} className="mysteria-migration__success-icon" />
                <p className="mysteria-migration__success-text">
                  No Mysteria entries to migrate!
                </p>
                <p className="mysteria-migration__success-subtext">
                  All entries have been migrated or marked to keep.
                </p>
              </div>
            ) : (
              <>
                {/* Actions Bar */}
                <div className="mysteria-migration__actions">
                  <label className="mysteria-migration__select-all">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === entries.length && entries.length > 0}
                      onChange={toggleSelectAll}
                      disabled={processingAction !== null}
                    />
                    <span>Select All ({entries.length})</span>
                  </label>

                  <div className="mysteria-migration__action-buttons">
                    <AnimatePresence>
                      {selectedIds.size > 0 && (
                        <motion.div
                          className="mysteria-migration__action-group"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                        >
                          <ActionButton
                            icon={processingAction === 'migrate' ? 'loader' : 'arrow-right'}
                            variant="primary"
                            onClick={handleMigrateSelected}
                            disabled={processingAction !== null}
                          >
                            Migrate ({selectedIds.size})
                          </ActionButton>
                          <ActionButton
                            icon={processingAction === 'skip' ? 'loader' : 'x'}
                            variant="ghost"
                            onClick={handleSkipSelected}
                            disabled={processingAction !== null}
                          >
                            Never Migrate
                          </ActionButton>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Entries List */}
                <div className="mysteria-migration__list">
                  <AnimatePresence>
                    {entries.map((entry, index) => {
                      const isSelected = selectedIds.has(entry.id);

                      return (
                        <motion.div
                          key={entry.id}
                          className={`mysteria-migration__item ${isSelected ? 'mysteria-migration__item--selected' : ''}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20, height: 0 }}
                          transition={{ delay: index * 0.03 }}
                        >
                          <label className="mysteria-migration__item-checkbox">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelection(entry.id)}
                              disabled={processingAction !== null}
                            />
                          </label>

                          <div className="mysteria-migration__item-info">
                            <div className="mysteria-migration__item-title">
                              {entry.title}
                            </div>
                            {entry.subtitle && (
                              <div className="mysteria-migration__item-subtitle">
                                {entry.subtitle}
                              </div>
                            )}
                            <div className="mysteria-migration__item-meta">
                              {entry.category && (
                                <span className="mysteria-migration__item-category">
                                  <Icon name="tag" size={12} />
                                  {entry.category}
                                </span>
                              )}
                              {entry.created && (
                                <span className="mysteria-migration__item-date">
                                  <Icon name="calendar" size={12} />
                                  {formatDate(entry.created)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mysteria-migration__item-actions">
                            <button
                              className="mysteria-migration__item-migrate"
                              onClick={async () => {
                                setSelectedIds(new Set([entry.id]));
                                // Small delay to show selection, then migrate
                                setTimeout(() => {
                                  handleMigrateSelected();
                                }, 100);
                              }}
                              disabled={processingAction !== null}
                              title="Migrate this entry"
                            >
                              <Icon name="arrow-right" size={16} />
                            </button>
                            <button
                              className="mysteria-migration__item-skip"
                              onClick={async () => {
                                if (window.confirm(`Keep "${entry.title}" as Mysteria and never show in migration list?`)) {
                                  setProcessingAction('skip');
                                  await markMysteriaSkipMigration([entry.id], datasetId);
                                  await loadEntries();
                                  setProcessingAction(null);
                                }
                              }}
                              disabled={processingAction !== null}
                              title="Never migrate this entry"
                            >
                              <Icon name="x" size={16} />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {/* Help Text */}
                <div className="mysteria-migration__help">
                  <Icon name="info" size={14} />
                  <p>
                    <strong>Migrate:</strong> Moves entry to Dignities & Titles section.
                    <strong> Never Migrate:</strong> Keeps as Mysteria and hides from this list.
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MysteriaMigrationTool;
