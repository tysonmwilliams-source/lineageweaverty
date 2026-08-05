/**
 * Context Library Service
 *
 * PURPOSE:
 * Auto-generates, maintains, and serves filtered context files for AI tools and reference.
 * Dynamically discovers which houses qualify for dedicated contexts based on data thresholds.
 * Watches for data changes and auto-regenerates affected contexts.
 *
 * ARCHITECTURE:
 * - contextRegistry: Tracks which contexts exist and their status
 * - contextFiles: Stores generated file content
 * - contextLog: Audit trail of all generation events
 *
 * CONTEXT TYPES:
 * - 'master': Always exists, contains overview of everything
 * - 'house': One per house that meets threshold (10+ people OR 5+ codex entries)
 * - 'minor': Grouped context for houses below threshold
 *
 * AUTO-UPDATE FLOW:
 * 1. Data change occurs (person/house/codex/relationship)
 * 2. notifyChange() called by data services
 * 3. Change queued with debouncing (5s default)
 * 4. Affected contexts identified
 * 5. Only affected contexts regenerated
 * 6. Log entry created
 */

import { getDatabase } from './database.js';
import { getAllPeople, getPeopleByHouse } from './database.js';
import { getAllHouses, getHouse } from './database.js';
import { getAllRelationships } from './database.js';
import { getAllEntries } from './codexService.js';
import { getAllDignities, getTenuresForDignity, DIGNITY_CLASSES, DIGNITY_RANKS } from './dignityService.js';
import { getAllHeraldry } from './heraldryService.js';
import { logger } from '../utils/logger';

// ==================== CONFIGURATION ====================

/**
 * Thresholds for context creation
 * A house gets its own context if it meets ANY of these thresholds
 */
export const CONTEXT_THRESHOLDS = {
  MIN_PEOPLE: 10,        // Minimum people to qualify for dedicated context
  MIN_CODEX_ENTRIES: 5,  // Minimum codex entries to qualify
  MIN_RELATIONSHIPS: 15  // Minimum relationships to qualify
};

/**
 * Debounce delay for change processing (ms)
 * Waits for activity to stop before regenerating
 */
export const DEBOUNCE_DELAY = 5000; // 5 seconds

/**
 * Maximum file size target (bytes)
 * Files are split if they exceed this
 */
export const MAX_FILE_SIZE = 100 * 1024; // 100KB

// ==================== CHANGE WATCHER STATE ====================

// Pending changes queue (debounced)
let pendingChanges = [];
let debounceTimer = null;
let isProcessing = false;

// Subscribers for context updates
const subscribers = new Set();

// ==================== REGISTRY OPERATIONS ====================

/**
 * Get the full context registry
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Array>} All registered contexts
 */
export async function getContextRegistry(datasetId) {
  try {
    const db = getDatabase(datasetId);
    return await db.contextRegistry.toArray();
  } catch (error) {
    logger.error('Error getting context registry:', error);
    return [];
  }
}

/**
 * Get a specific context by ID
 * @param {string} contextId - Context ID (e.g., 'master', 'wilfrey', 'wilson')
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object|null>} Context registry entry
 */
export async function getContext(contextId, datasetId) {
  try {
    const db = getDatabase(datasetId);
    return await db.contextRegistry.where('contextId').equals(contextId).first();
  } catch (error) {
    logger.error('Error getting context:', error);
    return null;
  }
}

/**
 * Get all files for a context
 * @param {string} contextId - Context ID
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Array>} Context files
 */
export async function getContextFiles(contextId, datasetId) {
  try {
    const db = getDatabase(datasetId);
    return await db.contextFiles.where('contextId').equals(contextId).toArray();
  } catch (error) {
    logger.error('Error getting context files:', error);
    return [];
  }
}

/**
 * Get a specific file from a context
 * @param {string} contextId - Context ID
 * @param {string} filePath - File path within context (e.g., 'people/breakmount.json')
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object|null>} File content and metadata
 */
export async function getContextFile(contextId, filePath, datasetId) {
  try {
    const db = getDatabase(datasetId);
    return await db.contextFiles
      .where('contextId').equals(contextId)
      .and(f => f.filePath === filePath)
      .first();
  } catch (error) {
    logger.error('Error getting context file:', error);
    return null;
  }
}

/**
 * Get context generation log
 * @param {string} contextId - Context ID (optional, all if not provided)
 * @param {number} limit - Max entries to return
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Array>} Log entries
 */
export async function getContextLog(contextId, limit = 50, datasetId) {
  try {
    const db = getDatabase(datasetId);
    let query = db.contextLog.orderBy('timestamp').reverse();

    if (contextId) {
      query = query.filter(entry => entry.contextId === contextId);
    }

    return await query.limit(limit).toArray();
  } catch (error) {
    logger.error('Error getting context log:', error);
    return [];
  }
}

