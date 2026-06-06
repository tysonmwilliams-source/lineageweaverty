/**
 * UNIFIED IMPORT SYSTEM
 *
 * Single entry point for all data imports in LineageWeaver.
 * Auto-detects payload contents and delegates to specialized processors.
 *
 * Supports:
 * - Houses, people, relationships (via bulkFamilyImport)
 * - Codex entries (via codexImportProcessor)
 * - Codex enhancements (via codex-enhancement-import)
 * - Future: heraldry, dignities
 *
 * USAGE:
 * ```javascript
 * import { unifiedImport } from './utils/unifiedImport';
 *
 * // Codex-only import
 * await unifiedImport({
 *   codexEntries: [{ type: 'locations', title: 'Merehall', content: '...' }]
 * }, { datasetId, userId });
 *
 * // Mixed family + codex import
 * await unifiedImport({
 *   houses: [{ _tempId: 'H1', houseName: 'House Wilson' }],
 *   people: [{ _tempId: 'P1', firstName: 'Baudin', houseId: 'H1' }],
 *   codexEntries: [{ type: 'houses', title: 'House Wilson', content: '...' }]
 * }, { datasetId, userId });
 * ```
 *
 * @module unifiedImport
 */

import { validateTemplate, processFamilyImport } from './bulkFamilyImport.js';
import {
  normalizeCodexEntries,
  validateCodexEntries,
  processCodexEntries
} from './codexImportProcessor.js';
import { forceUploadToCloud, syncAddCodexLink } from '../services/dataSyncService.js';
import { createLink, getEntryByPersonId, getEntryByHouseId } from '../services/codexService.js';
import { db } from '../services/database.js';
import { buildLinkIndex, linkExistsInIndex } from '../services/migrationService.js';

const CODEX_CATEGORY_KEYS = ['houses', 'locations', 'events', 'personages', 'mysteria', 'concepts'];
const FAMILY_KEYS = ['houses', 'people', 'relationships'];

/**
 * Detect what types of data are present in a payload.
 * @param {Object} payload - The import payload
 * @returns {{ hasFamily: boolean, hasCodex: boolean, hasEnhancements: boolean, hasCategoryCodex: boolean }}
 */
export function detectPayloadTypes(payload) {
  if (!payload || typeof payload !== 'object') {
    return { hasFamily: false, hasCodex: false, hasEnhancements: false, hasCategoryCodex: false };
  }

  // Family data uses arrays under houses/people/relationships
  // but houses that contain objects with _tempId or houseName are family houses
  const hasFamilyHouses = Array.isArray(payload.houses) &&
    payload.houses.some(h => h._tempId || h.houseName);
  const hasPeople = Array.isArray(payload.people) && payload.people.length > 0;
  const hasRelationships = Array.isArray(payload.relationships) && payload.relationships.length > 0;
  const hasFamily = hasFamilyHouses || hasPeople || hasRelationships;

  // Codex entries as flat array
  const hasCodex = Array.isArray(payload.codexEntries) && payload.codexEntries.length > 0;

  // Category-keyed codex data (locations, events, personages, etc.)
  // Only count as codex if they contain codex-shaped objects (have title+content)
  const hasCategoryCodex = CODEX_CATEGORY_KEYS.some(key => {
    const items = payload[key];
    return Array.isArray(items) && items.length > 0 &&
      items.some(item => item.title && item.content);
  });

  // Codex enhancements
  const hasEnhancements = Array.isArray(payload.codexEnhancements) &&
    payload.codexEnhancements.length > 0;

  return { hasFamily, hasCodex, hasEnhancements, hasCategoryCodex };
}

/**
 * Validate an entire import payload without writing any data.
 *
 * @param {Object} payload - The import payload
 * @param {Object} options
 * @param {string} [options.datasetId] - Dataset ID for validation lookups
 * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[], counts: Object }>}
 */
