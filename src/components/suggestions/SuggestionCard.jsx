/**
 * SuggestionCard.jsx - Displays a single analysis suggestion
 *
 * PURPOSE:
 * Shows severity indicator, title, description, affected entities,
 * and action buttons (Apply, Dismiss, Defer).
 *
 * USAGE:
 * <SuggestionCard
 *   suggestion={suggestion}
 *   onApply={handleApply}
 *   onDismiss={handleDismiss}
 *   onDefer={handleDefer}
 * />
 */

import { useState, useCallback, useMemo, memo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import { SUGGESTION_TYPES, SEVERITY_LEVELS } from '../../data/suggestionTypes';
import './SuggestionCard.css';

/**
 * SuggestionCard Component
 *
 * @param {Object} props
 * @param {Object} props.suggestion - The suggestion object to display
 * @param {Function} props.onApply - Called when Apply is clicked (async)
 * @param {Function} props.onDismiss - Called when Dismiss is clicked
 * @param {Function} props.onDefer - Called when Defer is clicked
 * @param {Function} props.onAlternativeAction - Called with action index
 * @param {boolean} props.showPreview - Show action preview (default: true)
 * @param {boolean} props.compact - Compact display mode (default: false)
 * @param {boolean} props.disabled - Disable all actions
 */
const SuggestionCard = forwardRef(function SuggestionCard(
  {
    suggestion,
    onApply,
    onDismiss,
    onDefer,
    onAlternativeAction,
    showPreview = true,
    compact = false,
    disabled = false
  },
  ref
) {
  const [expanded, setExpanded] = useState(!compact);
  const [applying, setApplying] = useState(false);

  // Get severity and type configuration
  const severityConfig = useMemo(() =>
    SEVERITY_LEVELS[suggestion.severity] || SEVERITY_LEVELS.info,
    [suggestion.severity]
  );

  const typeConfig = useMemo(() =>
    SUGGESTION_TYPES[suggestion.type] || {},
    [suggestion.type]
  );

  // Confidence as percentage
  const confidencePercent = useMemo(() =>
    Math.round(suggestion.confidence * 100),
    [suggestion.confidence]
  );

  // Build class names
  const cardClass = useMemo(() => {
    const classes = [
      'suggestion-card',
      `suggestion-card--${suggestion.severity}`
    ];
    if (compact) classes.push('suggestion-card--compact');
    if (suggestion.dismissed) classes.push('suggestion-card--dismissed');
    if (suggestion.applied) classes.push('suggestion-card--applied');
    if (suggestion.deferred) classes.push('suggestion-card--deferred');
    return classes.join(' ');
  }, [suggestion.severity, compact, suggestion.dismissed, suggestion.applied, suggestion.deferred]);

  // Handle apply action
  const handleApply = useCallback(async () => {
    if (applying || disabled) return;
    setApplying(true);
    try {
      await onApply?.(suggestion.id);
    } finally {
      setApplying(false);
    }
  }, [suggestion.id, onApply, applying, disabled]);

  // Handle dismiss action
  const handleDismiss = useCallback(() => {
    if (disabled) return;
    onDismiss?.(suggestion.id);
  }, [suggestion.id, onDismiss, disabled]);

  // Handle defer action
  const handleDefer = useCallback(() => {
    if (disabled) return;
    onDefer?.(suggestion.id);
  }, [suggestion.id, onDefer, disabled]);

  // Handle alternative action
  const handleAlternative = useCallback((index) => {
    if (disabled) return;
    onAlternativeAction?.(suggestion.id, index);
  }, [suggestion.id, onAlternativeAction, disabled]);

  // Toggle expand in compact mode
  const toggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // Get severity icon
  const severityIcon = useMemo(() => {
    switch (suggestion.severity) {
      case 'critical': return 'alert';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }, [suggestion.severity]);

  return (
    <motion.div
      ref={ref}
      className={cardClass}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      layout
    >
      {/* Header */}
      <div
        className="suggestion-card__header"
        onClick={compact ? toggleExpand : undefined}
        role={compact ? 'button' : undefined}
        tabIndex={compact ? 0 : undefined}
      >
        <div
          className="suggestion-card__severity"
          style={{ color: severityConfig.color }}
          title={severityConfig.name}
        >
          <Icon name={severityIcon} size={compact ? 16 : 20} />
        </div>

        <div className="suggestion-card__title-area">
          <h4 className="suggestion-card__title">{suggestion.title}</h4>
          {!compact && (
            <span className="suggestion-card__type">
              <Icon name={typeConfig.icon || 'help'} size={14} />
              {typeConfig.name}
            </span>
          )}
        </div>

        <div
          className="suggestion-card__confidence"
          title={`${confidencePercent}% confidence`}
        >
          <span className="suggestion-card__confidence-value">
            {confidencePercent}%
          </span>
        </div>

        {compact && (
          <button
            className="suggestion-card__expand"
            onClick={toggleExpand}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        )}
      </div>

      {/* Body (expandable in compact mode) */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            className="suggestion-card__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <p className="suggestion-card__description">
              {suggestion.description}
            </p>

            {suggestion.reasoning && (
              <p className="suggestion-card__reasoning">
                <Icon name="lightbulb" size={14} />
                <span>{suggestion.reasoning}</span>
              </p>
            )}

            {/* Affected Entities */}
            {suggestion.affectedEntities?.length > 0 && (
              <div className="suggestion-card__entities">
                <span className="suggestion-card__entities-label">Affects:</span>
                <div className="suggestion-card__entities-list">
                  {suggestion.affectedEntities.map((entity) => (
                    <span
                      key={`${entity.type}-${entity.id}`}
                      className={`suggestion-card__entity suggestion-card__entity--${entity.type}`}
                    >
                      {entity.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Preview */}
            {showPreview && suggestion.suggestedAction?.preview && (
              <div className="suggestion-card__preview">
                <Icon name="eye" size={14} />
                <span>{suggestion.suggestedAction.preview}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      {expanded && !suggestion.applied && !suggestion.dismissed && (
        <div className="suggestion-card__actions">
          <ActionButton
            icon={applying ? 'refresh' : 'check'}
            onClick={handleApply}
            variant="primary"
            size="sm"
            disabled={disabled || applying}
            loading={applying}
          >
            {suggestion.suggestedAction?.label || 'Apply'}
          </ActionButton>

          {suggestion.alternativeActions?.length > 0 && (
            <ActionButton
              icon="more"
              onClick={() => handleAlternative(0)}
              variant="secondary"
              size="sm"
              disabled={disabled}
              title={suggestion.alternativeActions[0]?.label}
            >
              Alt
            </ActionButton>
          )}

          <ActionButton
            icon="clock"
            onClick={handleDefer}
            variant="secondary"
            size="sm"
            disabled={disabled}
          >
            Later
          </ActionButton>

          <ActionButton
            icon="x"
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            disabled={disabled}
          >
            Dismiss
          </ActionButton>
        </div>
      )}

      {/* Status indicators */}
      {suggestion.applied && (
        <div className="suggestion-card__status suggestion-card__status--applied">
          <Icon name="check-circle" size={14} />
          <span>Applied</span>
        </div>
      )}

      {suggestion.dismissed && (
        <div className="suggestion-card__status suggestion-card__status--dismissed">
          <Icon name="x-circle" size={14} />
          <span>Dismissed</span>
        </div>
      )}

      {suggestion.deferred && !suggestion.applied && !suggestion.dismissed && (
        <div className="suggestion-card__status suggestion-card__status--deferred">
          <Icon name="clock" size={14} />
          <span>Deferred</span>
        </div>
      )}
    </motion.div>
  );
});

export default memo(SuggestionCard);