// ==================== DISCOVERY & THRESHOLDS ====================

/**
 * Analyze all houses and determine which qualify for dedicated contexts
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} Discovery results with qualifying houses
 */
export async function discoverContexts(datasetId) {
  try {
    const [houses, people, codexEntries, relationships] = await Promise.all([
      getAllHouses(datasetId),
      getAllPeople(datasetId),
      getAllEntries(datasetId),
      getAllRelationships(datasetId)
    ]);

    // Build house stats
    const houseStats = new Map();

    // Initialize all houses
    for (const house of houses) {
      houseStats.set(house.id, {
        house,
        houseId: house.id,
        houseName: house.houseName,
        peopleCount: 0,
        codexCount: 0,
        relationshipCount: 0,
        qualifies: false,
        threshold: 'none'
      });
    }

    // Count people per house
    for (const person of people) {
      if (person.houseId && houseStats.has(person.houseId)) {
        houseStats.get(person.houseId).peopleCount++;
      }
    }

    // Count codex entries per house (by content matching)
    for (const entry of codexEntries) {
      // Check houseId direct link
      if (entry.houseId && houseStats.has(entry.houseId)) {
        houseStats.get(entry.houseId).codexCount++;
        continue;
      }

      // Check content for house name mentions
      const content = JSON.stringify(entry).toLowerCase();
      for (const [houseId, stats] of houseStats) {
        if (content.includes(stats.houseName.toLowerCase())) {
          stats.codexCount++;
        }
      }
    }

    // Count relationships per house
    for (const rel of relationships) {
      const person1 = people.find(p => p.id === rel.person1Id);
      const person2 = people.find(p => p.id === rel.person2Id);

      if (person1?.houseId && houseStats.has(person1.houseId)) {
        houseStats.get(person1.houseId).relationshipCount++;
      }
      if (person2?.houseId && houseStats.has(person2.houseId) && person2.houseId !== person1?.houseId) {
        houseStats.get(person2.houseId).relationshipCount++;
      }
    }

    // Determine which houses qualify
    const majorHouses = [];
    const minorHouses = [];

    for (const [houseId, stats] of houseStats) {
      if (stats.peopleCount >= CONTEXT_THRESHOLDS.MIN_PEOPLE) {
        stats.qualifies = true;
        stats.threshold = 'people';
      } else if (stats.codexCount >= CONTEXT_THRESHOLDS.MIN_CODEX_ENTRIES) {
        stats.qualifies = true;
        stats.threshold = 'codex';
      } else if (stats.relationshipCount >= CONTEXT_THRESHOLDS.MIN_RELATIONSHIPS) {
        stats.qualifies = true;
        stats.threshold = 'relationships';
      }

      if (stats.qualifies) {
        majorHouses.push(stats);
      } else {
        minorHouses.push(stats);
      }
    }

    // Sort by people count descending
    majorHouses.sort((a, b) => b.peopleCount - a.peopleCount);
    minorHouses.sort((a, b) => b.peopleCount - a.peopleCount);

    return {
      totalHouses: houses.length,
      totalPeople: people.length,
      totalCodex: codexEntries.length,
      totalRelationships: relationships.length,
      majorHouses,
      minorHouses,
      thresholds: CONTEXT_THRESHOLDS
    };
  } catch (error) {
    logger.error('Error discovering contexts:', error);
    throw error;
  }
}

/**
 * Get stats for a specific house
 * @param {number} houseId - House ID
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} House stats
 */
export async function getHouseStats(houseId, datasetId) {
  try {
    const house = await getHouse(houseId, datasetId);
    if (!house) return null;

    const people = await getPeopleByHouse(houseId, datasetId);
    const codexEntries = await getAllEntries(datasetId);
    const relationships = await getAllRelationships(datasetId);

    // Count codex entries mentioning this house
    const houseName = house.houseName.toLowerCase();
    let codexCount = 0;
    for (const entry of codexEntries) {
      if (entry.houseId === houseId) {
        codexCount++;
      } else {
        const content = JSON.stringify(entry).toLowerCase();
        if (content.includes(houseName)) {
          codexCount++;
        }
      }
    }

    // Count relationships involving house members
    const peopleIds = new Set(people.map(p => p.id));
    let relationshipCount = 0;
    for (const rel of relationships) {
      if (peopleIds.has(rel.person1Id) || peopleIds.has(rel.person2Id)) {
        relationshipCount++;
      }
    }

    const qualifies =
      people.length >= CONTEXT_THRESHOLDS.MIN_PEOPLE ||
      codexCount >= CONTEXT_THRESHOLDS.MIN_CODEX_ENTRIES ||
      relationshipCount >= CONTEXT_THRESHOLDS.MIN_RELATIONSHIPS;

    return {
      house,
      houseId,
      houseName: house.houseName,
      peopleCount: people.length,
      codexCount,
      relationshipCount,
      qualifies,
      thresholds: CONTEXT_THRESHOLDS
    };
  } catch (error) {
    logger.error('Error getting house stats:', error);
    return null;
  }
}

