/**
 * firestoreService.js - Cloud Database Operations for Lineageweaver
 * 
 * PURPOSE:
 * This service handles all Firestore (cloud database) operations.
 * It mirrors the structure of database.js but saves to Firebase instead of IndexedDB.
 * 
 * DATA STRUCTURE IN FIRESTORE:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  /users/{userId}/                                           │
 * │    ├── /people/{personId}      → Person documents          │
 * │    ├── /houses/{houseId}       → House documents           │
 * │    ├── /relationships/{id}     → Relationship documents    │
 * │    ├── /codexEntries/{id}      → Codex entry documents     │
 * │    ├── /codexLinks/{id}        → Codex link documents      │
 * │    └── /acknowledgedDuplicates/{id} → Namesake tracking    │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * WHY THIS STRUCTURE?
 * - Each user has their own "folder" (collection) of data
 * - Security rules can enforce that users only access their own data
 * - Clean separation between users' genealogy projects
 * 
 * FIRESTORE CONCEPTS:
 * - Collection: A group of documents (like a folder or database table)
 * - Document: A single record with fields (like a row or JSON object)
 * - Subcollection: A collection inside a document (nested folders)
 * 
 * DOCUMENT IDS:
 * We use Firestore's auto-generated IDs for cloud documents, but store
 * the original local ID in a field so we can map between local and cloud.
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  writeBatch,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ==================== HELPER FUNCTIONS ====================

/**
 * Get a reference to a user's subcollection
 * @param {string} userId - The user's Firebase UID
 * @param {string} collectionName - Name of the subcollection
 * @returns {CollectionReference} Firestore collection reference
 */
function getUserCollection(userId, collectionName) {
  return collection(db, 'users', userId, collectionName);
}

/**
 * Get a reference to a specific document in a user's subcollection
 * @param {string} userId - The user's Firebase UID
 * @param {string} collectionName - Name of the subcollection
 * @param {string} docId - Document ID
 * @returns {DocumentReference} Firestore document reference
 */
function getUserDoc(userId, collectionName, docId) {
  return doc(db, 'users', userId, collectionName, docId);
}

/**
 * Convert Firestore document to plain object with ID
 * @param {DocumentSnapshot} docSnap - Firestore document snapshot
 * @returns {Object|null} Document data with id field, or null if doesn't exist
 */
function docToObject(docSnap) {
  if (!docSnap.exists()) return null;
  return {
    id: docSnap.id,
    ...docSnap.data()
  };
}

// ==================== PEOPLE OPERATIONS ====================

/**
 * Add a person to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {Object} personData - Person data (including local id)
 * @returns {string} The Firestore document ID
 */