export async function validatePayload(payload, options = {}) {
  const { datasetId = null } = options;
  const errors = [];
  const warnings = [];
  const counts = {
    houses: 0,
    people: 0,
    relationships: 0,
    codexEntries: 0,
    codexEnhancements: 0
  };

  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a non-null object');
    return { valid: false, errors, warnings, counts };
  }

  const types = detectPayloadTypes(payload);

  // Validate family data
  if (types.hasFamily) {
    try {
      const familyResult = await validateTemplate(payload, { datasetId });
      if (!familyResult.valid) {
        errors.push(...(familyResult.errors || []).map(e =>
          typeof e === 'string' ? e : e.message || JSON.stringify(e)
        ));
      }
      if (familyResult.warnings) {
        warnings.push(...familyResult.warnings.map(w =>
          typeof w === 'string' ? w : w.message || JSON.stringify(w)
        ));
      }
      counts.houses = payload.houses?.filter(h => h._tempId || h.houseName).length || 0;
      counts.people = payload.people?.length || 0;
      counts.relationships = payload.relationships?.length || 0;
    } catch (err) {
      errors.push(`Family validation failed: ${err.message}`);
    }
  }

  // Validate codex entries
  if (types.hasCodex) {
    const codexValidation = validateCodexEntries(payload.codexEntries);
    if (!codexValidation.valid) {
      errors.push(...codexValidation.errors);
    }
    counts.codexEntries += payload.codexEntries.length;
  }

  // Validate category-keyed codex data
  if (types.hasCategoryCodex) {
    const normalized = normalizeCodexEntries(payload);
    // Filter to only codex-shaped entries (not family houses)
    const codexOnly = normalized.filter(e => e.title && e.content);
    const codexValidation = validateCodexEntries(codexOnly);
    if (!codexValidation.valid) {
      errors.push(...codexValidation.errors);
    }
    counts.codexEntries += codexOnly.length;
  }

  // Count enhancements
  if (types.hasEnhancements) {
    counts.codexEnhancements = payload.codexEnhancements.length;
  }

  // Warn about empty payload
  const totalItems = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (totalItems === 0) {
    warnings.push('Payload contains no recognizable import data');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    counts,
    types
  };
}

/**
 * Unified import function — single entry point for all data imports.
 *
 * @param {Object} payload - The import payload (see module docs for format)
 * @param {Object} options
 * @param {string} [options.datasetId] - Dataset ID for DB operations
 * @param {string} [options.userId] - User ID for cloud sync
 * @param {Function} [options.onProgress] - Progress callback (phase, step, message, pct)
 * @param {boolean} [options.skipDuplicates=true] - Skip duplicate codex entries
 * @param {boolean} [options.dryRun=false] - Validate only, don't write
 * @param {boolean} [options.skipCodex=false] - Skip codex entries
 * @param {boolean} [options.skipEnhancements=false] - Skip codex enhancements
 * @returns {Promise<UnifiedImportResult>}
 */
