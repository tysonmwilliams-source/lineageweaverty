/**
 * Enhanced Codex Import Tool Component
 *
 * UI for importing new codex data and enhancing existing entries.
 * All previous imports have been completed and archived.
 *
 * STYLED TO MATCH: Medieval manuscript aesthetic using theme CSS variables
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { importCodexData } from '../utils/enhanced-codex-import';
import { forceUploadToCloud } from '../services/dataSyncService';
import NORTHERN_SEATS_CODEX_DATA from '../data/northern-seats-codex-data';
import './EnhancedCodexImportTool.css';

export default function EnhancedCodexImportTool() {
  const { user } = useAuth();
  const { activeDataset } = useDataset();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleImportNorthernSeats = async () => {
    if (!window.confirm('Import 10 Northern Crown Seat entries into The Codex?\n\nDuplicate entries will be skipped.')) {
      return;
    }

    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const datasetId = activeDataset?.id || 'default';

      const result = await importCodexData(NORTHERN_SEATS_CODEX_DATA, {
        skipDuplicates: true,
        userId: user?.uid || null,
        datasetId,
        onProgress: (p) => setProgress(p)
      });

      // Cloud sync after import. Previously this uploaded the active dataset
      // while the import itself wrote to the default one.
      if (user?.uid) {
        try {
          await forceUploadToCloud(user.uid, datasetId);
        } catch (syncErr) {
          console.warn('Cloud sync after import failed:', syncErr);
        }
      }

      setResults(result);
    } catch (err) {
      console.error('Northern seats import failed:', err);
      setError(err.message);
    } finally {
      setImporting(false);
      setProgress(null);
    }
  };

  const seatsImported = results && results.locations?.length > 0;

  return (
    <div className="import-tool">
      <h2 className="import-tool__title">
        Codex Import Tool
      </h2>

      {/* Cloud Sync Status */}
      <div className={`import-tool__sync-status ${user ? 'import-tool__sync-status--active' : 'import-tool__sync-status--warning'}`}>
        <span className="import-tool__sync-icon">{user ? '☁️' : '⚠️'}</span>
        <span>
          {user
            ? <><strong>Cloud Sync Active:</strong> Your codex is synced to the cloud.</>
            : <><strong>Not Signed In:</strong> Sign in to sync your codex across devices.</>}
        </span>
      </div>

      {/* Available Import: Northern Crown Seats */}
      {!seatsImported && (
        <div className="import-tool__sources">
          <h3 className="import-tool__sources-title">Available Imports</h3>
          <div className="import-tool__option" onClick={!importing ? handleImportNorthernSeats : undefined}>
            <div className="import-tool__option-content">
              <strong>Northern Crown Seats</strong>
              <span className="import-tool__option-count">(10 locations)</span>
            </div>
            <div className="import-tool__option-subtitle">
              Seats and estates of the 10 Northern Crown Houses — Merehall, Wardkeep, Granford Keep, Moorstead, Helm Castle, Blackmoor Hall, Cresthold, Thornwick Manor, Ashford Hall, Fenwick Keep
            </div>
          </div>

          <div className="import-tool__actions">
            <button
              className="import-tool__button import-tool__button--primary"
              onClick={handleImportNorthernSeats}
              disabled={importing}
            >
              {importing ? 'Importing...' : 'Import Northern Crown Seats'}
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {importing && progress && (
        <div className="import-tool__progress">
          <div className="import-tool__progress-label">
            Importing: {progress.current}
          </div>
          <div className="import-tool__progress-bar">
            <div
              className="import-tool__progress-fill"
              style={{ width: `${(progress.processed / progress.total) * 100}%` }}
            />
          </div>
          <div className="import-tool__progress-count">
            {progress.processed} / {progress.total}
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className={`import-tool__results ${results.errors.length > 0 ? 'import-tool__results--warning' : 'import-tool__results--success'}`}>
          <h3 className="import-tool__results-title">
            {results.errors.length > 0 ? 'Import Complete (with errors)' : 'Import Successful'}
          </h3>
          <div className="import-tool__results-stats">
            <p><strong>Locations:</strong> {results.locations.length} imported</p>
            <p><strong>Skipped:</strong> {results.skipped.length} (duplicates)</p>
            <p><strong>Errors:</strong> {results.errors.length}</p>
            <p><strong>Duration:</strong> {results.timing.duration}ms</p>
          </div>
          {results.skipped.length > 0 && (
            <div className="import-tool__results-skipped">
              <h4>Skipped Entries:</h4>
              <ul>
                {results.skipped.map((s, i) => (
                  <li key={i}>{s.title} — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {results.errors.length > 0 && (
            <div className="import-tool__results-errors">
              <h4>Errors:</h4>
              <ul>
                {results.errors.map((e, i) => (
                  <li key={i}>{e.title} — {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="import-tool__error">
          <h3>Import Failed</h3>
          <p>{error}</p>
        </div>
      )}

      {/* Completed Archives */}
      <div className="import-tool__empty">
        <div className="import-tool__empty-icon">✅</div>
        <h3 className="import-tool__empty-title">Completed Imports</h3>
        <p className="import-tool__empty-description">
          Previously imported worldbuilding data:
        </p>
        <div className="import-tool__empty-archives">
          <ul>
            <li>House Wilfrey (Original)</li>
            <li>The Veritists (Expansion)</li>
            <li>Charter of Driht & Ward</li>
            <li>Breakmount-Riverhead Alliance</li>
            <li>Bastardy Naming Laws</li>
            <li>Wilfrey Voice & Culture</li>
            <li>Entry Enhancements (Voice of Seats)</li>
            {seatsImported && <li>Northern Crown Seats</li>}
          </ul>
        </div>
      </div>

      {/* Help Text */}
      <div className="import-tool__help">
        <p><strong>Note:</strong></p>
        <ul>
          <li>New import options will appear here when additional worldbuilding data is available</li>
          <li>Existing entries can be edited directly in The Codex</li>
        </ul>
      </div>
    </div>
  );
}