export async function addPersonCloud(userId, personData) {
  try {
    const peopleRef = getUserCollection(userId, 'people');
    // Use the local ID as the Firestore document ID for easy mapping
    const docRef = doc(peopleRef, String(personData.id));
    
    await setDoc(docRef, {
      ...personData,
      localId: personData.id, // Store original local ID
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('☁️ Person added to cloud:', personData.firstName);
    return docRef.id;
  } catch (error) {
    console.error('☁️ Error adding person to cloud:', error);
    throw error;
  }
}

/**
 * Get a person from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string|number} personId - The person's ID
 * @returns {Object|null} Person data or null
 */
export async function getPersonCloud(userId, personId) {
  try {
    const docRef = getUserDoc(userId, 'people', String(personId));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    console.error('☁️ Error getting person from cloud:', error);
    throw error;
  }
}

/**
 * Get all people from Firestore
 * @param {string} userId - The user's Firebase UID
 * @returns {Array} Array of person objects
 */
export async function getAllPeopleCloud(userId) {
  try {
    const peopleRef = getUserCollection(userId, 'people');
    const snapshot = await getDocs(peopleRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    console.error('☁️ Error getting all people from cloud:', error);
    throw error;
  }
}

/**
 * Update a person in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string|number} personId - The person's ID
 * @param {Object} updates - Fields to update
 */
export async function updatePersonCloud(userId, personId, updates) {
  try {
    const docRef = getUserDoc(userId, 'people', String(personId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('☁️ Person updated in cloud:', personId);
  } catch (error) {
    console.error('☁️ Error updating person in cloud:', error);
    throw error;
  }
}

/**
 * Delete a person from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string|number} personId - The person's ID
 */
export async function deletePersonCloud(userId, personId) {
  try {
    const docRef = getUserDoc(userId, 'people', String(personId));
    await deleteDoc(docRef);
    console.log('☁️ Person deleted from cloud:', personId);
  } catch (error) {
    console.error('☁️ Error deleting person from cloud:', error);
    throw error;
  }
}

// ==================== HOUSE OPERATIONS ====================

/**
 * Add a house to Firestore
 */
export async function addHouseCloud(userId, houseData) {
  try {
    const housesRef = getUserCollection(userId, 'houses');
    const docRef = doc(housesRef, String(houseData.id));
    
    await setDoc(docRef, {
      ...houseData,
      localId: houseData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('☁️ House added to cloud:', houseData.houseName);
    return docRef.id;
  } catch (error) {
    console.error('☁️ Error adding house to cloud:', error);
    throw error;
  }
}

/**
 * Get a house from Firestore
 */
export async function getHouseCloud(userId, houseId) {
  try {
    const docRef = getUserDoc(userId, 'houses', String(houseId));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    console.error('☁️ Error getting house from cloud:', error);
    throw error;
  }
}

/**
 * Get all houses from Firestore
 */
export async function getAllHousesCloud(userId) {
  try {
    const housesRef = getUserCollection(userId, 'houses');
    const snapshot = await getDocs(housesRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    console.error('☁️ Error getting all houses from cloud:', error);
    throw error;
  }
}

/**
 * Update a house in Firestore
 */
export async function updateHouseCloud(userId, houseId, updates) {
  try {
    const docRef = getUserDoc(userId, 'houses', String(houseId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('☁️ House updated in cloud:', houseId);
  } catch (error) {
    console.error('☁️ Error updating house in cloud:', error);
    throw error;
  }
}

/**
 * Delete a house from Firestore
 */
export async function deleteHouseCloud(userId, houseId) {
  try {
    const docRef = getUserDoc(userId, 'houses', String(houseId));
    await deleteDoc(docRef);
    console.log('☁️ House deleted from cloud:', houseId);
  } catch (error) {
    console.error('☁️ Error deleting house from cloud:', error);
    throw error;
  }
}

// ==================== RELATIONSHIP OPERATIONS ====================

/**
 * Add a relationship to Firestore
 */
export async function addRelationshipCloud(userId, relationshipData) {
  try {
    const relsRef = getUserCollection(userId, 'relationships');
    const docRef = doc(relsRef, String(relationshipData.id));
    
    await setDoc(docRef, {
      ...relationshipData,
      localId: relationshipData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('☁️ Relationship added to cloud:', relationshipData.relationshipType);
    return docRef.id;
  } catch (error) {
    console.error('☁️ Error adding relationship to cloud:', error);
    throw error;
  }
}

/**
 * Get all relationships from Firestore
 */
export async function getAllRelationshipsCloud(userId) {
  try {
    const relsRef = getUserCollection(userId, 'relationships');
    const snapshot = await getDocs(relsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    console.error('☁️ Error getting all relationships from cloud:', error);
    throw error;
  }
}

/**
 * Update a relationship in Firestore
 */
export async function updateRelationshipCloud(userId, relationshipId, updates) {
  try {
    const docRef = getUserDoc(userId, 'relationships', String(relationshipId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('☁️ Relationship updated in cloud:', relationshipId);
  } catch (error) {
    console.error('☁️ Error updating relationship in cloud:', error);
    throw error;
  }
}

/**
 * Delete a relationship from Firestore
 */
export async function deleteRelationshipCloud(userId, relationshipId) {
  try {
    const docRef = getUserDoc(userId, 'relationships', String(relationshipId));
    await deleteDoc(docRef);
    console.log('☁️ Relationship deleted from cloud:', relationshipId);
  } catch (error) {
    console.error('☁️ Error deleting relationship from cloud:', error);
    throw error;
  }
}

// ==================== CODEX OPERATIONS ====================

/**
 * Add a codex entry to Firestore
 */
export async function addCodexEntryCloud(userId, entryData) {
  try {
    const codexRef = getUserCollection(userId, 'codexEntries');
    const docRef = doc(codexRef, String(entryData.id));
    
    await setDoc(docRef, {
      ...entryData,
      localId: entryData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    console.log('☁️ Codex entry added to cloud:', entryData.title);
    return docRef.id;
  } catch (error) {
    console.error('☁️ Error adding codex entry to cloud:', error);
    throw error;
  }
}

/**
 * Get all codex entries from Firestore
 */
export async function getAllCodexEntriesCloud(userId) {
  try {
    const codexRef = getUserCollection(userId, 'codexEntries');
    const snapshot = await getDocs(codexRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    console.error('☁️ Error getting all codex entries from cloud:', error);
    throw error;
  }
}

/**
 * Update a codex entry in Firestore
 */
export async function updateCodexEntryCloud(userId, entryId, updates) {
  try {
    const docRef = getUserDoc(userId, 'codexEntries', String(entryId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('☁️ Codex entry updated in cloud:', entryId);
  } catch (error) {
    console.error('☁️ Error updating codex entry in cloud:', error);
    throw error;
  }
}

/**
 * Delete a codex entry from Firestore
 */
export async function deleteCodexEntryCloud(userId, entryId) {
  try {
    const docRef = getUserDoc(userId, 'codexEntries', String(entryId));
    await deleteDoc(docRef);
    console.log('☁️ Codex entry deleted from cloud:', entryId);
  } catch (error) {
    console.error('☁️ Error deleting codex entry from cloud:', error);
    throw error;
  }
}

// ==================== BULK OPERATIONS ====================

/**
 * Sync all local data to cloud
 * Used for initial upload when user first signs in with existing local data
 * 
 * @param {string} userId - The user's Firebase UID
 * @param {Object} localData - Object containing people, houses, relationships arrays
 */
export async function syncAllToCloud(userId, localData) {
  try {
    console.log('☁️ Starting full sync to cloud...');
    
    const { people, houses, relationships, codexEntries } = localData;
    
    // Use batched writes for efficiency (max 500 operations per batch)
    // We'll create multiple batches if needed
    
    let operationCount = 0;
    let batch = writeBatch(db);
    
    // Helper to commit batch if getting full
    const checkBatch = async () => {
      operationCount++;
      if (operationCount >= 450) { // Leave buffer before 500 limit
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
        console.log('☁️ Committed batch, starting new one...');
      }
    };
    
    // Sync houses first (people reference houses)
    for (const house of houses || []) {
      const docRef = getUserDoc(userId, 'houses', String(house.id));
      batch.set(docRef, {
        ...house,
        localId: house.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }
    
    // Sync people
    for (const person of people || []) {
      const docRef = getUserDoc(userId, 'people', String(person.id));
      batch.set(docRef, {
        ...person,
        localId: person.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }
    
    // Sync relationships
    for (const rel of relationships || []) {
      const docRef = getUserDoc(userId, 'relationships', String(rel.id));
      batch.set(docRef, {
        ...rel,
        localId: rel.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }
    
    // Sync codex entries
    for (const entry of codexEntries || []) {
      const docRef = getUserDoc(userId, 'codexEntries', String(entry.id));
      batch.set(docRef, {
        ...entry,
        localId: entry.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }
    
    // Commit remaining operations
    if (operationCount > 0) {
      await batch.commit();
    }
    
    console.log('☁️ Full sync to cloud complete!', {
      houses: houses?.length || 0,
      people: people?.length || 0,
      relationships: relationships?.length || 0,
      codexEntries: codexEntries?.length || 0
    });
    
    return true;
  } catch (error) {
    console.error('☁️ Error syncing to cloud:', error);
    throw error;
  }
}

/**
 * Download all cloud data to local
 * Used when user signs in on a new device
 * 
 * @param {string} userId - The user's Firebase UID
 * @returns {Object} Object containing people, houses, relationships, codexEntries arrays
 */
export async function downloadAllFromCloud(userId) {
  try {
    console.log('☁️ Downloading all data from cloud...');
    
    const [people, houses, relationships, codexEntries] = await Promise.all([
      getAllPeopleCloud(userId),
      getAllHousesCloud(userId),
      getAllRelationshipsCloud(userId),
      getAllCodexEntriesCloud(userId)
    ]);
    
    console.log('☁️ Download complete!', {
      houses: houses.length,
      people: people.length,
      relationships: relationships.length,
      codexEntries: codexEntries.length
    });
    
    return { people, houses, relationships, codexEntries };
  } catch (error) {
    console.error('☁️ Error downloading from cloud:', error);
    throw error;
  }
}

/**
 * Check if user has any data in cloud
 * @param {string} userId - The user's Firebase UID
 * @returns {boolean} True if user has cloud data
 */
export async function hasCloudData(userId) {
  try {
    // Just check if there are any houses (quick check)
    const housesRef = getUserCollection(userId, 'houses');
    const snapshot = await getDocs(query(housesRef));
    return !snapshot.empty;
  } catch (error) {
    console.error('☁️ Error checking cloud data:', error);
    return false;
  }
}

/**
 * Delete all user data from cloud
 * @param {string} userId - The user's Firebase UID
 */
export async function deleteAllCloudData(userId) {
  try {
    console.log('☁️ Deleting all cloud data...');
    
    const collections = ['people', 'houses', 'relationships', 'codexEntries', 'codexLinks', 'acknowledgedDuplicates'];
    
    for (const collName of collections) {
      const collRef = getUserCollection(userId, collName);
      const snapshot = await getDocs(collRef);
      
      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      if (!snapshot.empty) {
        await batch.commit();
      }
    }
    
    console.log('☁️ All cloud data deleted');
    return true;
  } catch (error) {
    console.error('☁️ Error deleting cloud data:', error);
    throw error;
  }
}

export default {
  // People
  addPersonCloud,
  getPersonCloud,
  getAllPeopleCloud,
  updatePersonCloud,
  deletePersonCloud,
  
  // Houses
  addHouseCloud,
  getHouseCloud,
  getAllHousesCloud,
  updateHouseCloud,
  deleteHouseCloud,
  
  // Relationships
  addRelationshipCloud,
  getAllRelationshipsCloud,
  updateRelationshipCloud,
  deleteRelationshipCloud,
  
  // Codex
  addCodexEntryCloud,
  getAllCodexEntriesCloud,
  updateCodexEntryCloud,
  deleteCodexEntryCloud,
  
  // Bulk operations
  syncAllToCloud,
  downloadAllFromCloud,
  hasCloudData,
  deleteAllCloudData
};
