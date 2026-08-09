/**
 * Bug Service - Bug Tracking System for Lineageweaver
 * 
 * CRUD operations for bug reports with cloud sync support.
 * Includes export functionality for Claude Code integration.
 * 
 * WHAT IS A BUG RECORD?
 * A bug record captures an issue found while using Lineageweaver,
 * including context like current page, browser info, and optional screenshots.
 * 
 * DATABASE TABLES USED:
 * - bugs: The main bug reports table
 * 
 * CLOUD SYNC:
 * Bugs sync to Firestore under /users/{userId}/bugs/{bugId}
 * This lets you access your bug list from any device.
 * 
 * CLAUDE CODE INTEGRATION:
 * The export functions generate markdown files optimized for
 * feeding into Claude Code for automated diagnosis/fixing.
 */

import { db } from './database';
import { logger } from '../utils/logger';

// ==================== BUG CRUD OPERATIONS ====================

/**
 * Create a new bug report
 * 
 * @param {Partial<import('./types').Bug>} bugData - The bug data to save
 * @returns {Promise<number>} The ID of the newly created bug
 * 
 * REQUIRED FIELDS:
 * - title: Brief description of the bug
 * 
 * OPTIONAL FIELDS:
 * - description: Detailed explanation
 * - stepsToReproduce: How to trigger the bug
 * - priority: 'low' | 'medium' | 'high' | 'critical'
 * - status: 'open' | 'in-progress' | 'resolved'
 * - system: 'tree' | 'codex' | 'armory' | 'dignities' | 'general'
 * - page: URL path where bug was found (auto-captured)
 * - browser: Browser info (auto-captured)
 * - viewport: Screen size (auto-captured)
 * - theme: Current theme (auto-captured)
 * - screenshot: Base64 image data
 * - notes: Developer notes for investigation
 */
export async function createBug(bugData) {
  try {
    const now = new Date().toISOString();
    
    const record = {
      // Core info
      title: bugData.title || 'Untitled Bug',
      description: bugData.description || null,
      stepsToReproduce: bugData.stepsToReproduce || null,
      
      // Classification
      priority: bugData.priority || 'medium',
      status: bugData.status || 'open',
      system: bugData.system || 'general',
      
      // Context (auto-captured)
      page: bugData.page || null,
      browser: bugData.browser || null,
      viewport: bugData.viewport || null,
      theme: bugData.theme || null,
      
      // Attachments
      screenshot: bugData.screenshot || null,
      
      // Developer notes
      notes: bugData.notes || null,
      
      // Timestamps
      created: now,
      updated: now,
      resolved: null
    };
    
    const id = await db.bugs.add(record);
    logger.log('🐛 Bug created with ID:', id);
    return id;
  } catch (error) {
    logger.error('❌ Error creating bug:', error);
    throw error;
  }
}

/**
 * Get a single bug by ID
 * 
 * @param {number} id - The bug ID
 * @returns {Promise<import('./types').Bug|undefined>} The bug record or undefined
 */
export async function getBug(id) {
  try {
    const bug = await db.bugs.get(id);
    return bug;
  } catch (error) {
    logger.error('❌ Error getting bug:', error);
    throw error;
  }
}

/**
 * Get all bugs
 * 
 * @returns {Promise<import('./types').Bug[]>} Array of all bug records
 */
export async function getAllBugs() {
  try {
    const bugs = await db.bugs.toArray();
    return bugs;
  } catch (error) {
    logger.error('❌ Error getting all bugs:', error);
    throw error;
  }
}

/**
 * Update an existing bug
 * 
 * @param {number} id - The bug ID to update
 * @param {Partial<import('./types').Bug>} updates - The fields to update
 * @returns {Promise<number>} Number of records updated (1 or 0)
 */
export async function updateBug(id, updates) {
  try {
    const updateData = {
      ...updates,
      updated: new Date().toISOString()
    };
    
    // If status is being set to 'resolved', set resolved timestamp
    if (updates.status === 'resolved') {
      updateData.resolved = new Date().toISOString();
    }
    
    const result = await db.bugs.update(id, updateData);
    logger.log('🐛 Bug updated:', id);
    return result;
  } catch (error) {
    logger.error('❌ Error updating bug:', error);
    throw error;
  }
}

