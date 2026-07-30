/**
 * ENHANCED CODEX IMPORT UTILITY
 * 
 * This utility provides flexible import functionality for any codex data structure.
 * It can import from the original seed data, new expansions like the Veritists, or
 * any custom data you create following the same format.
 * 
 * FEATURES:
 * - Import from multiple data sources
 * - Preview before importing
 * - Validation and error handling
 * - Progress tracking
 * - Duplicate detection
 * - Batch operations
 * 
 * USAGE IN YOUR APP:
 * 
 * ```javascript
 * import { importCodexData, importVeritists, clearCodex } from './utils/enhanced-codex-import.js';
 * 
 * // Import original House Wilfrey data
 * await importCodexData('house-wilfrey');
 * 
 * // Import Veritists expansion
 * await importCodexData('veritists');
 * 
 * // Or import both
 * await importCodexData(['house-wilfrey', 'veritists']);
 * 
 * // Custom data import
 * await importCodexData(yourCustomData);
 * ```
 */

import { createEntry, getAllEntries, searchEntriesByTitle } from '../services/codexService.js';
import { syncAddCodexEntry } from '../services/dataSyncService.js';

// Import data sources
import CODEX_SEED_DATA from '../data/codex-seed-data.js';
import { logger } from './logger';

/**
 * Import codex data from various sources
 * @deprecated Use unifiedImport() from './unifiedImport.js' for new imports.
 * This function is kept for backward compatibility with existing import triggers.
 * @param {string|Array|Object} source - Data source(s) to import
 * @param {Object} options - Import options
 * @returns {Promise<Object>} - Import results
 */
export async function importCodexData(source, options = {}) {
  const {
    skipDuplicates = true,
    onProgress = null,
    validateOnly = false,
    userId = null,  // ☁️ Cloud sync: pass userId to sync imported entries
    datasetId = null // Which world to import into; defaults to the default DB
  } = options;
  
  logger.log('📚 Starting enhanced codex import...');
  
  // Parse source and get data
  const dataToImport = parseDataSource(source);
  
  // Validate structure
  const validation = validateDataStructure(dataToImport);
  if (!validation.valid) {
    throw new Error(`Invalid data structure: ${validation.errors.join(', ')}`);
  }
  
  if (validateOnly) {
    return validation;
  }
  
  // Initialize results
  const results = {
    houses: [],
    locations: [],
    events: [],
    personages: [],
    mysteria: [],
    concepts: [],
    errors: [],
    skipped: [],
    timing: {
      start: new Date(),
      end: null,
      duration: null
    }
  };
  
  // Get existing entries for duplicate detection
  const existingEntries = skipDuplicates ? await getAllEntries(datasetId) : [];
  const existingTitles = new Set(existingEntries.map(e => e.title));
  
  // Calculate total for progress tracking
  const total = 
    (dataToImport.houses?.length || 0) +
    (dataToImport.locations?.length || 0) +
    (dataToImport.events?.length || 0) +
    (dataToImport.personages?.length || 0) +
    (dataToImport.mysteria?.length || 0) +
    (dataToImport.concepts?.length || 0);
  
  let processed = 0;
  
  try {
    // Import each category
    const categories = [
      { key: 'houses', icon: '📜', name: 'Houses' },
      { key: 'locations', icon: '🏰', name: 'Locations' },
      { key: 'events', icon: '⚔️', name: 'Events' },
      { key: 'personages', icon: '👤', name: 'Personages' },
      { key: 'mysteria', icon: '✨', name: 'Mysteria' },
      { key: 'concepts', icon: '⚖️', name: 'Concepts' }
    ];
    
    for (const category of categories) {
      const items = dataToImport[category.key] || [];
      
      if (items.length === 0) continue;
      
      logger.log(`\n${category.icon} Importing ${category.name}...`);
      
      for (const item of items) {
        processed++;
        
        // Check for duplicates
        if (skipDuplicates && existingTitles.has(item.title)) {
          logger.log(`  ⊘ Skipped (duplicate): ${item.title}`);
          results.skipped.push({
            type: category.key,
            title: item.title,
            reason: 'Duplicate title'
          });
          
          if (onProgress) {
            onProgress({ processed, total, current: item.title, skipped: true });
          }
          continue;
        }
        
        // Import the entry
        try {
          const id = await createEntry(item, datasetId);
          results[category.key].push({ title: item.title, id });
          logger.log(`  ✓ Created: ${item.title} (ID: ${id})`);

          // ☁️ CLOUD SYNC: Push to Firestore so entries persist across sessions
          if (userId) {
            try {
              await syncAddCodexEntry(userId, datasetId, id, { ...item, id });
              logger.log(`  ☁️ Synced to cloud: ${item.title}`);
            } catch (syncErr) {
              logger.warn(`  ⚠️ Cloud sync failed for ${item.title}:`, syncErr.message);
              // Don't fail the import - local entry is still saved
            }
          }
          
          if (onProgress) {
            onProgress({ processed, total, current: item.title, success: true });
          }
        } catch (error) {
          results.errors.push({
            type: category.key,
            title: item.title,
            error: error.message
          });
          logger.error(`  ✗ Failed: ${item.title}`, error);
          
          if (onProgress) {
            onProgress({ processed, total, current: item.title, error: true });
          }
        }
      }
    }
    
    // Calculate timing
    results.timing.end = new Date();
    results.timing.duration = results.timing.end - results.timing.start;
    
    // Print summary
    printImportSummary(results);
    
    return results;
    
  } catch (error) {
    logger.error('❌ Critical error during import:', error);
    throw error;
  }
}