// ==================== CONTEXT GENERATION ====================

/**
 * Generate all contexts based on current data
 * This is the main entry point for full regeneration
 * @param {string} datasetId - Dataset ID
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation results
 */
export async function generateAllContexts(datasetId, options = {}) {
  const startTime = Date.now();
  const results = {
    generated: [],
    errors: [],
    stats: {}
  };

  try {
    logger.log('📚 Starting full context generation...');

    // Discover which contexts should exist
    const discovery = await discoverContexts(datasetId);
    results.stats.discovery = discovery;

    // Always generate master context
    try {
      await generateMasterContext(datasetId);
      results.generated.push('master');
      await logContextEvent('master', 'generated', 'full-regeneration', datasetId, { duration: Date.now() - startTime });
    } catch (error) {
      results.errors.push({ context: 'master', error: error.message });
    }

    // Generate context for each major house
    for (const houseStats of discovery.majorHouses) {
      try {
        await generateHouseContext(houseStats.houseId, datasetId);
        results.generated.push(houseStats.houseName.toLowerCase());
        await logContextEvent(
          houseStats.houseName.toLowerCase(),
          'generated',
          'full-regeneration',
          datasetId,
          { houseId: houseStats.houseId, stats: houseStats }
        );
      } catch (error) {
        results.errors.push({ context: houseStats.houseName, error: error.message });
      }
    }

    // Generate minor houses grouped context
    if (discovery.minorHouses.length > 0) {
      try {
        await generateMinorHousesContext(discovery.minorHouses, datasetId);
        results.generated.push('minor-houses');
        await logContextEvent('minor-houses', 'generated', 'full-regeneration', datasetId, {
          houseCount: discovery.minorHouses.length
        });
      } catch (error) {
        results.errors.push({ context: 'minor-houses', error: error.message });
      }
    }

    results.duration = Date.now() - startTime;
    logger.log(`✅ Context generation complete in ${results.duration}ms`);
    logger.log(`   Generated: ${results.generated.length} contexts`);
    if (results.errors.length > 0) {
      logger.warn(`   Errors: ${results.errors.length}`);
    }

    // Notify subscribers
    notifySubscribers('generation-complete', results);

    // Auto-export to disk for Claude Code
    if (isAutoDiskExportEnabled()) {
      try {
        const diskResults = await exportContextToDisk(datasetId);
        results.diskExport = diskResults;
        logger.log(`📁 Context files exported to disk (${diskResults.files?.length || 0} files)`);
      } catch (diskError) {
        logger.warn('Could not export context to disk:', diskError);
        results.diskExport = { success: false, error: diskError.message };
      }
    }

    return results;
  } catch (error) {
    logger.error('Error in generateAllContexts:', error);
    throw error;
  }
}

/**
 * Generate the master context (overview of everything)
 * @param {string} datasetId - Dataset ID
 */
async function generateMasterContext(datasetId) {
  const db = getDatabase(datasetId);
  const contextId = 'master';

  // Get all data
  const [houses, people, codexEntries, relationships] = await Promise.all([
    getAllHouses(datasetId),
    getAllPeople(datasetId),
    getAllEntries(datasetId),
    getAllRelationships(datasetId)
  ]);

  // Clear existing files for this context
  await db.contextFiles.where('contextId').equals(contextId).delete();

  // Generate index file
  const indexContent = {
    contextId: 'master',
    contextType: 'master',
    generatedAt: new Date().toISOString(),
    stats: {
      houses: houses.length,
      people: people.length,
      codexEntries: codexEntries.length,
      relationships: relationships.length
    },
    files: [
      '_index.json',
      'houses-summary.json',
      'people-summary.json',
      'codex-summary.json',
      'timeline.json'
    ]
  };

  await saveContextFile(contextId, '_index.json', indexContent, 'index', datasetId);

  // Generate houses summary
  const housesSummary = houses.map(h => ({
    id: h.id,
    name: h.houseName,
    type: h.houseType,
    parentHouseId: h.parentHouseId,
    memberCount: people.filter(p => p.houseId === h.id).length
  }));
  await saveContextFile(contextId, 'houses-summary.json', housesSummary, 'summary', datasetId);

  // Generate people summary (minimal fields)
  const peopleSummary = people.map(p => ({
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    houseId: p.houseId,
    birth: p.dateOfBirth,
    death: p.dateOfDeath
  }));
  await saveContextFile(contextId, 'people-summary.json', peopleSummary, 'summary', datasetId);

  // Generate codex summary
  const codexSummary = codexEntries.map(e => ({
    id: e.id,
    type: e.type,
    title: e.title,
    category: e.category,
    tags: e.tags
  }));
  await saveContextFile(contextId, 'codex-summary.json', codexSummary, 'summary', datasetId);

  // Generate timeline (events from codex)
  const events = codexEntries
    .filter(e => e.type === 'event')
    .map(e => ({
      id: e.id,
      title: e.title,
      era: e.era,
      category: e.category
    }));
  await saveContextFile(contextId, 'timeline.json', events, 'timeline', datasetId);

  // Update registry
  await updateContextRegistry(contextId, 'master', null, datasetId, {
    stats: indexContent.stats
  });
}

