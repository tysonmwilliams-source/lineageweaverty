/**
 * DatasetContext.jsx - Dataset Management Provider for Lineageweaver
 *
 * PURPOSE:
 * This context manages which dataset is currently active and provides
 * functions for switching between, creating, and deleting datasets.
 *
 * HOW IT WORKS:
 * 1. On mount, loads datasets from Firestore for the authenticated user
 * 2. Sets active dataset from localStorage (or default if not set)
 * 3. Provides dataset state and management functions to all components
 * 4. When dataset changes, components can react (e.g., reload data)
 *
 * WHAT THIS PROVIDES:
 * - activeDataset: The currently selected dataset object
 * - datasets: List of all user datasets
 * - isLoading: True while loading datasets
 * - error: Error message if dataset operations fail
 * - switchDataset(id): Switch to a different dataset
 * - createDataset(name): Create a new dataset
 * - renameDataset(id, name): Rename a dataset
 * - deleteDataset(id): Delete a dataset
 * - refreshDatasets(): Reload datasets from Firestore
 */

import { createContext, useContext, useState, useEffect, useCallback , useMemo} from 'react';
import { useAuth } from './AuthContext';
import {
  getAllDatasets,
  getDataset,
  createDataset as createDatasetService,
  updateDataset,
  deleteDataset as deleteDatasetService,
  ensureDefaultDataset,
  getActiveDatasetId,
  setActiveDatasetId,
  generateDatasetId,
  DEFAULT_DATASET_ID
} from '../services/datasetService';
import type { ReactNode } from 'react';
import type { Dataset } from '../services/types';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';

// Create the context
export interface DatasetContextValue {
  datasets: Dataset[];
  /** Null until the list loads, and while no dataset is selected. */
  activeDataset: Dataset | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  /** Resolves to the dataset now active — the same one when already selected. */
  switchDataset: (datasetId: string) => Promise<Dataset>;
  createDataset: (name: string) => Promise<Dataset>;
  renameDataset: (datasetId: string, newName: string) => Promise<void>;
  deleteDataset: (datasetId: string) => Promise<void>;
  refreshDatasets: () => Promise<void>;
  clearError: () => void;
}

const DatasetContext = createContext<DatasetContextValue | null>(null);

/**
 * DatasetProvider Component
 *
 * Wraps your app to provide dataset state to all children.
 * Must be placed after AuthProvider (needs user context).
 */