/**
 * Parse data source into standard format
 * @param {string|Array|Object} source - Various source formats
 * @returns {Object} - Standardized data object
 */
function parseDataSource(source) {
  // If it's already an object with the right structure, use it
  if (isValidDataStructure(source)) {
    return source;
  }
  
  // If it's a string identifier
  if (typeof source === 'string') {
    if (source === 'house-wilfrey' || source === 'seed' || source === 'original') {
      return CODEX_SEED_DATA;
    }
    if (source === 'veritists') {
      // This would need to be imported dynamically or included
      throw new Error('Veritists data must be imported separately. Use: import VERITISTS_CODEX_DATA from "./veritists-codex-import.js"');
    }
    throw new Error(`Unknown data source: ${source}`);
  }
  
  // If it's an array of identifiers, merge them
  if (Array.isArray(source)) {
    const merged = {
      houses: [],
      locations: [],
      events: [],
      personages: [],
      mysteria: [],
      concepts: []
    };
    
    for (const src of source) {
      const data = parseDataSource(src);
      merged.houses.push(...(data.houses || []));
      merged.locations.push(...(data.locations || []));
      merged.events.push(...(data.events || []));
      merged.personages.push(...(data.personages || []));
      merged.mysteria.push(...(data.mysteria || []));
      merged.concepts.push(...(data.concepts || []));
    }
    
    return merged;
  }
  
  throw new Error('Invalid data source format');
}

/**
 * Check if object has valid data structure
 * @param {Object} obj - Object to check
 * @returns {boolean}
 */
function isValidDataStructure(obj) {
  if (!obj || typeof obj !== 'object') return false;
  
  const hasValidCategory = 
    Array.isArray(obj.houses) ||
    Array.isArray(obj.locations) ||
    Array.isArray(obj.events) ||
    Array.isArray(obj.personages) ||
    Array.isArray(obj.mysteria) ||
    Array.isArray(obj.concepts);
  
  return hasValidCategory;
}

/**
 * Validate data structure
 * @param {Object} data - Data to validate
 * @returns {Object} - Validation result
 */
