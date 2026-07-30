// src/services/aiAssistantService.js

/**
 * AI Assistant Service - Gemini API Integration
 *
 * Enhanced AI Assistant with:
 * - Full READ access to all LineageWeaver data
 * - Sophisticated analysis and troubleshooting capabilities
 * - Permission-gated editing with user approval
 * - Proposal generation for data modifications
 *
 * Uses Google's Gemini 2.5 Flash for AI responses.
 */

import {
  collectFullDataContext,
  formatDataForAI,
  analyzeDataForIssues
} from './aiDataService';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Make a request to Gemini API
 * @param {string} prompt - The user's question/request
 * @param {object} context - Additional context (genealogy data, codex entries, etc.)
 * @param {object} options - API options (temperature, max tokens, etc.)
 * @returns {Promise<string>} - AI response text
 */
// ============================================================================
// SHARED TRANSPORT
// ============================================================================

const DEFAULT_SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
];

const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Single entry point for every Gemini call.
 *
 * Replaces two byte-identical inline fetch blocks that had no timeout, no
 * abort, no retry, and inspected neither `finishReason` nor `blockReason` —
 * so a truncated response was reported as "Invalid response format" and a
 * safety block as the generic "No response generated".
 *
 * @param {Object} params
 * @param {string} params.prompt - Fully-built prompt text
 * @param {Object} [params.generationConfig]
 * @param {AbortSignal} [params.signal] - Caller cancellation
 * @param {number} [params.retries=2] - Retries on 429/5xx
 * @returns {Promise<{text: string, usage: Object|null, finishReason: string|undefined}>}
 */
