/**
 * Planning Service for Lineageweaver
 *
 * This service manages story planning data including:
 * - Story Plans (top-level planning containers)
 * - Story Arcs (main plot + subplots)
 * - Story Beats (framework-specific milestones)
 * - Scene Plans (detailed scene planning)
 * - Character Arcs (character development tracking)
 * - Plot Threads (narrative thread management)
 *
 * All functions accept an optional datasetId parameter for multi-dataset support,
 * and every mutation accepts an optional trailing userId. When userId is present
 * the change is mirrored to the cloud.
 *
 * That userId matters more than it looks: planner writes previously never
 * entered the sync queue at all, so getPendingChangeCount() was blind to them
 * and initializeSync's data-loss guard would happily wipe local planning data
 * and "restore" it from a Firestore subtree that had never been written.
 */

import { getDatabase } from './database.js';
import {
  syncAddStoryPlan, syncUpdateStoryPlan, syncDeleteStoryPlan,
  syncAddStoryArc, syncUpdateStoryArc, syncDeleteStoryArc,
  syncAddStoryBeat, syncUpdateStoryBeat, syncDeleteStoryBeat,
  syncAddScenePlan, syncUpdateScenePlan, syncDeleteScenePlan,
  syncAddCharacterArc, syncUpdateCharacterArc, syncDeleteCharacterArc,
  syncAddPlotThread, syncUpdatePlotThread, syncDeletePlotThread
} from './dataSyncService.js';
import { logger } from '../utils/logger';

/**
 * Mirror a planning mutation to the cloud.
 *
 * No-ops without a userId (signed-out / local-only use). Never throws: a sync
 * failure must never break the local write, per the local-first contract.
 *
 * @param {Function} syncFn - one of the sync{Add,Update,Delete}* wrappers
 * @param {string|null} userId
 * @param {string} datasetId
 * @param {...any} args - (entityId) or (entityId, data)
 */
async function syncPlanning(syncFn, userId, datasetId, ...args) {
  if (!userId) return;
  try {
    await syncFn(userId, datasetId, ...args);
  } catch (error) {
    logger.error(`☁️ Planning sync failed (${syncFn.name}):`, error);
  }
}

// ==================== CONSTANTS ====================

/**
 * Supported planning frameworks with their beat structures
 */
