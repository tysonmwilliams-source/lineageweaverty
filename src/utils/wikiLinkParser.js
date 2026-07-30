/**
 * Wiki-Link Parser Utility - ENHANCED
 * 
 * Converts markdown content to HTML and processes [[wiki-link]] syntax.
 * Automatically creates codexLinks records for discovered links.
 * 
 * NEW IN THIS VERSION:
 * - getContextSnippet() - Extract sentence containing wiki-link
 * - Enhanced for backlinks panel support
 * 
 * HOW IT WORKS:
 * 1. Parse markdown → HTML using 'marked' library
 * 2. Find all [[Entry Name]] patterns
 * 3. Look up entries in database by title
 * 4. Replace with clickable links (or mark as broken)
 * 5. Auto-create link records in codexLinks table
 * 
 * REQUIRES: npm install marked
 */

import { marked } from 'marked';
import { 
  getAllEntries, 
  createLink, 
  getOutgoingLinks,
  getEntry
} from '../services/codexService';
import { logger } from './logger';

/**
 * Parse markdown content with wiki-link processing
 *
 * @param {string} markdown - Raw markdown text with [[wiki-links]]
 * @param {number} sourceEntryId - ID of the entry containing this content (for auto-linking)
 * @param {string} [datasetId] - Dataset to resolve links against.
 *
 *   This parameter did not exist while `CodexEntryView.jsx:183` was already
 *   passing it as a third argument — so it was silently dropped. Every entry in a
 *   non-default world resolved its wiki-links against the *default* database
 *   (making valid links render as broken), and the links this function
 *   auto-creates were written to the default database too, which is the phantom-
 *   database bug class from Phase 0.
 * @returns {Promise<string>} - HTML with processed wiki-links
 */
export async function parseWikiLinks(markdown, sourceEntryId = null, datasetId = undefined) {
  if (!markdown) return '';

  try {
    // Step 1: Convert markdown to HTML
    const html = marked.parse(markdown);
    
    // Step 2: Find all [[Entry Name]] patterns
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    const matches = [...html.matchAll(wikiLinkPattern)];
    
    if (matches.length === 0) {
      return html; // No wiki-links found
    }
    
    // Step 3: Get all entries from database (for lookup)
    const allEntries = await getAllEntries(datasetId);
    
    // Create a lookup map: title → entry
    const entryMap = new Map();
    allEntries.forEach(entry => {
      // Store both exact title and lowercase for case-insensitive matching
      entryMap.set(entry.title.toLowerCase(), entry);
    });
    
    // Step 4: Get existing outgoing links (if sourceEntryId provided)
    let existingLinks = [];
    if (sourceEntryId) {
      existingLinks = await getOutgoingLinks(sourceEntryId, datasetId);
    }
    
    // Create a Set of existing link pairs for faster lookup
    const existingLinkSet = new Set(
      existingLinks.map(link => `${link.sourceId}-${link.targetId}`)
    );
    
    // Step 5: Process each wiki-link
    let processedHtml = html;
    const linksToCreate = [];
    
    for (const match of matches) {
      const fullMatch = match[0]; // "[[Entry Name]]"
      const linkText = match[1].trim(); // "Entry Name"
      
      // Check for alias syntax: [[Display Text|Actual Entry]]
      let displayText = linkText;
      let searchText = linkText;
      
      if (linkText.includes('|')) {
        const parts = linkText.split('|');
        displayText = parts[0].trim();
        searchText = parts[1].trim();
      }
      
      // Look up entry (case-insensitive)
      const targetEntry = entryMap.get(searchText.toLowerCase());
      
      if (targetEntry) {
        // Entry exists - create clickable link
        const linkHtml = `<a href="/codex/entry/${targetEntry.id}" class="wiki-link" data-entry-id="${targetEntry.id}">${displayText}</a>`;
        processedHtml = processedHtml.replace(fullMatch, linkHtml);
        
        // Track link for auto-creation
        if (sourceEntryId && targetEntry.id !== sourceEntryId) {
          // Check if link already exists using the Set
          const linkKey = `${sourceEntryId}-${targetEntry.id}`;
          
          if (!existingLinkSet.has(linkKey)) {
            linksToCreate.push({
              sourceId: sourceEntryId,
              targetId: targetEntry.id,
              type: 'wiki-reference',
              label: displayText !== targetEntry.title ? displayText : null,
              bidirectional: true
            });
            
            // Add to Set so we don't create duplicates within this same parse
            existingLinkSet.add(linkKey);
          }
        }
      } else {
        // Entry doesn't exist - create broken link
        const brokenLinkHtml = `<span class="wiki-link-broken" title="Entry not found: ${searchText}">${displayText}</span>`;
        processedHtml = processedHtml.replace(fullMatch, brokenLinkHtml);
      }
    }
    
    // Step 6: Auto-create new links (future hook for knowledge graph)
    if (linksToCreate.length > 0) {
      await Promise.all(
        linksToCreate.map(linkData => createLink(linkData, datasetId))
      );
      logger.log(`Auto-created ${linksToCreate.length} wiki-links from entry ${sourceEntryId}`);
    }
    
    return processedHtml;
    
  } catch (error) {
    logger.error('Error parsing wiki-links:', error);
    // Fallback: just parse markdown without wiki-links
    return marked.parse(markdown);
  }
}

