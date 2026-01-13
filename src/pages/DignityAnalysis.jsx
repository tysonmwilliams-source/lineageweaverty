/**
 * DignityAnalysis.jsx - Dignity Analysis Dashboard
 *
 * PURPOSE:
 * Full analysis dashboard for the Dignity Analysis System.
 * Provides comprehensive view of all data quality suggestions
 * with filtering, bulk actions, and history tracking.
 *
 * FEATURES:
 * - On-demand analysis trigger
 * - Statistics summary with health score
 * - Tabbed view by severity (All, Critical, Warnings, Info)
 * - Bulk dismiss/defer actions
 * - History of applied/dismissed suggestions
 *
 * DESIGN:
 * Follows the medieval manuscript aesthetic.
 * Uses Lucide icons, Framer Motion animations, and CSS custom properties.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { LoadingState, EmptyState, ActionButton } from '../components/shared';
import { SuggestionCard, AnalysisSummary } from '../components/suggestions';
import { useDignityAnalysis } from '../hooks';
import { SUGGESTION_TYPES } from '../data/suggestionTypes';
import './DignityAnalysis.css';

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  }
};

// Tab configuration
const TABS = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'critical', label: 'Critical', icon: 'alert-triangle' },
  { id: 'warning', label: 'Warnings', icon: 'alert-circle' },
  { id: 'info', label: 'Info', icon: 'info' },
  { id: 'deferred', label: 'Deferred', icon: 'clock' },
  { id: 'history', label: 'History', icon: 'history' }
];

/**
 * DignityAnalysis Component
 */
