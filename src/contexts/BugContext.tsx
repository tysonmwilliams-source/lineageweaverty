/**
 * BugContext.jsx - Global Bug Tracking Provider for Lineageweaver
 * 
 * PURPOSE:
 * This context provides a global bug tracking system accessible from
 * anywhere in the app. It works similarly to GenealogyContext but
 * specifically for managing bug reports.
 * 
 * HOW IT WORKS:
 * 1. On app load, the context fetches all bugs from IndexedDB
 * 2. Any component can access bugs via useBugTracker() hook
 * 3. The floating BugReporterButton uses this context to submit bugs
 * 4. When bugs change, all subscribed components re-render
 * 
 * WHAT'S A CONTEXT?
 * Think of a React Context like a "global variable" that any component
 * can access without passing props through every level. It's like
 * having a shared bulletin board that anyone can read or write to.
 * 
 * CLOUD SYNC:
 * Bugs sync to Firestore when user is logged in, so you can track
 * bugs across devices and sessions.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  createBug as dbCreateBug,
  getBug as dbGetBug,
  getAllBugs as dbGetAllBugs,
  updateBug as dbUpdateBug,
  deleteBug as dbDeleteBug,
  getBugStatistics,
  exportBugsForClaudeCode
} from '../services/bugService';
import { useAuth } from './AuthContext';

// Import Firestore functions for cloud sync
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { db as firestoreDb } from '../config/firebase';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import type { ReactNode } from 'react';
import type { Bug } from '../services/types';

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE THE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

// This creates an empty "container" that we'll fill with bug data
/** What `useBugTracker()` hands back. */
export interface BugContextValue {
  bugs: Bug[];
  loading: boolean;
  error: string | null;
  /** Recomputed from `bugs` on every change, not read from the database. */
  statistics: BugSummary;
  openBugs: Bug[];
  inProgressBugs: Bug[];
  resolvedBugs: Bug[];
  addBug: (bugData: Partial<Bug>) => Promise<number>;
  updateBug: (id: number, updates: Partial<Bug>) => Promise<void>;
  deleteBug: (id: number) => Promise<void>;
  /** Sets status to 'resolved' and stamps `resolved`. */
  resolveBug: (id: number) => Promise<void>;
  refreshBugs: () => Promise<void>;
  /** Markdown for pasting into a Claude Code session. */
  exportForClaudeCode: (options?: BugExportOptions) => Promise<string>;
  downloadExport: () => Promise<void>;
}

/**
 * The in-memory tally this context derives.
 *
 * Distinct from `BugStatistics` in types.ts, which is what
 * `bugService.getBugStatistics` reads out of Dexie. This one is computed from
 * the `bugs` array already in state, so it stays in step with the list the user
 * is looking at without a second read.
 */
/** Which bugs an export includes. Both default inside `bugService`. */
export interface BugExportOptions {
  /** Defaults to ['open', 'in-progress'] — a resolved bug is not a task. */
  statuses?: string[];
  priorities?: string[];
}

export interface BugSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
}

const BugContext = createContext<BugContextValue | null>(null);

// ═══════════════════════════════════════════════════════════════════════════════
// CLOUD SYNC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Add a bug to Firestore
 */
async function syncBugToCloud(userId: string, bugData: Bug) {
  try {
    const bugsRef = collection(firestoreDb, 'users', userId, 'bugs');
    const docRef = doc(bugsRef, String(bugData.id));
    
    await setDoc(docRef, {
      ...bugData,
      localId: bugData.id,
      syncedAt: serverTimestamp()
    });
    
    logger.log('☁️ Bug synced to cloud:', bugData.title);
  } catch (error) {
    logger.error('☁️ Error syncing bug to cloud:', error);
    // Don't throw - local-first approach, cloud sync is optional
  }
}

/**
 * Delete a bug from Firestore
 * @param {string} userId - The user's Firebase UID
 * @param {number} bugId - The bug's local ID
 */
async function deleteBugFromCloud(userId: string, bugId: number) {
  try {
    const docRef = doc(firestoreDb, 'users', userId, 'bugs', String(bugId));
    await deleteDoc(docRef);
    logger.log('☁️ Bug deleted from cloud:', bugId);
  } catch (error) {
    logger.error('☁️ Error deleting bug from cloud:', error);
  }
}

