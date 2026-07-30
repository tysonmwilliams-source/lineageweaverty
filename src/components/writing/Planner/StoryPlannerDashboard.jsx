/**
 * StoryPlannerDashboard.jsx
 *
 * The main dashboard for the Intelligent Writing Planner.
 * Provides overview of story plan, progress, and quick access to planning tools.
 *
 * Features:
 * - Plan overview with premise and theme
 * - Progress indicators for beats, scenes, arcs
 * - Framework selection and management
 * - Quick navigation to different planning views
 * - AI suggestions panel
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import EmptyState from '../../shared/EmptyState';
import {
  PLANNING_FRAMEWORKS,
  ARC_TYPES,
  getStoryPlanByWriting,
  createStoryPlan,
  updateStoryPlan,
  deleteStoryPlan,
  getPlanProgress,
  getStoryBeats,
  getStoryArcs,
  getScenePlans,
  getUnresolvedThreads
} from '../../../services/planningService';
import {
  analyzePacing,
  detectPlotHoles,
  getWhatNextSuggestions,
  generateSynopsis
} from '../../../services/planningAIService';
import { useDataset } from '../../../contexts/DatasetContext';
import { useAuth } from '../../../contexts/AuthContext';
import './StoryPlannerDashboard.css';
import { logger } from '../../../utils/logger';

// Animation variants
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 }
  }
};

const STAGGER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

function StoryPlannerDashboard({
  writingId,
  writingTitle,
  onNavigateToView,
  onClose
}) {
  const { activeDataset } = useDataset();
  const { user } = useAuth();
  const userId = user?.uid || null;

  // State
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState(null);
  const [beats, setBeats] = useState([]);
  const [arcs, setArcs] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [unresolvedThreads, setUnresolvedThreads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showFrameworkPicker, setShowFrameworkPicker] = useState(false);
  const [editingPremise, setEditingPremise] = useState(false);
  const [premiseText, setPremiseText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // AI features state
  const [aiMode, setAiMode] = useState(null); // 'pacing' | 'plotHoles' | 'whatNext' | 'synopsis'
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiError, setAiError] = useState(null);

  // Load plan data
  useEffect(() => {
    loadPlanData();
  }, [writingId, activeDataset]);

  const loadPlanData = async () => {
    setIsLoading(true);
    try {
      const existingPlan = await getStoryPlanByWriting(writingId, activeDataset?.id);

      if (existingPlan) {
        setPlan(existingPlan);
        setPremiseText(existingPlan.premise || '');

        // Load associated data
        const [progressData, beatsData, arcsData, scenesData, threadsData] = await Promise.all([
          getPlanProgress(existingPlan.id, activeDataset?.id),
          getStoryBeats(existingPlan.id, activeDataset?.id),
          getStoryArcs(existingPlan.id, activeDataset?.id),
          getScenePlans(existingPlan.id, activeDataset?.id),
          getUnresolvedThreads(existingPlan.id, activeDataset?.id)
        ]);

        setProgress(progressData);
        setBeats(beatsData);
        setArcs(arcsData);
        setScenes(scenesData);
        setUnresolvedThreads(threadsData);
      }
    } catch (error) {
      logger.error('Error loading plan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create new plan
  const handleCreatePlan = async (framework) => {
    setIsCreating(true);
    try {
      const planId = await createStoryPlan({
        writingId,
        title: writingTitle || 'Story Plan',
        framework
      }, activeDataset?.id, userId);

      await loadPlanData();
      setShowFrameworkPicker(false);
    } catch (error) {
      logger.error('Error creating plan:', error);
    } finally {
      setIsCreating(false);
    }
  };

  // Update premise
  const handleSavePremise = async () => {
    if (!plan) return;
    try {
      await updateStoryPlan(plan.id, { premise: premiseText }, activeDataset?.id, userId);
      setPlan(prev => ({ ...prev, premise: premiseText }));
      setEditingPremise(false);
    } catch (error) {
      logger.error('Error saving premise:', error);
    }
  };

  // Delete plan
  const handleDeletePlan = async () => {
    if (!plan) return;
    setIsDeleting(true);
    try {
      await deleteStoryPlan(plan.id, activeDataset?.id, userId);
      setPlan(null);
      setProgress(null);
      setBeats([]);
      setArcs([]);
      setScenes([]);
      setUnresolvedThreads([]);
      setShowDeleteConfirm(false);
    } catch (error) {
      logger.error('Error deleting plan:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // AI Analysis functions
  const runAIAnalysis = async (mode) => {
    if (!plan) return;
    setAiMode(mode);
    setAiLoading(true);
    setAiResult(null);
    setAiError(null);

    try {
      let result;
      switch (mode) {
        case 'pacing':
          result = await analyzePacing(plan.id, activeDataset?.id);
          break;
        case 'plotHoles':
          result = await detectPlotHoles(plan.id, activeDataset?.id);
          break;
        case 'whatNext':
          const lastScene = scenes[scenes.length - 1];
          const upcomingBeats = beats.filter(b => b.status !== 'complete');
          result = await getWhatNextSuggestions({
            currentScene: lastScene,
            upcomingBeats,
            unresolvedThreads
          });
          break;
        case 'synopsis':
          result = await generateSynopsis(plan.id, activeDataset?.id, 'medium');
          break;
        default:
          throw new Error('Unknown AI mode');
      }
      setAiResult(result);
    } catch (error) {
      logger.error('AI analysis error:', error);
      setAiError(error.message || 'AI analysis failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const clearAIResult = () => {
    setAiMode(null);
    setAiResult(null);
    setAiError(null);
  };

  // Get framework info
  const frameworkInfo = useMemo(() => {
    if (!plan?.framework) return null;
    return PLANNING_FRAMEWORKS[plan.framework];
  }, [plan?.framework]);

  // Calculate overall progress percentage
  const overallProgress = useMemo(() => {
    if (!progress) return 0;
    const total = progress.overall.totalItems;
    const completed = progress.overall.completedItems;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }, [progress]);

  // Loading state
  if (isLoading) {
    return (
      <div className="planner-dashboard planner-dashboard--loading">
        <div className="planner-dashboard__loader">
          <Icon name="loader" size={32} className="spinning" />
          <span>Loading plan...</span>
        </div>
      </div>
    );
  }

  // No plan exists - show creation UI
  if (!plan) {
    return (
      <div className="planner-dashboard planner-dashboard--empty">
        <AnimatePresence mode="wait">
          {!showFrameworkPicker ? (
            <motion.div
              key="intro"
              className="planner-dashboard__intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="planner-dashboard__intro-icon">
                <Icon name="map" size={48} />
              </div>
              <h2 className="planner-dashboard__intro-title">
                Start Planning Your Story
              </h2>
              <p className="planner-dashboard__intro-desc">
                Create a structured plan for "{writingTitle}" using proven storytelling frameworks.
                Map out your beats, track character arcs, and never lose sight of your narrative threads.
              </p>
              <ActionButton
                variant="primary"
                icon="plus"
                onClick={() => setShowFrameworkPicker(true)}
              >
                Create Story Plan
              </ActionButton>
            </motion.div>
          ) : (
            <motion.div
              key="picker"
              className="planner-dashboard__framework-picker"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h2 className="planner-dashboard__picker-title">
                Choose Your Framework
              </h2>
              <p className="planner-dashboard__picker-desc">
                Select a storytelling structure to guide your planning. You can always customize it later.
              </p>

              <motion.div
                className="planner-dashboard__framework-grid"
                variants={STAGGER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                {Object.entries(PLANNING_FRAMEWORKS).map(([key, framework]) => (
                  <motion.button
                    key={key}
                    className="planner-dashboard__framework-card"
                    onClick={() => handleCreatePlan(key)}
                    disabled={isCreating}
                    variants={CARD_VARIANTS}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="planner-dashboard__framework-icon">
                      <Icon name={key === 'custom' ? 'edit-3' : 'git-branch'} size={24} />
                    </div>
                    <h3 className="planner-dashboard__framework-name">
                      {framework.name}
                    </h3>
                    <p className="planner-dashboard__framework-desc">
                      {framework.description}
                    </p>
                    {framework.beats.length > 0 && (
                      <span className="planner-dashboard__framework-beats">
                        {framework.beats.length} beats
                      </span>
                    )}
                  </motion.button>
                ))}
              </motion.div>

              <ActionButton
                variant="ghost"
                onClick={() => setShowFrameworkPicker(false)}
              >
                Cancel
              </ActionButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Plan exists - show dashboard
  return (
    <div className="planner-dashboard">
      {/* Header */}
      <header className="planner-dashboard__header">
        <div className="planner-dashboard__header-info">
          <h1 className="planner-dashboard__title">
            <Icon name="map" size={24} />
            <span>Story Planner</span>
          </h1>
          <p className="planner-dashboard__subtitle">
            {writingTitle}
          </p>
        </div>

        <div className="planner-dashboard__header-actions">
          <div className="planner-dashboard__framework-badge">
            <Icon name="git-branch" size={14} />
            <span>{frameworkInfo?.name || 'Custom'}</span>
          </div>
          <button
            className="planner-dashboard__delete-btn"
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete plan"
          >
            <Icon name="trash-2" size={18} />
          </button>
          {onClose && (
            <button
              className="planner-dashboard__close-btn"
              onClick={onClose}
              title="Close planner"
            >
              <Icon name="x" size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="planner-dashboard__content">
        {/* Progress Overview */}
        <motion.section
          className="planner-dashboard__section planner-dashboard__section--progress"
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          <h2 className="planner-dashboard__section-title">
            <Icon name="bar-chart-2" size={18} />
            <span>Progress Overview</span>
          </h2>

          <div className="planner-dashboard__progress-ring">
            <svg viewBox="0 0 100 100" className="planner-dashboard__ring-svg">
              <circle
                className="planner-dashboard__ring-bg"
                cx="50"
                cy="50"
                r="40"
                strokeWidth="8"
                fill="none"
              />
              <circle
                className="planner-dashboard__ring-fill"
                cx="50"
                cy="50"
                r="40"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${overallProgress * 2.51} 251`}
                strokeLinecap="round"
              />
            </svg>
            <div className="planner-dashboard__ring-text">
              <span className="planner-dashboard__ring-percent">{overallProgress}%</span>
              <span className="planner-dashboard__ring-label">Complete</span>
            </div>
          </div>

          <div className="planner-dashboard__progress-stats">
            <div className="planner-dashboard__stat">
              <span className="planner-dashboard__stat-value">{progress?.beats?.complete || 0}</span>
              <span className="planner-dashboard__stat-label">/ {progress?.beats?.total || 0} Beats</span>
            </div>
            <div className="planner-dashboard__stat">
              <span className="planner-dashboard__stat-value">{progress?.scenes?.complete || 0}</span>
              <span className="planner-dashboard__stat-label">/ {progress?.scenes?.total || 0} Scenes</span>
            </div>
            <div className="planner-dashboard__stat">
              <span className="planner-dashboard__stat-value">{progress?.arcs?.complete || 0}</span>
              <span className="planner-dashboard__stat-label">/ {progress?.arcs?.total || 0} Arcs</span>
            </div>
          </div>
        </motion.section>

        {/* Premise & Theme */}
        <motion.section
          className="planner-dashboard__section planner-dashboard__section--premise"
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.1 }}
        >
          <div className="planner-dashboard__section-header">
            <h2 className="planner-dashboard__section-title">
              <Icon name="quote" size={18} />
              <span>Premise</span>
            </h2>
            {!editingPremise && (
              <button
                className="planner-dashboard__edit-btn"
                onClick={() => setEditingPremise(true)}
              >
                <Icon name="edit-2" size={14} />
              </button>
            )}
          </div>

          {editingPremise ? (
            <div className="planner-dashboard__premise-edit">
              <textarea
                className="planner-dashboard__premise-input"
                value={premiseText}
                onChange={(e) => setPremiseText(e.target.value)}
                placeholder="Write your one-sentence premise..."
                rows={3}
              />
              <div className="planner-dashboard__premise-actions">
                <ActionButton
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    setPremiseText(plan.premise || '');
                    setEditingPremise(false);
                  }}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="primary"
                  size="small"
                  onClick={handleSavePremise}
                >
                  Save
                </ActionButton>
              </div>
            </div>
          ) : (
            <p className={`planner-dashboard__premise-text ${!plan.premise ? 'planner-dashboard__premise-text--empty' : ''}`}>
              {plan.premise || 'Click to add your story premise...'}
            </p>
          )}
        </motion.section>

        {/* Quick Navigation */}
        <motion.section
          className="planner-dashboard__section planner-dashboard__section--nav"
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.2 }}
        >
          <h2 className="planner-dashboard__section-title">
            <Icon name="compass" size={18} />
            <span>Planning Tools</span>
          </h2>

          <div className="planner-dashboard__nav-grid">
            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('beats', plan?.id)}
            >
              <Icon name="list" size={24} />
              <span>Beat Sheet</span>
              <small>{beats.length} beats</small>
            </button>

            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('outline', plan?.id)}
            >
              <Icon name="file-text" size={24} />
              <span>Outline</span>
              <small>{scenes.length} scenes</small>
            </button>

            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('timeline', plan?.id)}
            >
              <Icon name="git-commit" size={24} />
              <span>Timeline</span>
              <small>Visual view</small>
            </button>

            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('characters', plan?.id)}
            >
              <Icon name="users" size={24} />
              <span>Characters</span>
              <small>{progress?.characterArcs?.total || 0} arcs</small>
            </button>

            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('threads', plan?.id)}
            >
              <Icon name="layers" size={24} />
              <span>Plot Threads</span>
              <small>{progress?.threads?.total || 0} threads</small>
            </button>

            <button
              className="planner-dashboard__nav-card"
              onClick={() => onNavigateToView?.('arcs', plan?.id)}
            >
              <Icon name="trending-up" size={24} />
              <span>Story Arcs</span>
              <small>{arcs.length} arcs</small>
            </button>
          </div>
        </motion.section>

        {/* Alerts & Warnings */}
        {unresolvedThreads.length > 0 && (
          <motion.section
            className="planner-dashboard__section planner-dashboard__section--alerts"
            variants={CARD_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.3 }}
          >
            <h2 className="planner-dashboard__section-title">
              <Icon name="alert-triangle" size={18} />
              <span>Attention Needed</span>
            </h2>

            <div className="planner-dashboard__alerts">
              {unresolvedThreads.map(thread => (
                <div key={thread.id} className="planner-dashboard__alert">
                  <Icon name="layers" size={14} />
                  <span>
                    Thread "{thread.name}" is unresolved
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Story Arcs Preview */}
        {arcs.length > 0 && (
          <motion.section
            className="planner-dashboard__section planner-dashboard__section--arcs"
            variants={CARD_VARIANTS}
            initial="hidden"
            animate="visible"
            transition={{ delay: 0.4 }}
          >
            <div className="planner-dashboard__section-header">
              <h2 className="planner-dashboard__section-title">
                <Icon name="trending-up" size={18} />
                <span>Story Arcs</span>
              </h2>
              <ActionButton
                variant="ghost"
                size="small"
                onClick={() => onNavigateToView?.('arcs', plan?.id)}
              >
                View All
              </ActionButton>
            </div>

            <div className="planner-dashboard__arcs-list">
              {arcs.slice(0, 4).map(arc => (
                <div
                  key={arc.id}
                  className="planner-dashboard__arc-item"
                  style={{ '--arc-color': arc.color }}
                >
                  <div className="planner-dashboard__arc-indicator" />
                  <div className="planner-dashboard__arc-info">
                    <span className="planner-dashboard__arc-name">{arc.name}</span>
                    <span className="planner-dashboard__arc-type">
                      {ARC_TYPES[arc.type]?.name || arc.type}
                    </span>
                  </div>
                  <span className={`planner-dashboard__arc-status planner-dashboard__arc-status--${arc.status}`}>
                    {arc.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* AI Intelligence Panel */}
        <motion.section
          className="planner-dashboard__section planner-dashboard__section--ai"
          variants={CARD_VARIANTS}
          initial="hidden"
          animate="visible"
          transition={{ delay: 0.5 }}
        >
          <h2 className="planner-dashboard__section-title">
            <Icon name="sparkles" size={18} />
            <span>AI Intelligence</span>
          </h2>

          {!aiMode && !aiResult && (
            <div className="planner-dashboard__ai-tools">
              <button
                className="planner-dashboard__ai-tool"
                onClick={() => runAIAnalysis('pacing')}
                disabled={aiLoading || scenes.length < 3}
              >
                <Icon name="activity" size={20} />
                <span>Analyze Pacing</span>
                <small>Check tension curve & rhythm</small>
              </button>

              <button
                className="planner-dashboard__ai-tool"
                onClick={() => runAIAnalysis('plotHoles')}
                disabled={aiLoading || scenes.length < 2}
              >
                <Icon name="search" size={20} />
                <span>Find Plot Holes</span>
                <small>Detect inconsistencies</small>
              </button>

              <button
                className="planner-dashboard__ai-tool"
                onClick={() => runAIAnalysis('whatNext')}
                disabled={aiLoading || scenes.length < 1}
              >
                <Icon name="compass" size={20} />
                <span>What Next?</span>
                <small>Get direction suggestions</small>
              </button>

              <button
                className="planner-dashboard__ai-tool"
                onClick={() => runAIAnalysis('synopsis')}
                disabled={aiLoading || !plan?.premise}
              >
                <Icon name="file-text" size={20} />
                <span>Generate Synopsis</span>
                <small>Create story summary</small>
              </button>
            </div>
          )}

          {aiLoading && (
            <div className="planner-dashboard__ai-loading">
              <Icon name="loader" size={24} className="spinning" />
              <span>
                {aiMode === 'pacing' && 'Analyzing pacing...'}
                {aiMode === 'plotHoles' && 'Detecting plot holes...'}
                {aiMode === 'whatNext' && 'Generating suggestions...'}
                {aiMode === 'synopsis' && 'Writing synopsis...'}
              </span>
            </div>
          )}

          {aiError && (
            <div className="planner-dashboard__ai-error">
              <Icon name="alert-circle" size={18} />
              <span>{aiError}</span>
              <button onClick={clearAIResult}>Dismiss</button>
            </div>
          )}

          {aiResult && !aiLoading && (
            <div className="planner-dashboard__ai-result">
              <div className="planner-dashboard__ai-result-header">
                <span className="planner-dashboard__ai-result-title">
                  {aiMode === 'pacing' && 'Pacing Analysis'}
                  {aiMode === 'plotHoles' && 'Plot Hole Detection'}
                  {aiMode === 'whatNext' && 'What Could Happen Next'}
                  {aiMode === 'synopsis' && 'Generated Synopsis'}
                </span>
                <button
                  className="planner-dashboard__ai-close"
                  onClick={clearAIResult}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <div className="planner-dashboard__ai-result-content">
                {/* Pacing Analysis Result */}
                {aiMode === 'pacing' && typeof aiResult === 'object' && (
                  <>
                    <div className={`planner-dashboard__ai-badge planner-dashboard__ai-badge--${aiResult.overallAssessment?.toLowerCase().replace(' ', '-')}`}>
                      {aiResult.overallAssessment}
                    </div>
                    {aiResult.tensionAnalysis && (
                      <p><strong>Tension:</strong> {aiResult.tensionAnalysis.curve}</p>
                    )}
                    {aiResult.issues?.length > 0 && (
                      <div className="planner-dashboard__ai-issues">
                        <strong>Issues Found:</strong>
                        {aiResult.issues.map((issue, i) => (
                          <div key={i} className={`planner-dashboard__ai-issue planner-dashboard__ai-issue--${issue.severity}`}>
                            <span>{issue.location}: {issue.description}</span>
                            <small>{issue.suggestion}</small>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiResult.priorityFix && (
                      <p className="planner-dashboard__ai-priority"><strong>Priority:</strong> {aiResult.priorityFix}</p>
                    )}
                  </>
                )}

                {/* Plot Holes Result */}
                {aiMode === 'plotHoles' && typeof aiResult === 'object' && (
                  <>
                    <div className={`planner-dashboard__ai-badge planner-dashboard__ai-badge--${aiResult.overallHealth?.toLowerCase().replace(' ', '-')}`}>
                      {aiResult.overallHealth}
                    </div>
                    {aiResult.plotHoles?.length > 0 ? (
                      <div className="planner-dashboard__ai-issues">
                        {aiResult.plotHoles.map((hole, i) => (
                          <div key={i} className={`planner-dashboard__ai-issue planner-dashboard__ai-issue--${hole.severity}`}>
                            <span>{hole.location}: {hole.description}</span>
                            <small>{hole.suggestion}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No significant plot holes detected!</p>
                    )}
                    {aiResult.strengths?.length > 0 && (
                      <p className="planner-dashboard__ai-strengths"><strong>Strengths:</strong> {aiResult.strengths.join(', ')}</p>
                    )}
                  </>
                )}

                {/* What Next Result */}
                {aiMode === 'whatNext' && Array.isArray(aiResult) && (
                  <div className="planner-dashboard__ai-suggestions">
                    {aiResult.map((suggestion, i) => (
                      <div key={i} className="planner-dashboard__ai-suggestion">
                        <div className="planner-dashboard__ai-suggestion-header">
                          <strong>{suggestion.title}</strong>
                          <span className={`planner-dashboard__ai-risk planner-dashboard__ai-risk--${suggestion.riskLevel}`}>
                            {suggestion.riskLevel}
                          </span>
                        </div>
                        <p>{suggestion.description}</p>
                        {suggestion.advancesBeat && (
                          <small>Advances: {suggestion.advancesBeat}</small>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Synopsis Result */}
                {aiMode === 'synopsis' && typeof aiResult === 'string' && (
                  <div className="planner-dashboard__ai-synopsis">
                    <p>{aiResult}</p>
                    <button
                      className="planner-dashboard__ai-copy"
                      onClick={() => navigator.clipboard.writeText(aiResult)}
                    >
                      <Icon name="copy" size={14} />
                      Copy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.section>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="planner-dashboard__delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          >
            <motion.div
              className="planner-dashboard__delete-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="planner-dashboard__delete-icon">
                <Icon name="alert-triangle" size={32} />
              </div>
              <h3 className="planner-dashboard__delete-title">Delete Story Plan?</h3>
              <p className="planner-dashboard__delete-desc">
                This will permanently delete your story plan including all beats, scenes,
                character arcs, and plot threads. This action cannot be undone.
              </p>
              <div className="planner-dashboard__delete-stats">
                <span>{beats.length} beats</span>
                <span>{scenes.length} scenes</span>
                <span>{arcs.length} arcs</span>
                <span>{progress?.threads?.total || 0} threads</span>
              </div>
              <div className="planner-dashboard__delete-actions">
                <ActionButton
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="danger"
                  icon={isDeleting ? 'loader' : 'trash-2'}
                  onClick={handleDeletePlan}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Plan'}
                </ActionButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default StoryPlannerDashboard;
