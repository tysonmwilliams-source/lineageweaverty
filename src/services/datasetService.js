/**
 * datasetService.js - Dataset Management for Lineageweaver
 *
 * PURPOSE:
 * This service handles dataset CRUD operations both locally and in Firestore.
 * Datasets allow users to have multiple separate genealogy projects under one account.
 *
 * DATA STRUCTURE IN FIRESTORE:
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  /users/{userId}/                                                    │
 * │    ├── /datasetsMetadata/{datasetId}  → Dataset info (name, etc.)   │
 * │    └── /datasets/{datasetId}/                                       │
 * │          ├── /people/{personId}       → Person documents            │
 * │          ├── /houses/{houseId}        → House documents             │
 * │          └── ... (all entity collections)                           │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * LOCAL STORAGE:
 * - Active dataset ID stored in: localStorage key 'lineageweaver_activeDatasetId'
 * - Each dataset has its own IndexedDB: LineageweaverDB_{datasetId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import { cloudCollections } from './syncManifest';

// Local storage key for active dataset
const ACTIVE_DATASET_KEY = 'lineageweaver_activeDatasetId';

// Default dataset ID
export const DEFAULT_DATASET_ID = 'default';

// ==================== HELPER FUNCTIONS ====================

/**
 * Get a reference to a user's datasets metadata collection
 */
function getDatasetsMetadataCollection(userId) {
  return collection(db, 'users', userId, 'datasetsMetadata');
}

/**
 * Get a reference to a specific dataset's metadata document
 */
function getDatasetMetadataDoc(userId, datasetId) {
  return doc(db, 'users', userId, 'datasetsMetadata', datasetId);
}

// ==================== LOCAL STORAGE OPERATIONS ====================

/**
 * Get the active dataset ID from localStorage
 * @returns {string} The active dataset ID, or 'default' if not set
 */
export function getActiveDatasetId() {
  if (typeof localStorage === 'undefined') return DEFAULT_DATASET_ID;
  return localStorage.getItem(ACTIVE_DATASET_KEY) || DEFAULT_DATASET_ID;
}

/**
 * Set the active dataset ID in localStorage
 * @param {string} datasetId - The dataset ID to set as active
 */
export function setActiveDatasetId(datasetId) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_DATASET_KEY, datasetId);
  logger.log('📂 Active dataset set to:', datasetId);
}

/**
 * Clear the active dataset ID from localStorage
 */
export function clearActiveDatasetId() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ACTIVE_DATASET_KEY);
}

// ==================== FIRESTORE OPERATIONS ====================

/**
 * Create a new dataset in Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {Partial<import('./types').Dataset>} datasetData - Dataset data
 * @param {string} datasetData.name - Display name for the dataset
 * @param {boolean} [datasetData.isDefault=false] - Whether this is the default dataset
 * @returns {Promise<import('./types').Dataset>} The created dataset object
 */
export async function createDataset(userId, datasetData) {
  try {
    const datasetId = datasetData.id || `dataset_${Date.now()}`;
    const docRef = getDatasetMetadataDoc(userId, datasetId);

    const dataset = {
      id: datasetId,
      name: datasetData.name || 'Untitled Dataset',
      isDefault: datasetData.isDefault || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, dataset);
    logger.log('📂 Dataset created:', dataset.name);

    return { ...dataset, id: datasetId };
  } catch (error) {
    logger.error('❌ Error creating dataset:', error);
    throw error;
  }
}

/**
 * Get all datasets for a user
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<import('./types').Dataset[]>} Array of dataset objects
 */
export async function getAllDatasets(userId) {
  try {
    const datasetsRef = getDatasetsMetadataCollection(userId);
    const q = query(datasetsRef, orderBy('createdAt', 'asc'));
    const snapshot = await getDocs(q);

    const datasets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    logger.log('📂 Fetched datasets:', datasets.length);
    return datasets;
  } catch (error) {
    logger.error('❌ Error getting datasets:', error);
    throw error;
  }
}

/**
 * Get a specific dataset by ID
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @returns {Promise<import('./types').Dataset|null>} Dataset object or null
 */
export async function getDataset(userId, datasetId) {
  try {
    const docRef = getDatasetMetadataDoc(userId, datasetId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return {
      id: docSnap.id,
      ...docSnap.data()
    };
  } catch (error) {
    logger.error('❌ Error getting dataset:', error);
    throw error;
  }
}

/**
 * Update a dataset's metadata
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID
 * @param {Object} updates - Fields to update
 */
export async function updateDataset(userId, datasetId, updates) {
  try {
    const docRef = getDatasetMetadataDoc(userId, datasetId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    logger.log('📂 Dataset updated:', datasetId);
  } catch (error) {
    logger.error('❌ Error updating dataset:', error);
    throw error;
  }
}

/**
 * Delete a dataset and ALL its data
 * WARNING: This is destructive and cannot be undone!
 *
 * @param {string} userId - The user's Firebase UID
 * @param {string} datasetId - The dataset ID to delete
 */
export async function deleteDataset(userId, datasetId) {
  try {
    // First, delete all collections under the dataset.
    //
    // Was a hand-written list of 22 names (sync manifest, step 2). Deleting a
    // dataset has to be *total*, so this is `cloudCollections()` — the twenty
    // synced entities plus the two a legacy install can still have — and not
    // `syncedCollections()`, which would leave documents behind under a dataset
    // the user believes is gone.
    for (const collName of cloudCollections()) {
      const collRef = collection(db, 'users', userId, 'datasets', datasetId, collName);
      const snapshot = await getDocs(collRef);

      if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
    }

    // Delete the dataset metadata
    const metadataRef = getDatasetMetadataDoc(userId, datasetId);
    await deleteDoc(metadataRef);

    logger.log('📂 Dataset deleted:', datasetId);
    return true;
  } catch (error) {
    logger.error('❌ Error deleting dataset:', error);
    throw error;
  }
}

/**
 * Check if user has any datasets configured
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<boolean>} True if user has datasets
 */
export async function hasDatasets(userId) {
  try {
    const datasetsRef = getDatasetsMetadataCollection(userId);
    const snapshot = await getDocs(datasetsRef);
    return !snapshot.empty;
  } catch (error) {
    logger.error('❌ Error checking datasets:', error);
    return false;
  }
}

/**
 * Ensure default dataset exists for user
 * Creates it if it doesn't exist
 *
 * @param {string} userId - The user's Firebase UID
 * @returns {Promise<import('./types').Dataset>} The default dataset
 */
export async function ensureDefaultDataset(userId) {
  try {
    const existingDefault = await getDataset(userId, DEFAULT_DATASET_ID);

    if (existingDefault) {
      return existingDefault;
    }

    // Create default dataset
    const defaultDataset = await createDataset(userId, {
      id: DEFAULT_DATASET_ID,
      name: 'Default',
      isDefault: true
    });

    return defaultDataset;
  } catch (error) {
    logger.error('❌ Error ensuring default dataset:', error);
    throw error;
  }
}

/**
 * Generate a unique dataset ID
 * @returns {string} A unique dataset ID
 */
export function generateDatasetId() {
  return `dataset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default {
  // Local storage
  getActiveDatasetId,
  setActiveDatasetId,
  clearActiveDatasetId,

  // Firestore CRUD
  createDataset,
  getAllDatasets,
  getDataset,
  updateDataset,
  deleteDataset,

  // Helpers
  hasDatasets,
  ensureDefaultDataset,
  generateDatasetId,

  // Constants
  DEFAULT_DATASET_ID
};