export const PLANNING_FRAMEWORKS = {
  'three-act': {
    name: 'Three-Act Structure',
    description: 'Classic beginning, middle, end structure',
    beats: [
      { id: 'setup', name: 'Setup', targetPercent: 0, actNumber: 1 },
      { id: 'inciting-incident', name: 'Inciting Incident', targetPercent: 10, actNumber: 1 },
      { id: 'plot-point-1', name: 'Plot Point 1', targetPercent: 25, actNumber: 1 },
      { id: 'rising-action', name: 'Rising Action', targetPercent: 37, actNumber: 2 },
      { id: 'midpoint', name: 'Midpoint', targetPercent: 50, actNumber: 2 },
      { id: 'plot-point-2', name: 'Plot Point 2', targetPercent: 75, actNumber: 2 },
      { id: 'climax', name: 'Climax', targetPercent: 90, actNumber: 3 },
      { id: 'resolution', name: 'Resolution', targetPercent: 95, actNumber: 3 }
    ]
  },
  'save-the-cat': {
    name: 'Save the Cat (15 Beats)',
    description: 'Blake Snyder\'s 15-beat structure for tight pacing',
    beats: [
      { id: 'opening-image', name: 'Opening Image', targetPercent: 0, actNumber: 1 },
      { id: 'theme-stated', name: 'Theme Stated', targetPercent: 5, actNumber: 1 },
      { id: 'setup', name: 'Setup', targetPercent: 1, actNumber: 1 },
      { id: 'catalyst', name: 'Catalyst', targetPercent: 10, actNumber: 1 },
      { id: 'debate', name: 'Debate', targetPercent: 12, actNumber: 1 },
      { id: 'break-into-two', name: 'Break into Two', targetPercent: 20, actNumber: 1 },
      { id: 'b-story', name: 'B Story', targetPercent: 22, actNumber: 2 },
      { id: 'fun-and-games', name: 'Fun and Games', targetPercent: 30, actNumber: 2 },
      { id: 'midpoint', name: 'Midpoint', targetPercent: 50, actNumber: 2 },
      { id: 'bad-guys-close-in', name: 'Bad Guys Close In', targetPercent: 55, actNumber: 2 },
      { id: 'all-is-lost', name: 'All Is Lost', targetPercent: 75, actNumber: 2 },
      { id: 'dark-night-of-soul', name: 'Dark Night of the Soul', targetPercent: 77, actNumber: 2 },
      { id: 'break-into-three', name: 'Break into Three', targetPercent: 80, actNumber: 3 },
      { id: 'finale', name: 'Finale', targetPercent: 85, actNumber: 3 },
      { id: 'final-image', name: 'Final Image', targetPercent: 99, actNumber: 3 }
    ]
  },
  'heros-journey': {
    name: 'Hero\'s Journey',
    description: 'Joseph Campbell\'s monomyth structure',
    beats: [
      { id: 'ordinary-world', name: 'Ordinary World', targetPercent: 0, actNumber: 1 },
      { id: 'call-to-adventure', name: 'Call to Adventure', targetPercent: 10, actNumber: 1 },
      { id: 'refusal-of-call', name: 'Refusal of the Call', targetPercent: 15, actNumber: 1 },
      { id: 'meeting-mentor', name: 'Meeting the Mentor', targetPercent: 20, actNumber: 1 },
      { id: 'crossing-threshold', name: 'Crossing the Threshold', targetPercent: 25, actNumber: 1 },
      { id: 'tests-allies-enemies', name: 'Tests, Allies, Enemies', targetPercent: 35, actNumber: 2 },
      { id: 'approach-inmost-cave', name: 'Approach to Inmost Cave', targetPercent: 45, actNumber: 2 },
      { id: 'ordeal', name: 'Ordeal', targetPercent: 50, actNumber: 2 },
      { id: 'reward', name: 'Reward', targetPercent: 60, actNumber: 2 },
      { id: 'road-back', name: 'The Road Back', targetPercent: 75, actNumber: 3 },
      { id: 'resurrection', name: 'Resurrection', targetPercent: 85, actNumber: 3 },
      { id: 'return-with-elixir', name: 'Return with Elixir', targetPercent: 95, actNumber: 3 }
    ]
  },
  'seven-point': {
    name: 'Seven-Point Structure',
    description: 'Dan Wells\' plot-driven structure',
    beats: [
      { id: 'hook', name: 'Hook', targetPercent: 0, actNumber: 1 },
      { id: 'plot-turn-1', name: 'Plot Turn 1', targetPercent: 15, actNumber: 1 },
      { id: 'pinch-1', name: 'Pinch 1', targetPercent: 30, actNumber: 2 },
      { id: 'midpoint', name: 'Midpoint', targetPercent: 50, actNumber: 2 },
      { id: 'pinch-2', name: 'Pinch 2', targetPercent: 70, actNumber: 2 },
      { id: 'plot-turn-2', name: 'Plot Turn 2', targetPercent: 85, actNumber: 3 },
      { id: 'resolution', name: 'Resolution', targetPercent: 95, actNumber: 3 }
    ]
  },
  'story-circle': {
    name: 'Story Circle (Dan Harmon)',
    description: 'Character transformation-focused 8-step structure',
    beats: [
      { id: 'you', name: 'You (Comfort Zone)', targetPercent: 0, actNumber: 1 },
      { id: 'need', name: 'Need (Want Something)', targetPercent: 12, actNumber: 1 },
      { id: 'go', name: 'Go (Enter Unfamiliar)', targetPercent: 25, actNumber: 1 },
      { id: 'search', name: 'Search (Adapt)', targetPercent: 37, actNumber: 2 },
      { id: 'find', name: 'Find (Get What Wanted)', targetPercent: 50, actNumber: 2 },
      { id: 'take', name: 'Take (Pay the Price)', targetPercent: 62, actNumber: 2 },
      { id: 'return', name: 'Return (Go Back)', targetPercent: 75, actNumber: 3 },
      { id: 'change', name: 'Change (Capable of Change)', targetPercent: 87, actNumber: 3 }
    ]
  },
  'custom': {
    name: 'Custom/Freeform',
    description: 'Create your own structure',
    beats: []
  }
};

/**
 * Story arc types
 */
export const ARC_TYPES = {
  main: { name: 'Main Plot', color: '#3b82f6' },
  subplot: { name: 'Subplot', color: '#8b5cf6' },
  character: { name: 'Character Arc', color: '#10b981' },
  thematic: { name: 'Thematic Arc', color: '#f59e0b' }
};

/**
 * Character arc types
 */
export const CHARACTER_ARC_TYPES = {
  positive: { name: 'Positive Change', description: 'Lie → Truth' },
  negative: { name: 'Negative Change', description: 'Truth → Lie' },
  flat: { name: 'Flat Arc', description: 'Holds Truth, Changes World' },
  corruption: { name: 'Corruption Arc', description: 'Truth → Corruption' },
  disillusionment: { name: 'Disillusionment Arc', description: 'Lie → Tragic Truth' }
};

/**
 * Plot thread types
 */
export const THREAD_TYPES = {
  mystery: { name: 'Mystery', icon: 'help-circle' },
  romance: { name: 'Romance', icon: 'heart' },
  conflict: { name: 'Conflict', icon: 'swords' },
  quest: { name: 'Quest', icon: 'map' },
  secret: { name: 'Secret', icon: 'lock' },
  prophecy: { name: 'Prophecy', icon: 'scroll' }
};

