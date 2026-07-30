/**
 * canonCheckService.js - Canon Validation Service
 *
 * Validates writing content against established lore/data in LineageWeaver.
 * Provides both rule-based (fast) and AI-powered (deep) validation.
 */

import { getAllPeople, getAllHouses } from './database';
import { getAllEntries as getAllCodexEntries } from './codexService';
import { getAllDignities, getTenuresForPerson } from './dignityService';
import { getLinksByWriting } from './writingLinkService';
import { getEntityById, ENTITY_TYPES } from './entitySearchService';
import { askGemini } from './aiAssistantService';
import { parseYear } from '../utils/parseYear';
import { logger } from '../utils/logger';

// ==================== ISSUE TYPES ====================

export const ISSUE_TYPES = {
  ERROR: 'error',       // Definite canon violation
  WARNING: 'warning',   // Potential issue, needs review
  INFO: 'info'          // Informational note
};

export const ISSUE_CATEGORIES = {
  ENTITY_MISSING: 'entity_missing',
  TIMELINE_CONFLICT: 'timeline_conflict',
  RELATIONSHIP_ERROR: 'relationship_error',
  DIGNITY_CONFLICT: 'dignity_conflict',
  PLOT_INCONSISTENCY: 'plot_inconsistency',
  CHARACTER_TRAIT: 'character_trait',
  WORLD_RULE: 'world_rule'
};

// ==================== RULE-BASED VALIDATION ====================

/**
 * Run rule-based canon checks
 * Fast, local validation that doesn't require AI
 *
 * @param {number} writingId - Writing ID
 * @param {Object} content - TipTap JSON content
 * @param {string} plainText - Plain text content
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Array>} Array of issues found
 */
export async function runRuleBasedChecks(writingId, content, plainText, datasetId) {
  const issues = [];

  try {
    // Get all wiki-links in the writing
    const links = await getLinksByWriting(writingId, datasetId);

    // Check 1: Verify all linked entities still exist
    const entityIssues = await checkLinkedEntitiesExist(links, datasetId);
    issues.push(...entityIssues);

    // Check 2: Look for unlinked entity mentions in text
    const unlinkedIssues = await checkUnlinkedMentions(plainText, links, datasetId);
    issues.push(...unlinkedIssues);

    // Check 3: Check for deceased characters being active (if timeline info available)
    const lifespanIssues = await checkCharacterLifespans(links, datasetId);
    issues.push(...lifespanIssues);

    // Check 4: Check dignity tenure conflicts
    const dignityIssues = await checkDignityTenures(links, datasetId);
    issues.push(...dignityIssues);

  } catch (error) {
    logger.error('Rule-based check failed:', error);
    issues.push({
      id: `error-${Date.now()}`,
      type: ISSUE_TYPES.WARNING,
      category: 'system',
      title: 'Validation Error',
      description: 'Some validation checks could not be completed.',
      details: error.message
    });
  }

  return issues;
}

/**
 * Check that all linked entities still exist in the database
 */
async function checkLinkedEntitiesExist(links, datasetId) {
  const issues = [];

  for (const link of links) {
    const entity = await getEntityById(link.targetType, link.targetId, datasetId);

    if (!entity) {
      issues.push({
        id: `missing-${link.targetType}-${link.targetId}`,
        type: ISSUE_TYPES.ERROR,
        category: ISSUE_CATEGORIES.ENTITY_MISSING,
        title: 'Missing Entity',
        description: `The referenced ${link.targetType} "${link.displayText}" no longer exists in your data.`,
        entityType: link.targetType,
        entityId: link.targetId,
        displayText: link.displayText,
        suggestion: 'Update or remove this reference.'
      });
    }
  }

  return issues;
}

/**
 * Check for mentions of entities that aren't linked
 */