/**
 * NEW: Get context snippet around a wiki-link
 * Extracts the sentence containing the wiki-link for preview
 * 
 * @param {string} content - Raw markdown content
 * @param {string} targetTitle - Title of the entry being linked to
 * @returns {string} - Sentence containing the wiki-link, or empty string
 */
export function getContextSnippet(content, targetTitle) {
  if (!content || !targetTitle) return '';
  
  try {
    // Find the wiki-link pattern for this specific entry
    // Handle both [[Title]] and [[Alias|Title]] formats
    const patterns = [
      new RegExp(`\\[\\[${escapeRegex(targetTitle)}\\]\\]`, 'i'),
      new RegExp(`\\[\\[[^|]+\\|${escapeRegex(targetTitle)}\\]\\]`, 'i')
    ];
    
    let linkPosition = -1;
    let matchedPattern = null;
    
    // Find which pattern matches
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        linkPosition = match.index;
        matchedPattern = match[0];
        break;
      }
    }
    
    if (linkPosition === -1) return '';
    
    // Extract sentence containing the link
    // Look backwards for sentence start
    let sentenceStart = linkPosition;
    while (sentenceStart > 0) {
      const char = content[sentenceStart - 1];
      // Sentence boundaries: period, question mark, exclamation, or start of text
      if (char === '.' || char === '?' || char === '!' || char === '\n') {
        break;
      }
      sentenceStart--;
    }
    
    // Look forward for sentence end
    let sentenceEnd = linkPosition + matchedPattern.length;
    while (sentenceEnd < content.length) {
      const char = content[sentenceEnd];
      if (char === '.' || char === '?' || char === '!') {
        sentenceEnd++;
        break;
      }
      if (char === '\n' && content[sentenceEnd + 1] === '\n') {
        break; // Double newline = paragraph break
      }
      sentenceEnd++;
    }
    
    // Extract and clean the sentence
    let sentence = content.substring(sentenceStart, sentenceEnd).trim();
    
    // Remove markdown formatting for cleaner preview
    sentence = sentence
      .replace(/^[#\s]+/, '') // Remove heading markers
      .replace(/\*\*/g, '')   // Remove bold
      .replace(/\*/g, '')     // Remove italic
      .replace(/__/g, '')     // Remove bold
      .replace(/_/g, '')      // Remove italic
      .trim();
    
    // Limit length if very long
    if (sentence.length > 200) {
      sentence = sentence.substring(0, 200) + '...';
    }
    
    return sentence;
    
  } catch (error) {
    logger.error('Error extracting context snippet:', error);
    return '';
  }
}

/**
 * Helper: Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract all wiki-link references from markdown (without rendering)
 * Useful for validation or preview
 * 
 * @param {string} markdown - Raw markdown text
 * @returns {Array<Object>} - Array of { text, isAlias, display, search }
 */
