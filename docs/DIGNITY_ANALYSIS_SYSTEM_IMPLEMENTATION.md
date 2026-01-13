# Dignity Analysis System - Implementation Plan

**Document Version:** 1.0  
**Created:** January 2025  
**Status:** Ready for Implementation  
**Estimated Effort:** 5 phases across ~2-3 weeks

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Design Principles](#design-principles)
3. [System Architecture](#system-architecture)
4. [Data Models](#data-models)
5. [File Structure](#file-structure)
6. [Phase 1: Analysis Service](#phase-1-analysis-service)
7. [Phase 2: React Hook](#phase-2-react-hook)
8. [Phase 3: UI Components](#phase-3-ui-components)
9. [Phase 4: Integration](#phase-4-integration)
10. [Phase 5: Household Roles](#phase-5-household-roles)
11. [Development Guidelines Compliance](#development-guidelines-compliance)
12. [Testing Criteria](#testing-criteria)
13. [Design Decisions](#design-decisions)

---

## Executive Summary

### What We're Building

An intelligent **Dignity Analysis System** that scans the genealogical database and generates actionable suggestions for:

- Missing titles (houses without heads, untitled patriarchs)
- Tenure gaps (incomplete historical records)
- Succession issues (deceased holders, orphaned dignities)
- Data integrity problems (temporal impossibilities, circular feudal chains)

Plus a separate **Household Roles System** for tracking non-hereditary positions (Master-at-Arms, Steward, etc.).

### Key Features

1. **On-Demand Analysis** - User clicks "Analyze" button, no automatic nagging
2. **Aggressive Detection** - When triggered, surfaces everything it finds
3. **Contextual Integration** - Suggestions appear where relevant (dignity view, house view, landing pages)
4. **One-Click Actions** - Apply, dismiss, or defer suggestions easily
5. **Configurable Succession** - Per-dignity rules (primogeniture default, but extensible)

### User Experience Flow

```
User clicks "Analyze Dignities"
       ↓
System scans all data (houses, people, dignities, tenures, relationships)
       ↓
Generates prioritized suggestions with confidence scores
       ↓
User reviews in Analysis Dashboard or contextual panels
       ↓
For each suggestion: Apply (creates/updates data) | Dismiss | Defer
       ↓
Applied suggestions archived, dismissed won't reappear unless data changes
```

---

## Design Principles

### 1. Non-Intrusive Intelligence
- Analysis is **on-demand only** (button click)
- No automatic popups, badges, or notifications
- When triggered, be **aggressive** - surface everything

### 2. Contextual Relevance
- Suggestions appear where they're relevant
- DignityView shows suggestions for that dignity
- House forms show suggestions for that house
- Analysis page shows everything

### 3. Actionable Output
- Every suggestion includes clear reasoning
- One-click to apply (with preview)
- Alternative actions when multiple solutions exist

### 4. Development Guidelines Compliance
- All files under size limits (components <500 lines, services <400 lines)
- Memoization for expensive computations
- Maps for O(1) lookups
- Proper React patterns (useCallback, useMemo)
- CSS custom properties for theming
- Error boundaries and loading states

### 5. Canonical Accuracy
- Suggestions respect worldbuilding rules
- Primogeniture ordering for succession
- Legitimate/bastard distinctions honored

---

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Analysis     │  │ Suggestions  │  │ Contextual Panels    │  │
│  │ Dashboard    │  │ Components   │  │ (DignityView, etc.)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       Hook Layer                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              useDignityAnalysis()                         │  │
│  │  - State management for suggestions                       │  │
│  │  - Actions: run, apply, dismiss, defer                    │  │
│  │  - Memoized filtered views                                │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      Service Layer                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            dignityAnalysisService.js                      │  │
│  │  - Pure analysis functions                                │  │
│  │  - No side effects, easy to test                          │  │
│  │  - Returns standardized Suggestion objects                │  │
│  └──────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       Data Layer                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ dignities    │  │ people       │  │ houses               │  │
│  │ tenures      │  │ relationships│  │ householdRoles (new) │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User triggers analysis (button click)
2. useDignityAnalysis calls dignityAnalysisService.runFullAnalysis()
3. Service fetches all needed data from IndexedDB
4. Service builds lookup Maps for O(1) access
5. Service runs each analyzer function
6. Analyzers return Suggestion[] arrays
7. Service deduplicates, sorts by severity/confidence
8. Hook receives suggestions, updates state
9. Components render suggestions
10. User actions (apply/dismiss) update state and/or database
```

---

## Data Models

### Suggestion Object

Every suggestion follows this structure:

```javascript
/**
 * @typedef {Object} Suggestion
 * @property {string} id - Unique identifier (uuid)
 * @property {string} type - Suggestion type (see SUGGESTION_TYPES)
 * @property {string} severity - 'critical' | 'warning' | 'info'
 * @property {number} confidence - 0-1 score of algorithmic certainty
 * @property {string} title - Short human-readable title
 * @property {string} description - Detailed explanation
 * @property {string} reasoning - Why this suggestion was generated
 * @property {AffectedEntity[]} affectedEntities - Related entities
 * @property {SuggestedAction} suggestedAction - Primary recommended action
 * @property {SuggestedAction[]} alternativeActions - Other valid options
 * @property {string[]} dependsOn - Suggestion IDs that should be applied first
 * @property {string[]} enables - Suggestion IDs enabled by applying this
 * @property {string} created - ISO timestamp
 * @property {boolean} dismissed - User dismissed this suggestion
 * @property {string|null} dismissedReason - Why user dismissed
 * @property {boolean} applied - Suggestion was applied
 * @property {string|null} appliedAt - When applied
 * @property {boolean} deferred - User wants to see this later
 */

/**
 * @typedef {Object} AffectedEntity
 * @property {string} type - 'house' | 'person' | 'dignity' | 'tenure'
 * @property {number} id - Entity ID
 * @property {string} name - Display name for UI
 */

/**
 * @typedef {Object} SuggestedAction
 * @property {string} type - Action type (see ACTION_TYPES)
 * @property {string} label - Button label
 * @property {Object} data - Data to create/update
 * @property {string} preview - Human-readable preview of what will change
 */
```

### Suggestion Types

```javascript
export const SUGGESTION_TYPES = {
  // === MISSING TITLES ===
  'house-no-head': {
    id: 'house-no-head',
    name: 'House Without Head',
    description: 'A house has no designated head or primary dignity',
    severity: 'warning',
    icon: 'home'
  },
  'untitled-patriarch': {
    id: 'untitled-patriarch',
    name: 'Untitled Patriarch',
    description: 'Eldest living legitimate member has no title',
    severity: 'info',
    icon: 'user'
  },
  'cadet-no-title': {
    id: 'cadet-no-title',
    name: 'Cadet House Without Title',
    description: 'A cadet branch has no associated dignity',
    severity: 'info',
    icon: 'git-branch'
  },
  
  // === TENURE ISSUES ===
  'tenure-gap': {
    id: 'tenure-gap',
    name: 'Tenure Gap',
    description: 'Missing tenure records between holders',
    severity: 'warning',
    icon: 'calendar'
  },
  'no-tenure-records': {
    id: 'no-tenure-records',
    name: 'No Tenure Records',
    description: 'Dignity has holder but no tenure history',
    severity: 'info',
    icon: 'scroll-text'
  },
  'tenure-chain-suggestion': {
    id: 'tenure-chain-suggestion',
    name: 'Suggested Tenure Chain',
    description: 'Inferred tenure history from death dates',
    severity: 'info',
    icon: 'link'
  },
  
  // === SUCCESSION ISSUES ===
  'deceased-holder': {
    id: 'deceased-holder',
    name: 'Deceased Holder',
    description: 'Current holder is deceased, title not transferred',
    severity: 'critical',
    icon: 'alert-triangle'
  },
  'orphaned-dignity': {
    id: 'orphaned-dignity',
    name: 'Orphaned Dignity',
    description: 'Dignity has no holder AND no associated house',
    severity: 'warning',
    icon: 'help-circle'
  },
  'succession-conflict': {
    id: 'succession-conflict',
    name: 'Succession Conflict',
    description: 'Multiple valid succession paths detected',
    severity: 'warning',
    icon: 'git-merge'
  },
  'vacant-hereditary': {
    id: 'vacant-hereditary',
    name: 'Vacant Hereditary Title',
    description: 'Hereditary dignity marked vacant but heirs exist',
    severity: 'warning',
    icon: 'crown'
  },
  
  // === DATA INTEGRITY ===
  'temporal-impossibility': {
    id: 'temporal-impossibility',
    name: 'Temporal Impossibility',
    description: 'Tenure dates conflict with person\'s lifespan',
    severity: 'critical',
    icon: 'clock'
  },
  'circular-feudal-chain': {
    id: 'circular-feudal-chain',
    name: 'Circular Feudal Chain',
    description: 'Feudal hierarchy contains a loop',
    severity: 'critical',
    icon: 'refresh-cw'
  },
  'widowed-dignity': {
    id: 'widowed-dignity',
    name: 'Widowed Dignity',
    description: 'Dignity linked to house that no longer exists',
    severity: 'critical',
    icon: 'unlink'
  },
  'over-titled-person': {
    id: 'over-titled-person',
    name: 'Over-Titled Person',
    description: 'Person holds unusually many titles (possible error)',
    severity: 'info',
    icon: 'alert-circle'
  }
};
```

### Action Types

```javascript
export const ACTION_TYPES = {
  'create-dignity': {
    id: 'create-dignity',
    name: 'Create Dignity',
    description: 'Create a new dignity record'
  },
  'update-dignity': {
    id: 'update-dignity',
    name: 'Update Dignity',
    description: 'Modify an existing dignity'
  },
  'transfer-dignity': {
    id: 'transfer-dignity',
    name: 'Transfer Dignity',
    description: 'End current tenure and start new one'
  },
  'create-tenure': {
    id: 'create-tenure',
    name: 'Create Tenure Record',
    description: 'Add historical tenure entry'
  },
  'create-tenure-chain': {
    id: 'create-tenure-chain',
    name: 'Create Tenure Chain',
    description: 'Add multiple tenure records'
  },
  'fix-feudal-chain': {
    id: 'fix-feudal-chain',
    name: 'Fix Feudal Chain',
    description: 'Break circular reference in hierarchy'
  },
  'mark-vacant': {
    id: 'mark-vacant',
    name: 'Mark as Vacant',
    description: 'Set dignity as vacant'
  },
  'link-to-house': {
    id: 'link-to-house',
    name: 'Link to House',
    description: 'Associate dignity with a house'
  }
};
```

### Household Role (Phase 5)

```javascript
/**
 * @typedef {Object} HouseholdRole
 * @property {number} id - Auto-generated ID
 * @property {number} houseId - House this role belongs to
 * @property {string} roleType - Role type (from HOUSEHOLD_ROLE_TYPES)
 * @property {string|null} customRoleName - For custom roles
 * @property {number|null} currentHolderId - Person currently in role
 * @property {string|null} startDate - When current holder started
 * @property {string|null} notes - Additional notes
 * @property {string} created - ISO timestamp
 * @property {string} updated - ISO timestamp
 */

export const HOUSEHOLD_ROLE_TYPES = {
  'master-at-arms': {
    id: 'master-at-arms',
    name: 'Master-at-Arms',
    icon: 'sword',
    description: 'Trains and commands household fighters'
  },
  'castellan': {
    id: 'castellan',
    name: 'Castellan',
    icon: 'castle',
    description: 'Manages the castle or keep in lord\'s absence'
  },
  'steward': {
    id: 'steward',
    name: 'Steward',
    icon: 'clipboard-list',
    description: 'Manages household affairs and finances'
  },
  'maester': {
    id: 'maester',
    name: 'Maester',
    icon: 'book-open',
    description: 'Scholar, healer, and advisor'
  },
  'septon': {
    id: 'septon',
    name: 'Septon/Septa',
    icon: 'star',
    description: 'Religious guide and counselor'
  },
  'kennelmaster': {
    id: 'kennelmaster',
    name: 'Kennelmaster',
    icon: 'paw-print',
    description: 'Manages hunting hounds'
  },
  'master-of-horse': {
    id: 'master-of-horse',
    name: 'Master of Horse',
    icon: 'horse',
    description: 'Manages stables and horses'
  },
  'captain-of-guards': {
    id: 'captain-of-guards',
    name: 'Captain of Guards',
    icon: 'shield',
    description: 'Commands household guard'
  },
  'herald': {
    id: 'herald',
    name: 'Herald',
    icon: 'megaphone',
    description: 'Manages heraldry and announcements'
  },
  'custom': {
    id: 'custom',
    name: 'Custom Role',
    icon: 'user-cog',
    description: 'User-defined household position'
  }
};
```

---

## File Structure

### New Files to Create

```
/src
  /services
    dignityAnalysisService.js      # NEW - Core analysis algorithms (~350 lines)
    householdRoleService.js        # NEW - Household roles CRUD (~150 lines)
    
  /hooks
    useDignityAnalysis.js          # NEW - Analysis state management (~180 lines)
    useHouseholdRoles.js           # NEW - Roles state management (~100 lines)
    index.js                       # UPDATE - Add new exports
    
  /components
    /suggestions                   # NEW folder
      SuggestionCard.jsx           # Single suggestion display (~150 lines)
      SuggestionCard.css           # Styles (~100 lines)
      SuggestionsPanel.jsx         # List of suggestions (~200 lines)
      SuggestionsPanel.css         # Styles (~80 lines)
      SuggestionsBadge.jsx         # Compact indicator (~60 lines)
      SuggestionsBadge.css         # Styles (~40 lines)
      AnalysisSummary.jsx          # Statistics overview (~120 lines)
      AnalysisSummary.css          # Styles (~60 lines)
      index.js                     # Barrel exports
      
    /household                     # NEW folder
      HouseholdRolesPanel.jsx      # Roles display for house view (~180 lines)
      HouseholdRolesPanel.css      # Styles (~80 lines)
      HouseholdRoleForm.jsx        # Add/edit role modal (~150 lines)
      HouseholdRoleForm.css        # Styles (~60 lines)
      index.js                     # Barrel exports
      
  /pages
    DignityAnalysis.jsx            # NEW - Full analysis dashboard (~400 lines)
    DignityAnalysis.css            # Styles (~200 lines)
    
  /data
    suggestionTypes.js             # NEW - Type definitions (~150 lines)
    householdRoleTypes.js          # NEW - Role definitions (~80 lines)
```

### Files to Modify

```
/src
  /services
    database.js                    # ADD Version 10 for householdRoles table
    dataSyncService.js             # ADD sync functions for household roles
    
  /pages
    DignitiesLanding.jsx           # ADD analysis button and badge
    DignityView.jsx                # ADD contextual suggestions panel
    
  /components
    Navigation.jsx                 # ADD route for analysis page
    
  App.jsx                          # ADD route for /dignities/analysis
```

---

## Phase 1: Analysis Service

**Goal:** Create the core analysis algorithms that scan data and generate suggestions.

**File:** `/src/services/dignityAnalysisService.js`

### Implementation Details

```javascript
/**
 * Dignity Analysis Service
 * 
 * Analyzes genealogical data to generate intelligent suggestions
 * for dignities, tenures, and succession.
 * 
 * DESIGN PRINCIPLES:
 * - Pure functions (no side effects, easy to test)
 * - Uses Maps for O(1) lookups per development guidelines
 * - Returns standardized Suggestion objects
 * - Confidence scores help users prioritize
 * 
 * @module dignityAnalysisService
 */

import { db } from './database';
import { 
  getAllDignities, 
  getTenuresForDignity,
  calculateSuccessionLine,
  getFeudalChain 
} from './dignityService';
import { getAllHouses, getAllPeople, getAllRelationships } from './database';
import { SUGGESTION_TYPES, ACTION_TYPES } from '../data/suggestionTypes';

// ==================== UTILITY FUNCTIONS ====================

/**
 * Generate a unique suggestion ID
 * @returns {string} UUID-like string
 */
function generateSuggestionId() {
  return `sug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Build lookup maps from arrays for O(1) access
 * @param {Array} people - All people
 * @param {Array} houses - All houses
 * @param {Array} dignities - All dignities
 * @param {Array} relationships - All relationships
 * @returns {Object} Maps for quick lookups
 */
function buildLookupMaps(people, houses, dignities, relationships) {
  const peopleById = new Map(people.map(p => [p.id, p]));
  const housesById = new Map(houses.map(h => [h.id, h]));
  const dignitiesById = new Map(dignities.map(d => [d.id, d]));
  
  // Build relationship maps
  const parentMap = new Map(); // childId -> [parentIds]
  const childrenMap = new Map(); // parentId -> [childIds]
  const spouseMap = new Map(); // personId -> spouseId
  
  for (const rel of relationships) {
    if (rel.relationshipType === 'parent') {
      // rel.person1Id is parent, rel.person2Id is child
      const existingParents = parentMap.get(rel.person2Id) || [];
      parentMap.set(rel.person2Id, [...existingParents, rel.person1Id]);
      
      const existingChildren = childrenMap.get(rel.person1Id) || [];
      childrenMap.set(rel.person1Id, [...existingChildren, rel.person2Id]);
    } else if (rel.relationshipType === 'spouse') {
      spouseMap.set(rel.person1Id, rel.person2Id);
      spouseMap.set(rel.person2Id, rel.person1Id);
    }
  }
  
  // Build house members map
  const houseMembersMap = new Map(); // houseId -> [personIds]
  for (const person of people) {
    if (person.houseId) {
      const members = houseMembersMap.get(person.houseId) || [];
      members.push(person.id);
      houseMembersMap.set(person.houseId, members);
    }
  }
  
  // Build dignities by house map
  const dignitiesByHouse = new Map(); // houseId -> [dignities]
  for (const dignity of dignities) {
    if (dignity.currentHouseId) {
      const houseDignities = dignitiesByHouse.get(dignity.currentHouseId) || [];
      houseDignities.push(dignity);
      dignitiesByHouse.set(dignity.currentHouseId, houseDignities);
    }
  }
  
  // Build dignities by person map
  const dignitiesByPerson = new Map(); // personId -> [dignities]
  for (const dignity of dignities) {
    if (dignity.currentHolderId) {
      const personDignities = dignitiesByPerson.get(dignity.currentHolderId) || [];
      personDignities.push(dignity);
      dignitiesByPerson.set(dignity.currentHolderId, personDignities);
    }
  }
  
  return {
    peopleById,
    housesById,
    dignitiesById,
    parentMap,
    childrenMap,
    spouseMap,
    houseMembersMap,
    dignitiesByHouse,
    dignitiesByPerson
  };
}

/**
 * Get person display name
 */
function getPersonName(person) {
  if (!person) return 'Unknown';
  return `${person.firstName} ${person.lastName}`;
}

/**
 * Check if person is deceased
 */
function isDeceased(person) {
  return person && person.dateOfDeath;
}

/**
 * Check if person is living
 */
function isLiving(person) {
  return person && !person.dateOfDeath;
}

/**
 * Check if person is legitimate (not a bastard, or legitimized)
 */
function isLegitimate(person) {
  if (!person) return false;
  if (person.legitimacyStatus !== 'bastard') return true;
  return person.bastardStatus === 'legitimized';
}

/**
 * Find eldest living legitimate member of a house
 */
function findEldestLivingLegitimate(houseId, maps) {
  const memberIds = maps.houseMembersMap.get(houseId) || [];
  const members = memberIds
    .map(id => maps.peopleById.get(id))
    .filter(p => p && isLiving(p) && isLegitimate(p));
  
  // Sort by birth date (oldest first)
  members.sort((a, b) => {
    const aYear = parseInt(a.dateOfBirth) || 9999;
    const bYear = parseInt(b.dateOfBirth) || 9999;
    return aYear - bYear;
  });
  
  return members[0] || null;
}

// ==================== ANALYZER FUNCTIONS ====================

/**
 * Analyze houses without hereditary dignities
 * 
 * Detects houses with 5+ members that have no associated dignity.
 * Suggests creating a "Head of House" title.
 * 
 * @param {Array} houses - All houses
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for houses without titles
 */
function analyzeHousesWithoutTitles(houses, maps) {
  const suggestions = [];
  const MIN_MEMBERS_FOR_HEAD = 5;
  
  for (const house of houses) {
    const memberIds = maps.houseMembersMap.get(house.id) || [];
    const houseDignities = maps.dignitiesByHouse.get(house.id) || [];
    
    // Skip if house already has dignities
    if (houseDignities.length > 0) continue;
    
    // Skip small houses
    if (memberIds.length < MIN_MEMBERS_FOR_HEAD) continue;
    
    // Find eldest living legitimate member
    const patriarch = findEldestLivingLegitimate(house.id, maps);
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'house-no-head',
      severity: memberIds.length >= 20 ? 'warning' : 'info',
      confidence: 0.9,
      title: `${house.houseName} has no Head of House`,
      description: `A house of ${memberIds.length} members across multiple generations should have a designated head.`,
      reasoning: patriarch 
        ? `${getPersonName(patriarch)} is the eldest living legitimate member and could hold this title.`
        : 'No obvious candidate found - consider creating a title and assigning manually.',
      affectedEntities: [
        { type: 'house', id: house.id, name: house.houseName },
        ...(patriarch ? [{ type: 'person', id: patriarch.id, name: getPersonName(patriarch) }] : [])
      ],
      suggestedAction: {
        type: 'create-dignity',
        label: 'Create Head of House Title',
        data: {
          name: `Lord of ${house.houseName}`,
          shortName: house.houseName,
          dignityClass: 'driht',
          dignityRank: 'drith',
          currentHouseId: house.id,
          currentHolderId: patriarch?.id || null,
          isHereditary: true,
          successionType: 'male-primogeniture'
        },
        preview: patriarch 
          ? `Create "Lord of ${house.houseName}" held by ${getPersonName(patriarch)}`
          : `Create "Lord of ${house.houseName}" (vacant)`
      },
      alternativeActions: [
        {
          type: 'create-dignity',
          label: 'Create as Wardship',
          data: {
            name: `Wardyn of ${house.houseName}`,
            dignityClass: 'ward',
            dignityRank: 'wardyn',
            currentHouseId: house.id,
            isHereditary: false
          },
          preview: `Create "Wardyn of ${house.houseName}" as non-hereditary position`
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze dignities with deceased holders
 * 
 * Detects dignities where currentHolderId is a deceased person.
 * Suggests transferring to calculated heir.
 * 
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for deceased holders
 */
function analyzeDeceasedHolders(dignities, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    if (!dignity.currentHolderId) continue;
    
    const holder = maps.peopleById.get(dignity.currentHolderId);
    if (!holder || !isDeceased(holder)) continue;
    
    // This is a critical issue - deceased person still holds title
    const suggestion = {
      id: generateSuggestionId(),
      type: 'deceased-holder',
      severity: 'critical',
      confidence: 1.0, // 100% certain this is an issue
      title: `${dignity.name} held by deceased person`,
      description: `${getPersonName(holder)} died in ${holder.dateOfDeath} but is still listed as holding this dignity.`,
      reasoning: 'The title should be transferred to the heir or marked as vacant.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        { type: 'person', id: holder.id, name: getPersonName(holder) }
      ],
      suggestedAction: {
        type: 'transfer-dignity',
        label: 'Transfer to Heir',
        data: {
          dignityId: dignity.id,
          endCurrentTenure: {
            dateEnded: holder.dateOfDeath,
            endType: 'death'
          },
          // Heir will be calculated in apply function
          calculateHeir: true
        },
        preview: `End ${getPersonName(holder)}'s tenure (d. ${holder.dateOfDeath}) and transfer to heir`
      },
      alternativeActions: [
        {
          type: 'mark-vacant',
          label: 'Mark as Vacant',
          data: {
            dignityId: dignity.id,
            currentHolderId: null,
            isVacant: true
          },
          preview: 'Remove holder and mark dignity as vacant'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze dignities with no tenure records
 * 
 * Detects dignities that have a current holder but no tenure history.
 * Suggests creating tenure records.
 * 
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for missing tenure records
 */
function analyzeNoTenureRecords(dignities, tenuresByDignity, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    if (!dignity.currentHolderId) continue;
    
    const tenures = tenuresByDignity.get(dignity.id) || [];
    if (tenures.length > 0) continue;
    
    const holder = maps.peopleById.get(dignity.currentHolderId);
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'no-tenure-records',
      severity: 'info',
      confidence: 0.85,
      title: `${dignity.name} has no tenure history`,
      description: `${getPersonName(holder)} is the current holder but no tenure records exist.`,
      reasoning: 'Adding tenure records documents when and how the title was acquired.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        { type: 'person', id: holder.id, name: getPersonName(holder) }
      ],
      suggestedAction: {
        type: 'create-tenure',
        label: 'Create Tenure Record',
        data: {
          dignityId: dignity.id,
          personId: holder.id,
          dateStarted: null, // User should fill in
          acquisitionType: 'inheritance'
        },
        preview: `Create tenure record for ${getPersonName(holder)}`
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze tenure gaps and suggest chains from death dates
 * 
 * For dignities with incomplete tenure history, analyzes deceased
 * house members and suggests a tenure chain based on death dates.
 * 
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for tenure chains
 */
function analyzeTenureGaps(dignities, tenuresByDignity, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    if (!dignity.currentHouseId || !dignity.isHereditary) continue;
    
    const tenures = tenuresByDignity.get(dignity.id) || [];
    const memberIds = maps.houseMembersMap.get(dignity.currentHouseId) || [];
    
    // Get deceased members who could have held this title
    const deceasedMembers = memberIds
      .map(id => maps.peopleById.get(id))
      .filter(p => p && isDeceased(p) && isLegitimate(p))
      .filter(p => {
        // Check they're not already in tenure records
        return !tenures.some(t => t.personId === p.id);
      });
    
    if (deceasedMembers.length === 0) continue;
    
    // Sort by death date (oldest first)
    deceasedMembers.sort((a, b) => {
      const aYear = parseInt(a.dateOfDeath) || 9999;
      const bYear = parseInt(b.dateOfDeath) || 9999;
      return aYear - bYear;
    });
    
    // Only suggest if we have at least 2 deceased members to form a chain
    if (deceasedMembers.length < 2) continue;
    
    // Build suggested chain
    const chainData = deceasedMembers.map((person, index) => {
      const nextPerson = deceasedMembers[index + 1];
      return {
        personId: person.id,
        personName: getPersonName(person),
        dateEnded: person.dateOfDeath,
        endType: 'death',
        dateStarted: index === 0 ? null : deceasedMembers[index - 1].dateOfDeath
      };
    });
    
    const chainPreview = chainData
      .map(c => `${c.personName} (d. ${c.dateEnded})`)
      .join(' → ');
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'tenure-chain-suggestion',
      severity: 'info',
      confidence: 0.7, // Lower confidence since we're inferring
      title: `Suggested tenure chain for ${dignity.name}`,
      description: `Based on death dates of ${dignity.currentHouseId ? maps.housesById.get(dignity.currentHouseId)?.houseName : 'house'} members, a tenure chain can be inferred.`,
      reasoning: `${deceasedMembers.length} deceased house members could have held this title in succession.`,
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name },
        ...deceasedMembers.map(p => ({ type: 'person', id: p.id, name: getPersonName(p) }))
      ],
      suggestedAction: {
        type: 'create-tenure-chain',
        label: 'Create Tenure Chain',
        data: {
          dignityId: dignity.id,
          tenures: chainData
        },
        preview: chainPreview
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze orphaned dignities (no holder AND no house)
 * 
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for orphaned dignities
 */
function analyzeOrphanedDignities(dignities, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    // Skip if has either holder or house
    if (dignity.currentHolderId || dignity.currentHouseId) continue;
    
    // Skip if explicitly marked vacant (intentional)
    if (dignity.isVacant && dignity.notes?.includes('intentionally vacant')) continue;
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'orphaned-dignity',
      severity: 'warning',
      confidence: 0.95,
      title: `${dignity.name} has no holder or house`,
      description: 'This dignity is not associated with any person or house.',
      reasoning: 'Orphaned dignities may be forgotten entries or data entry errors.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name }
      ],
      suggestedAction: {
        type: 'link-to-house',
        label: 'Link to House',
        data: {
          dignityId: dignity.id,
          // User selects house
          promptForHouse: true
        },
        preview: 'Associate this dignity with a house'
      },
      alternativeActions: [
        {
          type: 'delete-dignity',
          label: 'Delete Dignity',
          data: { dignityId: dignity.id },
          preview: 'Remove this dignity record'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze temporal impossibilities
 * 
 * Detects tenure records where dates conflict with person's lifespan.
 * 
 * @param {Array} dignities - All dignities
 * @param {Map} tenuresByDignity - Map of dignityId -> tenures[]
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for temporal issues
 */
function analyzeTemporalIssues(dignities, tenuresByDignity, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    const tenures = tenuresByDignity.get(dignity.id) || [];
    
    for (const tenure of tenures) {
      const person = maps.peopleById.get(tenure.personId);
      if (!person) continue;
      
      const birthYear = parseInt(person.dateOfBirth);
      const deathYear = parseInt(person.dateOfDeath);
      const tenureStartYear = parseInt(tenure.dateStarted);
      const tenureEndYear = parseInt(tenure.dateEnded);
      
      let issue = null;
      
      // Check if tenure started before birth
      if (birthYear && tenureStartYear && tenureStartYear < birthYear) {
        issue = `Tenure started (${tenureStartYear}) before ${getPersonName(person)} was born (${birthYear})`;
      }
      
      // Check if tenure ended after death
      if (deathYear && tenureEndYear && tenureEndYear > deathYear) {
        issue = `Tenure ended (${tenureEndYear}) after ${getPersonName(person)} died (${deathYear})`;
      }
      
      // Check if tenure started after death
      if (deathYear && tenureStartYear && tenureStartYear > deathYear) {
        issue = `Tenure started (${tenureStartYear}) after ${getPersonName(person)} died (${deathYear})`;
      }
      
      if (issue) {
        const suggestion = {
          id: generateSuggestionId(),
          type: 'temporal-impossibility',
          severity: 'critical',
          confidence: 1.0,
          title: `Temporal impossibility in ${dignity.name}`,
          description: issue,
          reasoning: 'This is likely a data entry error that should be corrected.',
          affectedEntities: [
            { type: 'dignity', id: dignity.id, name: dignity.name },
            { type: 'tenure', id: tenure.id, name: `Tenure of ${getPersonName(person)}` },
            { type: 'person', id: person.id, name: getPersonName(person) }
          ],
          suggestedAction: {
            type: 'update-tenure',
            label: 'Fix Dates',
            data: {
              tenureId: tenure.id,
              promptForCorrection: true
            },
            preview: 'Manually correct the tenure dates'
          },
          alternativeActions: [],
          dependsOn: [],
          enables: [],
          created: new Date().toISOString(),
          dismissed: false,
          dismissedReason: null,
          applied: false,
          appliedAt: null,
          deferred: false
        };
        
        suggestions.push(suggestion);
      }
    }
  }
  
  return suggestions;
}

/**
 * Analyze circular feudal chains
 * 
 * Detects when feudal hierarchy contains loops (A sworn to B sworn to C sworn to A).
 * 
 * @param {Array} dignities - All dignities
 * @returns {Suggestion[]} Suggestions for circular chains
 */
function analyzeCircularFeudalChains(dignities) {
  const suggestions = [];
  const dignitiesById = new Map(dignities.map(d => [d.id, d]));
  
  for (const dignity of dignities) {
    if (!dignity.swornToId) continue;
    
    // Traverse up the chain looking for cycles
    const visited = new Set([dignity.id]);
    let current = dignitiesById.get(dignity.swornToId);
    const chain = [dignity.name];
    
    while (current) {
      chain.push(current.name);
      
      if (visited.has(current.id)) {
        // Found a cycle!
        const suggestion = {
          id: generateSuggestionId(),
          type: 'circular-feudal-chain',
          severity: 'critical',
          confidence: 1.0,
          title: `Circular feudal chain detected`,
          description: `The feudal hierarchy contains a loop: ${chain.join(' → ')}`,
          reasoning: 'This is a data integrity error that breaks feudal chain calculations.',
          affectedEntities: chain.map((name, i) => ({
            type: 'dignity',
            id: i === 0 ? dignity.id : dignitiesById.get([...visited][i])?.id,
            name
          })).filter(e => e.id),
          suggestedAction: {
            type: 'fix-feudal-chain',
            label: 'Break Cycle',
            data: {
              dignityId: dignity.id,
              removeSwornTo: true
            },
            preview: `Remove ${dignity.name}'s sworn allegiance to break the cycle`
          },
          alternativeActions: [],
          dependsOn: [],
          enables: [],
          created: new Date().toISOString(),
          dismissed: false,
          dismissedReason: null,
          applied: false,
          appliedAt: null,
          deferred: false
        };
        
        suggestions.push(suggestion);
        break;
      }
      
      visited.add(current.id);
      current = current.swornToId ? dignitiesById.get(current.swornToId) : null;
    }
  }
  
  return suggestions;
}

/**
 * Analyze over-titled people
 * 
 * Detects people holding an unusually high number of major titles.
 * 
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for potential errors
 */
function analyzeOverTitledPeople(maps) {
  const suggestions = [];
  const THRESHOLD = 5; // More than 5 titles is suspicious
  
  for (const [personId, dignities] of maps.dignitiesByPerson) {
    if (dignities.length <= THRESHOLD) continue;
    
    const person = maps.peopleById.get(personId);
    if (!person) continue;
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'over-titled-person',
      severity: 'info',
      confidence: 0.6, // Low confidence - might be intentional
      title: `${getPersonName(person)} holds ${dignities.length} titles`,
      description: `This person holds an unusually high number of dignities, which may indicate data entry errors.`,
      reasoning: `Titles: ${dignities.map(d => d.name).join(', ')}`,
      affectedEntities: [
        { type: 'person', id: person.id, name: getPersonName(person) },
        ...dignities.map(d => ({ type: 'dignity', id: d.id, name: d.name }))
      ],
      suggestedAction: {
        type: 'review',
        label: 'Review Titles',
        data: { personId: person.id },
        preview: 'Review and confirm all titles are correct'
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze widowed dignities (linked to deleted houses)
 * 
 * @param {Array} dignities - All dignities
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for orphaned links
 */
function analyzeWidowedDignities(dignities, maps) {
  const suggestions = [];
  
  for (const dignity of dignities) {
    if (!dignity.currentHouseId) continue;
    
    const house = maps.housesById.get(dignity.currentHouseId);
    if (house) continue; // House exists, no problem
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'widowed-dignity',
      severity: 'critical',
      confidence: 1.0,
      title: `${dignity.name} linked to non-existent house`,
      description: `This dignity references house ID ${dignity.currentHouseId} which no longer exists.`,
      reasoning: 'The house may have been deleted. The dignity should be relinked or cleaned up.',
      affectedEntities: [
        { type: 'dignity', id: dignity.id, name: dignity.name }
      ],
      suggestedAction: {
        type: 'link-to-house',
        label: 'Relink to House',
        data: {
          dignityId: dignity.id,
          clearCurrentHouseId: true,
          promptForHouse: true
        },
        preview: 'Select a new house for this dignity'
      },
      alternativeActions: [
        {
          type: 'update-dignity',
          label: 'Clear House Link',
          data: {
            dignityId: dignity.id,
            currentHouseId: null
          },
          preview: 'Remove the broken house reference'
        }
      ],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

/**
 * Analyze cadet houses without their own title
 * 
 * @param {Array} houses - All houses
 * @param {Object} maps - Lookup maps
 * @returns {Suggestion[]} Suggestions for cadet houses
 */
function analyzeCadetHousesWithoutTitles(houses, maps) {
  const suggestions = [];
  
  for (const house of houses) {
    // Only check cadet houses
    if (!house.parentHouseId || house.houseType !== 'cadet') continue;
    
    const houseDignities = maps.dignitiesByHouse.get(house.id) || [];
    if (houseDignities.length > 0) continue;
    
    const parentHouse = maps.housesById.get(house.parentHouseId);
    const patriarch = findEldestLivingLegitimate(house.id, maps);
    
    const suggestion = {
      id: generateSuggestionId(),
      type: 'cadet-no-title',
      severity: 'info',
      confidence: 0.75,
      title: `Cadet branch ${house.houseName} has no title`,
      description: `This cadet house of ${parentHouse?.houseName || 'unknown'} has no associated dignity.`,
      reasoning: patriarch
        ? `${getPersonName(patriarch)} could be granted a title as head of this cadet branch.`
        : 'Consider creating a dignity for this branch.',
      affectedEntities: [
        { type: 'house', id: house.id, name: house.houseName },
        ...(patriarch ? [{ type: 'person', id: patriarch.id, name: getPersonName(patriarch) }] : [])
      ],
      suggestedAction: {
        type: 'create-dignity',
        label: 'Create Cadet Title',
        data: {
          name: `Drithling of ${house.houseName}`,
          dignityClass: 'driht',
          dignityRank: 'drithling',
          currentHouseId: house.id,
          currentHolderId: patriarch?.id || null,
          isHereditary: true
        },
        preview: `Create "Drithling of ${house.houseName}"`
      },
      alternativeActions: [],
      dependsOn: [],
      enables: [],
      created: new Date().toISOString(),
      dismissed: false,
      dismissedReason: null,
      applied: false,
      appliedAt: null,
      deferred: false
    };
    
    suggestions.push(suggestion);
  }
  
  return suggestions;
}

// ==================== MAIN ANALYSIS FUNCTION ====================

/**
 * Run full analysis on all data
 * 
 * This is the main entry point. It:
 * 1. Fetches all needed data from IndexedDB
 * 2. Builds lookup maps for O(1) access
 * 3. Runs each analyzer function
 * 4. Deduplicates and sorts results
 * 5. Returns unified analysis result
 * 
 * @param {Object} options - Analysis options
 * @param {string[]} options.analyzers - Which analyzers to run (default: all)
 * @param {string[]} options.severities - Which severities to include (default: all)
 * @param {number} options.minConfidence - Minimum confidence threshold (default: 0)
 * @returns {Promise<AnalysisResult>} Analysis results
 */
export async function runFullAnalysis(options = {}) {
  const {
    analyzers = 'all',
    severities = ['critical', 'warning', 'info'],
    minConfidence = 0
  } = options;
  
  console.log('🔍 Starting dignity analysis...');
  const startTime = Date.now();
  
  try {
    // 1. Fetch all data
    const [people, houses, dignities, relationships] = await Promise.all([
      getAllPeople(),
      getAllHouses(),
      getAllDignities(),
      getAllRelationships()
    ]);
    
    // Fetch all tenures
    const tenuresByDignity = new Map();
    for (const dignity of dignities) {
      const tenures = await getTenuresForDignity(dignity.id);
      tenuresByDignity.set(dignity.id, tenures);
    }
    
    console.log(`📊 Data loaded: ${people.length} people, ${houses.length} houses, ${dignities.length} dignities`);
    
    // 2. Build lookup maps
    const maps = buildLookupMaps(people, houses, dignities, relationships);
    
    // 3. Run analyzers
    let allSuggestions = [];
    
    const analyzerFunctions = {
      'house-no-head': () => analyzeHousesWithoutTitles(houses, maps),
      'deceased-holder': () => analyzeDeceasedHolders(dignities, maps),
      'no-tenure-records': () => analyzeNoTenureRecords(dignities, tenuresByDignity, maps),
      'tenure-gaps': () => analyzeTenureGaps(dignities, tenuresByDignity, maps),
      'orphaned-dignity': () => analyzeOrphanedDignities(dignities, maps),
      'temporal-issues': () => analyzeTemporalIssues(dignities, tenuresByDignity, maps),
      'circular-chains': () => analyzeCircularFeudalChains(dignities),
      'over-titled': () => analyzeOverTitledPeople(maps),
      'widowed-dignity': () => analyzeWidowedDignities(dignities, maps),
      'cadet-no-title': () => analyzeCadetHousesWithoutTitles(houses, maps)
    };
    
    const analyzersToRun = analyzers === 'all' 
      ? Object.keys(analyzerFunctions)
      : analyzers;
    
    for (const analyzerName of analyzersToRun) {
      const analyzerFn = analyzerFunctions[analyzerName];
      if (analyzerFn) {
        const suggestions = analyzerFn();
        allSuggestions.push(...suggestions);
        console.log(`  ✓ ${analyzerName}: ${suggestions.length} suggestions`);
      }
    }
    
    // 4. Filter by severity and confidence
    allSuggestions = allSuggestions.filter(s => 
      severities.includes(s.severity) && s.confidence >= minConfidence
    );
    
    // 5. Sort by severity (critical first) then confidence (highest first)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    allSuggestions.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return b.confidence - a.confidence;
    });
    
    // 6. Calculate statistics
    const stats = {
      total: allSuggestions.length,
      bySeverity: {
        critical: allSuggestions.filter(s => s.severity === 'critical').length,
        warning: allSuggestions.filter(s => s.severity === 'warning').length,
        info: allSuggestions.filter(s => s.severity === 'info').length
      },
      byType: {}
    };
    
    for (const suggestion of allSuggestions) {
      stats.byType[suggestion.type] = (stats.byType[suggestion.type] || 0) + 1;
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Analysis complete: ${allSuggestions.length} suggestions in ${duration}ms`);
    
    return {
      suggestions: allSuggestions,
      stats,
      analyzedAt: new Date().toISOString(),
      duration,
      dataSnapshot: {
        peopleCount: people.length,
        housesCount: houses.length,
        dignitiesCount: dignities.length
      }
    };
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  }
}

/**
 * Run analysis for a specific entity
 * 
 * Returns only suggestions relevant to a particular house, person, or dignity.
 * 
 * @param {string} entityType - 'house' | 'person' | 'dignity'
 * @param {number} entityId - Entity ID
 * @returns {Promise<Suggestion[]>} Relevant suggestions
 */
export async function analyzeEntity(entityType, entityId) {
  const result = await runFullAnalysis();
  
  return result.suggestions.filter(suggestion =>
    suggestion.affectedEntities.some(e => 
      e.type === entityType && e.id === entityId
    )
  );
}

// ==================== EXPORTS ====================

export {
  generateSuggestionId,
  buildLookupMaps,
  analyzeHousesWithoutTitles,
  analyzeDeceasedHolders,
  analyzeNoTenureRecords,
  analyzeTenureGaps,
  analyzeOrphanedDignities,
  analyzeTemporalIssues,
  analyzeCircularFeudalChains,
  analyzeOverTitledPeople,
  analyzeWidowedDignities,
  analyzeCadetHousesWithoutTitles
};

export default {
  runFullAnalysis,
  analyzeEntity
};
```

### Deliverables

- [ ] Create `/src/services/dignityAnalysisService.js` with all analyzer functions
- [ ] Create `/src/data/suggestionTypes.js` with type definitions
- [ ] Test with existing data to verify suggestions are generated correctly
- [ ] Console logging should show analysis progress

### Testing Criteria

1. Run `runFullAnalysis()` from browser console
2. Verify suggestions are generated for known issues in test data
3. Verify no false positives for clean data
4. Verify performance is acceptable (<1 second for typical dataset)

---

## Phase 2: React Hook

**Goal:** Create a React hook that manages analysis state and provides actions.

**File:** `/src/hooks/useDignityAnalysis.js`

### Implementation Details

```javascript
/**
 * useDignityAnalysis - React hook for dignity analysis
 * 
 * Provides:
 * - Analysis state (suggestions, loading, error)
 * - Actions (runAnalysis, applySuggestion, dismissSuggestion)
 * - Memoized filtered views (bySeverity, byType, byEntity)
 * 
 * FOLLOWS DEVELOPMENT GUIDELINES:
 * - useCallback for all handlers
 * - useMemo for filtered/sorted views
 * - Cleanup in useEffect
 * - ≤4 dependencies per effect
 * 
 * @module useDignityAnalysis
 */

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { runFullAnalysis, analyzeEntity } from '../services/dignityAnalysisService';
import {
  createDignity,
  updateDignity,
  createDignityTenure,
  updateDignityTenure
} from '../services/dignityService';

/**
 * Custom hook for dignity analysis
 * 
 * @param {Object} options - Hook options
 * @param {string} options.scope - 'all' | 'house' | 'person' | 'dignity'
 * @param {number} options.entityId - Entity ID if scope is not 'all'
 * @returns {Object} Analysis state and actions
 */
export function useDignityAnalysis(options = {}) {
  const { scope = 'all', entityId = null } = options;
  const { user } = useAuth();
  
  // Core state
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastAnalyzed, setLastAnalyzed] = useState(null);
  const [stats, setStats] = useState(null);
  
  // ==================== LOOKUP MAPS ====================
  
  /**
   * Map of suggestion ID to suggestion object for O(1) lookup
   */
  const suggestionMap = useMemo(() => 
    new Map(suggestions.map(s => [s.id, s])), 
    [suggestions]
  );
  
  // ==================== FILTERED VIEWS ====================
  
  /**
   * Active suggestions (not dismissed or applied)
   */
  const activeSuggestions = useMemo(() =>
    suggestions.filter(s => !s.dismissed && !s.applied),
    [suggestions]
  );
  
  /**
   * Critical suggestions only
   */
  const criticalSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'critical'),
    [activeSuggestions]
  );
  
  /**
   * Warning suggestions only
   */
  const warningSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'warning'),
    [activeSuggestions]
  );
  
  /**
   * Info suggestions only
   */
  const infoSuggestions = useMemo(() =>
    activeSuggestions.filter(s => s.severity === 'info'),
    [activeSuggestions]
  );
  
  /**
   * Dismissed suggestions
   */
  const dismissedSuggestions = useMemo(() =>
    suggestions.filter(s => s.dismissed),
    [suggestions]
  );
  
  /**
   * Applied suggestions
   */
  const appliedSuggestions = useMemo(() =>
    suggestions.filter(s => s.applied),
    [suggestions]
  );
  
  /**
   * Deferred suggestions
   */
  const deferredSuggestions = useMemo(() =>
    suggestions.filter(s => s.deferred && !s.dismissed && !s.applied),
    [suggestions]
  );
  
  /**
   * Suggestions grouped by type
   */
  const suggestionsByType = useMemo(() => {
    const grouped = {};
    for (const suggestion of activeSuggestions) {
      if (!grouped[suggestion.type]) {
        grouped[suggestion.type] = [];
      }
      grouped[suggestion.type].push(suggestion);
    }
    return grouped;
  }, [activeSuggestions]);
  
  // ==================== ACTIONS ====================
  
  /**
   * Run analysis
   * 
   * @param {Object} analysisOptions - Options passed to runFullAnalysis
   */
  const runAnalysis = useCallback(async (analysisOptions = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      let result;
      
      if (scope === 'all') {
        result = await runFullAnalysis(analysisOptions);
      } else {
        const entitySuggestions = await analyzeEntity(scope, entityId);
        result = {
          suggestions: entitySuggestions,
          stats: {
            total: entitySuggestions.length,
            bySeverity: {
              critical: entitySuggestions.filter(s => s.severity === 'critical').length,
              warning: entitySuggestions.filter(s => s.severity === 'warning').length,
              info: entitySuggestions.filter(s => s.severity === 'info').length
            }
          },
          analyzedAt: new Date().toISOString()
        };
      }
      
      setSuggestions(result.suggestions);
      setStats(result.stats);
      setLastAnalyzed(result.analyzedAt);
      
      return result;
    } catch (err) {
      console.error('Analysis failed:', err);
      setError(err.message || 'Analysis failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [scope, entityId]);
  
  /**
   * Apply a suggestion (execute its action)
   * 
   * @param {string} suggestionId - Suggestion to apply
   * @param {Object} overrideData - Optional data to override suggestion defaults
   */
  const applySuggestion = useCallback(async (suggestionId, overrideData = {}) => {
    const suggestion = suggestionMap.get(suggestionId);
    if (!suggestion) {
      throw new Error('Suggestion not found');
    }
    
    const action = suggestion.suggestedAction;
    const data = { ...action.data, ...overrideData };
    
    try {
      // Execute action based on type
      switch (action.type) {
        case 'create-dignity':
          await createDignity(data, user?.uid);
          break;
          
        case 'update-dignity':
          await updateDignity(data.dignityId, data, user?.uid);
          break;
          
        case 'transfer-dignity':
          // End current tenure
          if (data.endCurrentTenure) {
            const currentTenure = await getCurrentTenure(data.dignityId);
            if (currentTenure) {
              await updateDignityTenure(currentTenure.id, data.endCurrentTenure, user?.uid);
            }
          }
          // Calculate and assign heir if requested
          if (data.calculateHeir) {
            // This would call calculateSuccessionLine and create new tenure
            // Implementation depends on succession rules
          }
          break;
          
        case 'create-tenure':
          await createDignityTenure(data, user?.uid);
          break;
          
        case 'create-tenure-chain':
          for (const tenureData of data.tenures) {
            await createDignityTenure({
              dignityId: data.dignityId,
              ...tenureData
            }, user?.uid);
          }
          break;
          
        case 'mark-vacant':
          await updateDignity(data.dignityId, {
            currentHolderId: null,
            isVacant: true
          }, user?.uid);
          break;
          
        case 'fix-feudal-chain':
          await updateDignity(data.dignityId, {
            swornToId: null
          }, user?.uid);
          break;
          
        case 'link-to-house':
          // This requires user input, should be handled by UI
          if (data.promptForHouse) {
            throw new Error('This action requires user input');
          }
          await updateDignity(data.dignityId, {
            currentHouseId: data.houseId
          }, user?.uid);
          break;
          
        default:
          console.warn('Unknown action type:', action.type);
      }
      
      // Mark suggestion as applied
      setSuggestions(prev => prev.map(s =>
        s.id === suggestionId
          ? { ...s, applied: true, appliedAt: new Date().toISOString() }
          : s
      ));
      
      return true;
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
      throw err;
    }
  }, [suggestionMap, user?.uid]);
  
  /**
   * Dismiss a suggestion
   * 
   * @param {string} suggestionId - Suggestion to dismiss
   * @param {string} reason - Why it was dismissed
   */
  const dismissSuggestion = useCallback((suggestionId, reason = null) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, dismissed: true, dismissedReason: reason }
        : s
    ));
  }, []);
  
  /**
   * Defer a suggestion (mark for later review)
   * 
   * @param {string} suggestionId - Suggestion to defer
   */
  const deferSuggestion = useCallback((suggestionId) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, deferred: true }
        : s
    ));
  }, []);
  
  /**
   * Undefer a suggestion
   * 
   * @param {string} suggestionId - Suggestion to undefer
   */
  const undeferSuggestion = useCallback((suggestionId) => {
    setSuggestions(prev => prev.map(s =>
      s.id === suggestionId
        ? { ...s, deferred: false }
        : s
    ));
  }, []);
  
  /**
   * Get suggestions affecting a specific entity
   * 
   * @param {string} entityType - 'house' | 'person' | 'dignity'
   * @param {number} entityId - Entity ID
   * @returns {Suggestion[]} Matching suggestions
   */
  const getSuggestionsForEntity = useCallback((entityType, entityId) => {
    return activeSuggestions.filter(s =>
      s.affectedEntities.some(e => e.type === entityType && e.id === entityId)
    );
  }, [activeSuggestions]);
  
  /**
   * Clear all suggestions
   */
  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setStats(null);
    setLastAnalyzed(null);
    setError(null);
  }, []);
  
  /**
   * Restore dismissed suggestions
   */
  const restoreDismissed = useCallback(() => {
    setSuggestions(prev => prev.map(s =>
      s.dismissed ? { ...s, dismissed: false, dismissedReason: null } : s
    ));
  }, []);
  
  // ==================== RETURN VALUE ====================
  
  return {
    // State
    suggestions,
    activeSuggestions,
    loading,
    error,
    lastAnalyzed,
    stats,
    
    // Filtered views
    criticalSuggestions,
    warningSuggestions,
    infoSuggestions,
    dismissedSuggestions,
    appliedSuggestions,
    deferredSuggestions,
    suggestionsByType,
    
    // Counts
    totalCount: suggestions.length,
    activeCount: activeSuggestions.length,
    criticalCount: criticalSuggestions.length,
    
    // Actions
    runAnalysis,
    applySuggestion,
    dismissSuggestion,
    deferSuggestion,
    undeferSuggestion,
    getSuggestionsForEntity,
    clearSuggestions,
    restoreDismissed,
    
    // Utilities
    getSuggestion: (id) => suggestionMap.get(id)
  };
}

export default useDignityAnalysis;
```

### Deliverables

- [ ] Create `/src/hooks/useDignityAnalysis.js`
- [ ] Update `/src/hooks/index.js` to export new hook
- [ ] Test hook in React DevTools

### Testing Criteria

1. Hook mounts without errors
2. `runAnalysis()` fetches and stores suggestions
3. `applySuggestion()` updates database and marks as applied
4. `dismissSuggestion()` marks suggestions as dismissed
5. Filtered views update reactively

---

## Phase 3: UI Components

**Goal:** Create reusable suggestion display components.

### 3.1 SuggestionCard Component

**File:** `/src/components/suggestions/SuggestionCard.jsx`

```javascript
/**
 * SuggestionCard - Displays a single analysis suggestion
 * 
 * Shows:
 * - Severity indicator (icon + color)
 * - Title and description
 * - Affected entities
 * - Action buttons (Apply, Dismiss, Defer)
 * - Preview of what will change
 * 
 * @module SuggestionCard
 */

import { useState, useCallback, memo } from 'react';
import { motion } from 'framer-motion';
import Icon from '../icons/Icon';
import ActionButton from '../shared/ActionButton';
import { SUGGESTION_TYPES } from '../../data/suggestionTypes';
import './SuggestionCard.css';

// Severity configuration
const SEVERITY_CONFIG = {
  critical: { icon: 'alert-triangle', color: 'var(--color-error)', label: 'Critical' },
  warning: { icon: 'alert-circle', color: 'var(--color-warning)', label: 'Warning' },
  info: { icon: 'info', color: 'var(--color-info)', label: 'Info' }
};

/**
 * SuggestionCard Component
 * 
 * @param {Object} props
 * @param {Suggestion} props.suggestion - The suggestion to display
 * @param {Function} props.onApply - Called when Apply clicked
 * @param {Function} props.onDismiss - Called when Dismiss clicked
 * @param {Function} props.onDefer - Called when Defer clicked
 * @param {boolean} props.showPreview - Show action preview (default: true)
 * @param {boolean} props.compact - Compact display mode (default: false)
 * @param {boolean} props.disabled - Disable all actions
 */
function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
  onDefer,
  showPreview = true,
  compact = false,
  disabled = false
}) {
  const [expanded, setExpanded] = useState(!compact);
  const [applying, setApplying] = useState(false);
  
  const severityConfig = SEVERITY_CONFIG[suggestion.severity];
  const typeConfig = SUGGESTION_TYPES[suggestion.type] || {};
  
  const handleApply = useCallback(async () => {
    if (applying || disabled) return;
    setApplying(true);
    try {
      await onApply?.(suggestion.id);
    } finally {
      setApplying(false);
    }
  }, [suggestion.id, onApply, applying, disabled]);
  
  const handleDismiss = useCallback(() => {
    onDismiss?.(suggestion.id);
  }, [suggestion.id, onDismiss]);
  
  const handleDefer = useCallback(() => {
    onDefer?.(suggestion.id);
  }, [suggestion.id, onDefer]);
  
  const toggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);
  
  // Confidence as percentage
  const confidencePercent = Math.round(suggestion.confidence * 100);
  
  return (
    <motion.div
      className={`suggestion-card suggestion-card--${suggestion.severity} ${compact ? 'suggestion-card--compact' : ''} ${suggestion.dismissed ? 'suggestion-card--dismissed' : ''} ${suggestion.applied ? 'suggestion-card--applied' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      layout
    >
      {/* Header */}
      <div className="suggestion-card__header" onClick={compact ? toggleExpand : undefined}>
        <div className="suggestion-card__severity" style={{ color: severityConfig.color }}>
          <Icon name={severityConfig.icon} size={compact ? 16 : 20} />
        </div>
        
        <div className="suggestion-card__title-area">
          <h4 className="suggestion-card__title">{suggestion.title}</h4>
          {!compact && (
            <span className="suggestion-card__type">
              <Icon name={typeConfig.icon || 'help-circle'} size={14} />
              {typeConfig.name}
            </span>
          )}
        </div>
        
        <div className="suggestion-card__confidence" title={`${confidencePercent}% confidence`}>
          <span className="suggestion-card__confidence-value">{confidencePercent}%</span>
        </div>
        
        {compact && (
          <button className="suggestion-card__expand" onClick={toggleExpand}>
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
          </button>
        )}
      </div>
      
      {/* Body (expandable in compact mode) */}
      {expanded && (
        <div className="suggestion-card__body">
          <p className="suggestion-card__description">{suggestion.description}</p>
          
          {suggestion.reasoning && (
            <p className="suggestion-card__reasoning">
              <Icon name="lightbulb" size={14} />
              {suggestion.reasoning}
            </p>
          )}
          
          {/* Affected Entities */}
          {suggestion.affectedEntities.length > 0 && (
            <div className="suggestion-card__entities">
              <span className="suggestion-card__entities-label">Affects:</span>
              {suggestion.affectedEntities.map((entity, idx) => (
                <span key={`${entity.type}-${entity.id}`} className={`suggestion-card__entity suggestion-card__entity--${entity.type}`}>
                  {entity.name}
                </span>
              ))}
            </div>
          )}
          
          {/* Action Preview */}
          {showPreview && suggestion.suggestedAction?.preview && (
            <div className="suggestion-card__preview">
              <Icon name="eye" size={14} />
              <span>{suggestion.suggestedAction.preview}</span>
            </div>
          )}
        </div>
      )}
      
      {/* Actions */}
      {expanded && !suggestion.applied && !suggestion.dismissed && (
        <div className="suggestion-card__actions">
          <ActionButton
            icon={applying ? 'loader-2' : 'check'}
            onClick={handleApply}
            variant="primary"
            size="sm"
            disabled={disabled || applying}
            className={applying ? 'spin-icon' : ''}
          >
            {suggestion.suggestedAction?.label || 'Apply'}
          </ActionButton>
          
          <ActionButton
            icon="clock"
            onClick={handleDefer}
            variant="secondary"
            size="sm"
            disabled={disabled}
          >
            Later
          </ActionButton>
          
          <ActionButton
            icon="x"
            onClick={handleDismiss}
            variant="ghost"
            size="sm"
            disabled={disabled}
          >
            Dismiss
          </ActionButton>
        </div>
      )}
      
      {/* Status indicators */}
      {suggestion.applied && (
        <div className="suggestion-card__status suggestion-card__status--applied">
          <Icon name="check-circle" size={14} />
          <span>Applied</span>
        </div>
      )}
      
      {suggestion.dismissed && (
        <div className="suggestion-card__status suggestion-card__status--dismissed">
          <Icon name="x-circle" size={14} />
          <span>Dismissed</span>
        </div>
      )}
    </motion.div>
  );
}

export default memo(SuggestionCard);
```

### 3.2 SuggestionsPanel Component

**File:** `/src/components/suggestions/SuggestionsPanel.jsx`

A container that displays multiple suggestions with filtering and sorting.

### 3.3 SuggestionsBadge Component

**File:** `/src/components/suggestions/SuggestionsBadge.jsx`

A compact indicator showing suggestion counts.

### 3.4 AnalysisSummary Component

**File:** `/src/components/suggestions/AnalysisSummary.jsx`

Statistics overview showing counts by severity and type.

### Deliverables

- [ ] Create `/src/components/suggestions/SuggestionCard.jsx` and CSS
- [ ] Create `/src/components/suggestions/SuggestionsPanel.jsx` and CSS
- [ ] Create `/src/components/suggestions/SuggestionsBadge.jsx` and CSS
- [ ] Create `/src/components/suggestions/AnalysisSummary.jsx` and CSS
- [ ] Create `/src/components/suggestions/index.js` barrel export
- [ ] All components use theme CSS variables
- [ ] All components are memoized

### Testing Criteria

1. Components render correctly in both themes
2. Actions trigger callbacks properly
3. Animations are smooth
4. Compact mode works correctly
5. Accessibility: keyboard navigation, screen reader labels

---

## Phase 4: Integration

**Goal:** Integrate analysis into existing pages and add dedicated analysis page.

### 4.1 DignityAnalysis Page

**File:** `/src/pages/DignityAnalysis.jsx`

Full analysis dashboard with:
- "Analyze Now" button
- Statistics summary
- Tabbed view by severity
- Bulk actions
- History of applied/dismissed

### 4.2 DignitiesLanding Integration

Add to existing page:
- Analysis button in header
- Badge showing active suggestion count
- Optional inline panel when issues exist

### 4.3 DignityView Integration

Add to existing page:
- Contextual suggestions section
- Shows only suggestions affecting this dignity
- Inline apply/dismiss

### 4.4 Route Configuration

**File:** `/src/App.jsx`

Add route: `/dignities/analysis` → `DignityAnalysis`

### Deliverables

- [ ] Create `/src/pages/DignityAnalysis.jsx` and CSS
- [ ] Modify `/src/pages/DignitiesLanding.jsx` to add analysis button/badge
- [ ] Modify `/src/pages/DignityView.jsx` to add contextual suggestions
- [ ] Add route in `/src/App.jsx`
- [ ] Update Navigation if needed

### Testing Criteria

1. Analysis page loads and runs analysis
2. Badge updates when suggestions change
3. Contextual suggestions appear on DignityView
4. Navigation works correctly

---

## Phase 5: Household Roles

**Goal:** Add separate system for tracking household positions.

### 5.1 Database Migration

**File:** `/src/services/database.js`

Add Version 10:

```javascript
db.version(10).stores({
  // ... existing tables ...
  householdRoles: '++id, houseId, roleType, currentHolderId, created, updated'
});
```

### 5.2 Service Layer

**File:** `/src/services/householdRoleService.js`

CRUD operations for household roles.

### 5.3 UI Components

**Files:**
- `/src/components/household/HouseholdRolesPanel.jsx`
- `/src/components/household/HouseholdRoleForm.jsx`

### 5.4 Integration

Add panel to House detail view (not a separate page).

### Deliverables

- [ ] Add database version 10 with householdRoles table
- [ ] Create `/src/services/householdRoleService.js`
- [ ] Create `/src/data/householdRoleTypes.js`
- [ ] Create `/src/components/household/` components
- [ ] Add sync functions to dataSyncService.js
- [ ] Integrate into House view

### Testing Criteria

1. Roles can be created, read, updated, deleted
2. Roles display in House view
3. Cloud sync works
4. Both themes display correctly

---

## Development Guidelines Compliance

### Checklist for Each File

- [ ] **File Size**: Under limits (components <500, services <400, pages <800)
- [ ] **Memoization**: `useMemo` for expensive computations, `memo()` for components
- [ ] **Callbacks**: `useCallback` for all event handlers
- [ ] **Data Lookups**: Use `Map` for O(1) access
- [ ] **Error Handling**: Try/catch in async functions
- [ ] **Loading States**: Show spinners during async operations
- [ ] **Empty States**: Handle no-data scenarios gracefully
- [ ] **Cleanup**: Cancel async operations in useEffect cleanup
- [ ] **Theming**: Use CSS custom properties only
- [ ] **useEffect Rules**: Single responsibility, ≤4 dependencies
- [ ] **No console.log**: Remove or guard with `import.meta.env.DEV`

### CSS Guidelines

- Use CSS custom properties for all colors
- Follow BEM naming convention
- External CSS files (no inline styles for complex styling)
- Test in both themes

### Testing

- Test all CRUD operations
- Test error scenarios
- Test with empty data
- Test with large datasets
- Test in both themes

---

## Testing Criteria

### Phase 1 Tests

1. `runFullAnalysis()` completes without errors
2. All analyzer functions return valid Suggestion objects
3. Performance: <1 second for typical dataset
4. No false positives for clean data

### Phase 2 Tests

1. Hook mounts without errors
2. State updates correctly after analysis
3. Apply/dismiss/defer update state correctly
4. Filtered views are accurate

### Phase 3 Tests

1. Components render in both themes
2. Actions trigger callbacks
3. Animations are smooth
4. Accessible via keyboard

### Phase 4 Tests

1. Analysis page functions correctly
2. Integration doesn't break existing functionality
3. Contextual suggestions appear correctly

### Phase 5 Tests

1. Database migration succeeds
2. CRUD operations work
3. Cloud sync works
4. UI displays correctly

---

## Design Decisions

### Q: Should dismissed suggestions persist across sessions?
**A:** Yes, store in localStorage keyed by suggestion type + entity. This prevents re-showing dismissed suggestions unless data changes significantly.

### Q: What scope should "Analyze" cover?
**A:** Full analysis always. Contextual filtering is done client-side from the full result. This ensures consistency and makes the code simpler.

### Q: Should we hide low-confidence suggestions?
**A:** Show everything with confidence indicators. Users can filter by confidence if needed. The goal is to be "aggressive" when analysis is triggered.

### Q: Should household roles track history?
**A:** No, keep it simple. Just current holder. Historical tracking can be added later if needed.

### Q: Where do household roles live in the UI?
**A:** As a collapsible panel in House detail view. Not a separate page - keeps the UI clean and roles contextual.

---

## Appendix: File Templates

### Barrel Export Template

```javascript
// /src/components/suggestions/index.js
export { default as SuggestionCard } from './SuggestionCard';
export { default as SuggestionsPanel } from './SuggestionsPanel';
export { default as SuggestionsBadge } from './SuggestionsBadge';
export { default as AnalysisSummary } from './AnalysisSummary';
```

### CSS Custom Properties Reference

```css
/* Available theme variables */
--bg-primary
--bg-secondary
--bg-tertiary
--text-primary
--text-secondary
--text-tertiary
--border-primary
--border-secondary
--accent-primary
--accent-secondary
--color-success
--color-warning
--color-error
--color-info
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2025 | Initial implementation plan |

---

*End of Implementation Plan*
