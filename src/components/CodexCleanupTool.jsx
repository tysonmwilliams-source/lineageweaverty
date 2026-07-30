/**
 * CodexCleanupTool.jsx - Duplicate Entry Cleanup Utility
 * 
 * PURPOSE:
 * This tool helps identify and remove duplicate Codex entries that may have
 * accumulated due to sync issues. It groups entries by title and lets you
 * select which duplicates to delete while keeping one "canonical" copy.
 * 
 * FEATURES:
 * - Groups entries by exact title match
 * - Shows duplicate count and details
 * - Lets you preview before deleting
 * - Keeps the oldest entry (original) by default
 * - Bulk delete all duplicates with one click
 */

import { useState, useEffect } from 'react';
import { useDataset } from '../contexts/DatasetContext';
import { useAuth } from '../contexts/AuthContext';
import { getAllEntries, deleteEntry } from '../services/codexService';
import { logger } from '../utils/logger';
import { formatShortDateTime as formatDate } from '../utils/formatDate';

function CodexCleanupTool({ onCleanupComplete }) {
  const { activeDataset } = useDataset();
  const { user } = useAuth();
  const [allEntries, setAllEntries] = useState([]);
  const [duplicateGroups, setDuplicateGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState(new Set());
  const [stats, setStats] = useState({ total: 0, unique: 0, duplicates: 0 });
  const [cleanupLog, setCleanupLog] = useState([]);

  // Load and analyze entries on mount
  useEffect(() => {
    analyzeEntries();
  }, [activeDataset]);

  async function analyzeEntries() {
    const datasetId = activeDataset?.id;
    setLoading(true);
    try {
      const entries = await getAllEntries(datasetId);
      setAllEntries(entries);

      // Group entries by title (case-insensitive)
      const groups = {};
      entries.forEach(entry => {
        const key = entry.title.toLowerCase().trim();
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(entry);
      });

      // Filter to only groups with duplicates, sort by created date
      const dupeGroups = Object.values(groups)
        .filter(group => group.length > 1)
        .map(group => {
          // Sort by created date (oldest first - that's the "original")
          const sorted = group.sort((a, b) => 
            new Date(a.created) - new Date(b.created)
          );
          return {
            title: sorted[0].title,
            type: sorted[0].type,
            entries: sorted,
            keepEntry: sorted[0], // Keep the oldest
            deleteEntries: sorted.slice(1) // Delete the rest
          };
        })
        .sort((a, b) => b.entries.length - a.entries.length); // Most duplicates first

      setDuplicateGroups(dupeGroups);

      // Calculate stats
      const uniqueTitles = Object.keys(groups).length;
      const totalDuplicates = entries.length - uniqueTitles;
      setStats({
        total: entries.length,
        unique: uniqueTitles,
        duplicates: totalDuplicates
      });

      // Pre-select all duplicates for deletion
      const toDelete = new Set();
      dupeGroups.forEach(group => {
        group.deleteEntries.forEach(entry => {
          toDelete.add(entry.id);
        });
      });
      setSelectedForDeletion(toDelete);

    } catch (error) {
      logger.error('Error analyzing entries:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleEntrySelection(entryId) {
    setSelectedForDeletion(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  }

  function selectAllDuplicates() {
    const toDelete = new Set();
    duplicateGroups.forEach(group => {
      group.deleteEntries.forEach(entry => {
        toDelete.add(entry.id);
      });
    });
    setSelectedForDeletion(toDelete);
  }

  function deselectAll() {
    setSelectedForDeletion(new Set());
  }

  async function handleDeleteSelected() {
    if (selectedForDeletion.size === 0) {
      alert('No entries selected for deletion.');
      return;
    }

    const confirmMsg = `🗑️ DELETE ${selectedForDeletion.size} DUPLICATE ENTRIES\n\n` +
      `This will permanently delete ${selectedForDeletion.size} duplicate Codex entries.\n\n` +
      `The original (oldest) copy of each entry will be preserved.\n\n` +
      `Are you sure you want to continue?`;

    if (!confirm(confirmMsg)) {
      return;
    }

    const datasetId = activeDataset?.id;
    setCleaning(true);
    const log = [];
    let deleted = 0;
    let failed = 0;

    for (const entryId of selectedForDeletion) {
      const entry = allEntries.find(e => e.id === entryId);
      try {
        await deleteEntry(entryId, datasetId, user?.uid);
        log.push(`✅ Deleted: "${entry?.title}" (ID: ${entryId})`);
        deleted++;
      } catch (error) {
        log.push(`❌ Failed: "${entry?.title}" (ID: ${entryId}) - ${error.message}`);
        failed++;
      }
    }

    setCleanupLog(log);
    setCleaning(false);

    alert(`🧹 Cleanup Complete!\n\n✅ Deleted: ${deleted}\n❌ Failed: ${failed}`);

    // Refresh the analysis
    await analyzeEntries();

    // Notify parent component
    if (onCleanupComplete) {
      onCleanupComplete({ deleted, failed });
    }
  }


  function getTypeIcon(type) {
    const icons = {
      personage: '👤',
      house: '🏰',
      location: '📍',
      event: '⚔️',
      mysteria: '✨',
      custom: '📜'
    };
    return icons[type] || '📜';
  }

  // Loading state
  if (loading) {
    return (
      <div className="codex-cleanup-tool" style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.loadingIcon}>🔍</div>
          <p>Analyzing Codex entries for duplicates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="codex-cleanup-tool" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>🧹 Codex Cleanup Tool</h2>
        <p style={styles.subtitle}>
          Find and remove duplicate entries caused by sync issues
        </p>
      </div>

      {/* Statistics */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.total}</div>
          <div style={styles.statLabel}>Total Entries</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.unique}</div>
          <div style={styles.statLabel}>Unique Titles</div>
        </div>
        <div style={{ ...styles.statCard, ...styles.statCardDanger }}>
          <div style={styles.statValue}>{stats.duplicates}</div>
          <div style={styles.statLabel}>Duplicates Found</div>
        </div>
        <div style={{ ...styles.statCard, ...styles.statCardWarning }}>
          <div style={styles.statValue}>{selectedForDeletion.size}</div>
          <div style={styles.statLabel}>Selected for Deletion</div>
        </div>
      </div>

      {/* No duplicates message */}
      {duplicateGroups.length === 0 && (
        <div style={styles.noDuplicates}>
          <div style={styles.noDuplicatesIcon}>✨</div>
          <h3 style={styles.noDuplicatesTitle}>No Duplicates Found!</h3>
          <p style={styles.noDuplicatesText}>
            Your Codex is clean. Each entry has a unique title.
          </p>
        </div>
      )}

      {/* Action buttons */}
      {duplicateGroups.length > 0 && (
        <div style={styles.actions}>
          <button 
            style={styles.actionButton}
            onClick={selectAllDuplicates}
          >
            ☑️ Select All Duplicates ({stats.duplicates})
          </button>
          <button 
            style={{ ...styles.actionButton, ...styles.actionButtonSecondary }}
            onClick={deselectAll}
          >
            ☐ Deselect All
          </button>
          <button 
            style={{ ...styles.actionButton, ...styles.actionButtonDanger }}
            onClick={handleDeleteSelected}
            disabled={cleaning || selectedForDeletion.size === 0}
          >
            {cleaning ? '🔄 Deleting...' : `🗑️ Delete Selected (${selectedForDeletion.size})`}
          </button>
          <button 
            style={{ ...styles.actionButton, ...styles.actionButtonSecondary }}
            onClick={analyzeEntries}
            disabled={cleaning}
          >
            🔄 Refresh Analysis
          </button>
        </div>
      )}

      {/* Duplicate Groups */}
      {duplicateGroups.length > 0 && (
        <div style={styles.groupsList}>
          <h3 style={styles.groupsTitle}>
            Duplicate Groups ({duplicateGroups.length})
          </h3>
          
          {duplicateGroups.map((group, groupIndex) => (
            <div key={groupIndex} style={styles.group}>
              <div style={styles.groupHeader}>
                <span style={styles.groupIcon}>{getTypeIcon(group.type)}</span>
                <span style={styles.groupTitle}>{group.title}</span>
                <span style={styles.groupCount}>
                  {group.entries.length} copies
                </span>
              </div>
              
              <div style={styles.entriesList}>
                {group.entries.map((entry, entryIndex) => {
                  const isKeep = entry.id === group.keepEntry.id;
                  const isSelected = selectedForDeletion.has(entry.id);
                  
                  return (
                    <div 
                      key={entry.id} 
                      style={{
                        ...styles.entryItem,
                        ...(isKeep ? styles.entryItemKeep : {}),
                        ...(isSelected ? styles.entryItemSelected : {})
                      }}
                    >
                      <div style={styles.entryCheckbox}>
                        {isKeep ? (
                          <span style={styles.keepBadge}>KEEP</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleEntrySelection(entry.id)}
                            style={styles.checkbox}
                          />
                        )}
                      </div>
                      <div style={styles.entryInfo}>
                        <div style={styles.entryId}>ID: {entry.id}</div>
                        <div style={styles.entryDate}>
                          Created: {formatDate(entry.created)}
                        </div>
                        <div style={styles.entryDate}>
                          Updated: {formatDate(entry.updated)}
                        </div>
                        <div style={styles.entryWords}>
                          {entry.wordCount || 0} words
                        </div>
                      </div>
                      {!isKeep && (
                        <button
                          style={styles.deleteButton}
                          onClick={() => toggleEntrySelection(entry.id)}
                          title={isSelected ? 'Click to keep this copy' : 'Click to mark for deletion'}
                        >
                          {isSelected ? '🗑️' : '✓'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cleanup Log */}
      {cleanupLog.length > 0 && (
        <div style={styles.logSection}>
          <h3 style={styles.logTitle}>Cleanup Log</h3>
          <div style={styles.logContent}>
            {cleanupLog.map((log, idx) => (
              <div key={idx} style={styles.logLine}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline styles (to match the medieval theme)
const styles = {
  container: {
    padding: '1.5rem',
    backgroundColor: 'var(--surface-elevated)',
    borderRadius: '8px',
    border: '1px solid var(--border-primary)',
  },
  header: {
    marginBottom: '1.5rem',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '0.95rem',
    color: 'var(--text-secondary)',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
    color: 'var(--text-secondary)',
  },
  loadingIcon: {
    fontSize: '2rem',
    marginBottom: '1rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    backgroundColor: 'var(--surface-primary)',
    padding: '1rem',
    borderRadius: '6px',
    textAlign: 'center',
    border: '1px solid var(--border-primary)',
  },
  statCardDanger: {
    borderColor: '#c53030',
    backgroundColor: 'rgba(197, 48, 48, 0.1)',
  },
  statCardWarning: {
    borderColor: '#d69e2e',
    backgroundColor: 'rgba(214, 158, 46, 0.1)',
  },
  statValue: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    marginTop: '0.25rem',
  },
  noDuplicates: {
    textAlign: 'center',
    padding: '3rem',
    backgroundColor: 'var(--surface-primary)',
    borderRadius: '8px',
    border: '1px solid var(--accent-secondary)',
  },
  noDuplicatesIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  noDuplicatesTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    marginBottom: '0.5rem',
  },
  noDuplicatesText: {
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '0.75rem 1.25rem',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.9rem',
    backgroundColor: 'var(--accent-primary)',
    color: 'white',
    transition: 'all 0.2s ease',
  },
  actionButtonSecondary: {
    backgroundColor: 'var(--surface-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
  },
  actionButtonDanger: {
    backgroundColor: '#c53030',
    color: 'white',
  },
  groupsList: {
    marginTop: '1rem',
  },
  groupsTitle: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    marginBottom: '1rem',
  },
  group: {
    backgroundColor: 'var(--surface-primary)',
    borderRadius: '8px',
    border: '1px solid var(--border-primary)',
    marginBottom: '1rem',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    backgroundColor: 'var(--surface-elevated)',
    borderBottom: '1px solid var(--border-primary)',
  },
  groupIcon: {
    fontSize: '1.25rem',
  },
  groupTitle: {
    flex: 1,
    fontWeight: '600',
    color: 'var(--text-primary)',
  },
  groupCount: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--surface-primary)',
    padding: '0.25rem 0.75rem',
    borderRadius: '999px',
  },
  entriesList: {
    padding: '0.5rem',
  },
  entryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    backgroundColor: 'var(--surface-elevated)',
    border: '1px solid transparent',
  },
  entryItemKeep: {
    borderColor: 'var(--accent-secondary)',
    backgroundColor: 'rgba(72, 187, 120, 0.1)',
  },
  entryItemSelected: {
    borderColor: '#c53030',
    backgroundColor: 'rgba(197, 48, 48, 0.1)',
  },
  entryCheckbox: {
    width: '60px',
    textAlign: 'center',
  },
  keepBadge: {
    fontSize: '0.7rem',
    fontWeight: 'bold',
    color: 'var(--accent-secondary)',
    backgroundColor: 'rgba(72, 187, 120, 0.2)',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  entryInfo: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: 'auto 1fr 1fr auto',
    gap: '0.5rem 1rem',
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
  },
  entryId: {
    fontFamily: 'monospace',
    color: 'var(--text-primary)',
  },
  entryDate: {
    color: 'var(--text-secondary)',
  },
  entryWords: {
    textAlign: 'right',
  },
  deleteButton: {
    padding: '0.5rem',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    backgroundColor: 'transparent',
  },
  logSection: {
    marginTop: '1.5rem',
    padding: '1rem',
    backgroundColor: 'var(--surface-primary)',
    borderRadius: '8px',
    border: '1px solid var(--border-primary)',
  },
  logTitle: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: 'var(--text-primary)',
    marginBottom: '0.75rem',
  },
  logContent: {
    maxHeight: '200px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  logLine: {
    padding: '0.25rem 0',
    color: 'var(--text-secondary)',
  },
};

export default CodexCleanupTool;
