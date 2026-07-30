/**
 * DataHealthDashboard.jsx - Database Health Check & Issue Scanner
 * 
 * Provides a comprehensive view of data quality issues across the entire database.
 * Scans for errors, warnings, missing data, and structural problems.
 * 
 * Features:
 * - One-click full database scan
 * - Categorized issue display
 * - Quick navigation to problem records
 * - DELETE functionality for orphaned/invalid data
 * - NAMED AFTER quick-action for namesake resolution
 * - Bulk cleanup operations
 * - Summary statistics
 * - Suggestions for improvement
 */

import { useState, useCallback } from 'react';
import { useGenealogy } from '../contexts/GenealogyContext';
import { useDataset } from '../contexts/DatasetContext';
import { runHealthCheck } from '../utils/SmartDataValidator';
import { runIntegrityCheck } from '../utils/dataIntegrity';
import { getAllDignities } from '../services/dignityService';
import { getAllEntries, getAllLinks } from '../services/codexService';
import { getAllHeraldry } from '../services/heraldryService';
import { logger } from '../utils/logger';
import Icon from './icons';

function DataHealthDashboard({ isDarkTheme = true, onNavigateToPerson, onNavigateToRelationship }) {
  const { 
    people, 
    relationships, 
    houses,
    deletePerson,
    deleteRelationship,
    addRelationship
  } = useGenealogy();
  
  const { activeDataset } = useDataset();
  const datasetId = activeDataset?.id || 'default';

  const [report, setReport] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [integrity, setIntegrity] = useState(null);
  const [integrityError, setIntegrityError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, id, name }
  const [namedAfterConfirm, setNamedAfterConfirm] = useState(null); // { person1Id, person2Id, names }
  
  // Theme
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    bgLight: '#3a2f20',
    bgLighter: '#4a3d2a',
    text: '#e9dcc9',
    textSecondary: '#b8a989',
    border: '#4a3d2a',
    accent: '#d4a574',
    success: '#6b8e5e',
    warning: '#c4a44e',
    error: '#a65d5d',
    info: '#6b8ea5',
    namesake: '#7a6b9e' // Purple for namesake actions
  } : {
    bg: '#f5f0e8',
    bgLight: '#ede7dc',
    bgLighter: '#e5dfd0',
    text: '#2d2418',
    textSecondary: '#5a4d3a',
    border: '#d4c4a4',
    accent: '#8b6b3d',
    success: '#5a7a4a',
    warning: '#9a8040',
    error: '#8a4a4a',
    info: '#4a6a7a',
    namesake: '#6a5a8a'
  };

  /**
   * Run the health check
   */
  const handleRunScan = useCallback(() => {
    setIsScanning(true);
    setDeleteConfirm(null);
    setNamedAfterConfirm(null);
    setIntegrityError(null);

    // Use setTimeout to allow UI to update before heavy computation
    setTimeout(async () => {
      const healthReport = runHealthCheck({ people, relationships, houses });
      setReport(healthReport);

      // Referential integrity runs alongside the quality checks. It needs the
      // tables GenealogyContext doesn't hold, so they're read here. A failure to
      // load them must not lose the health report that already succeeded.
      try {
        const [dignities, codexEntries, codexLinks, heraldry] = await Promise.all([
          getAllDignities(datasetId),
          getAllEntries(datasetId),
          getAllLinks(datasetId),
          getAllHeraldry(datasetId)
        ]);

        setIntegrity(runIntegrityCheck({
          people,
          houses,
          relationships,
          codexEntries,
          codexLinks,
          dignities,
          heraldry
        }));
      } catch (error) {
        logger.error('Integrity check failed:', error);
        setIntegrity(null);
        setIntegrityError(error.message || 'Could not load data for the integrity check.');
      }

      setIsScanning(false);
    }, 100);
  }, [people, relationships, houses, datasetId]);

  /**
   * Delete a single person
   */
  const handleDeletePerson = async (personId, personName) => {
    if (deleteConfirm?.type === 'person' && deleteConfirm?.id === personId) {
      // Second click - actually delete
      try {
        setIsDeleting(true);
        await deletePerson(personId);
        setDeleteConfirm(null);
        // Rescan after delete
        handleRunScan();
      } catch (error) {
        alert('Error deleting person: ' + error.message);
      } finally {
        setIsDeleting(false);
      }
    } else {
      // First click - ask for confirmation
      setDeleteConfirm({ type: 'person', id: personId, name: personName });
      setNamedAfterConfirm(null);
    }
  };

  /**
   * Delete a single relationship
   */
  const handleDeleteRelationship = async (relationshipId, description) => {
    if (deleteConfirm?.type === 'relationship' && deleteConfirm?.id === relationshipId) {
      // Second click - actually delete
      try {
        setIsDeleting(true);
        await deleteRelationship(relationshipId);
        setDeleteConfirm(null);
        // Rescan after delete
        handleRunScan();
      } catch (error) {
        alert('Error deleting relationship: ' + error.message);
      } finally {
        setIsDeleting(false);
      }
    } else {
      // First click - ask for confirmation
      setDeleteConfirm({ type: 'relationship', id: relationshipId, name: description });
      setNamedAfterConfirm(null);
    }
  };

  /**
   * Create a "named-after" relationship between two people
   * This resolves duplicate warnings for namesakes
   */
  const handleCreateNamedAfter = async (person1Id, person2Id, person1Name, person2Name) => {
    // Determine which person is newer (named after) vs older (honored)
    const person1 = people.find(p => p.id === person1Id);
    const person2 = people.find(p => p.id === person2Id);
    
    let namedPersonId, honoredPersonId, namedName, honoredName;
    
    // The newer person (later birth year) is the one "named after" the older
    const year1 = person1?.dateOfBirth ? parseInt(person1.dateOfBirth.split('-')[0]) : null;
    const year2 = person2?.dateOfBirth ? parseInt(person2.dateOfBirth.split('-')[0]) : null;
    
    if (year1 && year2) {
      if (year1 > year2) {
        // Person 1 is younger, named after Person 2
        namedPersonId = person1Id;
        honoredPersonId = person2Id;
        namedName = person1Name;
        honoredName = person2Name;
      } else {
        // Person 2 is younger, named after Person 1
        namedPersonId = person2Id;
        honoredPersonId = person1Id;
        namedName = person2Name;
        honoredName = person1Name;
      }
    } else {
      // Can't determine - show confirmation to let user choose
      if (namedAfterConfirm?.person1Id === person1Id && namedAfterConfirm?.person2Id === person2Id) {
        // Already confirming - user clicked again, cancel
        setNamedAfterConfirm(null);
        return;
      }
      setNamedAfterConfirm({ 
        person1Id, person2Id, 
        person1Name, person2Name,
        needsChoice: true 
      });
      setDeleteConfirm(null);
      return;
    }
    
    // Check if already confirming this exact pair
    if (namedAfterConfirm?.person1Id === namedPersonId && 
        namedAfterConfirm?.person2Id === honoredPersonId &&
        !namedAfterConfirm?.needsChoice) {
      // Second click - create the relationship
      try {
        await addRelationship({
          person1Id: namedPersonId,
          person2Id: honoredPersonId,
          relationshipType: 'named-after'
        });
        setNamedAfterConfirm(null);
        alert(`Created "named after" relationship: ${namedName} was named after ${honoredName}`);
        handleRunScan();
      } catch (error) {
        alert('Error creating relationship: ' + error.message);
      }
      return;
    }
    
    // First click - show confirmation
    setNamedAfterConfirm({ 
      person1Id: namedPersonId, 
      person2Id: honoredPersonId,
      person1Name: namedName,
      person2Name: honoredName,
      needsChoice: false
    });
    setDeleteConfirm(null);
  };

  /**
   * Create named-after with explicit direction (for when we can't auto-detect)
   */
  const handleCreateNamedAfterWithDirection = async (namedPersonId, honoredPersonId) => {
    const namedPerson = people.find(p => p.id === namedPersonId);
    const honoredPerson = people.find(p => p.id === honoredPersonId);
    
    try {
      await addRelationship({
        person1Id: namedPersonId,
        person2Id: honoredPersonId,
        relationshipType: 'named-after'
      });
      setNamedAfterConfirm(null);
      alert(`Created "named after" relationship: ${namedPerson?.firstName} was named after ${honoredPerson?.firstName}`);
      handleRunScan();
    } catch (error) {
      alert('Error creating relationship: ' + error.message);
    }
  };

  /**
   * Bulk delete all orphaned relationships
   */
  const handleDeleteAllOrphanedRelationships = async () => {
    if (!report) return;
    
    const orphanedRels = report.structuralIssues.filter(
      issue => issue.type === 'ORPHANED_RELATIONSHIP'
    );
    
    if (orphanedRels.length === 0) {
      alert('No orphaned relationships to delete');
      return;
    }
    
    const confirmMsg = `Delete ${orphanedRels.length} orphaned relationship(s)?\n\nThese are relationships that reference people who no longer exist.`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
      setIsDeleting(true);
      let deleted = 0;
      
      for (const issue of orphanedRels) {
        try {
          await deleteRelationship(issue.relationshipId);
          deleted++;
        } catch (e) {
          logger.error('Failed to delete relationship:', issue.relationshipId, e);
        }
      }
      
      alert(`Deleted ${deleted} orphaned relationship(s)`);
      handleRunScan();
    } catch (error) {
      alert('Error during bulk delete: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Bulk delete all "Unknown" persons (people with no first or last name)
   */
  const handleDeleteUnknownPersons = async () => {
    const unknownPersons = people.filter(p => 
      !p.firstName?.trim() || 
      p.firstName?.toLowerCase() === 'unknown' ||
      (!p.lastName?.trim() && !p.firstName?.trim())
    );
    
    if (unknownPersons.length === 0) {
      alert('No unknown persons found to delete');
      return;
    }
    
    const names = unknownPersons.map(p => 
      `• ${p.firstName || '(no name)'} ${p.lastName || ''} (ID: ${p.id})`
    ).join('\n');
    
    const confirmMsg = `Delete ${unknownPersons.length} unknown/unnamed person(s)?\n\n${names}\n\nThis will also delete their relationships.`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
      setIsDeleting(true);
      let deleted = 0;
      
      for (const person of unknownPersons) {
        try {
          await deletePerson(person.id);
          deleted++;
        } catch (e) {
          logger.error('Failed to delete person:', person.id, e);
        }
      }
      
      alert(`Deleted ${deleted} unknown person(s)`);
      handleRunScan();
    } catch (error) {
      alert('Error during bulk delete: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Get severity badge color
   */
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'error': return theme.error;
      case 'warning': return theme.warning;
      case 'info': return theme.info;
      default: return theme.textSecondary;
    }
  };

  /**
   * Get severity icon
   */
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'error': return '🚫';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  };

  /**
   * Check if an issue is deletable
   */
  const isDeletableIssue = (issue) => {
    // Orphaned relationships can be deleted
    if (issue.code === 'ORPHANED_RELATIONSHIP') return true;
    // Person issues where person exists can be deleted
    if (issue.type === 'person' && issue.personId) return true;
    // Relationship issues where relationship exists
    if (issue.type === 'relationship' && issue.relationshipId) return true;
    // Isolated persons can be deleted
    if (issue.code === 'ISOLATED_PERSON') return true;
    return false;
  };

  /**
   * Check if an issue is a namesake candidate (potential duplicate that could be resolved with "named after")
   */
  const isNamesakeCandidate = (issue) => {
    return issue.code === 'POTENTIAL_DUPLICATE' && issue.details?.isNamesakeCandidate;
  };

  /**
   * Render cleanup tools section
   */
  const renderCleanupTools = () => {
    if (!report) return null;
    
    const orphanedCount = report.structuralIssues.filter(
      i => i.type === 'ORPHANED_RELATIONSHIP'
    ).length;
    
    const unknownCount = people.filter(p => 
      !p.firstName?.trim() || 
      p.firstName?.toLowerCase() === 'unknown' ||
      (!p.lastName?.trim() && !p.firstName?.trim())
    ).length;
    
    if (orphanedCount === 0 && unknownCount === 0) return null;
    
    return (
      <div 
        className="mb-6 p-4 rounded-lg border"
        style={{ 
          backgroundColor: `${theme.error}10`, 
          borderColor: theme.error 
        }}
      >
        <h3 className="font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
          <Icon name="wrench" /> Cleanup Tools
        </h3>
        <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
          Quick actions to fix common data problems:
        </p>
        
        <div className="flex flex-wrap gap-2">
          {orphanedCount > 0 && (
            <button
              onClick={handleDeleteAllOrphanedRelationships}
              disabled={isDeleting}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 flex items-center gap-2"
              style={{
                backgroundColor: theme.error,
                color: '#ffffff',
                opacity: isDeleting ? 0.6 : 1
              }}
            >
              <Icon name="trash-2" />
              Delete {orphanedCount} Orphaned Relationship{orphanedCount !== 1 ? 's' : ''}
            </button>
          )}
          
          {unknownCount > 0 && (
            <button
              onClick={handleDeleteUnknownPersons}
              disabled={isDeleting}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80 flex items-center gap-2"
              style={{
                backgroundColor: theme.error,
                color: '#ffffff',
                opacity: isDeleting ? 0.6 : 1
              }}
            >
              <Icon name="trash-2" />
              Delete {unknownCount} Unknown Person{unknownCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        
        <p className="text-xs mt-3" style={{ color: theme.textSecondary }}>
          ⚠️ These actions cannot be undone. Consider exporting your data first.
        </p>
      </div>
    );
  };

  /**
   * Render summary cards
   */
  const renderSummary = () => {
    if (!report) return null;
    
    const { summary } = report;
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {/* Errors Card */}
        <div 
          className="p-4 rounded-lg border text-center cursor-pointer transition-all hover:scale-105"
          style={{ 
            backgroundColor: summary.errorCount > 0 ? `${theme.error}20` : theme.bgLight,
            borderColor: summary.errorCount > 0 ? theme.error : theme.border
          }}
          onClick={() => setActiveCategory('errors')}
        >
          <div className="text-3xl font-bold" style={{ color: theme.error }}>
            {summary.errorCount}
          </div>
          <div className="text-sm" style={{ color: theme.textSecondary }}>
            Errors
          </div>
        </div>
        
        {/* Warnings Card */}
        <div 
          className="p-4 rounded-lg border text-center cursor-pointer transition-all hover:scale-105"
          style={{ 
            backgroundColor: summary.warningCount > 0 ? `${theme.warning}20` : theme.bgLight,
            borderColor: summary.warningCount > 0 ? theme.warning : theme.border
          }}
          onClick={() => setActiveCategory('warnings')}
        >
          <div className="text-3xl font-bold" style={{ color: theme.warning }}>
            {summary.warningCount}
          </div>
          <div className="text-sm" style={{ color: theme.textSecondary }}>
            Warnings
          </div>
        </div>
        
        {/* Missing Data Card */}
        <div 
          className="p-4 rounded-lg border text-center cursor-pointer transition-all hover:scale-105"
          style={{ 
            backgroundColor: theme.bgLight,
            borderColor: theme.border
          }}
          onClick={() => setActiveCategory('missing')}
        >
          <div className="text-3xl font-bold" style={{ color: theme.info }}>
            {report.missingData.length}
          </div>
          <div className="text-sm" style={{ color: theme.textSecondary }}>
            Missing Data
          </div>
        </div>
        
        {/* Suggestions Card */}
        <div 
          className="p-4 rounded-lg border text-center cursor-pointer transition-all hover:scale-105"
          style={{ 
            backgroundColor: theme.bgLight,
            borderColor: theme.border
          }}
          onClick={() => setActiveCategory('suggestions')}
        >
          <div className="text-3xl font-bold" style={{ color: theme.accent }}>
            {report.suggestions.length}
          </div>
          <div className="text-sm" style={{ color: theme.textSecondary }}>
            Suggestions
          </div>
        </div>
      </div>
    );
  };

  /**
   * Render category tabs
   */
  const renderTabs = () => {
    if (!report) return null;
    
    const categories = [
      { key: 'all', label: 'All Issues', count: report.summary.errorCount + report.summary.warningCount },
      { key: 'errors', label: 'Errors', count: report.summary.errorCount },
      { key: 'warnings', label: 'Warnings', count: report.summary.warningCount },
      { key: 'structural', label: 'Structural', count: report.structuralIssues.length },
      { key: 'missing', label: 'Missing Data', count: report.missingData.length },
      { key: 'suggestions', label: 'Suggestions', count: report.suggestions.length }
    ];
    
    return (
      <div className="flex flex-wrap gap-2 mb-4">
        {categories.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: activeCategory === cat.key ? theme.accent : theme.bgLight,
              color: activeCategory === cat.key ? (isDarkTheme ? '#1a1410' : '#ffffff') : theme.text,
              border: `1px solid ${activeCategory === cat.key ? theme.accent : theme.border}`
            }}
          >
            {cat.label} ({cat.count})
          </button>
        ))}
      </div>
    );
  };

  /**
   * Render the "Named After" choice dialog
   */
  const renderNamedAfterChoiceDialog = () => {
    if (!namedAfterConfirm?.needsChoice) return null;
    
    const { person1Id, person2Id, person1Name, person2Name } = namedAfterConfirm;
    
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={() => setNamedAfterConfirm(null)}
      >
        <div 
          className="p-6 rounded-lg max-w-md mx-4"
          style={{ backgroundColor: theme.bg, border: `2px solid ${theme.namesake}` }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ color: theme.text }}>
            <Icon name="user" /> Who was named after whom?
          </h3>
          <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
            We couldn't determine the birth order. Please choose:
          </p>
          
          <div className="space-y-2">
            <button
              onClick={() => handleCreateNamedAfterWithDirection(person1Id, person2Id)}
              className="w-full p-3 rounded-lg text-left transition-all hover:opacity-90"
              style={{ 
                backgroundColor: theme.bgLight, 
                border: `1px solid ${theme.namesake}`,
                color: theme.text
              }}
            >
              <span style={{ color: theme.namesake }}>→</span> {person1Name} was named after {person2Name}
            </button>
            
            <button
              onClick={() => handleCreateNamedAfterWithDirection(person2Id, person1Id)}
              className="w-full p-3 rounded-lg text-left transition-all hover:opacity-90"
              style={{ 
                backgroundColor: theme.bgLight, 
                border: `1px solid ${theme.namesake}`,
                color: theme.text
              }}
            >
              <span style={{ color: theme.namesake }}>→</span> {person2Name} was named after {person1Name}
            </button>
          </div>
          
          <button
            onClick={() => setNamedAfterConfirm(null)}
            className="w-full mt-4 p-2 rounded text-sm"
            style={{ backgroundColor: theme.bgLighter, color: theme.textSecondary }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  /**
   * Render issue list
   */
  const renderIssues = () => {
    if (!report) return null;
    
    let issues = [];
    
    // Collect issues based on active category
    if (activeCategory === 'all' || activeCategory === 'errors' || activeCategory === 'warnings') {
      // Person issues
      for (const personIssue of report.personIssues) {
        for (const error of personIssue.errors) {
          if (activeCategory === 'all' || activeCategory === 'errors') {
            issues.push({
              id: `person-${personIssue.personId}-${error.code}`,
              type: 'person',
              severity: 'error',
              personId: personIssue.personId,
              personName: personIssue.personName,
              code: error.code,
              message: error.message,
              details: error.details
            });
          }
        }
        for (const warning of personIssue.warnings) {
          if (activeCategory === 'all' || activeCategory === 'warnings') {
            issues.push({
              id: `person-${personIssue.personId}-${warning.code}`,
              type: 'person',
              severity: 'warning',
              personId: personIssue.personId,
              personName: personIssue.personName,
              code: warning.code,
              message: warning.message,
              details: warning.details
            });
          }
        }
      }
      
      // Relationship issues
      for (const relIssue of report.relationshipIssues) {
        for (const error of relIssue.errors) {
          if (activeCategory === 'all' || activeCategory === 'errors') {
            issues.push({
              id: `rel-${relIssue.relationshipId}-${error.code}`,
              type: 'relationship',
              severity: 'error',
              relationshipId: relIssue.relationshipId,
              relationshipType: relIssue.relationshipType,
              person1: relIssue.person1,
              person2: relIssue.person2,
              code: error.code,
              message: error.message,
              details: error.details
            });
          }
        }
        for (const warning of relIssue.warnings) {
          if (activeCategory === 'all' || activeCategory === 'warnings') {
            issues.push({
              id: `rel-${relIssue.relationshipId}-${warning.code}`,
              type: 'relationship',
              severity: 'warning',
              relationshipId: relIssue.relationshipId,
              relationshipType: relIssue.relationshipType,
              person1: relIssue.person1,
              person2: relIssue.person2,
              code: warning.code,
              message: warning.message,
              details: warning.details
            });
          }
        }
      }
    }
    
    // Structural issues
    if (activeCategory === 'all' || activeCategory === 'structural') {
      for (const issue of report.structuralIssues) {
        issues.push({
          id: `struct-${issue.type}-${issue.personId || issue.relationshipId || issue.houseId}`,
          type: 'structural',
          severity: issue.severity,
          code: issue.type,
          message: issue.message,
          ...issue
        });
      }
    }
    
    // Missing data
    if (activeCategory === 'missing') {
      issues = report.missingData.map((item, idx) => ({
        id: `missing-${idx}`,
        type: 'missing',
        severity: 'info',
        ...item
      }));
    }
    
    // Suggestions
    if (activeCategory === 'suggestions') {
      issues = report.suggestions.map((item, idx) => ({
        id: `suggestion-${idx}`,
        type: 'suggestion',
        severity: 'info',
        code: item.type,
        ...item
      }));
    }
    
    if (issues.length === 0) {
      return (
        <div 
          className="p-8 text-center rounded-lg border"
          style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
        >
          <span className="text-4xl mb-2 block"><Icon name="sparkles" size={36} /></span>
          <p style={{ color: theme.text }}>No issues found in this category!</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        {issues.map(issue => {
          const canDelete = isDeletableIssue(issue);
          const canNameAfter = isNamesakeCandidate(issue);
          const isConfirmingDelete = 
            (deleteConfirm?.type === 'person' && deleteConfirm?.id === issue.personId) ||
            (deleteConfirm?.type === 'relationship' && deleteConfirm?.id === issue.relationshipId);
          
          // Check if confirming named-after for this issue
          const duplicateIds = issue.details?.duplicates?.map(d => d.id) || [];
          const isConfirmingNamedAfter = namedAfterConfirm && 
            !namedAfterConfirm.needsChoice &&
            (namedAfterConfirm.person1Id === issue.personId || duplicateIds.includes(namedAfterConfirm.person1Id));
          
          return (
            <div
              key={issue.id}
              className="p-3 rounded-lg border flex items-start gap-3 transition-all hover:scale-[1.01]"
              style={{ 
                backgroundColor: isConfirmingDelete ? `${theme.error}20` : 
                                isConfirmingNamedAfter ? `${theme.namesake}20` : 
                                theme.bgLight, 
                borderColor: isConfirmingDelete ? theme.error : 
                            isConfirmingNamedAfter ? theme.namesake :
                            theme.border,
                borderLeftWidth: '4px',
                borderLeftColor: getSeverityColor(issue.severity)
              }}
            >
              {/* Icon */}
              <span className="text-lg flex-shrink-0">
                {getSeverityIcon(issue.severity)}
              </span>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Title line */}
                <div className="flex items-center gap-2 flex-wrap">
                  {issue.personName && (
                    <button
                      onClick={() => onNavigateToPerson?.(issue.personId)}
                      className="font-medium hover:underline"
                      style={{ color: theme.accent }}
                    >
                      {issue.personName}
                    </button>
                  )}
                  {issue.person1 && issue.person2 && (
                    <span className="font-medium" style={{ color: theme.accent }}>
                      {issue.person1} ↔ {issue.person2}
                    </span>
                  )}
                  <span 
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ 
                      backgroundColor: theme.bgLighter,
                      color: theme.textSecondary
                    }}
                  >
                    {issue.code}
                  </span>
                </div>
                
                {/* Message */}
                <p className="text-sm mt-1" style={{ color: theme.text }}>
                  {issue.message}
                </p>
                
                {/* Duplicate details - show who they might be duplicates of */}
                {canNameAfter && issue.details?.duplicates && (
                  <div className="mt-2 text-xs" style={{ color: theme.textSecondary }}>
                    Potential matches: {issue.details.duplicates.map(d => d.name).join(', ')}
                  </div>
                )}
                
                {/* Confirmation messages */}
                {isConfirmingDelete && (
                  <p className="text-xs mt-2 font-semibold" style={{ color: theme.error }}>
                    ⚠️ Click delete again to confirm, or click elsewhere to cancel
                  </p>
                )}
                {isConfirmingNamedAfter && (
                  <p className="text-xs mt-2 font-semibold" style={{ color: theme.namesake }}>
                    👤 Click "Named After" again to confirm: {namedAfterConfirm.person1Name} was named after {namedAfterConfirm.person2Name}
                  </p>
                )}
              </div>
              
              {/* Action buttons */}
              <div className="flex gap-1 flex-shrink-0 flex-wrap">
                {/* Named After button for duplicate warnings */}
                {canNameAfter && issue.details?.duplicates?.map(dup => (
                  <button
                    key={`named-${dup.id}`}
                    onClick={() => {
                      handleCreateNamedAfter(issue.personId, dup.id, issue.personName, dup.name);
                    }}
                    className="px-2 py-1 rounded text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      backgroundColor: isConfirmingNamedAfter ? theme.namesake : theme.bgLighter,
                      color: isConfirmingNamedAfter ? '#ffffff' : theme.namesake,
                      border: `1px solid ${theme.namesake}`
                    }}
                    title={`Mark as named after ${dup.name}`}
                  >
                    {isConfirmingNamedAfter ? '✓ Confirm' : '👤 Named After'}
                  </button>
                ))}
                
                {/* View button */}
                {(issue.personId || issue.relationshipId) && !issue.code?.includes('ORPHANED') && (
                  <button
                    onClick={() => {
                      setDeleteConfirm(null);
                      setNamedAfterConfirm(null);
                      if (issue.personId) onNavigateToPerson?.(issue.personId);
                      else if (issue.relationshipId) onNavigateToRelationship?.(issue.relationshipId);
                    }}
                    className="px-2 py-1 rounded text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      backgroundColor: theme.bgLighter,
                      color: theme.text,
                      border: `1px solid ${theme.border}`
                    }}
                  >
                    View →
                  </button>
                )}
                
                {/* Delete button */}
                {canDelete && (
                  <button
                    onClick={() => {
                      if (issue.personId) {
                        handleDeletePerson(issue.personId, issue.personName);
                      } else if (issue.relationshipId) {
                        handleDeleteRelationship(
                          issue.relationshipId, 
                          `${issue.person1 || 'Unknown'} ↔ ${issue.person2 || 'Unknown'}`
                        );
                      }
                    }}
                    disabled={isDeleting}
                    className="px-2 py-1 rounded text-xs font-medium transition-all hover:opacity-80"
                    style={{
                      backgroundColor: isConfirmingDelete ? theme.error : theme.bgLighter,
                      color: isConfirmingDelete ? '#ffffff' : theme.error,
                      border: `1px solid ${theme.error}`,
                      opacity: isDeleting ? 0.6 : 1
                    }}
                  >
                    {isConfirmingDelete ? '⚠️ Confirm' : '🗑️ Delete'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * Render health score
   */
  const renderHealthScore = () => {
    if (!report) return null;
    
    const { summary } = report;
    const totalRecords = summary.totalPeople + summary.totalRelationships;
    
    // Calculate score (simple heuristic)
    let score = 100;
    score -= summary.errorCount * 10;  // Errors are bad
    score -= summary.warningCount * 2; // Warnings are less bad
    score = Math.max(0, Math.min(100, score));
    
    let scoreColor = theme.success;
    let scoreLabel = 'Excellent';
    
    if (score < 50) {
      scoreColor = theme.error;
      scoreLabel = 'Needs Attention';
    } else if (score < 70) {
      scoreColor = theme.warning;
      scoreLabel = 'Fair';
    } else if (score < 90) {
      scoreColor = theme.info;
      scoreLabel = 'Good';
    }
    
    return (
      <div 
        className="p-4 rounded-lg border mb-6 flex items-center justify-between"
        style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
      >
        <div>
          <h3 className="font-semibold" style={{ color: theme.text }}>
            Data Health Score
          </h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            Based on {totalRecords} records ({summary.totalPeople} people, {summary.totalRelationships} relationships)
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold" style={{ color: scoreColor }}>
            {score}
          </div>
          <div className="text-sm" style={{ color: scoreColor }}>
            {scoreLabel}
          </div>
        </div>
      </div>
    );
  };

  /**
   * Referential integrity — dangling IDs between tables.
   *
   * Distinct from the quality checks above, which look for implausible data.
   * This looks for data that is structurally broken: a dignity held by a person
   * who no longer exists, a house wearing arms that were deleted. These fail
   * silently at runtime (succession returns an empty list and warns), so they
   * are invisible until someone goes looking.
   */
  const renderIntegrity = () => {
    if (integrityError) {
      return (
        <div
          className="p-4 rounded-lg mb-6"
          style={{ backgroundColor: theme.bgLight, border: `1px solid ${theme.error}` }}
        >
          <h3 className="font-semibold mb-1 flex items-center gap-2" style={{ color: theme.text }}>
            <Icon name="alert-triangle" /> Referential integrity
          </h3>
          <p className="text-sm" style={{ color: theme.textSecondary }}>{integrityError}</p>
        </div>
      );
    }

    if (!integrity) return null;

    const groups = [
      {
        key: 'orphanedDignities',
        label: 'Dignities with missing references',
        note: 'A dignity pointing at a deleted person or house. Succession silently returns nothing for these.',
        items: integrity.issues.orphanedDignities,
        describe: (d) => {
          const parts = [];
          if (d.missingHolderId) parts.push(`holder #${d.missingHolderId} does not exist`);
          if (d.missingHouseId) parts.push(`house #${d.missingHouseId} does not exist`);
          if (d.missingSwornToId) parts.push(`sworn to dignity #${d.missingSwornToId} does not exist`);
          if (d.missingGrantedById) parts.push(`granted by person #${d.missingGrantedById} does not exist`);
          if (d.missingCodexEntryId) parts.push(`codex entry #${d.missingCodexEntryId} does not exist`);
          return `${d.dignityName} — ${parts.join('; ')}`;
        }
      },
      {
        key: 'orphanedRelationships',
        label: 'Relationships referencing missing people',
        note: 'These render as gaps in the tree.',
        items: integrity.issues.orphanedRelationships,
        describe: (r) => {
          const missing = [r.missingPerson1, r.missingPerson2].filter(Boolean);
          return `Relationship #${r.id} — missing person ${missing.map(m => `#${m}`).join(' and ')}`;
        }
      },
      {
        key: 'orphanedPeopleHouses',
        label: 'People assigned to a missing house',
        note: null,
        items: integrity.issues.orphanedPeopleHouses,
        describe: (p) => `${p.personName} — house #${p.missingHouseId} does not exist`
      },
      {
        key: 'orphanedHeraldryRefs',
        label: 'Arms references pointing at deleted heraldry',
        note: null,
        items: integrity.issues.orphanedHeraldryRefs,
        describe: (h) => `${h.entityName} (${h.entityType}) — heraldry #${h.missingHeraldryId} does not exist`
      },
      {
        key: 'orphanedCodexLinks',
        label: 'Codex links to missing entries',
        note: 'These produce phantom backlinks.',
        items: integrity.issues.orphanedCodexLinks,
        describe: (l) => {
          const parts = [];
          if (l.missingSource) parts.push(`source #${l.missingSource}`);
          if (l.missingTarget) parts.push(`target #${l.missingTarget}`);
          return `Link #${l.id} — missing ${parts.join(' and ')}`;
        }
      },
      {
        key: 'circularAncestry',
        label: 'Circular ancestry',
        note: 'A person appearing in their own ancestry. This can freeze the tree renderer.',
        items: integrity.issues.circularAncestry,
        describe: (c) => `Person #${c.personId} — cycle reached at #${c.cycleAt}`
      },
      {
        key: 'bidirectionalInconsistencies',
        label: 'Marriage records that disagree',
        note: 'Two records for the same marriage with different dates.',
        items: integrity.issues.bidirectionalInconsistencies,
        describe: (b) => `Relationships #${b.relationship1} and #${b.relationship2} — mismatched marriage date`
      }
    ].filter(g => (g.items?.length || 0) > 0);

    return (
      <div
        className="p-4 rounded-lg mb-6"
        style={{
          backgroundColor: theme.bgLight,
          border: `1px solid ${integrity.healthy ? theme.success : theme.error}`
        }}
      >
        <h3 className="font-semibold mb-1 flex items-center gap-2" style={{ color: theme.text }}>
          <Icon name={integrity.healthy ? 'check-circle' : 'alert-triangle'} />
          Referential integrity
        </h3>

        {integrity.healthy ? (
          <p className="text-sm" style={{ color: theme.textSecondary }}>
            No dangling references. Every relationship, house, dignity, codex link
            and arms reference resolves to a record that exists.
          </p>
        ) : (
          <>
            <p className="text-sm mb-3" style={{ color: theme.textSecondary }}>
              These are structural breaks, not judgement calls — each one points at
              a record that no longer exists.
            </p>
            {groups.map(group => (
              <div key={group.key} className="mb-3">
                <div className="text-sm font-semibold" style={{ color: theme.text }}>
                  {group.label} ({group.items.length})
                </div>
                {group.note && (
                  <div className="text-xs mb-1" style={{ color: theme.textSecondary }}>
                    {group.note}
                  </div>
                )}
                <ul className="text-xs" style={{ color: theme.textSecondary }}>
                  {group.items.slice(0, 10).map((item, i) => (
                    <li key={i}>• {group.describe(item)}</li>
                  ))}
                  {group.items.length > 10 && (
                    <li style={{ opacity: 0.8 }}>
                      … and {group.items.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="p-6 rounded-lg"
      style={{ backgroundColor: theme.bg }}
      onClick={() => {
        setDeleteConfirm(null);
        if (!namedAfterConfirm?.needsChoice) setNamedAfterConfirm(null);
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
            <Icon name="heart-pulse" /> Data Health Dashboard
          </h2>
          <p className="text-sm mt-1" style={{ color: theme.textSecondary }}>
            Scan your genealogy database for issues and inconsistencies
          </p>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRunScan();
          }}
          disabled={isScanning}
          className="px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2"
          style={{
            backgroundColor: isScanning ? theme.bgLight : theme.accent,
            color: isDarkTheme ? '#1a1410' : '#ffffff',
            opacity: isScanning ? 0.7 : 1
          }}
        >
          {isScanning ? (
            <>
              <span className="animate-spin">⏳</span>
              Scanning...
            </>
          ) : (
            <>
              <Icon name="search" />
              {report ? 'Rescan' : 'Run Health Check'}
            </>
          )}
        </button>
      </div>
      
      {/* No scan yet */}
      {!report && !isScanning && (
        <div 
          className="p-12 text-center rounded-lg border-2 border-dashed"
          style={{ borderColor: theme.border }}
        >
          <span className="text-5xl mb-4 block"><Icon name="search" size={48} /></span>
          <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
            No scan results yet
          </h3>
          <p className="text-sm mb-4" style={{ color: theme.textSecondary }}>
            Click "Run Health Check" to scan your database for issues
          </p>
          <p className="text-xs" style={{ color: theme.textSecondary }}>
            Currently tracking: {people.length} people, {relationships.length} relationships, {houses.length} houses
          </p>
        </div>
      )}
      
      {/* Results */}
      {report && (
        <>
          {renderHealthScore()}
          {renderIntegrity()}
          {renderCleanupTools()}
          {renderSummary()}
          {renderTabs()}
          <div onClick={(e) => e.stopPropagation()}>
            {renderIssues()}
          </div>
        </>
      )}
      
      {/* Named After Choice Dialog */}
      {renderNamedAfterChoiceDialog()}
    </div>
  );
}

export default DataHealthDashboard;