/**
 * Scene pacing types
 */
export const PACING_TYPES = {
  action: { name: 'Action', description: 'High tension, fast pacing' },
  reaction: { name: 'Reaction', description: 'Emotional processing, slower' },
  transition: { name: 'Transition', description: 'Moving between story beats' },
  exposition: { name: 'Exposition', description: 'Information delivery' }
};

/**
 * Status options for various entities
 */
export const PLAN_STATUS = {
  planned: 'Planned',
  'in-progress': 'In Progress',
  drafted: 'Drafted',
  revised: 'Revised',
  complete: 'Complete'
};

// ==================== STORY PLAN OPERATIONS ====================

/**
 * Create a new story plan for a writing
 * @param {Object} planData - Plan data
 * @param {number} planData.writingId - The writing this plan is for
 * @param {string} [planData.title] - Plan title (defaults to writing title)
 * @param {string} [planData.framework='three-act'] - Planning framework
 * @param {string} [planData.premise] - One-sentence premise
 * @param {string} [planData.synopsis] - Expanded synopsis
 * @param {string} [planData.theme] - Central theme
 * @param {string[]} [planData.genre] - Genre tags
 * @param {number} [planData.targetWordCount] - Target word count
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} The new story plan ID
 */
export async function createStoryPlan(planData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    const plan = {
      writingId: planData.writingId,
      title: planData.title || 'Untitled Plan',
      framework: planData.framework || 'three-act',
      premise: planData.premise || '',
      synopsis: planData.synopsis || '',
      theme: planData.theme || '',
      genre: planData.genre || [],
      targetWordCount: planData.targetWordCount || null,
      estimatedChapters: planData.estimatedChapters || null,
      settings: planData.settings || {},
      metadata: planData.metadata || {},
      createdAt: now,
      updatedAt: now
    };

    const id = await database.storyPlans.add(plan);
    logger.log('📖 Story plan created with ID:', id);
    await syncPlanning(syncAddStoryPlan, userId, datasetId, id, { ...plan, id });

    // Auto-create beats for the selected framework
    if (planData.framework && planData.framework !== 'custom') {
      await createBeatsForFramework(id, planData.framework, datasetId, userId);
    }

    return id;
  } catch (error) {
    logger.error('Error creating story plan:', error);
    throw error;
  }
}

/**
 * Get a story plan by ID
 */
export async function getStoryPlan(id, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.storyPlans.get(id);
  } catch (error) {
    logger.error('Error getting story plan:', error);
    throw error;
  }
}

/**
 * Get the story plan for a specific writing
 */
export async function getStoryPlanByWriting(writingId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.storyPlans
      .where('writingId')
      .equals(writingId)
      .first();
  } catch (error) {
    logger.error('Error getting story plan by writing:', error);
    throw error;
  }
}

/**
 * Get all story plans
 */
export async function getAllStoryPlans(datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.storyPlans.toArray();
  } catch (error) {
    logger.error('Error getting all story plans:', error);
    throw error;
  }
}

/**
 * Update a story plan
 */
export async function updateStoryPlan(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    // Don't mutate the caller's object — components pass state slices in here.
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.storyPlans.update(id, patch);
    logger.log('📖 Story plan updated:', id);
    await syncPlanning(syncUpdateStoryPlan, userId, datasetId, id, patch);
    return await database.storyPlans.get(id);
  } catch (error) {
    logger.error('Error updating story plan:', error);
    throw error;
  }
}

/**
 * Delete a story plan and all associated data
 */
export async function deleteStoryPlan(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);

    // Cascade delete all associated data. Collect ids first so each child
    // delete can be propagated to the cloud too — a bulk .delete() would
    // remove them locally and leave the Firestore copies to be restored.
    const [arcs, beats, scenes, charArcs, threads] = await Promise.all([
      database.storyArcs.where('storyPlanId').equals(id).toArray(),
      database.storyBeats.where('storyPlanId').equals(id).toArray(),
      database.scenePlans.where('storyPlanId').equals(id).toArray(),
      database.characterArcs.where('storyPlanId').equals(id).toArray(),
      database.plotThreads.where('storyPlanId').equals(id).toArray()
    ]);

    await database.storyArcs.where('storyPlanId').equals(id).delete();
    await database.storyBeats.where('storyPlanId').equals(id).delete();
    await database.scenePlans.where('storyPlanId').equals(id).delete();
    await database.characterArcs.where('storyPlanId').equals(id).delete();
    await database.plotThreads.where('storyPlanId').equals(id).delete();

    // Delete the plan itself
    await database.storyPlans.delete(id);
    logger.log('📖 Story plan deleted:', id);

    if (userId) {
      for (const a of arcs) await syncPlanning(syncDeleteStoryArc, userId, datasetId, a.id);
      for (const b of beats) await syncPlanning(syncDeleteStoryBeat, userId, datasetId, b.id);
      for (const s of scenes) await syncPlanning(syncDeleteScenePlan, userId, datasetId, s.id);
      for (const c of charArcs) await syncPlanning(syncDeleteCharacterArc, userId, datasetId, c.id);
      for (const t of threads) await syncPlanning(syncDeletePlotThread, userId, datasetId, t.id);
      await syncPlanning(syncDeleteStoryPlan, userId, datasetId, id);
    }

    return true;
  } catch (error) {
    logger.error('Error deleting story plan:', error);
    throw error;
  }
}