function validateDataStructure(data) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { valid: false, errors };
  }
  
  const validCategories = ['houses', 'locations', 'events', 'personages', 'mysteria', 'concepts'];
  const foundCategories = Object.keys(data).filter(k => validCategories.includes(k));
  
  if (foundCategories.length === 0) {
    errors.push('Data must contain at least one valid category (houses, locations, events, personages, mysteria)');
  }
  
  // Validate each category's entries
  for (const category of foundCategories) {
    const items = data[category];
    
    if (!Array.isArray(items)) {
      errors.push(`${category} must be an array`);
      continue;
    }
    
    items.forEach((item, index) => {
      if (!item.title) {
        errors.push(`${category}[${index}] missing required field: title`);
      }
      if (!item.type) {
        errors.push(`${category}[${index}] missing required field: type`);
      }
      if (!item.content) {
        errors.push(`${category}[${index}] missing required field: content`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    categories: foundCategories,
    counts: foundCategories.reduce((acc, cat) => {
      acc[cat] = data[cat].length;
      return acc;
    }, {})
  };
}

/**
 * Print import summary
 * @param {Object} results - Import results
 */
function printImportSummary(results) {
  const totalImported = 
    results.houses.length +
    results.locations.length +
    results.events.length +
    results.personages.length +
    results.mysteria.length +
    (results.concepts?.length || 0);
  
  logger.log('\n📊 IMPORT SUMMARY');
  logger.log('═'.repeat(50));
  logger.log(`Houses imported:     ${results.houses.length}`);
  logger.log(`Locations imported:  ${results.locations.length}`);
  logger.log(`Events imported:     ${results.events.length}`);
  logger.log(`Personages imported: ${results.personages.length}`);
  logger.log(`Mysteria imported:   ${results.mysteria.length}`);
  logger.log(`Concepts imported:   ${results.concepts?.length || 0}`);
  logger.log(`─`.repeat(50));
  logger.log(`Total imported:      ${totalImported}`);
  logger.log(`Skipped (duplicates):${results.skipped.length}`);
  logger.log(`Errors:              ${results.errors.length}`);
  logger.log(`Duration:            ${results.timing.duration}ms`);
  logger.log('═'.repeat(50));
  
  if (results.skipped.length > 0) {
    logger.log('\n⊘ SKIPPED ENTRIES:');
    results.skipped.forEach(item => {
      logger.log(`  ${item.type}: ${item.title} - ${item.reason}`);
    });
  }
  
  if (results.errors.length > 0) {
    logger.log('\n❌ ERRORS:');
    results.errors.forEach(err => {
      logger.log(`  ${err.type}: ${err.title} - ${err.error}`);
    });
  } else if (totalImported > 0) {
    logger.log('\n✅ All entries imported successfully!');
  }
}

/**
 * Clear all Codex entries (use with caution!)
 */
export async function clearCodex() {
  const confirm = window.confirm(
    '⚠️ WARNING: This will delete ALL Codex entries.\n\n' +
    'This action cannot be undone.\n\n' +
    'Are you sure you want to continue?'
  );
  
  if (!confirm) {
    logger.log('Codex clear cancelled by user');
    return false;
  }
  
  try {
    const allEntries = await getAllEntries();
    logger.log(`🗑️ Clearing ${allEntries.length} Codex entries...`);
    
    const { db } = await import('../services/database.js');
    await db.codexEntries.clear();
    await db.codexLinks.clear();
    
    logger.log('✅ Codex cleared successfully');
    return true;
  } catch (error) {
    logger.error('❌ Error clearing Codex:', error);
    throw error;
  }
}

/**
 * Get import preview without actually importing
 * @param {string|Array|Object} source - Data source to preview
 * @returns {Object} - Preview data
 */
export function getImportPreview(source) {
  try {
    const data = parseDataSource(source);
    const validation = validateDataStructure(data);
    
    return {
      valid: validation.valid,
      errors: validation.errors,
      categories: validation.categories,
      counts: validation.counts,
      total: Object.values(validation.counts || {}).reduce((sum, count) => sum + count, 0)
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message],
      categories: [],
      counts: {},
      total: 0
    };
  }
}

/**
 * Quick imports for specific data sets
 */
export const quickImports = {
  /**
   * Import original House Wilfrey seed data
   */
  async houseWilfrey(options = {}) {
    return await importCodexData(CODEX_SEED_DATA, options);
  },
  
  /**
   * Import Veritists data (must be provided)
   */
  async veritists(veritistsData, options = {}) {
    if (!veritistsData) {
      throw new Error('Veritists data must be provided. Import it first: import VERITISTS_CODEX_DATA from "./veritists-codex-import.js"');
    }
    return await importCodexData(veritistsData, options);
  },
  
  /**
   * Import both House Wilfrey and Veritists
   */
  async everything(veritistsData, options = {}) {
    if (!veritistsData) {
      throw new Error('Veritists data must be provided');
    }
    
    const results1 = await this.houseWilfrey(options);
    const results2 = await this.veritists(veritistsData, options);
    
    // Merge results
    return {
      houses: [...results1.houses, ...results2.houses],
      locations: [...results1.locations, ...results2.locations],
      events: [...results1.events, ...results2.events],
      personages: [...results1.personages, ...results2.personages],
      mysteria: [...results1.mysteria, ...results2.mysteria],
      errors: [...results1.errors, ...results2.errors],
      skipped: [...results1.skipped, ...results2.skipped],
      timing: {
        start: results1.timing.start,
        end: results2.timing.end,
        duration: results1.timing.duration + results2.timing.duration
      }
    };
  }
};

export default {
  importCodexData,
  clearCodex,
  getImportPreview,
  quickImports
};
