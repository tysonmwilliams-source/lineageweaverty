# Codex Integration Strategy: Unified Person Architecture

## Executive Summary

This document outlines a phased approach to integrating Lineageweaver's two core systems:
1. **Family Tree / Data Management System** (genealogical quick reference)
2. **The Codex System** (rich biographical encyclopedia)

Currently, these systems operate independently. This integration will create a unified "Person" concept where genealogical data and biographical lore share the same foundation, eliminating duplicate data entry and creating seamless navigation between quick reference and deep worldbuilding contexts.

**Timeline**: 3 major phases across 10-15 development sessions
**Risk Level**: Low to Medium (carefully staged to preserve existing functionality)
**Expected Outcome**: Significantly enhanced user experience with minimal disruption

---

## The Core Vision: What We're Building Toward

### Current State (Disconnected Systems)
```
┌─────────────────────┐          ┌─────────────────────┐
│  FAMILY TREE        │          │  THE CODEX          │
│                     │          │                     │
│  - Aldric Wilfrey   │          │  - Aldric Wilfrey   │
│  - b. 1245          │          │  - Biography text   │
│  - House Wilfrey    │    NO    │  - Wiki links       │
│  - Relationships    │  ←───→   │  - Rich content     │
│                     │  LINK    │                     │
│  [Separate Data]    │          │  [Separate Data]    │
└─────────────────────┘          └─────────────────────┘
     User manages                    User manages
     genealogy here                  lore here
     
     PROBLEM: Same person, two places to update
```

### Future State (Integrated System)
```
┌──────────────────────────────────────────────────────┐
│             UNIFIED PERSON RECORD                    │
│                                                      │
│  ID: person-aldric-wilfrey                          │
│                                                      │
│  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  Genealogical Data  │  │  Biographical Data  │  │
│  │  - Names, dates     │  │  - Rich text bio    │  │
│  │  - Relationships    │  │  - Wiki links       │  │
│  │  - House affil.     │  │  - Images/portraits │  │
│  └─────────────────────┘  └─────────────────────┘  │
│           ↓                         ↓                │
│  ┌─────────────────┐      ┌──────────────────┐     │
│  │  Tree View      │      │  Codex View      │     │
│  │  (Quick Ref)    │ ←──→ │  (Deep Lore)     │     │
│  └─────────────────┘      └──────────────────┘     │
└──────────────────────────────────────────────────────┘
        User edits once, both views update
```

---

## Why This Integration Matters: Strategic Benefits

### 1. **Eliminate Dual Entry (Efficiency Gain)**

**Current workflow** when creating a new character:
1. Add person in Data Management (name, dates, house)
2. Remember to also create Codex entry
3. Re-type the same name
4. Manually keep both updated if details change

**Integrated workflow**:
1. Add person in Data Management
2. Codex entry auto-created with skeleton
3. Click "View Biography" to add rich details
4. Updates in either place automatically sync

**Time saved**: Estimated 30-40% reduction in data entry time for characters

---

### 2. **Contextual Richness (Better Worldbuilding)**

**Current limitation**: When viewing family tree, you see names and dates but lose narrative context.

**Integration benefit**: 
```
Family Tree Card (Hover):
┌─────────────────────────────┐
│ ALDRIC WILFREY              │
│ b. 1245 - d. 1289           │
│ House Wilfrey               │
│                             │
│ 📖 "Fierce warrior who      │ ← Biography preview
│    defended Thornmarch..."  │   (first 50 chars)
│                             │
│ [View Full Biography →]     │
└─────────────────────────────┘
```

This means:
- Quick reference (tree view) remains fast and clean
- Deeper context available on-demand
- No switching between disconnected systems to understand a character

---

### 3. **Knowledge Graph Completion (Future-Proofing)**

The Codex system uses wiki-links: `[[Aldric Wilfrey]]` becomes clickable.

**Current issue**: If you link to a person who exists in the family tree but not yet in Codex, the link breaks or creates duplicate entry.

**Integration solution**: 
- Every person in family tree automatically has a Codex entry
- Wiki-links to people always work
- Knowledge graph becomes complete (people + places + events all interconnected)

**Example use case**:
```
In a Codex entry about "Battle of Thornmarch":

"The battle was won by [[Aldric Wilfrey]], whose tactical 
genius was inherited from his father [[Godfrey Wilfrey]]."

Both links work automatically because they exist in family tree.
Click either → See full biography with family tree context.
```

---

### 4. **Canonical Content Integrity (Quality Control)**

You've emphasized using only verified source material (House Wilfrey datasheet).

**Integration advantage**: 
- Single source of truth prevents inconsistencies
- Can't accidentally have "Aldric born 1245" in tree but "born 1246" in Codex
- Canonical dates/names enforced across entire application

---

### 5. **Writing Reference Excellence (Core Use Case)**

Your primary use case is quick reference during writing.

**Current**: "Who was King Aldric's grandmother?" requires:
1. Open family tree
2. Navigate to Aldric
3. Find grandmother in tree
4. Open Codex separately
5. Search for her entry
6. Read biography

**Integrated**: 
1. Open family tree OR Codex
2. Click Aldric → See family connections
3. Click grandmother → Biography opens immediately
4. See both genealogy and narrative in one flow

**Result**: Faster reference = better writing flow

---

## Potential Risks & Mitigation Strategies

### Risk Category 1: Performance Degradation

#### **Risk: Tree View Becomes Slow**
**Scenario**: Loading 50+ people with full Codex content (rich text, images) could slow down tree rendering.

**Why this could happen**: Currently, tree view loads minimal data (names, dates, IDs). If we naively load full Codex content for every person, it could add 10-50KB per person.

**Mitigation Strategy**:
```javascript
// WRONG APPROACH (loads everything):
const people = await db.people.toArray(); // Includes ALL Codex content

// RIGHT APPROACH (lazy loading):
const people = await db.people
  .select(['id', 'firstName', 'lastName', 'dateOfBirth', 'houseId'])
  .toArray(); // Only loads tree-essential fields

// Codex content only loads when:
// 1. User clicks "View Biography" button
// 2. User hovers for preview (loads first 50 chars only)
```

**Testing checkpoint**: After Phase 1, measure tree render time with 100 people to ensure <500ms load time.

---

#### **Risk: Database Query Complexity Increases**
**Scenario**: Joining genealogical data with Codex data on every query could slow down searches.

