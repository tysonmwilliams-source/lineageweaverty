/**
 * PlotThreadsView.jsx
 *
 * A view for managing plot threads - the various storylines, mysteries,
 * and narrative elements that weave through the story.
 *
 * Features:
 * - Thread list with type/status indicators
 * - Setup and payoff scene tracking
 * - Foreshadowing (plants) management
 * - Character involvement tracking
 * - Scene linking
 * - AI suggestions for thread development
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getPlotThreads,
  createPlotThread,
  updatePlotThread,
  deletePlotThread,
  addThreadPlant,
  getScenePlans,
  THREAD_TYPES,
  PLAN_STATUS
} from '../../../services/planningService';
import { getAllPeople } from '../../../services/database';
import { suggestPlotThread } from '../../../services/planningAIService';
import { useAuth } from '../../../contexts/AuthContext';
import './PlotThreadsView.css';
import { logger } from '../../../utils/logger';

// Thread type colors
const THREAD_TYPE_COLORS = {
  mystery: '#9b59b6',
  romance: '#e91e63',
  conflict: '#e74c3c',
  quest: '#3498db',
  secret: '#607d8b',
  prophecy: '#ff9800'
};

// Thread status options
const THREAD_STATUS = {
  setup: { name: 'Setup', icon: 'inbox', color: '#95a5a6' },
  developing: { name: 'Developing', icon: 'trending-up', color: '#3498db' },
  climax: { name: 'Climax', icon: 'zap', color: '#f39c12' },
  resolved: { name: 'Resolved', icon: 'check-circle', color: '#27ae60' },
  abandoned: { name: 'Abandoned', icon: 'x-circle', color: '#7f8c8d' }
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
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0 }
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

function PlotThreadsView({
  storyPlanId,
  datasetId,
  onClose
}) {
  const { user } = useAuth();
  const userId = user?.uid || null;
  // State
  const [threads, setThreads] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  // Modal states
  const [showAddThread, setShowAddThread] = useState(false);
  const [showEditThread, setShowEditThread] = useState(false);
  const [showAddPlant, setShowAddPlant] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    threadType: 'mystery',
    notes: ''
  });
  const [plantForm, setPlantForm] = useState({
    description: '',
    sceneId: null,
    isPayoff: false
  });

  // Get current thread
  const currentThread = useMemo(() => {
    return threads.find(t => t.id === selectedThread);
  }, [threads, selectedThread]);

  // Get thread scenes
  const threadScenes = useMemo(() => {
    if (!currentThread?.linkedScenes?.length) return [];
    return scenes.filter(s => currentThread.linkedScenes.includes(s.id));
  }, [currentThread, scenes]);

  // Get thread characters
  const threadCharacters = useMemo(() => {
    if (!currentThread?.involvedCharacters?.length) return [];
    return characters.filter(c => currentThread.involvedCharacters.includes(c.id));
  }, [currentThread, characters]);

  // Load data
  const loadData = useCallback(async () => {
    if (!storyPlanId) return;
    try {
      setLoading(true);
      const [threadsData, scenesData, peopleData] = await Promise.all([
        getPlotThreads(storyPlanId, datasetId),
        getScenePlans(storyPlanId, datasetId),
        getAllPeople(datasetId)
      ]);

      setThreads(threadsData);
      setScenes(scenesData);
      setCharacters(peopleData);

      // Select first thread if none selected
      if (threadsData.length > 0 && !selectedThread) {
        setSelectedThread(threadsData[0].id);
      }
    } catch (error) {
      logger.error('Error loading plot threads:', error);
    } finally {
      setLoading(false);
    }
  }, [storyPlanId, datasetId, selectedThread]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get scene title helper
  const getSceneTitle = (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId);
    return scene?.title || 'Unknown Scene';
  };

  // Handle create thread
  const handleCreateThread = async () => {
    if (!formData.name.trim()) return;

    try {
      const newId = await createPlotThread({
        storyPlanId,
        ...formData
      }, datasetId, userId);

      await loadData();
      setSelectedThread(newId);
      setShowAddThread(false);
      resetForm();
    } catch (error) {
      logger.error('Error creating thread:', error);
      alert('Failed to create thread. Please try again.');
    }
  };

  // Handle update thread
  const handleUpdateThread = async () => {
    if (!currentThread || !formData.name.trim()) return;

    try {
      await updatePlotThread(currentThread.id, formData, datasetId, userId);
      await loadData();
      setShowEditThread(false);
    } catch (error) {
      logger.error('Error updating thread:', error);
      alert('Failed to update thread. Please try again.');
    }
  };

  // Handle delete thread
  const handleDeleteThread = async (threadId) => {
    if (!confirm('Delete this plot thread? This cannot be undone.')) return;

    try {
      await deletePlotThread(threadId, datasetId, userId);
      if (selectedThread === threadId) {
        setSelectedThread(threads.find(t => t.id !== threadId)?.id || null);
      }
      await loadData();
    } catch (error) {
      logger.error('Error deleting thread:', error);
      alert('Failed to delete thread. Please try again.');
    }
  };

  // Handle status change
  const handleStatusChange = async (newStatus) => {
    if (!currentThread) return;

    try {
      await updatePlotThread(currentThread.id, { status: newStatus }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating status:', error);
    }
  };

  // Handle add plant (foreshadowing)
  const handleAddPlant = async () => {
    if (!currentThread || !plantForm.description.trim()) return;

    try {
      await addThreadPlant(currentThread.id, {
        description: plantForm.description,
        sceneId: plantForm.sceneId,
        isPayoff: plantForm.isPayoff,
        createdAt: new Date().toISOString()
      }, datasetId, userId);
      await loadData();
      setShowAddPlant(false);
      setPlantForm({ description: '', sceneId: null, isPayoff: false });
    } catch (error) {
      logger.error('Error adding plant:', error);
      alert('Failed to add foreshadowing. Please try again.');
    }
  };

  // Handle remove plant
  const handleRemovePlant = async (plantId) => {
    if (!currentThread) return;

    try {
      const updatedPlants = currentThread.plants.filter(p => p.id !== plantId);
      await updatePlotThread(currentThread.id, { plants: updatedPlants }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error removing plant:', error);
    }
  };

  // Handle scene linking
  const handleToggleScene = async (sceneId) => {
    if (!currentThread) return;

    try {
      const linkedScenes = currentThread.linkedScenes || [];
      const newLinkedScenes = linkedScenes.includes(sceneId)
        ? linkedScenes.filter(id => id !== sceneId)
        : [...linkedScenes, sceneId];

      await updatePlotThread(currentThread.id, { linkedScenes: newLinkedScenes }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error linking scene:', error);
    }
  };

  // Handle character involvement
  const handleToggleCharacter = async (charId) => {
    if (!currentThread) return;

    try {
      const involvedCharacters = currentThread.involvedCharacters || [];
      const newInvolved = involvedCharacters.includes(charId)
        ? involvedCharacters.filter(id => id !== charId)
        : [...involvedCharacters, charId];

      await updatePlotThread(currentThread.id, { involvedCharacters: newInvolved }, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error updating character involvement:', error);
    }
  };

  // Handle setup/payoff scene setting
  const handleSetKeyScene = async (type, sceneId) => {
    if (!currentThread) return;

    try {
      const update = type === 'setup'
        ? { setupSceneId: sceneId }
        : { payoffSceneId: sceneId };
      await updatePlotThread(currentThread.id, update, datasetId, userId);
      await loadData();
    } catch (error) {
      logger.error('Error setting key scene:', error);
    }
  };

  // AI suggestion
  const handleAISuggestion = async () => {
    if (!currentThread) return;

    setAiLoading(true);
    try {
      const suggestion = await suggestPlotThread({
        threadName: currentThread.name,
        threadType: currentThread.threadType,
        currentDescription: currentThread.description,
        involvedCharacters: threadCharacters.map(c => `${c.firstName} ${c.lastName || ''}`).join(', '),
        linkedScenes: threadScenes.map(s => s.title).join(', ')
      });

      if (suggestion) {
        await updatePlotThread(currentThread.id, {
          description: suggestion.description || currentThread.description,
          notes: suggestion.notes ? `${currentThread.notes}\n\nAI Suggestion:\n${suggestion.notes}` : currentThread.notes
        }, datasetId, userId);

        // Add suggested plants if any
        if (suggestion.suggestedPlants?.length > 0) {
          for (const plant of suggestion.suggestedPlants) {
            await addThreadPlant(currentThread.id, {
              description: plant,
              isPayoff: false,
              createdAt: new Date().toISOString()
            }, datasetId, userId);
          }
        }

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
      description: '',
      threadType: 'mystery',
      notes: ''
    });
  };

  // Open edit modal
  const openEditModal = () => {
    if (currentThread) {
      setFormData({
        name: currentThread.name,
        description: currentThread.description,
        threadType: currentThread.threadType,
        notes: currentThread.notes
      });
      setShowEditThread(true);
    }
  };

  if (loading) {
    return (
      <div className="plot-threads-view plot-threads-view--loading">
        <Icon name="loader" size={32} className="spinning" />
        <p>Loading plot threads...</p>
      </div>
    );
  }

  return (
    <div className="plot-threads-view">
      {/* Header */}
      <header className="plot-threads-view__header">
        <div className="plot-threads-view__header-info">
          <Icon name="git-branch" size={24} />
          <h2>Plot Threads</h2>
          <span className="plot-threads-view__count">
            {threads.length} thread{threads.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="plot-threads-view__header-actions">
          <ActionButton
            icon="plus"
            variant="secondary"
            size="small"
            onClick={() => setShowAddThread(true)}
          >
            Add Thread
          </ActionButton>
          {onClose && (
            <button className="plot-threads-view__close-btn" onClick={onClose}>
              <Icon name="x" size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="plot-threads-view__content">
        {threads.length === 0 ? (
          /* Empty State */
          <div className="plot-threads-view__empty">
            <Icon name="git-branch" size={48} />
            <h3>No Plot Threads</h3>
            <p>Track the storylines and mysteries woven through your narrative.</p>
            <ActionButton
              icon="plus"
              variant="primary"
              onClick={() => setShowAddThread(true)}
            >
              Add First Thread
            </ActionButton>
          </div>
        ) : (
          <>
            {/* Thread List Sidebar */}
            <aside className="plot-threads-view__sidebar">
              <motion.div
                className="plot-threads-view__thread-list"
                variants={LIST_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {threads.map(thread => (
                  <motion.button
                    key={thread.id}
                    className={`plot-threads-view__thread-item ${selectedThread === thread.id ? 'plot-threads-view__thread-item--selected' : ''}`}
                    variants={CARD_VARIANTS}
                    onClick={() => setSelectedThread(thread.id)}
                  >
                    <div
                      className="plot-threads-view__thread-indicator"
                      style={{ backgroundColor: THREAD_TYPE_COLORS[thread.threadType] }}
                    >
                      <Icon name={THREAD_TYPES[thread.threadType]?.icon || 'help-circle'} size={14} />
                    </div>
                    <div className="plot-threads-view__thread-info">
                      <span className="plot-threads-view__thread-name">
                        {thread.name}
                      </span>
                      <span className="plot-threads-view__thread-type">
                        {THREAD_TYPES[thread.threadType]?.name || 'Unknown'}
                      </span>
                    </div>
                    <span
                      className="plot-threads-view__thread-status"
                      style={{ color: THREAD_STATUS[thread.status]?.color }}
                    >
                      <Icon name={THREAD_STATUS[thread.status]?.icon || 'help-circle'} size={14} />
                    </span>
                  </motion.button>
                ))}
              </motion.div>
            </aside>

            {/* Thread Detail Panel */}
            <main className="plot-threads-view__detail">
              {currentThread ? (
                <>
                  {/* Thread Header */}
                  <div className="plot-threads-view__detail-header">
                    <div
                      className="plot-threads-view__type-badge"
                      style={{ backgroundColor: THREAD_TYPE_COLORS[currentThread.threadType] }}
                    >
                      <Icon name={THREAD_TYPES[currentThread.threadType]?.icon || 'help-circle'} size={16} />
                      {THREAD_TYPES[currentThread.threadType]?.name}
                    </div>
                    <h3>{currentThread.name}</h3>
                    <div className="plot-threads-view__detail-actions">
                      <button
                        className="plot-threads-view__action-btn"
                        onClick={handleAISuggestion}
                        disabled={aiLoading}
                        title="Get AI suggestions"
                      >
                        <Icon name={aiLoading ? 'loader' : 'sparkles'} size={18} className={aiLoading ? 'spinning' : ''} />
                      </button>
                      <button
                        className="plot-threads-view__action-btn"
                        onClick={openEditModal}
                        title="Edit thread"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        className="plot-threads-view__action-btn plot-threads-view__action-btn--danger"
                        onClick={() => handleDeleteThread(currentThread.id)}
                        title="Delete thread"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="plot-threads-view__status-section">
                    <label>Status</label>
                    <div className="plot-threads-view__status-options">
                      {Object.entries(THREAD_STATUS).map(([key, status]) => (
                        <button
                          key={key}
                          className={`plot-threads-view__status-btn ${currentThread.status === key ? 'plot-threads-view__status-btn--active' : ''}`}
                          style={{ '--status-color': status.color }}
                          onClick={() => handleStatusChange(key)}
                        >
                          <Icon name={status.icon} size={14} />
                          {status.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="plot-threads-view__section">
                    <h4>Description</h4>
                    <p className="plot-threads-view__description">
                      {currentThread.description || 'No description yet.'}
                    </p>
                  </div>

                  {/* Setup & Payoff */}
                  <div className="plot-threads-view__key-scenes">
                    <div className="plot-threads-view__key-scene">
                      <h4>
                        <Icon name="inbox" size={16} />
                        Setup Scene
                      </h4>
                      {currentThread.setupSceneId ? (
                        <div className="plot-threads-view__scene-link">
                          <span>{getSceneTitle(currentThread.setupSceneId)}</span>
                          <button onClick={() => handleSetKeyScene('setup', null)}>
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      ) : (
                        <select
                          onChange={(e) => handleSetKeyScene('setup', parseInt(e.target.value))}
                          value=""
                        >
                          <option value="">Select setup scene...</option>
                          {scenes.map(scene => (
                            <option key={scene.id} value={scene.id}>{scene.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="plot-threads-view__key-scene">
                      <h4>
                        <Icon name="check-circle" size={16} />
                        Payoff Scene
                      </h4>
                      {currentThread.payoffSceneId ? (
                        <div className="plot-threads-view__scene-link">
                          <span>{getSceneTitle(currentThread.payoffSceneId)}</span>
                          <button onClick={() => handleSetKeyScene('payoff', null)}>
                            <Icon name="x" size={14} />
                          </button>
                        </div>
                      ) : (
                        <select
                          onChange={(e) => handleSetKeyScene('payoff', parseInt(e.target.value))}
                          value=""
                        >
                          <option value="">Select payoff scene...</option>
                          {scenes.map(scene => (
                            <option key={scene.id} value={scene.id}>{scene.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Plants (Foreshadowing) */}
                  <div className="plot-threads-view__section">
                    <div className="plot-threads-view__section-header">
                      <h4>
                        <Icon name="lightbulb" size={16} />
                        Foreshadowing & Plants
                      </h4>
                      <button
                        className="plot-threads-view__add-btn"
                        onClick={() => setShowAddPlant(true)}
                      >
                        <Icon name="plus" size={14} />
                        Add
                      </button>
                    </div>
                    {currentThread.plants?.length > 0 ? (
                      <ul className="plot-threads-view__plants-list">
                        {currentThread.plants.map(plant => (
                          <li key={plant.id} className={`plot-threads-view__plant ${plant.isPayoff ? 'plot-threads-view__plant--payoff' : ''}`}>
                            <div className="plot-threads-view__plant-content">
                              <Icon name={plant.isPayoff ? 'check-circle' : 'lightbulb'} size={14} />
                              <span>{plant.description}</span>
                              {plant.sceneId && (
                                <span className="plot-threads-view__plant-scene">
                                  in {getSceneTitle(plant.sceneId)}
                                </span>
                              )}
                            </div>
                            <button
                              className="plot-threads-view__plant-remove"
                              onClick={() => handleRemovePlant(plant.id)}
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="plot-threads-view__empty-hint">
                        Add foreshadowing elements that hint at this thread's resolution.
                      </p>
                    )}
                  </div>

                  {/* Involved Characters */}
                  <div className="plot-threads-view__section">
                    <h4>
                      <Icon name="users" size={16} />
                      Involved Characters
                    </h4>
                    <div className="plot-threads-view__characters-grid">
                      {characters.slice(0, 20).map(char => (
                        <button
                          key={char.id}
                          className={`plot-threads-view__character-chip ${currentThread.involvedCharacters?.includes(char.id) ? 'plot-threads-view__character-chip--active' : ''}`}
                          onClick={() => handleToggleCharacter(char.id)}
                        >
                          {char.firstName} {char.lastName?.[0] || ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Linked Scenes */}
                  <div className="plot-threads-view__section">
                    <h4>
                      <Icon name="list" size={16} />
                      Linked Scenes
                    </h4>
                    <div className="plot-threads-view__scenes-list">
                      {scenes.map(scene => (
                        <label key={scene.id} className="plot-threads-view__scene-checkbox">
                          <input
                            type="checkbox"
                            checked={currentThread.linkedScenes?.includes(scene.id) || false}
                            onChange={() => handleToggleScene(scene.id)}
                          />
                          <span>{scene.title}</span>
                          {scene.id === currentThread.setupSceneId && (
                            <span className="plot-threads-view__scene-tag">Setup</span>
                          )}
                          {scene.id === currentThread.payoffSceneId && (
                            <span className="plot-threads-view__scene-tag plot-threads-view__scene-tag--payoff">Payoff</span>
                          )}
                        </label>
                      ))}
                      {scenes.length === 0 && (
                        <p className="plot-threads-view__empty-hint">
                          Add scenes to your story plan to link them to this thread.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {currentThread.notes && (
                    <div className="plot-threads-view__section">
                      <h4>
                        <Icon name="file-text" size={16} />
                        Notes
                      </h4>
                      <p className="plot-threads-view__notes">{currentThread.notes}</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="plot-threads-view__no-selection">
                  <Icon name="git-branch" size={32} />
                  <p>Select a thread to view details</p>
                </div>
              )}
            </main>
          </>
        )}
      </div>

      {/* Add Thread Modal */}
      <AnimatePresence>
        {showAddThread && (
          <motion.div
            className="plot-threads-view__modal-backdrop"
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowAddThread(false)}
          >
            <motion.div
              className="plot-threads-view__modal"
              onClick={e => e.stopPropagation()}
            >
              <h3>Add Plot Thread</h3>
              <div className="plot-threads-view__form">
                <div className="plot-threads-view__form-group">
                  <label>Thread Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., The Hidden Heir Mystery"
                    autoFocus
                  />
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Thread Type</label>
                  <div className="plot-threads-view__type-grid">
                    {Object.entries(THREAD_TYPES).map(([key, type]) => (
                      <button
                        key={key}
                        className={`plot-threads-view__type-option ${formData.threadType === key ? 'plot-threads-view__type-option--selected' : ''}`}
                        style={{ '--type-color': THREAD_TYPE_COLORS[key] }}
                        onClick={() => setFormData(prev => ({ ...prev, threadType: key }))}
                      >
                        <Icon name={type.icon} size={18} />
                        {type.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What is this thread about?"
                    rows={3}
                  />
                </div>
                <div className="plot-threads-view__form-actions">
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--secondary"
                    onClick={() => { setShowAddThread(false); resetForm(); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--primary"
                    onClick={handleCreateThread}
                    disabled={!formData.name.trim()}
                  >
                    Create Thread
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Thread Modal */}
      <AnimatePresence>
        {showEditThread && (
          <motion.div
            className="plot-threads-view__modal-backdrop"
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowEditThread(false)}
          >
            <motion.div
              className="plot-threads-view__modal"
              onClick={e => e.stopPropagation()}
            >
              <h3>Edit Plot Thread</h3>
              <div className="plot-threads-view__form">
                <div className="plot-threads-view__form-group">
                  <label>Thread Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Thread Type</label>
                  <div className="plot-threads-view__type-grid">
                    {Object.entries(THREAD_TYPES).map(([key, type]) => (
                      <button
                        key={key}
                        className={`plot-threads-view__type-option ${formData.threadType === key ? 'plot-threads-view__type-option--selected' : ''}`}
                        style={{ '--type-color': THREAD_TYPE_COLORS[key] }}
                        onClick={() => setFormData(prev => ({ ...prev, threadType: key }))}
                      >
                        <Icon name={type.icon} size={18} />
                        {type.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Planning notes, ideas, etc."
                  />
                </div>
                <div className="plot-threads-view__form-actions">
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--secondary"
                    onClick={() => setShowEditThread(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--primary"
                    onClick={handleUpdateThread}
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

      {/* Add Plant Modal */}
      <AnimatePresence>
        {showAddPlant && (
          <motion.div
            className="plot-threads-view__modal-backdrop"
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setShowAddPlant(false)}
          >
            <motion.div
              className="plot-threads-view__modal plot-threads-view__modal--small"
              onClick={e => e.stopPropagation()}
            >
              <h3>Add Foreshadowing</h3>
              <div className="plot-threads-view__form">
                <div className="plot-threads-view__form-group">
                  <label>Description</label>
                  <textarea
                    value={plantForm.description}
                    onChange={e => setPlantForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What hints at or foreshadows this thread?"
                    rows={3}
                    autoFocus
                  />
                </div>
                <div className="plot-threads-view__form-group">
                  <label>Scene (optional)</label>
                  <select
                    value={plantForm.sceneId || ''}
                    onChange={e => setPlantForm(prev => ({ ...prev, sceneId: e.target.value ? parseInt(e.target.value) : null }))}
                  >
                    <option value="">No specific scene</option>
                    {scenes.map(scene => (
                      <option key={scene.id} value={scene.id}>{scene.title}</option>
                    ))}
                  </select>
                </div>
                <div className="plot-threads-view__form-group">
                  <label className="plot-threads-view__checkbox-label">
                    <input
                      type="checkbox"
                      checked={plantForm.isPayoff}
                      onChange={e => setPlantForm(prev => ({ ...prev, isPayoff: e.target.checked }))}
                    />
                    This is a payoff (resolution) of earlier foreshadowing
                  </label>
                </div>
                <div className="plot-threads-view__form-actions">
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--secondary"
                    onClick={() => { setShowAddPlant(false); setPlantForm({ description: '', sceneId: null, isPayoff: false }); }}
                  >
                    Cancel
                  </button>
                  <button
                    className="plot-threads-view__form-btn plot-threads-view__form-btn--primary"
                    onClick={handleAddPlant}
                    disabled={!plantForm.description.trim()}
                  >
                    Add Foreshadowing
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

export default PlotThreadsView;
