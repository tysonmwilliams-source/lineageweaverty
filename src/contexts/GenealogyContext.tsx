/**
 * GenealogyContext.jsx - Shared Data Provider for Lineageweaver
 * 
 * PURPOSE:
 * This context creates a "single source of truth" for all genealogy data.
 * Instead of ManageData and FamilyTree each maintaining their own separate
 * copies of people/houses/relationships, they both tap into this shared well.
 * 
 * HOW IT WORKS:
 * 1. On app load, the context fetches all data from IndexedDB once
 * 2. Any component can read data via useGenealogy() hook
 * 3. Any component can mutate data via provided functions (addPerson, updateHouse, etc.)
 * 4. When data changes, ALL subscribed components re-render with fresh data
 * 
 * WHAT THIS SOLVES:
 * - Edit a person in ManageData → Tree updates immediately (no navigation needed)
 * - Quick-edit in Tree → ManageData reflects it instantly
 * - No more "stale data" when switching between pages
 * 
 * TECHNICAL NOTES:
 * - Uses React Context API (built into React, no extra dependencies)
 * - Database operations happen in the mutation functions
 * - State updates trigger re-renders in consuming components
 * - Error handling is centralized here
 * 
 * CLOUD SYNC INTEGRATION:
 * - All mutations now sync to Firestore in the background
 * - Initial data load checks cloud for existing data
 * - Local-first approach: UI updates instantly, cloud syncs async
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAllPeople,
  getAllHouses,
  getAllRelationships,
  addPerson as dbAddPerson,
  updatePerson as dbUpdatePerson,
  deletePerson as dbDeletePerson,
  addHouse as dbAddHouse,
  updateHouse as dbUpdateHouse,
  deleteHouse as dbDeleteHouse,
  addRelationship as dbAddRelationship,
  updateRelationship as dbUpdateRelationship,
  deleteRelationship as dbDeleteRelationship,
  foundCadetHouse as dbFoundCadetHouse,
  deleteAllData as dbDeleteAllData
} from '../services/database';

// ═══════════════════════════════════════════════════════════════════════════════
// 🔗 TREE-CODEX INTEGRATION (Phase 1: Light Integration)
// ═══════════════════════════════════════════════════════════════════════════════
import { 
  createEntry as createCodexEntry, 
  deleteEntry as deleteCodexEntry,
  getEntry as getCodexEntry
} from '../services/codexService';

// ═══════════════════════════════════════════════════════════════════════════════
// ☁️ CLOUD SYNC INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════
import {
  initializeSync,
  syncAddPerson,
  syncUpdatePerson,
  syncDeletePerson,
  syncAddHouse,
  syncUpdateHouse,
  syncDeleteHouse,
  syncAddRelationship,
  syncUpdateRelationship,
  syncDeleteRelationship,
  syncAddCodexEntry,
  getSyncStatus,
  startPeriodicSync,
  stopPeriodicSync
} from '../services/dataSyncService';

import { useAuth } from './AuthContext';
import { useDataset } from './DatasetContext';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import type { ReactNode } from 'react';
import type {
  Person, PersonInput, House, HouseInput, Relationship, RelationshipInput
} from '../services/types';
import type { CadetCeremonyData } from '../services/database';

/** What founding a cadet branch returns. Both are read back after the write. */
export interface CadetCeremonyResult {
  house: House | undefined;
  founder: Person | undefined;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT OBJECTS
// ═══════════════════════════════════════════════════════════════════════════════
// Split into two contexts for better performance:
// - StateContext: Read-only data (people, houses, relationships, loading, etc.)
// - DispatchContext: Mutation functions (addPerson, updateHouse, etc.)
//
// Components that only display data subscribe to StateContext
// Components that only perform actions subscribe to DispatchContext
// Components that need both can use the combined useGenealogy() hook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The read half. Components that only display data subscribe to this.
 *
 * Split from the dispatch half deliberately: a form that only mutates should
 * not re-render when an unrelated person changes, and the two contexts are what
 * make that possible. `useGenealogy()` returns both merged, for the components
 * that predate the split.
 */
export interface GenealogyState {
  people: Person[];
  houses: House[];
  relationships: Relationship[];
  loading: boolean;
  error: string | null;
  /** Bumped on every mutation. Memo keys that must not miss an in-place edit. */
  dataVersion: number;
  /** 'idle' | 'syncing' | 'synced' | 'error' */
  syncStatus: SyncPhase;
  getPersonById: (id: number) => Person | undefined;
  getHouseById: (id: number) => House | undefined;
  getPeopleByHouse: (houseId: number) => Person[];
  getRelationshipsForPerson: (personId: number) => Relationship[];
}

/** How far the startup cloud sync has got. */
export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'error';

/**
 * The write half. Every function here follows the golden rule in CLAUDE.md:
 * local IndexedDB first, then React state, then a non-blocking cloud sync.
 */
export interface GenealogyDispatch {
  /** Resolves to the new local id. */
  addPerson: (personData: PersonInput) => Promise<number>;
  updatePerson: (id: number, updates: Partial<Person>) => Promise<void>;
  deletePerson: (id: number) => Promise<void>;
  addHouse: (houseData: HouseInput) => Promise<number>;
  updateHouse: (id: number, updates: Partial<House>) => Promise<void>;
  deleteHouse: (id: number) => Promise<void>;
  addRelationship: (relationshipData: RelationshipInput) => Promise<number>;
  updateRelationship: (id: number, updates: Partial<Relationship>) => Promise<void>;
  deleteRelationship: (id: number) => Promise<void>;
  /** Splits a cadet branch off an existing house. Reloads everything after. */
  foundCadetHouse: (ceremonyData: CadetCeremonyData) => Promise<CadetCeremonyResult>;
  deleteAllData: () => Promise<void>;
  refreshData: () => Promise<void>;
}

/** Both halves, for components written before the split. */
export type GenealogyContextValue = GenealogyState & GenealogyDispatch;

const GenealogyStateContext = createContext<GenealogyState | null>(null);
const GenealogyDispatchContext = createContext<GenealogyDispatch | null>(null);

// Legacy context for backward compatibility
const GenealogyContext = createContext<GenealogyContextValue | null>(null);

/**
 * GenealogyProvider Component
 * 
 * This wraps your app (or part of it) and provides the shared data to all children.
 * Any component inside this provider can access the data via useGenealogy().
 */
export function GenealogyProvider({ children }: { children: ReactNode }) {
  // ==================== STATE ====================
  const [people, setPeople] = useState<Person[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  
  // ☁️ Cloud sync state
  const [syncStatus, setSyncStatus] = useState<SyncPhase>('idle'); // 'idle' | 'syncing' | 'synced' | 'error'
  const [syncInitialized, setSyncInitialized] = useState(false);
  
  // Get current user from auth context
  const { user } = useAuth();

  // Get active dataset from dataset context
  const { activeDataset } = useDataset();

  // ==================== INITIAL DATA LOAD + CLOUD SYNC ====================
  
  useEffect(() => {
    if (user && !syncInitialized) {
      // User is logged in, initialize sync
      initializeSyncAndLoad();
    } else if (!user) {
      // User logged out, stop periodic sync and load local data
      stopPeriodicSync();
      loadAllData();
    }

    // Cleanup: stop periodic sync when component unmounts
    return () => {
      stopPeriodicSync();
    };
  }, [user, syncInitialized]);

  /**
   * Initialize cloud sync and load data
   * This runs when a user first logs in
   */
  const initializeSyncAndLoad = useCallback(async () => {
    try {
      setLoading(true);
      setSyncStatus('syncing');
      setError(null);

      const datasetId = activeDataset?.id || 'default';
      // The effect that calls this already checks for a user, but the closure
      // cannot see that. Re-reading here also closes the gap where a sign-out
      // lands between the check and this line.
      if (!user) return;
      logger.log('🔄 Starting sync initialization for dataset:', datasetId);

      // Initialize sync - this will either upload local data or download cloud data
      const syncResult = await initializeSync(user.uid, datasetId);

      logger.log('📊 Sync result:', syncResult.status);

      // Now load whatever data we have (local DB is now authoritative)
      await loadAllData();

      setSyncStatus('synced');
      setSyncInitialized(true);

      // Start periodic sync (every 5 minutes) to prevent data loss
      startPeriodicSync(user.uid, datasetId);

    } catch (err) {
      logger.error('❌ Sync initialization failed:', err);
      setSyncStatus('error');
      setError(errorMessage(err));

      // Still try to load local data
      await loadAllData();

      // CRITICAL: Mark as initialized even on error to prevent infinite loop
      // Without this, the useEffect will keep retrying and cause flickering
      setSyncInitialized(true);
    }
  }, [user, activeDataset]);

  /**
   * Load all data from IndexedDB for the active dataset
   */
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const datasetId = activeDataset?.id || 'default';
      logger.log('📚 Loading data for dataset:', datasetId);

      const [allPeople, allHouses, allRelationships] = await Promise.all([
        getAllPeople(datasetId),
        getAllHouses(datasetId),
        getAllRelationships(datasetId)
      ]);

      setPeople(allPeople);
      setHouses(allHouses);
      setRelationships(allRelationships);
      setDataVersion(v => v + 1);

      logger.log('📚 GenealogyContext: Data loaded', {
        dataset: datasetId,
        people: allPeople.length,
        houses: allHouses.length,
        relationships: allRelationships.length
      });
    } catch (err) {
      logger.error('❌ GenealogyContext: Failed to load data', err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [activeDataset]);

  // ==================== PERSON OPERATIONS ====================

  /**
   * Add a new person
   * Now includes cloud sync!
   */
  const addPerson = useCallback(async (personData: PersonInput) => {
    try {
      const datasetId = activeDataset?.id || 'default';

      // 1. Add to local database
      const newId = await dbAddPerson(personData, datasetId);
      
      // 2. Auto-create Codex entry
      let codexEntryId = null;
      try {
        const fullName = `${personData.firstName} ${personData.lastName}`;
        
        let lifeDates = '';
        if (personData.dateOfBirth) {
          lifeDates = `b. ${personData.dateOfBirth}`;
          if (personData.dateOfDeath) {
            lifeDates += ` - d. ${personData.dateOfDeath}`;
          }
        } else if (personData.dateOfDeath) {
          lifeDates = `d. ${personData.dateOfDeath}`;
        }
        
        let subtitle = '';
        if (personData.maidenName && lifeDates) {
          subtitle = `née ${personData.maidenName} | ${lifeDates}`;
        } else if (personData.maidenName) {
          subtitle = `née ${personData.maidenName}`;
        } else if (lifeDates) {
          subtitle = lifeDates;
        }
        
        codexEntryId = await createCodexEntry({
          type: 'personage',
          title: fullName,
          subtitle: subtitle || null,
          content: '',
          category: 'Personages',
          tags: [],
          era: null,
          personId: newId,
          houseId: personData.houseId || null,
          genealogyData: {
            dateOfBirth: personData.dateOfBirth || null,
            dateOfDeath: personData.dateOfDeath || null,
            gender: personData.gender || null,
            legitimacyStatus: personData.legitimacyStatus || null,
            maidenName: personData.maidenName || null
          },
          isAutoGenerated: true
        }, datasetId);

        await dbUpdatePerson(newId, { codexEntryId: codexEntryId }, datasetId);
        logger.log('📖 Codex entry auto-created for:', fullName);
        
        // ☁️ Sync codex entry to cloud
        if (user && activeDataset) {
          syncAddCodexEntry(user.uid, activeDataset.id, codexEntryId, {
            type: 'personage',
            title: fullName,
            subtitle: subtitle || null,
            personId: newId
          });
        }
      } catch (codexErr) {
        logger.warn('⚠️ Failed to auto-create Codex entry:', errorMessage(codexErr));
      }
      
      // 3. Update local state
      const newPerson = { ...personData, id: newId, codexEntryId: codexEntryId };
      setPeople(prev => [...prev, newPerson]);
      setDataVersion(v => v + 1);
      
      // ☁️ 4. Sync to cloud (async, non-blocking)
      if (user && activeDataset) {
        syncAddPerson(user.uid, activeDataset.id, newId, newPerson);
      }

      logger.log('✅ Person added:', newPerson.firstName, newPerson.lastName);
      return newId;
    } catch (err) {
      logger.error('❌ Failed to add person:', err);
      throw err;
    }
  }, [user, activeDataset]);

  /**
   * Update an existing person
   */
  const updatePerson = useCallback(async (id: number, updates: Partial<Person>) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      // userId is passed so a rename can propagate to the linked Codex entry
      // title *and* sync that title change; without it the Codex title would be
      // corrected locally and then reverted by the next cloud download.
      await dbUpdatePerson(id, updates, datasetId, user?.uid || null);

      setPeople(prev => prev.map(person =>
        person.id === id ? { ...person, ...updates } : person
      ));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncUpdatePerson(user.uid, activeDataset.id, id, updates);
      }

      logger.log('✅ Person updated:', id);
    } catch (err) {
      logger.error('❌ Failed to update person:', err);
      throw err;
    }
  }, [user, activeDataset]);

  /**
   * Delete a person with CASCADE delete of relationships
   */
  const deletePerson = useCallback(async (id: number) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      const personToDelete = people.find(p => p.id === id);
      const codexEntryId = personToDelete?.codexEntryId;

      // CRITICAL: Capture relationships BEFORE deleting from local DB
      // These need to be synced to cloud for deletion
      const relationshipsToDelete = relationships.filter(
        rel => rel.person1Id === id || rel.person2Id === id
      );
      // `Relationship.id` is optional on the type because a row on its way in
      // has no key yet. These came out of the database, so every one has one.
      const relationshipIds = relationshipsToDelete
        .map(r => r.id)
        .filter((relId): relId is number => relId !== undefined);

      // Delete person (and cascade relationships) from local DB
      await dbDeletePerson(id, datasetId);

      if (codexEntryId) {
        try {
          // Without datasetId this deleted from the DEFAULT world's codex —
          // i.e. a stranger's entry — while leaving this world's orphaned.
          await deleteCodexEntry(codexEntryId, datasetId, user?.uid);
          logger.log('📖 Codex entry cascade-deleted:', codexEntryId);
        } catch (codexErr) {
          logger.warn('⚠️ Failed to cascade-delete Codex entry:', errorMessage(codexErr));
        }
      }

      setPeople(prev => prev.filter(person => person.id !== id));
      setRelationships(prev => prev.filter(rel =>
        rel.person1Id !== id && rel.person2Id !== id
      ));
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud - include relationship IDs for cascade deletion
      if (user && activeDataset) {
        syncDeletePerson(user.uid, activeDataset.id, id, relationshipIds);
      }

      logger.log('✅ Person deleted:', id, `(cascade: ${relationshipIds.length} relationships)`);
    } catch (err) {
      logger.error('❌ Failed to delete person:', err);
      throw err;
    }
  }, [people, relationships, user, activeDataset]);

  // ==================== HOUSE OPERATIONS ====================

  const addHouse = useCallback(async (houseData: HouseInput) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      const newId = await dbAddHouse(houseData, { datasetId });
      const newHouse = { ...houseData, id: newId };
      setHouses(prev => [...prev, newHouse]);
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncAddHouse(user.uid, activeDataset.id, newId, newHouse);
      }

      logger.log('✅ House added:', newHouse.houseName);
      return newId;
    } catch (err) {
      logger.error('❌ Failed to add house:', err);
      throw err;
    }
  }, [user, activeDataset]);

  const updateHouse = useCallback(async (id: number, updates: Partial<House>) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      // See updatePerson: userId lets the Codex title rename sync.
      await dbUpdateHouse(id, updates, datasetId, user?.uid || null);
      setHouses(prev => prev.map(house =>
        house.id === id ? { ...house, ...updates } : house
      ));
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncUpdateHouse(user.uid, activeDataset.id, id, updates);
      }

      logger.log('✅ House updated:', id);
    } catch (err) {
      logger.error('❌ Failed to update house:', err);
      throw err;
    }
  }, [user, activeDataset]);

  const deleteHouse = useCallback(async (id: number) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      const { clearedPersonIds = [] } = await dbDeleteHouse(id, {
        datasetId,
        userId: user?.uid
      });

      setHouses(prev => prev.filter(house => house.id !== id));
      // The cascade cleared these people's houseId in IndexedDB; mirror that in
      // React state or the UI keeps showing the deleted house until reload.
      if (clearedPersonIds.length > 0) {
        const cleared = new Set(clearedPersonIds);
        setPeople(prev => prev.map(p => (cleared.has(p.id) ? { ...p, houseId: null } : p)));
      }
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud. The cascade must be synced too — syncing only the
      // house deletion left every member's houseId intact in Firestore, so the
      // next download put them all back into a house that no longer exists.
      if (user && activeDataset) {
        for (const personId of clearedPersonIds) {
          syncUpdatePerson(user.uid, activeDataset.id, personId, { houseId: null });
        }
        syncDeleteHouse(user.uid, activeDataset.id, id);
      }

      logger.log('✅ House deleted:', id);
    } catch (err) {
      logger.error('❌ Failed to delete house:', err);
      throw err;
    }
  }, [user, activeDataset]);

  // ==================== RELATIONSHIP OPERATIONS ====================

  const addRelationship = useCallback(async (relationshipData: RelationshipInput) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      const newId = await dbAddRelationship(relationshipData, datasetId);
      const newRelationship = { ...relationshipData, id: newId };
      setRelationships(prev => [...prev, newRelationship]);
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncAddRelationship(user.uid, activeDataset.id, newId, newRelationship);
      }

      logger.log('✅ Relationship added:', relationshipData.relationshipType);
      return newId;
    } catch (err) {
      logger.error('❌ Failed to add relationship:', err);
      throw err;
    }
  }, [user, activeDataset]);

  const updateRelationship = useCallback(async (id: number, updates: Partial<Relationship>) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      await dbUpdateRelationship(id, updates, datasetId);
      setRelationships(prev => prev.map(rel =>
        rel.id === id ? { ...rel, ...updates } : rel
      ));
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncUpdateRelationship(user.uid, activeDataset.id, id, updates);
      }

      logger.log('✅ Relationship updated:', id);
    } catch (err) {
      logger.error('❌ Failed to update relationship:', err);
      throw err;
    }
  }, [user, activeDataset]);

  const deleteRelationship = useCallback(async (id: number) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      await dbDeleteRelationship(id, datasetId);
      setRelationships(prev => prev.filter(rel => rel.id !== id));
      setDataVersion(v => v + 1);

      // ☁️ Sync to cloud
      if (user && activeDataset) {
        syncDeleteRelationship(user.uid, activeDataset.id, id);
      }

      logger.log('✅ Relationship deleted:', id);
    } catch (err) {
      logger.error('❌ Failed to delete relationship:', err);
      throw err;
    }
  }, [user, activeDataset]);

  // ==================== SPECIAL OPERATIONS ====================

  const foundCadetHouse = useCallback(async (ceremonyData: CadetCeremonyData) => {
    try {
      const datasetId = activeDataset?.id || 'default';
      const result = await dbFoundCadetHouse(ceremonyData, datasetId);
      await loadAllData();

      // ☁️ Sync the new house and updated person.
      //
      // `foundCadetHouse` types both as possibly undefined — it reads them back
      // after writing, and a read can miss. Syncing an undefined would have
      // thrown inside a fire-and-forget call, so the guard is what the code
      // already assumed rather than a new rule.
      if (user && activeDataset && result.house?.id && result.founder?.id) {
        syncAddHouse(user.uid, activeDataset.id, result.house.id, result.house);
        syncUpdatePerson(user.uid, activeDataset.id, result.founder.id, result.founder);
      }

      logger.log('✅ Cadet house founded:', result.house?.houseName);
      return result;
    } catch (err) {
      logger.error('❌ Failed to found cadet house:', err);
      throw err;
    }
  }, [loadAllData, user, activeDataset]);

  const deleteAllData = useCallback(async () => {
    try {
      const datasetId = activeDataset?.id || 'default';
      // Deliberate user-initiated wipe, so local-only tables go too.
      await dbDeleteAllData(datasetId, { includeLocalOnly: true });

      setPeople([]);
      setHouses([]);
      setRelationships([]);
      setDataVersion(v => v + 1);

      // Note: We don't delete cloud data here - user might want to restore it
      // If you want to also clear cloud, add that logic here

      logger.log('✅ All local data deleted for dataset:', datasetId);
    } catch (err) {
      logger.error('❌ Failed to delete all data:', err);
      throw err;
    }
  }, [activeDataset]);

  // ==================== HELPER FUNCTIONS ====================

  const getPersonById = useCallback((id: number) => {
    return people.find(p => p.id === id);
  }, [people]);

  const getHouseById = useCallback((id: number) => {
    return houses.find(h => h.id === id);
  }, [houses]);

  const getPeopleByHouse = useCallback((houseId: number) => {
    return people.filter(p => p.houseId === houseId);
  }, [people]);

  const getRelationshipsForPerson = useCallback((personId: number) => {
    return relationships.filter(r => 
      r.person1Id === personId || r.person2Id === personId
    );
  }, [relationships]);

  // ==================== CONTEXT VALUES ====================

  // STATE CONTEXT: Read-only data and lookup helpers
  // Components subscribing to this will re-render when data changes
  const stateValue = useMemo(() => ({
    // Data arrays
    people,
    houses,
    relationships,

    // UI state
    loading,
    error,
    dataVersion,
    syncStatus,

    // Read-only helpers (these don't mutate, just lookup)
    getPersonById,
    getHouseById,
    getPeopleByHouse,
    getRelationshipsForPerson
  }), [
    people,
    houses,
    relationships,
    loading,
    error,
    dataVersion,
    syncStatus,
    getPersonById,
    getHouseById,
    getPeopleByHouse,
    getRelationshipsForPerson
  ]);

  // DISPATCH CONTEXT: Mutation functions only
  // Components subscribing to this will NOT re-render when data changes
  // (the functions themselves are stable via useCallback)
  const dispatchValue = useMemo(() => ({
    // Person operations
    addPerson,
    updatePerson,
    deletePerson,

    // House operations
    addHouse,
    updateHouse,
    deleteHouse,

    // Relationship operations
    addRelationship,
    updateRelationship,
    deleteRelationship,

    // Special operations
    foundCadetHouse,
    deleteAllData,

    // Manual refresh
    refreshData: loadAllData
  }), [
    addPerson,
    updatePerson,
    deletePerson,
    addHouse,
    updateHouse,
    deleteHouse,
    addRelationship,
    updateRelationship,
    deleteRelationship,
    foundCadetHouse,
    deleteAllData,
    loadAllData
  ]);

  // COMBINED CONTEXT: For backward compatibility with existing components
  // New components should prefer useGenealogyState() or useGenealogyDispatch()
  const combinedValue = useMemo(() => ({
    ...stateValue,
    ...dispatchValue
  }), [stateValue, dispatchValue]);

  return (
    <GenealogyStateContext.Provider value={stateValue}>
      <GenealogyDispatchContext.Provider value={dispatchValue}>
        <GenealogyContext.Provider value={combinedValue}>
          {children}
        </GenealogyContext.Provider>
      </GenealogyDispatchContext.Provider>
    </GenealogyStateContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * useGenealogyState Hook
 *
 * Use this for components that only need to READ data (display lists, show details).
 * These components will re-render when data changes.
 *
 * Returns: { people, houses, relationships, loading, error, dataVersion, syncStatus,
 *            getPersonById, getHouseById, getPeopleByHouse, getRelationshipsForPerson }
 */
export function useGenealogyState(): GenealogyState {
  const context = useContext(GenealogyStateContext);

  if (context === null) {
    throw new Error(
      'useGenealogyState must be used within a GenealogyProvider. ' +
      'Make sure your component is wrapped in <GenealogyProvider>.'
    );
  }

  return context;
}

/**
 * useGenealogyDispatch Hook
 *
 * Use this for components that only need to MUTATE data (forms, buttons that trigger actions).
 * These components will NOT re-render when data changes - only when functions change
 * (which is rare since they're wrapped in useCallback).
 *
 * Returns: { addPerson, updatePerson, deletePerson, addHouse, updateHouse, deleteHouse,
 *            addRelationship, updateRelationship, deleteRelationship, foundCadetHouse,
 *            deleteAllData, refreshData }
 */
export function useGenealogyDispatch(): GenealogyDispatch {
  const context = useContext(GenealogyDispatchContext);

  if (context === null) {
    throw new Error(
      'useGenealogyDispatch must be used within a GenealogyProvider. ' +
      'Make sure your component is wrapped in <GenealogyProvider>.'
    );
  }

  return context;
}

/**
 * useGenealogy Hook (Combined - Backward Compatible)
 *
 * Returns both state and dispatch functions. Use this for:
 * - Existing components (backward compatibility)
 * - Components that need both read and write access
 *
 * For better performance in new components, prefer:
 * - useGenealogyState() for read-only components
 * - useGenealogyDispatch() for action-only components
 */
export function useGenealogy(): GenealogyContextValue {
  const context = useContext(GenealogyContext);

  if (context === null) {
    throw new Error(
      'useGenealogy must be used within a GenealogyProvider. ' +
      'Make sure your component is wrapped in <GenealogyProvider>.'
    );
  }

  return context;
}

// Export contexts for advanced use cases (testing, custom providers)
export { GenealogyStateContext, GenealogyDispatchContext };
export default GenealogyContext;
