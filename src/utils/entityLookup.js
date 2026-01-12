/**
 * Entity Lookup Utilities
 *
 * Centralized functions for looking up entities by ID
 * These replace duplicated functions across multiple components
 */

/**
 * Get a person's full name by ID
 * @param {number|string} personId - The person's ID
 * @param {Array} people - Array of all people
 * @returns {string} Full name or 'Unknown'
 */
export function getPersonName(personId, people) {
  if (!personId || !people?.length) return 'Unknown';
  const person = people.find(p => p.id === parseInt(personId));
  return person ? `${person.firstName} ${person.lastName}`.trim() : 'Unknown';
}

/**
 * Get a person's full name with optional epithet
 * @param {number|string} personId - The person's ID
 * @param {Array} people - Array of all people
 * @param {boolean} includeEpithet - Whether to include primary epithet
 * @returns {string} Full name with optional epithet
 */
export function getPersonNameWithEpithet(personId, people, includeEpithet = false) {
  if (!personId || !people?.length) return 'Unknown';
  const person = people.find(p => p.id === parseInt(personId));
  if (!person) return 'Unknown';

  let name = `${person.firstName} ${person.lastName}`.trim();

  if (includeEpithet && person.epithets?.length) {
    const primary = person.epithets.find(e => e.isPrimary) || person.epithets[0];
    if (primary?.text) {
      name += ` ${primary.text}`;
    }
  }

  return name;
}

/**
 * Get a house name by ID
 * @param {number|string} houseId - The house's ID
 * @param {Array} houses - Array of all houses
 * @returns {string} House name or 'Unknown House'
 */
export function getHouseName(houseId, houses) {
  if (!houseId || !houses?.length) return 'Unknown House';
  const house = houses.find(h => h.id === parseInt(houseId));
  return house?.houseName || 'Unknown House';
}

/**
 * Get a dignity name by ID
 * @param {number|string} dignityId - The dignity's ID
 * @param {Array} dignities - Array of all dignities
 * @returns {string} Dignity name or 'Unknown Dignity'
 */
export function getDignityName(dignityId, dignities) {
  if (!dignityId || !dignities?.length) return 'Unknown Dignity';
  const dignity = dignities.find(d => d.id === parseInt(dignityId));
  return dignity?.name || dignity?.shortName || 'Unknown Dignity';
}

/**
 * Get person by ID
 * @param {number|string} personId - The person's ID
 * @param {Array} people - Array of all people
 * @returns {Object|null} Person object or null
 */
export function getPersonById(personId, people) {
  if (!personId || !people?.length) return null;
  return people.find(p => p.id === parseInt(personId)) || null;
}

/**
 * Get house by ID
 * @param {number|string} houseId - The house's ID
 * @param {Array} houses - Array of all houses
 * @returns {Object|null} House object or null
 */
export function getHouseById(houseId, houses) {
  if (!houseId || !houses?.length) return null;
  return houses.find(h => h.id === parseInt(houseId)) || null;
}

/**
 * Create a Map of people by ID for O(1) lookups
 * @param {Array} people - Array of all people
 * @returns {Map} Map of personId -> person object
 */
export function createPeopleMap(people) {
  return new Map(people.map(p => [p.id, p]));
}

/**
 * Create a Map of houses by ID for O(1) lookups
 * @param {Array} houses - Array of all houses
 * @returns {Map} Map of houseId -> house object
 */
export function createHousesMap(houses) {
  return new Map(houses.map(h => [h.id, h]));
}

/**
 * Get person name from a pre-built Map (O(1) lookup)
 * @param {number|string} personId - The person's ID
 * @param {Map} peopleMap - Map of personId -> person
 * @returns {string} Full name or 'Unknown'
 */
export function getPersonNameFromMap(personId, peopleMap) {
  if (!personId || !peopleMap) return 'Unknown';
  const person = peopleMap.get(parseInt(personId));
  return person ? `${person.firstName} ${person.lastName}`.trim() : 'Unknown';
}

/**
 * Get house name from a pre-built Map (O(1) lookup)
 * @param {number|string} houseId - The house's ID
 * @param {Map} housesMap - Map of houseId -> house
 * @returns {string} House name or 'Unknown House'
 */
export function getHouseNameFromMap(houseId, housesMap) {
  if (!houseId || !housesMap) return 'Unknown House';
  const house = housesMap.get(parseInt(houseId));
  return house?.houseName || 'Unknown House';
}