async function callGemini({ prompt, generationConfig = {}, signal, retries = 2 }) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      topP: 0.95,
      topK: 40,
      ...generationConfig
    },
    safetySettings: DEFAULT_SAFETY_SETTINGS
  });

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Time out a hung request rather than leaving the caller's loading flag
    // stuck true forever. Combined with any caller-supplied signal.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header auth rather than ?key= in the URL, which lands in proxy
          // and devtools logs.
          'x-goog-api-key': GEMINI_API_KEY
        },
        body,
        signal: combined
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;

        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          const backoff = 500 * Math.pow(2, attempt);
          console.warn(`Gemini ${response.status}, retrying in ${backoff}ms…`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`Gemini API error (${response.status}): ${message}`);
      }

      const data = await response.json();

      // A safety block returns no candidates at all.
      const blockReason = data.promptFeedback?.blockReason;
      if (blockReason) {
        throw new Error(
          `Gemini blocked this request (${blockReason}). Fiction involving battle or ` +
          `intrigue can trip the default safety filters — try a shorter excerpt.`
        );
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      const finishReason = candidate?.finishReason;

      if (!text) {
        if (finishReason === 'SAFETY') {
          throw new Error('Gemini stopped generating for safety reasons. Try rephrasing or using a shorter excerpt.');
        }
        throw new Error(`No response generated from Gemini API${finishReason ? ` (${finishReason})` : ''}.`);
      }

      if (finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ Gemini response hit the token limit and was truncated.');
      }

      return { text, usage: data.usageMetadata || null, finishReason };
    } catch (error) {
      lastError = error;

      // Caller cancelled — don't retry, don't wrap.
      if (signal?.aborted) throw error;

      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        lastError = new Error(`Gemini request timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
      }

      const isNetwork = error instanceof TypeError;
      if (isNetwork && attempt < retries) {
        await sleep(500 * Math.pow(2, attempt));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError;
}

export async function askGemini(prompt, context = {}, options = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  const {
    temperature = 0.7,
    maxOutputTokens = 2048,
    topP = 0.95,
    topK = 40,
  } = options;

  const { signal, raw = false } = options;

  try {
    // `raw` skips the medieval-counsellor persona wrapper. Structured callers
    // that need parseable JSON back must use it — asking for machine-readable
    // JSON while instructing the model to speak like a herald is a conflict
    // the JSON-extraction regexes downstream then have to survive.
    const fullPrompt = raw ? prompt : buildPromptWithContext(prompt, context);

    const { text } = await callGemini({
      prompt: fullPrompt,
      generationConfig: { temperature, maxOutputTokens, topP, topK },
      signal
    });

    return text;
  } catch (error) {
    console.error('AI Assistant error:', error);
    throw error;
  }
}

/**
 * Build prompt with context for better responses
 */
function buildPromptWithContext(prompt, context) {
  let fullPrompt = `You are an AI assistant helping with a fantasy genealogy and worldbuilding tool called LineageWeaver. You speak with a slightly medieval/formal tone befitting a royal counselor, but remain helpful and clear.

User Request: ${prompt}`;

  // Add relevant context
  if (context.person) {
    fullPrompt += `\n\nPerson Context:\n${JSON.stringify(context.person, null, 2)}`;
  }

  if (context.house) {
    fullPrompt += `\n\nHouse Context:\n${JSON.stringify(context.house, null, 2)}`;
  }

  if (context.codexEntry) {
    fullPrompt += `\n\nCodex Entry Context:\n${JSON.stringify(context.codexEntry, null, 2)}`;
  }

  if (context.heraldry) {
    fullPrompt += `\n\nHeraldry Context:\n${JSON.stringify(context.heraldry, null, 2)}`;
  }

  if (context.customInstructions) {
    fullPrompt += `\n\nAdditional Instructions: ${context.customInstructions}`;
  }

  return fullPrompt;
}

/**
 * Specialized helpers for common LineageWeaver tasks
 */

export async function suggestMotto(houseName, houseContext = {}) {
  const prompt = `Suggest 5 compelling house mottos for "${houseName}". Each motto should be:
- 3-7 words long
- Suitable for a noble house in a fantasy setting
- Memorable and evocative
Format: Just list the mottos, one per line.`;

  return askGemini(prompt, { house: houseContext });
}

export async function generateCharacterBackstory(personData) {
  const prompt = `Generate a brief character backstory (2-3 paragraphs) for this person in a fantasy setting:
Name: ${personData.firstName} ${personData.lastName}
House: ${personData.houseName || 'Unknown'}
${personData.titles ? `Titles: ${personData.titles}` : ''}
${personData.dateOfBirth ? `Born: ${personData.dateOfBirth}` : ''}
${personData.dateOfDeath ? `Died: ${personData.dateOfDeath}` : ''}`;

  return askGemini(prompt, { person: personData });
}

export async function describeHeraldry(heraldryData) {
  const prompt = `Provide a vivid heraldic description (blazon) for this coat of arms:
${JSON.stringify(heraldryData, null, 2)}

Format the description in proper heraldic language.`;

  return askGemini(prompt, { heraldry: heraldryData });
}

export async function suggestRelationshipComplications(person1, person2) {
  const prompt = `Given these two characters in a fantasy genealogy, suggest 3 interesting plot complications or narrative hooks for their relationship:
Person 1: ${person1.firstName} ${person1.lastName}
Person 2: ${person2.firstName} ${person2.lastName}`;

  return askGemini(prompt, {
    person: person1,
    customInstructions: `Comparing with ${person2.firstName} ${person2.lastName}`
  });
}

export async function expandCodexEntry(entryTitle, currentContent) {
  const prompt = `Expand this Codex entry about "${entryTitle}" with additional worldbuilding details:

Current Content:
${currentContent}

Add 2-3 paragraphs that expand on the lore while staying consistent with the existing content.`;

  return askGemini(prompt, {
    codexEntry: { title: entryTitle, content: currentContent }
  });
}

// ==================== ENHANCED AI WITH FULL CONTEXT ====================

/**
 * Enhanced system prompt for proposal-aware AI
 *
 * This instructs the AI to:
 * - Analyze data integrity issues
 * - Format proposals in structured JSON blocks
 * - Always explain reasoning before proposing changes
 */
const ENHANCED_SYSTEM_PROMPT = `You are an AI counselor for LineageWeaver, a fantasy genealogy and worldbuilding tool. You speak with a slightly medieval/formal tone befitting a royal counselor or master herald.

CAPABILITIES:
- You have FULL READ ACCESS to the user's LineageWeaver data (people, houses, relationships, codex entries, heraldry, dignities)
- You can ANALYZE data for issues (missing relationships, date inconsistencies, orphaned entries)
- You can PROPOSE changes for user approval (you CANNOT make changes directly)

ANALYSIS TASKS:
When asked to analyze or find issues, look for:
1. Missing relationships (people with same last name in same house but no connection)
2. Date inconsistencies (birth after death, child older than parent)
3. Orphaned entities (codex entries referencing deleted people/houses)
4. Missing data (houses without heraldry, vacant dignities)
5. Age/life stage mismatches

PROPOSAL FORMAT:
When you want to suggest a data change, format it as a JSON block:

\`\`\`proposal
{
  "type": "create" | "update" | "delete" | "link",
  "entityType": "person" | "house" | "relationship" | "dignity" | "heraldry" | "codex",
  "entityId": <number or null for create>,
  "data": { <fields to set or update> },
  "reason": "<brief explanation>",
  "preview": {
    "title": "<short action title>",
    "beforeSummary": "<what currently exists or 'N/A' for create>",
    "afterSummary": "<what it will look like after>"
  }
}
\`\`\`

IMPORTANT RULES:
1. ALWAYS explain your reasoning BEFORE any proposal blocks
2. For DELETE proposals, include extra context about impact
3. Use exact field names from the data model
4. Include entityId for updates/deletes, leave null for creates
5. Never make changes automatically - all changes require user approval
6. Be thorough but concise in analysis
7. Group related proposals together when sensible

RESPONSE STYLE:
- Use medieval/formal language appropriate for a royal counselor
- Be helpful and clear despite the formal tone
- Reference specific data IDs when discussing issues
- Provide actionable suggestions`;

/**
 * Make a request to Gemini API with full data context
 *
 * @param {string} prompt - User's question/request
 * @param {Object} options - Request options
 * @param {boolean} options.includeAnalysis - Whether to include issue analysis
 * @param {boolean} options.enableProposals - Whether AI can suggest proposals
 * @param {string} options.datasetId - Dataset ID to pull data from
 * @param {Object} options.focusEntity - Optional focus { type, id }
 * @param {string} options.contextLevel - 'minimal' | 'standard' | 'full'
 * @param {Object} options.additionalContext - Extra context to include
 * @returns {Promise<Object>} - { text: string, proposals: Array }
 */
export async function askGeminiWithFullContext(prompt, options = {}) {
  const {
    includeAnalysis = false,
    enableProposals = true,
    datasetId = 'default',
    focusEntity = null,
    contextLevel = 'standard',
    additionalContext = {},
    temperature = 0.7,
    maxOutputTokens = 4096
  } = options;

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  try {
    console.log('🤖 AI Assistant: Collecting full data context...');

    // Collect full data context
    const dataContext = await collectFullDataContext(datasetId);

    // Format data for AI consumption
    const formattedData = formatDataForAI(dataContext, {
      contextLevel,
      focusEntity,
      maxTokens: 40000
    });

    // Optionally include issue analysis
    let issueAnalysis = '';
    if (includeAnalysis) {
      const issues = analyzeDataForIssues(dataContext);
      if (issues.length > 0) {
        issueAnalysis = '\n\n=== DETECTED ISSUES ===\n';
        issues.forEach((issue, idx) => {
          issueAnalysis += `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.message}\n`;
          issueAnalysis += `   Suggestion: ${issue.suggestion}\n`;
        });
      }
    }

    // Build the full prompt
    let fullPrompt = ENHANCED_SYSTEM_PROMPT;

    // Add proposal instruction if enabled
    if (enableProposals) {
      fullPrompt += '\n\nYou MAY suggest proposals using the ```proposal format when appropriate.';
    } else {
      fullPrompt += '\n\nDo NOT suggest proposals in this response - only provide analysis/information.';
    }

    // Add data context
    fullPrompt += `\n\n=== LINEAGEWEAVER DATA ===\n${formattedData}`;

    // Add issue analysis if requested
    if (issueAnalysis) {
      fullPrompt += issueAnalysis;
    }

    // Add any additional context
    if (additionalContext.person) {
      fullPrompt += `\n\nFocused Person:\n${JSON.stringify(additionalContext.person, null, 2)}`;
    }
    if (additionalContext.house) {
      fullPrompt += `\n\nFocused House:\n${JSON.stringify(additionalContext.house, null, 2)}`;
    }
    if (additionalContext.customInstructions) {
      fullPrompt += `\n\nAdditional Instructions: ${additionalContext.customInstructions}`;
    }

    // Add user prompt
    fullPrompt += `\n\n=== USER REQUEST ===\n${prompt}`;

    console.log('🤖 AI Assistant: Sending request to Gemini...');

    const { text, usage } = await callGemini({
      prompt: fullPrompt,
      generationConfig: { temperature, maxOutputTokens, topP: 0.95, topK: 40 },
      signal: options.signal
    });

    // usageMetadata was previously discarded. With a ~40k-token payload per
    // turn this is the only visibility into what the feature costs.
    if (usage) {
      console.log('🤖 Gemini tokens:', {
        prompt: usage.promptTokenCount,
        response: usage.candidatesTokenCount,
        total: usage.totalTokenCount
      });
    }

    // Parse proposals from response if enabled
    let proposals = [];
    if (enableProposals) {
      proposals = parseProposalsFromResponse(text);
    }

    console.log('🤖 AI Assistant: Response received', {
      textLength: text.length,
      proposalCount: proposals.length
    });

    return {
      text: cleanResponseText(text),
      proposals,
      rawText: text
    };

  } catch (error) {
    console.error('❌ AI Assistant error:', error);
    throw error;
  }
}

/**
 * Request specific analysis from the AI
 *
 * @param {string} analysisType - Type of analysis
 * @param {Object} targetEntity - Optional target entity
 * @param {Object} options - Additional options
 */
export async function requestAnalysis(analysisType, targetEntity = null, options = {}) {
  const prompts = {
    full: 'Please analyze my entire LineageWeaver dataset for any issues, inconsistencies, or areas that could be improved. Be thorough and provide specific suggestions.',

    relationships: 'Please analyze the relationships in my data. Look for: missing family connections between people with the same last name, isolated people who might need relationships, and any relationship inconsistencies.',

    heraldry: 'Please audit the heraldry in my data. Look for: houses without heraldry, people who might deserve personal arms, and any heraldry that might be incorrectly linked.',

    titles: 'Please analyze the dignities and titles in my data. Look for: vacant dignities, succession issues, people who hold titles but lack proper tenure records, and any hierarchy inconsistencies.',

    dates: 'Please analyze all dates in my data for consistency. Look for: birth dates after death dates, children born before parents, impossible age gaps, and any chronological errors.',

    duplicates: 'Please look for potential duplicate entries in my data. This includes: people who might be the same person entered twice, houses with similar names, and any other suspicious duplicates.'
  };

  let prompt = prompts[analysisType] || prompts.full;

  // Add target entity context if provided
  if (targetEntity) {
    const { type, id, name } = targetEntity;
    prompt = `Focus your analysis on ${type} "${name}" (ID: ${id}). ${prompt}`;
  }

  return askGeminiWithFullContext(prompt, {
    includeAnalysis: true,
    enableProposals: true,
    ...options
  });
}

/**
 * Parse proposal blocks from AI response
 */
function parseProposalsFromResponse(responseText) {
  const proposals = [];
  const proposalRegex = /```proposal\n?([\s\S]*?)```/g;
  let match;

  while ((match = proposalRegex.exec(responseText)) !== null) {
    try {
      const proposalJson = match[1].trim();
      const proposal = JSON.parse(proposalJson);

      // Validate required fields
      if (proposal.type && proposal.entityType) {
        // Add metadata
        proposal.id = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        proposal.status = 'pending';
        proposal.createdAt = new Date().toISOString();

        proposals.push(proposal);
      }
    } catch (err) {
      console.warn('Failed to parse proposal block:', err.message);
    }
  }

  return proposals;
}

/**
 * Remove proposal blocks from response text for cleaner display
 */
function cleanResponseText(responseText) {
  // Remove proposal blocks but leave the rest
  return responseText.replace(/```proposal\n?[\s\S]*?```/g, '').trim();
}

/**
 * Get a data summary for quick AI context
 */
export async function getDataSummary(datasetId = 'default') {
  const dataContext = await collectFullDataContext(datasetId);

  return {
    statistics: dataContext.statistics,
    houses: dataContext.houses.map(h => ({
      id: h.id,
      name: h.houseName,
      memberCount: dataContext.people.filter(p => p.houseId === h.id).length
    })),
    issueCount: analyzeDataForIssues(dataContext).length
  };
}

export default {
  // Original functions
  askGemini,
  suggestMotto,
  generateCharacterBackstory,
  describeHeraldry,
  suggestRelationshipComplications,
  expandCodexEntry,

  // Enhanced functions with full context
  askGeminiWithFullContext,
  requestAnalysis,
  getDataSummary
};
