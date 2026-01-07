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

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  syncDeleteCodexEntry,
  getSyncStatus
} from '../services/dataSyncService';

import { useAuth } from './AuthContext';

// Create the context object
const GenealogyContext = createContext(null);

/**
 * GenealogyProvider Component
 * 
 * This wraps your app (or part of it) and provides the shared data to all children.
 * Any component inside this provider can access the data via useGenealogy().
 */
export function GenealogyProvider({ children }) {
  // ==================== STATE ====================
  const [people, setPeople] = useState([]);
  const [houses, setHouses] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  
  // ☁️ Cloud sync state
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'error'
  const [syncInitialized, setSyncInitialized] = useState(false);
  
  // Get current user from auth context
  const { user } = useAuth();

  // ==================== INITIAL DATA LOAD + CLOUD SYNC ====================
  
  useEffect(() => {
    if (user && !syncInitialized) {
      // User is logged in, initialize sync
      initializeSyncAndLoad();
    } else if (!user) {
      // User logged out, just load local data
      loadAllData();
    }
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
      
      console.log('🔄 Starting sync initialization...');
      
      // Initialize sync - this will either upload local data or download cloud data
      const syncResult = await initializeSync(user.uid);
      
      console.log('📊 Sync result:', syncResult.status);
      
      // Now load whatever data we have (local DB is now authoritative)
      await loadAllData();
      
      setSyncStatus('synced');
      setSyncInitialized(true);
      
    } catch (err) {
      console.error('❌ Sync initialization failed:', err);
      setSyncStatus('error');
      setError(err.message);
      
      // Still try to load local data
      await loadAllData();
    }
  }, [user]);

  /**
   * Load all data from IndexedDB
   */
  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [allPeople, allHouses, allRelationships] = await Promise.all([
        getAllPeople(),
        getAllHouses(),
        getAllRelationships()
      ]);
      
      setPeople(allPeople);
      setHouses(allHouses);
      setRelationships(allRelationships);
      setDataVersion(v => v + 1);
      
      console.log('📚 GenealogyContext: Data loaded', {
        people: allPeople.length,
        houses: allHouses.length,
        relationships: allRelationships.length
      });
    } catch (err) {
      console.error('❌ GenealogyContext: Failed to load data', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // ==================== PERSON OPERATIONS ====================

  /**
   * Add a new person
   * Now includes cloud sync!
   */
  const addPerson = useCallback(async (personData) => {
    try {
      // 1. Add to local database
      const newId = await dbAddPerson(personData);
      
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
        });
        
        await dbUpdatePerson(newId, { codexEntryId: codexEntryId });
        console.log('📖 Codex entry auto-created for:', fullName);
        
        // ☁️ Sync codex entry to cloud
        if (user) {
          syncAddCodexEntry(user.uid, codexEntryId, {
            type: 'personage',
            title: fullName,
            subtitle: subtitle || null,
            personId: newId
          });
        }
      } catch (codexErr) {
        console.warn('⚠️ Failed to auto-create Codex entry:', codexErr.message);
      }
      
      // 3. Update local state
      const newPerson = { ...personData, id: newId, codexEntryId: codexEntryId };
      setPeople(prev => [...prev, newPerson]);
      setDataVersion(v => v + 1);
      
      // ☁️ 4. Sync to cloud (async, non-blocking)
      if (user) {
        syncAddPerson(user.uid, newId, newPerson);
      }
      
      console.log('✅ Person added:', newPerson.firstName, newPerson.lastName);
      return newId;
    } catch (err) {
      console.error('❌ Failed to add person:', err);
      throw err;
    }
  }, [user]);

  /**
   * Update an existing person
   */
  const updatePerson = useCallback(async (id, updates) => {
    try {
      await dbUpdatePerson(id, updates);
      
      setPeople(prev => prev.map(person => 
        person.id === id ? { ...person, ...updates } : person
      ));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncUpdatePerson(user.uid, id, updates);
      }
      
      console.log('✅ Person updated:', id);
    } catch (err) {
      console.error('❌ Failed to update person:', err);
      throw err;
    }
  }, [user]);

  /**
   * Delete a person
   */
  const deletePerson = useCallback(async (id) => {
    try {
      const personToDelete = people.find(p => p.id === id);
      const codexEntryId = personToDelete?.codexEntryId;
      
      await dbDeletePerson(id);
      
      if (codexEntryId) {
        try {
          await deleteCodexEntry(codexEntryId);
          console.log('📖 Codex entry cascade-deleted:', codexEntryId);
          
          // ☁️ Sync codex deletion to cloud
          if (user) {
            syncDeleteCodexEntry(user.uid, codexEntryId);
          }
        } catch (codexErr) {
          console.warn('⚠️ Failed to cascade-delete Codex entry:', codexErr.message);
        }
      }
      
      setPeople(prev => prev.filter(person => person.id !== id));
      setRelationships(prev => prev.filter(rel => 
        rel.person1Id !== id && rel.person2Id !== id
      ));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncDeletePerson(user.uid, id);
      }
      
      console.log('✅ Person deleted:', id);
    } catch (err) {
      console.error('❌ Failed to delete person:', err);
      throw err;
    }
  }, [people, user]);

  // ==================== HOUSE OPERATIONS ====================

  const addHouse = useCallback(async (houseData) => {
    try {
      const newId = await dbAddHouse(houseData);
      const newHouse = { ...houseData, id: newId };
      setHouses(prev => [...prev, newHouse]);
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncAddHouse(user.uid, newId, newHouse);
      }
      
      console.log('✅ House added:', newHouse.houseName);
      return newId;
    } catch (err) {
      console.error('❌ Failed to add house:', err);
      throw err;
    }
  }, [user]);

  const updateHouse = useCallback(async (id, updates) => {
    try {
      await dbUpdateHouse(id, updates);
      setHouses(prev => prev.map(house => 
        house.id === id ? { ...house, ...updates } : house
      ));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncUpdateHouse(user.uid, id, updates);
      }
      
      console.log('✅ House updated:', id);
    } catch (err) {
      console.error('❌ Failed to update house:', err);
      throw err;
    }
  }, [user]);

  const deleteHouse = useCallback(async (id) => {
    try {
      await dbDeleteHouse(id);
      setHouses(prev => prev.filter(house => house.id !== id));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncDeleteHouse(user.uid, id);
      }
      
      console.log('✅ House deleted:', id);
    } catch (err) {
      console.error('❌ Failed to delete house:', err);
      throw err;
    }
  }, [user]);

  // ==================== RELATIONSHIP OPERATIONS ====================

  const addRelationship = useCallback(async (relationshipData) => {
    try {
      const newId = await dbAddRelationship(relationshipData);
      const newRelationship = { ...relationshipData, id: newId };
      setRelationships(prev => [...prev, newRelationship]);
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncAddRelationship(user.uid, newId, newRelationship);
      }
      
      console.log('✅ Relationship added:', relationshipData.relationshipType);
      return newId;
    } catch (err) {
      console.error('❌ Failed to add relationship:', err);
      throw err;
    }
  }, [user]);

  const updateRelationship = useCallback(async (id, updates) => {
    try {
      await dbUpdateRelationship(id, updates);
      setRelationships(prev => prev.map(rel => 
        rel.id === id ? { ...rel, ...updates } : rel
      ));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncUpdateRelationship(user.uid, id, updates);
      }
      
      console.log('✅ Relationship updated:', id);
    } catch (err) {
      console.error('❌ Failed to update relationship:', err);
      throw err;
    }
  }, [user]);

  const deleteRelationship = useCallback(async (id) => {
    try {
      await dbDeleteRelationship(id);
      setRelationships(prev => prev.filter(rel => rel.id !== id));
      setDataVersion(v => v + 1);
      
      // ☁️ Sync to cloud
      if (user) {
        syncDeleteRelationship(user.uid, id);
      }
      
      console.log('✅ Relationship deleted:', id);
    } catch (err) {
      console.error('❌ Failed to delete relationship:', err);
      throw err;
    }
  }, [user]);

  // ==================== SPECIAL OPERATIONS ====================

  const foundCadetHouse = useCallback(async (ceremonyData) => {
    try {
      const result = await dbFoundCadetHouse(ceremonyData);
      await loadAllData();
      
      // ☁️ Sync the new house and updated person
      if (user) {
        syncAddHouse(user.uid, result.house.id, result.house);
        syncUpdatePerson(user.uid, result.founder.id, result.founder);
      }
      
      console.log('✅ Cadet house founded:', result.house.houseName);
      return result;
    } catch (err) {
      console.error('❌ Failed to found cadet house:', err);
      throw err;
    }
  }, [loadAllData, user]);

  const deleteAllData = useCallback(async () => {
    try {
      await dbDeleteAllData();
      
      setPeople([]);
      setHouses([]);
      setRelationships([]);
      setDataVersion(v => v + 1);
      
      // Note: We don't delete cloud data here - user might want to restore it
      // If you want to also clear cloud, add that logic here
      
      console.log('✅ All local data deleted');
    } catch (err) {
      console.error('❌ Failed to delete all data:', err);
      throw err;
    }
  }, []);

  // ==================== HELPER FUNCTIONS ====================

  const getPersonById = useCallback((id) => {
    return people.find(p => p.id === id);
  }, [people]);

  const getHouseById = useCallback((id) => {
    return houses.find(h => h.id === id);
  }, [houses]);

  const getPeopleByHouse = useCallback((houseId) => {
    return people.filter(p => p.houseId === houseId);
  }, [people]);

  const getRelationshipsForPerson = useCallback((personId) => {
    return relationships.filter(r => 
      r.person1Id === personId || r.person2Id === personId
    );
  }, [relationships]);

  // ==================== CONTEXT VALUE ====================
  
  const contextValue = {
    // Data
    people,
    houses,
    relationships,
    
    // State
    loading,
    error,
    dataVersion,
    syncStatus, // ☁️ New: expose sync status
    
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
    
    // Helpers
    getPersonById,
    getHouseById,
    getPeopleByHouse,
    getRelationshipsForPerson,
    
    // Manual refresh
    refreshData: loadAllData
  };

  return (
    <GenealogyContext.Provider value={contextValue}>
      {children}
    </GenealogyContext.Provider>
  );
}

/**
 * useGenealogy Hook
 */
export function useGenealogy() {
  const context = useContext(GenealogyContext);
  
  if (context === null) {
    throw new Error(
      'useGenealogy must be used within a GenealogyProvider. ' +
      'Make sure your component is wrapped in <GenealogyProvider>.'
    );
  }
  
  return context;
}

export default GenealogyContext;
