/**
 * Planning AI Service
 *
 * AI-powered features for the Intelligent Writing Planner.
 * Provides intelligent suggestions, analysis, and assistance
 * for story planning, beat development, and narrative structure.
 *
 * Uses Google's Gemini API for AI responses.
 */

import { askGemini } from './aiAssistantService';
import {
  PLANNING_FRAMEWORKS,
  ARC_TYPES,
  CHARACTER_ARC_TYPES,
  PACING_TYPES,
  getStoryPlanComplete,
  getScenePlans,
  getStoryBeats,
  getPlotThreads,
  getCharacterArcs
} from './planningService';
import { getPerson } from './database';
import { logger } from '../utils/logger';

// ==================== PREMISE & STORY DEVELOPMENT ====================

/**
 * Develop a story premise from an initial idea
 * @param {Object} params - Parameters for premise development
 * @param {string} params.idea - The initial story idea
 * @param {string} params.genre - Genre of the story
 * @param {string} params.worldContext - Summary of the world/setting
 * @param {Array} params.existingCharacters - Available characters from genealogy
 * @returns {Promise<Object>} Developed premise with logline, theme, and suggestions
 */
export async function developPremise({ idea, genre, worldContext, existingCharacters = [] }) {
  const characterList = existingCharacters.slice(0, 10).map(c =>
    `${c.firstName} ${c.lastName || ''} (${c.titles?.[0] || 'commoner'})`
  ).join(', ');

  const prompt = `You are an expert story development consultant helping a writer develop their premise.

INITIAL IDEA:
${idea}

GENRE: ${genre || 'Fantasy'}

WORLD CONTEXT:
${worldContext || 'A fantasy world with noble houses and political intrigue.'}

AVAILABLE CHARACTERS:
${characterList || 'No existing characters yet.'}

Please help develop this into a compelling story premise. Provide your response in the following JSON format:

{
  "logline": "A 25-30 word one-sentence hook that captures the story's essence",
  "premise": "A 100-word expanded premise paragraph",
  "centralConflict": "The core conflict driving the story",
  "themes": ["theme1", "theme2", "theme3"],
  "protagonistSuggestion": "Who might be the protagonist and why",
  "antagonistSuggestion": "Who/what opposes them and why",
  "stakesEscalation": "How stakes can escalate throughout the story",
  "uniqueHook": "What makes this story stand out"
}

Respond ONLY with valid JSON, no additional text.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.8, maxOutputTokens: 1024 });
    // Parse JSON from response (handle potential markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error developing premise:', error);
    throw error;
  }
}

/**
 * Generate beat suggestions for a framework
 * @param {Object} params - Parameters for beat generation
 * @param {string} params.premise - The story premise
 * @param {string} params.framework - The planning framework to use
 * @param {string} params.genre - Story genre
 * @param {Array} params.characters - Main characters
 * @returns {Promise<Array>} Array of beat suggestions
 */
export async function generateBeatSuggestions({ premise, framework, genre, characters = [] }) {
  const frameworkInfo = PLANNING_FRAMEWORKS[framework];
  if (!frameworkInfo) {
    throw new Error(`Unknown framework: ${framework}`);
  }

  const beatList = frameworkInfo.beats.map(b =>
    `- ${b.name} (${b.targetPercent}%): ${b.id}`
  ).join('\n');

  const characterList = characters.slice(0, 5).map(c =>
    `${c.firstName} ${c.lastName || ''}`
  ).join(', ');

  const prompt = `You are a story structure expert. Generate specific scene suggestions for each beat of the ${frameworkInfo.name} structure.

PREMISE:
${premise}

GENRE: ${genre || 'Fantasy'}

MAIN CHARACTERS: ${characterList || 'To be determined'}

FRAMEWORK BEATS:
${beatList}

For each beat, provide a specific, actionable scene suggestion that advances the story. Respond in this JSON format:

{
  "beats": [
    {
      "beatId": "beat-id-from-list",
      "beatName": "Beat Name",
      "sceneSuggestion": "Specific scene idea",
      "purpose": "What this achieves in the story",
      "characterFocus": "Which character this focuses on",
      "emotionalTone": "The emotional tone of this beat",
      "potentialConflicts": ["conflict1", "conflict2"]
    }
  ]
}

Generate suggestions for ALL beats in the framework. Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 2048 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).beats;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error generating beat suggestions:', error);
    throw error;
  }
}

