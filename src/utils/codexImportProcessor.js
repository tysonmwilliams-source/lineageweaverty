/**
 * CODEX IMPORT PROCESSOR
 *
 * Extracted codex import logic with duplicate detection and cloud sync.
 * Handles both flat arrays and category-keyed formats.
 * Used by unifiedImport.js and as the internal engine for codex imports.
 *
 * @module codexImportProcessor
 */

import { createEntry, getAllEntries } from '../services/codexService.js';
import { syncAddCodexEntry } from '../services/dataSyncService.js';
import { logger } from './logger';

const CODEX_CATEGORIES = ['houses', 'locations', 'events', 'personages', 'mysteria', 'concepts'];

/**
 * Normalize category-keyed data into a flat array of codex entries.
 * @param {Object|Array} data - Either a category-keyed object or flat array
 * @returns {Array} Flat array of entry objects with type field set
 */
export function normalizeCodexEntries(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  const entries = [];
  for (const category of CODEX_CATEGORIES) {
    const items = data[category];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      entries.push({
        ...item,
        type: item.type || category
      });
    }
  }
  return entries;
}

/**
 * Validate an array of codex entries.
 * @param {Array} entries - Flat array of entry objects
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCodexEntries(entries) {
  const errors = [];

  if (!Array.isArray(entries)) {
    errors.push('Codex entries must be an array');
    return { valid: false, errors };
  }

  entries.forEach((item, index) => {
    if (!item.title) {
      errors.push(`codexEntries[${index}] missing required field: title`);
    }
    if (!item.type) {
      errors.push(`codexEntries[${index}] missing required field: type`);
    }
    if (!item.content) {
      errors.push(`codexEntries[${index}] missing required field: content`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Process and import codex entries with duplicate detection and cloud sync.
 *
 * @param {Array} entries - Flat array of codex entry objects
 * @param {Object} options
 * @param {string} [options.datasetId] - Dataset ID for DB operations
 * @param {string} [options.userId] - User ID for cloud sync
 * @param {boolean} [options.skipDuplicates=true] - Skip entries with matching titles
 * @param {Map} [options.houseIdMap] - For resolving _autoLink house references
 * @param {Map} [options.personIdMap] - For resolving _autoLink person references
 * @param {Function} [options.onProgress] - Progress callback (processed, total, current, status)
 * @returns {Promise<{ created: Array, skipped: Array, errors: Array }>}
 */
export async function processCodexEntries(entries, options = {}) {
  const {
    datasetId = null,
    userId = null,
    skipDuplicates = true,
    houseIdMap = null,
    personIdMap = null,
    onProgress = null
  } = options;

  const result = {
    created: [],
    skipped: [],
    errors: []
  };

  if (!entries || entries.length === 0) {
    return result;
  }

  // Get existing entries for duplicate detection
  let existingTitles = new Set();
  if (skipDuplicates) {
    try {
      const existingEntries = await getAllEntries(datasetId);
      existingTitles = new Set(existingEntries.map(e => e.title));
    } catch (err) {
      logger.warn('Could not load existing entries for duplicate check:', err);
    }
  }

  const total = entries.length;

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];

    // Skip duplicates
    if (skipDuplicates && existingTitles.has(item.title)) {
      result.skipped.push({
        type: item.type,
        title: item.title,
        reason: 'Duplicate title'
      });
      if (onProgress) {
        onProgress({ processed: i + 1, total, current: item.title, skipped: true });
      }
      continue;
    }

    // Resolve _autoLink references if ID maps are provided
    const entryData = { ...item };
    if (entryData._autoLink && (houseIdMap || personIdMap)) {
      if (entryData._autoLink.houseRef && houseIdMap) {
        const resolvedId = houseIdMap.get(entryData._autoLink.houseRef);
        if (resolvedId) {
          entryData.linkedHouseId = resolvedId;
        }
      }
      if (entryData._autoLink.personRef && personIdMap) {
        const resolvedId = personIdMap.get(entryData._autoLink.personRef);
        if (resolvedId) {
          entryData.linkedPersonId = resolvedId;
        }
      }
      delete entryData._autoLink;
    }

    // Remove internal fields before creating
    delete entryData._tempId;

    try {
      const id = await createEntry(entryData, datasetId);
      result.created.push({ title: item.title, id, type: item.type });

      // Cloud sync
      if (userId) {
        try {
          await syncAddCodexEntry(userId, datasetId, id, { ...entryData, id });
        } catch (syncErr) {
          logger.warn(`Cloud sync failed for codex entry "${item.title}":`, syncErr.message);
        }
      }

      if (onProgress) {
        onProgress({ processed: i + 1, total, current: item.title, success: true });
      }
    } catch (err) {
      result.errors.push({
        type: item.type,
        title: item.title,
        error: err.message
      });
      if (onProgress) {
        onProgress({ processed: i + 1, total, current: item.title, error: true });
      }
    }
  }

  return result;
}
