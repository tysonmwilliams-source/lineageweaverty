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
import { logger } from '../utils/logger';
import { cloudCollections } from './syncManifest';

// ==================== CONSTANTS ====================

// Default dataset ID for backward compatibility
const DEFAULT_DATASET_ID = 'default';

// ==================== HELPER FUNCTIONS ====================

/**
 * Get a reference to a user's subcollection within a dataset
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID (defaults to 'default')
 * @param {string} collectionName - Name of the subcollection
 * @returns {CollectionReference} Firestore collection reference
 */
function getUserCollection(userId, datasetId, collectionName) {
  const dsId = datasetId || DEFAULT_DATASET_ID;
  return collection(db, 'users', userId, 'datasets', dsId, collectionName);
}

/**
 * Get a reference to a specific document in a user's subcollection within a dataset
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID (defaults to 'default')
 * @param {string} collectionName - Name of the subcollection
 * @param {string} docId - Document ID
 * @returns {DocumentReference} Firestore document reference
 */
function getUserDoc(userId, datasetId, collectionName, docId) {
  const dsId = datasetId || DEFAULT_DATASET_ID;
  return doc(db, 'users', userId, 'datasets', dsId, collectionName, docId);
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
 * @param {string} datasetId - The dataset ID
 * @param {Object} personData - Person data (including local id)
 * @returns {string} The Firestore document ID
 */
export async function addPersonCloud(userId, datasetId, personData) {
  try {
    const peopleRef = getUserCollection(userId, datasetId, 'people');
    // Use the local ID as the Firestore document ID for easy mapping
    const docRef = doc(peopleRef, String(personData.id));

    await setDoc(docRef, {
      ...personData,
      localId: personData.id, // Store original local ID
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ Person added to cloud:', personData.firstName);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding person to cloud:', error);
    throw error;
  }
}

/**
 * Get a person from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} personId - The person's ID
 * @returns {Object|null} Person data or null
 */
export async function getPersonCloud(userId, datasetId, personId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'people', String(personId));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    logger.error('☁️ Error getting person from cloud:', error);
    throw error;
  }
}

/**
 * Get all people from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Array} Array of person objects
 */
export async function getAllPeopleCloud(userId, datasetId) {
  try {
    const peopleRef = getUserCollection(userId, datasetId, 'people');
    const snapshot = await getDocs(peopleRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all people from cloud:', error);
    throw error;
  }
}

/**
 * Update a person in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} personId - The person's ID
 * @param {Object} updates - Fields to update
 */
export async function updatePersonCloud(userId, datasetId, personId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'people', String(personId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Person updated in cloud:', personId);
  } catch (error) {
    logger.error('☁️ Error updating person in cloud:', error);
    throw error;
  }
}

/**
 * Delete a person from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} personId - The person's ID
 */
export async function deletePersonCloud(userId, datasetId, personId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'people', String(personId));
    await deleteDoc(docRef);
    logger.log('☁️ Person deleted from cloud:', personId);
  } catch (error) {
    logger.error('☁️ Error deleting person from cloud:', error);
    throw error;
  }
}

// ==================== HOUSE OPERATIONS ====================

/**
 * Add a house to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} houseData - House data
 */
export async function addHouseCloud(userId, datasetId, houseData) {
  try {
    const housesRef = getUserCollection(userId, datasetId, 'houses');
    const docRef = doc(housesRef, String(houseData.id));

    await setDoc(docRef, {
      ...houseData,
      localId: houseData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ House added to cloud:', houseData.houseName);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding house to cloud:', error);
    throw error;
  }
}

/**
 * Get a house from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} houseId - The house ID
 */
export async function getHouseCloud(userId, datasetId, houseId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'houses', String(houseId));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    logger.error('☁️ Error getting house from cloud:', error);
    throw error;
  }
}

/**
 * Get all houses from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllHousesCloud(userId, datasetId) {
  try {
    const housesRef = getUserCollection(userId, datasetId, 'houses');
    const snapshot = await getDocs(housesRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all houses from cloud:', error);
    throw error;
  }
}

/**
 * Update a house in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} houseId - The house ID
 * @param {Object} updates - Fields to update
 */
export async function updateHouseCloud(userId, datasetId, houseId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'houses', String(houseId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ House updated in cloud:', houseId);
  } catch (error) {
    logger.error('☁️ Error updating house in cloud:', error);
    throw error;
  }
}

/**
 * Delete a house from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} houseId - The house ID
 */
export async function deleteHouseCloud(userId, datasetId, houseId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'houses', String(houseId));
    await deleteDoc(docRef);
    logger.log('☁️ House deleted from cloud:', houseId);
  } catch (error) {
    logger.error('☁️ Error deleting house from cloud:', error);
    throw error;
  }
}

// ==================== RELATIONSHIP OPERATIONS ====================

/**
 * Add a relationship to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} relationshipData - Relationship data
 */