/**
 * Suggest content for a specific beat
 * @param {Object} params - Parameters for beat content suggestion
 * @param {string} params.beatName - The name of the beat
 * @param {string} params.beatType - The type/ID of the beat
 * @param {string} params.framework - The planning framework being used
 * @param {string} params.premise - The story premise
 * @param {Array} params.existingBeats - Other beats for context
 * @returns {Promise<Object>} Beat content suggestion
 */
export async function suggestBeatContent({ beatName, beatType, framework, premise, existingBeats = [] }) {
  const frameworkInfo = PLANNING_FRAMEWORKS[framework];
  const frameworkName = frameworkInfo?.name || 'Custom Structure';

  const existingContext = existingBeats
    .filter(b => b.description)
    .slice(0, 5)
    .map(b => `- ${b.name}: ${b.description}`)
    .join('\n');

  const prompt = `You are a story structure expert. Help develop content for a specific story beat.

FRAMEWORK: ${frameworkName}
BEAT: ${beatName}
BEAT TYPE: ${beatType || 'custom'}

STORY PREMISE:
${premise || 'Not yet defined'}

EXISTING BEAT CONTENT FOR CONTEXT:
${existingContext || 'No other beats developed yet'}

Please suggest content for the "${beatName}" beat. Provide:
1. A description of what should happen at this beat (2-3 sentences)
2. Planning notes for the writer

Respond in this JSON format:
{
  "description": "What happens at this beat in the story...",
  "notes": "Planning notes and considerations for the writer..."
}

Make the suggestion specific to the premise if provided, or give a genre-appropriate suggestion if not. Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 512 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error suggesting beat content:', error);
    throw error;
  }
}

// ==================== SCENE DEVELOPMENT ====================

/**
 * Develop a scene with AI assistance
 * @param {Object} params - Scene parameters
 * @param {Object} params.scene - Current scene data
 * @param {Object} params.beat - The beat this scene fulfills
 * @param {Object} params.povCharacter - POV character data
 * @param {Array} params.otherCharacters - Other characters in scene
 * @param {Object} params.location - Scene location
 * @param {Array} params.activeThreads - Active plot threads
 * @returns {Promise<Object>} Scene development suggestions
 */
export async function developScene({ scene, beat, povCharacter, otherCharacters = [], location, activeThreads = [] }) {
  const threadList = activeThreads.map(t => `- ${t.name}: ${t.description || t.status}`).join('\n');
  const characterList = otherCharacters.map(c => c.firstName).join(', ');

  const prompt = `You are helping develop a scene for a story.

SCENE: ${scene.title || 'Untitled Scene'}
CURRENT SUMMARY: ${scene.summary || 'Not yet developed'}

BEAT BEING FULFILLED: ${beat?.name || 'Custom scene'}
BEAT PURPOSE: ${beat?.description || 'Advance the story'}

POV CHARACTER: ${povCharacter?.firstName || 'Unknown'} ${povCharacter?.lastName || ''}
${povCharacter?.bio ? `Background: ${povCharacter.bio}` : ''}

OTHER CHARACTERS PRESENT: ${characterList || 'None specified'}

LOCATION: ${location?.title || location?.name || 'Unspecified location'}

ACTIVE PLOT THREADS:
${threadList || 'None specified'}

Develop this scene with specific, actionable suggestions. Respond in JSON format:

{
  "refinedSummary": "A 2-3 sentence summary of what should happen",
  "goal": "The POV character's specific goal in this scene",
  "conflict": "What opposes their goal",
  "disaster": "The complication or setback (can be positive twist too)",
  "emotionalJourney": "How the POV character's emotions shift",
  "tensionLevel": 7,
  "pacingType": "action|reaction|transition|exposition",
  "keyDialogue": "A crucial line of dialogue that could appear",
  "sensoryDetails": ["sight", "sound", "smell/touch detail"],
  "threadAdvancement": "How this scene advances plot threads",
  "characterDevelopment": "How this reveals or develops character",
  "transitionTo": "What the next scene might be"
}

Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 1024 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error developing scene:', error);
    throw error;
  }
}

