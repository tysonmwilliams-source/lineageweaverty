/**
 * entitySearchService.js - Unified Entity Search Service
 *
 * Provides search functionality across all entity types (People, Houses,
 * Codex, Dignities) for wiki-link autocomplete in the Writing Studio.
 */

import { getAllPeople, getAllHouses } from './database';
import { getAllEntries } from './codexService';
import { getAllDignities } from './dignityService';

/**
 * Entity types available for wiki-linking
 */
export const ENTITY_TYPES = {
  PERSON: 'person',
  HOUSE: 'house',
  CODEX: 'codex',
  DIGNITY: 'dignity'
};

/**
 * Entity type display labels
 */
export const ENTITY_TYPE_LABELS = {
  [ENTITY_TYPES.PERSON]: 'Person',
  [ENTITY_TYPES.HOUSE]: 'House',
  [ENTITY_TYPES.CODEX]: 'Codex',
  [ENTITY_TYPES.DIGNITY]: 'Dignity'
};

/**
 * Entity type icons (matching Icon component names)
 */
export const ENTITY_TYPE_ICONS = {
  [ENTITY_TYPES.PERSON]: 'user',
  [ENTITY_TYPES.HOUSE]: 'building',
  [ENTITY_TYPES.CODEX]: 'book',
  [ENTITY_TYPES.DIGNITY]: 'crown'
};

/**
 * Format person name from parts
 */
function formatPersonName(person) {
  const parts = [];
  if (person.firstName) parts.push(person.firstName);
  if (person.middleName) parts.push(person.middleName);
  if (person.lastName) parts.push(person.lastName);
  if (person.suffix) parts.push(person.suffix);
  return parts.join(' ') || 'Unnamed Person';
}

/**
 * Search entities by query string
 *
 * @param {string} query - Search query
 * @param {string|null} datasetId - Dataset ID to search within
 * @param {Object} options - Search options
 * @param {string[]} options.types - Entity types to include (default: all)
 * @param {number} options.limit - Max results to return (default: 10)
 * @returns {Promise<Array>} Matching entities with type and metadata
 */
export async function searchEntities(query, datasetId, options = {}) {
  const {
    types = Object.values(ENTITY_TYPES),
    limit = 10
  } = options;

  if (!query || query.length < 1) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results = [];

  // Search People
  if (types.includes(ENTITY_TYPES.PERSON)) {
    try {
      const people = await getAllPeople(datasetId);
      const matches = people
        .filter(person => {
          const name = formatPersonName(person).toLowerCase();
          const epithet = (person.epithet || '').toLowerCase();
          return name.includes(normalizedQuery) || epithet.includes(normalizedQuery);
        })
        .map(person => ({
          id: person.id,
          type: ENTITY_TYPES.PERSON,
          name: formatPersonName(person),
          subtitle: person.epithet || null,
          icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.PERSON],
          data: person
        }));
      results.push(...matches);
    } catch (error) {
      console.error('Error searching people:', error);
    }
  }

  // Search Houses
  if (types.includes(ENTITY_TYPES.HOUSE)) {
    try {
      const houses = await getAllHouses(datasetId);
      const matches = houses
        .filter(house => {
          const name = (house.houseName || '').toLowerCase();
          const motto = (house.motto || '').toLowerCase();
          return name.includes(normalizedQuery) || motto.includes(normalizedQuery);
        })
        .map(house => ({
          id: house.id,
          type: ENTITY_TYPES.HOUSE,
          name: house.houseName || 'Unnamed House',
          subtitle: house.motto || null,
          icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.HOUSE],
          data: house
        }));
      results.push(...matches);
    } catch (error) {
      console.error('Error searching houses:', error);
    }
  }

  // Search Codex Entries
  if (types.includes(ENTITY_TYPES.CODEX)) {
    try {
      const entries = await getAllEntries(datasetId);
      const matches = entries
        .filter(entry => {
          const title = (entry.title || '').toLowerCase();
          const category = (entry.category || '').toLowerCase();
          return title.includes(normalizedQuery) || category.includes(normalizedQuery);
        })
        .map(entry => ({
          id: entry.id,
          type: ENTITY_TYPES.CODEX,
          name: entry.title || 'Untitled Entry',
          subtitle: entry.category || null,
          icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.CODEX],
          data: entry
        }));
      results.push(...matches);
    } catch (error) {
      console.error('Error searching codex:', error);
    }
  }

  // Search Dignities
  if (types.includes(ENTITY_TYPES.DIGNITY)) {
    try {
      const dignities = await getAllDignities(datasetId);
      const matches = dignities
        .filter(dignity => {
          const name = (dignity.name || '').toLowerCase();
          const type = (dignity.type || '').toLowerCase();
          return name.includes(normalizedQuery) || type.includes(normalizedQuery);
        })
        .map(dignity => ({
          id: dignity.id,
          type: ENTITY_TYPES.DIGNITY,
          name: dignity.name || 'Unnamed Dignity',
          subtitle: dignity.type || null,
          icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.DIGNITY],
          data: dignity
        }));
      results.push(...matches);
    } catch (error) {
      console.error('Error searching dignities:', error);
    }
  }

  // Sort results by relevance (exact start match first, then contains)
  results.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const aStartsWith = aName.startsWith(normalizedQuery);
    const bStartsWith = bName.startsWith(normalizedQuery);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return aName.localeCompare(bName);
  });

  return results.slice(0, limit);
}

