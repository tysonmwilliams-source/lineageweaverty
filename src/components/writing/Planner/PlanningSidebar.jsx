/**
 * PlanningSidebar.jsx
 *
 * A sidebar panel for the WritingEditor that shows planning context
 * for the current chapter/scene being written.
 *
 * Features:
 * - Current beat context (which story beat this chapter fulfills)
 * - Scene goals and conflicts
 * - Character presence
 * - Active plot threads
 * - Quick notes from plan
 * - AI suggestions
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getStoryPlanByWriting,
  getStoryBeats,
  getScenePlansByChapter,
  getPlotThreads,
  getCharacterArcs,
  PLANNING_FRAMEWORKS,
  PACING_TYPES
} from '../../../services/planningService';
import { getQuickSuggestion } from '../../../services/planningAIService';
import { useDataset } from '../../../contexts/DatasetContext';
import './PlanningSidebar.css';
import { logger } from '../../../utils/logger';

// Animation variants
const SECTION_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  }
};

function PlanningSidebar({
  writingId,
  chapterId,
  onOpenPlanner,
  onCreatePlan
}) {
  const { activeDataset } = useDataset();

  // State
  const [plan, setPlan] = useState(null);
  const [beats, setBeats] = useState([]);
  const [sceneForChapter, setSceneForChapter] = useState(null);
  const [threads, setThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState('beat');

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load planning data
  useEffect(() => {
    loadPlanningData();
  }, [writingId, chapterId, activeDataset]);

  const loadPlanningData = async () => {
    setIsLoading(true);
    try {
      const existingPlan = await getStoryPlanByWriting(writingId, activeDataset?.id);

      if (existingPlan) {
        setPlan(existingPlan);

        // Load associated data
        const [beatsData, scenesData, threadsData] = await Promise.all([
          getStoryBeats(existingPlan.id, activeDataset?.id),
          chapterId ? getScenePlansByChapter(chapterId, activeDataset?.id) : Promise.resolve([]),
          getPlotThreads(existingPlan.id, activeDataset?.id)
        ]);

        setBeats(beatsData);
        setSceneForChapter(scenesData[0] || null); // Get first scene for this chapter
        setThreads(threadsData.filter(t => t.status !== 'resolved'));
      } else {
        setPlan(null);
        setBeats([]);
        setSceneForChapter(null);
        setThreads([]);
      }
    } catch (error) {
      logger.error('Error loading planning data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get current beat based on chapter position
  const currentBeat = useMemo(() => {
    if (!beats.length || !chapterId) return null;

    // Find beat linked to this chapter
    const linkedBeat = beats.find(b => b.actualChapterId === chapterId);
    if (linkedBeat) return linkedBeat;

    // Otherwise return next unfinished beat
    return beats.find(b => b.status !== 'complete') || beats[0];
  }, [beats, chapterId]);

  // Get framework info
  const frameworkInfo = useMemo(() => {
    if (!plan?.framework) return null;
    return PLANNING_FRAMEWORKS[plan.framework];
  }, [plan?.framework]);

  // Toggle section
  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Get AI suggestion
  const handleGetSuggestion = async (type) => {
    setAiLoading(true);
    setAiSuggestion(null);

    try {
      const context = {
        goal: sceneForChapter?.goal || currentBeat?.description,
        situation: currentBeat?.name || 'current scene',
        tensionLevel: sceneForChapter?.tensionLevel || 5
      };

      const suggestion = await getQuickSuggestion(type, context);
      setAiSuggestion({ type, text: suggestion });
    } catch (error) {
      logger.error('Error getting suggestion:', error);
      setAiSuggestion({ type: 'error', text: 'Could not generate suggestion.' });
    } finally {
      setAiLoading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="planning-sidebar planning-sidebar--loading">
        <div className="planning-sidebar__loader">
          <Icon name="loader" size={20} className="spinning" />
          <span>Loading plan...</span>
        </div>
      </div>
    );
  }

  // No plan exists
  if (!plan) {
    return (
      <div className="planning-sidebar planning-sidebar--empty">
        <div className="planning-sidebar__empty-content">
          <div className="planning-sidebar__empty-icon">
            <Icon name="map" size={32} />
          </div>
          <h3 className="planning-sidebar__empty-title">No Story Plan</h3>
          <p className="planning-sidebar__empty-desc">
            Create a plan to see scene context, beats, and character goals while you write.
          </p>
          <ActionButton
            variant="primary"
            size="small"
            icon="plus"
            onClick={onCreatePlan}
          >
            Create Plan
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="planning-sidebar">
      {/* Header */}
      <header className="planning-sidebar__header">
        <div className="planning-sidebar__header-info">
          <h2 className="planning-sidebar__title">
            <Icon name="map" size={18} />
            <span>Story Plan</span>
          </h2>
          <span className="planning-sidebar__framework">
            {frameworkInfo?.name || 'Custom'}
          </span>
        </div>
        <button
          className="planning-sidebar__open-btn"
          onClick={onOpenPlanner}
          title="Open full planner"
        >
          <Icon name="maximize-2" size={16} />
        </button>
      </header>

      {/* Content */}
      <div className="planning-sidebar__content">
        {/* Current Beat Section */}
        <motion.section
          className={`planning-sidebar__section ${expandedSection === 'beat' ? 'planning-sidebar__section--expanded' : ''}`}
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          <button
            className="planning-sidebar__section-header"
            onClick={() => toggleSection('beat')}
          >
            <div className="planning-sidebar__section-title">
              <Icon name="target" size={14} />
              <span>Current Beat</span>
            </div>
            <Icon
              name={expandedSection === 'beat' ? 'chevron-up' : 'chevron-down'}
              size={14}
            />
          </button>

          <AnimatePresence>
            {expandedSection === 'beat' && currentBeat && (
              <motion.div
                className="planning-sidebar__section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="planning-sidebar__beat-card">
                  <div className="planning-sidebar__beat-name">
                    {currentBeat.name}
                  </div>
                  <div className="planning-sidebar__beat-meta">
                    <span className="planning-sidebar__beat-percent">
                      {currentBeat.targetPercentage}% mark
                    </span>
                    <span className={`planning-sidebar__beat-status planning-sidebar__beat-status--${currentBeat.status}`}>
                      {currentBeat.status}
                    </span>
                  </div>
                  {currentBeat.description && (
                    <p className="planning-sidebar__beat-desc">
                      {currentBeat.description}
                    </p>
                  )}
                </div>

                {/* Nearby beats */}
                <div className="planning-sidebar__beat-progress">
                  {beats.slice(0, 5).map((beat, idx) => (
                    <div
                      key={beat.id}
                      className={`planning-sidebar__beat-dot ${beat.id === currentBeat.id ? 'planning-sidebar__beat-dot--current' : ''} ${beat.status === 'complete' ? 'planning-sidebar__beat-dot--complete' : ''}`}
                      title={beat.name}
                    />
                  ))}
                  {beats.length > 5 && (
                    <span className="planning-sidebar__beat-more">+{beats.length - 5}</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* Scene Goals Section */}
        {sceneForChapter && (
          <motion.section
            className={`planning-sidebar__section ${expandedSection === 'scene' ? 'planning-sidebar__section--expanded' : ''}`}
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.1 }}
          >
            <button
              className="planning-sidebar__section-header"
              onClick={() => toggleSection('scene')}
            >
              <div className="planning-sidebar__section-title">
                <Icon name="film" size={14} />
                <span>Scene Goals</span>
              </div>
              <Icon
                name={expandedSection === 'scene' ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </button>

            <AnimatePresence>
              {expandedSection === 'scene' && (
                <motion.div
                  className="planning-sidebar__section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="planning-sidebar__scene-card">
                    <h4 className="planning-sidebar__scene-title">
                      {sceneForChapter.title}
                    </h4>

                    {sceneForChapter.goal && (
                      <div className="planning-sidebar__scene-item">
                        <span className="planning-sidebar__scene-label">Goal</span>
                        <span className="planning-sidebar__scene-value">{sceneForChapter.goal}</span>
                      </div>
                    )}

                    {sceneForChapter.conflict && (
                      <div className="planning-sidebar__scene-item">
                        <span className="planning-sidebar__scene-label">Conflict</span>
                        <span className="planning-sidebar__scene-value">{sceneForChapter.conflict}</span>
                      </div>
                    )}

                    {sceneForChapter.disaster && (
                      <div className="planning-sidebar__scene-item">
                        <span className="planning-sidebar__scene-label">Disaster</span>
                        <span className="planning-sidebar__scene-value">{sceneForChapter.disaster}</span>
                      </div>
                    )}

                    <div className="planning-sidebar__scene-dynamics">
                      <div className="planning-sidebar__tension">
                        <span>Tension: {sceneForChapter.tensionLevel || 5}/10</span>
                        <div className="planning-sidebar__tension-bar">
                          <div
                            className="planning-sidebar__tension-fill"
                            style={{ width: `${(sceneForChapter.tensionLevel || 5) * 10}%` }}
                          />
                        </div>
                      </div>
                      {sceneForChapter.pacingType && (
                        <span className={`planning-sidebar__pacing planning-sidebar__pacing--${sceneForChapter.pacingType}`}>
                          {PACING_TYPES[sceneForChapter.pacingType]?.name || sceneForChapter.pacingType}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* Active Threads Section */}
        {threads.length > 0 && (
          <motion.section
            className={`planning-sidebar__section ${expandedSection === 'threads' ? 'planning-sidebar__section--expanded' : ''}`}
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.2 }}
          >
            <button
              className="planning-sidebar__section-header"
              onClick={() => toggleSection('threads')}
            >
              <div className="planning-sidebar__section-title">
                <Icon name="layers" size={14} />
                <span>Active Threads</span>
                <span className="planning-sidebar__section-count">{threads.length}</span>
              </div>
              <Icon
                name={expandedSection === 'threads' ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </button>

            <AnimatePresence>
              {expandedSection === 'threads' && (
                <motion.div
                  className="planning-sidebar__section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="planning-sidebar__threads-list">
                    {threads.slice(0, 5).map(thread => (
                      <div key={thread.id} className="planning-sidebar__thread-item">
                        <Icon name="layers" size={12} />
                        <span className="planning-sidebar__thread-name">{thread.name}</span>
                        <span className={`planning-sidebar__thread-status planning-sidebar__thread-status--${thread.status}`}>
                          {thread.status}
                        </span>
                      </div>
                    ))}
                    {threads.length > 5 && (
                      <button
                        className="planning-sidebar__threads-more"
                        onClick={onOpenPlanner}
                      >
                        +{threads.length - 5} more threads
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* Premise Reminder */}
        {plan.premise && (
          <motion.section
            className={`planning-sidebar__section ${expandedSection === 'premise' ? 'planning-sidebar__section--expanded' : ''}`}
            variants={SECTION_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <button
              className="planning-sidebar__section-header"
              onClick={() => toggleSection('premise')}
            >
              <div className="planning-sidebar__section-title">
                <Icon name="quote" size={14} />
                <span>Premise</span>
              </div>
              <Icon
                name={expandedSection === 'premise' ? 'chevron-up' : 'chevron-down'}
                size={14}
              />
            </button>

            <AnimatePresence>
              {expandedSection === 'premise' && (
                <motion.div
                  className="planning-sidebar__section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <p className="planning-sidebar__premise">
                    "{plan.premise}"
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* AI Quick Suggestions */}
        <motion.section
          className={`planning-sidebar__section planning-sidebar__section--ai ${expandedSection === 'ai' ? 'planning-sidebar__section--expanded' : ''}`}
          variants={SECTION_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.4 }}
        >
          <button
            className="planning-sidebar__section-header"
            onClick={() => toggleSection('ai')}
          >
            <div className="planning-sidebar__section-title">
              <Icon name="sparkles" size={14} />
              <span>AI Assist</span>
            </div>
            <Icon
              name={expandedSection === 'ai' ? 'chevron-up' : 'chevron-down'}
              size={14}
            />
          </button>

          <AnimatePresence>
            {expandedSection === 'ai' && (
              <motion.div
                className="planning-sidebar__section-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <div className="planning-sidebar__ai-buttons">
                  <button
                    className="planning-sidebar__ai-btn"
                    onClick={() => handleGetSuggestion('conflict')}
                    disabled={aiLoading}
                  >
                    <Icon name="zap" size={12} />
                    <span>Suggest Conflict</span>
                  </button>
                  <button
                    className="planning-sidebar__ai-btn"
                    onClick={() => handleGetSuggestion('tension')}
                    disabled={aiLoading}
                  >
                    <Icon name="trending-up" size={12} />
                    <span>Raise Tension</span>
                  </button>
                  <button
                    className="planning-sidebar__ai-btn"
                    onClick={() => handleGetSuggestion('twist')}
                    disabled={aiLoading}
                  >
                    <Icon name="rotate-cw" size={12} />
                    <span>Add Twist</span>
                  </button>
                </div>

                {aiLoading && (
                  <div className="planning-sidebar__ai-loading">
                    <Icon name="loader" size={14} className="spinning" />
                    <span>Thinking...</span>
                  </div>
                )}

                {aiSuggestion && !aiLoading && (
                  <div className="planning-sidebar__ai-result">
                    <p>{aiSuggestion.text}</p>
                    <button
                      className="planning-sidebar__ai-dismiss"
                      onClick={() => setAiSuggestion(null)}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>

      {/* Footer */}
      <footer className="planning-sidebar__footer">
        <ActionButton
          variant="ghost"
          size="small"
          icon="external-link"
          onClick={onOpenPlanner}
        >
          Open Planner
        </ActionButton>
      </footer>
    </div>
  );
}

export default PlanningSidebar;