/**
 * Get a complete story plan with all related data
 */
export async function getStoryPlanComplete(id, datasetId) {
  try {
    const database = getDatabase(datasetId);

    const plan = await database.storyPlans.get(id);
    if (!plan) return null;

    const [arcs, beats, scenes, characterArcs, threads] = await Promise.all([
      database.storyArcs.where('storyPlanId').equals(id).sortBy('order'),
      database.storyBeats.where('storyPlanId').equals(id).sortBy('order'),
      database.scenePlans.where('storyPlanId').equals(id).sortBy('order'),
      database.characterArcs.where('storyPlanId').equals(id).toArray(),
      database.plotThreads.where('storyPlanId').equals(id).toArray()
    ]);

    return {
      ...plan,
      arcs,
      beats,
      scenes,
      characterArcs,
      threads
    };
  } catch (error) {
    logger.error('Error getting complete story plan:', error);
    throw error;
  }
}

// ==================== STORY ARC OPERATIONS ====================

/**
 * Create a story arc
 */
export async function createStoryArc(arcData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    // Get next order number
    const existingArcs = await database.storyArcs
      .where('storyPlanId')
      .equals(arcData.storyPlanId)
      .toArray();
    const maxOrder = existingArcs.reduce((max, a) => Math.max(max, a.order || 0), 0);

    const arc = {
      storyPlanId: arcData.storyPlanId,
      name: arcData.name || 'Untitled Arc',
      type: arcData.type || 'subplot',
      description: arcData.description || '',
      startingState: arcData.startingState || '',
      endingState: arcData.endingState || '',
      valueAtStake: arcData.valueAtStake || '',
      status: arcData.status || 'planned',
      linkedCharacters: arcData.linkedCharacters || [],
      order: arcData.order ?? maxOrder + 1,
      color: arcData.color || ARC_TYPES[arcData.type || 'subplot']?.color || '#6b7280',
      createdAt: now,
      updatedAt: now
    };

    const id = await database.storyArcs.add(arc);
    logger.log('📊 Story arc created:', id);
    await syncPlanning(syncAddStoryArc, userId, datasetId, id, { ...arc, id });
    return id;
  } catch (error) {
    logger.error('Error creating story arc:', error);
    throw error;
  }
}

/**
 * Get story arcs for a plan
 */
export async function getStoryArcs(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.storyArcs
      .where('storyPlanId')
      .equals(storyPlanId)
      .sortBy('order');
  } catch (error) {
    logger.error('Error getting story arcs:', error);
    throw error;
  }
}

/**
 * Update a story arc
 */
export async function updateStoryArc(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.storyArcs.update(id, patch);
    await syncPlanning(syncUpdateStoryArc, userId, datasetId, id, patch);
    return await database.storyArcs.get(id);
  } catch (error) {
    logger.error('Error updating story arc:', error);
    throw error;
  }
}

/**
 * Delete a story arc
 */
export async function deleteStoryArc(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    await database.storyArcs.delete(id);
    logger.log('📊 Story arc deleted:', id);
    await syncPlanning(syncDeleteStoryArc, userId, datasetId, id);
    return true;
  } catch (error) {
    logger.error('Error deleting story arc:', error);
    throw error;
  }
}

// ==================== STORY BEAT OPERATIONS ====================

/**
 * Create beats for a framework
 */
async function createBeatsForFramework(storyPlanId, frameworkId, datasetId, userId = null) {
  const framework = PLANNING_FRAMEWORKS[frameworkId];
  if (!framework || !framework.beats.length) return;

  const database = getDatabase(datasetId);
  const now = new Date().toISOString();

  const beats = framework.beats.map((beat, index) => ({
    storyPlanId,
    storyArcId: null, // Main story beats not tied to specific arc
    name: beat.name,
    beatType: beat.id,
    description: '',
    targetPercentage: beat.targetPercent,
    targetWordCount: null,
    actualChapterId: null,
    status: 'planned',
    notes: '',
    order: index,
    actNumber: beat.actNumber,
    createdAt: now,
    updatedAt: now
  }));

  const ids = await database.storyBeats.bulkAdd(beats, { allKeys: true });
  logger.log(`📍 Created ${beats.length} beats for framework: ${frameworkId}`);

  if (userId) {
    for (let i = 0; i < ids.length; i++) {
      await syncPlanning(syncAddStoryBeat, userId, datasetId, ids[i], { ...beats[i], id: ids[i] });
    }
  }
}

