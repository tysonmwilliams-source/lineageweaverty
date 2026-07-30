/**
 * BastardNameAudit.jsx - Bastard Naming Convention Audit Tool
 *
 * PURPOSE:
 * Scans all people marked as bastards and identifies those who don't
 * follow the "Dun-" naming convention. Provides bulk fix functionality.
 *
 * RULES:
 * - Noble bastards (legitimacyStatus === 'bastard' AND houseId !== null)
 *   should have surnames starting with "Dun"
 * - Commoner bastards (no houseId) don't need the Dun- prefix
 *
 * FEATURES:
 * - Shows list of bastards with incorrect surnames
 * - One-click fix for individual records
 * - Bulk fix for all selected records
 * - Preview of changes before applying
 */

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons/Icon';
import ActionButton from './shared/ActionButton';
import {
  auditBastardNames,
  generateDunSurname,
  isValidDunSurname,
  BASTARD_PREFIX,
  BASTARD_PREFIX_MATERNAL
} from '../utils/bastardNaming';
import './BastardNameAudit.css';
import { logger } from '../utils/logger';

/**
 * BastardNameAudit Component
 *
 * Props:
 * - people: Array of all people
 * - houses: Array of all houses
 * - relationships: Array of all relationships (for detecting married women)
 * - onUpdatePerson: Function to update a person's data
 * - defaultCollapsed: Whether to start collapsed (default: true)
 */