export function extractWikiLinks(markdown) {
  if (!markdown) return [];
  
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
  const matches = [...markdown.matchAll(wikiLinkPattern)];
  
  return matches.map(match => {
    const linkText = match[1].trim();
    
    if (linkText.includes('|')) {
      const parts = linkText.split('|');
      return {
        text: linkText,
        isAlias: true,
        display: parts[0].trim(),
        search: parts[1].trim()
      };
    }
    
    return {
      text: linkText,
      isAlias: false,
      display: linkText,
      search: linkText
    };
  });
}

/**
 * Validate wiki-links against database
 * Returns list of broken links
 *
 * @param {string} markdown - Raw markdown text
 * @param {string} [datasetId] - Dataset to validate against. Required in
 *   practice: without it getAllEntries() silently reads the *default* database,
 *   so every link in a non-default world would report as broken.
 * @returns {Promise<Array<string>>} - Array of entry names that don't exist
 */
export async function validateWikiLinks(markdown, datasetId) {
  const links = extractWikiLinks(markdown);
  if (links.length === 0) return [];

  const allEntries = await getAllEntries(datasetId);
  const entryTitles = new Set(
    allEntries.map(e => e.title.toLowerCase())
  );
  
  const brokenLinks = links.filter(link => {
    return !entryTitles.has(link.search.toLowerCase());
  });
  
  return brokenLinks.map(link => link.search);
}

/**
 * Get suggested entries for auto-complete
 * Used in markdown editor for type-ahead suggestions
 * 
 * @param {string} partialText - Partial entry name being typed
 * @param {number} limit - Maximum number of suggestions
 * @param {string} [datasetId] - Dataset to search. See validateWikiLinks for why
 *   omitting this reads the wrong database.
 * @returns {Promise<Array<Object>>} - Array of matching entries
 */
export async function getSuggestedEntries(partialText, limit = 10, datasetId) {
  if (!partialText || partialText.length < 2) return [];

  const allEntries = await getAllEntries(datasetId);
  const searchLower = partialText.toLowerCase();
  
  // Fuzzy match: title starts with OR contains the search text
  const matches = allEntries.filter(entry => {
    const titleLower = entry.title.toLowerCase();
    return titleLower.startsWith(searchLower) || titleLower.includes(searchLower);
  });
  
  // Sort: exact matches first, then starts-with, then contains
  matches.sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    
    // Exact match (case-insensitive)
    if (aTitle === searchLower) return -1;
    if (bTitle === searchLower) return 1;
    
    // Starts with
    const aStarts = aTitle.startsWith(searchLower);
    const bStarts = bTitle.startsWith(searchLower);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    
    // Alphabetical
    return aTitle.localeCompare(bTitle);
  });
  
  return matches.slice(0, limit);
}

/**
 * Find the wiki-link the caret is currently inside, for autocomplete.
 *
 * Scans back from the caret to the nearest `[[` and gives up if it crosses a
 * `]]` or a newline — so a already-closed link earlier in the paragraph, or a
 * stray bracket on a previous line, doesn't trigger suggestions.
 *
 * Kept here rather than inline in the form so it can be tested, and so the
 * TipTap editor can reuse it.
 *
 * @param {string} text - Full textarea contents
 * @param {number} caret - Caret offset (selectionStart)
 * @returns {{start: number, end: number, query: string}|null}
 */
export function findLinkSpanAtCaret(text, caret) {
  if (typeof text !== 'string' || typeof caret !== 'number' || caret < 0) return null;

  const open = text.lastIndexOf('[[', caret - 1);
  if (open === -1) return null;

  // The caret must be past the closing bracket of the `[[` token itself.
  // Without this, a caret at 0 makes lastIndexOf search from index 0 (JS clamps
  // a negative fromIndex), matching a `[[` that starts *at* the caret and
  // yielding start=2, end=0 — a backwards span that corrupts the text when a
  // suggestion is inserted into it.
  if (caret < open + 2) return null;

  const between = text.slice(open + 2, caret);
  if (between.includes(']]') || between.includes('\n')) return null;

  return { start: open + 2, end: caret, query: between };
}

export default {
  parseWikiLinks,
  extractWikiLinks,
  validateWikiLinks,
  getSuggestedEntries,
  findLinkSpanAtCaret,
  getContextSnippet
};