/**
 * Create a single story beat
 */
export async function createStoryBeat(beatData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    // Get next order number
    const existingBeats = await database.storyBeats
      .where('storyPlanId')
      .equals(beatData.storyPlanId)
      .toArray();
    const maxOrder = existingBeats.reduce((max, b) => Math.max(max, b.order || 0), 0);

    const beat = {
      storyPlanId: beatData.storyPlanId,
      storyArcId: beatData.storyArcId || null,
      name: beatData.name || 'Untitled Beat',
      beatType: beatData.beatType || 'custom',
      description: beatData.description || '',
      targetPercentage: beatData.targetPercentage || 50,
      targetWordCount: beatData.targetWordCount || null,
      actualChapterId: beatData.actualChapterId || null,
      status: beatData.status || 'planned',
      notes: beatData.notes || '',
      order: beatData.order ?? maxOrder + 1,
      actNumber: beatData.actNumber || 2,
      createdAt: now,
      updatedAt: now
    };

    const id = await database.storyBeats.add(beat);
    logger.log('📍 Story beat created:', id);
    await syncPlanning(syncAddStoryBeat, userId, datasetId, id, { ...beat, id });
    return id;
  } catch (error) {
    logger.error('Error creating story beat:', error);
    throw error;
  }
}

/**
 * Get story beats for a plan
 */
export async function getStoryBeats(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.storyBeats
      .where('storyPlanId')
      .equals(storyPlanId)
      .sortBy('order');
  } catch (error) {
    logger.error('Error getting story beats:', error);
    throw error;
  }
}

/**
 * Update a story beat
 */
export async function updateStoryBeat(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.storyBeats.update(id, patch);
    await syncPlanning(syncUpdateStoryBeat, userId, datasetId, id, patch);
    return await database.storyBeats.get(id);
  } catch (error) {
    logger.error('Error updating story beat:', error);
    throw error;
  }
}

/**
 * Delete a story beat
 */
export async function deleteStoryBeat(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    await database.storyBeats.delete(id);
    logger.log('📍 Story beat deleted:', id);
    await syncPlanning(syncDeleteStoryBeat, userId, datasetId, id);
    return true;
  } catch (error) {
    logger.error('Error deleting story beat:', error);
    throw error;
  }
}

/**
 * Reorder story beats
 */
export async function reorderStoryBeats(storyPlanId, beatIds, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    for (let i = 0; i < beatIds.length; i++) {
      const patch = { order: i, updatedAt: now };
      await database.storyBeats.update(beatIds[i], patch);
      await syncPlanning(syncUpdateStoryBeat, userId, datasetId, beatIds[i], patch);
    }

    logger.log('📍 Story beats reordered');
    return true;
  } catch (error) {
    logger.error('Error reordering story beats:', error);
    throw error;
  }
}

// ==================== SCENE PLAN OPERATIONS ====================

/**
 * Create a scene plan
 */
export async function createScenePlan(sceneData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    // Get next order number
    const existingScenes = await database.scenePlans
      .where('storyPlanId')
      .equals(sceneData.storyPlanId)
      .toArray();
    const maxOrder = existingScenes.reduce((max, s) => Math.max(max, s.order || 0), 0);

    const scene = {
      storyPlanId: sceneData.storyPlanId,
      chapterId: sceneData.chapterId || null,
      title: sceneData.title || 'Untitled Scene',
      summary: sceneData.summary || '',
      purpose: sceneData.purpose || '',

      // Scene metadata
      povCharacterId: sceneData.povCharacterId || null,
      locationId: sceneData.locationId || null,
      timelinePosition: sceneData.timelinePosition || '',

      // Narrative elements (Scene-Sequel structure)
      goal: sceneData.goal || '',
      conflict: sceneData.conflict || '',
      disaster: sceneData.disaster || '',
      reaction: sceneData.reaction || '',
      dilemma: sceneData.dilemma || '',
      decision: sceneData.decision || '',

      // Scene dynamics
      tensionLevel: sceneData.tensionLevel || 5,
      emotionalTone: sceneData.emotionalTone || [],
      pacingType: sceneData.pacingType || 'action',

      // Connections
      storyArcIds: sceneData.storyArcIds || [],
      charactersPresent: sceneData.charactersPresent || [],
      linkedBeats: sceneData.linkedBeats || [],

      // Planning
      order: sceneData.order ?? maxOrder + 1,
      estimatedWordCount: sceneData.estimatedWordCount || null,
      status: sceneData.status || 'idea',
      notes: sceneData.notes || '',

      createdAt: now,
      updatedAt: now
    };

    const id = await database.scenePlans.add(scene);
    logger.log('🎬 Scene plan created:', id);
    await syncPlanning(syncAddScenePlan, userId, datasetId, id, { ...scene, id });
    return id;
  } catch (error) {
    logger.error('Error creating scene plan:', error);
    throw error;
  }
}