/**
 * Get "What Could Happen Next" suggestions
 * @param {Object} params - Context parameters
 * @param {Object} params.currentScene - The current/last scene
 * @param {Array} params.upcomingBeats - Beats that haven't been written yet
 * @param {Array} params.unresolvedThreads - Threads needing resolution
 * @param {Array} params.characters - Available characters
 * @returns {Promise<Array>} Array of "what next" suggestions
 */
export async function getWhatNextSuggestions({ currentScene, upcomingBeats = [], unresolvedThreads = [], characters = [] }) {
  const beatsList = upcomingBeats.slice(0, 5).map(b => `- ${b.name}`).join('\n');
  const threadsList = unresolvedThreads.slice(0, 5).map(t => `- ${t.name}: ${t.status}`).join('\n');

  const prompt = `Based on where this story currently is, suggest what could happen next.

CURRENT SCENE:
Title: ${currentScene?.title || 'Unknown'}
Summary: ${currentScene?.summary || 'Not specified'}
Outcome: ${currentScene?.disaster || 'Scene ended'}

UPCOMING BEATS TO HIT:
${beatsList || 'None specified'}

UNRESOLVED THREADS:
${threadsList || 'None'}

Generate 4 different directions the story could take next. Each should be distinct and interesting. Respond in JSON:

{
  "suggestions": [
    {
      "title": "Short title for this direction",
      "description": "2-3 sentence description of what happens",
      "advancesBeat": "Which beat this could fulfill (if any)",
      "threadImpact": "Which thread this affects",
      "riskLevel": "safe|moderate|bold",
      "emotionalShift": "What emotional change this brings"
    }
  ]
}

Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.9, maxOutputTokens: 1024 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]).suggestions;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error getting suggestions:', error);
    throw error;
  }
}

// ==================== STORY ARC DEVELOPMENT ====================

/**
 * Suggest story arc development
 * @param {Object} params - Parameters for arc suggestion
 * @param {string} params.arcName - The arc's name
 * @param {string} params.arcType - Type of arc (main, subplot, character, thematic)
 * @param {string} params.currentDescription - Current description if any
 * @param {string} params.linkedCharacters - Comma-separated character names
 * @returns {Promise<Object>} Arc development suggestions
 */
export async function suggestStoryArc({ arcName, arcType, currentDescription, linkedCharacters }) {
  const arcTypeDescriptions = {
    main: 'The primary storyline that drives the narrative forward',
    subplot: 'A secondary storyline that enriches the main plot',
    character: 'An arc focused on a character\'s internal growth or change',
    thematic: 'An arc that explores and develops the story\'s central themes'
  };

  const prompt = `You are helping develop a story arc for a narrative.

ARC NAME: ${arcName}
ARC TYPE: ${arcType} - ${arcTypeDescriptions[arcType] || 'A narrative arc'}

${currentDescription ? `CURRENT DESCRIPTION: ${currentDescription}` : ''}
${linkedCharacters ? `LINKED CHARACTERS: ${linkedCharacters}` : ''}

Develop this story arc with specific suggestions. A story arc tracks the change in a value (what's at stake) from a starting state to an ending state. Respond in JSON:

{
  "description": "A 2-3 sentence description of this arc and its narrative purpose",
  "startingState": "The initial state/situation at the beginning of this arc (1 sentence)",
  "endingState": "The final state/situation at the resolution of this arc (1 sentence)",
  "valueAtStake": "What could be lost or gained through this arc (e.g., 'love', 'power', 'identity', 'freedom')",
  "keyTurningPoints": [
    "First major turning point in this arc",
    "Midpoint reversal or escalation",
    "Crisis/dark moment before resolution"
  ],
  "connectionToTheme": "How this arc connects to larger thematic elements",
  "tensionDrivers": "What creates tension and suspense in this arc"
}

Make suggestions specific to the arc type and any provided context. Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 700 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error suggesting story arc:', error);
    throw error;
  }
}