/**
 * Delete a bug
 * 
 * @param {number} id - The bug ID to delete
 * @returns {Promise<void>}
 */
export async function deleteBug(id) {
  try {
    await db.bugs.delete(id);
    logger.log('🐛 Bug deleted:', id);
  } catch (error) {
    logger.error('❌ Error deleting bug:', error);
    throw error;
  }
}

// ==================== QUERY HELPERS ====================

/**
 * Get bugs by status
 * 
 * @param {string} status - 'open' | 'in-progress' | 'resolved'
 * @returns {Promise<import('./types').Bug[]>} Matching bug records
 */
export async function getBugsByStatus(status) {
  try {
    const bugs = await db.bugs.where('status').equals(status).toArray();
    return bugs;
  } catch (error) {
    logger.error('❌ Error getting bugs by status:', error);
    throw error;
  }
}

/**
 * Get bugs by priority
 * 
 * @param {string} priority - 'low' | 'medium' | 'high' | 'critical'
 * @returns {Promise<import('./types').Bug[]>} Matching bug records
 */
export async function getBugsByPriority(priority) {
  try {
    const bugs = await db.bugs.where('priority').equals(priority).toArray();
    return bugs;
  } catch (error) {
    logger.error('❌ Error getting bugs by priority:', error);
    throw error;
  }
}

/**
 * Get bugs by system
 * 
 * @param {string} system - 'tree' | 'codex' | 'armory' | 'dignities' | 'general'
 * @returns {Promise<import('./types').Bug[]>} Matching bug records
 */
export async function getBugsBySystem(system) {
  try {
    const all = await db.bugs.toArray();
    return all.filter(b => b.system === system);
  } catch (error) {
    logger.error('❌ Error getting bugs by system:', error);
    throw error;
  }
}

/**
 * Search bugs by title or description
 * 
 * @param {string} searchTerm - The search term
 * @returns {Promise<import('./types').Bug[]>} Matching bug records
 */
export async function searchBugs(searchTerm) {
  try {
    const term = searchTerm.toLowerCase();
    const all = await db.bugs.toArray();
    
    return all.filter(bug => {
      if (bug.title && bug.title.toLowerCase().includes(term)) return true;
      if (bug.description && bug.description.toLowerCase().includes(term)) return true;
      return false;
    });
  } catch (error) {
    logger.error('❌ Error searching bugs:', error);
    throw error;
  }
}

/**
 * Get bug statistics
 * 
 * @returns {Promise<import('./types').BugStatistics>} Statistics object
 */
export async function getBugStatistics() {
  try {
    const all = await db.bugs.toArray();
    
    // Count by status
    const byStatus = {
      open: all.filter(b => b.status === 'open').length,
      'in-progress': all.filter(b => b.status === 'in-progress').length,
      resolved: all.filter(b => b.status === 'resolved').length
    };
    
    // Count by priority
    const byPriority = {
      critical: all.filter(b => b.priority === 'critical').length,
      high: all.filter(b => b.priority === 'high').length,
      medium: all.filter(b => b.priority === 'medium').length,
      low: all.filter(b => b.priority === 'low').length
    };
    
    // Count by system
    const bySystem = {};
    all.forEach(bug => {
      const sys = bug.system || 'general';
      bySystem[sys] = (bySystem[sys] || 0) + 1;
    });
    
    return {
      total: all.length,
      byStatus,
      byPriority,
      bySystem,
      withScreenshot: all.filter(b => b.screenshot).length,
      unresolvedCritical: all.filter(b => b.priority === 'critical' && b.status !== 'resolved').length
    };
  } catch (error) {
    logger.error('❌ Error getting bug statistics:', error);
    throw error;
  }
}

/**
 * Get recent bugs
 * 
 * @param {number} limit - Maximum number to return
 * @returns {Promise<Array>} Recent bug records
 */