/**
 * Get scene plans for a story plan
 */
export async function getScenePlans(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.scenePlans
      .where('storyPlanId')
      .equals(storyPlanId)
      .sortBy('order');
  } catch (error) {
    logger.error('Error getting scene plans:', error);
    throw error;
  }
}

/**
 * Get scene plans for a chapter
 */
export async function getScenePlansByChapter(chapterId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.scenePlans
      .where('chapterId')
      .equals(chapterId)
      .sortBy('order');
  } catch (error) {
    logger.error('Error getting scene plans by chapter:', error);
    throw error;
  }
}

/**
 * Update a scene plan
 */
export async function updateScenePlan(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.scenePlans.update(id, patch);
    await syncPlanning(syncUpdateScenePlan, userId, datasetId, id, patch);
    return await database.scenePlans.get(id);
  } catch (error) {
    logger.error('Error updating scene plan:', error);
    throw error;
  }
}

/**
 * Delete a scene plan
 */
export async function deleteScenePlan(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    await database.scenePlans.delete(id);
    logger.log('🎬 Scene plan deleted:', id);
    await syncPlanning(syncDeleteScenePlan, userId, datasetId, id);
    return true;
  } catch (error) {
    logger.error('Error deleting scene plan:', error);
    throw error;
  }
}

/**
 * Reorder scene plans
 */
export async function reorderScenePlans(storyPlanId, sceneIds, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    for (let i = 0; i < sceneIds.length; i++) {
      const patch = { order: i, updatedAt: now };
      await database.scenePlans.update(sceneIds[i], patch);
      await syncPlanning(syncUpdateScenePlan, userId, datasetId, sceneIds[i], patch);
    }

    logger.log('🎬 Scene plans reordered');
    return true;
  } catch (error) {
    logger.error('Error reordering scene plans:', error);
    throw error;
  }
}

// ==================== CHARACTER ARC OPERATIONS ====================

/**
 * Create a character arc
 */
export async function createCharacterArc(arcData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    const arc = {
      storyPlanId: arcData.storyPlanId,
      characterId: arcData.characterId,
      arcType: arcData.arcType || 'positive',

      // Character state
      startingBelief: arcData.startingBelief || '',
      endingBelief: arcData.endingBelief || '',
      ghost: arcData.ghost || '',
      want: arcData.want || '',
      need: arcData.need || '',

      // Development milestones
      milestones: arcData.milestones || [],

      // Arc mapping
      linkedStoryArcId: arcData.linkedStoryArcId || null,

      status: arcData.status || 'planned',
      notes: arcData.notes || '',
      createdAt: now,
      updatedAt: now
    };

    const id = await database.characterArcs.add(arc);
    logger.log('👤 Character arc created:', id);
    await syncPlanning(syncAddCharacterArc, userId, datasetId, id, { ...arc, id });
    return id;
  } catch (error) {
    logger.error('Error creating character arc:', error);
    throw error;
  }
}

/**
 * Get character arcs for a story plan
 */
export async function getCharacterArcs(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.characterArcs
      .where('storyPlanId')
      .equals(storyPlanId)
      .toArray();
  } catch (error) {
    logger.error('Error getting character arcs:', error);
    throw error;
  }
}

/**
 * Get character arc for a specific character
 */
export async function getCharacterArcByCharacter(storyPlanId, characterId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.characterArcs
      .where('storyPlanId')
      .equals(storyPlanId)
      .and(arc => arc.characterId === characterId)
      .first();
  } catch (error) {
    logger.error('Error getting character arc:', error);
    throw error;
  }
}

/**
 * Update a character arc
 */
export async function updateCharacterArc(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.characterArcs.update(id, patch);
    await syncPlanning(syncUpdateCharacterArc, userId, datasetId, id, patch);
    return await database.characterArcs.get(id);
  } catch (error) {
    logger.error('Error updating character arc:', error);
    throw error;
  }
}

/**
 * Add a milestone to a character arc
 */