**Mitigation Strategy**:
- Keep queries focused (don't join unless necessary)
- Add database indexes on frequently queried fields
- Use Dexie's compound indexes for complex queries

**Example**:
```javascript
// Add compound index for efficient querying
db.version(2).stores({
  people: '++id, firstName, lastName, [houseId+lastName]'
  // This lets us quickly find "all Wilfreys" without scanning entire table
});
```

---

### Risk Category 2: User Interface Confusion

#### **Risk: Users Don't Know Where to Edit**
**Scenario**: With two entry points (tree view and Codex view), users might not know which to use for edits.

**Why this could happen**: 
- Tree view edits genealogical data
- Codex view edits biographical narrative
- But both affect the same person

**Mitigation Strategy**:
```
Clear UI Affordances:

Data Management Modal:
┌─────────────────────────────────┐
│ ⚙️  QUICK EDIT: Aldric Wilfrey  │ ← Icon signals "technical data"
├─────────────────────────────────┤
│ First Name: [Aldric          ]  │
│ Born: [1245]  Died: [1289    ]  │
│ Edit genealogical facts here    │
│                                 │
│ 📖 View Full Biography →        │ ← Clear navigation to narrative
└─────────────────────────────────┘

Codex Entry View:
┌─────────────────────────────────┐
│ 📖 ALDRIC WILFREY               │ ← Icon signals "narrative content"
├─────────────────────────────────┤
│ Quick Facts (from genealogy):   │
│ b. 1245 - d. 1289               │
│ House Wilfrey                   │
│ ⚙️  Edit Facts →                │ ← Links back to data management
├─────────────────────────────────┤
│ Biography:                      │
│ [Rich text editor for narrative]│
└─────────────────────────────────┘
```

**User education**: Add tooltip on first use: "Edit dates/names here ⚙️ | Write story here 📖"

---

#### **Risk: Edit Conflicts (Rare but Possible)**
**Scenario**: User edits person in tree view, then immediately edits in Codex view before first save completes.

**Why this matters**: Could create race condition where one edit overwrites the other.

**Mitigation Strategy**:
- Use optimistic UI updates (show change immediately, save in background)
- Implement timestamp-based conflict resolution
- Show warning if edit detected in multiple places: "You have unsaved changes in [other view]"

---

### Risk Category 3: Data Migration Challenges

#### **Risk: Existing Data Doesn't Match New Schema**
**Scenario**: You have existing people in data management AND existing Codex entries. How do we merge them?

**Example problem**:
- Person in tree: "Aldric Wilfrey" (ID: person-123)
- Codex entry: "Aldric Wilfrey" (ID: entry-456)
- Are these the same person? How do we know?

**Mitigation Strategy**:

**Phase 2 will include a Migration Assistant**:
```javascript
// Pseudo-code for migration logic
async function migrateExistingData() {
  // 1. Find all people in data management
  const people = await db.people.toArray();
  
  // 2. For each person, check if Codex entry exists
  for (const person of people) {
    const matchingEntry = await db.codexEntries
      .where('[firstName+lastName]')
      .equals([person.firstName, person.lastName])
      .first();
    
    if (matchingEntry) {
      // 3. Merge them (link IDs, preserve all content)
      person.codexEntryId = matchingEntry.id;
      matchingEntry.personId = person.id;
      await db.people.put(person);
      await db.codexEntries.put(matchingEntry);
    } else {
      // 4. Create new Codex entry skeleton
      const newEntry = createSkeletonCodexEntry(person);
      await db.codexEntries.add(newEntry);
      person.codexEntryId = newEntry.id;
      await db.people.put(person);
    }
  }
  
  console.log("Migration complete! All people now have Codex entries.");
}
```

**Safety**: Migration runs once, creates backup of database first, shows preview of changes before applying.

---

### Risk Category 4: Feature Regression

#### **Risk: Breaking Existing Family Tree Functionality**
**Scenario**: Changes to Person data model could break existing tree rendering, relationship tracking, or search.

**Why this matters**: The family tree is core functionality that users rely on.

**Mitigation Strategy**:

**Comprehensive Testing Checklist** (run after each phase):
- [ ] Family tree renders with correct layout
- [ ] Person cards display all information
- [ ] Relationship lines draw correctly
- [ ] Color coding (legitimacy status) works
- [ ] House colors apply correctly
- [ ] Search filters people by name
- [ ] Edit modal opens and saves changes
- [ ] Adding new person works
- [ ] Adding new relationship works
- [ ] Deleting person removes from tree
- [ ] Zoom/pan controls work

**Automated testing**: Create test suite that runs these checks automatically before deploying each phase.

---

#### **Risk: Breaking Existing Codex Functionality**
**Scenario**: Changes to Codex entry model could break wiki-link parsing, search, or entry display.

**Mitigation Strategy**:

**Testing Checklist for Codex**:
- [ ] Wiki-links parse correctly: `[[Name]]` becomes clickable
- [ ] Clicking wiki-link navigates to entry
- [ ] Search finds entries by title
- [ ] Entry view displays content correctly
- [ ] Images display (if present)
- [ ] Category filtering works
- [ ] Creating new entry works
- [ ] Editing entry saves changes

**Regression prevention**: Keep existing Codex components unchanged initially, only add new features incrementally.

---

### Risk Category 5: Scope Creep

#### **Risk: Integration Becomes Too Ambitious**
**Scenario**: During development, we think of cool features ("What if tree cards show mini-biographies?") and scope expands uncontrollably.

**Why this matters**: Extended development time, delayed completion, increased bug surface area.

**Mitigation Strategy**:

**Strict Phase Boundaries** (detailed below in implementation plan):
- Each phase has specific, limited deliverables
- No new features added mid-phase
- "Future enhancement" list kept separately
- Explicit approval required before expanding scope

**Example boundary**:
- Phase 1: Add navigation buttons ONLY (no preview text, no auto-sync, no advanced features)
- Don't add preview hover even if tempting
- Write it down as "Phase 3 enhancement" instead

---

## Three-Phase Implementation Plan

---

## **PHASE 1: Light Integration (Foundational Connections)**

**Timeline**: 2-3 development sessions
**Risk Level**: LOW (minimal changes to existing systems)
**Dependencies**: None (can start immediately)

### Goals
1. Create bidirectional navigation between systems
2. Auto-create skeleton Codex entries for new people
3. Add visual indicators showing when person has biography
4. Establish foundation for deeper integration

### Technical Changes Required

#### Session 1: Auto-Creation System

**Database Schema Update**:
```javascript
// Update Person schema (db.js)
people: '++id, firstName, lastName, houseId, codexEntryId'
//                                           ↑
//                              New field linking to Codex

// Update CodexEntry schema
codexEntries: '++id, title, category, personId'
//                                     ↑
//                         New field linking back to Person
```

**Service Layer Function**:
```javascript
// services/personService.js

async function createPerson(personData) {
  // 1. Create person record (as before)
  const personId = await db.people.add({
    firstName: personData.firstName,
    lastName: personData.lastName,
    // ... other fields ...
    codexEntryId: null  // Will be set in next step
  });
  
  // 2. Auto-create skeleton Codex entry
  const codexEntry = {
    title: `${personData.firstName} ${personData.lastName}`,
    category: 'Personages',
    content: '',  // Empty initially
    personId: personId,  // Link back to person
    createdAt: new Date().toISOString(),
    isAutoGenerated: true  // Flag for UI display
  };
  
  const entryId = await db.codexEntries.add(codexEntry);
  
  // 3. Link person to Codex entry
  await db.people.update(personId, { codexEntryId: entryId });
  
  return personId;
}
```

**Testing**:
- Create new person "Test Character"
- Verify Codex entry auto-created
- Verify both records have correct cross-references
- Delete person, verify Codex entry also deleted (cascade delete)

---

#### Session 2: Navigation Buttons

**Update Data Management Modal**:
```javascript
// components/PersonEditModal.jsx

function PersonEditModal({ person }) {
  const codexEntry = await db.codexEntries.get(person.codexEntryId);
  const hasBiography = codexEntry?.content?.length > 0;
  
  return (
    <div className="modal">
      <h2>Edit: {person.firstName} {person.lastName}</h2>
      
      {/* Existing form fields */}
      <input name="firstName" value={person.firstName} />
      {/* ... other fields ... */}
      
      {/* NEW: Biography navigation */}
      <div className="codex-link">
        {hasBiography ? (
          <button onClick={() => navigateToCodexEntry(person.codexEntryId)}>
            📖 View Full Biography
          </button>
        ) : (
          <button onClick={() => navigateToCodexEntry(person.codexEntryId)}>
            📝 Add Biography
          </button>
        )}
        <span className="hint">Write detailed lore in the Codex</span>
      </div>
    </div>
  );
}
```

**Update Codex Entry View**:
```javascript
// components/CodexEntryView.jsx

function CodexEntryView({ entry }) {
  // Check if this entry is linked to a person in family tree
  const linkedPerson = entry.personId 
    ? await db.people.get(entry.personId)
    : null;
  
  return (
    <div className="codex-entry">
      <h1>{entry.title}</h1>
      
      {linkedPerson && (
        <div className="genealogy-link">
          <div className="quick-facts">
            <h3>Genealogical Data</h3>
            <p>Born: {linkedPerson.dateOfBirth}</p>
            <p>House: {linkedPerson.houseName}</p>
            {/* Display other quick facts */}
          </div>
          
          <button onClick={() => navigateToFamilyTree(linkedPerson.id)}>
            🌳 View in Family Tree
          </button>
        </div>
      )}
      
      {/* Existing Codex content display */}
      <div className="biography">
        {entry.content}
      </div>
    </div>
  );
}
```

**Styling**:
```css
/* styles/integration.css */

.codex-link {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--parchment-light);
  border: 1px dashed var(--medieval-accent);
  border-radius: 4px;
}

.codex-link button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-medieval);
}

.codex-link .hint {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
}
```

**Testing**:
- Open person in data management
- Click "View Biography" → Should navigate to Codex entry
- In Codex entry, click "View in Family Tree" → Should highlight person in tree
- Test with person who has no biography content yet (button text should change)

---

#### Session 3: Visual Indicators & Polish

**Add Status Badge to Person Cards**:
```javascript
// components/PersonCard.jsx

function PersonCard({ person }) {
  const hasBiography = person.codexEntryId && 
    await checkIfCodexEntryHasContent(person.codexEntryId);
  
  return (
    <div className="person-card">
      <div className="card-header">
        <h3>{person.firstName} {person.lastName}</h3>
        
        {/* NEW: Biography indicator */}
        {hasBiography && (
          <span className="badge biography-badge" title="Has full biography">
            📖
          </span>
        )}
      </div>
      
      {/* Rest of card content */}
    </div>
  );
}
```

**Update Codex Landing Page**:
```javascript
// Show count of personages with/without biographies
function CodexLandingPage() {
  const stats = await calculatePersonageStats();
  
  return (
    <div className="codex-landing">
      <div className="category-card" data-category="Personages">
        <h2>Personages</h2>
        <div className="stats">
          <p>{stats.total} total characters</p>
          <p>{stats.withBiography} with biographies</p>
          <p className="incomplete">{stats.withoutBiography} incomplete</p>
        </div>
      </div>
      {/* Other categories */}
    </div>
  );
}
```

**Testing**:
- View family tree with mix of people (some with biographies, some without)
- Verify badge shows only for those with content
- Verify Codex landing shows accurate counts
- Test hover tooltips

---

### Phase 1 Deliverables Checklist

- [ ] New person auto-creates Codex entry
- [ ] Database schema updated with cross-references
- [ ] "View Biography" button in data management
- [ ] "View in Family Tree" button in Codex entries
- [ ] Biography indicator badge on person cards
- [ ] Stats on Codex landing page
- [ ] Cascade delete (deleting person removes Codex entry)
- [ ] All existing tree functionality still works
- [ ] All existing Codex functionality still works
- [ ] Documentation updated with new workflow

### Success Criteria
✅ User can create person in tree and immediately navigate to write biography
✅ User can browse Codex and jump to family tree context
✅ No duplicate data entry required
✅ No performance degradation in tree or Codex views

---

## **PHASE 2: Data Unification (Structural Integration)**

**Timeline**: 4-5 development sessions
**Risk Level**: MEDIUM (significant schema changes)
**Dependencies**: Phase 1 complete and tested
**Prerequisite**: Backup database before starting

### Goals
1. Merge Person and CodexEntry data models into unified structure
2. Implement bidirectional synchronization
3. Migrate existing data to new schema
4. Ensure single source of truth for all person data

### Why Phase 2 Is More Complex

Currently, even with Phase 1 navigation, data still exists in two places:
```
Person table:               CodexEntry table:
- firstName: "Aldric"       - title: "Aldric Wilfrey"
- lastName: "Wilfrey"       - content: "Biography text..."
- dateOfBirth: "1245"       - category: "Personages"

Problem: Title duplicates name, must keep in sync manually
```

After Phase 2, single source:
```
Person table (unified):
- firstName: "Aldric"
- lastName: "Wilfrey"
- dateOfBirth: "1245"
- codexContent: {
    biography: "Biography text...",
    imageUrl: "/portraits/aldric.jpg",
    customSections: { ... }
  }

CodexEntry table becomes a VIEW (not separate data):
- Dynamically generated from Person table for UI purposes
```

---

### Technical Changes Required

#### Session 1: Schema Design & Planning

**New Unified Person Schema**:
```javascript
// db.js - Version 3 upgrade

db.version(3).stores({
  people: '++id, firstName, lastName, [firstName+lastName], houseId, category',
  // Removed: codexEntryId (no longer needed)
  
  // CodexEntry becomes more generic (not just people)
  codexEntries: '++id, title, category, referenceType, referenceId',
  //                                     ↑           ↑
  //              Can reference people, places, events, etc.
}).upgrade(tx => {
  // Migration logic (detailed in Session 2)
  return migrateToUnifiedSchema(tx);
});
```

**Extended Person Fields**:
```javascript
// Enhanced Person object structure
{
  // Core genealogical data (existing)
  id: "person-123",
  firstName: "Aldric",
  lastName: "Wilfrey",
  dateOfBirth: "1245",
  dateOfDeath: "1289",
  gender: "male",
  houseId: "house-wilfrey",
  legitimacyStatus: "legitimate",
  
  // NEW: Codex content embedded in Person record
  codexContent: {
    biography: "Aldric Wilfrey was a fierce warrior...",
    portraitUrl: "/images/aldric-wilfrey.jpg",
    
    // Rich text content
    characterTraits: "Brave, tactical genius, hot-tempered",
    physicalDescription: "Tall with dark hair...",
    
    // Wiki-link tracking
    linkedEntries: [
      { type: "event", id: "battle-thornmarch" },
      { type: "location", id: "wilfrey-castle" }
    ],
    
    // Custom sections (flexible JSON)
    customSections: {
      "Military Career": "Served as...",
      "Personal Life": "Married to..."
    }
  },
  
  // Metadata
  category: "Personages",  // For Codex categorization
  hasCompleteBiography: true,  // Flag for UI
  lastModified: "2024-12-15T10:30:00Z"
}
```

**Planning Document** (create during Session 1):
- Map all existing Person fields → unified schema
- Map all existing CodexEntry fields → unified schema
- Identify fields that will be deprecated
- Design migration strategy for existing data
- Create test cases for edge cases

---

#### Session 2: Database Migration Script

**Migration Strategy**:
```javascript
// migrations/migrateToUnifiedSchema.js

async function migrateToUnifiedSchema(tx) {
  console.log("Starting schema migration to unified Person model...");
  
  // STEP 1: Backup existing data
  const existingPeople = await tx.people.toArray();
  const existingEntries = await tx.codexEntries.toArray();
  
  // Store backup in localStorage as safety measure
  localStorage.setItem('migration_backup_people', JSON.stringify(existingPeople));
  localStorage.setItem('migration_backup_entries', JSON.stringify(existingEntries));
  
  // STEP 2: Find matching pairs (Person + CodexEntry)
  const mergeOperations = [];
  
  for (const person of existingPeople) {
    const matchingEntry = existingEntries.find(entry => 
      entry.personId === person.id ||
      entry.title === `${person.firstName} ${person.lastName}`
    );
    
    mergeOperations.push({
      person: person,
      codexEntry: matchingEntry || null,
      action: matchingEntry ? 'MERGE' : 'CREATE_SKELETON'
    });
  }
  
  // STEP 3: Preview changes to user
  console.table(mergeOperations.map(op => ({
    name: `${op.person.firstName} ${op.person.lastName}`,
    action: op.action,
    hasExistingBio: op.codexEntry?.content ? 'Yes' : 'No'
  })));
  
  // STEP 4: User confirmation required
  const confirmed = await showMigrationConfirmationDialog(mergeOperations);
  if (!confirmed) {
    console.log("Migration cancelled by user");
    return;
  }
  
  // STEP 5: Execute merge operations
  for (const op of mergeOperations) {
    const unifiedPerson = {
      ...op.person,  // Keep all existing person data
      
      codexContent: op.codexEntry ? {
        biography: op.codexEntry.content || '',
        portraitUrl: op.codexEntry.imageUrl || null,
        linkedEntries: parseWikiLinks(op.codexEntry.content),
        customSections: op.codexEntry.customSections || {}
      } : {
        // Skeleton content for people without Codex entry
        biography: '',
        portraitUrl: null,
        linkedEntries: [],
        customSections: {}
      },
      
      category: 'Personages',
      hasCompleteBiography: !!(op.codexEntry?.content),
      lastModified: new Date().toISOString()
    };
    
    await tx.people.put(unifiedPerson);
  }
  
  // STEP 6: Clean up orphaned Codex entries
  const personCodexIds = existingPeople.map(p => p.codexEntryId).filter(Boolean);
  const orphanedEntries = existingEntries.filter(entry => 
    entry.category === 'Personages' && !personCodexIds.includes(entry.id)
  );
  
  if (orphanedEntries.length > 0) {
    console.warn(`Found ${orphanedEntries.length} orphaned Codex entries. Review manually.`);
    // Don't auto-delete - let user review
  }
  
  console.log("Migration complete! ✅");
  console.log(`Merged ${mergeOperations.length} people.`);
}
```

**Migration UI Component**:
```javascript
// components/MigrationDialog.jsx

function MigrationConfirmationDialog({ operations }) {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <div className="migration-dialog">
      <h2>⚠️ Database Migration Required</h2>
      
      <div className="summary">
        <p>Lineageweaver is upgrading to unified Person architecture.</p>
        <ul>
          <li>{operations.filter(op => op.action === 'MERGE').length} people will merge with existing biographies</li>
          <li>{operations.filter(op => op.action === 'CREATE_SKELETON').length} people will get new biography shells</li>
          <li>Backup created automatically</li>
        </ul>
      </div>
      
      <button onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? 'Hide' : 'Show'} Details
      </button>
      
      {showDetails && (
        <table className="migration-preview">
          <thead>
            <tr>
              <th>Character Name</th>
              <th>Action</th>
              <th>Existing Biography</th>
            </tr>
          </thead>
          <tbody>
            {operations.map(op => (
              <tr key={op.person.id}>
                <td>{op.person.firstName} {op.person.lastName}</td>
                <td>{op.action}</td>
                <td>{op.codexEntry?.content ? '✅ Yes' : '❌ No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      
      <div className="actions">
        <button onClick={handleCancel}>Cancel</button>
        <button onClick={handleProceed} className="primary">
          Proceed with Migration
        </button>
      </div>
    </div>
  );
}
```

**Testing**:
- Run migration on test database with sample data
- Verify all people retain genealogical data
- Verify all biographies preserved
- Verify no data loss
- Test rollback procedure (restore from backup)

---

#### Session 3: Update Service Layer

**Unified Person Service**:
```javascript
// services/personService.js (updated)

// CREATE: Now handles both genealogy and biography in one operation
async function createPerson(personData) {
  const person = {
    // Genealogical fields
    firstName: personData.firstName,
    lastName: personData.lastName,
    dateOfBirth: personData.dateOfBirth,
    houseId: personData.houseId,
    // ... other genealogy fields ...
    
    // Codex fields (embedded)
    codexContent: {
      biography: personData.biography || '',  // Can be provided or empty
      portraitUrl: personData.portraitUrl || null,
      linkedEntries: [],
      customSections: {}
    },
    
    category: 'Personages',
    hasCompleteBiography: !!personData.biography,
    lastModified: new Date().toISOString()
  };
  
  return await db.people.add(person);
}

// UPDATE: Single function handles both types of edits
async function updatePerson(personId, updates) {
  const person = await db.people.get(personId);
  
  // Genealogical updates (dates, names, house)
  if (updates.genealogy) {
    Object.assign(person, updates.genealogy);
  }
  
  // Biography updates (Codex content)
  if (updates.codexContent) {
    Object.assign(person.codexContent, updates.codexContent);
    person.hasCompleteBiography = !!person.codexContent.biography;
  }
  
  person.lastModified = new Date().toISOString();
  
  return await db.people.put(person);
}

// READ: Can fetch full record or just genealogy fields
async function getPerson(personId, options = {}) {
  const person = await db.people.get(personId);
  
  if (options.genealogyOnly) {
    // For tree view - omit heavy Codex content
    const { codexContent, ...genealogy } = person;
    return genealogy;
  }
  
  return person;  // Full record including biography
}
```

**Codex Entry Service** (now generates from Person data):
```javascript
// services/codexService.js (updated)

// GET: Dynamically generates CodexEntry from Person record
async function getCodexEntryForPerson(personId) {
  const person = await db.people.get(personId);
  
  // Transform Person record into CodexEntry format for UI
  return {
    id: `person-${person.id}`,  // Virtual entry ID
    title: `${person.firstName} ${person.lastName}`,
    category: 'Personages',
    content: person.codexContent.biography,
    imageUrl: person.codexContent.portraitUrl,
    
    // Include genealogical context
    metadata: {
      dateOfBirth: person.dateOfBirth,
      dateOfDeath: person.dateOfDeath,
      house: await db.houses.get(person.houseId),
      relationships: await getPersonRelationships(person.id)
    }
  };
}

// SEARCH: Now searches Person table for Personages category
async function searchCodexEntries(query) {
  // Search people
  const peopleResults = await db.people
    .filter(person => 
      person.firstName.toLowerCase().includes(query.toLowerCase()) ||
      person.lastName.toLowerCase().includes(query.toLowerCase()) ||
      person.codexContent.biography.toLowerCase().includes(query.toLowerCase())
    )
    .toArray();
  
  // Search other Codex entries (events, locations, etc.)
  const otherResults = await db.codexEntries
    .filter(entry => 
      entry.category !== 'Personages' &&
      (entry.title.toLowerCase().includes(query.toLowerCase()) ||
       entry.content.toLowerCase().includes(query.toLowerCase()))
    )
    .toArray();
  
  return [...peopleResults, ...otherResults];
}
```

**Testing**:
- Create new person with biography → Verify single record created
- Update person's genealogy → Verify biography unchanged
- Update person's biography → Verify genealogy unchanged
- Update both simultaneously → Verify both save correctly
- Delete person → Verify completely removed

---

#### Session 4: Update UI Components

**Data Management Modal** (simplified - single save operation):
```javascript
// components/PersonEditModal.jsx (updated)

function PersonEditModal({ personId, onSave }) {
  const person = await db.people.get(personId);
  const [formData, setFormData] = useState({
    // Genealogical fields
    firstName: person.firstName,
    lastName: person.lastName,
    dateOfBirth: person.dateOfBirth,
    // ... other fields ...
    
    // Biography field (optional)
    biography: person.codexContent.biography
  });
  
  async function handleSave() {
    await updatePerson(personId, {
      genealogy: {
        firstName: formData.firstName,
        lastName: formData.lastName,
        dateOfBirth: formData.dateOfBirth,
        // ... other genealogy fields ...
      },
      codexContent: {
        biography: formData.biography  // Updated in same operation
      }
    });
    
    onSave();
  }
  
  return (
    <form onSubmit={handleSave}>
      {/* Genealogical fields */}
      <input 
        name="firstName" 
        value={formData.firstName}
        onChange={e => setFormData({...formData, firstName: e.target.value})}
      />
      {/* ... other genealogy fields ... */}
      
      {/* Biography field (collapsible section) */}
      <details>
        <summary>📖 Biography (Optional)</summary>
        <textarea
          name="biography"
          value={formData.biography}
          onChange={e => setFormData({...formData, biography: e.target.value})}
          placeholder="Write character biography here..."
          rows={5}
        />
        <p className="hint">
          For detailed lore, click "View Full Biography" button.
        </p>
      </details>
      
      <button type="submit">Save Changes</button>
      <button onClick={() => navigateToCodexEntry(personId)}>
        View Full Biography →
      </button>
    </form>
  );
}
```

**Codex Entry View** (now pulls from Person table):
```javascript
// components/CodexEntryView.jsx (updated)

function CodexEntryView({ personId }) {
  const person = await db.people.get(personId);
  const house = await db.houses.get(person.houseId);
  const relationships = await getPersonRelationships(personId);
  
  return (
    <div className="codex-entry personage">
      <header>
        <h1>{person.firstName} {person.lastName}</h1>
        
        {/* Quick facts from genealogical data */}
        <div className="quick-facts">
          <div className="fact">
            <span className="label">Born:</span>
            <span className="value">{person.dateOfBirth || 'Unknown'}</span>
          </div>
          <div className="fact">
            <span className="label">Died:</span>
            <span className="value">{person.dateOfDeath || 'Living'}</span>
          </div>
          <div className="fact">
            <span className="label">House:</span>
            <span className="value">{house.houseName}</span>
          </div>
        </div>
        
        {/* Link to family tree */}
        <button onClick={() => navigateToFamilyTree(personId)}>
          🌳 View in Family Tree
        </button>
      </header>
      
      {/* Portrait */}
      {person.codexContent.portraitUrl && (
        <img 
          src={person.codexContent.portraitUrl} 
          alt={`${person.firstName} ${person.lastName}`}
          className="portrait"
        />
      )}
      
      {/* Biography */}
      <section className="biography">
        <h2>Biography</h2>
        {person.codexContent.biography ? (
          <div className="content">
            {parseWikiLinks(person.codexContent.biography)}
          </div>
        ) : (
          <p className="placeholder">
            No biography written yet. 
            <button onClick={handleEditBiography}>Add Biography</button>
          </p>
        )}
      </section>
      
      {/* Family relationships */}
      <section className="relationships">
        <h2>Family</h2>
        <ul>
          {relationships.parents.map(parent => (
            <li key={parent.id}>
              <strong>Parent:</strong> 
              <a href={`/codex/person/${parent.id}`}>
                {parent.firstName} {parent.lastName}
              </a>
            </li>
          ))}
          {relationships.children.map(child => (
            <li key={child.id}>
              <strong>Child:</strong>
              <a href={`/codex/person/${child.id}`}>
                {child.firstName} {child.lastName}
              </a>
            </li>
          ))}
        </ul>
      </section>
      
      {/* Custom sections */}
      {Object.keys(person.codexContent.customSections).length > 0 && (
        <section className="custom-sections">
          {Object.entries(person.codexContent.customSections).map(([title, content]) => (
            <div key={title}>
              <h2>{title}</h2>
              <div className="content">{parseWikiLinks(content)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
```

**Testing**:
- View person in data management → All genealogy fields display correctly
- View person in Codex → Biography displays correctly
- Edit genealogy in modal → Changes save, Codex view updates
- Edit biography in Codex → Changes save, tree view updates
- Verify no duplicate saves or race conditions

---

#### Session 5: Testing & Validation

**Comprehensive Test Suite**:
```javascript
// tests/integration.test.js

describe('Unified Person Architecture', () => {
  test('Creating person creates single record', async () => {
    const id = await createPerson({
      firstName: 'Test',
      lastName: 'Character',
      dateOfBirth: '1250'
    });
    
    const person = await db.people.get(id);
    expect(person).toBeDefined();
    expect(person.codexContent).toBeDefined();
    expect(person.category).toBe('Personages');
  });
  
  test('Updating genealogy preserves biography', async () => {
    const id = await createPerson({ firstName: 'Test', lastName: 'User' });
    
    // Add biography
    await updatePerson(id, {
      codexContent: { biography: 'Original biography text' }
    });
    
    // Update genealogy
    await updatePerson(id, {
      genealogy: { dateOfBirth: '1260' }
    });
    
    const person = await db.people.get(id);
    expect(person.dateOfBirth).toBe('1260');
    expect(person.codexContent.biography).toBe('Original biography text');
  });
  
  test('Search finds people by name and biography', async () => {
    await createPerson({
      firstName: 'Aldric',
      lastName: 'Wilfrey',
      biography: 'Warrior who defended Thornmarch'
    });
    
    const results = await searchCodexEntries('thornmarch');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].firstName).toBe('Aldric');
  });
  
  // ... more tests ...
});
```

**Manual Testing Checklist**:
- [ ] Create 5 new people with various data combinations
- [ ] Edit each person (genealogy and biography separately)
- [ ] Delete a person (verify complete removal)
- [ ] Search for people by name
- [ ] Search for people by biography content
- [ ] Navigate between tree view and Codex view
- [ ] Verify family relationships display correctly in Codex
- [ ] Export database, reimport, verify data integrity
- [ ] Test with 50+ people (performance check)
- [ ] Test edge cases (empty fields, special characters, very long biographies)

---

### Phase 2 Deliverables Checklist

- [ ] Unified Person schema implemented
- [ ] Migration script tested and documented
- [ ] All existing data migrated successfully
- [ ] Backup and rollback procedures established
- [ ] Service layer updated for unified operations
- [ ] Data management modal handles both genealogy and biography
- [ ] Codex entry view pulls from Person table
- [ ] Search works across unified data
- [ ] No duplicate data (single source of truth achieved)
- [ ] Performance metrics meet targets (<500ms queries)
- [ ] All tests passing
- [ ] Documentation updated

### Success Criteria
✅ All person data stored in single location
✅ Editing in one place updates all views automatically
✅ No data duplication or synchronization issues
✅ Migration completed without data loss
✅ Performance maintained or improved

---

## **PHASE 3: Enhanced Integration (Advanced Features)**

**Timeline**: 4-6 development sessions
**Risk Level**: LOW to MEDIUM (building on solid foundation)
**Dependencies**: Phases 1 & 2 complete and stable
**Optional**: Can be implemented incrementally based on user needs

### Goals
1. Rich preview capabilities (hover to see biography snippets)
2. Advanced knowledge graph visualization
3. Automatic relationship detection in biographies
4. Enhanced search with faceted filtering
5. Timeline integration (showing events on person's life timeline)

---

### Session 1: Biography Preview on Hover

**Feature**: When hovering over person card in tree view, show preview of biography.

**Implementation**:
```javascript
// components/PersonCard.jsx (enhanced)

function PersonCard({ person }) {
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState(null);
  
  async function loadPreview() {
    if (!preview && person.codexContent.biography) {
      // Extract first 100 characters
      const text = person.codexContent.biography.substring(0, 100) + '...';
      setPreview(text);
    }
    setShowPreview(true);
  }
  
  return (
    <div 
      className="person-card"
      onMouseEnter={loadPreview}
      onMouseLeave={() => setShowPreview(false)}
    >
      <h3>{person.firstName} {person.lastName}</h3>
      <p>b. {person.dateOfBirth}</p>
      
      {showPreview && preview && (
        <div className="biography-preview">
          <p>{preview}</p>
          <button onClick={() => navigateToCodexEntry(person.id)}>
            Read More →
          </button>
        </div>
      )}
    </div>
  );
}
```

**Styling**:
```css
.biography-preview {
  position: absolute;
  z-index: 100;
  max-width: 300px;
  padding: 1rem;
  background: var(--parchment-dark);
  border: 2px solid var(--medieval-accent);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  
  /* Position below card */
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
}

.biography-preview p {
  font-size: 0.9rem;
  line-height: 1.4;
  margin-bottom: 0.5rem;
}
```

**Performance Optimization**:
- Load previews lazily (only when hovering)
- Cache previews to avoid repeated fetches
- Limit preview to 100 characters to keep tooltips fast

**Testing**:
- Hover over person with biography → Preview appears
- Hover over person without biography → No preview
- Rapid hover over multiple people → No performance lag
- Click "Read More" → Navigates to Codex entry

---

### Session 2: Automatic Wiki-Link Detection

**Feature**: When writing biography, automatically suggest wiki-links for mentioned people/places.

**Implementation**:
```javascript
// utils/wikiLinkSuggestions.js

async function detectPotentialLinks(text) {
  // Find all capitalized phrases (potential names)
  const namePattern = /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g;
  const matches = [...text.matchAll(namePattern)];
  
  const suggestions = [];
  
  for (const match of matches) {
    const potentialName = match[1];
    
    // Check if matches existing person
    const [firstName, lastName] = potentialName.split(' ');
    const person = await db.people
      .where('[firstName+lastName]')
      .equals([firstName, lastName])
      .first();
    
    if (person) {
      suggestions.push({
        text: potentialName,
        targetId: person.id,
        targetType: 'person',
        confidence: 'high'
      });
    }
    
    // Check if matches existing location
    const location = await db.codexEntries
      .where('category').equals('Locations')
      .and(entry => entry.title === potentialName)
      .first();
    
    if (location) {
      suggestions.push({
        text: potentialName,
        targetId: location.id,
        targetType: 'location',
        confidence: 'high'
      });
    }
  }
  
  return suggestions;
}
```

**Biography Editor Component**:
```javascript
// components/BiographyEditor.jsx

function BiographyEditor({ personId }) {
  const [biography, setBiography] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  
  async function handleTextChange(newText) {
    setBiography(newText);
    
    // Debounce link detection (wait 500ms after typing stops)
    clearTimeout(window.linkDetectionTimeout);
    window.linkDetectionTimeout = setTimeout(async () => {
      const detected = await detectPotentialLinks(newText);
      setSuggestions(detected);
    }, 500);
  }
  
  function applyWikiLink(suggestion) {
    // Replace text with wiki-link syntax
    const linkedText = biography.replace(
      suggestion.text,
      `[[${suggestion.text}]]`
    );
    setBiography(linkedText);
    
    // Remove from suggestions
    setSuggestions(suggestions.filter(s => s !== suggestion));
  }
  
  return (
    <div className="biography-editor">
      <textarea
        value={biography}
        onChange={e => handleTextChange(e.target.value)}
        placeholder="Write biography here..."
      />
      
      {suggestions.length > 0 && (
        <div className="link-suggestions">
          <h4>Suggested Links:</h4>
          <ul>
            {suggestions.map(suggestion => (
              <li key={suggestion.text}>
                <span className="suggestion-text">"{suggestion.text}"</span>
                <span className="suggestion-type">({suggestion.targetType})</span>
                <button onClick={() => applyWikiLink(suggestion)}>
                  Add Link
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Testing**:
- Type "Aldric Wilfrey" in biography → Suggestion appears
- Click "Add Link" → Text becomes `[[Aldric Wilfrey]]`
- Type non-existent name → No suggestion
- Type existing location name → Location suggestion appears

---

### Session 3: Knowledge Graph Visualization

**Feature**: Visual map showing how people, places, and events connect through wiki-links.

**Implementation** (using D3.js force-directed graph):
```javascript
// components/KnowledgeGraphView.jsx

function KnowledgeGraphView({ personId }) {
  const graphRef = useRef();
  
  useEffect(() => {
    buildGraph();
  }, [personId]);
  
  async function buildGraph() {
    // Fetch person and all linked entries
    const person = await db.people.get(personId);
    const linkedEntries = await fetchLinkedEntries(person.codexContent.linkedEntries);
    
    // Build node/link data structure for D3
    const nodes = [
      { id: person.id, name: `${person.firstName} ${person.lastName}`, type: 'person' },
      ...linkedEntries.map(entry => ({
        id: entry.id,
        name: entry.title,
        type: entry.category.toLowerCase()
      }))
    ];
    
    const links = person.codexContent.linkedEntries.map(link => ({
      source: person.id,
      target: link.id
    }));
    
    // Render force-directed graph
    const svg = d3.select(graphRef.current);
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(400, 300));
    
    // Draw nodes
    const node = svg.selectAll('.node')
      .data(nodes)
      .enter().append('circle')
      .attr('class', d => `node ${d.type}`)
      .attr('r', 10)
      .call(d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded));
    
    // Draw links
    const link = svg.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link');
    
    // Update positions on each tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
    });
  }
  
  return (
    <div className="knowledge-graph">
      <h2>Connected Entries</h2>
      <svg ref={graphRef} width={800} height={600}></svg>
    </div>
  );
}
```

**Styling**:
```css
.knowledge-graph .node.person {
  fill: var(--color-person);
  stroke: var(--medieval-accent);
  stroke-width: 2px;
}