function BastardNameAudit({ people, houses, relationships = [], onUpdatePerson, defaultCollapsed = true }) {
  // Track collapsed state
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Track which items are selected for bulk fix
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Track which items are being processed
  const [processingIds, setProcessingIds] = useState(new Set());

  // Track completed fixes for feedback
  const [completedIds, setCompletedIds] = useState(new Set());

  // Run the audit (now includes relationships to exclude married women)
  const auditResults = useMemo(() => {
    return auditBastardNames(people, houses, relationships);
  }, [people, houses, relationships]);

  // Count stats
  const stats = useMemo(() => {
    const totalBastards = people.filter(p => p.legitimacyStatus === 'bastard').length;
    const nobleBastards = people.filter(p => p.legitimacyStatus === 'bastard' && p.houseId != null).length;
    const commonerBastards = totalBastards - nobleBastards;
    const correctlyNamed = nobleBastards - auditResults.length;
    
    return {
      totalBastards,
      nobleBastards,
      commonerBastards,
      needsFix: auditResults.length,
      correctlyNamed
    };
  }, [people, auditResults]);

  // Toggle selection for a single item
  const toggleSelection = useCallback((personId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(personId)) {
        newSet.delete(personId);
      } else {
        newSet.add(personId);
      }
      return newSet;
    });
  }, []);

  // Select/deselect all
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === auditResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(auditResults.map(r => r.person.id)));
    }
  }, [selectedIds.size, auditResults]);

  // Fix a single person's surname
  const fixSinglePerson = useCallback(async (person, suggestedSurname) => {
    if (!suggestedSurname) return;
    
    setProcessingIds(prev => new Set(prev).add(person.id));
    
    try {
      await onUpdatePerson(person.id, { lastName: suggestedSurname });
      setCompletedIds(prev => new Set(prev).add(person.id));
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(person.id);
        return newSet;
      });
    } catch (error) {
      logger.error('Error fixing surname:', error);
      alert(`Error updating ${person.firstName}: ${error.message}`);
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(person.id);
        return newSet;
      });
    }
  }, [onUpdatePerson]);

  // Bulk fix all selected
  const fixAllSelected = useCallback(async () => {
    const toFix = auditResults.filter(r => selectedIds.has(r.person.id) && r.suggestedSurname);
    
    if (toFix.length === 0) return;
    
    const confirmMessage = `Apply Dun- prefix to ${toFix.length} ${toFix.length === 1 ? 'person' : 'people'}?\n\n` +
      toFix.map(r => `• ${r.fullName} → ${r.suggestedFullName}`).join('\n');
    
    if (!window.confirm(confirmMessage)) return;
    
    // Process each one
    for (const result of toFix) {
      await fixSinglePerson(result.person, result.suggestedSurname);
    }
  }, [auditResults, selectedIds, fixSinglePerson]);

  // Collapsible header component
  const CollapsibleHeader = ({ hasIssues }) => (
    <button
      className={`bastard-audit__header bastard-audit__header--collapsible ${isCollapsed ? 'bastard-audit__header--collapsed' : ''}`}
      onClick={() => setIsCollapsed(!isCollapsed)}
      type="button"
    >
      <div className="bastard-audit__title">
        <Icon
          name={hasIssues ? 'alert-triangle' : 'check-circle'}
          size={20}
          className={`bastard-audit__title-icon ${hasIssues ? 'bastard-audit__title-icon--warning' : 'bastard-audit__title-icon--success'}`}
        />
        <h3>Bastard Naming Audit</h3>
        {hasIssues && (
          <span className="bastard-audit__badge">{auditResults.length} issue{auditResults.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      <Icon
        name={isCollapsed ? 'chevron-down' : 'chevron-up'}
        size={20}
        className="bastard-audit__collapse-icon"
      />
    </button>
  );

  // All clear state
  if (auditResults.length === 0) {
    return (
      <div className="bastard-audit">
        <CollapsibleHeader hasIssues={false} />

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              className="bastard-audit__content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bastard-audit__stats">
                <div className="bastard-audit__stat">
                  <span className="bastard-audit__stat-value">{stats.totalBastards}</span>
                  <span className="bastard-audit__stat-label">Total Bastards</span>
                </div>
                <div className="bastard-audit__stat">
                  <span className="bastard-audit__stat-value">{stats.nobleBastards}</span>
                  <span className="bastard-audit__stat-label">Noble Bastards</span>
                </div>
                <div className="bastard-audit__stat">
                  <span className="bastard-audit__stat-value">{stats.commonerBastards}</span>
                  <span className="bastard-audit__stat-label">Commoners</span>
                </div>
              </div>

              <div className="bastard-audit__success">
                <Icon name="shield-check" size={48} className="bastard-audit__success-icon" />
                <p className="bastard-audit__success-text">
                  All noble bastards follow the naming convention!
                </p>
                <p className="bastard-audit__success-subtext">
                  <strong>{BASTARD_PREFIX}-</strong> (father's line) or <strong>{BASTARD_PREFIX_MATERNAL}-</strong> (mother's line)
                </p>
                {stats.nobleBastards > 0 && (
                  <p className="bastard-audit__success-subtext">
                    {stats.nobleBastards} {stats.nobleBastards === 1 ? 'person is' : 'people are'} correctly named.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="bastard-audit">
      {/* Collapsible Header */}
      <CollapsibleHeader hasIssues={true} />

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="bastard-audit__content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Description */}
            <p className="bastard-audit__description">
              Noble bastards should carry the "<strong>Dun-</strong>" prefix (father's line) or
              "<strong>Dum-</strong>" prefix (mother's line) in their surname.
            </p>

            {/* Stats */}
            <div className="bastard-audit__stats">
              <div className="bastard-audit__stat">
                <span className="bastard-audit__stat-value">{stats.totalBastards}</span>
                <span className="bastard-audit__stat-label">Total Bastards</span>
              </div>
              <div className="bastard-audit__stat bastard-audit__stat--warning">
                <span className="bastard-audit__stat-value">{stats.needsFix}</span>
                <span className="bastard-audit__stat-label">Need Fixing</span>
              </div>
              <div className="bastard-audit__stat bastard-audit__stat--success">
                <span className="bastard-audit__stat-value">{stats.correctlyNamed}</span>
                <span className="bastard-audit__stat-label">Correct</span>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="bastard-audit__actions">
              <label className="bastard-audit__select-all">
                <input
                  type="checkbox"
                  checked={selectedIds.size === auditResults.length && auditResults.length > 0}
                  onChange={toggleSelectAll}
                />
                <span>Select All ({auditResults.length})</span>
              </label>

              <AnimatePresence>
                {selectedIds.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                  >
                    <ActionButton
                      icon="check"
                      variant="primary"
                      onClick={fixAllSelected}
                      disabled={processingIds.size > 0}
                    >
                      Fix Selected ({selectedIds.size})
                    </ActionButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Results List */}
            <div className="bastard-audit__list">
              <AnimatePresence>
                {auditResults.map((result, index) => {
                  const isSelected = selectedIds.has(result.person.id);
                  const isProcessing = processingIds.has(result.person.id);
                  const isCompleted = completedIds.has(result.person.id);

                  // Don't show completed items
                  if (isCompleted) return null;

                  return (
                    <motion.div
                      key={result.person.id}
                      className={`bastard-audit__item ${isSelected ? 'bastard-audit__item--selected' : ''}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <label className="bastard-audit__item-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(result.person.id)}
                          disabled={isProcessing}
                        />
                      </label>

                      <div className="bastard-audit__item-info">
                        <div className="bastard-audit__item-name">
                          <span className="bastard-audit__item-current">{result.fullName}</span>
                          <Icon name="arrow-right" size={14} className="bastard-audit__item-arrow" />
                          <span className="bastard-audit__item-suggested">{result.suggestedFullName}</span>
                        </div>
                        <div className="bastard-audit__item-house">
                          <Icon name="castle" size={12} />
                          <span>{result.house?.houseName || 'Unknown House'}</span>
                        </div>
                      </div>

                      <button
                        className="bastard-audit__item-fix"
                        onClick={() => fixSinglePerson(result.person, result.suggestedSurname)}
                        disabled={isProcessing}
                        title="Apply fix"
                      >
                        {isProcessing ? (
                          <Icon name="loader" size={16} className="bastard-audit__item-spinner" />
                        ) : (
                          <Icon name="check" size={16} />
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Help Text */}
            <div className="bastard-audit__help">
              <Icon name="info" size={14} />
              <p>
                This audit only affects <strong>noble bastards</strong> (those assigned to a house).
                Commoner bastards and married women are excluded.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default BastardNameAudit;