export async function getRecentBugs(limit = 10) {
  try {
    const all = await db.bugs.toArray();
    return all
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, limit);
  } catch (error) {
    logger.error('❌ Error getting recent bugs:', error);
    throw error;
  }
}

// ==================== CLAUDE CODE EXPORT ====================

/**
 * Map page paths to likely relevant files
 * This helps Claude Code know where to look first
 * 
 * @param {string} page - The URL path
 * @returns {Array<string>} List of relevant file paths
 */
function getRelevantFiles(page) {
  const fileMap = {
    '/tree': [
      'src/pages/FamilyTree.jsx',
      'src/components/PersonCard.jsx',
      'src/components/QuickEditPanel.jsx',
      'src/utils/RelationshipCalculator.js'
    ],
    '/manage': [
      'src/pages/ManageData.jsx',
      'src/services/database.js'
    ],
    '/codex': [
      'src/pages/CodexLanding.jsx',
      'src/services/codexService.js'
    ],
    '/codex/create': [
      'src/pages/CodexEntryForm.jsx',
      'src/services/codexService.js'
    ],
    '/codex/entry': [
      'src/pages/CodexEntryView.jsx',
      'src/utils/wikiLinkParser.js'
    ],
    '/heraldry': [
      'src/pages/HeraldryLanding.jsx',
      'src/services/heraldryService.js'
    ],
    '/heraldry/create': [
      'src/pages/HeraldryCreator.jsx',
      'src/components/heraldry/ExternalChargeRenderer.jsx',
      'src/utils/shieldSVGProcessor.js'
    ],
    '/heraldry/charges': [
      'src/pages/ChargesLibrary.jsx',
      'src/data/unifiedChargesLibrary.js'
    ],
    '/dignities': [
      'src/pages/DignitiesLanding.jsx',
      'src/services/dignityService.js'
    ]
  };
  
  // Find matching path (handles dynamic routes like /codex/entry/:id)
  for (const [path, files] of Object.entries(fileMap)) {
    if (page && page.startsWith(path)) {
      return files;
    }
  }
  
  return ['src/App.jsx', 'src/contexts/GenealogyContext.jsx'];
}

/**
 * Export a single bug to Claude Code format (Markdown)
 * 
 * @param {Object} bug - The bug record
 * @returns {string} Markdown formatted for Claude Code
 */
export function exportBugToMarkdown(bug) {
  const bugId = `BUG-${String(bug.id).padStart(4, '0')}`;
  const relevantFiles = getRelevantFiles(bug.page);
  
  let markdown = `# Bug Report: ${bug.title}

## Metadata
- **ID:** ${bugId}
- **Priority:** ${bug.priority?.charAt(0).toUpperCase() + bug.priority?.slice(1) || 'Medium'}
- **Status:** ${bug.status?.charAt(0).toUpperCase() + bug.status?.slice(1) || 'Open'}
- **System:** ${bug.system || 'General'}
- **Page:** ${bug.page || 'Unknown'}
- **Created:** ${bug.created}
`;

  if (bug.description) {
    markdown += `
## Description
${bug.description}
`;
  }

  if (bug.stepsToReproduce) {
    markdown += `
## Steps to Reproduce
${bug.stepsToReproduce}
`;
  }

  if (bug.browser || bug.viewport || bug.theme) {
    markdown += `
## Browser Context
`;
    if (bug.browser) markdown += `- Browser: ${bug.browser}\n`;
    if (bug.viewport) markdown += `- Viewport: ${bug.viewport}\n`;
    if (bug.theme) markdown += `- Theme: ${bug.theme}\n`;
  }

  if (bug.screenshot) {
    markdown += `
## Screenshot
[Screenshot attached - see ${bugId}-screenshot.png]
`;
  }

  markdown += `
## Relevant Files (Auto-detected)
Based on the page \`${bug.page || '/'}\`, likely relevant files:
${relevantFiles.map(f => `- ${f}`).join('\n')}
`;

  markdown += `
## Suggested Investigation
1. Check browser console for errors on this page
2. Review the relevant files listed above
3. Test reproduction steps in development environment
4. Check for recent changes to these files
`;

  if (bug.notes) {
    markdown += `
## Developer Notes
${bug.notes}
`;
  }

  return markdown;
}

