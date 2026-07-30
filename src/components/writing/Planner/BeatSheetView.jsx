/**
 * BeatSheetView.jsx
 *
 * A framework-specific beat sheet view for story planning.
 * Shows all story beats in a card-based layout with editing capabilities.
 *
 * Features:
 * - Framework-specific beat cards (Save the Cat, Hero's Journey, etc.)
 * - Progress status indicators (planned/drafted/complete)
 * - Word count targets vs. actuals
 * - Beat description editing
 * - Scene linking to beats
 * - Drag-and-drop reordering for custom beats
 * - AI suggestions for beat content
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getStoryPlan,
  getStoryBeats,
  getScenePlans,
  createStoryBeat,
  updateStoryBeat,
  deleteStoryBeat,
  PLANNING_FRAMEWORKS,
  PLAN_STATUS
} from '../../../services/planningService';
import { suggestBeatContent } from '../../../services/planningAIService';
import { useDataset } from '../../../contexts/DatasetContext';
import { useAuth } from '../../../contexts/AuthContext';
import './BeatSheetView.css';
import { logger } from '../../../utils/logger';

// Animation variants
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

// Status colors
const STATUS_COLORS = {
  planned: { bg: 'var(--color-primary-light)', text: 'var(--color-primary)' },
  drafted: { bg: 'var(--color-info-light)', text: 'var(--color-info)' },
  complete: { bg: 'var(--color-success-light)', text: 'var(--color-success)' }
};

// Act colors for visual grouping
const ACT_COLORS = {
  1: '#8b5cf6', // Purple - Setup
  2: '#3b82f6', // Blue - Confrontation
  3: '#22c55e'  // Green - Resolution
};

function BeatSheetView({
  storyPlanId,
  datasetId: propDatasetId,
  onClose,
  onNavigateToScene
}) {
  const { activeDataset } = useDataset();
  const datasetId = propDatasetId || activeDataset?.id;
  const { user } = useAuth();
  const userId = user?.uid || null;

  // State
  const [plan, setPlan] = useState(null);
  const [beats, setBeats] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingBeat, setEditingBeat] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddBeat, setShowAddBeat] = useState(false);
  const [newBeatForm, setNewBeatForm] = useState({ name: '', description: '', actNumber: 2 });
  const [expandedBeats, setExpandedBeats] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'list' | 'timeline'

  const loadData = useCallback(async () => {
    if (!storyPlanId) return;

    setIsLoading(true);
    try {
      const [planData, beatsData, scenesData] = await Promise.all([
        getStoryPlan(storyPlanId, datasetId),
        getStoryBeats(storyPlanId, datasetId),
        getScenePlans(storyPlanId, datasetId)
      ]);

      setPlan(planData);
      setBeats(beatsData);
      setScenes(scenesData);
    } catch (error) {
      logger.error('Error loading beat sheet data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storyPlanId, datasetId]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get framework info
  const frameworkInfo = useMemo(() => {
    if (!plan?.framework) return null;
    return PLANNING_FRAMEWORKS[plan.framework];
  }, [plan?.framework]);

  // Group beats by act
  const beatsByAct = useMemo(() => {
    const groups = { 1: [], 2: [], 3: [] };
    beats.forEach(beat => {
      const actNum = beat.actNumber || 2;
      if (groups[actNum]) {
        groups[actNum].push(beat);
      }
    });
    // Sort beats within each act by order or targetPercentage
    Object.keys(groups).forEach(act => {
      groups[act].sort((a, b) =>
        (a.targetPercentage || a.order || 0) - (b.targetPercentage || b.order || 0)
      );
    });
    return groups;
  }, [beats]);

  // Get scenes linked to a beat
  const getScenesForBeat = useCallback((beatId) => {
    return scenes.filter(s => s.linkedBeats?.includes(beatId));
  }, [scenes]);

  // Calculate progress
  const progress = useMemo(() => {
    const total = beats.length;
    const complete = beats.filter(b => b.status === 'complete').length;
    const drafted = beats.filter(b => b.status === 'drafted').length;
    return {
      total,
      complete,
      drafted,
      planned: total - complete - drafted,
      percentage: total > 0 ? Math.round((complete / total) * 100) : 0
    };
  }, [beats]);

  // Toggle beat expansion
  const toggleBeatExpansion = (beatId) => {
    setExpandedBeats(prev => ({ ...prev, [beatId]: !prev[beatId] }));
  };

  // Start editing a beat
  const startEditBeat = (beat) => {
    setEditingBeat(beat.id);
    setEditForm({
      name: beat.name,
      description: beat.description || '',
      targetPercentage: beat.targetPercentage || 0,
      targetWordCount: beat.targetWordCount || '',
      status: beat.status || 'planned',
      notes: beat.notes || ''
    });
  };

  // Save beat edits
  const saveEditBeat = async () => {
    if (!editingBeat) return;

    try {
      await updateStoryBeat(editingBeat, {
        ...editForm,
        targetWordCount: editForm.targetWordCount ? parseInt(editForm.targetWordCount) : null,
        updatedAt: new Date().toISOString()
      }, datasetId, userId);

      setEditingBeat(null);
      setEditForm({});
      await loadData();
    } catch (error) {
      logger.error('Error updating beat:', error);
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingBeat(null);
    setEditForm({});
  };

  // Add new custom beat
  const handleAddBeat = async () => {
    if (!newBeatForm.name.trim()) return;

    try {
      await createStoryBeat({
        storyPlanId,
        name: newBeatForm.name.trim(),
        description: newBeatForm.description.trim(),
        actNumber: parseInt(newBeatForm.actNumber),
        beatType: 'custom',
        status: 'planned'
      }, datasetId, userId);

      setShowAddBeat(false);
      setNewBeatForm({ name: '', description: '', actNumber: 2 });
      await loadData();
    } catch (error) {
      logger.error('Error creating beat:', error);
    }
  };

  // Delete a custom beat
  const handleDeleteBeat = async (beatId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this beat? This cannot be undone.')) return;

    try {
      await deleteStoryBeat(beatId, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error deleting beat:', error);
    }
  };

  // Update beat status
  const updateBeatStatus = async (beatId, newStatus) => {
    try {
      await updateStoryBeat(beatId, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating beat status:', error);
    }
  };

  // Get AI suggestion for beat
  const getAISuggestion = async (beat) => {
    setAiLoading(beat.id);
    try {
      const suggestion = await suggestBeatContent({
        beatName: beat.name,
        beatType: beat.beatType,
        framework: plan?.framework,
        premise: plan?.premise,
        existingBeats: beats.map(b => ({ name: b.name, description: b.description }))
      });

      // Update the beat with the suggestion
      if (suggestion?.description) {
        await updateStoryBeat(beat.id, {
          description: suggestion.description,
          notes: suggestion.notes || beat.notes,
          updatedAt: new Date().toISOString()
        }, datasetId, userId);
        await loadData();
      }
    } catch (error) {
      logger.error('Error getting AI suggestion:', error);
      alert('Failed to get AI suggestion. Please try again.');
    } finally {
      setAiLoading(null);
    }
  };

  // Render beat card
  const renderBeatCard = (beat) => {
    const isExpanded = expandedBeats[beat.id];
    const isEditing = editingBeat === beat.id;
    const linkedScenes = getScenesForBeat(beat.id);
    const isCustom = beat.beatType === 'custom';
    const statusStyle = STATUS_COLORS[beat.status] || STATUS_COLORS.planned;

    return (
      <motion.div
        key={beat.id}
        className={`beat-card ${isExpanded ? 'beat-card--expanded' : ''} ${isEditing ? 'beat-card--editing' : ''}`}
        variants={CARD_VARIANTS}
        layout
      >
        {/* Card Header */}
        <div className="beat-card__header" onClick={() => !isEditing && toggleBeatExpansion(beat.id)}>
          <div className="beat-card__header-left">
            <span
              className="beat-card__percentage"
              style={{ backgroundColor: ACT_COLORS[beat.actNumber || 2] }}
            >
              {beat.targetPercentage || 0}%
            </span>
            <div className="beat-card__title-group">
              <h3 className="beat-card__title">{beat.name}</h3>
              {beat.beatType && beat.beatType !== 'custom' && (
                <span className="beat-card__type">{beat.beatType}</span>
              )}
            </div>
          </div>
          <div className="beat-card__header-right">
            <button
              className="beat-card__status-btn"
              style={{ backgroundColor: statusStyle.bg, color: statusStyle.text }}
              onClick={(e) => {
                e.stopPropagation();
                const statuses = ['planned', 'drafted', 'complete'];
                const currentIdx = statuses.indexOf(beat.status || 'planned');
                const nextStatus = statuses[(currentIdx + 1) % statuses.length];
                updateBeatStatus(beat.id, nextStatus);
              }}
              title="Click to cycle status"
            >
              {PLAN_STATUS[beat.status] || 'Planned'}
            </button>
            <button
              className="beat-card__expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleBeatExpansion(beat.id);
              }}
            >
              <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
            </button>
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              className="beat-card__content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {isEditing ? (
                /* Edit Form */
                <div className="beat-card__edit-form">
                  <div className="beat-card__form-group">
                    <label>Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="beat-card__form-group">
                    <label>Description</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={4}
                      placeholder="What happens in this beat..."
                    />
                  </div>
                  <div className="beat-card__form-row">
                    <div className="beat-card__form-group beat-card__form-group--half">
                      <label>Target %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={editForm.targetPercentage}
                        onChange={(e) => setEditForm({ ...editForm, targetPercentage: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="beat-card__form-group beat-card__form-group--half">
                      <label>Target Words</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.targetWordCount}
                        onChange={(e) => setEditForm({ ...editForm, targetWordCount: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="beat-card__form-group">
                    <label>Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="planned">Planned</option>
                      <option value="drafted">Drafted</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                  <div className="beat-card__form-group">
                    <label>Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      rows={2}
                      placeholder="Planning notes..."
                    />
                  </div>
                  <div className="beat-card__form-actions">
                    <ActionButton variant="ghost" size="small" onClick={cancelEdit}>
                      Cancel
                    </ActionButton>
                    <ActionButton variant="primary" size="small" onClick={saveEditBeat}>
                      Save
                    </ActionButton>
                  </div>
                </div>
              ) : (
                /* View Content */
                <>
                  {beat.description ? (
                    <p className="beat-card__description">{beat.description}</p>
                  ) : (
                    <p className="beat-card__description beat-card__description--empty">
                      No description yet. Click edit or use AI to generate.
                    </p>
                  )}

                  {/* Word count target */}
                  {beat.targetWordCount && (
                    <div className="beat-card__word-target">
                      <Icon name="file-text" size={14} />
                      <span>Target: ~{beat.targetWordCount.toLocaleString()} words</span>
                    </div>
                  )}

                  {/* Linked scenes */}
                  {linkedScenes.length > 0 && (
                    <div className="beat-card__scenes">
                      <span className="beat-card__scenes-label">
                        <Icon name="layers" size={14} />
                        Linked Scenes:
                      </span>
                      <div className="beat-card__scenes-list">
                        {linkedScenes.map(scene => (
                          <button
                            key={scene.id}
                            className="beat-card__scene-tag"
                            onClick={() => onNavigateToScene?.(scene)}
                          >
                            {scene.title || 'Untitled'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {beat.notes && (
                    <div className="beat-card__notes">
                      <Icon name="sticky-note" size={14} />
                      <span>{beat.notes}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="beat-card__actions">
                    <button
                      className="beat-card__action-btn"
                      onClick={() => startEditBeat(beat)}
                      title="Edit beat"
                    >
                      <Icon name="edit-2" size={14} />
                      Edit
                    </button>
                    <button
                      className="beat-card__action-btn beat-card__action-btn--ai"
                      onClick={() => getAISuggestion(beat)}
                      disabled={aiLoading === beat.id}
                      title="Get AI suggestion"
                    >
                      {aiLoading === beat.id ? (
                        <Icon name="loader" size={14} className="spinning" />
                      ) : (
                        <Icon name="sparkles" size={14} />
                      )}
                      AI Suggest
                    </button>
                    {isCustom && (
                      <button
                        className="beat-card__action-btn beat-card__action-btn--delete"
                        onClick={(e) => handleDeleteBeat(beat.id, e)}
                        title="Delete beat"
                      >
                        <Icon name="trash-2" size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="beat-sheet-view beat-sheet-view--loading">
        <Icon name="loader" size={32} className="spinning" />
        <span>Loading beat sheet...</span>
      </div>
    );
  }

  return (
    <div className="beat-sheet-view">
      {/* Header */}
      <header className="beat-sheet-view__header">
        <div className="beat-sheet-view__header-info">
          <h2 className="beat-sheet-view__title">
            <Icon name="list" size={22} />
            <span>Beat Sheet</span>
          </h2>
          {frameworkInfo && (
            <span className="beat-sheet-view__framework">
              <Icon name="git-branch" size={14} />
              {frameworkInfo.name}
            </span>
          )}
        </div>

        <div className="beat-sheet-view__header-actions">
          {/* Progress indicator */}
          <div className="beat-sheet-view__progress">
            <div className="beat-sheet-view__progress-bar">
              <div
                className="beat-sheet-view__progress-fill"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <span className="beat-sheet-view__progress-text">
              {progress.complete}/{progress.total} complete
            </span>
          </div>

          {/* View mode toggle */}
          <div className="beat-sheet-view__view-toggle">
            <button
              className={`beat-sheet-view__view-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
              title="Card view"
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              className={`beat-sheet-view__view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <Icon name="list" size={16} />
            </button>
          </div>

          {/* Add beat button */}
          <ActionButton
            icon="plus"
            variant="secondary"
            size="small"
            onClick={() => setShowAddBeat(true)}
          >
            Add Beat
          </ActionButton>

          {onClose && (
            <button className="beat-sheet-view__close-btn" onClick={onClose}>
              <Icon name="x" size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Add Beat Modal */}
      <AnimatePresence>
        {showAddBeat && (
          <motion.div
            className="beat-sheet-view__add-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddBeat(false)}
          >
            <motion.div
              className="beat-sheet-view__add-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Add Custom Beat</h3>
              <div className="beat-sheet-view__add-form">
                <div className="beat-card__form-group">
                  <label>Beat Name</label>
                  <input
                    type="text"
                    value={newBeatForm.name}
                    onChange={(e) => setNewBeatForm({ ...newBeatForm, name: e.target.value })}
                    placeholder="e.g., Turning Point"
                    autoFocus
                  />
                </div>
                <div className="beat-card__form-group">
                  <label>Description</label>
                  <textarea
                    value={newBeatForm.description}
                    onChange={(e) => setNewBeatForm({ ...newBeatForm, description: e.target.value })}
                    placeholder="What happens in this beat..."
                    rows={3}
                  />
                </div>
                <div className="beat-card__form-group">
                  <label>Act</label>
                  <select
                    value={newBeatForm.actNumber}
                    onChange={(e) => setNewBeatForm({ ...newBeatForm, actNumber: e.target.value })}
                  >
                    <option value="1">Act I: Setup</option>
                    <option value="2">Act II: Confrontation</option>
                    <option value="3">Act III: Resolution</option>
                  </select>
                </div>
                <div className="beat-card__form-actions">
                  <ActionButton variant="ghost" onClick={() => setShowAddBeat(false)}>
                    Cancel
                  </ActionButton>
                  <ActionButton
                    variant="primary"
                    onClick={handleAddBeat}
                    disabled={!newBeatForm.name.trim()}
                  >
                    Add Beat
                  </ActionButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className={`beat-sheet-view__content beat-sheet-view__content--${viewMode}`}>
        {beats.length === 0 ? (
          <div className="beat-sheet-view__empty">
            <Icon name="list" size={48} />
            <h3>No Beats Yet</h3>
            <p>Your story plan doesn't have any beats. Add custom beats or select a framework to get started.</p>
            <ActionButton
              icon="plus"
              variant="primary"
              onClick={() => setShowAddBeat(true)}
            >
              Add First Beat
            </ActionButton>
          </div>
        ) : (
          /* Acts with beats */
          <div className="beat-sheet-view__acts">
            {[1, 2, 3].map(actNum => {
              const actBeats = beatsByAct[actNum] || [];
              if (actBeats.length === 0) return null;

              return (
                <div key={actNum} className="beat-sheet-view__act">
                  <div
                    className="beat-sheet-view__act-header"
                    style={{ borderLeftColor: ACT_COLORS[actNum] }}
                  >
                    <h3 className="beat-sheet-view__act-title">
                      {actNum === 1 && 'Act I: Setup'}
                      {actNum === 2 && 'Act II: Confrontation'}
                      {actNum === 3 && 'Act III: Resolution'}
                    </h3>
                    <span className="beat-sheet-view__act-count">
                      {actBeats.length} beat{actBeats.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <motion.div
                    className="beat-sheet-view__act-beats"
                    variants={STAGGER_VARIANTS}
                    initial="hidden"
                    animate="visible"
                  >
                    {actBeats.map((beat) => renderBeatCard(beat))}
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <footer className="beat-sheet-view__footer">
        <div className="beat-sheet-view__legend">
          <span className="beat-sheet-view__legend-title">Status:</span>
          <div className="beat-sheet-view__legend-items">
            <span className="beat-sheet-view__legend-item">
              <span className="beat-sheet-view__legend-dot" style={{ backgroundColor: STATUS_COLORS.planned.text }} />
              Planned
            </span>
            <span className="beat-sheet-view__legend-item">
              <span className="beat-sheet-view__legend-dot" style={{ backgroundColor: STATUS_COLORS.drafted.text }} />
              Drafted
            </span>
            <span className="beat-sheet-view__legend-item">
              <span className="beat-sheet-view__legend-dot" style={{ backgroundColor: STATUS_COLORS.complete.text }} />
              Complete
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default BeatSheetView;