/**
 * Generate context for a specific house
 * @param {number} houseId - House ID
 * @param {string} datasetId - Dataset ID
 */
async function generateHouseContext(houseId, datasetId) {
  const db = getDatabase(datasetId);
  const house = await getHouse(houseId, datasetId);
  if (!house) throw new Error(`House ${houseId} not found`);

  const contextId = house.houseName.toLowerCase().replace(/\s+/g, '-');
  const houseName = house.houseName.toLowerCase();

  // Get all data
  const [allPeople, allHouses, allCodex, allRelationships] = await Promise.all([
    getAllPeople(datasetId),
    getAllHouses(datasetId),
    getAllEntries(datasetId),
    getAllRelationships(datasetId)
  ]);

  // Filter to house-related data
  const people = allPeople.filter(p => p.houseId === houseId);
  const peopleIds = new Set(people.map(p => p.id));

  // Get cadet houses
  const cadetHouses = allHouses.filter(h => h.parentHouseId === houseId);
  const allRelatedHouseIds = new Set([houseId, ...cadetHouses.map(h => h.id)]);

  // Get people from cadet houses too
  const cadetPeople = allPeople.filter(p => cadetHouses.some(h => h.id === p.houseId));
  const allRelatedPeopleIds = new Set([...peopleIds, ...cadetPeople.map(p => p.id)]);

  // Filter codex entries
  const codexEntries = allCodex.filter(e => {
    if (e.houseId === houseId) return true;
    if (allRelatedPeopleIds.has(e.personId)) return true;
    const content = JSON.stringify(e).toLowerCase();
    return content.includes(houseName);
  });

  // Filter relationships
  const relationships = allRelationships.filter(r =>
    allRelatedPeopleIds.has(r.person1Id) || allRelatedPeopleIds.has(r.person2Id)
  );

  // Clear existing files
  await db.contextFiles.where('contextId').equals(contextId).delete();

  // Generate index
  const indexContent = {
    contextId,
    contextType: 'house',
    houseId,
    houseName: house.houseName,
    generatedAt: new Date().toISOString(),
    stats: {
      people: people.length + cadetPeople.length,
      codexEntries: codexEntries.length,
      relationships: relationships.length,
      cadetHouses: cadetHouses.length
    },
    files: []
  };

  // Generate people file(s)
  const allHousePeople = [...people, ...cadetPeople];
  if (allHousePeople.length > 0) {
    const peopleData = allHousePeople.map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      birth: p.dateOfBirth,
      death: p.dateOfDeath,
      houseId: p.houseId,
      legitimacyStatus: p.legitimacyStatus,
      notes: p.notes,
      epithets: p.epithets
    }));
    await saveContextFile(contextId, 'people.json', peopleData, 'people', datasetId);
    indexContent.files.push('people.json');
  }

  // Generate codex files by type
  const codexByType = {};
  for (const entry of codexEntries) {
    const type = entry.type || 'other';
    if (!codexByType[type]) codexByType[type] = [];
    codexByType[type].push(entry);
  }

  for (const [type, entries] of Object.entries(codexByType)) {
    const fileName = `codex-${type}.json`;
    await saveContextFile(contextId, fileName, entries, 'codex', datasetId);
    indexContent.files.push(fileName);
  }

  // Generate relationships file
  if (relationships.length > 0) {
    await saveContextFile(contextId, 'relationships.json', relationships, 'relationships', datasetId);
    indexContent.files.push('relationships.json');
  }

  // Generate houses file (main + cadets)
  const housesData = [house, ...cadetHouses].map(h => ({
    id: h.id,
    name: h.houseName,
    type: h.houseType,
    parentHouseId: h.parentHouseId,
    motto: h.motto,
    notes: h.notes
  }));
  await saveContextFile(contextId, 'houses.json', housesData, 'houses', datasetId);
  indexContent.files.push('houses.json');

  // Save index
  await saveContextFile(contextId, '_index.json', indexContent, 'index', datasetId);

  // Update registry
  await updateContextRegistry(contextId, 'house', houseId, datasetId, {
    stats: indexContent.stats
  });
}