async function checkUnlinkedMentions(plainText, existingLinks, datasetId) {
  const issues = [];

  if (!plainText || plainText.length < 10) return issues;

  // Get all people and houses to check against
  const [people, houses] = await Promise.all([
    getAllPeople(datasetId),
    getAllHouses(datasetId)
  ]);

  // Build set of already-linked entity names
  const linkedNames = new Set(existingLinks.map(l => l.displayText?.toLowerCase()).filter(Boolean));

  // Check for people mentions
  for (const person of people) {
    const name = formatPersonName(person);
    if (name.length < 3) continue; // Skip very short names

    // Check if this person is mentioned but not linked
    const nameRegex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
    if (nameRegex.test(plainText) && !linkedNames.has(name.toLowerCase())) {
      issues.push({
        id: `unlinked-person-${person.id}`,
        type: ISSUE_TYPES.INFO,
        category: 'unlinked_mention',
        title: 'Unlinked Character',
        description: `"${name}" is mentioned but not linked.`,
        entityType: ENTITY_TYPES.PERSON,
        entityId: person.id,
        entityName: name,
        suggestion: 'Consider creating a [[wiki-link]] for this character.'
      });
    }
  }

  // Check for house mentions
  for (const house of houses) {
    if (!house.houseName || house.houseName.length < 3) continue;

    const houseRegex = new RegExp(`\\b(House\\s+)?${escapeRegex(house.houseName)}\\b`, 'gi');
    if (houseRegex.test(plainText) && !linkedNames.has(house.houseName.toLowerCase())) {
      issues.push({
        id: `unlinked-house-${house.id}`,
        type: ISSUE_TYPES.INFO,
        category: 'unlinked_mention',
        title: 'Unlinked House',
        description: `"House ${house.houseName}" is mentioned but not linked.`,
        entityType: ENTITY_TYPES.HOUSE,
        entityId: house.id,
        entityName: house.houseName,
        suggestion: 'Consider creating a [[wiki-link]] for this house.'
      });
    }
  }

  // Limit unlinked suggestions to avoid overwhelming
  return issues.slice(0, 5);
}

/**
 * Check character lifespan conflicts
 */
async function checkCharacterLifespans(links, datasetId) {
  const issues = [];

  const personLinks = links.filter(l => l.targetType === ENTITY_TYPES.PERSON);
  const people = await getAllPeople(datasetId);
  const peopleMap = new Map(people.map(p => [p.id, p]));

  // "Historical" has to be relative to the world's own timeline, not the real
  // calendar — a world dated 1680-2016 has nothing to do with the year the
  // author happens to be writing in.
  const latestYear = people.reduce((max, p) => {
    const d = parseYear(p.dateOfDeath);
    const b = parseYear(p.dateOfBirth);
    return Math.max(max, d ?? 0, b ?? 0);
  }, 0);

  for (const link of personLinks) {
    const person = peopleMap.get(link.targetId);
    if (!person) continue;

    const deathYear = parseYear(person.dateOfDeath);
    const birthYear = parseYear(person.dateOfBirth);

    // Internally impossible dates are a hard error regardless of era.
    if (deathYear !== null && birthYear !== null && deathYear < birthYear) {
      issues.push({
        id: `impossible-lifespan-${person.id}`,
        type: ISSUE_TYPES.ERROR,
        category: ISSUE_CATEGORIES.TIMELINE_CONFLICT,
        title: 'Impossible Lifespan',
        description: `${formatPersonName(person)} is recorded as dying in ${deathYear}, before their birth in ${birthYear}.`,
        entityType: ENTITY_TYPES.PERSON,
        entityId: person.id
      });
      continue;
    }

    // Referenced character died long before the world's present day.
    if (deathYear !== null && latestYear > 0 && deathYear < latestYear - 100) {
      issues.push({
        id: `deceased-${person.id}`,
        type: ISSUE_TYPES.INFO,
        category: ISSUE_CATEGORIES.TIMELINE_CONFLICT,
        title: 'Historical Character',
        description: `${formatPersonName(person)} died in ${deathYear}, more than a century before the latest events in your world (${latestYear}). Ensure your story's timeline is consistent.`,
        entityType: ENTITY_TYPES.PERSON,
        entityId: person.id,
        deathYear
      });
    }
  }

  return issues;
}

/**
 * Check dignity tenure conflicts
 */
async function checkDignityTenures(links, datasetId) {
  const issues = [];

  const dignityLinks = links.filter(l => l.targetType === ENTITY_TYPES.DIGNITY);
  const personLinks = links.filter(l => l.targetType === ENTITY_TYPES.PERSON);

  if (dignityLinks.length === 0 || personLinks.length === 0) {
    return issues;
  }

  // Get all dignities and their current holders
  const dignities = await getAllDignities(datasetId);
  const dignityMap = new Map(dignities.map(d => [d.id, d]));

  for (const dignityLink of dignityLinks) {
    const dignity = dignityMap.get(dignityLink.targetId);
    if (!dignity) continue;

    // Check for tenure information
    // This is informational - helps writers track who holds what titles
    issues.push({
      id: `dignity-info-${dignity.id}`,
      type: ISSUE_TYPES.INFO,
      category: ISSUE_CATEGORIES.DIGNITY_CONFLICT,
      title: 'Title Reference',
      description: `"${dignity.name}" is referenced. Current holder and historical tenures can be viewed in the Dignities section.`,
      entityType: ENTITY_TYPES.DIGNITY,
      entityId: dignity.id
    });
  }

  return issues.slice(0, 3); // Limit informational messages
}

// ==================== AI-POWERED VALIDATION ====================