/**
 * Export all open bugs to a single markdown document
 * Perfect for starting a Claude Code session
 * 
 * @param {Object} [options] - Export options
 * @param {Array<string>} [options.statuses] - Statuses to include (default: ['open', 'in-progress'])
 * @param {Array<string>} [options.priorities] - Priorities to include (default: all)
 * @returns {Promise<string>} Combined markdown document
 */
export async function exportBugsForClaudeCode(options = {}) {
  try {
    const {
      statuses = ['open', 'in-progress'],
      priorities = ['critical', 'high', 'medium', 'low']
    } = options;
    
    const all = await db.bugs.toArray();
    
    // Filter and sort by priority (critical first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const filtered = all
      .filter(b => statuses.includes(b.status) && priorities.includes(b.priority))
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    
    if (filtered.length === 0) {
      return '# No bugs to report\n\nAll clear! No matching bugs found.';
    }
    
    let markdown = `# Lineageweaver Bug Report
Generated: ${new Date().toISOString()}

## Summary
- **Total Bugs:** ${filtered.length}
- **Critical:** ${filtered.filter(b => b.priority === 'critical').length}
- **High:** ${filtered.filter(b => b.priority === 'high').length}
- **Medium:** ${filtered.filter(b => b.priority === 'medium').length}
- **Low:** ${filtered.filter(b => b.priority === 'low').length}

## Systems Affected
${[...new Set(filtered.map(b => b.system || 'general'))].map(s => `- ${s}`).join('\n')}

---

`;

    // Add each bug
    for (const bug of filtered) {
      markdown += exportBugToMarkdown(bug);
      markdown += '\n---\n\n';
    }

    return markdown;
  } catch (error) {
    logger.error('❌ Error exporting bugs:', error);
    throw error;
  }
}

/**
 * Export bug screenshots as separate files
 * Returns array of { filename, data } objects
 * 
 * @param {Array<Object>} bugs - Bug records with screenshots
 * @returns {Array<Object>} Screenshot files
 */
export function exportScreenshots(bugs) {
  return bugs
    .filter(bug => bug.screenshot)
    .map(bug => ({
      filename: `BUG-${String(bug.id).padStart(4, '0')}-screenshot.png`,
      data: bug.screenshot
    }));
}

// ==================== BULK OPERATIONS ====================

/**
 * Resolve multiple bugs at once
 * 
 * @param {Array<number>} ids - Array of bug IDs to resolve
 * @returns {Promise<number>} Number of bugs resolved
 */
export async function bulkResolveBugs(ids) {
  try {
    const now = new Date().toISOString();
    let count = 0;
    
    for (const id of ids) {
      await db.bugs.update(id, {
        status: 'resolved',
        resolved: now,
        updated: now
      });
      count++;
    }
    
    logger.log(`🐛 Bulk resolved ${count} bugs`);
    return count;
  } catch (error) {
    logger.error('❌ Error bulk resolving bugs:', error);
    throw error;
  }
}

/**
 * Delete all resolved bugs
 * Good for cleanup after a development session
 * 
 * @returns {Promise<number>} Number of bugs deleted
 */
export async function clearResolvedBugs() {
  try {
    const resolved = await db.bugs.where('status').equals('resolved').toArray();
    const ids = resolved.map(b => b.id);
    
    await db.bugs.bulkDelete(ids);
    logger.log(`🐛 Cleared ${ids.length} resolved bugs`);
    return ids.length;
  } catch (error) {
    logger.error('❌ Error clearing resolved bugs:', error);
    throw error;
  }
}

export default {
  // CRUD
  createBug,
  getBug,
  getAllBugs,
  updateBug,
  deleteBug,
  
  // Queries
  getBugsByStatus,
  getBugsByPriority,
  getBugsBySystem,
  searchBugs,
  getBugStatistics,
  getRecentBugs,
  
  // Export
  exportBugToMarkdown,
  exportBugsForClaudeCode,
  exportScreenshots,
  
  // Bulk
  bulkResolveBugs,
  clearResolvedBugs
};