/**
 * Generate grouped context for minor houses
 * @param {Array} minorHouses - Array of minor house stats
 * @param {string} datasetId - Dataset ID
 */
async function generateMinorHousesContext(minorHouses, datasetId) {
  const db = getDatabase(datasetId);
  const contextId = 'minor-houses';

  // Clear existing files
  await db.contextFiles.where('contextId').equals(contextId).delete();

  // Get all data for minor houses
  const houseIds = new Set(minorHouses.map(h => h.houseId));
  const allPeople = await getAllPeople(datasetId);
  const allCodex = await getAllEntries(datasetId);

  const people = allPeople.filter(p => houseIds.has(p.houseId));

  // Generate index
  const indexContent = {
    contextId,
    contextType: 'minor',
    generatedAt: new Date().toISOString(),
    stats: {
      houses: minorHouses.length,
      people: people.length
    },
    houses: minorHouses.map(h => ({
      id: h.houseId,
      name: h.houseName,
      peopleCount: h.peopleCount,
      codexCount: h.codexCount
    })),
    files: ['_index.json', 'all-data.json']
  };

  await saveContextFile(contextId, '_index.json', indexContent, 'index', datasetId);

  // Generate combined data file
  const allData = {
    houses: minorHouses.map(h => h.house),
    people: people.map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      houseId: p.houseId,
      birth: p.dateOfBirth,
      death: p.dateOfDeath
    }))
  };
  await saveContextFile(contextId, 'all-data.json', allData, 'combined', datasetId);

  // Update registry
  await updateContextRegistry(contextId, 'minor', null, datasetId, {
    stats: indexContent.stats,
    houseIds: Array.from(houseIds)
  });
}

// ==================== FILE OPERATIONS ====================

/**
 * Save a context file to the database
 * @param {string} contextId - Context ID
 * @param {string} filePath - File path within context
 * @param {Object} content - File content
 * @param {string} fileType - Type of file (index, people, codex, etc.)
 * @param {string} datasetId - Dataset ID
 */
async function saveContextFile(contextId, filePath, content, fileType, datasetId) {
  const db = getDatabase(datasetId);
  const contentStr = JSON.stringify(content, null, 2);

  await db.contextFiles.add({
    contextId,
    filePath,
    fileType,
    content: contentStr,
    size: contentStr.length,
    itemCount: Array.isArray(content) ? content.length : 1,
    generatedAt: new Date().toISOString()
  });
}

/**
 * Update the context registry entry
 * @param {string} contextId - Context ID
 * @param {string} contextType - Type (master, house, minor)
 * @param {number|null} houseId - House ID if applicable
 * @param {string} datasetId - Dataset ID
 * @param {Object} metadata - Additional metadata
 */
async function updateContextRegistry(contextId, contextType, houseId, datasetId, metadata = {}) {
  const db = getDatabase(datasetId);
  const now = new Date().toISOString();

  // Check if exists
  const existing = await db.contextRegistry.where('contextId').equals(contextId).first();

  if (existing) {
    await db.contextRegistry.update(existing.id, {
      lastGenerated: now,
      status: 'current',
      ...metadata
    });
  } else {
    await db.contextRegistry.add({
      contextId,
      contextType,
      houseId,
      status: 'current',
      lastGenerated: now,
      lastSourceChange: null,
      tags: [contextType],
      ...metadata
    });
  }
}

/**
 * Log a context event
 * @param {string} contextId - Context ID
 * @param {string} event - Event type (generated, invalidated, etc.)
 * @param {string} trigger - What triggered this event
 * @param {string} datasetId - Dataset ID
 * @param {Object} stats - Additional stats
 */
async function logContextEvent(contextId, event, trigger, datasetId, stats = {}) {
  const db = getDatabase(datasetId);

  await db.contextLog.add({
    contextId,
    event,
    trigger,
    timestamp: new Date().toISOString(),
    duration: stats.duration || null,
    stats: JSON.stringify(stats)
  });
}

// ==================== CHANGE WATCHING ====================

/**
 * Notify the context system of a data change
 * Called by data services when entities are created/updated/deleted
 *
 * @param {string} entityType - Type of entity (person, house, codex, relationship)
 * @param {string} operation - Operation (create, update, delete)
 * @param {*} entity - The entity data, of whatever shape entityType implies
 * @param {string|null} [datasetId] - Dataset ID
 */
export function notifyChange(entityType, operation, entity, datasetId) {
  pendingChanges.push({
    entityType,
    operation,
    entity,
    datasetId,
    timestamp: Date.now()
  });

  // Reset debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    processChanges(datasetId);
  }, DEBOUNCE_DELAY);

  logger.log(`📝 Context change queued: ${entityType}:${operation} (${pendingChanges.length} pending)`);
}

