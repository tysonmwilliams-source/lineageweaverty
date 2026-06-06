/**
 * ImportExportManager.jsx - Import/Export Manager Component
 *
 * PURPOSE:
 * Comprehensive data backup and restore system with:
 * - JSON export with metadata
 * - JSON import with validation
 * - Conflict detection and resolution
 * - Progress tracking
 * - Version compatibility checking
 *
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAllPeople,
  getAllHouses,
  getAllRelationships,
  getDatabase
} from '../services/database';
import { useGenealogy } from '../contexts/GenealogyContext';
import { useDataset } from '../contexts/DatasetContext';
import {
  exportData,
  importData,
  CURRENT_VERSION
} from '../services/database/MigrationHooks';
import { getAllEntries } from '../services/codexService';
import {
  getContextSystemStatus,
  getContextRegistry,
  generateAllContexts,
  downloadContext,
  exportAllContexts,
  subscribeToContextUpdates
} from '../services/contextService';
import Icon from './icons';
import './ImportExportManager.css';

// ==================== ANIMATION VARIANTS ====================
const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 300
    }
  }
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 300
    }
  }
};

const ALERT_VARIANTS = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.15 }
  }
};

const PROGRESS_VARIANTS = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.15 }
  }
};

const GRID_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

function ImportExportManager() {
  // Access context for data refresh after import
  const { refreshData } = useGenealogy();
  const { activeDataset } = useDataset();

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState(null);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importConflicts, setImportConflicts] = useState(null);
  const [importErrors, setImportErrors] = useState(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [conflictResolution, setConflictResolution] = useState('skip');

  // Progress tracking
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  // Context Library state
  const [contextStatus, setContextStatus] = useState(null);
  const [contextRegistry, setContextRegistry] = useState([]);
  const [generatingContexts, setGeneratingContexts] = useState(false);
  const [contextError, setContextError] = useState(null);

  // Load context status
  const loadContextStatus = useCallback(async () => {
    const datasetId = activeDataset?.id;
    try {
      const [status, registry] = await Promise.all([
        getContextSystemStatus(datasetId),
        getContextRegistry(datasetId)
      ]);
      setContextStatus(status);
      setContextRegistry(registry);
      setContextError(null);
    } catch (error) {
      console.error('Error loading context status:', error);
      setContextError(error.message);
    }
  }, [activeDataset?.id]);

  // Load context status on mount and subscribe to updates
  useEffect(() => {
    loadContextStatus();
    const unsubscribe = subscribeToContextUpdates(() => {
      loadContextStatus();
    });
    return unsubscribe;
  }, [loadContextStatus]);

  // Handle context regeneration
  const handleRegenerateContexts = async () => {
    const datasetId = activeDataset?.id;
    try {
      setGeneratingContexts(true);
      setContextError(null);
      await generateAllContexts(datasetId);
      await loadContextStatus();
    } catch (error) {
      console.error('Error generating contexts:', error);
      setContextError(error.message);
    } finally {
      setGeneratingContexts(false);
    }
  };

  // Handle context download
  const handleDownloadAllContexts = async () => {
    const datasetId = activeDataset?.id;
    try {
      const exportData = await exportAllContexts(datasetId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contexts-all-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading contexts:', error);
      setContextError(error.message);
    }
  };

  // ==================== EXPORT FUNCTIONS ====================

  const handleExport = async () => {
    const datasetId = activeDataset?.id;
    try {
      setExporting(true);
      setExportError(null);
      setExportSuccess(false);
      setProgress(0);

      setProgressMessage('Gathering people...');
      setProgress(20);
      const people = await getAllPeople(datasetId);

      setProgressMessage('Gathering houses...');
      setProgress(40);
      const houses = await getAllHouses(datasetId);

      setProgressMessage('Gathering relationships...');
      setProgress(60);
      const relationships = await getAllRelationships(datasetId);

      setProgressMessage('Gathering Codex entries...');
      setProgress(70);
      const codexEntries = await getAllEntries(datasetId);

      setProgressMessage('Formatting export...');
      setProgress(80);
      const exportedData = exportData({
        people,
        houses,
        relationships,
        codexEntries: codexEntries || []
      }, 'json');

      setProgressMessage('Creating download...');
      setProgress(90);
      const blob = new Blob([JSON.stringify(exportedData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `lineageweaver-backup-${timestamp}.json`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProgress(100);
      setProgressMessage('Export complete!');
      setExportSuccess(true);

      setTimeout(() => {
        setExportSuccess(false);
        setProgress(0);
        setProgressMessage('');
      }, 3000);

    } catch (error) {
      console.error('Export error:', error);
      setExportError(error.message);
    } finally {
      setExporting(false);
    }
  };

  // ==================== IMPORT FUNCTIONS ====================

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImportFile(file);
    setImportErrors(null);
    setImportConflicts(null);
    setImportPreview(null);
    setImportSuccess(false);

    try {
      const fileContent = await readFileAsText(file);
      const datasetId = activeDataset?.id;

      const existingPeople = await getAllPeople(datasetId);
      const existingHouses = await getAllHouses(datasetId);
      const existingRelationships = await getAllRelationships(datasetId);

      const result = importData(fileContent, {
        people: existingPeople,
        houses: existingHouses,
        relationships: existingRelationships
      });

      if (result.errors) {
        setImportErrors(result.errors);
        return;
      }

      setImportPreview({
        version: result.data.version,
        exportDate: result.data.exportDate,
        metadata: result.data.metadata,
        counts: {
          people: result.data.people.length,
          houses: result.data.houses.length,
          relationships: result.data.relationships.length,
          codexEntries: result.data.codexEntries?.length || 0
        }
      });

      if (result.conflicts && result.conflicts.length > 0) {
        setImportConflicts(result.conflicts);
      }

    } catch (error) {
      setImportErrors([error.message]);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    const hasConflicts = importConflicts && importConflicts.length > 0;
    const confirmMessage = hasConflicts
      ? `Import with ${importConflicts.length} conflicts?\nResolution: ${conflictResolution.toUpperCase()}`
      : `Import ${importPreview.counts.people} people, ${importPreview.counts.houses} houses, and ${importPreview.counts.relationships} relationships?\n\nThis action cannot be undone without a backup!`;

    if (!confirm(confirmMessage)) return;

    try {
      setImporting(true);
      setProgress(0);
      setImportSuccess(false);

      const datasetId = activeDataset?.id;
      const db = getDatabase(datasetId);

      setProgressMessage('Reading import file...');
      setProgress(10);
      const fileContent = await readFileAsText(importFile);
      const data = JSON.parse(fileContent);

      let finalPeople = data.people;
      let finalHouses = data.houses;
      let finalRelationships = data.relationships;

      if (hasConflicts) {
        setProgressMessage('Resolving conflicts...');
        setProgress(20);

        if (conflictResolution === 'skip') {
          const existingPeopleIds = (await getAllPeople(datasetId)).map(p => p.id);
          const existingHouseIds = (await getAllHouses(datasetId)).map(h => h.id);
          finalPeople = data.people.filter(p => !existingPeopleIds.includes(p.id));
          finalHouses = data.houses.filter(h => !existingHouseIds.includes(h.id));
        } else if (conflictResolution === 'overwrite') {
          setProgressMessage('Removing conflicting records...');
          for (const conflict of importConflicts) {
            if (conflict.type === 'person') {
              await db.people.delete(conflict.id);
            } else if (conflict.type === 'house') {
              await db.houses.delete(conflict.id);
            }
          }
        } else if (conflictResolution === 'keep-both') {
          setProgressMessage('Generating new IDs...');
          const idMap = new Map();

          finalPeople = data.people.map(person => {
            const existing = importConflicts.find(c => c.type === 'person' && c.id === person.id);
            if (existing) {
              const newId = Date.now() + Math.random();
              idMap.set(person.id, newId);
              return { ...person, id: newId };
            }
            return person;
          });

          finalHouses = data.houses.map(house => {
            const existing = importConflicts.find(c => c.type === 'house' && c.id === house.id);
            if (existing) {
              const newId = Date.now() + Math.random();
              idMap.set(house.id, newId);
              return { ...house, id: newId };
            }
            return house;
          });

          finalRelationships = data.relationships.map(rel => ({
            ...rel,
            person1Id: idMap.get(rel.person1Id) || rel.person1Id,
            person2Id: idMap.get(rel.person2Id) || rel.person2Id
          }));
        }
      }

      setProgressMessage(`Importing ${finalHouses.length} houses...`);
      setProgress(40);
      await db.houses.bulkAdd(finalHouses);

      setProgressMessage(`Importing ${finalPeople.length} people...`);
      setProgress(60);
      await db.people.bulkAdd(finalPeople);

      setProgressMessage(`Importing ${finalRelationships.length} relationships...`);
      setProgress(80);
      await db.relationships.bulkAdd(finalRelationships);

      if (data.codexEntries && data.codexEntries.length > 0) {
        setProgressMessage(`Importing ${data.codexEntries.length} Codex entries...`);
        setProgress(90);
        await db.codexEntries.bulkAdd(data.codexEntries);
      }

      setProgress(100);
      setProgressMessage('Import complete!');
      setImportSuccess(true);

      await refreshData();

      setTimeout(() => {
        setImportFile(null);
        setImportPreview(null);
        setImportConflicts(null);
        setImportSuccess(false);
        setProgress(0);
        setProgressMessage('');
        document.getElementById('import-file-input').value = '';
      }, 3000);

    } catch (error) {
      console.error('Import error:', error);
      setImportErrors([error.message]);
    } finally {
      setImporting(false);
    }
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleCancelImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportConflicts(null);
    setImportErrors(null);
    setImportSuccess(false);
    document.getElementById('import-file-input').value = '';
  };

  // ==================== RENDER ====================

  return (
    <div className="import-export">

      {/* Export Section */}
      <motion.section
        className="import-export__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <h2 className="import-export__header">
          <Icon name="upload" size={24} />
          <span>Export Data</span>
        </h2>
        <p className="import-export__description">
          Create a complete backup of your Lineageweaver data including people, houses, relationships, and Codex entries.
        </p>

        <motion.div
          className="import-export__card"
          variants={CARD_VARIANTS}
        >
          <div className="import-export__card-row">
            <div className="import-export__card-info">
              <h3 className="import-export__card-title">JSON Format</h3>
              <p className="import-export__card-subtitle">
                Human-readable, version {CURRENT_VERSION}
              </p>
            </div>
            <button
              className="import-export__btn import-export__btn--primary"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <>
                  <Icon name="loader" size={16} />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Icon name="download" size={16} />
                  <span>Download Backup</span>
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          <AnimatePresence>
            {exporting && (
              <motion.div
                className="import-export__progress"
                variants={PROGRESS_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="import-export__progress-header">
                  <span className="import-export__progress-message">
                    {progressMessage}
                  </span>
                  <span className="import-export__progress-percent">
                    {progress}%
                  </span>
                </div>
                <div className="import-export__progress-track">
                  <motion.div
                    className="import-export__progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success message */}
          <AnimatePresence>
            {exportSuccess && (
              <motion.div
                className="import-export__alert import-export__alert--success"
                variants={ALERT_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="check-circle" size={18} className="import-export__alert-icon" />
                <p className="import-export__alert-text">
                  Export successful! Your backup has been downloaded.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {exportError && (
              <motion.div
                className="import-export__alert import-export__alert--error"
                variants={ALERT_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="x-circle" size={18} className="import-export__alert-icon" />
                <p className="import-export__alert-text">
                  Export failed: {exportError}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.section>

      {/* Import Section */}
      <motion.section
        className="import-export__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.1 }}
      >
        <h2 className="import-export__header">
          <Icon name="download" size={24} />
          <span>Import Data</span>
        </h2>
        <p className="import-export__description">
          Restore data from a Lineageweaver backup file. Automatic version migration and conflict detection included.
        </p>

        <motion.div
          className="import-export__card"
          variants={CARD_VARIANTS}
        >

          {/* File selection */}
          {!importPreview && (
            <div className="import-export__file-input-wrapper">
              <input
                id="import-file-input"
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="import-export__file-input"
              />
              <p className="import-export__file-hint">
                Select a .json backup file exported from Lineageweaver
              </p>
            </div>
          )}

          {/* Validation errors */}
          <AnimatePresence>
            {importErrors && (
              <motion.div
                className="import-export__alert import-export__alert--error"
                variants={ALERT_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="x-circle" size={18} className="import-export__alert-icon" />
                <div className="import-export__alert-content">
                  <h4 className="import-export__alert-title">Import Validation Failed</h4>
                  <ul className="import-export__alert-list">
                    {importErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Import preview */}
          <AnimatePresence mode="wait">
            {importPreview && !importSuccess && (
              <motion.div
                className="import-export__preview"
                variants={CARD_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <h3 className="import-export__preview-title">
                  <Icon name="file-text" size={18} />
                  <span>Import Preview</span>
                </h3>

                {/* Metadata */}
                <motion.div
                  className="import-export__meta-grid"
                  variants={GRID_VARIANTS}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div className="import-export__meta-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__meta-label">Schema Version</p>
                    <p className="import-export__meta-value">{importPreview.version}</p>
                  </motion.div>
                  <motion.div className="import-export__meta-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__meta-label">Export Date</p>
                    <p className="import-export__meta-value">
                      {new Date(importPreview.exportDate).toLocaleDateString()}
                    </p>
                  </motion.div>
                </motion.div>

                {/* Counts */}
                <motion.div
                  className="import-export__counts-grid"
                  variants={GRID_VARIANTS}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.div className="import-export__count-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__count-value">{importPreview.counts.people}</p>
                    <p className="import-export__count-label">People</p>
                  </motion.div>
                  <motion.div className="import-export__count-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__count-value">{importPreview.counts.houses}</p>
                    <p className="import-export__count-label">Houses</p>
                  </motion.div>
                  <motion.div className="import-export__count-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__count-value">{importPreview.counts.relationships}</p>
                    <p className="import-export__count-label">Relationships</p>
                  </motion.div>
                  <motion.div className="import-export__count-item" variants={ITEM_VARIANTS}>
                    <p className="import-export__count-value">{importPreview.counts.codexEntries}</p>
                    <p className="import-export__count-label">Codex Entries</p>
                  </motion.div>
                </motion.div>

                {/* Conflicts */}
                <AnimatePresence>
                  {importConflicts && importConflicts.length > 0 && (
                    <motion.div
                      className="import-export__conflicts"
                      variants={ALERT_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <h4 className="import-export__conflicts-header">
                        <Icon name="alert-triangle" size={18} />
                        <span>{importConflicts.length} Conflicts Detected</span>
                      </h4>
                      <p className="import-export__conflicts-description">
                        The following records already exist in your database:
                      </p>
                      <div className="import-export__conflicts-list">
                        {importConflicts.slice(0, 10).map((conflict, index) => (
                          <div key={index} className="import-export__conflict-item">
                            <Icon name={conflict.type === 'person' ? 'user' : 'castle'} size={14} />
                            <span>{conflict.importName}</span>
                          </div>
                        ))}
                        {importConflicts.length > 10 && (
                          <p className="import-export__conflicts-more">
                            ...and {importConflicts.length - 10} more
                          </p>
                        )}
                      </div>

                      {/* Conflict resolution strategy */}
                      <div className="import-export__resolution">
                        <label className="import-export__resolution-label">
                          Resolution Strategy:
                        </label>
                        <select
                          value={conflictResolution}
                          onChange={(e) => setConflictResolution(e.target.value)}
                          className="import-export__resolution-select"
                        >
                          <option value="skip">Skip conflicting records (safest)</option>
                          <option value="overwrite">Overwrite existing records (replaces data)</option>
                          <option value="keep-both">Keep both (creates duplicates with new IDs)</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Import progress */}
                <AnimatePresence>
                  {importing && (
                    <motion.div
                      className="import-export__progress"
                      variants={PROGRESS_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                    >
                      <div className="import-export__progress-header">
                        <span className="import-export__progress-message">
                          {progressMessage}
                        </span>
                        <span className="import-export__progress-percent">
                          {progress}%
                        </span>
                      </div>
                      <div className="import-export__progress-track">
                        <motion.div
                          className="import-export__progress-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Action buttons */}
                <div className="import-export__actions">
                  <button
                    className="import-export__btn import-export__btn--secondary"
                    onClick={handleCancelImport}
                    disabled={importing}
                  >
                    Cancel
                  </button>
                  <button
                    className="import-export__btn import-export__btn--primary"
                    onClick={handleImport}
                    disabled={importing}
                  >
                    {importing ? (
                      <>
                        <Icon name="loader" size={16} />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="check" size={16} />
                        <span>Confirm Import</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success message */}
          <AnimatePresence>
            {importSuccess && (
              <motion.div
                className="import-export__success"
                variants={ALERT_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="check-circle" size={48} className="import-export__success-icon" />
                <h3 className="import-export__success-title">Import Successful!</h3>
                <p className="import-export__success-text">
                  Your data has been restored. All views are now updated!
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.section>

      {/* Context Library Section */}
      <motion.section
        className="import-export__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.25 }}
      >
        <h2 className="import-export__header">
          <Icon name="library" size={24} />
          <span>Context Library</span>
        </h2>
        <p className="import-export__description">
          Auto-generated context files for AI tools. Updates automatically when data changes.
        </p>

        <motion.div
          className="import-export__card"
          variants={CARD_VARIANTS}
        >
          {/* Status Display */}
          {contextStatus && (
            <div className="import-export__context-status">
              <div className="import-export__context-status-row">
                <span className="import-export__context-status-label">Status:</span>
                <span className={`import-export__context-status-value ${contextStatus.healthy ? 'import-export__context-status-value--healthy' : 'import-export__context-status-value--stale'}`}>
                  {contextStatus.healthy ? '✓ Current' : '⚠ Needs Update'}
                </span>
              </div>
              <div className="import-export__context-status-row">
                <span className="import-export__context-status-label">Contexts:</span>
                <span className="import-export__context-status-value">
                  {contextStatus.totalContexts || 0} total ({contextStatus.majorHouses || 0} major houses)
                </span>
              </div>
              {contextStatus.pendingChanges > 0 && (
                <div className="import-export__context-status-row">
                  <span className="import-export__context-status-label">Pending:</span>
                  <span className="import-export__context-status-value">
                    {contextStatus.pendingChanges} changes queued
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Context List */}
          {contextRegistry.length > 0 && (
            <div className="import-export__context-list">
              {contextRegistry.map(ctx => (
                <div key={ctx.contextId} className="import-export__context-item">
                  <span className="import-export__context-name">
                    {ctx.contextId === 'master' ? 'Master Index' :
                     ctx.contextId === 'minor-houses' ? 'Minor Houses' :
                     `House ${ctx.contextId.charAt(0).toUpperCase() + ctx.contextId.slice(1)}`}
                  </span>
                  <span className="import-export__context-type">{ctx.contextType}</span>
                  <button
                    className="import-export__btn import-export__btn--small"
                    onClick={() => downloadContext(ctx.contextId, activeDataset?.id)}
                    title="Download this context"
                  >
                    <Icon name="download" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* No contexts yet */}
          {contextRegistry.length === 0 && !generatingContexts && (
            <p className="import-export__context-empty">
              No contexts generated yet. Click "Generate All" to create context files for your data.
            </p>
          )}

          {/* Error display */}
          <AnimatePresence>
            {contextError && (
              <motion.div
                className="import-export__alert import-export__alert--error"
                variants={ALERT_VARIANTS}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <Icon name="x-circle" size={18} className="import-export__alert-icon" />
                <p className="import-export__alert-text">{contextError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="import-export__context-actions">
            <button
              className="import-export__btn import-export__btn--secondary"
              onClick={handleDownloadAllContexts}
              disabled={generatingContexts || contextRegistry.length === 0}
            >
              <Icon name="download" size={16} />
              <span>Download All</span>
            </button>
            <button
              className="import-export__btn import-export__btn--primary"
              onClick={handleRegenerateContexts}
              disabled={generatingContexts}
            >
              {generatingContexts ? (
                <>
                  <Icon name="loader" size={16} />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Icon name="refresh-cw" size={16} />
                  <span>Generate All</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.section>

      {/* Best Practices */}
      <motion.section
        className="import-export__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
        transition={{ delay: 0.3 }}
      >
        <div className="import-export__tips">
          <h3 className="import-export__tips-header">
            <Icon name="lightbulb" size={18} />
            <span>Best Practices</span>
          </h3>
          <ul className="import-export__tips-list">
            <li>Export backups regularly, especially before major data changes</li>
            <li>Store backups in multiple locations (local drive, cloud storage, email)</li>
            <li>Name backups with dates for easy identification</li>
            <li>Test imports on a separate device or browser profile first</li>
            <li>Always export before importing to preserve current state</li>
          </ul>
        </div>
      </motion.section>
    </div>
  );
}

export default ImportExportManager;
