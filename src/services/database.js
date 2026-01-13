import Dexie from 'dexie';

/**
 * Database Service for Lineageweaver
 * 
 * This file sets up IndexedDB (the browser's built-in database) using Dexie,
 * which is a wrapper that makes IndexedDB easier to work with.
 * 
 * Think of this as creating the "blueprint" for our database - defining what
 * tables we'll have and what fields each table contains.
 */

// Create a new database instance called 'LineageweaverDB'
export const db = new Dexie('LineageweaverDB');

// Version 1: Original schema
db.version(1).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath',
  houses: '++id, houseName',
  relationships: '++id, person1Id, person2Id, relationshipType'
});

// Version 2: Add cadet house system fields
db.version(2).stores({
  // Add indexes for new cadet house fields
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus',
  houses: '++id, houseName, parentHouseId, houseType',
  relationships: '++id, person1Id, person2Id, relationshipType'
}).upgrade(tx => {
  // Upgrade existing houses to have new fields with default values
  return tx.table('houses').toCollection().modify(house => {
    house.parentHouseId = house.parentHouseId || null;
    house.houseType = house.houseType || 'main';
    house.foundedBy = house.foundedBy || null;
    house.foundedDate = house.foundedDate || null;
    house.swornTo = house.swornTo || null;
    house.namePrefix = house.namePrefix || null;
  });
}).upgrade(tx => {
  // Upgrade existing people to have new bastardStatus field
  return tx.table('people').toCollection().modify(person => {
    // If they're a bastard but don't have bastardStatus, set to 'active'
    if (person.legitimacyStatus === 'bastard' && !person.bastardStatus) {
      person.bastardStatus = 'active';
    } else {
      person.bastardStatus = person.bastardStatus || null;
    }
  });
});

// Version 4: Add SVG support for infinite zoom quality
db.version(4).stores({
  // No changes to indexes, just adding new SVG fields through upgrade function
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfBirth, bastardStatus',
  houses: '++id, houseName, parentHouseId, houseType',
  relationships: '++id, person1Id, person2Id, relationshipType'
}).upgrade(tx => {
  // Add SVG heraldry fields for zoom support
  return tx.table('houses').toCollection().modify(house => {
    // Full SVG markup (when available) - PRIMARY for infinite zoom
    house.heraldrySVG = house.heraldrySVG || null;
    
    // Track format type: 'svg', 'png', 'composite'
    house.heraldryType = house.heraldryType || null;
    
    // Original SVG before shield masking (for re-processing)
    house.heraldrySourceSVG = house.heraldrySourceSVG || null;
  });
});

// Version 5: Add The Codex - Encyclopedia System
db.version(5).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  // New tables for The Codex
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type'
}).upgrade(tx => {
  // Add codexEntryId to existing people and houses
  return tx.table('people').toCollection().modify(person => {
    person.codexEntryId = person.codexEntryId || null;
  }).then(() => {
    return tx.table('houses').toCollection().modify(house => {
      house.codexEntryId = house.codexEntryId || null;
    });
  });
});

// Version 6: Add acknowledged duplicates for namesake handling
db.version(6).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  // New table for tracking acknowledged non-duplicates (namesakes)
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt'
});

// Version 7: Add The Armory - Heraldry System
// This creates a standalone heraldry table, separating heraldry from houses
// so heraldry can be its own major system like The Codex
db.version(7).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  // NEW: The Armory - Standalone heraldry system
  heraldry: '++id, name, category, *tags, created, updated',
  // Links heraldry to entities (houses, people, locations, events)
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType'
}).upgrade(tx => {
  // Add heraldryId to existing houses
  return tx.table('houses').toCollection().modify(house => {
    house.heraldryId = house.heraldryId || null;
  });
});

// Version 8: Add The Dignities System - Titles & Feudal Hierarchy
// Based on "The Codified Charter of Driht, Ward, and Service"
// This creates the fifth major system for tracking titles, dignities, and feudal bonds
db.version(8).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
});

// Version 9: Add Epithets System - Descriptive Bynames
// Epithets are descriptive names like "the Bold", "Dragonslayer", "the Wise"
// Stored as an array on people for flexibility and cross-system integration
db.version(9).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  // Dignities tables (from v8)
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
}).upgrade(tx => {
  // Add epithets array to existing people
  return tx.table('people').toCollection().modify(person => {
    // epithets: Array of epithet objects
    // Each epithet: { id, text, isPrimary, source, grantedById, earnedFrom, linkedEntityType, linkedEntityId, dateEarned, notes }
    person.epithets = person.epithets || [];
  });
});