// ==================== PLOT THREAD DEVELOPMENT ====================

/**
 * Suggest plot thread development
 * @param {Object} params - Parameters for thread suggestion
 * @param {string} params.threadName - The thread's name
 * @param {string} params.threadType - Type of thread (mystery, romance, conflict, etc.)
 * @param {string} params.currentDescription - Current description if any
 * @param {string} params.involvedCharacters - Comma-separated character names
 * @param {string} params.linkedScenes - Comma-separated scene titles
 * @returns {Promise<Object>} Thread development suggestions
 */
export async function suggestPlotThread({ threadName, threadType, currentDescription, involvedCharacters, linkedScenes }) {
  const threadTypeDescriptions = {
    mystery: 'A puzzle or secret that needs to be solved',
    romance: 'A romantic relationship developing between characters',
    conflict: 'A major conflict or confrontation',
    quest: 'A goal or mission characters are pursuing',
    secret: 'A hidden truth that will be revealed',
    prophecy: 'A foretelling that shapes character actions'
  };

  const prompt = `You are helping develop a plot thread for a story.

THREAD NAME: ${threadName}
THREAD TYPE: ${threadType} - ${threadTypeDescriptions[threadType] || 'A narrative thread'}

${currentDescription ? `CURRENT DESCRIPTION: ${currentDescription}` : ''}
${involvedCharacters ? `INVOLVED CHARACTERS: ${involvedCharacters}` : ''}
${linkedScenes ? `LINKED SCENES: ${linkedScenes}` : ''}

Develop this plot thread with suggestions for how it can be woven through the story. Respond in JSON:

{
  "description": "A 2-3 sentence description of this plot thread and its narrative purpose",
  "notes": "Planning notes about how to develop this thread effectively",
  "setupSuggestion": "How to introduce/set up this thread early in the story",
  "developmentIdeas": ["idea 1", "idea 2", "idea 3"],
  "payoffSuggestion": "How this thread could resolve satisfyingly",
  "suggestedPlants": ["foreshadowing element 1", "foreshadowing element 2", "foreshadowing element 3"],
  "tensionBuilders": "Ways to build tension around this thread",
  "connectionOpportunities": "How this thread can connect to other story elements"
}

Make suggestions specific to the thread type and any provided context. Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 800 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error suggesting plot thread:', error);
    throw error;
  }
}

// ==================== CHARACTER ARC DEVELOPMENT ====================

/**
 * Suggest character arc psychology elements
 * @param {Object} params - Parameters for arc suggestion
 * @param {string} params.characterName - The character's name
 * @param {string} params.characterBio - Character background/bio
 * @param {string} params.arcType - Type of arc (positive, negative, flat, etc.)
 * @param {string} params.existingScenes - Comma-separated list of scene titles
 * @returns {Promise<Object>} Arc psychology suggestions
 */
export async function suggestCharacterArc({ characterName, characterBio, arcType, existingScenes }) {
  const arcInfo = CHARACTER_ARC_TYPES[arcType];

  const prompt = `You are helping develop the psychological arc for a character in a story.

CHARACTER: ${characterName}
${characterBio ? `BACKGROUND: ${characterBio}` : ''}

ARC TYPE: ${arcInfo?.name || arcType}
${arcInfo?.description ? `Arc Description: ${arcInfo.description}` : ''}

${existingScenes ? `SCENES FEATURING THIS CHARACTER: ${existingScenes}` : ''}

Based on the arc type and character information, suggest the core psychological elements of their journey. Respond in JSON:

{
  "ghost": "The backstory wound or formative experience that shapes their worldview and drives their behavior (1-2 sentences)",
  "want": "What they consciously desire and pursue throughout the story (1 sentence)",
  "need": "What they actually need to grow/change, often unconscious (1 sentence)",
  "startingBelief": "The belief or worldview they hold at the story's beginning - for ${arcType === 'positive' ? 'positive arcs this is often a lie they believe' : arcType === 'negative' ? 'negative arcs this is often a truth they abandon' : arcType === 'flat' ? 'flat arcs this is a truth they embody' : 'this arc type'} (1 sentence)",
  "endingBelief": "The belief or worldview they hold at the story's end - for ${arcType === 'positive' ? 'positive arcs this is the truth they embrace' : arcType === 'negative' ? 'negative arcs this is the lie they succumb to' : arcType === 'flat' ? 'flat arcs this remains the truth they uphold' : 'this arc type'} (1 sentence)"
}

Make suggestions specific to the character if background is provided. Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 600 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error suggesting character arc:', error);
    throw error;
  }
}

