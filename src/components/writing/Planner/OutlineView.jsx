/**
 * OutlineView.jsx
 *
 * A hierarchical tree view for story planning.
 * Shows Acts > Chapters > Scenes in an expandable outline format.
 *
 * Features:
 * - Collapsible act/chapter sections
 * - Scene status indicators
 * - POV character display
 * - Word count tracking
 * - Add/edit scene functionality
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import ActionButton from '../../shared/ActionButton';
import {
  getStoryPlan,
  getStoryBeats,
  getScenePlans,
  createScenePlan,
  updateScenePlan,
  deleteScenePlan,
  PLAN_STATUS
} from '../../../services/planningService';
import { getChaptersByWriting } from '../../../services/chapterService';
import { getPerson } from '../../../services/database';
import { useDataset } from '../../../contexts/DatasetContext';
import { useAuth } from '../../../contexts/AuthContext';
import './OutlineView.css';

// Animation variants
const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 }
};

function OutlineView({
  storyPlanId,
  writingId,
  onSceneSelect,
  onSceneEdit,
  onClose
}) {
  const { activeDataset } = useDataset();
  const { user } = useAuth();
  const userId = user?.uid || null;

  // State
  const [plan, setPlan] = useState(null);
  const [beats, setBeats] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [povCharacters, setPovCharacters] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [expandedActs, setExpandedActs] = useState({ 1: true, 2: true, 3: true });
  const [expandedChapters, setExpandedChapters] = useState({});
  const [addingSceneTo, setAddingSceneTo] = useState(null);
  const [newSceneTitle, setNewSceneTitle] = useState('');

  // Load data
  useEffect(() => {
    if (!storyPlanId) return;
    loadData();
  }, [storyPlanId, writingId, activeDataset]);

  const loadData = async () => {
    if (!storyPlanId) return;
    setIsLoading(true);
    try {
      const [planData, beatsData, scenesData, chaptersData] = await Promise.all([
        getStoryPlan(storyPlanId, activeDataset?.id),
        getStoryBeats(storyPlanId, activeDataset?.id),
        getScenePlans(storyPlanId, activeDataset?.id),
        getChaptersByWriting(writingId, activeDataset?.id)
      ]);

      setPlan(planData);
      setBeats(beatsData);
      setScenes(scenesData);
      setChapters(chaptersData);

      // Load POV character names
      const povIds = [...new Set(scenesData.map(s => s.povCharacterId).filter(Boolean))];
      const povData = {};
      for (const id of povIds) {
        try {
          const person = await getPerson(id, activeDataset?.id);
          if (person) {
            povData[id] = `${person.firstName} ${person.lastName || ''}`.trim();
          }
        } catch (e) {
          console.error('Error loading POV character:', e);
        }
      }
      setPovCharacters(povData);

      // Auto-expand chapters with scenes
      const chaptersWithScenes = {};
      scenesData.forEach(s => {
        if (s.chapterId) {
          chaptersWithScenes[s.chapterId] = true;
        }
      });
      setExpandedChapters(chaptersWithScenes);
    } catch (error) {
      console.error('Error loading outline data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group beats by act
  const actGroups = useMemo(() => {
    const groups = {
      1: { name: 'Act I: Setup', beats: [], percentage: '25%' },
      2: { name: 'Act II: Confrontation', beats: [], percentage: '50%' },
      3: { name: 'Act III: Resolution', beats: [], percentage: '25%' }
    };

    beats.forEach(beat => {
      const actNum = beat.actNumber || 2;
      if (groups[actNum]) {
        groups[actNum].beats.push(beat);
      }
    });

    return groups;
  }, [beats]);

  // Group scenes by chapter
  const scenesByChapter = useMemo(() => {
    const grouped = {};
    scenes.forEach(scene => {
      const chapterId = scene.chapterId || 'unassigned';
      if (!grouped[chapterId]) {
        grouped[chapterId] = [];
      }
      grouped[chapterId].push(scene);
    });
    return grouped;
  }, [scenes]);

  // Get scenes for an act (scenes linked to beats in that act)
  const getScenesForAct = (actNumber) => {
    const actBeats = actGroups[actNumber]?.beats || [];
    const beatIds = actBeats.map(b => b.id);
    return scenes.filter(s =>
      s.linkedBeats?.some(lb => beatIds.includes(lb)) ||
      (actNumber === 2 && !s.linkedBeats?.length) // Default unlinked to Act 2
    );
  };

  // Toggle act expansion
  const toggleAct = (actNum) => {
    setExpandedActs(prev => ({ ...prev, [actNum]: !prev[actNum] }));
  };

  // Toggle chapter expansion
  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  // Add new scene
  const handleAddScene = async (chapterId) => {
    if (!newSceneTitle.trim()) return;

    try {
      await createScenePlan({
        storyPlanId,
        chapterId: chapterId === 'unassigned' ? null : chapterId,
        title: newSceneTitle.trim(),
        status: 'idea'
      }, activeDataset?.id, userId);

      setNewSceneTitle('');
      setAddingSceneTo(null);
      await loadData();
    } catch (error) {
      console.error('Error creating scene:', error);
    }
  };

  // Delete scene
  const handleDeleteScene = async (sceneId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this scene?')) return;

    try {
      await deleteScenePlan(sceneId, activeDataset?.id, userId);
      await loadData();
    } catch (error) {
      console.error('Error deleting scene:', error);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'complete': return '#22c55e';
      case 'revised': return '#f59e0b';
      case 'drafted': return '#3b82f6';
      case 'planned': return '#8b5cf6';
      default: return 'var(--text-tertiary)';
    }
  };

  // Calculate word counts
  const totalPlannedWords = scenes.reduce((sum, s) => sum + (s.estimatedWordCount || 0), 0);
  const completedScenes = scenes.filter(s => s.status === 'complete').length;

  if (isLoading) {
    return (
      <div className="outline-view outline-view--loading">
        <Icon name="loader" size={24} className="spinning" />
        <span>Loading outline...</span>
      </div>
    );
  }

  return (
    <div className="outline-view">
      {/* Header */}
      <header className="outline-view__header">
        <div className="outline-view__header-info">
          <h2 className="outline-view__title">
            <Icon name="list" size={20} />
            <span>Story Outline</span>
          </h2>
          <div className="outline-view__stats">
            <span>{scenes.length} scenes</span>
            <span className="outline-view__stats-divider">•</span>
            <span>{completedScenes} complete</span>
            {totalPlannedWords > 0 && (
              <>
                <span className="outline-view__stats-divider">•</span>
                <span>~{totalPlannedWords.toLocaleString()} words planned</span>
              </>
            )}
          </div>
        </div>
        {onClose && (
          <button className="outline-view__close-btn" onClick={onClose}>
            <Icon name="x" size={20} />
          </button>
        )}
      </header>

      {/* Outline Tree */}
      <div className="outline-view__content">
        {/* Acts */}
        {[1, 2, 3].map(actNum => (
          <div key={actNum} className="outline-view__act">
            <button
              className={`outline-view__act-header ${expandedActs[actNum] ? 'outline-view__act-header--expanded' : ''}`}
              onClick={() => toggleAct(actNum)}
            >
              <Icon
                name={expandedActs[actNum] ? 'chevron-down' : 'chevron-right'}
                size={16}
              />
              <span className="outline-view__act-name">
                {actGroups[actNum].name}
              </span>
              <span className="outline-view__act-percent">
                {actGroups[actNum].percentage}
              </span>
            </button>

            <AnimatePresence>
              {expandedActs[actNum] && (
                <motion.div
                  className="outline-view__act-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Chapters in this act */}
                  {chapters.map(chapter => {
                    const chapterScenes = scenesByChapter[chapter.id] || [];
                    // Simple heuristic: chapter order / total chapters determines act
                    const chapterAct = Math.ceil((chapter.order / Math.max(chapters.length, 1)) * 3);
                    if (chapterAct !== actNum) return null;

                    return (
                      <div key={chapter.id} className="outline-view__chapter">
                        <button
                          className={`outline-view__chapter-header ${expandedChapters[chapter.id] ? 'outline-view__chapter-header--expanded' : ''}`}
                          onClick={() => toggleChapter(chapter.id)}
                        >
                          <Icon
                            name={expandedChapters[chapter.id] ? 'chevron-down' : 'chevron-right'}
                            size={14}
                          />
                          <span className="outline-view__chapter-title">
                            {chapter.title || `Chapter ${chapter.order}`}
                          </span>
                          <span className="outline-view__chapter-count">
                            {chapterScenes.length} scene{chapterScenes.length !== 1 ? 's' : ''}
                          </span>
                          {chapter.wordCount > 0 && (
                            <span className="outline-view__chapter-words">
                              {chapter.wordCount.toLocaleString()} words
                            </span>
                          )}
                        </button>

                        <AnimatePresence>
                          {expandedChapters[chapter.id] && (
                            <motion.div
                              className="outline-view__chapter-content"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {/* Scenes */}
                              {chapterScenes.map((scene, idx) => (
                                <motion.div
                                  key={scene.id}
                                  className="outline-view__scene"
                                  variants={ITEM_VARIANTS}
                                  initial="hidden"
                                  animate="visible"
                                  transition={{ delay: idx * 0.05 }}
                                  onClick={() => onSceneSelect?.(scene)}
                                >
                                  <div
                                    className="outline-view__scene-status"
                                    style={{ backgroundColor: getStatusColor(scene.status) }}
                                    title={PLAN_STATUS[scene.status] || scene.status}
                                  />
                                  <div className="outline-view__scene-info">
                                    <span className="outline-view__scene-title">
                                      {scene.title || 'Untitled Scene'}
                                    </span>
                                    {scene.povCharacterId && povCharacters[scene.povCharacterId] && (
                                      <span className="outline-view__scene-pov">
                                        <Icon name="user" size={10} />
                                        {povCharacters[scene.povCharacterId]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="outline-view__scene-actions">
                                    <button
                                      className="outline-view__scene-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSceneEdit?.(scene);
                                      }}
                                      title="Edit scene"
                                    >
                                      <Icon name="edit-2" size={12} />
                                    </button>
                                    <button
                                      className="outline-view__scene-btn outline-view__scene-btn--delete"
                                      onClick={(e) => handleDeleteScene(scene.id, e)}
                                      title="Delete scene"
                                    >
                                      <Icon name="trash-2" size={12} />
                                    </button>
                                  </div>
                                </motion.div>
                              ))}

                              {/* Add scene form */}
                              {addingSceneTo === chapter.id ? (
                                <div className="outline-view__add-form">
                                  <input
                                    type="text"
                                    className="outline-view__add-input"
                                    placeholder="Scene title..."
                                    value={newSceneTitle}
                                    onChange={(e) => setNewSceneTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleAddScene(chapter.id);
                                      if (e.key === 'Escape') setAddingSceneTo(null);
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    className="outline-view__add-confirm"
                                    onClick={() => handleAddScene(chapter.id)}
                                  >
                                    <Icon name="check" size={14} />
                                  </button>
                                  <button
                                    className="outline-view__add-cancel"
                                    onClick={() => setAddingSceneTo(null)}
                                  >
                                    <Icon name="x" size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="outline-view__add-scene"
                                  onClick={() => setAddingSceneTo(chapter.id)}
                                >
                                  <Icon name="plus" size={12} />
                                  <span>Add Scene</span>
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {/* Beats in this act (shown if no chapters match) */}
                  {actGroups[actNum].beats.length > 0 && chapters.length === 0 && (
                    <div className="outline-view__beats-list">
                      {actGroups[actNum].beats.map(beat => (
                        <div key={beat.id} className="outline-view__beat">
                          <Icon name="target" size={12} />
                          <span>{beat.name}</span>
                          <span className="outline-view__beat-percent">
                            {beat.targetPercentage}%
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {/* Unassigned Scenes */}
        {scenesByChapter['unassigned']?.length > 0 && (
          <div className="outline-view__unassigned">
            <div className="outline-view__unassigned-header">
              <Icon name="inbox" size={16} />
              <span>Unassigned Scenes</span>
              <span className="outline-view__unassigned-count">
                {scenesByChapter['unassigned'].length}
              </span>
            </div>
            <div className="outline-view__unassigned-content">
              {scenesByChapter['unassigned'].map(scene => (
                <div
                  key={scene.id}
                  className="outline-view__scene"
                  onClick={() => onSceneSelect?.(scene)}
                >
                  <div
                    className="outline-view__scene-status"
                    style={{ backgroundColor: getStatusColor(scene.status) }}
                  />
                  <div className="outline-view__scene-info">
                    <span className="outline-view__scene-title">
                      {scene.title || 'Untitled Scene'}
                    </span>
                  </div>
                  <div className="outline-view__scene-actions">
                    <button
                      className="outline-view__scene-btn outline-view__scene-btn--delete"
                      onClick={(e) => handleDeleteScene(scene.id, e)}
                    >
                      <Icon name="trash-2" size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {scenes.length === 0 && chapters.length === 0 && (
          <div className="outline-view__empty">
            <Icon name="file-text" size={32} />
            <p>No scenes planned yet</p>
            <small>Add chapters to your writing, then create scenes here</small>
          </div>
        )}
      </div>
    </div>
  );
}

export default OutlineView;