.knowledge-graph .node.location {
  fill: var(--color-location);
}

.knowledge-graph .node.event {
  fill: var(--color-event);
}

.knowledge-graph .link {
  stroke: var(--text-muted);
  stroke-width: 1px;
  stroke-opacity: 0.6;
}
```

**Testing**:
- View person with multiple links → Graph displays correctly
- Drag nodes → Graph repositions dynamically
- Click node → Navigate to that entry
- View person with no links → Shows empty state message

---

### Session 4: Advanced Search with Facets

**Feature**: Filter search results by category, date range, house, etc.

**Implementation**:
```javascript
// components/AdvancedSearch.jsx

function AdvancedSearch() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    categories: ['Personages', 'Locations', 'Events'],
    houses: [],
    dateRange: { start: null, end: null },
    hasContent: 'any'  // 'any' | 'complete' | 'incomplete'
  });
  const [results, setResults] = useState([]);
  
  async function search() {
    // Search people
    let peopleResults = await db.people
      .filter(person => {
        // Text match
        const textMatch = 
          person.firstName.toLowerCase().includes(query.toLowerCase()) ||
          person.lastName.toLowerCase().includes(query.toLowerCase()) ||
          (person.codexContent.biography || '').toLowerCase().includes(query.toLowerCase());
        
        if (!textMatch) return false;
        
        // Category filter
        if (!filters.categories.includes('Personages')) return false;
        
        // House filter
        if (filters.houses.length > 0 && !filters.houses.includes(person.houseId)) {
          return false;
        }
        
        // Date range filter
        if (filters.dateRange.start && person.dateOfBirth < filters.dateRange.start) {
          return false;
        }
        if (filters.dateRange.end && person.dateOfBirth > filters.dateRange.end) {
          return false;
        }
        
        // Content completeness filter
        if (filters.hasContent === 'complete' && !person.hasCompleteBiography) {
          return false;
        }
        if (filters.hasContent === 'incomplete' && person.hasCompleteBiography) {
          return false;
        }
        
        return true;
      })
      .toArray();
    
    // Search other Codex entries (events, locations, etc.)
    let otherResults = await db.codexEntries
      .filter(entry => {
        if (!filters.categories.includes(entry.category)) return false;
        
        return entry.title.toLowerCase().includes(query.toLowerCase()) ||
               (entry.content || '').toLowerCase().includes(query.toLowerCase());
      })
      .toArray();
    
    setResults([...peopleResults, ...otherResults]);
  }
  
  return (
    <div className="advanced-search">
      <div className="search-bar">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search all entries..."
        />
        <button onClick={search}>Search</button>
      </div>
      
      <div className="filters">
        <div className="filter-group">
          <h3>Categories</h3>
          <label>
            <input
              type="checkbox"
              checked={filters.categories.includes('Personages')}
              onChange={e => toggleCategory('Personages')}
            />
            Personages
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.categories.includes('Locations')}
              onChange={e => toggleCategory('Locations')}
            />
            Locations
          </label>
          {/* ... more categories ... */}
        </div>
        
        <div className="filter-group">
          <h3>Houses</h3>
          {/* House checkboxes */}
        </div>
        
        <div className="filter-group">
          <h3>Biography Status</h3>
          <select
            value={filters.hasContent}
            onChange={e => setFilters({...filters, hasContent: e.target.value})}
          >
            <option value="any">Any</option>
            <option value="complete">Complete biographies only</option>
            <option value="incomplete">Incomplete biographies only</option>
          </select>
        </div>
      </div>
      
      <div className="results">
        <p>{results.length} results found</p>
        <ul>
          {results.map(result => (
            <li key={result.id}>
              <a href={`/codex/${result.id}`}>
                {result.firstName ? `${result.firstName} ${result.lastName}` : result.title}
              </a>
              <span className="category">{result.category || 'Personages'}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**Testing**:
- Search for text → Results filter correctly
- Toggle categories → Results update
- Filter by house → Only shows people from selected houses
- Filter by content status → Shows complete/incomplete correctly
- Combine multiple filters → All filters apply simultaneously

---

### Session 5: Timeline Integration

**Feature**: Show person's life events on visual timeline, including related historical events.

**Implementation**:
```javascript
// components/PersonTimeline.jsx

function PersonTimeline({ personId }) {
  const [timeline, setTimeline] = useState([]);
  
  useEffect(() => {
    buildTimeline();
  }, [personId]);
  
  async function buildTimeline() {
    const person = await db.people.get(personId);
    
    // Personal life events
    const events = [
      { year: person.dateOfBirth, label: 'Born', type: 'personal' }
    ];
    
    if (person.dateOfDeath) {
      events.push({ year: person.dateOfDeath, label: 'Died', type: 'personal' });
    }
    
    // Extract events from biography using regex
    const eventPattern = /In (\d{4}), ([^.]+)\./g;
    const matches = [...(person.codexContent.biography || '').matchAll(eventPattern)];
    
    for (const match of matches) {
      events.push({
        year: match[1],
        label: match[2],
        type: 'biographical'
      });
    }
    
    // Find related historical events (from Codex Events category)
    const historicalEvents = await db.codexEntries
      .where('category').equals('Events')
      .filter(event => {
        // Check if event overlaps with person's lifetime
        const eventYear = extractYearFromEvent(event);
        return eventYear >= person.dateOfBirth && 
               (!person.dateOfDeath || eventYear <= person.dateOfDeath);
      })
      .toArray();
    
    for (const event of historicalEvents) {
      events.push({
        year: extractYearFromEvent(event),
        label: event.title,
        type: 'historical',
        linkTo: event.id
      });
    }
    
    // Sort chronologically
    events.sort((a, b) => parseInt(a.year) - parseInt(b.year));
    
    setTimeline(events);
  }
  
  return (
    <div className="person-timeline">
      <h2>Timeline</h2>
      <div className="timeline-container">
        {timeline.map(event => (
          <div key={`${event.year}-${event.label}`} className={`timeline-event ${event.type}`}>
            <div className="year">{event.year}</div>
            <div className="event-marker"></div>
            <div className="event-content">
              {event.linkTo ? (
                <a href={`/codex/${event.linkTo}`}>{event.label}</a>
              ) : (
                <span>{event.label}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Styling**:
```css
.person-timeline {
  margin-top: 2rem;
}

.timeline-container {
  position: relative;
  padding-left: 3rem;
}

.timeline-container::before {
  /* Vertical line */
  content: '';
  position: absolute;
  left: 1rem;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--medieval-accent);
}

.timeline-event {
  position: relative;
  margin-bottom: 1.5rem;
}

.timeline-event .year {
  position: absolute;
  left: -3rem;
  font-weight: bold;
  color: var(--text-muted);
}

.timeline-event .event-marker {
  position: absolute;
  left: -3.5rem;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-primary);
  border: 2px solid var(--parchment-dark);
}

.timeline-event.personal .event-marker {
  background: var(--color-accent);
}

.timeline-event.historical .event-marker {
  background: var(--color-muted);
}
```

**Testing**:
- View person with birth/death dates → Timeline shows correctly
- View person with events in biography → Events extracted and displayed
- View person during historical event → Historical events appear
- Click historical event → Navigates to event entry

---

### Session 6: Quality of Life Improvements

**Batch operations**:
```javascript
// Bulk biography import
async function importBiographiesFromJSON(jsonFile) {
  const data = JSON.parse(jsonFile);
  
  for (const entry of data) {
    const person = await db.people
      .where('[firstName+lastName]')
      .equals([entry.firstName, entry.lastName])
      .first();
    
    if (person) {
      await updatePerson(person.id, {
        codexContent: {
          biography: entry.biography,
          portraitUrl: entry.portraitUrl,
          customSections: entry.customSections
        }
      });
    }
  }
}
```

**Export enhancements**:
```javascript
// Export people with biographies as formatted document
async function exportToMarkdown() {
  const people = await db.people.toArray();
  
  let markdown = '# Lineageweaver Character Codex\n\n';
  
  for (const person of people) {
    markdown += `## ${person.firstName} ${person.lastName}\n\n`;
    markdown += `**Born:** ${person.dateOfBirth}\n`;
    if (person.dateOfDeath) {
      markdown += `**Died:** ${person.dateOfDeath}\n`;
    }
    markdown += `**House:** ${(await db.houses.get(person.houseId)).houseName}\n\n`;
    
    if (person.codexContent.biography) {
      markdown += `${person.codexContent.biography}\n\n`;
    }
    
    markdown += '---\n\n';
  }
  
  // Trigger download
  downloadFile('lineageweaver-codex.md', markdown);
}
```

**Statistics dashboard**:
```javascript
function CodexStatsDashboard() {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    calculateStats();
  }, []);
  
  async function calculateStats() {
    const people = await db.people.toArray();
    
    setStats({
      totalCharacters: people.length,
      withBiographies: people.filter(p => p.hasCompleteBiography).length,
      withoutBiographies: people.filter(p => !p.hasCompleteBiography).length,
      averageBiographyLength: calculateAverageBiographyLength(people),
      mostLinkedCharacter: findMostLinkedCharacter(people),
      totalWikiLinks: countTotalWikiLinks(people)
    });
  }
  
  return (
    <div className="stats-dashboard">
      <h2>Codex Statistics</h2>
      <div className="stat-grid">
        <div className="stat">
          <span className="stat-value">{stats?.totalCharacters}</span>
          <span className="stat-label">Total Characters</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats?.withBiographies}</span>
          <span className="stat-label">Complete Biographies</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats?.withoutBiographies}</span>
          <span className="stat-label">Incomplete Biographies</span>
        </div>
        <div className="stat">
          <span className="stat-value">{stats?.totalWikiLinks}</span>
          <span className="stat-label">Total Wiki Links</span>
        </div>
      </div>
    </div>
  );
}
```

---

### Phase 3 Deliverables Checklist

- [ ] Biography preview on hover implemented
- [ ] Automatic wiki-link suggestions working
- [ ] Knowledge graph visualization functional
- [ ] Advanced search with faceted filtering
- [ ] Timeline integration showing life events
- [ ] Batch import/export capabilities
- [ ] Statistics dashboard
- [ ] Performance optimized (all features <500ms response)
- [ ] Mobile-responsive design tested
- [ ] Documentation for all new features

### Success Criteria
✅ Users can quickly preview biographies without clicking
✅ Wiki-link creation is faster and more accurate
✅ Knowledge graph provides visual understanding of connections
✅ Search is powerful and flexible
✅ Timeline enriches character understanding
✅ No performance degradation with advanced features

---

## Implementation Timeline Summary

### Total Estimated Timeline: 10-15 Sessions

**Phase 1**: Sessions 1-3 (Foundation)
- Week 1: Auto-creation + navigation buttons
- Deliverable: Basic integration working

**Phase 2**: Sessions 4-8 (Core Integration)
- Week 2-3: Schema migration + unified data model
- Deliverable: Single source of truth established

**Phase 3**: Sessions 9-15 (Enhancement)
- Week 4-6: Advanced features (can be implemented incrementally)
- Deliverable: Full-featured integrated system

---

## Risk Mitigation Summary

### How We're Protecting Against Negative Outcomes

**1. Incremental Rollout**
- Each phase is independently valuable
- Can stop at any phase without leaving system in broken state
- Phase 1 alone provides significant UX improvement

**2. Comprehensive Testing**
- Test suite runs after every session
- Manual testing checklist for each deliverable
- Performance benchmarks monitored continuously

**3. Data Safety**
- Backup before every major change
- Migration preview before applying
- Rollback procedures documented
- localStorage backup as additional safety net

**4. Scope Control**
- Strict phase boundaries prevent feature creep
- "Future enhancements" list keeps ideas organized
- Explicit approval required for scope changes

**5. Performance Monitoring**
- Query time measured at each phase
- <500ms response time target
- Lazy loading prevents unnecessary data fetches

---

## Why This Integration Makes Lineageweaver Better

### For Quick Reference (Original Use Case)
- Family tree remains fast and clean
- Biography previews add context without clutter
- Single click to deep dive into narrative

### For Worldbuilding (Enhanced Use Case)
- Write once, visible everywhere
- Wiki-links create interconnected lore
- Timeline shows big picture
- Knowledge graph reveals patterns

### For Data Integrity (Quality Control)
- No duplicate entries
- No synchronization bugs
- Canonical dates enforced
- Single source of truth

### For User Experience (Ease of Use)
- Less context switching
- Fewer clicks to find information
- Intuitive navigation
- Unified mental model

---

## Conclusion

This phased integration approach transforms Lineageweaver from "two separate systems with navigation" into "one unified worldbuilding platform". Each phase delivers tangible value while building toward a more sophisticated whole.

The key insight: **genealogical data and biographical narrative are two views of the same reality**. A person is both a node in a family tree AND a character with a story. By unifying these perspectives, we create something greater than the sum of its parts.

**Start with Phase 1** to get immediate benefits with minimal risk. **Proceed to Phase 2** when ready to eliminate all duplication. **Implement Phase 3 features** as needed based on your worldbuilding workflow.

The result: a tool that serves both the writer who needs quick facts ("When was Aldric born?") and the worldbuilder crafting rich narrative ("Tell me Aldric's story").
