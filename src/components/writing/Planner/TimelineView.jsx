/**
 * TimelineView.jsx
 *
 * A horizontal timeline visualization for story planning.
 * Shows story beats, scenes, character arcs, and tension curve.
 *
 * Phase 2 Feature - Visual Planning Tools
 *
 * Features:
 * - Horizontal scrolling timeline
 * - Beat markers at target percentages
 * - Scene cards positioned on timeline
 * - Tension curve visualization
 * - Character arc tracks (parallel lanes)
 * - Drag and drop scene reordering
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import { useAuth } from '../../../contexts/AuthContext';
import {
  getStoryPlanComplete,
  getScenePlans,
  getStoryBeats,
  getStoryArcs,
  updateScenePlan,
  PLANNING_FRAMEWORKS
} from '../../../services/planningService';
import './TimelineView.css';

// Constants for timeline layout
const TIMELINE_CONFIG = {
  beatTrackHeight: 80,
  sceneTrackHeight: 160,
  arcTrackHeight: 40,
  tensionCurveHeight: 80,
  markerWidth: 4,
  sceneCardWidth: 180,
  pixelsPerPercent: 12, // Timeline is 1200px wide for 100%
};

// Tension level colors
const getTensionColor = (level) => {
  if (level <= 3) return '#22c55e'; // Low - green
  if (level <= 6) return '#f59e0b'; // Medium - amber
  return '#ef4444'; // High - red
};

// Status colors for beats
const getBeatStatusColor = (status) => {
  switch (status) {
    case 'complete': return 'var(--color-success)';
    case 'drafted': return 'var(--color-info)';
    case 'in-progress': return 'var(--color-warning)';
    default: return 'var(--text-tertiary)';
  }
};

function TimelineView({
  storyPlanId,
  writingId,
  datasetId,
  onSceneSelect,
  onBeatSelect,
  onClose
}) {
  const { user } = useAuth();
  const userId = user?.uid || null;
  const timelineRef = useRef(null);
  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedScene, setSelectedScene] = useState(null);
  const [showTensionCurve, setShowTensionCurve] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [draggedScene, setDraggedScene] = useState(null);

  // Load plan data
  useEffect(() => {
    async function loadData() {
      if (!storyPlanId) return;

      try {
        setLoading(true);
        const data = await getStoryPlanComplete(storyPlanId, datasetId);
        setPlanData(data);
      } catch (err) {
        console.error('Error loading timeline data:', err);
        setError('Failed to load timeline data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [storyPlanId, datasetId]);

  // Calculate timeline width based on zoom
  const timelineWidth = useMemo(() => {
    return TIMELINE_CONFIG.pixelsPerPercent * 100 * zoomLevel;
  }, [zoomLevel]);

  // Get framework info
  const frameworkInfo = useMemo(() => {
    if (!planData?.framework) return null;
    return PLANNING_FRAMEWORKS[planData.framework];
  }, [planData?.framework]);

  // Calculate scene positions based on their order
  const scenePositions = useMemo(() => {
    if (!planData?.scenes?.length) return [];

    const totalScenes = planData.scenes.length;
    return planData.scenes.map((scene, idx) => {
      // Position scenes evenly across timeline, or use linked beat position
      let position = ((idx + 0.5) / totalScenes) * 100;

      // If scene is linked to a beat, use beat's position
      if (scene.linkedBeats?.length && planData.beats) {
        const linkedBeat = planData.beats.find(b => scene.linkedBeats.includes(b.id));
        if (linkedBeat) {
          position = linkedBeat.targetPercentage;
        }
      }

      return {
        ...scene,
        position,
        left: (position / 100) * timelineWidth
      };
    });
  }, [planData?.scenes, planData?.beats, timelineWidth]);

  // Generate tension curve path
  const tensionCurvePath = useMemo(() => {
    if (!scenePositions.length) return '';

    const height = TIMELINE_CONFIG.tensionCurveHeight;
    const points = scenePositions.map(scene => {
      const x = scene.left + TIMELINE_CONFIG.sceneCardWidth / 2;
      const tensionLevel = scene.tensionLevel || 5;
      const y = height - (tensionLevel / 10) * (height - 10);
      return { x, y };
    });

    if (points.length < 2) return '';

    // Create smooth curve through points
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpX = (prev.x + curr.x) / 2;
      path += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    return path;
  }, [scenePositions]);

  // Handle scene click
  const handleSceneClick = (scene) => {
    setSelectedScene(scene.id === selectedScene ? null : scene.id);
    if (onSceneSelect) {
      onSceneSelect(scene);
    }
  };

  // Handle beat click
  const handleBeatClick = (beat) => {
    if (onBeatSelect) {
      onBeatSelect(beat);
    }
  };

  // Handle zoom
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 2));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  // Handle drag start
  const handleDragStart = (scene) => {
    setDraggedScene(scene);
  };

  // Handle drag end
  const handleDragEnd = async (event, info, scene) => {
    setDraggedScene(null);

    // Calculate new position based on drop location
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const newX = info.point.x - rect.left;
      const newPosition = Math.max(0, Math.min(100, (newX / timelineWidth) * 100));

      // Find the beat closest to this position
      const closestBeat = planData?.beats?.reduce((closest, beat) => {
        const distance = Math.abs(beat.targetPercentage - newPosition);
        if (!closest || distance < closest.distance) {
          return { beat, distance };
        }
        return closest;
      }, null);

      // Update scene with new linked beat if close enough
      if (closestBeat && closestBeat.distance < 10) {
        try {
          await updateScenePlan(scene.id, {
            linkedBeats: [closestBeat.beat.id]
          }, datasetId, userId);

          // Refresh data
          const data = await getStoryPlanComplete(storyPlanId, datasetId);
          setPlanData(data);
        } catch (err) {
          console.error('Error updating scene position:', err);
        }
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="timeline-view timeline-view--loading">
        <div className="timeline-view__loader">
          <Icon name="loader" size={32} className="animate-spin" />
          <span>Loading timeline...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="timeline-view timeline-view--error">
        <Icon name="alert-triangle" size={32} />
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  // Empty state
  if (!planData) {
    return (
      <div className="timeline-view timeline-view--empty">
        <Icon name="calendar" size={48} />
        <h3>No Plan Data</h3>
        <p>Create a story plan to see the timeline view.</p>
      </div>
    );
  }

  return (
    <div className="timeline-view">
      {/* Toolbar */}
      <div className="timeline-view__toolbar">
        <div className="timeline-view__toolbar-left">
          <h3 className="timeline-view__title">
            <Icon name="calendar" size={18} />
            Story Timeline
          </h3>
          {frameworkInfo && (
            <span className="timeline-view__framework-badge">
              {frameworkInfo.name}
            </span>
          )}
        </div>

        <div className="timeline-view__toolbar-right">
          {/* View toggles */}
          <div className="timeline-view__toggles">
            <button
              className={`timeline-view__toggle ${showTensionCurve ? 'active' : ''}`}
              onClick={() => setShowTensionCurve(!showTensionCurve)}
              title="Toggle tension curve"
            >
              <Icon name="trending-up" size={16} />
              Tension
            </button>
            <button
              className={`timeline-view__toggle ${showArcs ? 'active' : ''}`}
              onClick={() => setShowArcs(!showArcs)}
              title="Toggle arc tracks"
            >
              <Icon name="git-branch" size={16} />
              Arcs
            </button>
          </div>

          {/* Zoom controls */}
          <div className="timeline-view__zoom">
            <button
              className="timeline-view__zoom-btn"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              title="Zoom out"
            >
              <Icon name="minus" size={16} />
            </button>
            <span className="timeline-view__zoom-level">{Math.round(zoomLevel * 100)}%</span>
            <button
              className="timeline-view__zoom-btn"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 2}
              title="Zoom in"
            >
              <Icon name="plus" size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline container */}
      <div className="timeline-view__container" ref={timelineRef}>
        <div
          className="timeline-view__content"
          style={{ width: timelineWidth }}
        >
          {/* Percentage markers */}
          <div className="timeline-view__percentage-track">
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(pct => (
              <div
                key={pct}
                className="timeline-view__percentage-marker"
                style={{ left: `${pct}%` }}
              >
                <span>{pct}%</span>
              </div>
            ))}
          </div>

          {/* Beat track */}
          <div
            className="timeline-view__beat-track"
            style={{ height: TIMELINE_CONFIG.beatTrackHeight }}
          >
            <div className="timeline-view__track-label">Beats</div>
            <div className="timeline-view__track-line" />

            {planData.beats?.map(beat => (
              <motion.div
                key={beat.id}
                className={`timeline-view__beat-marker ${beat.status === 'complete' ? 'complete' : ''}`}
                style={{
                  left: `${beat.targetPercentage}%`,
                  borderColor: getBeatStatusColor(beat.status)
                }}
                onClick={() => handleBeatClick(beat)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                title={`${beat.name} (${beat.targetPercentage}%)`}
              >
                <div
                  className="timeline-view__beat-marker-inner"
                  style={{ backgroundColor: getBeatStatusColor(beat.status) }}
                />
                <span className="timeline-view__beat-label">
                  {beat.name}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Scene track */}
          <div
            className="timeline-view__scene-track"
            style={{ height: TIMELINE_CONFIG.sceneTrackHeight }}
          >
            <div className="timeline-view__track-label">Scenes</div>

            {scenePositions.map(scene => (
              <motion.div
                key={scene.id}
                className={`timeline-view__scene-card ${selectedScene === scene.id ? 'selected' : ''} ${draggedScene?.id === scene.id ? 'dragging' : ''}`}
                style={{
                  left: scene.left,
                  width: TIMELINE_CONFIG.sceneCardWidth
                }}
                drag="x"
                dragConstraints={timelineRef}
                dragElastic={0}
                onDragStart={() => handleDragStart(scene)}
                onDragEnd={(e, info) => handleDragEnd(e, info, scene)}
                onClick={() => handleSceneClick(scene)}
                whileHover={{ y: -4 }}
                layout
              >
                <div className="timeline-view__scene-header">
                  <Icon name="grip-vertical" size={12} className="drag-handle" />
                  <span className="timeline-view__scene-title">
                    {scene.title || 'Untitled'}
                  </span>
                </div>

                <div className="timeline-view__scene-meta">
                  {scene.povCharacterId && (
                    <span className="timeline-view__scene-pov">
                      <Icon name="user" size={10} />
                      POV
                    </span>
                  )}
                  <span className={`timeline-view__scene-status status--${scene.status}`}>
                    {scene.status}
                  </span>
                </div>

                <div className="timeline-view__scene-tension">
                  <div
                    className="timeline-view__scene-tension-bar"
                    style={{
                      width: `${(scene.tensionLevel || 5) * 10}%`,
                      backgroundColor: getTensionColor(scene.tensionLevel)
                    }}
                  />
                  <span className="timeline-view__scene-tension-value">
                    {scene.tensionLevel || 5}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tension curve overlay */}
          <AnimatePresence>
            {showTensionCurve && tensionCurvePath && (
              <motion.div
                className="timeline-view__tension-curve"
                style={{ height: TIMELINE_CONFIG.tensionCurveHeight }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="timeline-view__track-label">Tension</div>
                <svg
                  width="100%"
                  height={TIMELINE_CONFIG.tensionCurveHeight}
                  className="timeline-view__tension-svg"
                >
                  {/* Gradient fill under curve */}
                  <defs>
                    <linearGradient id="tensionGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Area under curve */}
                  <path
                    d={`${tensionCurvePath} L ${timelineWidth} ${TIMELINE_CONFIG.tensionCurveHeight} L 0 ${TIMELINE_CONFIG.tensionCurveHeight} Z`}
                    fill="url(#tensionGradient)"
                  />

                  {/* Curve line */}
                  <path
                    d={tensionCurvePath}
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="2"
                  />

                  {/* Points on curve */}
                  {scenePositions.map(scene => {
                    const x = scene.left + TIMELINE_CONFIG.sceneCardWidth / 2;
                    const y = TIMELINE_CONFIG.tensionCurveHeight - ((scene.tensionLevel || 5) / 10) * (TIMELINE_CONFIG.tensionCurveHeight - 10);
                    return (
                      <circle
                        key={scene.id}
                        cx={x}
                        cy={y}
                        r={4}
                        fill={getTensionColor(scene.tensionLevel)}
                        stroke="var(--bg-primary)"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Arc tracks */}
          <AnimatePresence>
            {showArcs && planData.arcs?.length > 0 && (
              <motion.div
                className="timeline-view__arcs-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <div className="timeline-view__arcs-header">
                  <span>Story Arcs</span>
                </div>

                {planData.arcs.map(arc => (
                  <div
                    key={arc.id}
                    className="timeline-view__arc-track"
                    style={{ height: TIMELINE_CONFIG.arcTrackHeight }}
                  >
                    <div
                      className="timeline-view__arc-label"
                      style={{ color: arc.color }}
                    >
                      <div
                        className="timeline-view__arc-dot"
                        style={{ backgroundColor: arc.color }}
                      />
                      {arc.name}
                    </div>
                    <div
                      className="timeline-view__arc-line"
                      style={{ backgroundColor: arc.color }}
                    >
                      {/* Show scenes that belong to this arc */}
                      {scenePositions
                        .filter(s => s.storyArcIds?.includes(arc.id))
                        .map(scene => (
                          <div
                            key={scene.id}
                            className="timeline-view__arc-scene-marker"
                            style={{
                              left: scene.left + TIMELINE_CONFIG.sceneCardWidth / 2,
                              backgroundColor: arc.color
                            }}
                            title={scene.title}
                          />
                        ))
                      }
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Legend */}
      <div className="timeline-view__legend">
        <div className="timeline-view__legend-item">
          <div className="timeline-view__legend-dot" style={{ backgroundColor: '#22c55e' }} />
          <span>Low Tension (1-3)</span>
        </div>
        <div className="timeline-view__legend-item">
          <div className="timeline-view__legend-dot" style={{ backgroundColor: '#f59e0b' }} />
          <span>Medium Tension (4-6)</span>
        </div>
        <div className="timeline-view__legend-item">
          <div className="timeline-view__legend-dot" style={{ backgroundColor: '#ef4444' }} />
          <span>High Tension (7-10)</span>
        </div>
      </div>
    </div>
  );
}

export default TimelineView;