export async function addCharacterMilestone(arcId, milestone, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const arc = await database.characterArcs.get(arcId);
    if (!arc) throw new Error('Character arc not found');

    const existing = arc.milestones || [];
    // Date.now() collides when two milestones are added in the same tick.
    const nextId = existing.reduce((max, m) => Math.max(max, Number(m.id) || 0), 0) + 1;

    const milestones = [...existing, { id: nextId, ...milestone }];

    const patch = { milestones, updatedAt: new Date().toISOString() };
    await database.characterArcs.update(arcId, patch);
    await syncPlanning(syncUpdateCharacterArc, userId, datasetId, arcId, patch);

    logger.log('👤 Milestone added to character arc:', arcId);
    return milestones;
  } catch (error) {
    logger.error('Error adding character milestone:', error);
    throw error;
  }
}

/**
 * Delete a character arc
 */
export async function deleteCharacterArc(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    await database.characterArcs.delete(id);
    logger.log('👤 Character arc deleted:', id);
    await syncPlanning(syncDeleteCharacterArc, userId, datasetId, id);
    return true;
  } catch (error) {
    logger.error('Error deleting character arc:', error);
    throw error;
  }
}

// ==================== PLOT THREAD OPERATIONS ====================

/**
 * Create a plot thread
 */
export async function createPlotThread(threadData, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const now = new Date().toISOString();

    const thread = {
      storyPlanId: threadData.storyPlanId,
      name: threadData.name || 'Untitled Thread',
      description: threadData.description || '',
      threadType: threadData.threadType || 'mystery',

      // Thread state
      setupSceneId: threadData.setupSceneId || null,
      payoffSceneId: threadData.payoffSceneId || null,
      status: threadData.status || 'setup',

      // Connections
      involvedCharacters: threadData.involvedCharacters || [],
      linkedScenes: threadData.linkedScenes || [],
      linkedCodexEntries: threadData.linkedCodexEntries || [],

      // Foreshadowing
      plants: threadData.plants || [],

      notes: threadData.notes || '',
      createdAt: now,
      updatedAt: now
    };

    const id = await database.plotThreads.add(thread);
    logger.log('🧵 Plot thread created:', id);
    await syncPlanning(syncAddPlotThread, userId, datasetId, id, { ...thread, id });
    return id;
  } catch (error) {
    logger.error('Error creating plot thread:', error);
    throw error;
  }
}

/**
 * Get plot threads for a story plan
 */
export async function getPlotThreads(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    return await database.plotThreads
      .where('storyPlanId')
      .equals(storyPlanId)
      .toArray();
  } catch (error) {
    logger.error('Error getting plot threads:', error);
    throw error;
  }
}

/**
 * Update a plot thread
 */
export async function updatePlotThread(id, updates, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const patch = { ...updates, updatedAt: new Date().toISOString() };
    await database.plotThreads.update(id, patch);
    await syncPlanning(syncUpdatePlotThread, userId, datasetId, id, patch);
    return await database.plotThreads.get(id);
  } catch (error) {
    logger.error('Error updating plot thread:', error);
    throw error;
  }
}

/**
 * Add a plant (foreshadowing) to a thread
 */
export async function addThreadPlant(threadId, plant, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    const thread = await database.plotThreads.get(threadId);
    if (!thread) throw new Error('Plot thread not found');

    const existing = thread.plants || [];
    // Date.now() collides when two plants are added in the same tick.
    const nextId = existing.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;

    const plants = [...existing, { id: nextId, ...plant }];

    const patch = { plants, updatedAt: new Date().toISOString() };
    await database.plotThreads.update(threadId, patch);
    await syncPlanning(syncUpdatePlotThread, userId, datasetId, threadId, patch);

    logger.log('🧵 Plant added to thread:', threadId);
    return plants;
  } catch (error) {
    logger.error('Error adding thread plant:', error);
    throw error;
  }
}

/**
 * Delete a plot thread
 */
export async function deletePlotThread(id, datasetId, userId = null) {
  try {
    const database = getDatabase(datasetId);
    await database.plotThreads.delete(id);
    logger.log('🧵 Plot thread deleted:', id);
    await syncPlanning(syncDeletePlotThread, userId, datasetId, id);
    return true;
  } catch (error) {
    logger.error('Error deleting plot thread:', error);
    throw error;
  }
}

// ==================== ANALYTICS & VALIDATION ====================

/**
 * Calculate plan progress statistics
 */