// Version 10: Add Personal Arms - Heraldry Phase 4
// This allows individuals (not just houses) to have their own heraldic devices.
// Personal arms can be derived from house arms with cadency marks (triangles)
// to distinguish birth order among legitimate sons.
db.version(10).stores({
  // Add heraldryId to people for personal arms (quick access like houses have)
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created'
}).upgrade(tx => {
  // Add heraldryId to existing people
  // This field links directly to a heraldry record for quick access
  // (The heraldryLinks table still provides the full relationship details)
  return tx.table('people').toCollection().modify(person => {
    person.heraldryId = person.heraldryId || null;
  });
});

// Version 11: Add Bug Tracking System
// A global bug tracker accessible from anywhere in the app.
// Includes Claude Code export functionality for AI-assisted debugging.
// 
// WHAT THIS ADDS:
// - bugs: Table for storing bug reports with context
// - Indexes on status, priority for fast filtering
// - created index for chronological sorting
db.version(11).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  // NEW: Bug Tracking System
  bugs: '++id, title, status, priority, system, page, created, resolved'
});

// Version 12: Add Household Roles System
// Tracks non-hereditary household positions like Master-at-Arms, Steward, etc.
// These are service roles tied to a house, not hereditary titles.
db.version(12).stores({
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, bastardStatus, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  relationships: '++id, person1Id, person2Id, relationshipType',
  codexEntries: '++id, type, title, category, *tags, era, created, updated',
  codexLinks: '++id, sourceId, targetId, type',
  acknowledgedDuplicates: '++id, person1Id, person2Id, acknowledgedAt',
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  dignities: '++id, name, shortName, dignityClass, dignityRank, swornToId, currentHolderId, currentHouseId, codexEntryId, created, updated',
  dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded, acquisitionType, endType, created',
  dignityLinks: '++id, dignityId, entityType, entityId, linkType, created',
  bugs: '++id, title, status, priority, system, page, created, resolved',
  // NEW: Household Roles System
  householdRoles: '++id, houseId, roleType, currentHolderId, startDate, created, updated'
});

// Version 3: Add heraldry system fields
db.version(3).stores({
  // No changes to indexes, just adding new fields through upgrade function
  people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfBirth, bastardStatus',
  houses: '++id, houseName, parentHouseId, houseType',
  relationships: '++id, person1Id, person2Id, relationshipType'
}).upgrade(tx => {
  // Add heraldry fields to existing houses with default values
  return tx.table('houses').toCollection().modify(house => {
    // Heraldry image data (base64 encoded PNG, 200x200px, <100KB)
    house.heraldryImageData = house.heraldryImageData || null;
    
    // Source of heraldry: 'armoria', 'whisk', 'upload', 'composite'
    house.heraldrySource = house.heraldrySource || null;
    
    // Shield shape type: 'heater', 'french', 'spanish', 'english', 'swiss'
    house.heraldryShieldType = house.heraldryShieldType || 'heater';
    
    // Armoria seed for reproducibility (if generated via Armoria)
    house.heraldrySeed = house.heraldrySeed || null;
    
    // AI prompt (if generated via Whisk or other AI)
    house.heraldryPrompt = house.heraldryPrompt || null;
    
    // Metadata object for additional data (composition sources, version history, etc.)
    house.heraldryMetadata = house.heraldryMetadata || null;
    
    // Thumbnail version (40x40px base64) - auto-generated from main image
    house.heraldryThumbnail = house.heraldryThumbnail || null;
    
    // High-res version (400x400px base64) - original before compression
    house.heraldryHighRes = house.heraldryHighRes || null;
  });
});

/**
 * Database Helper Functions
 * These are the CRUD operations (Create, Read, Update, Delete) for each entity
 */

// ==================== PEOPLE OPERATIONS ====================

export async function addPerson(personData) {
  try {
    const id = await db.people.add(personData);
    console.log('Person added with ID:', id);
    return id;
  } catch (error) {
    console.error('Error adding person:', error);
    throw error;
  }
}

export async function getPerson(id) {
  try {
    const person = await db.people.get(id);
    return person;
  } catch (error) {
    console.error('Error getting person:', error);
    throw error;
  }
}

export async function getAllPeople() {
  try {
    const people = await db.people.toArray();
    return people;
  } catch (error) {
    console.error('Error getting all people:', error);
    throw error;
  }
}

export async function getPeopleByHouse(houseId) {
  try {
    const people = await db.people.where('houseId').equals(houseId).toArray();
    return people;
  } catch (error) {
    console.error('Error getting people by house:', error);
    throw error;
  }
}

export async function updatePerson(id, updates) {
  try {
    const result = await db.people.update(id, updates);
    console.log('Person updated:', result);
    return result;
  } catch (error) {
    console.error('Error updating person:', error);
    throw error;
  }
}

export async function deletePerson(id) {
  try {
    await db.people.delete(id);
    console.log('Person deleted:', id);
  } catch (error) {
    console.error('Error deleting person:', error);
    throw error;
  }
}

// ==================== HOUSE OPERATIONS ====================