/**
 * Get entity by type and ID
 *
 * @param {string} type - Entity type
 * @param {number} id - Entity ID
 * @param {string|null} datasetId - Dataset ID
 * @returns {Promise<Object|null>} Entity data or null
 */
export async function getEntityById(type, id, datasetId) {
  try {
    switch (type) {
      case ENTITY_TYPES.PERSON: {
        const people = await getAllPeople(datasetId);
        const person = people.find(p => p.id === id);
        if (person) {
          return {
            id: person.id,
            type: ENTITY_TYPES.PERSON,
            name: formatPersonName(person),
            subtitle: person.epithet || null,
            icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.PERSON],
            data: person
          };
        }
        break;
      }
      case ENTITY_TYPES.HOUSE: {
        const houses = await getAllHouses(datasetId);
        const house = houses.find(h => h.id === id);
        if (house) {
          return {
            id: house.id,
            type: ENTITY_TYPES.HOUSE,
            name: house.houseName || 'Unnamed House',
            subtitle: house.motto || null,
            icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.HOUSE],
            data: house
          };
        }
        break;
      }
      case ENTITY_TYPES.CODEX: {
        const entries = await getAllEntries(datasetId);
        const entry = entries.find(e => e.id === id);
        if (entry) {
          return {
            id: entry.id,
            type: ENTITY_TYPES.CODEX,
            name: entry.title || 'Untitled Entry',
            subtitle: entry.category || null,
            icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.CODEX],
            data: entry
          };
        }
        break;
      }
      case ENTITY_TYPES.DIGNITY: {
        const dignities = await getAllDignities(datasetId);
        const dignity = dignities.find(d => d.id === id);
        if (dignity) {
          return {
            id: dignity.id,
            type: ENTITY_TYPES.DIGNITY,
            name: dignity.name || 'Unnamed Dignity',
            subtitle: dignity.type || null,
            icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.DIGNITY],
            data: dignity
          };
        }
        break;
      }
    }
  } catch (error) {
    console.error(`Error getting entity ${type}:${id}:`, error);
  }
  return null;
}

/**
 * Get recent entities for quick suggestions (no search query)
 *
 * @param {string|null} datasetId - Dataset ID
 * @param {number} limit - Max results per type
 * @returns {Promise<Array>} Recent entities
 */
export async function getRecentEntities(datasetId, limit = 5) {
  const results = [];

  try {
    // Get recent people
    const people = await getAllPeople(datasetId);
    const recentPeople = people
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
      .map(person => ({
        id: person.id,
        type: ENTITY_TYPES.PERSON,
        name: formatPersonName(person),
        subtitle: person.epithet || null,
        icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.PERSON],
        data: person
      }));
    results.push(...recentPeople);

    // Get recent houses
    const houses = await getAllHouses(datasetId);
    const recentHouses = houses
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
      .map(house => ({
        id: house.id,
        type: ENTITY_TYPES.HOUSE,
        name: house.houseName || 'Unnamed House',
        subtitle: house.motto || null,
        icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.HOUSE],
        data: house
      }));
    results.push(...recentHouses);

    // Get recent codex entries
    const entries = await getAllEntries(datasetId);
    const recentEntries = entries
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
      .map(entry => ({
        id: entry.id,
        type: ENTITY_TYPES.CODEX,
        name: entry.title || 'Untitled Entry',
        subtitle: entry.category || null,
        icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.CODEX],
        data: entry
      }));
    results.push(...recentEntries);

    // Get recent dignities
    const dignities = await getAllDignities(datasetId);
    const recentDignities = dignities
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, limit)
      .map(dignity => ({
        id: dignity.id,
        type: ENTITY_TYPES.DIGNITY,
        name: dignity.name || 'Unnamed Dignity',
        subtitle: dignity.type || null,
        icon: ENTITY_TYPE_ICONS[ENTITY_TYPES.DIGNITY],
        data: dignity
      }));
    results.push(...recentDignities);
  } catch (error) {
    console.error('Error getting recent entities:', error);
  }

  return results;
}