/**
 * Process pending changes and regenerate affected contexts
 * @param {string} datasetId - Dataset ID
 */
async function processChanges(datasetId) {
  if (isProcessing || pendingChanges.length === 0) return;

  isProcessing = true;
  const changes = [...pendingChanges];
  pendingChanges = [];

  logger.log(`🔄 Processing ${changes.length} pending changes...`);

  try {
    // Determine which contexts are affected
    const affectedContexts = new Set();
    affectedContexts.add('master'); // Master always affected

    for (const change of changes) {
      // Determine which house context is affected
      let houseId = null;

      if (change.entityType === 'person' && change.entity?.houseId) {
        houseId = change.entity.houseId;
      } else if (change.entityType === 'house') {
        houseId = change.entity?.id;
      } else if (change.entityType === 'codex' && change.entity?.houseId) {
        houseId = change.entity.houseId;
      }

      if (houseId) {
        const house = await getHouse(houseId, datasetId);
        if (house) {
          affectedContexts.add(house.houseName.toLowerCase().replace(/\s+/g, '-'));
        }
      }
    }

    // Regenerate affected contexts
    for (const contextId of affectedContexts) {
      try {
        if (contextId === 'master') {
          await generateMasterContext(datasetId);
        } else {
          // Find house by context ID
          const houses = await getAllHouses(datasetId);
          const house = houses.find(h =>
            h.houseName.toLowerCase().replace(/\s+/g, '-') === contextId
          );
          if (house) {
            await generateHouseContext(house.id, datasetId);
          }
        }

        await logContextEvent(contextId, 'regenerated', 'data-change', datasetId, {
          changeCount: changes.length
        });
      } catch (error) {
        logger.error(`Error regenerating context ${contextId}:`, error);
      }
    }

    // Notify subscribers
    notifySubscribers('contexts-updated', {
      affectedContexts: Array.from(affectedContexts),
      changeCount: changes.length
    });

    // Auto-export to disk for Claude Code
    if (isAutoDiskExportEnabled()) {
      try {
        await exportContextToDisk(datasetId);
      } catch (diskError) {
        logger.warn('Could not export context to disk:', diskError);
      }
    }

    logger.log(`✅ Regenerated ${affectedContexts.size} contexts`);
  } catch (error) {
    logger.error('Error processing changes:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Force immediate processing of pending changes
 * @param {string} datasetId - Dataset ID
 */
export async function flushChanges(datasetId) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await processChanges(datasetId);
}

// ==================== SUBSCRIPTION ====================

/**
 * Subscribe to context updates
 * @param {Function} callback - Called when contexts are updated
 * @returns {Function} Unsubscribe function
 */
export function subscribeToContextUpdates(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * Notify all subscribers of an event
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
function notifySubscribers(event, data) {
  for (const callback of subscribers) {
    try {
      callback(event, data);
    } catch (error) {
      logger.error('Error in context subscriber:', error);
    }
  }
}

// ==================== EXPORT OPERATIONS ====================

/**
 * Export a context as a downloadable ZIP structure
 * @param {string} contextId - Context ID
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} Export data with files and metadata
 */
export async function exportContext(contextId, datasetId) {
  const context = await getContext(contextId, datasetId);
  if (!context) {
    throw new Error(`Context '${contextId}' not found`);
  }

  const files = await getContextFiles(contextId, datasetId);

  return {
    contextId,
    contextType: context.contextType,
    generatedAt: context.lastGenerated,
    files: files.map(f => ({
      path: f.filePath,
      content: f.content,
      size: f.size,
      itemCount: f.itemCount
    }))
  };
}

/**
 * Export all contexts as a single download
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} All contexts with files
 */
export async function exportAllContexts(datasetId) {
  const registry = await getContextRegistry(datasetId);
  const exports = {};

  for (const context of registry) {
    exports[context.contextId] = await exportContext(context.contextId, datasetId);
  }

  return {
    exportedAt: new Date().toISOString(),
    contextCount: registry.length,
    contexts: exports
  };
}

/**
 * Download a context as JSON file
 * @param {string} contextId - Context ID
 * @param {string} datasetId - Dataset ID
 */
export async function downloadContext(contextId, datasetId) {
  const exportData = await exportContext(contextId, datasetId);

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `context-${contextId}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ==================== DISK EXPORT (FOR CLAUDE CODE) ====================

/**
 * Check if running in dev mode with disk export available
 */
function isDiskExportAvailable() {
  return import.meta.env.DEV;
}

/**
 * Export a file to disk via the dev server endpoint
 * Only works when running `npm run dev`
 * @param {string} filename - Filename to write
 * @param {Object} content - Content to write
 * @returns {Promise<boolean>} Success status
 */
async function writeContextToDisk(filename, content) {
  if (!isDiskExportAvailable()) {
    logger.log('📝 Disk export only available in dev mode');
    return false;
  }

  try {
    const response = await fetch('/__claude-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });

    const result = await response.json();
    return result.success;
  } catch (error) {
    logger.error('Failed to write context to disk:', error);
    return false;
  }
}

/**
 * Export all context data to disk for Claude Code to read
 * Writes to: docs/claude-context/
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} Export results
 */
export async function exportContextToDisk(datasetId) {
  if (!isDiskExportAvailable()) {
    return { success: false, reason: 'Only available in dev mode' };
  }

  const results = {
    files: [],
    errors: []
  };

  try {
    // Get all data
    const [people, houses, codexEntries, relationships, dignities, heraldry] = await Promise.all([
      getAllPeople(datasetId),
      getAllHouses(datasetId),
      getAllEntries(datasetId),
      getAllRelationships(datasetId),
      getAllDignities(datasetId),
      getAllHeraldry(datasetId)
    ]);

    // Create master summary for quick reference
    const masterSummary = {
      exportedAt: new Date().toISOString(),
      stats: {
        people: people.length,
        houses: houses.length,
        codexEntries: codexEntries.length,
        relationships: relationships.length,
        dignities: dignities.length,
        heraldry: heraldry.length
      },
      houses: houses.map(h => ({
        id: h.id,
        name: h.houseName,
        type: h.houseType,
        memberCount: people.filter(p => p.houseId === h.id).length
      })),
      codexCategories: [...new Set(codexEntries.map(e => e.category))].filter(Boolean),
      codexTypes: [...new Set(codexEntries.map(e => e.type))].filter(Boolean),
      dignityClasses: Object.keys(DIGNITY_CLASSES)
    };

    if (await writeContextToDisk('_master-summary.json', masterSummary)) {
      results.files.push('_master-summary.json');
    }

    // Export people (simplified)
    //
    // gender, legitimacyStatus and bastardStatus are included because they are
    // *rules inputs*, not decoration: succession reads all three, and without
    // them this snapshot cannot answer anything about who inherits. That gap
    // surfaced in decision D1, where the change report could not be run against
    // the exported world because 24 of 26 dignities use male-primogeniture and
    // the snapshot did not record anyone's gender.
    const peopleData = people.map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      houseName: houses.find(h => h.id === p.houseId)?.houseName || 'Unknown',
      houseId: p.houseId,
      gender: p.gender ?? null,
      birth: p.dateOfBirth,
      death: p.dateOfDeath,
      legitimacyStatus: p.legitimacyStatus ?? null,
      bastardStatus: p.bastardStatus ?? null,
      titles: p.titles,
      notes: p.notes
    }));

    if (await writeContextToDisk('people.json', peopleData)) {
      results.files.push('people.json');
    }

    // Export houses
    const housesData = houses.map(h => ({
      id: h.id,
      name: h.houseName,
      type: h.houseType,
      parentHouseId: h.parentHouseId,
      motto: h.motto,
      notes: h.notes
    }));

    if (await writeContextToDisk('houses.json', housesData)) {
      results.files.push('houses.json');
    }

    // Export codex entries (full content for AI consumption)
    const codexData = codexEntries.map(e => ({
      id: e.id,
      type: e.type,
      title: e.title,
      subtitle: e.subtitle,
      category: e.category,
      tags: e.tags,
      content: e.content,
      sections: e.sections
    }));

    if (await writeContextToDisk('codex-entries.json', codexData)) {
      results.files.push('codex-entries.json');
    }

    // Export relationships
    const relationshipsData = relationships.map(r => {
      const person1 = people.find(p => p.id === r.person1Id);
      const person2 = people.find(p => p.id === r.person2Id);
      return {
        id: r.id,
        type: r.relationshipType,
        person1: person1 ? `${person1.firstName} ${person1.lastName}` : 'Unknown',
        person1Id: r.person1Id,
        person2: person2 ? `${person2.firstName} ${person2.lastName}` : 'Unknown',
        person2Id: r.person2Id
      };
    });

    if (await writeContextToDisk('relationships.json', relationshipsData)) {
      results.files.push('relationships.json');
    }

    // Export dignities (titles, feudal hierarchy)
    const dignitiesData = dignities.map(d => {
      const currentHolder = d.currentHolderId ? people.find(p => p.id === d.currentHolderId) : null;
      const currentHouse = d.currentHouseId ? houses.find(h => h.id === d.currentHouseId) : null;
      const swornTo = d.swornToId ? dignities.find(dig => dig.id === d.swornToId) : null;
      return {
        id: d.id,
        name: d.name,
        shortName: d.shortName,
        dignityClass: d.dignityClass,
        dignityRank: d.dignityRank,
        currentHolder: currentHolder ? `${currentHolder.firstName} ${currentHolder.lastName}` : null,
        currentHolderId: d.currentHolderId,
        currentHouse: currentHouse?.houseName || null,
        currentHouseId: d.currentHouseId,
        swornTo: swornTo?.name || null,
        swornToId: d.swornToId,
        successionType: d.successionType,
        successionRules: d.successionRules ?? null,
        notes: d.notes
      };
    });

    if (await writeContextToDisk('dignities.json', dignitiesData)) {
      results.files.push('dignities.json');
    }

    // Export heraldry
    //
    // `composition` is included deliberately, and it is the only field here
    // that is structural rather than descriptive. Without it this snapshot
    // cannot answer anything about how a coat is actually built — which came up
    // during decision C3, where the composition migration could not be checked
    // against real arms because the exported record carried only its blazon.
    //
    // It is cheap: a composition is a small object of tinctures and charge ids.
    // The heavy heraldry fields — heraldrySVG, heraldrySourceSVG and the three
    // PNG data-URLs — stay excluded, because those are hundreds of KB each and
    // are regenerable from the composition.
    const heraldryData = heraldry.map(h => ({
      id: h.id,
      name: h.name,
      category: h.category,
      tags: h.tags,
      blazon: h.blazon,
      description: h.description,
      notes: h.notes,
      shieldType: h.shieldType,
      composition: h.composition ?? null
    }));

    if (await writeContextToDisk('heraldry.json', heraldryData)) {
      results.files.push('heraldry.json');
    }

    // Create a README for Claude
    const readme = {
      description: 'Lineageweaver context data for Claude Code',
      exportedAt: new Date().toISOString(),
      files: {
        '_master-summary.json': 'Quick overview of all data - start here',
        'people.json': 'All people with house associations',
        'houses.json': 'All houses (major and cadet)',
        'codex-entries.json': 'All worldbuilding codex entries with full content',
        'relationships.json': 'Family and social relationships (THIS IS THE TREE DATA)',
        'dignities.json': 'Titles, feudal hierarchy, who holds what dignity',
        'heraldry.json': 'Coats of arms and heraldic designs'
      },
      usage: 'Read _master-summary.json first to understand the dataset, then dive into specific files as needed.',
      treeNote: 'Family trees are computed from people.json + relationships.json. Relationships define parent-child, spouse, and other connections.',
      autoUpdates: 'This data auto-updates when changes are made in the app (with 5-second debounce).'
    };

    if (await writeContextToDisk('_README.json', readme)) {
      results.files.push('_README.json');
    }

    logger.log(`📁 Exported ${results.files.length} context files to disk`);
    results.success = true;

  } catch (error) {
    logger.error('Error exporting context to disk:', error);
    results.errors.push(error.message);
    results.success = false;
  }

  return results;
}

/**
 * Enable/disable automatic disk export
 * When enabled, context files are written to disk whenever they're regenerated
 */
let autoDiskExportEnabled = true;

export function setAutoDiskExport(enabled) {
  autoDiskExportEnabled = enabled;
  logger.log(`📁 Auto disk export: ${enabled ? 'enabled' : 'disabled'}`);
}

export function isAutoDiskExportEnabled() {
  return autoDiskExportEnabled && isDiskExportAvailable();
}

// ==================== STATUS & HEALTH ====================

/**
 * Get overall context system status
 * @param {string} datasetId - Dataset ID
 * @returns {Promise<Object>} System status
 */
export async function getContextSystemStatus(datasetId) {
  try {
    const registry = await getContextRegistry(datasetId);
    const discovery = await discoverContexts(datasetId);

    // Check for stale contexts (not regenerated in 24h after source change)
    const staleContexts = registry.filter(c => {
      if (!c.lastSourceChange) return false;
      return new Date(c.lastSourceChange) > new Date(c.lastGenerated);
    });

    return {
      healthy: staleContexts.length === 0,
      totalContexts: registry.length,
      majorHouses: discovery.majorHouses.length,
      minorHouses: discovery.minorHouses.length,
      staleContexts: staleContexts.map(c => c.contextId),
      pendingChanges: pendingChanges.length,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

export default {
  // Registry
  getContextRegistry,
  getContext,
  getContextFiles,
  getContextFile,
  getContextLog,

  // Discovery
  discoverContexts,
  getHouseStats,
  CONTEXT_THRESHOLDS,

  // Generation
  generateAllContexts,

  // Change watching
  notifyChange,
  flushChanges,
  subscribeToContextUpdates,

  // Export
  exportContext,
  exportAllContexts,
  downloadContext,

  // Disk export for Claude Code
  exportContextToDisk,
  setAutoDiskExport,
  isAutoDiskExportEnabled,

  // Status
  getContextSystemStatus
};