export async function addHouse(houseData) {
  try {
    const id = await db.houses.add(houseData);
    console.log('House added with ID:', id);
    return id;
  } catch (error) {
    console.error('Error adding house:', error);
    throw error;
  }
}

export async function getHouse(id) {
  try {
    const house = await db.houses.get(id);
    return house;
  } catch (error) {
    console.error('Error getting house:', error);
    throw error;
  }
}

export async function getAllHouses() {
  try {
    const houses = await db.houses.toArray();
    return houses;
  } catch (error) {
    console.error('Error getting all houses:', error);
    throw error;
  }
}

export async function getCadetHouses(parentHouseId) {
  try {
    const cadetHouses = await db.houses
      .where('parentHouseId')
      .equals(parentHouseId)
      .toArray();
    return cadetHouses;
  } catch (error) {
    console.error('Error getting cadet houses:', error);
    throw error;
  }
}

export async function updateHouse(id, updates) {
  try {
    const result = await db.houses.update(id, updates);
    console.log('House updated:', result);
    return result;
  } catch (error) {
    console.error('Error updating house:', error);
    throw error;
  }
}

export async function deleteHouse(id) {
  try {
    await db.houses.delete(id);
    console.log('House deleted:', id);
  } catch (error) {
    console.error('Error deleting house:', error);
    throw error;
  }
}

// ==================== RELATIONSHIP OPERATIONS ====================

export async function addRelationship(relationshipData) {
  try {
    const id = await db.relationships.add(relationshipData);
    console.log('Relationship added with ID:', id);
    return id;
  } catch (error) {
    console.error('Error adding relationship:', error);
    throw error;
  }
}

export async function getRelationshipsForPerson(personId) {
  try {
    const relationships = await db.relationships
      .where('person1Id').equals(personId)
      .or('person2Id').equals(personId)
      .toArray();
    return relationships;
  } catch (error) {
    console.error('Error getting relationships:', error);
    throw error;
  }
}

export async function getAllRelationships() {
  try {
    const relationships = await db.relationships.toArray();
    return relationships;
  } catch (error) {
    console.error('Error getting all relationships:', error);
    throw error;
  }
}

export async function updateRelationship(id, updates) {
  try {
    const result = await db.relationships.update(id, updates);
    console.log('Relationship updated:', result);
    return result;
  } catch (error) {
    console.error('Error updating relationship:', error);
    throw error;
  }
}

export async function deleteRelationship(id) {
  try {
    await db.relationships.delete(id);
    console.log('Relationship deleted:', id);
  } catch (error) {
    console.error('Error deleting relationship:', error);
    throw error;
  }
}

// ==================== CADET HOUSE OPERATIONS ====================

export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function isEligibleForCeremony(person) {
  if (!person.dateOfBirth) return false;
  if (person.legitimacyStatus !== 'bastard') return false;
  if (person.bastardStatus === 'founded') return false;
  if (person.bastardStatus === 'legitimized') return false;
  
  const age = calculateAge(person.dateOfBirth);
  return age >= 18;
}

export async function foundCadetHouse(ceremonyData) {
  const { 
    founderId, 
    houseName, 
    parentHouseId, 
    ceremonyDate,
    motto = null,
    colorCode = null 
  } = ceremonyData;
  
  try {
    const founder = await getPerson(founderId);
    if (!founder) {
      throw new Error('Founder not found');
    }
    
    const parentHouse = await getHouse(parentHouseId);
    if (!parentHouse) {
      throw new Error('Parent house not found');
    }
    
    const newHouseId = await addHouse({
      houseName: houseName,
      parentHouseId: parentHouseId,
      houseType: 'cadet',
      foundedBy: founderId,
      foundedDate: ceremonyDate,
      swornTo: parentHouseId,
      namePrefix: parentHouse.namePrefix || parentHouse.houseName.substring(0, 3),
      sigil: null,
      motto: motto,
      colorCode: colorCode || parentHouse.colorCode,
      notes: `Cadet branch of ${parentHouse.houseName}, founded by ${founder.firstName} ${founder.lastName}`
    });
    
    await updatePerson(founderId, {
      houseId: newHouseId,
      lastName: houseName,
      bastardStatus: 'founded',
      legitimacyStatus: 'legitimate'
    });
    
    const newHouse = await getHouse(newHouseId);
    const updatedFounder = await getPerson(founderId);
    
    return {
      house: newHouse,
      founder: updatedFounder
    };
  } catch (error) {
    console.error('Error founding cadet house:', error);
    throw error;
  }
}

// ==================== DELETE ALL DATA ====================

/**
 * Delete all data from all tables
 * 
 * IMPORTANT: This clears ALL tables including Codex data.
 * Used primarily during cloud sync when downloading fresh data.
 */