/**
 * Prepare context for AI canon validation
 * Collects relevant data for the AI to analyze
 */
export async function prepareAIValidationContext(writingId, content, plainText, datasetId) {
  const links = await getLinksByWriting(writingId, datasetId);

  // Get all referenced entities with full details
  const referencedEntities = {
    people: [],
    houses: [],
    codex: [],
    dignities: []
  };

  for (const link of links) {
    const entity = await getEntityById(link.targetType, link.targetId, datasetId);
    if (entity) {
      switch (link.targetType) {
        case ENTITY_TYPES.PERSON:
          referencedEntities.people.push(entity.data);
          break;
        case ENTITY_TYPES.HOUSE:
          referencedEntities.houses.push(entity.data);
          break;
        case ENTITY_TYPES.CODEX:
          referencedEntities.codex.push(entity.data);
          break;
        case ENTITY_TYPES.DIGNITY:
          referencedEntities.dignities.push(entity.data);
          break;
      }
    }
  }

  return {
    writingText: plainText,
    referencedEntities,
    linkCount: links.length
  };
}

/**
 * Build the prompt for AI canon checking
 */
export function buildCanonCheckPrompt(context) {
  const { writingText, referencedEntities } = context;

  // Format entities for the prompt
  let entitiesContext = '';

  if (referencedEntities.people.length > 0) {
    entitiesContext += '\n\nREFERENCED CHARACTERS:\n';
    for (const person of referencedEntities.people) {
      const name = formatPersonName(person);
      entitiesContext += `- ${name}`;
      if (person.epithet) entitiesContext += ` (${person.epithet})`;
      if (person.dateOfBirth) entitiesContext += `, born ${person.dateOfBirth}`;
      if (person.dateOfDeath) entitiesContext += `, died ${person.dateOfDeath}`;
      entitiesContext += '\n';
    }
  }

  if (referencedEntities.houses.length > 0) {
    entitiesContext += '\n\nREFERENCED HOUSES:\n';
    for (const house of referencedEntities.houses) {
      entitiesContext += `- House ${house.houseName}`;
      if (house.motto) entitiesContext += ` (Motto: "${house.motto}")`;
      entitiesContext += '\n';
    }
  }

  if (referencedEntities.codex.length > 0) {
    entitiesContext += '\n\nREFERENCED CODEX ENTRIES:\n';
    for (const entry of referencedEntities.codex) {
      entitiesContext += `- ${entry.title} (${entry.category || 'uncategorized'})\n`;
    }
  }

  if (referencedEntities.dignities.length > 0) {
    entitiesContext += '\n\nREFERENCED DIGNITIES/TITLES:\n';
    for (const dignity of referencedEntities.dignities) {
      entitiesContext += `- ${dignity.name} (${dignity.type || 'title'})\n`;
    }
  }

  return `You are a canon consistency checker for a world-building/genealogy application.
Analyze the following creative writing excerpt for potential inconsistencies with the established lore.

${entitiesContext}

WRITING EXCERPT:
"""
${writingText.slice(0, 3000)}
"""

Identify any potential canon issues such as:
1. Timeline conflicts (characters alive at wrong times)
2. Relationship inconsistencies
3. Title/dignity errors
4. Contradictions with established lore

For each issue found, provide:
- Type: error, warning, or info
- Title: Brief issue name
- Description: What the issue is
- Suggestion: How to fix it

If no issues are found, say so clearly.

Respond in JSON format:
{
  "issues": [
    {
      "type": "warning",
      "title": "Issue Title",
      "description": "Description of the issue",
      "suggestion": "How to fix"
    }
  ],
  "summary": "Brief overall assessment"
}`;
}

// ==================== AI-POWERED VALIDATION ====================

/**
 * Run AI-powered canon check
 * Deep analysis using Gemini AI to find inconsistencies
 *
 * @param {number} writingId - Writing ID
 * @param {Object} content - TipTap JSON content
 * @param {string} plainText - Plain text content
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Array>} Array of issues found
 */
export async function runAICanonCheck(writingId, content, plainText, datasetId) {
  const issues = [];

  try {
    // Prepare context for AI
    const context = await prepareAIValidationContext(writingId, content, plainText, datasetId);

    // Build the prompt
    const prompt = buildCanonCheckPrompt(context);

    // Call Gemini API
    logger.log('🤖 Running AI canon check...');
    const response = await askGemini(prompt, {}, {
      temperature: 0.3, // Lower temperature for more focused analysis
      maxOutputTokens: 2048
    });

    // Parse the JSON response
    const parsedIssues = parseAIResponse(response);
    issues.push(...parsedIssues);

    logger.log(`🤖 AI canon check complete: ${issues.length} issues found`);

  } catch (error) {
    logger.error('AI canon check failed:', error);
    issues.push({
      id: `ai-error-${Date.now()}`,
      type: ISSUE_TYPES.WARNING,
      category: 'system',
      title: 'AI Check Failed',
      description: 'Could not complete AI-powered canon check.',
      details: error.message,
      suggestion: 'Check your API key configuration or try again later.'
    });
  }

  return issues;
}

