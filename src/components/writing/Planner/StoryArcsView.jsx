/**
 * StoryArcsView.jsx
 *
 * A view for managing story arcs - the macro-level narrative structures
 * that span the entire story including main plot, subplots, and thematic arcs.
 *
 * Features:
 * - Arc list with type indicators
 * - Starting/ending state tracking
 * - Value at stake definition
 * - Character linking
 * - Visual arc progression
 * - AI suggestions for arc development
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getStoryArcs,
  createStoryArc,
  updateStoryArc,
  deleteStoryArc,
  getStoryBeats,
  getScenePlans,
  ARC_TYPES,
  PLAN_STATUS
} from '../../../services/planningService';
import { getAllPeople } from '../../../services/database';
import { suggestStoryArc } from '../../../services/planningAIService';
import { useAuth } from '../../../contexts/AuthContext';
import './StoryArcsView.css';
import { logger } from '../../../utils/logger';

// Arc type icons
const ARC_TYPE_ICONS = {
  main: 'target',
  subplot: 'git-branch',
  character: 'user',
  thematic: 'lightbulb'
};

// Animation variants
const LIST_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

function StoryArcsView({
  storyPlanId,
  datasetId,
  onClose
}) {
  const { user } = useAuth();
  const userId = user?.uid || null;
  // State
  const [arcs, setArcs] = useState([]);
  const [beats, setBeats] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedArc, setSelectedArc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  // Modal states
  const [showAddArc, setShowAddArc] = useState(false);
  const [showEditArc, setShowEditArc] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'subplot',
    description: '',
    startingState: '',
    endingState: '',
    valueAtStake: '',
    color: '#8b5cf6'
  });

  // Get current arc
  const currentArc = useMemo(() => {
    return arcs.find(a => a.id === selectedArc);
  }, [arcs, selectedArc]);

  // Get arc beats (beats linked to this arc)
  const arcBeats = useMemo(() => {
    if (!currentArc) return [];
    return beats.filter(b => b.storyArcId === currentArc.id);
  }, [currentArc, beats]);

  // Get arc scenes (scenes linked to this arc)
  const arcScenes = useMemo(() => {
    if (!currentArc) return [];
    return scenes.filter(s => s.storyArcIds?.includes(currentArc.id));
  }, [currentArc, scenes]);

  // Get arc characters
  const arcCharacters = useMemo(() => {
    if (!currentArc?.linkedCharacters?.length) return [];
    return characters.filter(c => currentArc.linkedCharacters.includes(c.id));
  }, [currentArc, characters]);

  // Calculate arc progress
  const arcProgress = useMemo(() => {
    if (!currentArc) return 0;
    const totalScenes = arcScenes.length;
    if (totalScenes === 0) return 0;
    const completedScenes = arcScenes.filter(s =>
      s.status === 'complete' || s.status === 'revised'
    ).length;
    return Math.round((completedScenes / totalScenes) * 100);
  }, [currentArc, arcScenes]);

  // Load data
  const loadData = useCallback(async () => {
    if (!storyPlanId) return;
    try {
      setLoading(true);
      const [arcsData, beatsData, scenesData, peopleData] = await Promise.all([
        getStoryArcs(storyPlanId, datasetId),
        getStoryBeats(storyPlanId, datasetId),
        getScenePlans(storyPlanId, datasetId),
        getAllPeople(datasetId)
      ]);

      setArcs(arcsData);
      setBeats(beatsData);
      setScenes(scenesData);
      setCharacters(peopleData);

      // Select first arc if none selected
      if (arcsData.length > 0 && !selectedArc) {
        setSelectedArc(arcsData[0].id);
      }
    } catch (error) {
      logger.error('Error loading story arcs:', error);
    } finally {
      setLoading(false);
    }
  }, [storyPlanId, datasetId, selectedArc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle create arc
  const handleCreateArc = async () => {
    if (!formData.name.trim()) return;

    try {
      const newId = await createStoryArc({
        storyPlanId,
        ...formData
      }, datasetId, userId);

      await loadData();
      setSelectedArc(newId);
      setShowAddArc(false);
      resetForm();
    } catch (error) {
      logger.error('Error creating arc:', error);
      alert('Failed to create arc. Please try again.');
    }
  };

  // Handle update arc
  const handleUpdateArc = async () => {
    if (!currentArc || !formData.name.trim()) return;

    try {
      await updateStoryArc(currentArc.id, formData, datasetId, userId);
      await loadData();
      setShowEditArc(false);
    } catch (error) {
      logger.error('Error updating arc:', error);
      alert('Failed to update arc. Please try again.');
    }
  };

  // Handle delete arc
  const handleDeleteArc = async (arcId) => {
    if (!confirm('Delete this story arc? This cannot be undone.')) return;

    try {
      await deleteStoryArc(arcId, datasetId, userId);
      if (selectedArc === arcId) {
        setSelectedArc(arcs.find(a => a.id !== arcId)?.id || null);
      }
      await loadData();
    } catch (error) {
      logger.error('Error deleting arc:', error);
      alert('Failed to delete arc. Please try again.');
    }
  };

  // Handle status change
  const handleStatusChange = async (newStatus) => {
    if (!currentArc) return;

    try {
      await updateStoryArc(currentArc.id, { status: newStatus }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating status:', error);
    }
  };

  // Handle character linking
  const handleToggleCharacter = async (charId) => {
    if (!currentArc) return;

    try {
      const linkedCharacters = currentArc.linkedCharacters || [];
      const newLinked = linkedCharacters.includes(charId)
        ? linkedCharacters.filter(id => id !== charId)
        : [...linkedCharacters, charId];

      await updateStoryArc(currentArc.id, { linkedCharacters: newLinked }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating character link:', error);
    }
  };

  // Handle move arc up/down
  const handleMoveArc = async (arcId, direction) => {
    const arcIndex = arcs.findIndex(a => a.id === arcId);
    if (arcIndex === -1) return;

    const newIndex = direction === 'up' ? arcIndex - 1 : arcIndex + 1;
    if (newIndex < 0 || newIndex >= arcs.length) return;

    try {
      const currentOrder = arcs[arcIndex].order;
      const targetOrder = arcs[newIndex].order;

      await updateStoryArc(arcId, { order: targetOrder }, datasetId, userId);
      await updateStoryArc(arcs[newIndex].id, { order: currentOrder }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error reordering arcs:', error);
    }
  };

  // AI suggestion
  const handleAISuggestion = async () => {
    if (!currentArc) return;

    setAiLoading(true);
    try {
      const suggestion = await suggestStoryArc({
        arcName: currentArc.name,
        arcType: currentArc.type,
        currentDescription: currentArc.description,
        linkedCharacters: arcCharacters.map(c => `${c.firstName} ${c.lastName || ''}`).join(', ')
      });

      if (suggestion) {
        await updateStoryArc(currentArc.id, {
          description: suggestion.description || currentArc.description,
          startingState: suggestion.startingState || currentArc.startingState,
          endingState: suggestion.endingState || currentArc.endingState,
          valueAtStake: suggestion.valueAtStake || currentArc.valueAtStake
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

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      type: 'subplot',
      description: '',
      startingState: '',
      endingState: '',
      valueAtStake: '',
      color: '#8b5cf6'
    });
  };

  // Open edit modal
  const openEditModal = () => {
    if (currentArc) {
      setFormData({
        name: currentArc.name,
        type: currentArc.type,
        description: currentArc.description,
        startingState: currentArc.startingState,
        endingState: currentArc.endingState,
        valueAtStake: currentArc.valueAtStake,
        color: currentArc.color
      });
      setShowEditArc(true);
    }
  };

  if (loading) {
    return (
      <div className="story-arcs-view story-arcs-view--loading">
        <Icon name="loader" size={32} className="spinning" />
        <p>Loading story arcs...</p>
      </div>
    );
  }

  return (
    <div className="story-arcs-view">
      {/* Header */}
      <header className="story-arcs-view__header">
        <div className="story-arcs-view__header-info">
          <Icon name="activity" size={24} />
          <h2>Story Arcs</h2>
          <span className="story-arcs-view__count">
            {arcs.length} arc{arcs.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="story-arcs-view__header-actions">
          <ActionButton
            icon="plus"
            variant="secondary"
            size="small"
            onClick={() => setShowAddArc(true)}
          >
            Add Arc
          </ActionButton>
          {onClose && (
            <button className="story-arcs-view__close-btn" onClick={onClose}>
              <Icon name="x" size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="story-arcs-view__content">
        {arcs.length === 0 ? (
          /* Empty State */
          <div className="story-arcs-view__empty">
            <Icon name="activity" size={48} />
            <h3>No Story Arcs</h3>
            <p>Define the narrative arcs that drive your story forward.</p>
            <ActionButton
              icon="plus"
              variant="primary"
              onClick={() => setShowAddArc(true)}
            >
              Add First Arc
            </ActionButton>
          </div>
        ) : (
          <>
            {/* Arc List Sidebar */}
            <aside className="story-arcs-view__sidebar">
              <motion.div
                className="story-arcs-view__arc-list"
                variants={LIST_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {arcs.map((arc, index) => (
                  <motion.div
                    key={arc.id}
                    className={`story-arcs-view__arc-item ${selectedArc === arc.id ? 'story-arcs-view__arc-item--selected' : ''}`}
                    variants={CARD_VARIANTS}
                  >
                    <button
                      className="story-arcs-view__arc-btn"
                      onClick={() => setSelectedArc(arc.id)}
                    >
                      <div
                        className="story-arcs-view__arc-indicator"
                        style={{ backgroundColor: arc.color || ARC_TYPES[arc.type]?.color }}
                      >
                        <Icon name={ARC_TYPE_ICONS[arc.type] || 'activity'} size={14} />
                      </div>
                      <div className="story-arcs-view__arc-info">
                        <span className="story-arcs-view__arc-name">
                          {arc.name}
                        </span>
                        <span className="story-arcs-view__arc-type">
                          {ARC_TYPES[arc.type]?.name || 'Unknown'}
                        </span>
                      </div>
                    </button>
                    <div className="story-arcs-view__arc-order">
                      <button
                        onClick={() => handleMoveArc(arc.id, 'up')}
                        disabled={index === 0}
                        title="Move up"
                      >
                        <Icon name="chevron-up" size={14} />
                      </button>
                      <button
                        onClick={() => handleMoveArc(arc.id, 'down')}
                        disabled={index === arcs.length - 1}
                        title="Move down"
                      >
                        <Icon name="chevron-down" size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </aside>

            {/* Arc Detail Panel */}
            <main className="story-arcs-view__detail">
              {currentArc ? (
                <>
                  {/* Arc Header */}
                  <div className="story-arcs-view__detail-header">
                    <div
                      className="story-arcs-view__type-badge"
                      style={{ backgroundColor: currentArc.color || ARC_TYPES[currentArc.type]?.color }}
                    >
                      <Icon name={ARC_TYPE_ICONS[currentArc.type] || 'activity'} size={16} />
                      {ARC_TYPES[currentArc.type]?.name}
                    </div>
                    <h3>{currentArc.name}</h3>
                    <div className="story-arcs-view__detail-actions">
                      <button
                        className="story-arcs-view__action-btn"
                        onClick={handleAISuggestion}
                        disabled={aiLoading}
                        title="Get AI suggestions"
                      >
                        <Icon name={aiLoading ? 'loader' : 'sparkles'} size={18} className={aiLoading ? 'spinning' : ''} />
                      </button>
                      <button
                        className="story-arcs-view__action-btn"
                        onClick={openEditModal}
                        title="Edit arc"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        className="story-arcs-view__action-btn story-arcs-view__action-btn--danger"
                        onClick={() => handleDeleteArc(currentArc.id)}
                        title="Delete arc"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="story-arcs-view__progress-section">
                    <div className="story-arcs-view__progress-header">
                      <span>Progress</span>
                      <span>{arcProgress}%</span>
                    </div>
                    <div className="story-arcs-view__progress-bar">
                      <div
                        className="story-arcs-view__progress-fill"
                        style={{
                          width: `${arcProgress}%`,
                          backgroundColor: currentArc.color || ARC_TYPES[currentArc.type]?.color
                        }}
                      />
                    </div>
                    <div className="story-arcs-view__progress-stats">
                      <span>{arcScenes.length} scenes</span>
                      <span>{arcBeats.length} beats</span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="story-arcs-view__status-section">
                    <label>Status</label>
                    <div className="story-arcs-view__status-options">
                      {Object.entries(PLAN_STATUS).map(([key, label]) => (
                        <button
                          key={key}
                          className={`story-arcs-view__status-btn ${currentArc.status === key ? 'story-arcs-view__status-btn--active' : ''}`}
                          onClick={() => handleStatusChange(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="story-arcs-view__section">
                    <h4>Description</h4>
                    <p className="story-arcs-view__description">
                      {currentArc.description || 'No description yet.'}
                    </p>
                  </div>

                  {/* Arc Journey */}
                  <div className="story-arcs-view__journey">
                    <h4>
                      <Icon name="trending-up" size={16} />
                      Arc Journey
                    </h4>
                    <div className="story-arcs-view__journey-content">
                      <div className="story-arcs-view__journey-point story-arcs-view__journey-point--start">
                        <div className="story-arcs-view__journey-marker" style={{ backgroundColor: currentArc.color }} />
                        <div className="story-arcs-view__journey-info">
                          <span className="story-arcs-view__journey-label">Starting State</span>
                          <p>{currentArc.startingState || 'Not defined'}</p>
                        </div>
                      </div>
                      <div className="story-arcs-view__journey-line" style={{ backgroundColor: currentArc.color }} />
                      <div className="story-arcs-view__journey-point story-arcs-view__journey-point--end">
                        <div className="story-arcs-view__journey-marker" style={{ backgroundColor: currentArc.color }} />
                        <div className="story-arcs-view__journey-info">
                          <span className="story-arcs-view__journey-label">Ending State</span>
                          <p>{currentArc.endingState || 'Not defined'}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Value at Stake */}
                  <div className="story-arcs-view__section">
                    <h4>
                      <Icon name="alert-circle" size={16} />
                      Value at Stake
                    </h4>
                    <p className="story-arcs-view__value">
                      {currentArc.valueAtStake || 'Not defined - what could be lost or gained?'}
                    </p>
                  </div>

                  {/* Linked Characters */}
                  <div className="story-arcs-view__section">
                    <h4>
                      <Icon name="users" size={16} />
                      Linked Characters
                    </h4>
                    <div className="story-arcs-view__characters-grid">
                      {characters.slice(0, 20).map(char => (
                        <button
                          key={char.id}
                          className={`story-arcs-view__character-chip ${currentArc.linkedCharacters?.includes(char.id) ? 'story-arcs-view__character-chip--active' : ''}`}
                          onClick={() => handleToggleCharacter(char.id)}
                        >
                          {char.firstName} {char.lastName?.[0] || ''}
                        </button>
                      ))}
                      {characters.length === 0 && (
                        <p className="story-arcs-view__empty-hint">
                          Add characters to your genealogy to link them to arcs.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Connected Elements */}
                  {(arcBeats.length > 0 || arcScenes.length > 0) && (
                    <div className="story-arcs-view__section">
                      <h4>
                        <Icon name="link" size={16} />
                        Connected Elements
                      </h4>
                      <div className="story-arcs-view__connections">
                        {arcBeats.length > 0 && (
                          <div className="story-arcs-view__connection-group">
                            <span className="story-arcs-view__connection-label">Beats</span>
                            <div className="story-arcs-view__connection-items">
                              {arcBeats.map(beat => (
                                <span key={beat.id} className="story-arcs-view__connection-item">
                                  {beat.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {arcScenes.length > 0 && (
                          <div className="story-arcs-view__connection-group">
                            <span className="story-arcs-view__connection-label">Scenes</span>
                            <div className="story-arcs-view__connection-items">
                              {arcScenes.map(scene => (
                                <span key={scene.id} className="story-arcs-view__connection-item">
                                  {scene.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="story-arcs-view__no-selection">
                  <Icon name="activity" size={32} />
                  <p>Select an arc to view details</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* Add Arc Modal */}
      <AnimatePresence>
        {showAddArc && (
          <motion.div
            className="story-arcs-view__modal-backdrop"
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowAddArc(false)}
          >
            <motion.div
              className="story-arcs-view__modal"
              onClick={e => e.stopPropagation()}
            >
              <h3>Add Story Arc</h3>
              <div className="story-arcs-view__form">
                <div className="story-arcs-view__form-group">
                  <label>Arc Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., The Quest for the Crown"
                    autoFocus
                  />
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Arc Type</label>
                  <div className="story-arcs-view__type-grid">
                    {Object.entries(ARC_TYPES).map(([key, type]) => (
                      <button
                        key={key}
                        className={`story-arcs-view__type-option ${formData.type === key ? 'story-arcs-view__type-option--selected' : ''}`}
                        style={{ '--type-color': type.color }}
                        onClick={() => setFormData(prev => ({ ...prev, type: key, color: type.color }))}
                      >
                        <Icon name={ARC_TYPE_ICONS[key]} size={18} />
                        {type.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What is this arc about?"
                    rows={3}
                  />
                </div>
                <div className="story-arcs-view__form-row">
                  <div className="story-arcs-view__form-group">
                    <label>Starting State</label>
                    <input
                      type="text"
                      value={formData.startingState}
                      onChange={e => setFormData(prev => ({ ...prev, startingState: e.target.value }))}
                      placeholder="Where does this arc begin?"
                    />
                  </div>
                  <div className="story-arcs-view__form-group">
                    <label>Ending State</label>
                    <input
                      type="text"
                      value={formData.endingState}
                      onChange={e => setFormData(prev => ({ ...prev, endingState: e.target.value }))}
                      placeholder="Where does this arc end?"
                    />
                  </div>
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Value at Stake</label>
                  <input
                    type="text"
                    value={formData.valueAtStake}
                    onChange={e => setFormData(prev => ({ ...prev, valueAtStake: e.target.value }))}
                    placeholder="What could be lost or gained?"
                  />
                </div>
                <div className="story-arcs-view__form-actions">
                  <button
                    className="story-arcs-view__form-btn story-arcs-view__form-btn--secondary"
                    onClick={() => { setShowAddArc(false); resetForm(); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="story-arcs-view__form-btn story-arcs-view__form-btn--primary"
                    onClick={handleCreateArc}
                    disabled={!formData.name.trim()}
                  >
                    Create Arc
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Arc Modal */}
      <AnimatePresence>
        {showEditArc && (
          <motion.div
            className="story-arcs-view__modal-backdrop"
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowEditArc(false)}
          >
            <motion.div
              className="story-arcs-view__modal"
              onClick={e => e.stopPropagation()}
            >
              <h3>Edit Story Arc</h3>
              <div className="story-arcs-view__form">
                <div className="story-arcs-view__form-group">
                  <label>Arc Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Arc Type</label>
                  <div className="story-arcs-view__type-grid">
                    {Object.entries(ARC_TYPES).map(([key, type]) => (
                      <button
                        key={key}
                        className={`story-arcs-view__type-option ${formData.type === key ? 'story-arcs-view__type-option--selected' : ''}`}
                        style={{ '--type-color': type.color }}
                        onClick={() => setFormData(prev => ({ ...prev, type: key, color: type.color }))}
                      >
                        <Icon name={ARC_TYPE_ICONS[key]} size={18} />
                        {type.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="story-arcs-view__form-row">
                  <div className="story-arcs-view__form-group">
                    <label>Starting State</label>
                    <input
                      type="text"
                      value={formData.startingState}
                      onChange={e => setFormData(prev => ({ ...prev, startingState: e.target.value }))}
                    />
                  </div>
                  <div className="story-arcs-view__form-group">
                    <label>Ending State</label>
                    <input
                      type="text"
                      value={formData.endingState}
                      onChange={e => setFormData(prev => ({ ...prev, endingState: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="story-arcs-view__form-group">
                  <label>Value at Stake</label>
                  <input
                    type="text"
                    value={formData.valueAtStake}
                    onChange={e => setFormData(prev => ({ ...prev, valueAtStake: e.target.value }))}
                  />
                </div>
                <div className="story-arcs-view__form-actions">
                  <button
                    className="story-arcs-view__form-btn story-arcs-view__form-btn--secondary"
                    onClick={() => setShowEditArc(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="story-arcs-view__form-btn story-arcs-view__form-btn--primary"
                    onClick={handleUpdateArc}
                    disabled={!formData.name.trim()}
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StoryArcsView;