export async function deleteAllData() {
  try {
    // Clear all core tables
    await db.people.clear();
    await db.houses.clear();
    await db.relationships.clear();
    
    // Clear Codex tables (CRITICAL - prevents duplicates during sync)
    await db.codexEntries.clear();
    await db.codexLinks.clear();
    
    // Clear other tables
    await db.acknowledgedDuplicates.clear();
    
    // Clear heraldry tables if they exist
    if (db.heraldry) await db.heraldry.clear();
    if (db.heraldryLinks) await db.heraldryLinks.clear();
    
    // Clear dignities tables if they exist
    if (db.dignities) await db.dignities.clear();
    if (db.dignityTenures) await db.dignityTenures.clear();
    if (db.dignityLinks) await db.dignityLinks.clear();
    
    // Clear bugs table if it exists
    if (db.bugs) await db.bugs.clear();
    
    console.log('✅ All data deleted successfully (including Codex, Dignities, and Bugs)');
    return true;
  } catch (error) {
    console.error('❌ Error deleting all data:', error);
    throw error;
  }
}

/**
 * Delete only genealogy data (people, houses, relationships)
 * Preserves Codex entries - useful for some operations
 */
export async function deleteGenealogyData() {
  try {
    await db.people.clear();
    await db.houses.clear();
    await db.relationships.clear();
    await db.acknowledgedDuplicates.clear();
    
    console.log('✅ Genealogy data deleted (Codex preserved)');
    return true;
  } catch (error) {
    console.error('❌ Error deleting genealogy data:', error);
    throw error;
  }
}

// ==================== ACKNOWLEDGED DUPLICATES (NAMESAKES) ====================

/**
 * Check if two people have been acknowledged as not-duplicates
 * Returns true if they've been acknowledged (in either direction)
 */
export async function isAcknowledgedDuplicate(person1Id, person2Id) {
  try {
    const found = await db.acknowledgedDuplicates
      .where('person1Id').equals(person1Id)
      .and(item => item.person2Id === person2Id)
      .first();
    
    if (found) return true;
    
    // Check reverse direction
    const foundReverse = await db.acknowledgedDuplicates
      .where('person1Id').equals(person2Id)
      .and(item => item.person2Id === person1Id)
      .first();
    
    return !!foundReverse;
  } catch (error) {
    console.error('Error checking acknowledged duplicate:', error);
    return false;
  }
}

/**
 * Get all acknowledged duplicate pairs
 */
export async function getAllAcknowledgedDuplicates() {
  try {
    return await db.acknowledgedDuplicates.toArray();
  } catch (error) {
    console.error('Error getting acknowledged duplicates:', error);
    return [];
  }
}

/**
 * Acknowledge that two people are NOT duplicates (they're namesakes)
 * This prevents future duplicate warnings for this pair
 */
export async function acknowledgeDuplicate(person1Id, person2Id) {
  try {
    // Check if already acknowledged
    const exists = await isAcknowledgedDuplicate(person1Id, person2Id);
    if (exists) {
      console.log('Duplicate already acknowledged');
      return null;
    }
    
    const id = await db.acknowledgedDuplicates.add({
      person1Id: parseInt(person1Id),
      person2Id: parseInt(person2Id),
      acknowledgedAt: new Date().toISOString()
    });
    
    console.log('Duplicate acknowledged with ID:', id);
    return id;
  } catch (error) {
    console.error('Error acknowledging duplicate:', error);
    throw error;
  }
}

/**
 * Remove an acknowledged duplicate (if you want warnings again)
 */
export async function removeAcknowledgedDuplicate(person1Id, person2Id) {
  try {
    // Delete in both directions
    await db.acknowledgedDuplicates
      .where('person1Id').equals(person1Id)
      .and(item => item.person2Id === person2Id)
      .delete();
    
    await db.acknowledgedDuplicates
      .where('person1Id').equals(person2Id)
      .and(item => item.person2Id === person1Id)
      .delete();
    
    console.log('Acknowledged duplicate removed');
    return true;
  } catch (error) {
    console.error('Error removing acknowledged duplicate:', error);
    throw error;
  }
}

/**
 * Get all "named-after" relationships for a person
 * These are relationships where relationshipType === 'named-after'
 */
export async function getNamedAfterRelationships(personId) {
  try {
    const relationships = await db.relationships
      .where('person1Id').equals(personId)
      .and(item => item.relationshipType === 'named-after')
      .toArray();
    
    // Also check reverse (person is the one someone was named after)
    const reverseRelationships = await db.relationships
      .where('person2Id').equals(personId)
      .and(item => item.relationshipType === 'named-after')
      .toArray();
    
    return {
      namedAfter: relationships,      // People this person was named after
      namesakes: reverseRelationships  // People named after this person
    };
  } catch (error) {
    console.error('Error getting named-after relationships:', error);
    return { namedAfter: [], namesakes: [] };
  }
}

export default db;
