/**
 * useDignityAnalysis - React hook for dignity analysis
 *
 * Provides:
 * - Analysis state (suggestions, loading, error)
 * - Actions (runAnalysis, applySuggestion, dismissSuggestion)
 * - Memoized filtered views (bySeverity, byType, byEntity)
 *
 * FOLLOWS DEVELOPMENT GUIDELINES:
 * - useCallback for all handlers
 * - useMemo for filtered/sorted views
 * - Cleanup in useEffect
 * - ≤4 dependencies per effect
 *
 * @module useDignityAnalysis
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { runFullAnalysis, analyzeEntity } from '../services/dignityAnalysisService';
import {
  createDignity,
  updateDignity,
  createDignityTenure,
  updateDignityTenure,
  getCurrentTenure
} from '../services/dignityService';
import { logger } from '../utils/logger';

/**
 * Custom hook for dignity analysis
 *
 * @param {Object} options - Hook options
 * @param {string} options.scope - 'all' | 'house' | 'person' | 'dignity'
 * @param {number} options.entityId - Entity ID if scope is not 'all'
 * @param {boolean} [options.autoRun=false] - Run the analysis on mount
 * @returns {Object} Analysis state and actions
 */
export function useDignityAnalysis(options = {}) {
  // `autoRun` was documented and passed by both DignityView and
  // DignitiesLanding, but was never destructured and no effect existed to act
  // on it — so their suggestion panels were permanently empty.
  const { scope = 'all', entityId = null, autoRun = false } = options;
  const { user } = useAuth();
  const { activeDataset } = useDataset();

  // ==================== CORE STATE ====================

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastAnalyzed, setLastAnalyzed] = useState(null);
  const [stats, setStats] = useState(null);

  // ==================== LOOKUP MAPS ====================

  /**
   * Map of suggestion ID to suggestion object for O(1) lookup
   */
  const suggestionMap = useMemo(() =>
    new Map(suggestions.map(s => [s.id, s])),
    [suggestions]
  );

  // ==================== FILTERED VIEWS ====================

  /**
   * Active suggestions (not dismissed or applied)
   */
  const activeSuggestions = useMemo(() =>
    suggestions.filter(s => !s.dismissed && !s.applied),
    [suggestions]
  );

  /**
   * Critical suggestions only
   */
  const criticalSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'critical'),
    [activeSuggestions]
  );

  /**
   * Warning suggestions only
   */
  const warningSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'warning'),
    [activeSuggestions]
  );

  /**
   * Info suggestions only
   */
  const infoSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'info'),
    [activeSuggestions]
  );

  /**
   * Dismissed suggestions
   */
  const dismissedSuggestions = useMemo(() =>
    suggestions.filter(s => s.dismissed),
    [suggestions]
  );

  /**
   * Applied suggestions
   */
  const appliedSuggestions = useMemo(() =>
    suggestions.filter(s => s.applied),
    [suggestions]
  );

  /**
   * Deferred suggestions
   */
  const deferredSuggestions = useMemo(() =>
    suggestions.filter(s => s.deferred && !s.dismissed && !s.applied),
    [suggestions]
  );

  /**
   * Suggestions grouped by type
   */
  const suggestionsByType = useMemo(() => {
    const grouped = {};
    for (const suggestion of activeSuggestions) {
      if (!grouped[suggestion.type]) {
        grouped[suggestion.type] = [];
      }
      grouped[suggestion.type].push(suggestion);
    }
    return grouped;
  }, [activeSuggestions]);

  // ==================== ACTIONS ====================

  /**
   * Run analysis
   *
   * @param {Object} analysisOptions - Options passed to runFullAnalysis
   */
  const runAnalysis = useCallback(async (analysisOptions = {}) => {
    setLoading(true);
    setError(null);
    const datasetId = activeDataset?.id;

    try {
      let result;

      if (scope === 'all') {
        result = await runFullAnalysis({ ...analysisOptions, datasetId });
      } else {
        const entitySuggestions = await analyzeEntity(scope, entityId, datasetId);
        result = {
          suggestions: entitySuggestions,
          stats: {
            total: entitySuggestions.length,
            bySeverity: {
              critical: entitySuggestions.filter(s => s.severity === 'critical').length,
              warning: entitySuggestions.filter(s => s.severity === 'warning').length,
              info: entitySuggestions.filter(s => s.severity === 'info').length
            }
          },
          analyzedAt: new Date().toISOString()
        };
      }

      setSuggestions(result.suggestions);
      setStats(result.stats);
      setLastAnalyzed(result.analyzedAt);

      return result;
    } catch (err) {
      logger.error('Analysis failed:', err);
      setError(err.message || 'Analysis failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [scope, entityId, activeDataset]);

  /**
   * Run once on mount (and whenever the scope changes) when autoRun is set.
   * runAnalysis throws on failure, so swallow it here — the hook already
   * records the message in `error` for the UI to render.
   */
  useEffect(() => {
    if (!autoRun) return;
    let cancelled = false;
    runAnalysis().catch(() => {
      if (!cancelled) { /* error state is set inside runAnalysis */ }
    });
    return () => { cancelled = true; };
  }, [autoRun, runAnalysis]);

  /**
   * Apply a suggestion (execute its action)
   *
   * @param {string} suggestionId - Suggestion to apply
   * @param {Object} overrideData - Optional data to override suggestion defaults
   */
  const applySuggestion = useCallback(async (suggestionId, overrideData = {}) => {
    const suggestion = suggestionMap.get(suggestionId);
    if (!suggestion) {
      throw new Error('Suggestion not found');
    }

    const action = suggestion.suggestedAction;
    const data = { ...action.data, ...overrideData };
    const datasetId = activeDataset?.id;

    try {
      // Execute action based on type
      switch (action.type) {
        case 'create-dignity':
          await createDignity(data, user?.uid, datasetId);
          break;

        case 'update-dignity':
          await updateDignity(data.dignityId, data, user?.uid, datasetId);
          break;

        case 'transfer-dignity':
          // End current tenure
          if (data.endCurrentTenure) {
            const currentTenure = await getCurrentTenure(data.dignityId, datasetId);
            if (currentTenure) {
              await updateDignityTenure(currentTenure.id, data.endCurrentTenure, user?.uid, datasetId);
            }
          }
          // Calculate and assign heir if requested
          if (data.calculateHeir) {
            // Mark as vacant for now - heir calculation requires user confirmation
            await updateDignity(data.dignityId, {
              currentHolderId: null,
              isVacant: true
            }, user?.uid, datasetId);
          }
          break;

        case 'create-tenure':
          await createDignityTenure(data, user?.uid, datasetId);
          break;

        case 'create-tenure-chain':
          for (const tenureData of data.tenures) {
            await createDignityTenure({
              dignityId: data.dignityId,
              personId: tenureData.personId,
              dateStarted: tenureData.dateStarted,
              dateEnded: tenureData.dateEnded,
              endType: tenureData.endType,
              acquisitionType: 'inheritance'
            }, user?.uid, datasetId);
          }
          break;

        case 'mark-vacant':
          await updateDignity(data.dignityId, {
            currentHolderId: null,
            isVacant: true
          }, user?.uid, datasetId);
          break;

        case 'fix-feudal-chain':
          await updateDignity(data.dignityId, {
            swornToId: null
          }, user?.uid, datasetId);
          break;

        case 'link-to-house':
          // This requires user input, should be handled by UI
          if (data.promptForHouse) {
            throw new Error('This action requires selecting a house first');
          }
          await updateDignity(data.dignityId, {
            currentHouseId: data.houseId
          }, user?.uid, datasetId);
          break;

        case 'delete-dignity':
          // Import dynamically to avoid circular dependency
          const { deleteDignity } = await import('../services/dignityService');
          await deleteDignity(data.dignityId, user?.uid, datasetId);
          break;

        case 'update-tenure':
          // This requires user input for correction
          if (data.promptForCorrection) {
            throw new Error('This action requires manual date correction');
          }
          await updateDignityTenure(data.tenureId, data, user?.uid, datasetId);
          break;

        case 'review':
          // Review action just navigates - mark as applied since user acknowledged
          break;

        default:
          logger.warn('Unknown action type:', action.type);
      }

      // Mark suggestion as applied
      setSuggestions(prev => prev.map(s =>
        s.id === suggestionId
          ? { ...s, applied: true, appliedAt: new Date().toISOString() }
          : s
      ));

      return true;
    } catch (err) {
      logger.error('Failed to apply suggestion:', err);
      throw err;
    }
  }, [suggestionMap, user?.uid, activeDataset]);

  /**
   * Apply an alternative action from a suggestion
   *
   * @param {string} suggestionId - Suggestion ID
   * @param {number} actionIndex - Index of alternative action
   * @param {Object} overrideData - Optional data override
   */
  const applyAlternativeAction = useCallback(async (suggestionId, actionIndex, overrideData = {}) => {
    const suggestion = suggestionMap.get(suggestionId);
    if (!suggestion) {
      throw new Error('Suggestion not found');
    }

    const altAction = suggestion.alternativeActions?.[actionIndex];
    if (!altAction) {
      throw new Error('Alternative action not found');
    }

    const data = { ...altAction.data, ...overrideData };
    const datasetId = activeDataset?.id;

    try {
      // Execute based on action type (same as applySuggestion)
      switch (altAction.type) {
        case 'create-dignity':
          await createDignity(data, user?.uid, datasetId);
          break;

        case 'update-dignity':
          await updateDignity(data.dignityId, data, user?.uid, datasetId);
          break;

        case 'mark-vacant':
          await updateDignity(data.dignityId, {
            currentHolderId: null,
            isVacant: true
          }, user?.uid, datasetId);
          break;

        case 'delete-dignity':
          const { deleteDignity } = await import('../services/dignityService');
          await deleteDignity(data.dignityId, user?.uid, datasetId);
          break;

        default:
          logger.warn('Unknown alternative action type:', altAction.type);
      }

      // Mark suggestion as applied
      setSuggestions(prev => prev.map(s =>
        s.id === suggestionId
          ? { ...s, applied: true, appliedAt: new Date().toISOString() }
          : s
      ));

      return true;
    } catch (err) {
      logger.error('Failed to apply alternative action:', err);
      throw err;
    }
  }, [suggestionMap, user?.uid, activeDataset]);

  /**
   * Dismiss a suggestion
   *
   * @param {string} suggestionId - Suggestion to dismiss
   * @param {string} reason - Why it was dismissed
   */
  const dismissSuggestion = useCallback((suggestionId, reason = null) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, dismissed: true, dismissedReason: reason }
        : s
    ));
  }, []);

  /**
   * Defer a suggestion (mark for later review)
   *
   * @param {string} suggestionId - Suggestion to defer
   */
  const deferSuggestion = useCallback((suggestionId) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, deferred: true }
        : s
    ));
  }, []);

  /**
   * Undefer a suggestion
   *
   * @param {string} suggestionId - Suggestion to undefer
   */
  const undeferSuggestion = useCallback((suggestionId) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, deferred: false }
        : s
    ));
  }, []);

  /**
   * Get suggestions affecting a specific entity
   *
   * @param {string} entityType - 'house' | 'person' | 'dignity'
   * @param {number} entityId - Entity ID
   * @returns {Suggestion[]} Matching suggestions
   */
  const getSuggestionsForEntity = useCallback((entityType, entId) => {
    return activeSuggestions.filter(s =>
      s.affectedEntities.some(e => e.type === entityType && e.id === entId)
    );
  }, [activeSuggestions]);

  /**
   * Clear all suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setStats(null);
    setLastAnalyzed(null);
    setError(null);
  }, []);

  /**
   * Restore dismissed suggestions
   */
  const restoreDismissed = useCallback(() => {
    setSuggestions(prev => prev.map(s =>
      s.dismissed ? { ...s, dismissed: false, dismissedReason: null } : s
    ));
  }, []);

  /**
   * Dismiss all suggestions of a specific type
   *
   * @param {string} type - Suggestion type to dismiss
   * @param {string} reason - Reason for dismissal
   */
  const dismissAllOfType = useCallback((type, reason = null) => {
    setSuggestions(prev => prev.map(s =>
      s.type === type && !s.dismissed && !s.applied
        ? { ...s, dismissed: true, dismissedReason: reason }
        : s
    ));
  }, []);

  /**
   * Get a single suggestion by ID
   *
   * @param {string} id - Suggestion ID
   * @returns {Suggestion|undefined} The suggestion or undefined
   */
  const getSuggestion = useCallback((id) => {
    return suggestionMap.get(id);
  }, [suggestionMap]);

  // ==================== RETURN VALUE ====================

  return {
    // State
    suggestions,
    activeSuggestions,
    loading,
    error,
    lastAnalyzed,
    stats,

    // Filtered views
    criticalSuggestions,
    warningSuggestions,
    infoSuggestions,
    dismissedSuggestions,
    appliedSuggestions,
    deferredSuggestions,
    suggestionsByType,

    // Counts
    totalCount: suggestions.length,
    activeCount: activeSuggestions.length,
    criticalCount: criticalSuggestions.length,
    warningCount: warningSuggestions.length,
    infoCount: infoSuggestions.length,

    // Actions
    runAnalysis,
    applySuggestion,
    applyAlternativeAction,
    dismissSuggestion,
    deferSuggestion,
    undeferSuggestion,
    getSuggestionsForEntity,
    clearSuggestions,
    restoreDismissed,
    dismissAllOfType,

    // Utilities
    getSuggestion
  };
}

export default useDignityAnalysis;
