/**
 * biographyStatus.js - Biography Content Status Utility
 * 
 * TREE-CODEX INTEGRATION - Phase 2: Enhanced Integration
 * 
 * PURPOSE:
 * Analyzes Codex entry content to determine its "completion" status.
 * This helps users quickly identify which biographies need attention.
 * 
 * STATUS LEVELS:
 * - EMPTY (📝): No content at all - needs to be written
 * - STUB (📄): Brief content (1-50 words) - placeholder or notes
 * - WRITTEN (📖): Substantial content (50+ words) - proper biography
 * 
 * The word count thresholds are chosen based on typical biography length:
 * - 50 words is roughly 2-3 sentences - a minimal stub
 * - 50+ words indicates someone has actually written content
 */

/**
 * The fields this module reads off a Codex entry.
 *
 * Narrower than `CodexEntry` on purpose: biography status is computed from
 * prose length and a couple of flags, and saying so keeps the helper usable
 * against anything that carries them.
 */
export interface BiographyEntry {
  content?: string | null;
  wordCount?: number | null;
}

/** The colours one status renders in, per theme polarity. */
export interface BiographyStatusColors {
  bg: string;
  border: string;
  text: string;
}

/** One entry of `BIOGRAPHY_STATUS`. */
export interface BiographyStatusDef {
  key: string;
  label: string;
  /** A lucide icon name. */
  icon: string;
  description: string;
  /**
   * Two full palettes rather than one colour plus a dark override: these are
   * background, border and text together, and a status that only swapped its
   * text colour would lose contrast against its own chip.
   */
  colors: { dark: BiographyStatusColors; light: BiographyStatusColors };
}


// ==================== STATUS CONSTANTS ====================

/**
 * Status level definitions
 * Each status has:
 * - key: Internal identifier
 * - label: Human-readable name
 * - icon: Emoji for visual representation
 * - description: Tooltip/help text
 * - color: Theme-aware color for styling
 */
export const BIOGRAPHY_STATUS = {
  EMPTY: {
    key: 'empty',
    label: 'Empty',
    icon: '📝',
    description: 'No biography written yet',
    // Colors: [dark theme, light theme]
    colors: {
      dark: {
        bg: 'rgba(139, 69, 69, 0.3)',      // Muted red/brown
        border: '#8b4545',
        text: '#d4a5a5'
      },
      light: {
        bg: 'rgba(180, 100, 100, 0.2)',
        border: '#b46464',
        text: '#8b4545'
      }
    }
  },
  
  STUB: {
    key: 'stub',
    label: 'Stub',
    icon: '📄',
    description: 'Brief notes only - needs expansion',
    colors: {
      dark: {
        bg: 'rgba(180, 140, 60, 0.3)',     // Amber/gold
        border: '#b48c3c',
        text: '#e0c080'
      },
      light: {
        bg: 'rgba(180, 140, 60, 0.2)',
        border: '#9a7a30',
        text: '#7a5a20'
      }
    }
  },
  
  WRITTEN: {
    key: 'written',
    label: 'Written',
    icon: '📖',
    description: 'Biography content present',
    colors: {
      dark: {
        bg: 'rgba(90, 130, 90, 0.3)',      // Forest green
        border: '#5a825a',
        text: '#a0c8a0'
      },
      light: {
        bg: 'rgba(90, 130, 90, 0.2)',
        border: '#4a724a',
        text: '#3a5a3a'
      }
    }
  }
};

// Word count thresholds
const STUB_THRESHOLD = 50;  // 0-50 words = stub, 50+ = written

// ==================== MAIN FUNCTION ====================

/**
 * Get biography status for a Codex entry
 * 
 * @param {Object|null} entry - The Codex entry object (or null if no entry)
 * @param {boolean} isDarkTheme - Whether dark theme is active
 * @returns {Object} Status object with key, label, icon, description, and style
 * 
 * Usage:
 *   const status = getBiographyStatus(codexEntry, isDarkTheme);
 *   // Returns: { key: 'empty', label: 'Empty', icon: '📝', ... }
 */
export function getBiographyStatus(entry: BiographyEntry | null | undefined, isDarkTheme = true) {
  // No entry at all = empty
  if (!entry) {
    return formatStatus(BIOGRAPHY_STATUS.EMPTY, isDarkTheme);
  }
  
  // Get word count (may be stored on entry, or calculate from content)
  const wordCount = entry.wordCount ?? calculateWordCount(entry.content);
  
  // Determine status based on word count
  if (wordCount === 0) {
    return formatStatus(BIOGRAPHY_STATUS.EMPTY, isDarkTheme);
  } else if (wordCount <= STUB_THRESHOLD) {
    return formatStatus(BIOGRAPHY_STATUS.STUB, isDarkTheme, wordCount);
  } else {
    return formatStatus(BIOGRAPHY_STATUS.WRITTEN, isDarkTheme, wordCount);
  }
}

/**
 * Format status object with theme-appropriate colors
 */
function formatStatus(statusDef: BiographyStatusDef, isDarkTheme: boolean, wordCount = 0) {
  const themeColors = isDarkTheme ? statusDef.colors.dark : statusDef.colors.light;
  
  return {
    key: statusDef.key,
    label: statusDef.label,
    icon: statusDef.icon,
    description: statusDef.description,
    wordCount: wordCount,
    style: {
      backgroundColor: themeColors.bg,
      borderColor: themeColors.border,
      color: themeColors.text
    },
    // Also expose raw colors for D3/SVG use
    colors: themeColors
  };
}

/**
 * Calculate word count from content string
 * (Same logic as in codexService.js for consistency)
 */
function calculateWordCount(content: string | null | undefined): number {
  if (!content) return 0;
  
  // Remove markdown syntax for accurate count
  const cleanText = content
    .replace(/\[\[.*?\]\]/g, '')  // Remove wiki links
    .replace(/[#*_`]/g, '')       // Remove markdown formatting
    .trim();
  
  const words = cleanText.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Check if a biography needs attention (empty or stub)
 * Useful for filtering/highlighting
 */
export function needsAttention(entry: BiographyEntry | null | undefined): boolean {
  const status = getBiographyStatus(entry, true); // Theme doesn't matter for this check
  return status.key === 'empty' || status.key === 'stub';
}

/**
 * Get a brief summary text for the status
 * e.g., "Empty - needs biography" or "Written (156 words)"
 */
export function getStatusSummary(entry: BiographyEntry | null | undefined, isDarkTheme = true) {
  const status = getBiographyStatus(entry, isDarkTheme);
  
  switch (status.key) {
    case 'empty':
      return 'No biography yet';
    case 'stub':
      return `Brief notes (${status.wordCount} words)`;
    case 'written':
      return `${status.wordCount} words`;
    default:
      return '';
  }
}

/**
 * Get just the icon for compact displays
 */
export function getStatusIcon(entry: BiographyEntry | null | undefined): string {
  const status = getBiographyStatus(entry, true);
  return status.icon;
}

export default {
  BIOGRAPHY_STATUS,
  getBiographyStatus,
  needsAttention,
  getStatusSummary,
  getStatusIcon
};