/**
 * Develop a character arc with AI assistance
 * @param {Object} params - Character arc parameters
 * @param {Object} params.character - Character data from genealogy
 * @param {string} params.arcType - Type of arc (positive, negative, flat, etc.)
 * @param {string} params.storyPremise - The story premise
 * @param {string} params.role - Character's role in the story
 * @returns {Promise<Object>} Character arc development suggestions
 */
export async function developCharacterArc({ character, arcType, storyPremise, role }) {
  const arcInfo = CHARACTER_ARC_TYPES[arcType];

  const prompt = `You are helping develop a character arc for a story.

CHARACTER: ${character?.firstName || 'Unknown'} ${character?.lastName || ''}
${character?.titles?.length ? `Titles: ${character.titles.join(', ')}` : ''}
${character?.bio ? `Background: ${character.bio}` : ''}
${character?.traits?.length ? `Traits: ${character.traits.join(', ')}` : ''}

STORY PREMISE: ${storyPremise || 'Not specified'}

ROLE IN STORY: ${role || 'Main character'}

ARC TYPE: ${arcInfo?.name || arcType} - ${arcInfo?.description || ''}

Develop a compelling character arc. Respond in JSON:

{
  "arcSummary": "One paragraph describing the full arc",
  "startingBelief": "The lie they believe OR truth they embody at start",
  "endingBelief": "The truth they learn OR lie they embrace at end",
  "ghost": "The backstory wound that shapes their worldview",
  "want": "What they consciously desire",
  "need": "What they actually need (often different from want)",
  "milestones": [
    {
      "phase": "Beginning/Middle/End",
      "description": "What happens",
      "internalShift": "How their belief changes",
      "externalManifest": "How this shows in their behavior"
    }
  ],
  "keyMoments": [
    "Moment 1: Description",
    "Moment 2: Description",
    "Moment 3: Description"
  ],
  "relationshipImpacts": "How their arc affects relationships",
  "thematicConnection": "How their arc connects to story themes"
}

Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 1500 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error developing character arc:', error);
    throw error;
  }
}

// ==================== ANALYSIS FEATURES ====================

/**
 * Analyze story pacing and provide feedback
 * @param {number} storyPlanId - The story plan ID
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} Pacing analysis results
 */
export async function analyzePacing(storyPlanId, datasetId) {
  try {
    const scenes = await getScenePlans(storyPlanId, datasetId);

    if (scenes.length < 3) {
      return {
        status: 'insufficient_data',
        message: 'Need at least 3 scenes to analyze pacing',
        suggestions: ['Add more scenes to your plan to get pacing analysis']
      };
    }

    const sceneData = scenes.map((s, i) => ({
      position: i + 1,
      title: s.title,
      tension: s.tensionLevel || 5,
      pacing: s.pacingType || 'action'
    }));

    const prompt = `Analyze the pacing of this story based on scene tension levels and types.

SCENE SEQUENCE:
${sceneData.map(s => `${s.position}. "${s.title}" - Tension: ${s.tension}/10, Type: ${s.pacing}`).join('\n')}

Analyze for:
1. Tension curve (is it engaging?)
2. Pacing variety (action/reaction balance)
3. Momentum issues (plateaus, rushed sections)
4. Overall rhythm

Respond in JSON:

{
  "overallAssessment": "Good/Needs Work/Major Issues",
  "tensionAnalysis": {
    "curve": "rising/flat/erratic/well-paced",
    "averageTension": 5.5,
    "peakMoment": "Scene X",
    "valleyMoment": "Scene Y"
  },
  "pacingBalance": {
    "actionPercent": 40,
    "reactionPercent": 30,
    "transitionPercent": 20,
    "expositionPercent": 10,
    "assessment": "Well balanced / Needs more reaction scenes / etc"
  },
  "issues": [
    {
      "type": "plateau|rushed|imbalanced|missing_buildup",
      "location": "Scenes X-Y",
      "description": "What the issue is",
      "suggestion": "How to fix it"
    }
  ],
  "strengths": ["What's working well"],
  "priorityFix": "The single most important thing to address"
}

Respond ONLY with valid JSON.`;

    const response = await askGemini(prompt, {}, { temperature: 0.5, maxOutputTokens: 1500 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error analyzing pacing:', error);
    throw error;
  }
}

/**
 * Detect plot holes and inconsistencies
 * @param {number} storyPlanId - The story plan ID
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} Plot hole analysis results
 */
export async function detectPlotHoles(storyPlanId, datasetId) {
  try {
    const plan = await getStoryPlanComplete(storyPlanId, datasetId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    const sceneSummaries = plan.scenes?.map((s, i) =>
      `${i + 1}. "${s.title}": ${s.summary || 'No summary'} [Characters: ${s.charactersPresent?.join(', ') || 'unspecified'}]`
    ).join('\n') || 'No scenes planned yet';

    const threadSummaries = plan.threads?.map(t =>
      `- ${t.name} (${t.status}): Setup in scene ${t.setupSceneId || '?'}, payoff in ${t.payoffSceneId || '?'}`
    ).join('\n') || 'No threads defined';

    const prompt = `You are a story editor looking for plot holes and inconsistencies.

STORY PREMISE: ${plan.premise || 'Not specified'}

SCENES:
${sceneSummaries}

PLOT THREADS:
${threadSummaries}

Analyze this story plan for:
1. Unresolved setups (things introduced but never addressed)
2. Logic gaps (things that don't make sense)
3. Missing connections (jumps in logic or time)
4. Character consistency (do actions match established traits?)
5. Thread tracking (are all threads resolved?)

Respond in JSON:

{
  "overallHealth": "Solid/Minor Issues/Major Holes",
  "plotHoles": [
    {
      "severity": "critical|major|minor",
      "type": "unresolved_setup|logic_gap|missing_connection|character_inconsistency|dangling_thread",
      "location": "Scene X or Thread Y",
      "description": "What the issue is",
      "suggestion": "How to fix it"
    }
  ],
  "unresolvedSetups": ["Setup 1", "Setup 2"],
  "danglingThreads": ["Thread 1", "Thread 2"],
  "strengths": ["What's well-constructed"],
  "recommendations": ["Top 3 things to address"]
}

Be thorough but fair - not every ambiguity is a plot hole. Respond ONLY with valid JSON.`;

    const response = await askGemini(prompt, {}, { temperature: 0.4, maxOutputTokens: 1500 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error detecting plot holes:', error);
    throw error;
  }
}

/**
 * Get AI suggestions for strengthening a beat
 * @param {Object} beat - The beat to strengthen
 * @param {Object} context - Story context
 * @returns {Promise<Object>} Strengthening suggestions
 */
export async function strengthenBeat(beat, context = {}) {
  const prompt = `You are a story coach helping strengthen a story beat.

BEAT: ${beat.name}
TARGET POSITION: ${beat.targetPercentage}% through the story
CURRENT DESCRIPTION: ${beat.description || 'Not yet developed'}
STATUS: ${beat.status}

STORY CONTEXT:
Premise: ${context.premise || 'Not specified'}
Genre: ${context.genre || 'Fantasy'}

How can this beat be made more impactful? Respond in JSON:

{
  "currentStrength": "weak|moderate|strong",
  "suggestions": [
    {
      "aspect": "stakes|emotion|conflict|surprise|character",
      "current": "What it currently does (or lacks)",
      "improvement": "Specific way to make it stronger",
      "example": "Brief example of how this might play out"
    }
  ],
  "stakesEscalation": "How to raise the stakes at this beat",
  "emotionalDeepening": "How to add emotional resonance",
  "unexpectedTwist": "A potential twist for this beat",
  "connectionOpportunities": "How to better connect this to other story elements"
}

Respond ONLY with valid JSON.`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: 1024 });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Invalid response format');
  } catch (error) {
    logger.error('Error strengthening beat:', error);
    throw error;
  }
}

// ==================== QUICK SUGGESTIONS ====================

/**
 * Get a quick AI suggestion for the current context
 * @param {string} type - Type of suggestion needed
 * @param {Object} context - Current context
 * @returns {Promise<string>} Quick suggestion text
 */
export async function getQuickSuggestion(type, context = {}) {
  const prompts = {
    'conflict': `Suggest a compelling conflict for a scene with these elements:
Characters: ${context.characters || 'unspecified'}
Location: ${context.location || 'unspecified'}
Goal: ${context.goal || 'unspecified'}

Give one specific, actionable conflict idea in 2-3 sentences.`,

    'dialogue': `Suggest a powerful line of dialogue for this moment:
Character: ${context.character || 'unspecified'}
Situation: ${context.situation || 'unspecified'}
Emotion: ${context.emotion || 'unspecified'}

Give one memorable line of dialogue and brief context for when to use it.`,

    'twist': `Suggest an unexpected twist for this story point:
Current situation: ${context.situation || 'unspecified'}
Reader expectation: ${context.expectation || 'unspecified'}

Give one surprising but logical twist in 2-3 sentences.`,

    'tension': `How can tension be raised in this scene?
Current tension level: ${context.tensionLevel || 5}/10
Scene goal: ${context.goal || 'unspecified'}
Stakes: ${context.stakes || 'unspecified'}

Give 2-3 specific ways to increase tension.`,

    'transition': `Suggest a smooth transition between these scenes:
Previous scene: ${context.previousScene || 'unspecified'}
Next scene: ${context.nextScene || 'unspecified'}

Give a brief transition approach in 2-3 sentences.`
  };

  const prompt = prompts[type] || `Give a helpful suggestion for: ${type}. Context: ${JSON.stringify(context)}`;

  try {
    const response = await askGemini(prompt, {}, { temperature: 0.8, maxOutputTokens: 300 });
    return response.trim();
  } catch (error) {
    logger.error('Error getting quick suggestion:', error);
    throw error;
  }
}

// ==================== SYNOPSIS GENERATION ====================

/**
 * Generate a synopsis from the story plan
 * @param {number} storyPlanId - The story plan ID
 * @param {string} datasetId - Dataset ID
 * @param {string} length - 'short' (100 words), 'medium' (300 words), or 'long' (500 words)
 * @returns {Promise<string>} Generated synopsis
 */
export async function generateSynopsis(storyPlanId, datasetId, length = 'medium') {
  try {
    const plan = await getStoryPlanComplete(storyPlanId, datasetId);

    if (!plan) {
      throw new Error('Plan not found');
    }

    const wordCounts = { short: 100, medium: 300, long: 500 };
    const targetWords = wordCounts[length] || 300;

    const beatSummary = plan.beats?.map(b =>
      `- ${b.name}: ${b.description || 'TBD'}`
    ).join('\n') || 'No beats defined';

    const prompt = `Generate a ${targetWords}-word synopsis for this story.

PREMISE: ${plan.premise || 'Not specified'}
THEME: ${plan.theme || 'Not specified'}
GENRE: ${plan.genre?.join(', ') || 'Fantasy'}

KEY STORY BEATS:
${beatSummary}

Write an engaging synopsis that:
1. Hooks the reader immediately
2. Introduces the protagonist and their goal
3. Sets up the central conflict
4. Hints at the stakes without spoiling the ending
5. Captures the tone/genre

Write approximately ${targetWords} words. Write ONLY the synopsis, no additional commentary.`;

    const response = await askGemini(prompt, {}, { temperature: 0.7, maxOutputTokens: targetWords * 2 });
    return response.trim();
  } catch (error) {
    logger.error('Error generating synopsis:', error);
    throw error;
  }
}