export async function getPlanProgress(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);

    const [beats, scenes, arcs, characterArcs, threads] = await Promise.all([
      database.storyBeats.where('storyPlanId').equals(storyPlanId).toArray(),
      database.scenePlans.where('storyPlanId').equals(storyPlanId).toArray(),
      database.storyArcs.where('storyPlanId').equals(storyPlanId).toArray(),
      database.characterArcs.where('storyPlanId').equals(storyPlanId).toArray(),
      database.plotThreads.where('storyPlanId').equals(storyPlanId).toArray()
    ]);

    const countByStatus = (items) => {
      const total = items.length;
      const complete = items.filter(i => i.status === 'complete').length;
      const inProgress = items.filter(i => i.status === 'in-progress' || i.status === 'drafted').length;
      return { total, complete, inProgress, percent: total > 0 ? Math.round((complete / total) * 100) : 0 };
    };

    return {
      beats: countByStatus(beats),
      scenes: countByStatus(scenes),
      arcs: countByStatus(arcs),
      characterArcs: countByStatus(characterArcs),
      threads: {
        total: threads.length,
        resolved: threads.filter(t => t.status === 'resolved').length,
        unresolved: threads.filter(t => t.status !== 'resolved').length
      },
      overall: {
        totalItems: beats.length + scenes.length,
        completedItems: beats.filter(b => b.status === 'complete').length +
                        scenes.filter(s => s.status === 'complete').length
      }
    };
  } catch (error) {
    logger.error('Error getting plan progress:', error);
    throw error;
  }
}

/**
 * Get unresolved plot threads (for warnings)
 */
export async function getUnresolvedThreads(storyPlanId, datasetId) {
  try {
    const database = getDatabase(datasetId);
    const threads = await database.plotThreads
      .where('storyPlanId')
      .equals(storyPlanId)
      .toArray();

    return threads.filter(t => t.status !== 'resolved' && t.status !== 'dropped');
  } catch (error) {
    logger.error('Error getting unresolved threads:', error);
    throw error;
  }
}

/**
 * Get pacing analysis for scenes
 */
export async function getPacingAnalysis(storyPlanId, datasetId) {
  try {
    const scenes = await getScenePlans(storyPlanId, datasetId);

    const tensionCurve = scenes.map((s, idx) => ({
      sceneId: s.id,
      title: s.title,
      position: idx,
      tension: s.tensionLevel || 5
    }));

    // Find pacing issues
    const issues = [];

    // Check for tension plateaus (3+ scenes at same level)
    for (let i = 0; i < scenes.length - 2; i++) {
      if (scenes[i].tensionLevel === scenes[i + 1].tensionLevel &&
          scenes[i + 1].tensionLevel === scenes[i + 2].tensionLevel) {
        issues.push({
          type: 'tension_plateau',
          location: `Scenes ${i + 1}-${i + 3}`,
          message: `Tension stays at ${scenes[i].tensionLevel}/10 for 3 consecutive scenes`,
          suggestion: 'Consider varying tension levels to maintain reader engagement'
        });
      }
    }

    // Check for pacing type imbalance
    const pacingCounts = {
      action: scenes.filter(s => s.pacingType === 'action').length,
      reaction: scenes.filter(s => s.pacingType === 'reaction').length,
      transition: scenes.filter(s => s.pacingType === 'transition').length,
      exposition: scenes.filter(s => s.pacingType === 'exposition').length
    };

    if (scenes.length >= 5 && pacingCounts.reaction === 0) {
      issues.push({
        type: 'missing_reaction',
        message: 'No reaction scenes found',
        suggestion: 'Add reaction scenes to give characters time to process events emotionally'
      });
    }

    return {
      tensionCurve,
      pacingDistribution: pacingCounts,
      issues
    };
  } catch (error) {
    logger.error('Error analyzing pacing:', error);
    throw error;
  }
}

// ==================== RESTORE OPERATIONS (for cloud sync) ====================

/**
 * Restore a story plan from cloud data
 */
export async function restoreStoryPlan(planData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.storyPlans.put(planData);
    logger.log('📖 Story plan restored:', planData.id);
    return planData.id;
  } catch (error) {
    logger.error('Error restoring story plan:', error);
    throw error;
  }
}

/**
 * Restore a story arc from cloud data
 */
export async function restoreStoryArc(arcData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.storyArcs.put(arcData);
    return arcData.id;
  } catch (error) {
    logger.error('Error restoring story arc:', error);
    throw error;
  }
}

/**
 * Restore a story beat from cloud data
 */
export async function restoreStoryBeat(beatData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.storyBeats.put(beatData);
    return beatData.id;
  } catch (error) {
    logger.error('Error restoring story beat:', error);
    throw error;
  }
}

/**
 * Restore a scene plan from cloud data
 */
export async function restoreScenePlan(sceneData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.scenePlans.put(sceneData);
    return sceneData.id;
  } catch (error) {
    logger.error('Error restoring scene plan:', error);
    throw error;
  }
}

/**
 * Restore a character arc from cloud data
 */
export async function restoreCharacterArc(arcData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.characterArcs.put(arcData);
    return arcData.id;
  } catch (error) {
    logger.error('Error restoring character arc:', error);
    throw error;
  }
}

/**
 * Restore a plot thread from cloud data
 */
export async function restorePlotThread(threadData, datasetId) {
  try {
    const database = getDatabase(datasetId);
    await database.plotThreads.put(threadData);
    return threadData.id;
  } catch (error) {
    logger.error('Error restoring plot thread:', error);
    throw error;
  }
}
