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

function EpithetsSection({ 
  epithets = [], 
  onChange,
  isDarkTheme = true,
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

  // ==================== THEME ====================
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    bgLight: '#3a2f20',
    bgLighter: '#4a3d2a',
    text: '#e9dcc9',
    textSecondary: '#b8a989',
    border: '#4a3d2a',
    accent: '#d4a574',
    success: '#6b8e5e',
    danger: '#a65d5d',
    warning: '#c4a44e'
  } : {
    bg: '#ede7dc',
    bgLight: '#e5dfd0',
    bgLighter: '#d8d0c0',
    text: '#2d2418',
    textSecondary: '#4a3d2a',
    border: '#d4c4a4',
    accent: '#b8874a',
    success: '#5a7a4a',
    danger: '#8a4a4a',
    warning: '#a08030'
  };

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
      <div key={epithet.id} className="mb-2">
        {/* Chip */}
        <div 
          className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${
            epithet.isPrimary ? 'ring-2' : ''
          }`}
          style={{ 
            backgroundColor: theme.bgLight, 
            borderColor: epithet.isPrimary ? theme.accent : theme.border,
            color: theme.text,
            ringColor: theme.accent
          }}
          onClick={() => setShowDetails(isExpanded ? null : epithet.id)}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm" title={sourceInfo.label}>{sourceInfo.icon}</span>
            <span className="font-medium truncate">{epithet.text}</span>
            {epithet.isPrimary && (
              <span 
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: theme.accent, color: isDarkTheme ? '#1a1410' : '#ffffff' }}
              >
                Primary
              </span>
            )}
          </div>
          
          {!readOnly && (
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs opacity-60">{isExpanded ? <Icon name="chevron-up" size={14} /> : <Icon name="chevron-down" size={14} />}</span>
            </div>
          )}
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div 
            className="mt-1 p-3 rounded border-l-2 ml-2"
            style={{ 
              backgroundColor: theme.bgLighter, 
              borderColor: theme.accent
            }}
          >
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span style={{ color: theme.textSecondary }}>Source:</span>
                <span style={{ color: theme.text }}>{sourceInfo.icon} {sourceInfo.label}</span>
              </div>
              
              {epithet.earnedFrom && (
                <div className="flex items-center gap-2">
                  <span style={{ color: theme.textSecondary }}>From:</span>
                  <span style={{ color: theme.text }}>
                    {EPITHET_EARNED_FROM[epithet.earnedFrom]?.icon} {EPITHET_EARNED_FROM[epithet.earnedFrom]?.label}
                  </span>
                </div>
              )}
              
              {epithet.dateEarned && (
                <div className="flex items-center gap-2">
                  <span style={{ color: theme.textSecondary }}>Date:</span>
                  <span style={{ color: theme.text }}>{epithet.dateEarned}</span>
                </div>
              )}
              
              {epithet.notes && (
                <div>
                  <span style={{ color: theme.textSecondary }}>Notes:</span>
                  <p className="mt-1" style={{ color: theme.text }}>{epithet.notes}</p>
                </div>
              )}
              
              {/* Actions */}
              {!readOnly && (
                <div className="flex gap-2 pt-2 border-t" style={{ borderColor: theme.border }}>
                  {!epithet.isPrimary && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetPrimary(epithet.id);
                      }}
                      className="text-xs px-2 py-1 rounded border transition hover:opacity-80"
                      style={{ 
                        color: theme.accent, 
                        borderColor: theme.accent,
                        backgroundColor: 'transparent'
                      }}
                    >
                      <Icon name="star" size={14} /> Set Primary
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveEpithet(epithet.id);
                    }}
                    className="text-xs px-2 py-1 rounded border transition hover:opacity-80"
                    style={{ 
                      color: theme.danger, 
                      borderColor: theme.danger,
                      backgroundColor: 'transparent'
                    }}
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
    <div 
      className="p-3 rounded border mt-2"
      style={{ backgroundColor: theme.bgLighter, borderColor: theme.accent }}
    >
      <div className="space-y-3">
        {/* Epithet Text */}
        <div>
          <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
            Epithet *
          </label>
          <input
            type="text"
            value={newEpithet.text}
            onChange={(e) => setNewEpithet({ ...newEpithet, text: e.target.value })}
            placeholder='e.g., "the Bold", "Dragonslayer", "of Thornhaven"'
            className="w-full p-2 rounded border text-sm"
            style={{
              backgroundColor: theme.bg,
              color: theme.text,
              borderColor: theme.border
            }}
            autoFocus
          />
        </div>

        {/* Source & Earned From (row) */}
        {!compact && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
                Source
              </label>
              <select
                value={newEpithet.source}
                onChange={(e) => setNewEpithet({ ...newEpithet, source: e.target.value })}
                className="w-full p-2 rounded border text-sm"
                style={{
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: theme.border
                }}
              >
                {Object.values(EPITHET_SOURCES).map(source => (
                  <option key={source.id} value={source.id}>
                    {source.icon} {source.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
                Earned From
              </label>
              <select
                value={newEpithet.earnedFrom}
                onChange={(e) => setNewEpithet({ ...newEpithet, earnedFrom: e.target.value })}
                className="w-full p-2 rounded border text-sm"
                style={{
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: theme.border
                }}
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
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Date Earned <span className="opacity-50">(optional)</span>
            </label>
            <input
              type="text"
              value={newEpithet.dateEarned}
              onChange={(e) => setNewEpithet({ ...newEpithet, dateEarned: e.target.value })}
              placeholder="e.g., 1267"
              className="w-full p-2 rounded border text-sm"
              style={{
                backgroundColor: theme.bg,
                color: theme.text,
                borderColor: theme.border
              }}
            />
          </div>
        )}

        {/* Notes */}
        {!compact && (
          <div>
            <label className="block text-xs mb-1" style={{ color: theme.textSecondary }}>
              Notes <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              value={newEpithet.notes}
              onChange={(e) => setNewEpithet({ ...newEpithet, notes: e.target.value })}
              placeholder="How was this epithet earned?"
              rows={2}
              className="w-full p-2 rounded border text-sm resize-none"
              style={{
                backgroundColor: theme.bg,
                color: theme.text,
                borderColor: theme.border
              }}
            />
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div 
            className="p-2 rounded text-sm"
            style={{ backgroundColor: `${theme.danger}20`, color: theme.danger }}
          >
            {validationErrors.map((err, i) => (
              <div key={i}>• {err}</div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleCancelAdd}
            className="flex-1 py-2 rounded border text-sm font-medium transition hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              color: theme.text,
              borderColor: theme.border
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAddEpithet}
            disabled={!newEpithet.text.trim()}
            className="flex-1 py-2 rounded text-sm font-medium transition hover:opacity-90"
            style={{
              backgroundColor: newEpithet.text.trim() ? theme.accent : theme.bgLight,
              color: isDarkTheme ? '#1a1410' : '#ffffff',
              opacity: newEpithet.text.trim() ? 1 : 0.6
            }}
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
        <div className="space-y-1">
          {epithets.map(epithet => renderEpithetChip(epithet))}
        </div>
      ) : (
        <div 
          className="p-3 rounded border text-center text-sm"
          style={{ 
            backgroundColor: theme.bgLight, 
            borderColor: theme.border, 
            color: theme.textSecondary,
            borderStyle: 'dashed'
          }}
        >
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
            className="w-full py-2 px-3 rounded border transition-all flex items-center justify-center gap-2 mt-2"
            style={{
              backgroundColor: 'transparent',
              color: theme.accent,
              borderColor: theme.accent,
              borderStyle: 'dashed',
              cursor: 'pointer'
            }}
          >
            <span>+</span>
            <span>Add Epithet</span>
          </button>
        )
      )}
    </div>
  );
}

export default EpithetsSection;