/**
 * Parse AI response and extract issues
 */
function parseAIResponse(response) {
  const issues = [];

  try {
    // Try to extract JSON from response
    // The AI might return JSON directly or wrapped in markdown code blocks
    let jsonStr = response;

    // Check for markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to find JSON object in the response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.issues && Array.isArray(parsed.issues)) {
      for (const issue of parsed.issues) {
        issues.push({
          id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: issue.type || ISSUE_TYPES.WARNING,
          category: 'ai_analysis',
          title: issue.title || 'Canon Issue',
          description: issue.description || 'AI detected a potential issue.',
          suggestion: issue.suggestion || null,
          details: issue.details || null,
          source: 'ai'
        });
      }
    }

    // Add summary if provided
    if (parsed.summary && issues.length === 0) {
      issues.push({
        id: `ai-summary-${Date.now()}`,
        type: ISSUE_TYPES.INFO,
        category: 'ai_analysis',
        title: 'AI Analysis Complete',
        description: parsed.summary,
        source: 'ai'
      });
    }

  } catch (parseError) {
    logger.warn('Could not parse AI response as JSON, extracting text...');

    // If JSON parsing fails, create a single info issue with the response
    if (response && response.length > 0) {
      // Check if the response indicates no issues
      const noIssuesPhrases = ['no issues', 'no canon issues', 'consistent', 'no inconsistencies'];
      const hasNoIssues = noIssuesPhrases.some(phrase =>
        response.toLowerCase().includes(phrase)
      );

      if (hasNoIssues) {
        issues.push({
          id: `ai-clean-${Date.now()}`,
          type: ISSUE_TYPES.INFO,
          category: 'ai_analysis',
          title: 'AI Analysis Complete',
          description: 'No canon issues detected in your writing.',
          source: 'ai'
        });
      } else {
        // Extract any meaningful feedback
        issues.push({
          id: `ai-feedback-${Date.now()}`,
          type: ISSUE_TYPES.INFO,
          category: 'ai_analysis',
          title: 'AI Feedback',
          description: response.slice(0, 500) + (response.length > 500 ? '...' : ''),
          source: 'ai'
        });
      }
    }
  }

  return issues;
}

/**
 * Run combined check (rule-based + AI)
 *
 * @param {number} writingId - Writing ID
 * @param {Object} content - TipTap JSON content
 * @param {string} plainText - Plain text content
 * @param {string} datasetId - Dataset ID
 * @param {Object} options - Options
 * @param {boolean} options.includeAI - Whether to include AI check
 * @returns {Promise<Array>} Array of issues found
 */
export async function runFullCanonCheck(writingId, content, plainText, datasetId, options = {}) {
  const { includeAI = true } = options;

  // Always run rule-based checks first (fast)
  const ruleIssues = await runRuleBasedChecks(writingId, content, plainText, datasetId);

  if (!includeAI) {
    return ruleIssues;
  }

  // Run AI check for deeper analysis
  const aiIssues = await runAICanonCheck(writingId, content, plainText, datasetId);

  // Combine and deduplicate issues
  // AI issues that overlap with rule-based issues can be merged
  const allIssues = [...ruleIssues];

  for (const aiIssue of aiIssues) {
    // Check if this issue is already covered by a rule-based issue
    const isDuplicate = ruleIssues.some(ruleIssue =>
      ruleIssue.title === aiIssue.title ||
      (ruleIssue.entityId && aiIssue.entityId && ruleIssue.entityId === aiIssue.entityId)
    );

    if (!isDuplicate) {
      allIssues.push(aiIssue);
    }
  }

  return allIssues;
}

// ==================== HELPER FUNCTIONS ====================

function formatPersonName(person) {
  const parts = [];
  if (person.firstName) parts.push(person.firstName);
  if (person.middleName) parts.push(person.middleName);
  if (person.lastName) parts.push(person.lastName);
  if (person.suffix) parts.push(person.suffix);
  return parts.join(' ') || 'Unnamed Person';
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ==================== EXPORTS ====================

export default {
  ISSUE_TYPES,
  ISSUE_CATEGORIES,
  runRuleBasedChecks,
  runAICanonCheck,
  runFullCanonCheck,
  prepareAIValidationContext,
  buildCanonCheckPrompt
};
