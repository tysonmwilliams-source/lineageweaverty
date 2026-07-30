/**
 * EpithetsSection Component
 * 
 * Reusable component for managing epithets (descriptive bynames)
 * Used in PersonForm and QuickEditPanel for adding/editing/removing epithets.
 * 
 * Features:
 * - Add new epithets with optional metadata
 * - Set primary epithet for display
 * - Remove epithets
 * - View epithet details
 * - Theme-aware styling
 */

import { useState } from 'react';
import {
  EPITHET_SOURCES,
  EPITHET_EARNED_FROM,
  createEpithet,
  formatEpithetText,
  validateEpithet,
  addEpithet,
  removeEpithet,
  setPrimaryEpithet
} from '../utils/epithetUtils';
import Icon from './icons';
import './EpithetsSection.css';

function EpithetsSection({ 
  epithets = [], 
  onChange,
  // isDarkTheme is accepted for backwards compatibility but no longer used —
  // colours come from CSS custom properties, which is why this component now
  // renders correctly in all seven themes rather than just 'dark' and 'light'.
  isDarkTheme: _isDarkTheme = true,
  compact = false,  // Compact mode for QuickEditPanel
  readOnly = false  // View-only mode
}) {
  // ==================== STATE ====================
  const [isAdding, setIsAdding] = useState(false);
  const [newEpithet, setNewEpithet] = useState({
    text: '',
    source: 'popular',
    earnedFrom: 'deed',
    dateEarned: '',
    notes: ''
  });
  const [showDetails, setShowDetails] = useState(null); // ID of epithet showing details
  const [validationErrors, setValidationErrors] = useState([]);


  // ==================== HANDLERS ====================

  const handleAddEpithet = () => {
    // Validate
    const validation = validateEpithet(newEpithet);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Format the text
    const formattedText = formatEpithetText(newEpithet.text);
    
    // Create epithet object
    const epithetObj = createEpithet(formattedText, {
      source: newEpithet.source,
      earnedFrom: newEpithet.earnedFrom,
      dateEarned: newEpithet.dateEarned || null,
      notes: newEpithet.notes || null
    });

    // Add to array (first epithet becomes primary automatically)
    const isFirst = !epithets || epithets.length === 0;
    const updated = addEpithet(epithets, epithetObj, isFirst);
    
    // Notify parent
    onChange(updated);

    // Reset form
    setNewEpithet({
      text: '',
      source: 'popular',
      earnedFrom: 'deed',
      dateEarned: '',
      notes: ''
    });
    setValidationErrors([]);
    setIsAdding(false);
  };

  const handleRemoveEpithet = (epithetId) => {
    const updated = removeEpithet(epithets, epithetId);
    onChange(updated);
    setShowDetails(null);
  };

  const handleSetPrimary = (epithetId) => {
    const updated = setPrimaryEpithet(epithets, epithetId);
    onChange(updated);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewEpithet({
      text: '',
      source: 'popular',
      earnedFrom: 'deed',
      dateEarned: '',
      notes: ''
    });
    setValidationErrors([]);
  };

  // ==================== RENDER HELPERS ====================

  const renderEpithetChip = (epithet) => {
    const sourceInfo = EPITHET_SOURCES[epithet.source] || EPITHET_SOURCES.popular;
    const isExpanded = showDetails === epithet.id;

    return (
      <div key={epithet.id} className="epithets__item">
        {/* Chip */}
        <div
          className={`epithets__chip ${epithet.isPrimary ? 'epithets__chip--primary' : ''}`}
          onClick={() => setShowDetails(isExpanded ? null : epithet.id)}
        >
          <div className="epithets__chip-main">
            <span className="epithets__chip-source" title={sourceInfo.label}>{sourceInfo.icon}</span>
            <span className="epithets__chip-text">{epithet.text}</span>
            {epithet.isPrimary && (
              <span className="epithets__badge">
                Primary
              </span>
            )}
          </div>
          
          {!readOnly && (
            <div className="epithets__chip-toggle">
              <span>{isExpanded ? <Icon name="chevron-up" size={14} /> : <Icon name="chevron-down" size={14} />}</span>
            </div>
          )}
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="epithets__detail">
            <div className="epithets__detail-list">
              <div className="epithets__detail-row">
                <span className="epithets__detail-label">Source:</span>
                <span className="epithets__detail-value">{sourceInfo.icon} {sourceInfo.label}</span>
              </div>
              
              {epithet.earnedFrom && (
                <div className="epithets__detail-row">
                  <span className="epithets__detail-label">From:</span>
                  <span className="epithets__detail-value">
                    {EPITHET_EARNED_FROM[epithet.earnedFrom]?.icon} {EPITHET_EARNED_FROM[epithet.earnedFrom]?.label}
                  </span>
                </div>
              )}
              
              {epithet.dateEarned && (
                <div className="epithets__detail-row">
                  <span className="epithets__detail-label">Date:</span>
                  <span className="epithets__detail-value">{epithet.dateEarned}</span>
                </div>
              )}
              
              {epithet.notes && (
                <div>
                  <span className="epithets__detail-label">Notes:</span>
                  <p className="epithets__detail-notes">{epithet.notes}</p>
                </div>
              )}
              
              {/* Actions */}
              {!readOnly && (
                <div className="epithets__actions">
                  {!epithet.isPrimary && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetPrimary(epithet.id);
                      }}
                      className="epithets__btn epithets__btn--primary"
                      type="button"
                    >
                      <Icon name="star" size={14} /> Set Primary
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveEpithet(epithet.id);
                    }}
                    className="epithets__btn epithets__btn--danger"
                    type="button"
                  >
                    <Icon name="trash-2" size={14} /> Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAddForm = () => (
    <div className="epithets__form">
      <div className="epithets__form-fields">
        {/* Epithet Text */}
        <div>
          <label className="epithets__label">
            Epithet *
          </label>
          <input
            type="text"
            value={newEpithet.text}
            onChange={(e) => setNewEpithet({ ...newEpithet, text: e.target.value })}
            placeholder='e.g., "the Bold", "Dragonslayer", "of Thornhaven"'
            className="epithets__input"
            autoFocus
          />
        </div>

        {/* Source & Earned From (row) */}
        {!compact && (
          <div className="epithets__form-row">
            <div>
              <label className="epithets__label">
                Source
              </label>
              <select
                value={newEpithet.source}
                onChange={(e) => setNewEpithet({ ...newEpithet, source: e.target.value })}
                className="epithets__select"
              >
                {Object.values(EPITHET_SOURCES).map(source => (
                  <option key={source.id} value={source.id}>
                    {source.icon} {source.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="epithets__label">
                Earned From
              </label>
              <select
                value={newEpithet.earnedFrom}
                onChange={(e) => setNewEpithet({ ...newEpithet, earnedFrom: e.target.value })}
                className="epithets__select"
              >
                {Object.values(EPITHET_EARNED_FROM).map(type => (
                  <option key={type.id} value={type.id}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Date Earned */}
        {!compact && (
          <div>
            <label className="epithets__label">
              Date Earned <span className="epithets__label--optional">(optional)</span>
            </label>
            <input
              type="text"
              value={newEpithet.dateEarned}
              onChange={(e) => setNewEpithet({ ...newEpithet, dateEarned: e.target.value })}
              placeholder="e.g., 1267"
              className="epithets__input"
            />
          </div>
        )}

        {/* Notes */}
        {!compact && (
          <div>
            <label className="epithets__label">
              Notes <span className="epithets__label--optional">(optional)</span>
            </label>
            <textarea
              value={newEpithet.notes}
              onChange={(e) => setNewEpithet({ ...newEpithet, notes: e.target.value })}
              placeholder="How was this epithet earned?"
              rows={2}
              className="epithets__textarea"
            />
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="epithets__errors">
            {validationErrors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="epithets__form-actions">
          <button
            onClick={handleCancelAdd}
            className="epithets__form-btn epithets__form-btn--cancel"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleAddEpithet}
            disabled={!newEpithet.text.trim()}
            className="epithets__form-btn epithets__form-btn--confirm"
            type="button"
          >
            <Icon name="check" size={14} /> Add Epithet
          </button>
        </div>
      </div>
    </div>
  );

  // ==================== MAIN RENDER ====================

  return (
    <div>
      {/* Epithets List */}
      {epithets && epithets.length > 0 ? (
        <div className="epithets">
          {epithets.map(epithet => renderEpithetChip(epithet))}
        </div>
      ) : (
        <div className="epithets__empty">
          No epithets recorded
        </div>
      )}

      {/* Add Button / Form */}
      {!readOnly && (
        isAdding ? (
          renderAddForm()
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="epithets__add"
            type="button"
          >
            <Icon name="plus" size={14} />
            <span>Add Epithet</span>
          </button>
        )
      )}
    </div>
  );
}

export default EpithetsSection;
