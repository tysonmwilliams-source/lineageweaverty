/**
 * CharacterArcsView.jsx
 *
 * A character-centric planning view that tracks character development
 * throughout the story.
 *
 * Features:
 * - Character selection from genealogy
 * - Arc type management (positive, negative, flat, etc.)
 * - Character state tracking (belief, ghost, want, need)
 * - Development milestones with scene linking
 * - Visual arc progression
 * - AI suggestions for character development
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getCharacterArcs,
  createCharacterArc,
  updateCharacterArc,
  deleteCharacterArc,
  addCharacterMilestone,
  getScenePlans,
  CHARACTER_ARC_TYPES,
  PLAN_STATUS
} from '../../../services/planningService';
import { getAllPeople } from '../../../services/database';
import { suggestCharacterArc } from '../../../services/planningAIService';
import { useDataset } from '../../../contexts/DatasetContext';
import { useAuth } from '../../../contexts/AuthContext';
import './CharacterArcsView.css';
import { logger } from '../../../utils/logger';

// Animation variants
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

const LIST_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

// Arc type colors
const ARC_TYPE_COLORS = {
  positive: '#22c55e',
  negative: '#ef4444',
  flat: '#3b82f6',
  corruption: '#8b5cf6',
  disillusionment: '#f59e0b'
};

function CharacterArcsView({
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
  const [characterArcs, setCharacterArcs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedArc, setSelectedArc] = useState(null);
  const [editingArc, setEditingArc] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddArc, setShowAddArc] = useState(false);
  const [newArcCharacterId, setNewArcCharacterId] = useState('');
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ description: '', internalShift: '', externalChange: '', sceneId: '' });
  const [aiLoading, setAiLoading] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    if (!storyPlanId) return;

    setIsLoading(true);
    try {
      const [arcsData, peopleData, scenesData] = await Promise.all([
        getCharacterArcs(storyPlanId, datasetId),
        getAllPeople(datasetId),
        getScenePlans(storyPlanId, datasetId)
      ]);

      setCharacterArcs(arcsData);
      setCharacters(peopleData);
      setScenes(scenesData);

      // Auto-select first arc if none selected
      if (arcsData.length > 0 && !selectedArc) {
        setSelectedArc(arcsData[0].id);
      }
    } catch (error) {
      logger.error('Error loading character arcs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [storyPlanId, datasetId, selectedArc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get character name by ID
  const getCharacterName = useCallback((characterId) => {
    const person = characters.find(c => c.id === characterId);
    if (!person) return 'Unknown Character';
    return `${person.firstName} ${person.lastName || ''}`.trim();
  }, [characters]);

  // Get currently selected arc data
  const currentArc = useMemo(() => {
    return characterArcs.find(a => a.id === selectedArc);
  }, [characterArcs, selectedArc]);

  // Get scenes where the selected character appears
  const characterScenes = useMemo(() => {
    if (!currentArc) return [];
    return scenes.filter(s =>
      s.povCharacterId === currentArc.characterId ||
      s.charactersPresent?.includes(currentArc.characterId)
    );
  }, [scenes, currentArc]);

  // Characters without arcs (for adding new arcs)
  const availableCharacters = useMemo(() => {
    const arcCharacterIds = characterArcs.map(a => a.characterId);
    return characters.filter(c => !arcCharacterIds.includes(c.id));
  }, [characters, characterArcs]);

  // Create new character arc
  const handleCreateArc = async () => {
    if (!newArcCharacterId) return;

    try {
      const arcId = await createCharacterArc({
        storyPlanId,
        characterId: parseInt(newArcCharacterId),
        arcType: 'positive',
        status: 'planned'
      }, datasetId, userId);

      setShowAddArc(false);
      setNewArcCharacterId('');
      await loadData();
      setSelectedArc(arcId);
    } catch (error) {
      logger.error('Error creating character arc:', error);
    }
  };

  // Start editing an arc
  const startEditArc = () => {
    if (!currentArc) return;
    setEditingArc(currentArc.id);
    setEditForm({
      arcType: currentArc.arcType || 'positive',
      startingBelief: currentArc.startingBelief || '',
      endingBelief: currentArc.endingBelief || '',
      ghost: currentArc.ghost || '',
      want: currentArc.want || '',
      need: currentArc.need || '',
      status: currentArc.status || 'planned',
      notes: currentArc.notes || ''
    });
  };

  // Save arc edits
  const saveArcEdits = async () => {
    if (!editingArc) return;

    try {
      await updateCharacterArc(editingArc, editForm, datasetId, userId);
      setEditingArc(null);
      setEditForm({});
      await loadData();
    } catch (error) {
      logger.error('Error updating character arc:', error);
    }
  };

  // Delete character arc
  const handleDeleteArc = async () => {
    if (!currentArc) return;
    if (!confirm(`Delete ${getCharacterName(currentArc.characterId)}'s character arc? This cannot be undone.`)) return;

    try {
      await deleteCharacterArc(currentArc.id, datasetId, userId);
      setSelectedArc(null);
      await loadData();
    } catch (error) {
      logger.error('Error deleting character arc:', error);
    }
  };

  // Add milestone
  const handleAddMilestone = async () => {
    if (!currentArc || !milestoneForm.description.trim()) return;

    try {
      await addCharacterMilestone(currentArc.id, {
        description: milestoneForm.description.trim(),
        internalShift: milestoneForm.internalShift.trim(),
        externalChange: milestoneForm.externalChange.trim(),
        sceneId: milestoneForm.sceneId ? parseInt(milestoneForm.sceneId) : null
      }, datasetId, userId);

      setShowAddMilestone(false);
      setMilestoneForm({ description: '', internalShift: '', externalChange: '', sceneId: '' });
      await loadData();
    } catch (error) {
      logger.error('Error adding milestone:', error);
    }
  };

  // Remove milestone
  const handleRemoveMilestone = async (milestoneId) => {
    if (!currentArc) return;

    try {
      const updatedMilestones = currentArc.milestones.filter(m => m.id !== milestoneId);
      await updateCharacterArc(currentArc.id, { milestones: updatedMilestones }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error removing milestone:', error);
    }
  };

  // Get AI suggestion for character arc
  const getAISuggestion = async () => {
    if (!currentArc) return;

    setAiLoading(true);
    try {
      const character = characters.find(c => c.id === currentArc.characterId);
      const suggestion = await suggestCharacterArc({
        characterName: getCharacterName(currentArc.characterId),
        characterBio: character?.bio || '',
        arcType: currentArc.arcType,
        existingScenes: characterScenes.map(s => s.title).join(', ')
      });

      if (suggestion) {
        await updateCharacterArc(currentArc.id, {
          startingBelief: suggestion.startingBelief || currentArc.startingBelief,
          endingBelief: suggestion.endingBelief || currentArc.endingBelief,
          ghost: suggestion.ghost || currentArc.ghost,
          want: suggestion.want || currentArc.want,
          need: suggestion.need || currentArc.need
        }, datasetId, userId);
        await loadData();
      }
    } catch (error) {
      logger.error('Error getting AI suggestion:', error);
      alert('Failed to get AI suggestion. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Update arc status
  const updateArcStatus = async (newStatus) => {
    if (!currentArc) return;

    try {
      await updateCharacterArc(currentArc.id, { status: newStatus }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating arc status:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="character-arcs-view character-arcs-view--loading">
        <Icon name="loader" size={32} className="spinning" />
        <span>Loading character arcs...</span>
      </div>
    );
  }

  return (
    <div className="character-arcs-view">
      {/* Header */}
      <header className="character-arcs-view__header">
        <div className="character-arcs-view__header-info">
          <h2 className="character-arcs-view__title">
            <Icon name="users" size={22} />
            <span>Character Arcs</span>
          </h2>
          <span className="character-arcs-view__count">
            {characterArcs.length} character{characterArcs.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="character-arcs-view__header-actions">
          <ActionButton
            icon="plus"
            variant="secondary"
            size="small"
            onClick={() => setShowAddArc(true)}
            disabled={availableCharacters.length === 0}
          >
            Add Character
          </ActionButton>
          {onClose && (
            <button className="character-arcs-view__close-btn" onClick={onClose}>
              <Icon name="x" size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="character-arcs-view__content">
        {characterArcs.length === 0 ? (
          /* Empty State */
          <div className="character-arcs-view__empty">
            <Icon name="users" size={48} />
            <h3>No Character Arcs</h3>
            <p>Track how your characters grow and change throughout the story.</p>
            {availableCharacters.length > 0 ? (
              <ActionButton
                icon="plus"
                variant="primary"
                onClick={() => setShowAddArc(true)}
              >
                Add First Character
              </ActionButton>
            ) : (
              <p className="character-arcs-view__empty-hint">
                Add characters to your genealogy first, then track their arcs here.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Character List Sidebar */}
            <aside className="character-arcs-view__sidebar">
              <motion.div
                className="character-arcs-view__character-list"
                variants={LIST_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {characterArcs.map(arc => (
                  <motion.button
                    key={arc.id}
                    className={`character-arcs-view__character-item ${selectedArc === arc.id ? 'character-arcs-view__character-item--selected' : ''}`}
                    variants={CARD_VARIANTS}
                    onClick={() => setSelectedArc(arc.id)}
                  >
                    <div
                      className="character-arcs-view__character-indicator"
                      style={{ backgroundColor: ARC_TYPE_COLORS[arc.arcType] }}
                    />
                    <div className="character-arcs-view__character-info">
                      <span className="character-arcs-view__character-name">
                        {getCharacterName(arc.characterId)}
                      </span>
                      <span className="character-arcs-view__character-type">
                        {CHARACTER_ARC_TYPES[arc.arcType]?.name || 'Unknown'}
                      </span>
                    </div>
                    <span className={`character-arcs-view__character-status character-arcs-view__character-status--${arc.status}`}>
                      {arc.status === 'complete' && <Icon name="check" size={12} />}
                    </span>
                  </motion.button>
                ))}
              </motion.div>
            </aside>

            {/* Arc Detail Panel */}
            <main className="character-arcs-view__detail">
              {currentArc ? (
                <motion.div
                  className="character-arcs-view__arc-detail"
                  key={currentArc.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Arc Header */}
                  <div className="character-arcs-view__arc-header">
                    <div className="character-arcs-view__arc-title-row">
                      <h3 className="character-arcs-view__arc-title">
                        {getCharacterName(currentArc.characterId)}
                      </h3>
                      <div
                        className="character-arcs-view__arc-type-badge"
                        style={{ backgroundColor: ARC_TYPE_COLORS[currentArc.arcType] }}
                      >
                        {CHARACTER_ARC_TYPES[currentArc.arcType]?.name}
                      </div>
                    </div>
                    <div className="character-arcs-view__arc-actions">
                      <button
                        className="character-arcs-view__action-btn"
                        onClick={startEditArc}
                        title="Edit arc"
                      >
                        <Icon name="edit-2" size={16} />
                      </button>
                      <button
                        className="character-arcs-view__action-btn character-arcs-view__action-btn--ai"
                        onClick={getAISuggestion}
                        disabled={aiLoading}
                        title="Get AI suggestions"
                      >
                        {aiLoading ? (
                          <Icon name="loader" size={16} className="spinning" />
                        ) : (
                          <Icon name="sparkles" size={16} />
                        )}
                      </button>
                      <button
                        className="character-arcs-view__action-btn character-arcs-view__action-btn--delete"
                        onClick={handleDeleteArc}
                        title="Delete arc"
                      >
                        <Icon name="trash-2" size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Arc Status */}
                  <div className="character-arcs-view__status-row">
                    <span className="character-arcs-view__status-label">Status:</span>
                    <div className="character-arcs-view__status-buttons">
                      {['planned', 'in-progress', 'complete'].map(status => (
                        <button
                          key={status}
                          className={`character-arcs-view__status-btn ${currentArc.status === status ? 'character-arcs-view__status-btn--active' : ''}`}
                          onClick={() => updateArcStatus(status)}
                        >
                          {PLAN_STATUS[status] || status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {editingArc === currentArc.id ? (
                    /* Edit Form */
                    <div className="character-arcs-view__edit-form">
                      <div className="character-arcs-view__form-group">
                        <label>Arc Type</label>
                        <select
                          value={editForm.arcType}
                          onChange={(e) => setEditForm({ ...editForm, arcType: e.target.value })}
                        >
                          {Object.entries(CHARACTER_ARC_TYPES).map(([key, { name, description }]) => (
                            <option key={key} value={key}>{name} - {description}</option>
                          ))}
                        </select>
                      </div>

                      <div className="character-arcs-view__form-row">
                        <div className="character-arcs-view__form-group">
                          <label>Starting Belief (Lie)</label>
                          <textarea
                            value={editForm.startingBelief}
                            onChange={(e) => setEditForm({ ...editForm, startingBelief: e.target.value })}
                            placeholder="What false belief does the character hold?"
                            rows={2}
                          />
                        </div>
                        <div className="character-arcs-view__form-group">
                          <label>Ending Belief (Truth)</label>
                          <textarea
                            value={editForm.endingBelief}
                            onChange={(e) => setEditForm({ ...editForm, endingBelief: e.target.value })}
                            placeholder="What truth will they discover?"
                            rows={2}
                          />
                        </div>
                      </div>

                      <div className="character-arcs-view__form-group">
                        <label>Ghost (Backstory Wound)</label>
                        <textarea
                          value={editForm.ghost}
                          onChange={(e) => setEditForm({ ...editForm, ghost: e.target.value })}
                          placeholder="What past trauma shaped their belief?"
                          rows={2}
                        />
                      </div>

                      <div className="character-arcs-view__form-row">
                        <div className="character-arcs-view__form-group">
                          <label>Want (Conscious Desire)</label>
                          <textarea
                            value={editForm.want}
                            onChange={(e) => setEditForm({ ...editForm, want: e.target.value })}
                            placeholder="What do they think they want?"
                            rows={2}
                          />
                        </div>
                        <div className="character-arcs-view__form-group">
                          <label>Need (Unconscious Need)</label>
                          <textarea
                            value={editForm.need}
                            onChange={(e) => setEditForm({ ...editForm, need: e.target.value })}
                            placeholder="What do they actually need?"
                            rows={2}
                          />
                        </div>
                      </div>

                      <div className="character-arcs-view__form-group">
                        <label>Notes</label>
                        <textarea
                          value={editForm.notes}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          placeholder="Additional planning notes..."
                          rows={2}
                        />
                      </div>

                      <div className="character-arcs-view__form-actions">
                        <ActionButton variant="ghost" onClick={() => setEditingArc(null)}>
                          Cancel
                        </ActionButton>
                        <ActionButton variant="primary" onClick={saveArcEdits}>
                          Save Changes
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    /* Arc Details View */
                    <>
                      {/* Arc Journey Visualization */}
                      <div className="character-arcs-view__journey">
                        <div className="character-arcs-view__journey-start">
                          <div className="character-arcs-view__journey-label">Starting State</div>
                          <div className="character-arcs-view__journey-belief">
                            {currentArc.startingBelief || (
                              <span className="character-arcs-view__empty-text">No starting belief defined</span>
                            )}
                          </div>
                        </div>
                        <div className="character-arcs-view__journey-arrow">
                          <Icon name="arrow-right" size={24} />
                        </div>
                        <div className="character-arcs-view__journey-end">
                          <div className="character-arcs-view__journey-label">Ending State</div>
                          <div className="character-arcs-view__journey-belief">
                            {currentArc.endingBelief || (
                              <span className="character-arcs-view__empty-text">No ending belief defined</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Character Psychology */}
                      <div className="character-arcs-view__psychology">
                        <h4 className="character-arcs-view__section-title">
                          <Icon name="heart" size={16} />
                          Character Psychology
                        </h4>
                        <div className="character-arcs-view__psychology-grid">
                          <div className="character-arcs-view__psychology-item">
                            <span className="character-arcs-view__psychology-label">Ghost</span>
                            <span className="character-arcs-view__psychology-value">
                              {currentArc.ghost || 'Not defined'}
                            </span>
                          </div>
                          <div className="character-arcs-view__psychology-item">
                            <span className="character-arcs-view__psychology-label">Want</span>
                            <span className="character-arcs-view__psychology-value">
                              {currentArc.want || 'Not defined'}
                            </span>
                          </div>
                          <div className="character-arcs-view__psychology-item">
                            <span className="character-arcs-view__psychology-label">Need</span>
                            <span className="character-arcs-view__psychology-value">
                              {currentArc.need || 'Not defined'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Milestones */}
                      <div className="character-arcs-view__milestones">
                        <div className="character-arcs-view__section-header">
                          <h4 className="character-arcs-view__section-title">
                            <Icon name="git-commit" size={16} />
                            Development Milestones
                          </h4>
                          <ActionButton
                            icon="plus"
                            variant="ghost"
                            size="small"
                            onClick={() => setShowAddMilestone(true)}
                          >
                            Add
                          </ActionButton>
                        </div>

                        {currentArc.milestones?.length > 0 ? (
                          <div className="character-arcs-view__milestone-list">
                            {currentArc.milestones.map((milestone, idx) => (
                              <div key={milestone.id} className="character-arcs-view__milestone">
                                <div className="character-arcs-view__milestone-number">{idx + 1}</div>
                                <div className="character-arcs-view__milestone-content">
                                  <p className="character-arcs-view__milestone-desc">{milestone.description}</p>
                                  {milestone.internalShift && (
                                    <div className="character-arcs-view__milestone-shift">
                                      <Icon name="heart" size={12} />
                                      <span>Internal: {milestone.internalShift}</span>
                                    </div>
                                  )}
                                  {milestone.externalChange && (
                                    <div className="character-arcs-view__milestone-shift">
                                      <Icon name="eye" size={12} />
                                      <span>External: {milestone.externalChange}</span>
                                    </div>
                                  )}
                                  {milestone.sceneId && (
                                    <button
                                      className="character-arcs-view__milestone-scene"
                                      onClick={() => {
                                        const scene = scenes.find(s => s.id === milestone.sceneId);
                                        if (scene) onNavigateToScene?.(scene);
                                      }}
                                    >
                                      <Icon name="layers" size={12} />
                                      {scenes.find(s => s.id === milestone.sceneId)?.title || 'Linked Scene'}
                                    </button>
                                  )}
                                </div>
                                <button
                                  className="character-arcs-view__milestone-delete"
                                  onClick={() => handleRemoveMilestone(milestone.id)}
                                  title="Remove milestone"
                                >
                                  <Icon name="x" size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="character-arcs-view__empty-text">
                            No milestones yet. Add key moments in the character's development.
                          </p>
                        )}
                      </div>

                      {/* Scenes */}
                      <div className="character-arcs-view__scenes">
                        <h4 className="character-arcs-view__section-title">
                          <Icon name="layers" size={16} />
                          Appears In ({characterScenes.length} scenes)
                        </h4>
                        {characterScenes.length > 0 ? (
                          <div className="character-arcs-view__scene-list">
                            {characterScenes.map(scene => (
                              <button
                                key={scene.id}
                                className="character-arcs-view__scene-item"
                                onClick={() => onNavigateToScene?.(scene)}
                              >
                                <span className="character-arcs-view__scene-title">{scene.title || 'Untitled'}</span>
                                {scene.povCharacterId === currentArc.characterId && (
                                  <span className="character-arcs-view__scene-pov">POV</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="character-arcs-view__empty-text">
                            No scenes planned for this character yet.
                          </p>
                        )}
                      </div>

                      {/* Notes */}
                      {currentArc.notes && (
                        <div className="character-arcs-view__notes">
                          <h4 className="character-arcs-view__section-title">
                            <Icon name="sticky-note" size={16} />
                            Notes
                          </h4>
                          <p>{currentArc.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              ) : (
                <div className="character-arcs-view__no-selection">
                  <Icon name="users" size={32} />
                  <p>Select a character to view their arc</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* Add Character Arc Modal */}
      <AnimatePresence>
        {showAddArc && (
          <motion.div
            className="character-arcs-view__modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddArc(false)}
          >
            <motion.div
              className="character-arcs-view__modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Add Character Arc</h3>
              <p>Select a character to track their development throughout the story.</p>

              <div className="character-arcs-view__form-group">
                <label>Character</label>
                <select
                  value={newArcCharacterId}
                  onChange={(e) => setNewArcCharacterId(e.target.value)}
                >
                  <option value="">Select a character...</option>
                  {availableCharacters.map(char => (
                    <option key={char.id} value={char.id}>
                      {char.firstName} {char.lastName || ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="character-arcs-view__modal-actions">
                <ActionButton variant="ghost" onClick={() => setShowAddArc(false)}>
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="primary"
                  onClick={handleCreateArc}
                  disabled={!newArcCharacterId}
                >
                  Add Character
                </ActionButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Milestone Modal */}
      <AnimatePresence>
        {showAddMilestone && (
          <motion.div
            className="character-arcs-view__modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddMilestone(false)}
          >
            <motion.div
              className="character-arcs-view__modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Add Milestone</h3>
              <p>Track a key moment in {getCharacterName(currentArc?.characterId)}'s development.</p>

              <div className="character-arcs-view__form-group">
                <label>What happens?</label>
                <textarea
                  value={milestoneForm.description}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })}
                  placeholder="Describe the key moment..."
                  rows={2}
                />
              </div>

              <div className="character-arcs-view__form-group">
                <label>Internal Shift (optional)</label>
                <input
                  type="text"
                  value={milestoneForm.internalShift}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, internalShift: e.target.value })}
                  placeholder="How does their belief/attitude change?"
                />
              </div>

              <div className="character-arcs-view__form-group">
                <label>External Change (optional)</label>
                <input
                  type="text"
                  value={milestoneForm.externalChange}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, externalChange: e.target.value })}
                  placeholder="What visible behavior changes?"
                />
              </div>

              <div className="character-arcs-view__form-group">
                <label>Link to Scene (optional)</label>
                <select
                  value={milestoneForm.sceneId}
                  onChange={(e) => setMilestoneForm({ ...milestoneForm, sceneId: e.target.value })}
                >
                  <option value="">No scene linked</option>
                  {characterScenes.map(scene => (
                    <option key={scene.id} value={scene.id}>
                      {scene.title || 'Untitled Scene'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="character-arcs-view__modal-actions">
                <ActionButton variant="ghost" onClick={() => setShowAddMilestone(false)}>
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="primary"
                  onClick={handleAddMilestone}
                  disabled={!milestoneForm.description.trim()}
                >
                  Add Milestone
                </ActionButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default CharacterArcsView;