/**
 * Get all bugs from Firestore
 * @param {string} userId - The user's Firebase UID
 * @returns {Array} Array of bug objects
 */
async function getAllBugsFromCloud(userId: string) {
  try {
    const bugsRef = collection(firestoreDb, 'users', userId, 'bugs');
    const snapshot = await getDocs(bugsRef);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    logger.error('☁️ Error getting bugs from cloud:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUG TRACKER PROVIDER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BugTrackerProvider Component
 * 
 * This wraps your app and provides bug tracking functionality to all children.
 * Any component inside this provider can access bugs via useBugTracker().
 * 
 * @param {Object} props
 */
export function BugTrackerProvider({ children }: { children: ReactNode }) {
  // ==================== STATE ====================
  // These are the "buckets" that hold our bug data
  
  const [bugs, setBugs] = useState<Bug[]>([]);           // Array of all bug records
  const [loading, setLoading] = useState(true);   // True while loading from DB
  const [error, setError] = useState<string | null>(null);       // Error message if something fails
  
  // Get current user from auth context (for cloud sync)
  const { user } = useAuth();

  // ==================== LOAD BUGS ON MOUNT ====================
  
  /**
   * Load all bugs from IndexedDB
   * This runs once when the component first mounts (appears on screen)
   */
  const loadBugs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const allBugs = await dbGetAllBugs();
      setBugs(allBugs);
      
      logger.log('🐛 Loaded', allBugs.length, 'bugs');
    } catch (err) {
      logger.error('❌ Error loading bugs:', err);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Run loadBugs when component mounts
  useEffect(() => {
    loadBugs();
  }, [loadBugs]);

  // ==================== CRUD OPERATIONS ====================
  // These functions let components create, update, and delete bugs

  /**
   * Create a new bug report
   * 
   * This is what gets called when you submit the bug report form.
   * It saves to local DB first (instant), then syncs to cloud (background).
   * 
   * @param {Object} bugData - The bug information
   * @returns {Promise<number>} The new bug's ID
   */
  const addBug = useCallback(async (bugData: Partial<Bug>) => {
    try {
      // Save to local database (instant)
      const id = await dbCreateBug(bugData);
      
      // Get the full record with ID
      const newBug = await dbGetBug(id);

      // `dbGetBug` can return undefined — for the row just written it will not,
      // but pushing an undefined into `bugs` would crash the list on render,
      // which is a worse failure than skipping the optimistic update.
      if (newBug) {
        setBugs(prev => [...prev, newBug]);
        if (user) {
          syncBugToCloud(user.uid, newBug);
        }
      }
      
      return id;
    } catch (err) {
      logger.error('❌ Error adding bug:', err);
      throw err;
    }
  }, [user]);

  /**
   * Update an existing bug
   * 
   * @param {number} id - The bug's ID
   * @param {Object} updates - Fields to update
   */
  const updateBug = useCallback(async (id: number, updates: Partial<Bug>) => {
    try {
      // Update in local database
      await dbUpdateBug(id, updates);
      
      // Get updated record
      const updatedBug = await dbGetBug(id);
      
      // Keep the existing row when the refetch came back empty. The `if (user
      // && updatedBug)` below already treats undefined as possible; mapping it
      // in unconditionally would have put a hole in the list the guard then
      // declined to sync.
      setBugs(prev => prev.map(bug =>
        bug.id === id && updatedBug ? updatedBug : bug
      ));
      
      // Sync to cloud
      if (user && updatedBug) {
        syncBugToCloud(user.uid, updatedBug);
      }
    } catch (err) {
      logger.error('❌ Error updating bug:', err);
      throw err;
    }
  }, [user]);

  /**
   * Delete a bug
   * 
   * @param {number} id - The bug's ID
   */
  const deleteBug = useCallback(async (id: number) => {
    try {
      // Delete from local database
      await dbDeleteBug(id);
      
      // Update state
      setBugs(prev => prev.filter(bug => bug.id !== id));
      
      // Delete from cloud
      if (user) {
        deleteBugFromCloud(user.uid, id);
      }
    } catch (err) {
      logger.error('❌ Error deleting bug:', err);
      throw err;
    }
  }, [user]);

  /**
   * Resolve a bug (set status to 'resolved')
   * Convenience wrapper around updateBug
   * 
   * @param {number} id - The bug's ID
   */
  const resolveBug = useCallback(async (id: number) => {
    await updateBug(id, { status: 'resolved' });
  }, [updateBug]);

  // ==================== COMPUTED VALUES ====================
  // These are derived from the bugs array using useMemo for performance

  /**
   * Get statistics about bugs
   * useMemo = "remember this calculation until bugs changes"
   */
  const statistics = useMemo(() => {
    return {
      total: bugs.length,
      open: bugs.filter(b => b.status === 'open').length,
      inProgress: bugs.filter(b => b.status === 'in-progress').length,
      resolved: bugs.filter(b => b.status === 'resolved').length,
      critical: bugs.filter(b => b.priority === 'critical' && b.status !== 'resolved').length,
      high: bugs.filter(b => b.priority === 'high' && b.status !== 'resolved').length
    };
  }, [bugs]);

  /**
   * Get bugs filtered by status
   */
  const openBugs = useMemo(() => 
    bugs.filter(b => b.status === 'open')
  , [bugs]);

  const inProgressBugs = useMemo(() => 
    bugs.filter(b => b.status === 'in-progress')
  , [bugs]);

  const resolvedBugs = useMemo(() => 
    bugs.filter(b => b.status === 'resolved')
  , [bugs]);

  // ==================== EXPORT FOR CLAUDE CODE ====================

  /**
   * Export bugs for Claude Code
   * Returns markdown formatted for AI diagnosis
   * 
   * @param {Object} options - Export options
   * @returns {Promise<string>} Markdown content
   */
  const exportForClaudeCode = useCallback(async (options: BugExportOptions = {}) => {
    return exportBugsForClaudeCode(options);
  }, []);

  /**
   * Download export as a file
   * Creates and triggers download of markdown file
   */
  const downloadExport = useCallback(async () => {
    try {
      const markdown = await exportBugsForClaudeCode();
      
      // Create a blob (binary large object) with the markdown content
      const blob = new Blob([markdown], { type: 'text/markdown' });
      
      // Create a download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lineageweaver-bugs-${new Date().toISOString().split('T')[0]}.md`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
      
      logger.log('📥 Bug report downloaded');
    } catch (err) {
      logger.error('❌ Error downloading export:', err);
      throw err;
    }
  }, []);

  // ==================== CONTEXT VALUE ====================
  // This is what gets shared with all child components

  const contextValue = useMemo(() => ({
    // Data
    bugs,
    loading,
    error,
    
    // Stats
    statistics,
    openBugs,
    inProgressBugs,
    resolvedBugs,
    
    // Actions
    addBug,
    updateBug,
    deleteBug,
    resolveBug,
    refreshBugs: loadBugs,
    
    // Export
    exportForClaudeCode,
    downloadExport
  }), [
    bugs,
    loading,
    error,
    statistics,
    openBugs,
    inProgressBugs,
    resolvedBugs,
    addBug,
    updateBug,
    deleteBug,
    resolveBug,
    loadBugs,
    exportForClaudeCode,
    downloadExport
  ]);

  return (
    <BugContext.Provider value={contextValue}>
      {children}
    </BugContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOM HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * useBugTracker Hook
 * 
 * This is how components access the bug tracker.
 * 
 * USAGE:
 * ```jsx
 * function MyComponent() {
 *   const { bugs, addBug, statistics } = useBugTracker();
 *   
 *   const handleSubmit = async () => {
 *     await addBug({ title: 'Something broke', priority: 'high' });
 *   };
 *   
 *   return <div>Open bugs: {statistics.open}</div>;
 * }
 * ```
 * 
 * @returns {Object} Bug tracker context value
 */
export function useBugTracker(): BugContextValue {
  const context = useContext(BugContext);
  
  if (!context) {
    throw new Error(
      'useBugTracker must be used within a BugTrackerProvider. ' +
      'Make sure your app is wrapped with <BugTrackerProvider>.'
    );
  }
  
  return context;
}

export default BugContext;