export async function addRelationshipCloud(userId, datasetId, relationshipData) {
  try {
    const relsRef = getUserCollection(userId, datasetId, 'relationships');
    const docRef = doc(relsRef, String(relationshipData.id));

    await setDoc(docRef, {
      ...relationshipData,
      localId: relationshipData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ Relationship added to cloud:', relationshipData.relationshipType);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding relationship to cloud:', error);
    throw error;
  }
}

/**
 * Get all relationships from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllRelationshipsCloud(userId, datasetId) {
  try {
    const relsRef = getUserCollection(userId, datasetId, 'relationships');
    const snapshot = await getDocs(relsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all relationships from cloud:', error);
    throw error;
  }
}

/**
 * Update a relationship in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} relationshipId - The relationship ID
 * @param {Object} updates - Fields to update
 */
export async function updateRelationshipCloud(userId, datasetId, relationshipId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'relationships', String(relationshipId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Relationship updated in cloud:', relationshipId);
  } catch (error) {
    logger.error('☁️ Error updating relationship in cloud:', error);
    throw error;
  }
}

/**
 * Delete a relationship from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} relationshipId - The relationship ID
 */
export async function deleteRelationshipCloud(userId, datasetId, relationshipId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'relationships', String(relationshipId));
    await deleteDoc(docRef);
    logger.log('☁️ Relationship deleted from cloud:', relationshipId);
  } catch (error) {
    logger.error('☁️ Error deleting relationship from cloud:', error);
    throw error;
  }
}

// ==================== CODEX OPERATIONS ====================

/**
 * Add a codex entry to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} entryData - Codex entry data
 */
export async function addCodexEntryCloud(userId, datasetId, entryData) {
  try {
    const codexRef = getUserCollection(userId, datasetId, 'codexEntries');
    const docRef = doc(codexRef, String(entryData.id));

    await setDoc(docRef, {
      ...entryData,
      localId: entryData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ Codex entry added to cloud:', entryData.title);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding codex entry to cloud:', error);
    throw error;
  }
}

/**
 * Get all codex entries from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllCodexEntriesCloud(userId, datasetId) {
  try {
    const codexRef = getUserCollection(userId, datasetId, 'codexEntries');
    const snapshot = await getDocs(codexRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all codex entries from cloud:', error);
    throw error;
  }
}

/**
 * Update a codex entry in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} entryId - The entry ID
 * @param {Object} updates - Fields to update
 */
export async function updateCodexEntryCloud(userId, datasetId, entryId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'codexEntries', String(entryId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Codex entry updated in cloud:', entryId);
  } catch (error) {
    logger.error('☁️ Error updating codex entry in cloud:', error);
    throw error;
  }
}

/**
 * Delete a codex entry from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} entryId - The entry ID
 */
export async function deleteCodexEntryCloud(userId, datasetId, entryId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'codexEntries', String(entryId));
    await deleteDoc(docRef);
    logger.log('☁️ Codex entry deleted from cloud:', entryId);
  } catch (error) {
    logger.error('☁️ Error deleting codex entry from cloud:', error);
    throw error;
  }
}

// ==================== CODEX LINK OPERATIONS ====================

/**
 * Add a codex link to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} linkData - Link data (including local id)
 */
export async function addCodexLinkCloud(userId, datasetId, linkData) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'codexLinks', String(linkData.id));
    await setDoc(docRef, {
      ...linkData,
      localId: linkData.id,
      syncedAt: serverTimestamp()
    });
    logger.log('☁️ Codex link synced to cloud:', linkData.id);
  } catch (error) {
    logger.error('☁️ Error adding codex link to cloud:', error);
    throw error;
  }
}

/**
 * Delete a codex link from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {number} linkId - The link ID
 */
export async function deleteCodexLinkCloud(userId, datasetId, linkId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'codexLinks', String(linkId));
    await deleteDoc(docRef);
    logger.log('☁️ Codex link deleted from cloud:', linkId);
  } catch (error) {
    logger.error('☁️ Error deleting codex link from cloud:', error);
    throw error;
  }
}

/**
 * Get all codex links from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Array} Array of codex link objects
 */