export function DatasetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // ==================== STATE ====================

  // All datasets for the user
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  // The currently active dataset
  const [activeDataset, setActiveDataset] = useState<Dataset | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Track if we've initialized
  const [isInitialized, setIsInitialized] = useState(false);

  // ==================== INITIALIZATION ====================

  /**
   * Load datasets for the authenticated user
   */
  const loadDatasets = useCallback(async () => {
    if (!user?.uid) {
      setDatasets([]);
      setActiveDataset(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Ensure default dataset exists
      await ensureDefaultDataset(user.uid);

      // Load all datasets
      const userDatasets = await getAllDatasets(user.uid);
      setDatasets(userDatasets);

      // Get active dataset from localStorage
      const activeId = getActiveDatasetId();

      // Find the active dataset or fall back to default
      let active = userDatasets.find(d => d.id === activeId);
      if (!active) {
        active = userDatasets.find(d => d.id === DEFAULT_DATASET_ID);
      }
      if (!active && userDatasets.length > 0) {
        active = userDatasets[0];
      }

      if (active) {
        setActiveDataset(active);
        setActiveDatasetId(active.id);
      }

      setIsInitialized(true);
      logger.log('📂 Datasets loaded:', userDatasets.length, 'Active:', active?.name);
    } catch (err) {
      logger.error('❌ Error loading datasets:', err);
      setError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  // Load datasets when user changes
  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  // ==================== DATASET OPERATIONS ====================

  /**
   * Switch to a different dataset
   * @param {string} datasetId - The ID of the dataset to switch to
   * @returns {Promise<Object>} The switched-to dataset
   */
  const switchDataset = useCallback(async (datasetId: string) => {
    if (!user?.uid) {
      throw new Error('Must be logged in to switch datasets');
    }

    if (activeDataset?.id === datasetId) {
      logger.log('📂 Already on this dataset:', datasetId);
      return activeDataset;
    }

    try {
      setError(null);

      // Find dataset in our list or fetch it
      // `find` yields undefined and `getDataset` yields null, so the variable
      // has to admit both rather than one being coerced to the other.
      let dataset: Dataset | null | undefined = datasets.find(d => d.id === datasetId);
      if (!dataset) {
        dataset = await getDataset(user.uid, datasetId);
      }

      if (!dataset) {
        throw new Error(`Dataset not found: ${datasetId}`);
      }

      // Update state
      setActiveDataset(dataset);
      setActiveDatasetId(datasetId);

      logger.log('📂 Switched to dataset:', dataset.name);
      return dataset;
    } catch (err) {
      logger.error('❌ Error switching dataset:', err);
      setError(errorMessage(err));
      throw err;
    }
  }, [user?.uid, activeDataset, datasets]);

  /**
   * Create a new dataset
   * @param {string} name - Display name for the new dataset
   * @returns {Promise<Object>} The created dataset
   */
  const createDataset = useCallback(async (name: string) => {
    if (!user?.uid) {
      throw new Error('Must be logged in to create datasets');
    }

    try {
      setError(null);

      const datasetId = generateDatasetId();
      const newDataset = await createDatasetService(user.uid, {
        id: datasetId,
        name: name || 'New Dataset',
        isDefault: false
      });

      // Update local state
      setDatasets(prev => [...prev, newDataset]);

      logger.log('📂 Created dataset:', newDataset.name);
      return newDataset;
    } catch (err) {
      logger.error('❌ Error creating dataset:', err);
      setError(errorMessage(err));
      throw err;
    }
  }, [user?.uid]);

  /**
   * Rename a dataset
   * @param {string} datasetId - The dataset ID
   * @param {string} newName - The new name
   */
  const renameDataset = useCallback(async (datasetId: string, newName: string) => {
    if (!user?.uid) {
      throw new Error('Must be logged in to rename datasets');
    }

    try {
      setError(null);

      await updateDataset(user.uid, datasetId, { name: newName });

      // Update local state
      setDatasets(prev =>
        prev.map(d => (d.id === datasetId ? { ...d, name: newName } : d))
      );

      // Update active dataset if it's the one being renamed
      if (activeDataset?.id === datasetId) {
        // The guard reads `activeDataset` from the closure while the updater
        // receives the *latest* state, so the two can differ if a switch lands
        // in between. Spreading a null `prev` used to produce `{ name }` with no
        // `id` — an active dataset that scopes nothing. Returning `prev`
        // unchanged is the same thing in every reachable case and safe in the
        // race.
        setActiveDataset(prev => (prev ? { ...prev, name: newName } : prev));
      }

      logger.log('📂 Renamed dataset:', datasetId, 'to', newName);
    } catch (err) {
      logger.error('❌ Error renaming dataset:', err);
      setError(errorMessage(err));
      throw err;
    }
  }, [user?.uid, activeDataset]);

  /**
   * Delete a dataset
   * Cannot delete the currently active dataset or the only dataset
   *
   * @param {string} datasetId - The dataset ID to delete
   */
  const deleteDataset = useCallback(async (datasetId: string) => {
    if (!user?.uid) {
      throw new Error('Must be logged in to delete datasets');
    }

    if (datasets.length <= 1) {
      throw new Error('Cannot delete the only dataset');
    }

    if (activeDataset?.id === datasetId) {
      throw new Error('Cannot delete the currently active dataset. Switch to another dataset first.');
    }

    try {
      setError(null);

      await deleteDatasetService(user.uid, datasetId);

      // Update local state
      setDatasets(prev => prev.filter(d => d.id !== datasetId));

      logger.log('📂 Deleted dataset:', datasetId);
    } catch (err) {
      logger.error('❌ Error deleting dataset:', err);
      setError(errorMessage(err));
      throw err;
    }
  }, [user?.uid, datasets, activeDataset]);

  /**
   * Refresh datasets from Firestore
   */
  const refreshDatasets = useCallback(async () => {
    await loadDatasets();
  }, [loadDatasets]);

  /**
   * Clear any dataset errors
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ==================== CONTEXT VALUE ====================

  // Memoized so consumers do not re-render on every provider render.
  const contextValue = useMemo(() => ({
    // State
    datasets,
    activeDataset,
    isLoading,
    isInitialized,
    error,

    // Operations
    switchDataset,
    createDataset,
    renameDataset,
    deleteDataset,
    refreshDatasets,
    clearError
  }), [datasets, activeDataset, isLoading, isInitialized, error, switchDataset, createDataset, renameDataset, deleteDataset, refreshDatasets]);

  return (
    <DatasetContext.Provider value={contextValue}>
      {children}
    </DatasetContext.Provider>
  );
}

/**
 * useDataset Hook
 *
 * Access dataset context from any component.
 * Must be used within a DatasetProvider.
 *
 * @returns {Object} Dataset context value
 * @throws {Error} If used outside DatasetProvider
 *
 * @example
 * function MyComponent() {
 *   const { activeDataset, datasets, switchDataset } = useDataset();
 *
 *   return (
 *     <div>
 *       Current dataset: {activeDataset?.name}
 *       <select onChange={(e) => switchDataset(e.target.value)}>
 *         {datasets.map(d => (
 *           <option key={d.id} value={d.id}>{d.name}</option>
 *         ))}
 *       </select>
 *     </div>
 *   );
 * }
 */
export function useDataset(): DatasetContextValue {
  const context = useContext(DatasetContext);

  if (context === null) {
    throw new Error(
      'useDataset must be used within a DatasetProvider. ' +
      'Make sure your component is wrapped in <DatasetProvider>.'
    );
  }

  return context;
}

export default DatasetContext;
