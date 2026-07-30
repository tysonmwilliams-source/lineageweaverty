/**
 * CODEX SEED DATA IMPORT SCRIPT
 * 
 * This script imports the canonical House Wilfrey data into The Codex database.
 * It handles the import process, creates all entries, and establishes links.
 * 
 * USAGE:
 * 1. Import this function in your app
 * 2. Call importSeedData() from a button or console
 * 3. Data will be imported into the database
 * 
 * IMPORTANT: This is a ONE-TIME import. Running it multiple times will create
 * duplicate entries. Use clearCodex() first if you need to re-import.
 */

import CODEX_SEED_DATA from '../data/codex-seed-data.js';
import { createEntry, getAllEntries } from '../services/codexService.js';
import { logger } from './logger';

/**
 * Import all seed data into The Codex
 * @deprecated Use unifiedImport() from './unifiedImport.js' instead.
 * @returns {Promise<Object>} - Import results with counts and created IDs
 */
export async function importSeedData() {
  logger.log('🌱 Starting Codex seed data import...');
  
  const results = {
    houses: [],
    locations: [],
    events: [],
    personages: [],
    mysteria: [],
    errors: [],
    timing: {
      start: new Date(),
      end: null,
      duration: null
    }
  };
  
  try {
    // Import Houses
    logger.log('📜 Importing Houses...');
    for (const houseData of CODEX_SEED_DATA.houses) {
      try {
        const id = await createEntry(houseData);
        results.houses.push({ title: houseData.title, id });
        logger.log(`  ✓ Created: ${houseData.title} (ID: ${id})`);
      } catch (error) {
        results.errors.push({
          type: 'house',
          title: houseData.title,
          error: error.message
        });
        logger.error(`  ✗ Failed: ${houseData.title}`, error);
      }
    }
    
    // Import Locations
    logger.log('🏰 Importing Locations...');
    for (const locationData of CODEX_SEED_DATA.locations) {
      try {
        const id = await createEntry(locationData);
        results.locations.push({ title: locationData.title, id });
        logger.log(`  ✓ Created: ${locationData.title} (ID: ${id})`);
      } catch (error) {
        results.errors.push({
          type: 'location',
          title: locationData.title,
          error: error.message
        });
        logger.error(`  ✗ Failed: ${locationData.title}`, error);
      }
    }
    
    // Import Events
    logger.log('⚔️ Importing Events...');
    for (const eventData of CODEX_SEED_DATA.events) {
      try {
        const id = await createEntry(eventData);
        results.events.push({ title: eventData.title, id });
        logger.log(`  ✓ Created: ${eventData.title} (ID: ${id})`);
      } catch (error) {
        results.errors.push({
          type: 'event',
          title: eventData.title,
          error: error.message
        });
        logger.error(`  ✗ Failed: ${eventData.title}`, error);
      }
    }
    
    // Import Personages
    logger.log('👤 Importing Personages...');
    for (const personageData of CODEX_SEED_DATA.personages) {
      try {
        const id = await createEntry(personageData);
        results.personages.push({ title: personageData.title, id });
        logger.log(`  ✓ Created: ${personageData.title} (ID: ${id})`);
      } catch (error) {
        results.errors.push({
          type: 'personage',
          title: personageData.title,
          error: error.message
        });
        logger.error(`  ✗ Failed: ${personageData.title}`, error);
      }
    }
    
    // Import Mysteria
    logger.log('✨ Importing Mysteria...');
    for (const mysteriaData of CODEX_SEED_DATA.mysteria) {
      try {
        const id = await createEntry(mysteriaData);
        results.mysteria.push({ title: mysteriaData.title, id });
        logger.log(`  ✓ Created: ${mysteriaData.title} (ID: ${id})`);
      } catch (error) {
        results.errors.push({
          type: 'mysteria',
          title: mysteriaData.title,
          error: error.message
        });
        logger.error(`  ✗ Failed: ${mysteriaData.title}`, error);
      }
    }
    
    // Calculate timing
    results.timing.end = new Date();
    results.timing.duration = results.timing.end - results.timing.start;
    
    // Print summary
    logger.log('\n📊 IMPORT SUMMARY');
    logger.log('═'.repeat(50));
    logger.log(`Houses imported:     ${results.houses.length}`);
    logger.log(`Locations imported:  ${results.locations.length}`);
    logger.log(`Events imported:     ${results.events.length}`);
    logger.log(`Personages imported: ${results.personages.length}`);
    logger.log(`Mysteria imported:   ${results.mysteria.length}`);
    logger.log(`─`.repeat(50));
    logger.log(`Total entries:       ${
      results.houses.length + 
      results.locations.length + 
      results.events.length + 
      results.personages.length + 
      results.mysteria.length
    }`);
    logger.log(`Errors:              ${results.errors.length}`);
    logger.log(`Duration:            ${results.timing.duration}ms`);
    logger.log('═'.repeat(50));
    
    if (results.errors.length > 0) {
      logger.log('\n❌ ERRORS:');
      results.errors.forEach(err => {
        logger.log(`  ${err.type}: ${err.title} - ${err.error}`);
      });
    } else {
      logger.log('\n✅ All entries imported successfully!');
    }
    
    return results;
    
  } catch (error) {
    logger.error('❌ Critical error during import:', error);
    throw error;
  }
}

/**
 * Clear all Codex entries (use with caution!)
 * This is useful if you need to re-import the seed data.
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
    
    // Note: This would need to be implemented in codexService.js
    // For now, direct database access:
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
 * Get import statistics without actually importing
 */
export function getImportPreview() {
  return {
    houses: CODEX_SEED_DATA.houses.length,
    locations: CODEX_SEED_DATA.locations.length,
    events: CODEX_SEED_DATA.events.length,
    personages: CODEX_SEED_DATA.personages.length,
    mysteria: CODEX_SEED_DATA.mysteria.length,
    total: 
      CODEX_SEED_DATA.houses.length +
      CODEX_SEED_DATA.locations.length +
      CODEX_SEED_DATA.events.length +
      CODEX_SEED_DATA.personages.length +
      CODEX_SEED_DATA.mysteria.length
  };
}

/**
 * Example usage in the browser console:
 * 
 * import { importSeedData, clearCodex, getImportPreview } from './utils/import-seed-data.js';
 * 
 * // Preview what will be imported
 * getImportPreview();
 * 
 * // Import the data (first time)
 * await importSeedData();
 * 
 * // Clear and re-import (if needed)
 * await clearCodex();
 * await importSeedData();
 */

export default {
  importSeedData,
  clearCodex,
  getImportPreview
};