export async function getAllCodexLinksCloud(userId, datasetId) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'codexLinks');
    const snapshot = await getDocs(linksRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting codex links from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: STORY PLANS ====================

/**
 * Add story plan to Firestore
 */
export async function addStoryPlanCloud(userId, datasetId, planData) {
  try {
    const plansRef = getUserCollection(userId, datasetId, 'storyPlans');
    const docRef = doc(plansRef, String(planData.id));
    await setDoc(docRef, {
      ...planData,
      localId: planData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story plan added to cloud:', planData.title);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding story plan to cloud:', error);
    throw error;
  }
}

/**
 * Get all story plans from Firestore
 */
export async function getAllStoryPlansCloud(userId, datasetId) {
  try {
    const plansRef = getUserCollection(userId, datasetId, 'storyPlans');
    const snapshot = await getDocs(plansRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting story plans from cloud:', error);
    throw error;
  }
}

/**
 * Update story plan in Firestore
 */
export async function updateStoryPlanCloud(userId, datasetId, planId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyPlans', String(planId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story plan updated in cloud:', planId);
  } catch (error) {
    logger.error('☁️ Error updating story plan in cloud:', error);
    throw error;
  }
}

/**
 * Delete story plan from Firestore
 */
export async function deleteStoryPlanCloud(userId, datasetId, planId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyPlans', String(planId));
    await deleteDoc(docRef);
    logger.log('☁️ Story plan deleted from cloud:', planId);
  } catch (error) {
    logger.error('☁️ Error deleting story plan from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: STORY ARCS ====================

/**
 * Add story arc to Firestore
 */
export async function addStoryArcCloud(userId, datasetId, arcData) {
  try {
    const arcsRef = getUserCollection(userId, datasetId, 'storyArcs');
    const docRef = doc(arcsRef, String(arcData.id));
    await setDoc(docRef, {
      ...arcData,
      localId: arcData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story arc added to cloud:', arcData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding story arc to cloud:', error);
    throw error;
  }
}

/**
 * Get all story arcs from Firestore
 */
export async function getAllStoryArcsCloud(userId, datasetId) {
  try {
    const arcsRef = getUserCollection(userId, datasetId, 'storyArcs');
    const snapshot = await getDocs(arcsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting story arcs from cloud:', error);
    throw error;
  }
}

/**
 * Update story arc in Firestore
 */
export async function updateStoryArcCloud(userId, datasetId, arcId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyArcs', String(arcId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story arc updated in cloud:', arcId);
  } catch (error) {
    logger.error('☁️ Error updating story arc in cloud:', error);
    throw error;
  }
}

/**
 * Delete story arc from Firestore
 */
export async function deleteStoryArcCloud(userId, datasetId, arcId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyArcs', String(arcId));
    await deleteDoc(docRef);
    logger.log('☁️ Story arc deleted from cloud:', arcId);
  } catch (error) {
    logger.error('☁️ Error deleting story arc from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: STORY BEATS ====================

/**
 * Add story beat to Firestore
 */
export async function addStoryBeatCloud(userId, datasetId, beatData) {
  try {
    const beatsRef = getUserCollection(userId, datasetId, 'storyBeats');
    const docRef = doc(beatsRef, String(beatData.id));
    await setDoc(docRef, {
      ...beatData,
      localId: beatData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story beat added to cloud:', beatData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding story beat to cloud:', error);
    throw error;
  }
}

/**
 * Get all story beats from Firestore
 */
export async function getAllStoryBeatsCloud(userId, datasetId) {
  try {
    const beatsRef = getUserCollection(userId, datasetId, 'storyBeats');
    const snapshot = await getDocs(beatsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting story beats from cloud:', error);
    throw error;
  }
}

/**
 * Update story beat in Firestore
 */
export async function updateStoryBeatCloud(userId, datasetId, beatId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyBeats', String(beatId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Story beat updated in cloud:', beatId);
  } catch (error) {
    logger.error('☁️ Error updating story beat in cloud:', error);
    throw error;
  }
}

/**
 * Delete story beat from Firestore
 */
export async function deleteStoryBeatCloud(userId, datasetId, beatId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'storyBeats', String(beatId));
    await deleteDoc(docRef);
    logger.log('☁️ Story beat deleted from cloud:', beatId);
  } catch (error) {
    logger.error('☁️ Error deleting story beat from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: SCENE PLANS ====================

/**
 * Add scene plan to Firestore
 */
export async function addScenePlanCloud(userId, datasetId, sceneData) {
  try {
    const scenesRef = getUserCollection(userId, datasetId, 'scenePlans');
    const docRef = doc(scenesRef, String(sceneData.id));
    await setDoc(docRef, {
      ...sceneData,
      localId: sceneData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Scene plan added to cloud:', sceneData.title);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding scene plan to cloud:', error);
    throw error;
  }
}

/**
 * Get all scene plans from Firestore
 */
export async function getAllScenePlansCloud(userId, datasetId) {
  try {
    const scenesRef = getUserCollection(userId, datasetId, 'scenePlans');
    const snapshot = await getDocs(scenesRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting scene plans from cloud:', error);
    throw error;
  }
}

/**
 * Update scene plan in Firestore
 */
export async function updateScenePlanCloud(userId, datasetId, sceneId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'scenePlans', String(sceneId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Scene plan updated in cloud:', sceneId);
  } catch (error) {
    logger.error('☁️ Error updating scene plan in cloud:', error);
    throw error;
  }
}

/**
 * Delete scene plan from Firestore
 */
export async function deleteScenePlanCloud(userId, datasetId, sceneId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'scenePlans', String(sceneId));
    await deleteDoc(docRef);
    logger.log('☁️ Scene plan deleted from cloud:', sceneId);
  } catch (error) {
    logger.error('☁️ Error deleting scene plan from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: PLOT THREADS ====================

/**
 * Add plot thread to Firestore
 */
export async function addPlotThreadCloud(userId, datasetId, threadData) {
  try {
    const threadsRef = getUserCollection(userId, datasetId, 'plotThreads');
    const docRef = doc(threadsRef, String(threadData.id));
    await setDoc(docRef, {
      ...threadData,
      localId: threadData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Plot thread added to cloud:', threadData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding plot thread to cloud:', error);
    throw error;
  }
}

/**
 * Get all plot threads from Firestore
 */
export async function getAllPlotThreadsCloud(userId, datasetId) {
  try {
    const threadsRef = getUserCollection(userId, datasetId, 'plotThreads');
    const snapshot = await getDocs(threadsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting plot threads from cloud:', error);
    throw error;
  }
}

/**
 * Update plot thread in Firestore
 */
export async function updatePlotThreadCloud(userId, datasetId, threadId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'plotThreads', String(threadId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Plot thread updated in cloud:', threadId);
  } catch (error) {
    logger.error('☁️ Error updating plot thread in cloud:', error);
    throw error;
  }
}

/**
 * Delete plot thread from Firestore
 */
export async function deletePlotThreadCloud(userId, datasetId, threadId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'plotThreads', String(threadId));
    await deleteDoc(docRef);
    logger.log('☁️ Plot thread deleted from cloud:', threadId);
  } catch (error) {
    logger.error('☁️ Error deleting plot thread from cloud:', error);
    throw error;
  }
}

// ==================== PLANNING: CHARACTER ARCS ====================

/**
 * Add character arc to Firestore
 */
export async function addCharacterArcCloud(userId, datasetId, arcData) {
  try {
    const arcsRef = getUserCollection(userId, datasetId, 'characterArcs');
    const docRef = doc(arcsRef, String(arcData.id));
    await setDoc(docRef, {
      ...arcData,
      localId: arcData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Character arc added to cloud:', arcData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding character arc to cloud:', error);
    throw error;
  }
}

/**
 * Get all character arcs from Firestore
 */
export async function getAllCharacterArcsCloud(userId, datasetId) {
  try {
    const arcsRef = getUserCollection(userId, datasetId, 'characterArcs');
    const snapshot = await getDocs(arcsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting character arcs from cloud:', error);
    throw error;
  }
}

/**
 * Update character arc in Firestore
 */
export async function updateCharacterArcCloud(userId, datasetId, arcId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'characterArcs', String(arcId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Character arc updated in cloud:', arcId);
  } catch (error) {
    logger.error('☁️ Error updating character arc in cloud:', error);
    throw error;
  }
}

/**
 * Delete character arc from Firestore
 */
export async function deleteCharacterArcCloud(userId, datasetId, arcId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'characterArcs', String(arcId));
    await deleteDoc(docRef);
    logger.log('☁️ Character arc deleted from cloud:', arcId);
  } catch (error) {
    logger.error('☁️ Error deleting character arc from cloud:', error);
    throw error;
  }
}

// ==================== BULK OPERATIONS ====================

/**
 * Sync all local data to cloud
 * Used for initial upload when user first signs in with existing local data
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} localData - Object containing people, houses, relationships arrays
 */
export async function syncAllToCloud(userId, datasetId, localData) {
  try {
    logger.log('☁️ Starting full sync to cloud for dataset:', datasetId);

    const { people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs } = localData;

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
        logger.log('☁️ Committed batch, starting new one...');
      }
    };

    // Sync houses first (people reference houses)
    for (const house of houses || []) {
      const docRef = getUserDoc(userId, datasetId, 'houses', String(house.id));
      batch.set(docRef, {
        ...house,
        localId: house.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync people
    for (const person of people || []) {
      const docRef = getUserDoc(userId, datasetId, 'people', String(person.id));
      batch.set(docRef, {
        ...person,
        localId: person.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync relationships
    for (const rel of relationships || []) {
      const docRef = getUserDoc(userId, datasetId, 'relationships', String(rel.id));
      batch.set(docRef, {
        ...rel,
        localId: rel.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync codex entries
    for (const entry of codexEntries || []) {
      const docRef = getUserDoc(userId, datasetId, 'codexEntries', String(entry.id));
      batch.set(docRef, {
        ...entry,
        localId: entry.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync codex links
    for (const link of codexLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'codexLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync heraldry
    for (const h of heraldry || []) {
      const docRef = getUserDoc(userId, datasetId, 'heraldry', String(h.id));
      batch.set(docRef, {
        ...h,
        localId: h.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync heraldry links
    for (const link of heraldryLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'heraldryLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignities
    for (const dignity of dignities || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignities', String(dignity.id));
      batch.set(docRef, {
        ...dignity,
        localId: dignity.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignity tenures
    for (const tenure of dignityTenures || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignityTenures', String(tenure.id));
      batch.set(docRef, {
        ...tenure,
        localId: tenure.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync dignity links
    for (const link of dignityLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'dignityLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync household roles
    for (const role of householdRoles || []) {
      const docRef = getUserDoc(userId, datasetId, 'householdRoles', String(role.id));
      batch.set(docRef, {
        ...role,
        localId: role.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync writings
    for (const writing of writings || []) {
      const docRef = getUserDoc(userId, datasetId, 'writings', String(writing.id));
      batch.set(docRef, {
        ...writing,
        localId: writing.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync chapters
    for (const chapter of chapters || []) {
      const docRef = getUserDoc(userId, datasetId, 'chapters', String(chapter.id));
      batch.set(docRef, {
        ...chapter,
        localId: chapter.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync writing links
    for (const link of writingLinks || []) {
      const docRef = getUserDoc(userId, datasetId, 'writingLinks', String(link.id));
      batch.set(docRef, {
        ...link,
        localId: link.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story plans
    for (const plan of storyPlans || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyPlans', String(plan.id));
      batch.set(docRef, {
        ...plan,
        localId: plan.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story arcs
    for (const arc of storyArcs || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyArcs', String(arc.id));
      batch.set(docRef, {
        ...arc,
        localId: arc.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync story beats
    for (const beat of storyBeats || []) {
      const docRef = getUserDoc(userId, datasetId, 'storyBeats', String(beat.id));
      batch.set(docRef, {
        ...beat,
        localId: beat.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync scene plans
    for (const scene of scenePlans || []) {
      const docRef = getUserDoc(userId, datasetId, 'scenePlans', String(scene.id));
      batch.set(docRef, {
        ...scene,
        localId: scene.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync plot threads
    for (const thread of plotThreads || []) {
      const docRef = getUserDoc(userId, datasetId, 'plotThreads', String(thread.id));
      batch.set(docRef, {
        ...thread,
        localId: thread.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }

    // Sync character arcs
    for (const arc of characterArcs || []) {
      const docRef = getUserDoc(userId, datasetId, 'characterArcs', String(arc.id));
      batch.set(docRef, {
        ...arc,
        localId: arc.id,
        syncedAt: serverTimestamp()
      });
      await checkBatch();
    }


    // Commit remaining operations
    if (operationCount > 0) {
      await batch.commit();
    }

    logger.log('☁️ Full sync to cloud complete!', {
      dataset: datasetId,
      houses: houses?.length || 0,
      people: people?.length || 0,
      relationships: relationships?.length || 0,
      codexEntries: codexEntries?.length || 0,
      codexLinks: codexLinks?.length || 0,
      heraldry: heraldry?.length || 0,
      heraldryLinks: heraldryLinks?.length || 0,
      dignities: dignities?.length || 0,
      dignityTenures: dignityTenures?.length || 0,
      dignityLinks: dignityLinks?.length || 0,
      householdRoles: householdRoles?.length || 0,
      writings: writings?.length || 0,
      chapters: chapters?.length || 0,
      writingLinks: writingLinks?.length || 0,
      storyPlans: storyPlans?.length || 0,
      storyArcs: storyArcs?.length || 0,
      storyBeats: storyBeats?.length || 0,
      scenePlans: scenePlans?.length || 0,
      plotThreads: plotThreads?.length || 0,
      characterArcs: characterArcs?.length || 0
    });

    return true;
  } catch (error) {
    logger.error('☁️ Error syncing to cloud:', error);
    throw error;
  }
}

/**
 * Download all cloud data to local
 * Used when user signs in on a new device
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Object} Object containing people, houses, relationships, codexEntries arrays
 */
export async function downloadAllFromCloud(userId, datasetId) {
  try {
    logger.log('☁️ Downloading all data from cloud for dataset:', datasetId);

    const [people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs] = await Promise.all([
      getAllPeopleCloud(userId, datasetId),
      getAllHousesCloud(userId, datasetId),
      getAllRelationshipsCloud(userId, datasetId),
      getAllCodexEntriesCloud(userId, datasetId),
      getAllCodexLinksCloud(userId, datasetId),
      getAllHeraldryCloud(userId, datasetId),
      getAllHeraldryLinksCloud(userId, datasetId),
      getAllDignitiesCloud(userId, datasetId),
      getAllDignityTenuresCloud(userId, datasetId),
      getAllDignityLinksCloud(userId, datasetId),
      getAllHouseholdRolesCloud(userId, datasetId),
      getAllWritingsCloud(userId, datasetId),
      getAllChaptersCloud(userId, datasetId),
      getAllWritingLinksCloud(userId, datasetId),
      getAllStoryPlansCloud(userId, datasetId),
      getAllStoryArcsCloud(userId, datasetId),
      getAllStoryBeatsCloud(userId, datasetId),
      getAllScenePlansCloud(userId, datasetId),
      getAllPlotThreadsCloud(userId, datasetId),
      getAllCharacterArcsCloud(userId, datasetId)
    ]);

    logger.log('☁️ Download complete!', {
      dataset: datasetId,
      houses: houses.length,
      people: people.length,
      relationships: relationships.length,
      codexEntries: codexEntries.length,
      codexLinks: codexLinks.length,
      heraldry: heraldry.length,
      heraldryLinks: heraldryLinks.length,
      dignities: dignities.length,
      dignityTenures: dignityTenures.length,
      dignityLinks: dignityLinks.length,
      householdRoles: householdRoles.length,
      writings: writings.length,
      chapters: chapters.length,
      writingLinks: writingLinks.length,
      storyPlans: storyPlans.length,
      storyArcs: storyArcs.length,
      storyBeats: storyBeats.length,
      scenePlans: scenePlans.length,
      plotThreads: plotThreads.length,
      characterArcs: characterArcs.length
    });

    return { people, houses, relationships, codexEntries, codexLinks, heraldry, heraldryLinks, dignities, dignityTenures, dignityLinks, householdRoles, writings, chapters, writingLinks, storyPlans, storyArcs, storyBeats, scenePlans, plotThreads, characterArcs };
  } catch (error) {
    logger.error('☁️ Error downloading from cloud:', error);
    throw error;
  }
}

/**
 * Check if user has any data in cloud for a specific dataset
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {boolean} True if user has cloud data in this dataset
 */
export async function hasCloudData(userId, datasetId) {
  try {
    // Just check if there are any houses (quick check)
    const housesRef = getUserCollection(userId, datasetId, 'houses');
    const snapshot = await getDocs(query(housesRef));
    return !snapshot.empty;
  } catch (error) {
    logger.error('☁️ Error checking cloud data:', error);
    return false;
  }
}

// ==================== HERALDRY OPERATIONS ====================

/**
 * Add a heraldry record to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} heraldryData - Heraldry data
 */
export async function addHeraldryCloud(userId, datasetId, heraldryData) {
  try {
    const heraldryRef = getUserCollection(userId, datasetId, 'heraldry');
    const docRef = doc(heraldryRef, String(heraldryData.id));

    await setDoc(docRef, {
      ...heraldryData,
      localId: heraldryData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ Heraldry added to cloud:', heraldryData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding heraldry to cloud:', error);
    throw error;
  }
}

/**
 * Get a heraldry record from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} heraldryId - The heraldry ID
 */
export async function getHeraldryCloud(userId, datasetId, heraldryId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'heraldry', String(heraldryId));
    const docSnap = await getDoc(docRef);
    return docToObject(docSnap);
  } catch (error) {
    logger.error('☁️ Error getting heraldry from cloud:', error);
    throw error;
  }
}

/**
 * Get all heraldry from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllHeraldryCloud(userId, datasetId) {
  try {
    const heraldryRef = getUserCollection(userId, datasetId, 'heraldry');
    const snapshot = await getDocs(heraldryRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all heraldry from cloud:', error);
    throw error;
  }
}

/**
 * Update a heraldry record in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} heraldryId - The heraldry ID
 * @param {Object} updates - Fields to update
 */
export async function updateHeraldryCloud(userId, datasetId, heraldryId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'heraldry', String(heraldryId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Heraldry updated in cloud:', heraldryId);
  } catch (error) {
    logger.error('☁️ Error updating heraldry in cloud:', error);
    throw error;
  }
}

/**
 * Delete a heraldry record from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} heraldryId - The heraldry ID
 */
export async function deleteHeraldryCloud(userId, datasetId, heraldryId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'heraldry', String(heraldryId));
    await deleteDoc(docRef);
    logger.log('☁️ Heraldry deleted from cloud:', heraldryId);
  } catch (error) {
    logger.error('☁️ Error deleting heraldry from cloud:', error);
    throw error;
  }
}

// ==================== DIGNITIES OPERATIONS ====================

/**
 * Add a dignity record to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} dignityData - Dignity data
 */
export async function addDignityCloud(userId, datasetId, dignityData) {
  try {
    const dignitiesRef = getUserCollection(userId, datasetId, 'dignities');
    const docRef = doc(dignitiesRef, String(dignityData.id));

    await setDoc(docRef, {
      ...dignityData,
      localId: dignityData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('☁️ Dignity added to cloud:', dignityData.name);
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding dignity to cloud:', error);
    throw error;
  }
}

/**
 * Get all dignities from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllDignitiesCloud(userId, datasetId) {
  try {
    const dignitiesRef = getUserCollection(userId, datasetId, 'dignities');
    const snapshot = await getDocs(dignitiesRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all dignities from cloud:', error);
    throw error;
  }
}

/**
 * Update a dignity record in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} dignityId - The dignity ID
 * @param {Object} updates - Fields to update
 */
export async function updateDignityCloud(userId, datasetId, dignityId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'dignities', String(dignityId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Dignity updated in cloud:', dignityId);
  } catch (error) {
    logger.error('☁️ Error updating dignity in cloud:', error);
    throw error;
  }
}

/**
 * Delete a dignity record from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} dignityId - The dignity ID
 */
export async function deleteDignityCloud(userId, datasetId, dignityId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'dignities', String(dignityId));
    await deleteDoc(docRef);
    logger.log('☁️ Dignity deleted from cloud:', dignityId);
  } catch (error) {
    logger.error('☁️ Error deleting dignity from cloud:', error);
    throw error;
  }
}

// ==================== DIGNITY TENURES OPERATIONS ====================

/**
 * Add a dignity tenure record to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} tenureData - Tenure data
 */
export async function addDignityTenureCloud(userId, datasetId, tenureData) {
  try {
    const tenuresRef = getUserCollection(userId, datasetId, 'dignityTenures');
    const docRef = doc(tenuresRef, String(tenureData.id));

    await setDoc(docRef, {
      ...tenureData,
      localId: tenureData.id,
      createdAt: serverTimestamp()
    });

    logger.log('☁️ Dignity tenure added to cloud');
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding dignity tenure to cloud:', error);
    throw error;
  }
}

/**
 * Get all dignity tenures from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllDignityTenuresCloud(userId, datasetId) {
  try {
    const tenuresRef = getUserCollection(userId, datasetId, 'dignityTenures');
    const snapshot = await getDocs(tenuresRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all dignity tenures from cloud:', error);
    throw error;
  }
}

/**
 * Update a dignity tenure in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} tenureId - The tenure ID
 * @param {Object} updates - Fields to update
 */
export async function updateDignityTenureCloud(userId, datasetId, tenureId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'dignityTenures', String(tenureId));
    await updateDoc(docRef, updates);
    logger.log('☁️ Dignity tenure updated in cloud:', tenureId);
  } catch (error) {
    logger.error('☁️ Error updating dignity tenure in cloud:', error);
    throw error;
  }
}

/**
 * Delete a dignity tenure from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} tenureId - The tenure ID
 */
export async function deleteDignityTenureCloud(userId, datasetId, tenureId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'dignityTenures', String(tenureId));
    await deleteDoc(docRef);
    logger.log('☁️ Dignity tenure deleted from cloud:', tenureId);
  } catch (error) {
    logger.error('☁️ Error deleting dignity tenure from cloud:', error);
    throw error;
  }
}

// ==================== DIGNITY LINKS OPERATIONS ====================

/**
 * Add a dignity link to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} linkData - Link data
 */
export async function addDignityLinkCloud(userId, datasetId, linkData) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'dignityLinks');
    const docRef = doc(linksRef, String(linkData.id));

    await setDoc(docRef, {
      ...linkData,
      localId: linkData.id,
      createdAt: serverTimestamp()
    });

    logger.log('☁️ Dignity link added to cloud');
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding dignity link to cloud:', error);
    throw error;
  }
}

/**
 * Get all dignity links from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllDignityLinksCloud(userId, datasetId) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'dignityLinks');
    const snapshot = await getDocs(linksRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all dignity links from cloud:', error);
    throw error;
  }
}

/**
 * Delete a dignity link from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} linkId - The link ID
 */
export async function deleteDignityLinkCloud(userId, datasetId, linkId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'dignityLinks', String(linkId));
    await deleteDoc(docRef);
    logger.log('☁️ Dignity link deleted from cloud:', linkId);
  } catch (error) {
    logger.error('☁️ Error deleting dignity link from cloud:', error);
    throw error;
  }
}

// ==================== HERALDRY LINKS OPERATIONS ====================

/**
 * Add a heraldry link to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} linkData - Link data
 */
export async function addHeraldryLinkCloud(userId, datasetId, linkData) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'heraldryLinks');
    const docRef = doc(linksRef, String(linkData.id));

    await setDoc(docRef, {
      ...linkData,
      localId: linkData.id,
      createdAt: serverTimestamp()
    });

    logger.log('☁️ Heraldry link added to cloud');
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding heraldry link to cloud:', error);
    throw error;
  }
}

/**
 * Get all heraldry links from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllHeraldryLinksCloud(userId, datasetId) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'heraldryLinks');
    const snapshot = await getDocs(linksRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all heraldry links from cloud:', error);
    throw error;
  }
}

/**
 * Delete a heraldry link from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} linkId - The link ID
 */
export async function deleteHeraldryLinkCloud(userId, datasetId, linkId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'heraldryLinks', String(linkId));
    await deleteDoc(docRef);
    logger.log('☁️ Heraldry link deleted from cloud:', linkId);
  } catch (error) {
    logger.error('☁️ Error deleting heraldry link from cloud:', error);
    throw error;
  }
}

// ==================== HOUSEHOLD ROLES OPERATIONS ====================

/**
 * Add a household role to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} roleData - Role data
 */
export async function addHouseholdRoleCloud(userId, datasetId, roleData) {
  try {
    const rolesRef = getUserCollection(userId, datasetId, 'householdRoles');
    const docRef = doc(rolesRef, String(roleData.id));

    await setDoc(docRef, {
      ...roleData,
      localId: roleData.id,
      createdAt: serverTimestamp()
    });

    logger.log('☁️ Household role added to cloud');
    return docRef.id;
  } catch (error) {
    logger.error('☁️ Error adding household role to cloud:', error);
    throw error;
  }
}

/**
 * Get all household roles from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllHouseholdRolesCloud(userId, datasetId) {
  try {
    const rolesRef = getUserCollection(userId, datasetId, 'householdRoles');
    const snapshot = await getDocs(rolesRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('☁️ Error getting all household roles from cloud:', error);
    throw error;
  }
}

/**
 * Update a household role in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} roleId - The role ID
 * @param {Object} updates - Fields to update
 */
export async function updateHouseholdRoleCloud(userId, datasetId, roleId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'householdRoles', String(roleId));
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('☁️ Household role updated in cloud:', roleId);
  } catch (error) {
    logger.error('☁️ Error updating household role in cloud:', error);
    throw error;
  }
}

/**
 * Delete a household role from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} roleId - The role ID
 */
export async function deleteHouseholdRoleCloud(userId, datasetId, roleId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'householdRoles', String(roleId));
    await deleteDoc(docRef);
    logger.log('☁️ Household role deleted from cloud:', roleId);
  } catch (error) {
    logger.error('☁️ Error deleting household role from cloud:', error);
    throw error;
  }
}

// ==================== WRITINGS OPERATIONS ====================

/**
 * Add a writing to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} writingData - Writing data
 */
export async function addWritingCloud(userId, datasetId, writingData) {
  try {
    const writingsRef = getUserCollection(userId, datasetId, 'writings');
    const docRef = doc(writingsRef, String(writingData.id));

    await setDoc(docRef, {
      ...writingData,
      localId: writingData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('Writing added to cloud:', writingData.title);
    return docRef.id;
  } catch (error) {
    logger.error('Error adding writing to cloud:', error);
    throw error;
  }
}

/**
 * Get all writings from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllWritingsCloud(userId, datasetId) {
  try {
    const writingsRef = getUserCollection(userId, datasetId, 'writings');
    const snapshot = await getDocs(writingsRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('Error getting all writings from cloud:', error);
    throw error;
  }
}

/**
 * Update a writing in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} writingId - The writing ID
 * @param {Object} updates - Fields to update
 */
export async function updateWritingCloud(userId, datasetId, writingId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'writings', String(writingId));
    // Use setDoc with merge to handle both create and update scenarios
    // This prevents "No document to update" errors when local data hasn't synced yet
    await setDoc(docRef, {
      ...updates,
      id: writingId,
      localId: writingId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    logger.log('Writing updated in cloud:', writingId);
  } catch (error) {
    logger.error('Error updating writing in cloud:', error);
    throw error;
  }
}

/**
 * Delete a writing from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} writingId - The writing ID
 */
export async function deleteWritingCloud(userId, datasetId, writingId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'writings', String(writingId));
    await deleteDoc(docRef);
    logger.log('Writing deleted from cloud:', writingId);
  } catch (error) {
    logger.error('Error deleting writing from cloud:', error);
    throw error;
  }
}

// ==================== CHAPTERS OPERATIONS ====================

/**
 * Add a chapter to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} chapterData - Chapter data
 */
export async function addChapterCloud(userId, datasetId, chapterData) {
  try {
    const chaptersRef = getUserCollection(userId, datasetId, 'chapters');
    const docRef = doc(chaptersRef, String(chapterData.id));

    await setDoc(docRef, {
      ...chapterData,
      localId: chapterData.id,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    logger.log('Chapter added to cloud:', chapterData.title);
    return docRef.id;
  } catch (error) {
    logger.error('Error adding chapter to cloud:', error);
    throw error;
  }
}

/**
 * Get all chapters from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllChaptersCloud(userId, datasetId) {
  try {
    const chaptersRef = getUserCollection(userId, datasetId, 'chapters');
    const snapshot = await getDocs(chaptersRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('Error getting all chapters from cloud:', error);
    throw error;
  }
}

/**
 * Update a chapter in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} chapterId - The chapter ID
 * @param {Object} updates - Fields to update
 */
export async function updateChapterCloud(userId, datasetId, chapterId, updates) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'chapters', String(chapterId));
    // Use setDoc with merge to handle both create and update scenarios
    // This prevents "No document to update" errors when local data hasn't synced yet
    await setDoc(docRef, {
      ...updates,
      id: chapterId,
      localId: chapterId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    logger.log('Chapter updated in cloud:', chapterId);
  } catch (error) {
    logger.error('Error updating chapter in cloud:', error);
    throw error;
  }
}

/**
 * Delete a chapter from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} chapterId - The chapter ID
 */
export async function deleteChapterCloud(userId, datasetId, chapterId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'chapters', String(chapterId));
    await deleteDoc(docRef);
    logger.log('Chapter deleted from cloud:', chapterId);
  } catch (error) {
    logger.error('Error deleting chapter from cloud:', error);
    throw error;
  }
}

// ==================== WRITING LINKS OPERATIONS ====================

/**
 * Add a writing link to Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} linkData - Link data
 */
export async function addWritingLinkCloud(userId, datasetId, linkData) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'writingLinks');
    const docRef = doc(linksRef, String(linkData.id));

    await setDoc(docRef, {
      ...linkData,
      localId: linkData.id,
      createdAt: serverTimestamp()
    });

    logger.log('Writing link added to cloud');
    return docRef.id;
  } catch (error) {
    logger.error('Error adding writing link to cloud:', error);
    throw error;
  }
}

/**
 * Get all writing links from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function getAllWritingLinksCloud(userId, datasetId) {
  try {
    const linksRef = getUserCollection(userId, datasetId, 'writingLinks');
    const snapshot = await getDocs(linksRef);
    return snapshot.docs.map(docToObject);
  } catch (error) {
    logger.error('Error getting all writing links from cloud:', error);
    throw error;
  }
}

/**
 * Delete a writing link from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {string|number} linkId - The link ID
 */
export async function deleteWritingLinkCloud(userId, datasetId, linkId) {
  try {
    const docRef = getUserDoc(userId, datasetId, 'writingLinks', String(linkId));
    await deleteDoc(docRef);
    logger.log('Writing link deleted from cloud:', linkId);
  } catch (error) {
    logger.error('Error deleting writing link from cloud:', error);
    throw error;
  }
}

// ==================== ADDITIONAL BULK OPERATIONS ====================

/**
 * Delete all data from a specific dataset in cloud
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 */
export async function deleteAllCloudData(userId, datasetId) {
  try {
    logger.log('☁️ Deleting all cloud data for dataset:', datasetId);

    // Was a hand-written list of 22 names, one of four such lists that had
    // drifted apart (sync manifest, step 2). `cloudCollections()` is the same
    // 22 and stays right when an entity is added.
    for (const collName of cloudCollections()) {
      const collRef = getUserCollection(userId, datasetId, collName);
      const snapshot = await getDocs(collRef);

      const batch = writeBatch(db);
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      if (!snapshot.empty) {
        await batch.commit();
      }
    }

    logger.log('☁️ All cloud data deleted for dataset:', datasetId);
    return true;
  } catch (error) {
    logger.error('☁️ Error deleting cloud data:', error);
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

  // Codex Entries
  addCodexEntryCloud,
  getAllCodexEntriesCloud,
  updateCodexEntryCloud,
  deleteCodexEntryCloud,

  // Codex Links
  addCodexLinkCloud,
  getAllCodexLinksCloud,
  deleteCodexLinkCloud,

  // Heraldry
  addHeraldryCloud,
  getHeraldryCloud,
  getAllHeraldryCloud,
  updateHeraldryCloud,
  deleteHeraldryCloud,

  // Heraldry Links
  addHeraldryLinkCloud,
  getAllHeraldryLinksCloud,
  deleteHeraldryLinkCloud,

  // Dignities
  addDignityCloud,
  getAllDignitiesCloud,
  updateDignityCloud,
  deleteDignityCloud,

  // Dignity Tenures
  addDignityTenureCloud,
  getAllDignityTenuresCloud,
  updateDignityTenureCloud,
  deleteDignityTenureCloud,

  // Dignity Links
  addDignityLinkCloud,
  getAllDignityLinksCloud,
  deleteDignityLinkCloud,

  // Household Roles
  addHouseholdRoleCloud,
  getAllHouseholdRolesCloud,
  updateHouseholdRoleCloud,
  deleteHouseholdRoleCloud,

  // Writings
  addWritingCloud,
  getAllWritingsCloud,
  updateWritingCloud,
  deleteWritingCloud,

  // Chapters
  addChapterCloud,
  getAllChaptersCloud,
  updateChapterCloud,
  deleteChapterCloud,

  // Writing Links
  addWritingLinkCloud,
  getAllWritingLinksCloud,
  deleteWritingLinkCloud,

  // Story Plans
  addStoryPlanCloud,
  getAllStoryPlansCloud,
  updateStoryPlanCloud,
  deleteStoryPlanCloud,

  // Story Arcs
  addStoryArcCloud,
  getAllStoryArcsCloud,
  updateStoryArcCloud,
  deleteStoryArcCloud,

  // Story Beats
  addStoryBeatCloud,
  getAllStoryBeatsCloud,
  updateStoryBeatCloud,
  deleteStoryBeatCloud,

  // Scene Plans
  addScenePlanCloud,
  getAllScenePlansCloud,
  updateScenePlanCloud,
  deleteScenePlanCloud,

  // Plot Threads
  addPlotThreadCloud,
  getAllPlotThreadsCloud,
  updatePlotThreadCloud,
  deletePlotThreadCloud,

  // Character Arcs
  addCharacterArcCloud,
  getAllCharacterArcsCloud,
  updateCharacterArcCloud,
  deleteCharacterArcCloud,

  // Arc Milestones

  // Bulk operations
  syncAllToCloud,
  downloadAllFromCloud,
  hasCloudData,
  deleteAllCloudData
};
