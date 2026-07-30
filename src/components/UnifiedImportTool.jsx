/**
 * UnifiedImportTool.jsx - Unified Data Import Component
 *
 * PURPOSE:
 * Single import tool that auto-detects payload type and handles:
 * - Family data (houses, people, relationships)
 * - Codex entries (any category)
 * - Codex enhancements
 * - Mixed payloads combining all of the above
 *
 * Replaces BulkFamilyImportTool with broader capabilities.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenealogy } from '../contexts/GenealogyContext';
import { useDataset } from '../contexts/DatasetContext';
import { useAuth } from '../contexts/AuthContext';
import {
  unifiedImport,
  validatePayload,
  detectPayloadTypes,
  generateUnifiedReport
} from '../utils/unifiedImport';
import Icon from './icons';
import './UnifiedImportTool.css';
import { logger } from '../utils/logger';

// ═══════════════════════════════════════════════════════════════════════════
// ANIMATION VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

const ALERT_VARIANTS = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } }
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function UnifiedImportTool() {
  const { refreshData } = useGenealogy();
  const { user } = useAuth();
  const { activeDataset } = useDataset();

  // File and payload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [payload, setPayload] = useState(null);
  const [validation, setValidation] = useState(null);
  const [payloadTypes, setPayloadTypes] = useState(null);

  // Import options
  const [options, setOptions] = useState({
    skipCodex: false,
    skipEnhancements: false,
    skipDuplicates: true
  });

  // Import state
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [importResult, setImportResult] = useState(null);

  // ─────────────────────────────────────────────────────────────────────────
  // FILE HANDLING
  // ─────────────────────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setPayload(null);
    setValidation(null);
    setPayloadTypes(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Remove metadata fields before processing
      const cleanPayload = { ...parsed };
      delete cleanPayload._template_info;
      delete cleanPayload._id_system;
      delete cleanPayload._validation_rules;
      delete cleanPayload._meta;

      setPayload(cleanPayload);

      // Detect payload types
      const types = detectPayloadTypes(cleanPayload);
      setPayloadTypes(types);

      // Validate
      setValidating(true);
      try {
        const result = await validatePayload(cleanPayload, {
          datasetId: activeDataset?.id
        });
        setValidation(result);
      } finally {
        setValidating(false);
      }
    } catch (err) {
      setValidating(false);
      setValidation({
        valid: false,
        errors: [`Failed to parse JSON: ${err.message}`],
        warnings: [],
        counts: {}
      });
    }
  }, [activeDataset?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT EXECUTION
  // ─────────────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!payload || !validation?.valid) return;

    const counts = validation.counts || {};
    const parts = [];
    if (counts.houses) parts.push(`${counts.houses} houses`);
    if (counts.people) parts.push(`${counts.people} people`);
    if (counts.relationships) parts.push(`${counts.relationships} relationships`);
    if (counts.codexEntries) parts.push(`${counts.codexEntries} codex entries`);
    if (counts.codexEnhancements) parts.push(`${counts.codexEnhancements} enhancements`);

    const confirmMsg = `This will import:\n${parts.map(p => `  ${p}`).join('\n')}\n\nProceed?`;
    if (!confirm(confirmMsg)) return;

    setImporting(true);
    setProgress({ phase: 'starting', message: 'Starting import...', pct: 0 });

    try {
      const result = await unifiedImport(payload, {
        datasetId: activeDataset?.id,
        userId: user?.uid,
        skipDuplicates: options.skipDuplicates,
        skipCodex: options.skipCodex,
        skipEnhancements: options.skipEnhancements,
        onProgress: (phase, step, message, pct) => {
          setProgress({ phase, step, message, pct });
        }
      });

      setImportResult(result);

      if (result.success) {
        await refreshData();
        logger.log(generateUnifiedReport(result));
      }
    } catch (err) {
      setImportResult({
        success: false,
        errors: [`Import failed: ${err.message}`],
        summary: {}
      });
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }, [payload, validation, options, activeDataset?.id, user?.uid, refreshData]);

  // ─────────────────────────────────────────────────────────────────────────
  // RESET
  // ─────────────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setPayload(null);
    setValidation(null);
    setPayloadTypes(null);
    setImportResult(null);
    setProgress(null);
    const fileInput = document.getElementById('unified-import-file');
    if (fileInput) fileInput.value = '';
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const counts = validation?.counts || {};

  return (
    <div className="unified-import">
      <div className="unified-import__header">
        <Icon name="download" size={24} />
        <div className="unified-import__header-text">
          <h2 className="unified-import__title">Unified Import</h2>
          <p className="unified-import__subtitle">
            Import families, codex entries, or mixed data from a JSON template
          </p>
        </div>
      </div>

      {/* File Selection */}
      <motion.div
        className="unified-import__section"
        variants={SECTION_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <h3 className="unified-import__section-title">
          <Icon name="file-up" size={18} />
          <span>1. Select Import File</span>
        </h3>

        <div className="unified-import__file-area">
          <input
            id="unified-import-file"
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="unified-import__file-input"
            disabled={importing}
          />

          {selectedFile && (
            <div className="unified-import__file-info">
              <Icon name="file-text" size={16} />
              <span>{selectedFile.name}</span>
              <span className="unified-import__file-size">
                ({(selectedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}
        </div>

        <p className="unified-import__hint">
          Supports family templates, codex data, or mixed payloads.
          All sections are optional — include only what you need.
        </p>
      </motion.div>

      {/* Detected Type Badge */}
      <AnimatePresence mode="wait">
        {payloadTypes && !validating && (
          <motion.div
            className="unified-import__detected"
            variants={ALERT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <span className="unified-import__detected-label">Detected:</span>
            {payloadTypes.hasFamily && (
              <span className="unified-import__badge unified-import__badge--family">
                <Icon name="users" size={14} /> Family Data
              </span>
            )}
            {(payloadTypes.hasCodex || payloadTypes.hasCategoryCodex) && (
              <span className="unified-import__badge unified-import__badge--codex">
                <Icon name="book-open" size={14} /> Codex Entries
              </span>
            )}
            {payloadTypes.hasEnhancements && (
              <span className="unified-import__badge unified-import__badge--enhance">
                <Icon name="edit" size={14} /> Enhancements
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Results */}
      <AnimatePresence mode="wait">
        {validating && (
          <motion.div
            className="unified-import__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <h3 className="unified-import__section-title">
              <Icon name="loader" size={18} className="unified-import__spinner" />
              <span>2. Validating...</span>
            </h3>
            <p className="unified-import__hint">Checking structure and references...</p>
          </motion.div>
        )}
        {!validating && validation && (
          <motion.div
            className="unified-import__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <h3 className="unified-import__section-title">
              <Icon name={validation.valid ? 'check-circle' : 'alert-triangle'} size={18} />
              <span>2. Validation</span>
            </h3>

            {validation.valid ? (
              <div className="unified-import__validation unified-import__validation--success">
                <Icon name="check" size={20} />
                <div className="unified-import__validation-content">
                  <strong>Payload is valid!</strong>
                  <div className="unified-import__counts">
                    {counts.houses > 0 && <span>{counts.houses} houses</span>}
                    {counts.people > 0 && <span>{counts.people} people</span>}
                    {counts.relationships > 0 && <span>{counts.relationships} relationships</span>}
                    {counts.codexEntries > 0 && <span>{counts.codexEntries} codex entries</span>}
                    {counts.codexEnhancements > 0 && <span>{counts.codexEnhancements} enhancements</span>}
                  </div>
                  {validation.warnings?.length > 0 && (
                    <ul className="unified-import__warning-list">
                      {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="unified-import__validation unified-import__validation--error">
                <Icon name="x-circle" size={20} />
                <div className="unified-import__validation-content">
                  <strong>Validation Failed</strong>
                  <ul className="unified-import__error-list">
                    {validation.errors.map((error, i) => (
                      <li key={i}>{typeof error === 'string' ? error : error.message || JSON.stringify(error)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Options */}
      <AnimatePresence mode="wait">
        {payload && validation?.valid && !importResult && (
          <motion.div
            className="unified-import__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <h3 className="unified-import__section-title">
              <Icon name="settings" size={18} />
              <span>3. Import Options</span>
            </h3>

            <div className="unified-import__options">
              {(payloadTypes?.hasCodex || payloadTypes?.hasCategoryCodex) && (
                <>
                  <label className="unified-import__option">
                    <input
                      type="checkbox"
                      checked={options.skipDuplicates}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        skipDuplicates: e.target.checked
                      }))}
                    />
                    <span>Skip duplicate codex entries</span>
                    <span className="unified-import__option-hint">(recommended)</span>
                  </label>

                  <label className="unified-import__option">
                    <input
                      type="checkbox"
                      checked={!options.skipCodex}
                      onChange={(e) => setOptions(prev => ({
                        ...prev,
                        skipCodex: !e.target.checked
                      }))}
                    />
                    <span>Import codex entries</span>
                    <span className="unified-import__option-hint">
                      ({counts.codexEntries || 0} entries)
                    </span>
                  </label>
                </>
              )}

              {payloadTypes?.hasEnhancements && (
                <label className="unified-import__option">
                  <input
                    type="checkbox"
                    checked={!options.skipEnhancements}
                    onChange={(e) => setOptions(prev => ({
                      ...prev,
                      skipEnhancements: !e.target.checked
                    }))}
                  />
                  <span>Apply codex enhancements</span>
                  <span className="unified-import__option-hint">
                    ({counts.codexEnhancements || 0} enhancements)
                  </span>
                </label>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress */}
      <AnimatePresence>
        {importing && progress && (
          <motion.div
            className="unified-import__progress"
            variants={ALERT_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="unified-import__progress-top">
              <Icon name="loader" size={20} className="unified-import__spinner" />
              <span>{progress.message}</span>
            </div>
            {progress.pct != null && (
              <div className="unified-import__progress-bar">
                <div
                  className="unified-import__progress-fill"
                  style={{ width: `${Math.round(progress.pct)}%` }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Result */}
      <AnimatePresence mode="wait">
        {importResult && (
          <motion.div
            className="unified-import__section"
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <h3 className="unified-import__section-title">
              <Icon
                name={importResult.success ? 'check-circle' : 'x-circle'}
                size={18}
              />
              <span>Import Result</span>
            </h3>

            {importResult.success ? (
              <div className="unified-import__result unified-import__result--success">
                <Icon name="check-circle" size={24} />
                <div className="unified-import__result-content">
                  <strong>Import Successful!</strong>
                  <div className="unified-import__result-stats">
                    {importResult.summary.housesCreated > 0 && (
                      <span>{importResult.summary.housesCreated} houses</span>
                    )}
                    {importResult.summary.peopleCreated > 0 && (
                      <span>{importResult.summary.peopleCreated} people</span>
                    )}
                    {importResult.summary.relationshipsCreated > 0 && (
                      <span>{importResult.summary.relationshipsCreated} relationships</span>
                    )}
                    {importResult.summary.codexEntriesCreated > 0 && (
                      <span>{importResult.summary.codexEntriesCreated} codex entries</span>
                    )}
                    {importResult.summary.codexEntriesSkipped > 0 && (
                      <span className="unified-import__result-skipped">
                        {importResult.summary.codexEntriesSkipped} skipped (duplicates)
                      </span>
                    )}
                    {importResult.summary.codexEntriesEnhanced > 0 && (
                      <span>{importResult.summary.codexEntriesEnhanced} enhanced</span>
                    )}
                  </div>
                  {importResult.warnings?.length > 0 && (
                    <ul className="unified-import__warning-list">
                      {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="unified-import__result unified-import__result--error">
                <Icon name="x-circle" size={24} />
                <div className="unified-import__result-content">
                  <strong>Import Failed</strong>
                  <ul className="unified-import__error-list">
                    {importResult.errors?.map((error, i) => (
                      <li key={i}>{typeof error === 'string' ? error : error.message || JSON.stringify(error)}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="unified-import__actions">
        {payload && !importing && (
          <button
            className="unified-import__btn unified-import__btn--secondary"
            onClick={handleReset}
          >
            <Icon name="refresh-cw" size={16} />
            <span>Reset</span>
          </button>
        )}

        {validation?.valid && !importResult && (
          <button
            className="unified-import__btn unified-import__btn--primary"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? (
              <>
                <Icon name="loader" size={16} className="unified-import__spinner" />
                <span>Importing...</span>
              </>
            ) : (
              <>
                <Icon name="download" size={16} />
                <span>Import Data</span>
              </>
            )}
          </button>
        )}

        {importResult?.success && payloadTypes?.hasFamily && (
          <a
            href="/tree"
            className="unified-import__btn unified-import__btn--primary"
          >
            <Icon name="git-branch" size={16} />
            <span>View Family Tree</span>
          </a>
        )}

        {importResult?.success && (payloadTypes?.hasCodex || payloadTypes?.hasCategoryCodex) && (
          <a
            href="/codex"
            className="unified-import__btn unified-import__btn--primary"
          >
            <Icon name="book-open" size={16} />
            <span>View Codex</span>
          </a>
        )}
      </div>
    </div>
  );
}

export default UnifiedImportTool;