export async function unifiedImport(payload, options = {}) {
  const {
    datasetId = null,
    userId = null,
    onProgress = null,
    skipDuplicates = true,
    dryRun = false,
    skipCodex = false,
    skipEnhancements = false
  } = options;

  const startTime = Date.now();
  const result = {
    success: false,
    errors: [],
    warnings: [],
    summary: {
      housesCreated: 0,
      peopleCreated: 0,
      relationshipsCreated: 0,
      codexEntriesCreated: 0,
      codexEntriesSkipped: 0,
      codexEntriesEnhanced: 0,
      crossLinksCreated: 0
    },
    created: { houses: [], people: [], relationships: [], codexEntries: [] },
    idMappings: { houses: new Map(), people: new Map(), codex: new Map() },
    timing: { start: startTime, end: null, duration: null }
  };

  // Phase 1: Validate
  if (onProgress) onProgress('validate', 0, 'Validating payload...', 0);

  const validation = await validatePayload(payload, { datasetId });
  result.warnings.push(...validation.warnings);

  if (!validation.valid) {
    result.errors.push(...validation.errors);
    result.timing.end = Date.now();
    result.timing.duration = result.timing.end - startTime;
    return result;
  }

  if (dryRun) {
    result.success = true;
    result.timing.end = Date.now();
    result.timing.duration = result.timing.end - startTime;
    return result;
  }

  const types = validation.types;

  // Phase 2: Family import (houses → people → relationships)
  if (types.hasFamily) {
    if (onProgress) onProgress('family', 0, 'Importing family data...', 10);

    try {
      const familyResult = await processFamilyImport(payload, {
        datasetId,
        userId,
        skipCodex: true, // We handle codex separately
        skipHeraldry: true,
        skipDignities: true,
        onProgress: (p) => {
          if (onProgress) {
            onProgress('family', p.step, p.message, 10 + (p.pct || 0) * 0.4);
          }
        }
      });

      if (familyResult.success) {
        // Collect created entities and ID mappings
        if (familyResult.houses) {
          result.created.houses = familyResult.houses;
          result.summary.housesCreated = familyResult.houses.length;
          for (const h of familyResult.houses) {
            if (h._tempId && h.id) {
              result.idMappings.houses.set(h._tempId, h.id);
            }
          }
        }
        if (familyResult.people) {
          result.created.people = familyResult.people;
          result.summary.peopleCreated = familyResult.people.length;
          for (const p of familyResult.people) {
            if (p._tempId && p.id) {
              result.idMappings.people.set(p._tempId, p.id);
            }
          }
        }
        if (familyResult.relationships) {
          result.created.relationships = familyResult.relationships;
          result.summary.relationshipsCreated = familyResult.relationships.length;
        }
      } else {
        result.errors.push(...(familyResult.errors || ['Family import failed']));
      }
    } catch (err) {
      result.errors.push(`Family import error: ${err.message}`);
    }
  }

  // Phase 3: Codex entries
  if (!skipCodex && (types.hasCodex || types.hasCategoryCodex)) {
    if (onProgress) onProgress('codex', 0, 'Importing codex entries...', 50);

    // Gather all codex entries
    let allCodexEntries = [];

    if (types.hasCodex) {
      allCodexEntries.push(...payload.codexEntries);
    }

    if (types.hasCategoryCodex) {
      const normalized = normalizeCodexEntries(payload);
      // Filter to codex-shaped entries only
      const codexOnly = normalized.filter(e => e.title && e.content);
      allCodexEntries.push(...codexOnly);
    }

    // Deduplicate within the import batch itself
    const seenTitles = new Set();
    const uniqueEntries = [];
    for (const entry of allCodexEntries) {
      if (!seenTitles.has(entry.title)) {
        seenTitles.add(entry.title);
        uniqueEntries.push(entry);
      }
    }

    try {
      const codexResult = await processCodexEntries(uniqueEntries, {
        datasetId,
        userId,
        skipDuplicates,
        houseIdMap: result.idMappings.houses,
        personIdMap: result.idMappings.people,
        onProgress: (p) => {
          if (onProgress) {
            onProgress('codex', p.processed, p.current, 50 + (p.processed / p.total) * 40);
          }
        }
      });

      result.created.codexEntries = codexResult.created;
      result.summary.codexEntriesCreated = codexResult.created.length;
      result.summary.codexEntriesSkipped = codexResult.skipped.length;

      if (codexResult.errors.length > 0) {
        result.errors.push(...codexResult.errors.map(e => `Codex: ${e.title} — ${e.error}`));
      }

      // Store codex ID mappings
      for (const c of codexResult.created) {
        if (c.title && c.id) {
          result.idMappings.codex.set(c.title, c.id);
        }
      }
    } catch (err) {
      result.errors.push(`Codex import error: ${err.message}`);
    }
  }

  // Phase 4: Codex enhancements
  if (!skipEnhancements && types.hasEnhancements) {
    if (onProgress) onProgress('enhance', 0, 'Enhancing codex entries...', 90);

    try {
      const { enhanceCodexEntries } = await import('./codex-enhancement-import.js');
      const enhanceResult = await enhanceCodexEntries(payload.codexEnhancements, {
        datasetId,
        dryRun: false,
        onProgress: (p) => {
          if (onProgress) {
            onProgress('enhance', p.processed, p.current, 90 + (p.processed / p.total) * 10);
          }
        }
      });

      result.summary.codexEntriesEnhanced = enhanceResult.enhanced?.length || 0;
    } catch (err) {
      result.errors.push(`Enhancement error: ${err.message}`);
    }
  }

  // Phase 4.5: Create Person↔House cross-links for imported data
  if (result.created.people.length > 0 || result.created.houses.length > 0) {
    if (onProgress) onProgress('crosslinks', 0, 'Creating cross-links...', 92);

    try {
      const crossLinkResult = await createPostImportCrossLinks(result.created, {
        userId,
        datasetId
      });
      result.summary.crossLinksCreated = crossLinkResult.created;
      if (crossLinkResult.errors.length > 0) {
        result.warnings.push(...crossLinkResult.errors.map(e => `Cross-link: ${e}`));
      }
    } catch (err) {
      result.warnings.push(`Cross-link creation warning: ${err.message}`);
    }
  }

  // Phase 5: Cloud sync (single batch at end)
  if (userId && datasetId) {
    if (onProgress) onProgress('sync', 0, 'Syncing to cloud...', 95);
    try {
      await forceUploadToCloud(userId, datasetId);
    } catch (syncErr) {
      result.warnings.push(`Cloud sync warning: ${syncErr.message}`);
    }
  }

  // Finalize
  result.timing.end = Date.now();
  result.timing.duration = result.timing.end - startTime;
  result.success = result.errors.length === 0;

  if (onProgress) onProgress('done', 0, 'Import complete', 100);

  return result;
}

