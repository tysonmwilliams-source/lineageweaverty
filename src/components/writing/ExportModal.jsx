/**
 * ExportModal.jsx - Export Writing Modal
 *
 * Allows users to export their writing in various formats.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../icons';
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_LABELS,
  EXPORT_FORMAT_EXTENSIONS,
  exportWriting,
  downloadFile
} from '../../services/exportService';
import './ExportModal.css';
import { logger } from '../../utils/logger';

/**
 * ExportModal Component
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether modal is open
 * @param {Function} props.onClose - Close callback
 * @param {number} props.writingId - Writing ID
 * @param {string} props.writingTitle - Writing title
 * @param {string} props.datasetId - Dataset ID
 */
export default function ExportModal({
  isOpen,
  onClose,
  writingId,
  writingTitle,
  datasetId
}) {
  const [selectedFormat, setSelectedFormat] = useState(EXPORT_FORMATS.MARKDOWN);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const result = await exportWriting(writingId, selectedFormat, datasetId);
      downloadFile(result.content, result.filename, result.mimeType);
      onClose();
    } catch (err) {
      logger.error('Export failed:', err);
      setError(err.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="export-modal__overlay" onClick={onClose}>
      <motion.div
        className="export-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal__header">
          <h2>Export Writing</h2>
          <button
            className="export-modal__close"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="export-modal__content">
          <p className="export-modal__description">
            Export <strong>"{writingTitle}"</strong> to your preferred format.
          </p>

          <div className="export-modal__formats">
            {Object.values(EXPORT_FORMATS).map((format) => (
              <label
                key={format}
                className={`export-format ${selectedFormat === format ? 'export-format--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="format"
                  value={format}
                  checked={selectedFormat === format}
                  onChange={() => setSelectedFormat(format)}
                />
                <div className="export-format__icon">
                  <Icon
                    name={
                      format === EXPORT_FORMATS.MARKDOWN ? 'file-text' :
                      format === EXPORT_FORMATS.HTML ? 'code' :
                      format === EXPORT_FORMATS.PLAIN_TEXT ? 'file' :
                      'file-json'
                    }
                    size={24}
                    strokeWidth={1.5}
                  />
                </div>
                <div className="export-format__info">
                  <span className="export-format__name">
                    {EXPORT_FORMAT_LABELS[format]}
                  </span>
                  <span className="export-format__ext">
                    {EXPORT_FORMAT_EXTENSIONS[format]}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <div className="export-modal__error">
              <Icon name="alert-circle" size={16} strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="export-modal__footer">
          <button
            className="btn btn--secondary"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn--primary"
            onClick={handleExport}
            disabled={isExporting}
            type="button"
          >
            {isExporting ? (
              <>
                <div className="loader-spinner loader-spinner--small" />
                Exporting...
              </>
            ) : (
              <>
                <Icon name="download" size={16} strokeWidth={2} />
                Export
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