function DignityAnalysis() {
  const navigate = useNavigate();

  // Local state
  const [activeTab, setActiveTab] = useState('all');
  const [sortBy, setSortBy] = useState('severity');
  const [filterType, setFilterType] = useState('all');

  // Analysis hook
  const {
    suggestions,
    activeSuggestions,
    criticalSuggestions,
    warningSuggestions,
    infoSuggestions,
    deferredSuggestions,
    dismissedSuggestions,
    appliedSuggestions,
    stats,
    lastAnalyzed,
    loading,
    error,
    runAnalysis,
    applySuggestion,
    dismissSuggestion,
    deferSuggestion,
    undeferSuggestion,
    clearSuggestions,
    restoreDismissed
  } = useDignityAnalysis({ autoRun: false });

  // Get suggestions for current tab
  const tabSuggestions = useMemo(() => {
    switch (activeTab) {
      case 'critical':
        return criticalSuggestions;
      case 'warning':
        return warningSuggestions;
      case 'info':
        return infoSuggestions;
      case 'deferred':
        return deferredSuggestions;
      case 'history':
        return [...appliedSuggestions, ...dismissedSuggestions];
      default:
        return activeSuggestions;
    }
  }, [activeTab, activeSuggestions, criticalSuggestions, warningSuggestions, infoSuggestions, deferredSuggestions, appliedSuggestions, dismissedSuggestions]);

  // Filter by type
  const filteredSuggestions = useMemo(() => {
    if (filterType === 'all') return tabSuggestions;
    return tabSuggestions.filter(s => s.type === filterType);
  }, [tabSuggestions, filterType]);

  // Sort suggestions
  const sortedSuggestions = useMemo(() => {
    const sorted = [...filteredSuggestions];
    switch (sortBy) {
      case 'severity':
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        sorted.sort((a, b) => {
          const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
          if (severityDiff !== 0) return severityDiff;
          return b.confidence - a.confidence;
        });
        break;
      case 'confidence':
        sorted.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'type':
        sorted.sort((a, b) => a.type.localeCompare(b.type));
        break;
      case 'newest':
        sorted.sort((a, b) => new Date(b.created) - new Date(a.created));
        break;
      default:
        break;
    }
    return sorted;
  }, [filteredSuggestions, sortBy]);

  // Available types for filter
  const availableTypes = useMemo(() => {
    const types = new Set(tabSuggestions.map(s => s.type));
    return Array.from(types).sort();
  }, [tabSuggestions]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    all: activeSuggestions.length,
    critical: criticalSuggestions.length,
    warning: warningSuggestions.length,
    info: infoSuggestions.length,
    deferred: deferredSuggestions.length,
    history: appliedSuggestions.length + dismissedSuggestions.length
  }), [activeSuggestions, criticalSuggestions, warningSuggestions, infoSuggestions, deferredSuggestions, appliedSuggestions, dismissedSuggestions]);

  // Handlers
  const handleRunAnalysis = useCallback(async () => {
    try {
      await runAnalysis();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Analysis failed:', err);
      }
    }
  }, [runAnalysis]);

  const handleApply = useCallback(async (suggestionId) => {
    try {
      await applySuggestion(suggestionId);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to apply suggestion:', err);
      }
    }
  }, [applySuggestion]);

  const handleDismiss = useCallback((suggestionId) => {
    dismissSuggestion(suggestionId, 'User dismissed');
  }, [dismissSuggestion]);

  const handleDefer = useCallback((suggestionId) => {
    deferSuggestion(suggestionId);
  }, [deferSuggestion]);

  const handleBulkDismiss = useCallback(() => {
    const toDismiss = activeTab === 'all'
      ? activeSuggestions
      : tabSuggestions.filter(s => !s.dismissed && !s.applied);

    toDismiss.forEach(s => dismissSuggestion(s.id, 'Bulk dismissed'));
  }, [activeTab, activeSuggestions, tabSuggestions, dismissSuggestion]);

  const handleBulkDefer = useCallback(() => {
    const toDefer = activeTab === 'all'
      ? activeSuggestions.filter(s => !s.deferred)
      : tabSuggestions.filter(s => !s.deferred && !s.dismissed && !s.applied);

    toDefer.forEach(s => deferSuggestion(s.id));
  }, [activeTab, activeSuggestions, tabSuggestions, deferSuggestion]);

  const handleRestoreHistory = useCallback(() => {
    restoreDismissed();
  }, [restoreDismissed]);

  return (
    <div className="dignity-analysis">
      <Navigation />

      <div className="dignity-analysis__container">
        <motion.div
          className="dignity-analysis__content"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.header className="dignity-analysis__header" variants={ITEM_VARIANTS}>
            <div className="dignity-analysis__header-content">
              <button
                className="dignity-analysis__back"
                onClick={() => navigate('/dignities')}
                title="Back to Dignities"
              >
                <Icon name="arrow-left" size={20} />
              </button>
              <div className="dignity-analysis__title-area">
                <h1 className="dignity-analysis__title">
                  <Icon name="scan-search" size={28} className="dignity-analysis__title-icon" />
                  <span>Data Quality Analysis</span>
                </h1>
                <p className="dignity-analysis__subtitle">
                  Scan your genealogical data for issues and improvements
                </p>
              </div>
            </div>

            <div className="dignity-analysis__actions">
              <ActionButton
                icon={loading ? 'loader-2' : 'zap'}
                variant="primary"
                onClick={handleRunAnalysis}
                disabled={loading}
                className={loading ? 'spin-icon' : ''}
              >
                {loading ? 'Analyzing...' : lastAnalyzed ? 'Re-analyze' : 'Analyze Now'}
              </ActionButton>
            </div>
          </motion.header>

          {/* Error State */}
          {error && (
            <motion.div className="dignity-analysis__error" variants={ITEM_VARIANTS}>
              <Icon name="alert-triangle" size={20} />
              <span>{error}</span>
              <button onClick={() => handleRunAnalysis()}>Retry</button>
            </motion.div>
          )}

          {/* Summary Section */}
          {stats && (
            <motion.section className="dignity-analysis__summary" variants={ITEM_VARIANTS}>
              <AnalysisSummary
                stats={stats}
                lastAnalyzed={lastAnalyzed}
                loading={loading}
                onRunAnalysis={handleRunAnalysis}
              />
            </motion.section>
          )}

          {/* No Analysis Yet */}
          {!stats && !loading && (
            <motion.div className="dignity-analysis__empty" variants={ITEM_VARIANTS}>
              <EmptyState
                icon="scan-search"
                title="No Analysis Run Yet"
                description="Click 'Analyze Now' to scan your data for potential issues and improvements."
              />
            </motion.div>
          )}

          {/* Loading State */}
          {loading && !stats && (
            <motion.div className="dignity-analysis__loading" variants={ITEM_VARIANTS}>
              <LoadingState message="Analyzing your data..." />
            </motion.div>
          )}

          {/* Main Content - Only show after analysis */}
          {stats && (
            <>
              {/* Tabs */}
              <motion.div className="dignity-analysis__tabs" variants={ITEM_VARIANTS}>
                <div className="dignity-analysis__tabs-list">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      className={`dignity-analysis__tab ${activeTab === tab.id ? 'dignity-analysis__tab--active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon name={tab.icon} size={16} />
                      <span>{tab.label}</span>
                      {tabCounts[tab.id] > 0 && (
                        <span className={`dignity-analysis__tab-count dignity-analysis__tab-count--${tab.id}`}>
                          {tabCounts[tab.id]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Controls Bar */}
              <motion.div className="dignity-analysis__controls" variants={ITEM_VARIANTS}>
                <div className="dignity-analysis__filters">
                  {/* Type Filter */}
                  <div className="dignity-analysis__filter">
                    <label htmlFor="filter-type">Type:</label>
                    <select
                      id="filter-type"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="all">All Types</option>
                      {availableTypes.map(type => (
                        <option key={type} value={type}>
                          {SUGGESTION_TYPES[type]?.name || type}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sort */}
                  <div className="dignity-analysis__filter">
                    <label htmlFor="sort-by">Sort:</label>
                    <select
                      id="sort-by"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="severity">Severity</option>
                      <option value="confidence">Confidence</option>
                      <option value="type">Type</option>
                      <option value="newest">Newest</option>
                    </select>
                  </div>
                </div>

                {/* Bulk Actions */}
                {activeTab !== 'history' && sortedSuggestions.length > 0 && (
                  <div className="dignity-analysis__bulk-actions">
                    <ActionButton
                      icon="clock"
                      variant="secondary"
                      size="sm"
                      onClick={handleBulkDefer}
                    >
                      Defer All
                    </ActionButton>
                    <ActionButton
                      icon="x"
                      variant="ghost"
                      size="sm"
                      onClick={handleBulkDismiss}
                    >
                      Dismiss All
                    </ActionButton>
                  </div>
                )}

                {/* History Actions */}
                {activeTab === 'history' && sortedSuggestions.length > 0 && (
                  <div className="dignity-analysis__bulk-actions">
                    <ActionButton
                      icon="rotate-ccw"
                      variant="secondary"
                      size="sm"
                      onClick={handleRestoreHistory}
                    >
                      Restore Dismissed
                    </ActionButton>
                    <ActionButton
                      icon="trash-2"
                      variant="ghost"
                      size="sm"
                      onClick={clearSuggestions}
                    >
                      Clear All
                    </ActionButton>
                  </div>
                )}
              </motion.div>

              {/* Suggestions List */}
              <motion.div className="dignity-analysis__list" variants={CONTAINER_VARIANTS}>
                <AnimatePresence mode="popLayout">
                  {sortedSuggestions.length === 0 ? (
                    <motion.div
                      className="dignity-analysis__list-empty"
                      variants={ITEM_VARIANTS}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                    >
                      <Icon name={activeTab === 'history' ? 'history' : 'check-circle'} size={48} />
                      <p>
                        {activeTab === 'history'
                          ? 'No history yet. Applied and dismissed suggestions will appear here.'
                          : activeTab === 'deferred'
                          ? 'No deferred suggestions.'
                          : 'No suggestions in this category. Great job!'}
                      </p>
                    </motion.div>
                  ) : (
                    sortedSuggestions.map(suggestion => (
                      <motion.div
                        key={suggestion.id}
                        variants={ITEM_VARIANTS}
                        layout
                      >
                        <SuggestionCard
                          suggestion={suggestion}
                          onApply={handleApply}
                          onDismiss={handleDismiss}
                          onDefer={activeTab === 'deferred' ? undeferSuggestion : handleDefer}
                          showPreview
                          disabled={loading}
                        />
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Results Summary */}
              {sortedSuggestions.length > 0 && (
                <motion.div className="dignity-analysis__results-summary" variants={ITEM_VARIANTS}>
                  <span>
                    Showing {sortedSuggestions.length} of {suggestions.length} suggestions
                  </span>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default DignityAnalysis;