/**
 * Create Person↔House cross-links for newly imported entities.
 *
 * Loads existing codex links once, builds a Set index, then for each
 * created person with a houseId, looks up both codex entries and creates
 * a bidirectional "member-of" link if both exist and the link is new.
 *
 * @param {Object} createdEntities - { people: Array, houses: Array }
 * @param {Object} options - { userId, datasetId }
 * @returns {Promise<{ created: number, errors: string[] }>}
 */
async function createPostImportCrossLinks(createdEntities, options = {}) {
  const { userId = null, datasetId = null } = options;
  const result = { created: 0, errors: [] };

  try {
    const allLinks = await db.codexLinks.toArray();
    const linkIndex = buildLinkIndex(allLinks);

    const people = createdEntities.people || [];

    for (const person of people) {
      try {
        if (!person.houseId) continue;

        const personEntry = await getEntryByPersonId(person.id, datasetId);
        if (!personEntry) continue;

        const houseEntry = await getEntryByHouseId(person.houseId, datasetId);
        if (!houseEntry) continue;

        if (linkExistsInIndex(linkIndex, personEntry.id, houseEntry.id, 'member-of')) continue;

        const linkData = {
          sourceId: personEntry.id,
          targetId: houseEntry.id,
          type: 'member-of',
          label: 'House Member',
          bidirectional: true
        };

        const linkId = await createLink(linkData, datasetId);

        // Update the index for subsequent iterations
        const a = Number(personEntry.id);
        const b = Number(houseEntry.id);
        linkIndex.add(`member-of:${Math.min(a, b)}:${Math.max(a, b)}`);

        // Sync to cloud if context available
        if (userId && linkId) {
          syncAddCodexLink(userId, datasetId, linkId, linkData);
        }

        result.created++;
      } catch (err) {
        result.errors.push(`${person.firstName || ''} ${person.lastName || ''}: ${err.message}`);
      }
    }
  } catch (err) {
    result.errors.push(`Failed to build link index: ${err.message}`);
  }

  return result;
}

/**
 * Generate a human-readable report from unified import results.
 * @param {Object} result - Result from unifiedImport()
 * @returns {string}
 */
export function generateUnifiedReport(result) {
  const lines = [];
  lines.push('UNIFIED IMPORT REPORT');
  lines.push('='.repeat(50));
  lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push(`Duration: ${result.timing.duration}ms`);
  lines.push('');
  lines.push('SUMMARY:');
  lines.push(`  Houses created:       ${result.summary.housesCreated}`);
  lines.push(`  People created:       ${result.summary.peopleCreated}`);
  lines.push(`  Relationships created: ${result.summary.relationshipsCreated}`);
  lines.push(`  Codex entries created: ${result.summary.codexEntriesCreated}`);
  lines.push(`  Codex entries skipped: ${result.summary.codexEntriesSkipped}`);
  lines.push(`  Codex entries enhanced: ${result.summary.codexEntriesEnhanced}`);
  lines.push(`  Cross-links created:   ${result.summary.crossLinksCreated}`);

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('WARNINGS:');
    result.warnings.forEach(w => lines.push(`  - ${w}`));
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('ERRORS:');
    result.errors.forEach(e => lines.push(`  - ${typeof e === 'string' ? e : e.message || JSON.stringify(e)}`));
  }

  return lines.join('\n');
}
