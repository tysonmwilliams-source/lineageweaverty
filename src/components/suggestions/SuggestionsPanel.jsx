/**
 * SuggestionsPanel.jsx - Container for multiple suggestions
 *
 * PURPOSE:
 * Displays a list of suggestions with filtering, sorting,
 * and bulk actions. Can be used standalone or embedded.
 *
 * USAGE:
 * <SuggestionsPanel
 *   suggestions={suggestions}
 *   onApply={handleApply}
 *   onDismiss={handleDismiss}
 *   title="Analysis Results"
 * />
 */

import { useState, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import EmptyState from '../shared/EmptyState';
import SuggestionCard from './SuggestionCard';
import { SEVERITY_LEVELS, SUGGESTION_CATEGORIES } from '../../data/suggestionTypes';
import './SuggestionsPanel.css';

// Filter options
const FILTER_OPTIONS = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'critical', label: 'Critical', icon: 'alert' },
  { id: 'warning', label: 'Warnings', icon: 'warning' },
  { id: 'info', label: 'Info', icon: 'info' }
];

/**
 * SuggestionsPanel Component
 *
 * @param {Object} props
 * @param {Array} props.suggestions - Array of suggestion objects
 * @param {Function} props.onApply - Called when applying a suggestion
 * @param {Function} props.onDismiss - Called when dismissing a suggestion
 * @param {Function} props.onDefer - Called when deferring a suggestion
 * @param {Function} props.onAlternativeAction - Called for alternative actions
 * @param {Function} props.onDismissAll - Called to dismiss all of a type
 * @param {string} props.title - Panel title
 * @param {boolean} props.showFilters - Show filter tabs (default: true)
 * @param {boolean} props.showBulkActions - Show bulk actions (default: true)
 * @param {boolean} props.compact - Use compact card display
 * @param {string} props.emptyMessage - Message when no suggestions
 * @param {number} props.maxHeight - Max height with scroll (optional)
 */
function SuggestionsPanel({
  suggestions = [],
  onApply,
  onDismiss,
  onDefer,
  onAlternativeAction,
  onDismissAll,
  title = 'Suggestions',
  showFilters = true,
  showBulkActions = true,
  compact = false,
  emptyMessage = 'No suggestions found',
  maxHeight
}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedTypes, setExpandedTypes] = useState(new Set());

  // Filter suggestions based on active filter
  const filteredSuggestions = useMemo(() => {
    if (activeFilter === 'all') return suggestions;
    return suggestions.filter(s => s.severity === activeFilter);
  }, [suggestions, activeFilter]);

  // Group suggestions by category
  const groupedSuggestions = useMemo(() => {
    const groups = {};
    for (const suggestion of filteredSuggestions) {
      const category = SUGGESTION_CATEGORIES[
        Object.values(SUGGESTION_CATEGORIES).find(
          c => c.id === suggestion.type?.split('-')[0]
        )?.id || 'integrity'
      ]?.id || 'other';

      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(suggestion);
    }
    return groups;
  }, [filteredSuggestions]);

  // Count by severity
  const counts = useMemo(() => ({
    all: suggestions.length,
    critical: suggestions.filter(s => s.severity === 'critical').length,
    warning: suggestions.filter(s => s.severity === 'warning').length,
    info: suggestions.filter(s => s.severity === 'info').length
  }), [suggestions]);

  // Toggle category expansion
  const toggleCategory = useCallback((categoryId) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  // Dismiss all of a severity
  const handleDismissAllSeverity = useCallback((severity) => {
    const toDisimss = suggestions.filter(s => s.severity === severity);
    toDisimss.forEach(s => onDismiss?.(s.id, `Bulk dismissed ${severity}`));
  }, [suggestions, onDismiss]);

  // Container style for scrolling
  const containerStyle = useMemo(() => {
    if (!maxHeight) return {};
    return {
      maxHeight,
      overflowY: 'auto'
    };
  }, [maxHeight]);

  return (
    <div className="suggestions-panel">
      {/* Header */}
      <div className="suggestions-panel__header">
        <h3 className="suggestions-panel__title">
          <Icon name="lightbulb" size={20} />
          {title}
          <span className="suggestions-panel__count">{filteredSuggestions.length}</span>
        </h3>

        {showBulkActions && counts.all > 0 && (
          <div className="suggestions-panel__bulk-actions">
            <ActionButton
              icon="x"
              variant="ghost"
              size="sm"
              onClick={() => handleDismissAllSeverity(activeFilter === 'all' ? 'info' : activeFilter)}
              disabled={counts[activeFilter] === 0}
            >
              Dismiss All
            </ActionButton>
          </div>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="suggestions-panel__filters">
          {FILTER_OPTIONS.map(filter => (
            <button
              key={filter.id}
              className={`suggestions-panel__filter ${activeFilter === filter.id ? 'suggestions-panel__filter--active' : ''}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              <Icon name={filter.icon} size={14} />
              <span>{filter.label}</span>
              <span className="suggestions-panel__filter-count">
                {counts[filter.id]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="suggestions-panel__content" style={containerStyle}>
        {filteredSuggestions.length === 0 ? (
          <EmptyState
            icon="check-circle"
            title="All Clear"
            description={emptyMessage}
          />
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredSuggestions.map((suggestion, index) => (
              <motion.div
                key={suggestion.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
              >
                <SuggestionCard
                  suggestion={suggestion}
                  onApply={onApply}
                  onDismiss={onDismiss}
                  onDefer={onDefer}
                  onAlternativeAction={onAlternativeAction}
                  compact={compact}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer with stats */}
      {filteredSuggestions.length > 0 && (
        <div className="suggestions-panel__footer">
          <div className="suggestions-panel__stats">
            {counts.critical > 0 && (
              <span className="suggestions-panel__stat suggestions-panel__stat--critical">
                <Icon name="alert" size={12} />
                {counts.critical} critical
              </span>
            )}
            {counts.warning > 0 && (
              <span className="suggestions-panel__stat suggestions-panel__stat--warning">
                <Icon name="warning" size={12} />
                {counts.warning} warnings
              </span>
            )}
            {counts.info > 0 && (
              <span className="suggestions-panel__stat suggestions-panel__stat--info">
                <Icon name="info" size={12} />
                {counts.info} info
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(SuggestionsPanel);
