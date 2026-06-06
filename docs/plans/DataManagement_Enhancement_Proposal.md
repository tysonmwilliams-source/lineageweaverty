# Data Management Enhancement Proposal
## Lineageweaver - Elevating the Records System

**Document Version:** 1.0  
**Date:** January 2025  
**Status:** Draft Proposal for Implementation

---

## Executive Summary

The Data Management system in Lineageweaver currently serves as the central hub for CRUD operations on People, Houses, and Relationships. While functional, the current implementation lacks the sophisticated search, filter, and organizational capabilities found in peer systems like CodexBrowse and HeraldryLanding within the same application.

This proposal outlines a phased approach to elevate the Data Management experience to match the polish and functionality of Lineageweaver's other major systems, drawing on proven patterns already established in the codebase.

---

## Current State Analysis

### What Works Well ✅

1. **Tab-based navigation** - The People/Houses/Relationships/Import-Export/Health tabs provide clear organization
2. **Quick Stats section** - Immediate visibility into record counts
3. **Modal-based editing** - Consistent with application patterns
4. **Framer Motion animations** - Smooth transitions and visual polish
5. **Color-coded legitimacy indicators** - Visual hierarchy for person cards
6. **House color dots** - Quick house identification
7. **Danger Zone** - Proper safeguards for destructive operations

### Current Limitations ❌

| Issue | Impact | Priority |
|-------|--------|----------|
| **No search functionality** | Cannot quickly find specific people in large datasets | 🔴 Critical |
| **No sorting options** | Records display in database insertion order only | 🔴 Critical |
| **No filtering** | Cannot filter by house, legitimacy, dates, or other attributes | 🟠 High |
| **No grouping** | People from different houses intermixed in flat list | 🟠 High |
| **No pagination** | Performance degrades with large datasets | 🟡 Medium |
| **No keyboard shortcuts** | Power users cannot navigate efficiently | 🟢 Low |
| **Limited visual density options** | No compact view for scanning large lists | 🟢 Low |

### Reference Implementations in Codebase

The CodexBrowse component demonstrates excellent patterns we should adopt:

```javascript
// From CodexBrowse.jsx - Features to adapt:
// 1. Search with debounced input
// 2. Sort dropdown (title, updated, wordCount)
// 3. Filter by tags, era
// 4. Pagination with 20 items per page
// 5. Statistics panel
// 6. Clear filters button
// 7. Empty state handling for filters
```

---

## Proposed Enhancement Architecture

### Design Principles

1. **Consistency** - Match patterns from CodexBrowse and HeraldryLanding
2. **Medieval Aesthetic** - Maintain the manuscript visual language
3. **Performance First** - Memoize, debounce, virtualize where needed
4. **Surgical Implementation** - Enhance existing components rather than rebuild
5. **Theme Aware** - All new elements use CSS custom properties
6. **Guidelines Compliance** - All code must follow `DEVELOPMENT_GUIDELINES.md`

---

## ⚠️ CRITICAL: Development Standards

**All implementation work MUST adhere to the project's established standards.**

### Reference Document
Before writing any code, review: **`DEVELOPMENT_GUIDELINES.md`** in the project root.

### CSS & Theming Requirements

**NEVER hardcode colors.** All colors must use CSS custom properties from the theme system:

```css
/* ✅ CORRECT - Theme-aware */
color: var(--text-primary);
background: var(--bg-secondary);
border-color: var(--border-primary);

/* ❌ WRONG - Hardcoded */
color: #1a1a2e;
background: #f5e6d3;
border-color: #8b7355;
```

**Available CSS Custom Properties** (defined in `src/styles/index.css`):

| Category | Variables |
|----------|-----------|
| **Backgrounds** | `--bg-primary`, `--bg-secondary`, `--bg-tertiary` |
| **Text** | `--text-primary`, `--text-secondary`, `--text-tertiary` |
| **Borders** | `--border-primary`, `--border-secondary` |
| **Accents** | `--accent-primary`, `--accent-secondary` |
| **Status** | `--color-success`, `--color-warning`, `--color-error`, `--color-info` |
| **Spacing** | `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl` |
| **Typography** | `--font-display` (Cinzel), `--font-body` (Crimson Text) |
| **Radii** | `--radius-sm`, `--radius-md`, `--radius-lg` |

### UI Uniformity Checklist

Every new component must:

- [ ] Use **BEM naming convention** (`.component__element--modifier`)
- [ ] Have a **separate CSS file** (e.g., `SearchBar.css` alongside `SearchBar.jsx`)
- [ ] Use **only theme variables** for colors, spacing, fonts, and radii
- [ ] Work correctly in **both themes** (Royal Parchment dark + Light Manuscript)
- [ ] Match the **medieval manuscript aesthetic** (warm tones, subtle textures, period-appropriate icons)
- [ ] Follow **existing component patterns** (reference `PersonList.jsx`, `CodexBrowse.jsx`)

### Performance Requirements (from DEVELOPMENT_GUIDELINES.md)

```javascript
// ✅ Memoize expensive computations
const filtered = useMemo(() => filterData(data, filters), [data, filters]);

// ✅ Debounce user input
const debouncedSearch = useMemo(() => debounce(setQuery, 300), []);

// ✅ Use Maps for O(1) lookups
const houseMap = useMemo(() => new Map(houses.map(h => [h.id, h])), [houses]);

// ✅ Wrap handlers in useCallback
const handleEdit = useCallback((id) => openModal(id), []);
```

### File Size Limits

| Type | Max Lines | Action if Exceeded |
|------|-----------|-------------------|
| Components | 500 | Split into sub-components |
| Services | 400 | Split by domain |
| Utilities | 200 | Split by function group |

### Before Committing Any Phase

- [ ] Remove all `console.log` statements (or guard with `import.meta.env.DEV`)
- [ ] Delete commented-out code
- [ ] Run in both themes to verify styling
- [ ] Check for console errors
- [ ] Verify animations are smooth

### Enhanced List Component Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 🔍 Search people...                              [Clear X]  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │
│  │ Sort: Name (A-Z) │ │ House: All       │ │ Status: All      │    │
│  │       ▼          │ │       ▼          │ │       ▼          │    │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘    │
│                                                                     │
│  [✓ Group by House]   Showing 38 of 38 people   [Clear Filters]    │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│  🏰 HOUSE WILFREY (12 members)                                      │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ● Edmund Wilfrey (née ...)                    [Edit] [Del]  │   │
│  │   🏰 House Wilfrey  📅 b. 1245 - d. 1289                    │   │
│  │   [Legitimate]                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ● Margery Wilfrey                              [Edit] [Del] │   │
│  │   🏰 House Wilfrey  📅 b. 1248                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ... more members ...                                               │
│                                                                     │
│  ═══════════════════════════════════════════════════════════════   │
│  ⚔️ HOUSE BLACKWOOD (8 members)                                    │
│  ═══════════════════════════════════════════════════════════════   │
│                                                                     │
│  ... grouped members ...                                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│       [◀ Previous]    Page 1 of 2    [Next ▶]                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Search & Sort Foundation
**Priority: 🔴 Critical | Estimated: 1 session**

> ⚠️ **Before starting:** Review `DEVELOPMENT_GUIDELINES.md` and the Development Standards section above. All code must use CSS custom properties and follow established patterns.

### Objectives
1. Add search bar to PersonList, HouseList, and RelationshipList
2. Implement sort dropdown with multiple options
3. Debounce search input for performance

### Technical Implementation

#### 1A: Create Reusable SearchBar Component

**New File:** `src/components/shared/SearchBar.jsx`

```javascript
/**
 * SearchBar - Reusable search input with debouncing
 * 
 * Props:
 * - value: Current search term
 * - onChange: Callback when search changes (debounced)
 * - placeholder: Input placeholder text
 * - debounceMs: Debounce delay (default 300ms)
 */
```

Features:
- Search icon with visual feedback
- Clear button (X) when search has content
- Debounced onChange to prevent excessive filtering
- Theme-aware styling using CSS custom properties

#### 1B: Create SortDropdown Component

**New File:** `src/components/shared/SortDropdown.jsx`

```javascript
/**
 * SortDropdown - Reusable sort selector
 * 
 * Props:
 * - value: Current sort key
 * - onChange: Callback when sort changes
 * - options: Array of { value, label, icon? }
 */
```

#### 1C: Enhance PersonList with Search & Sort

**Modified File:** `src/components/PersonList.jsx`

Add to component:
```javascript
// New state
const [searchTerm, setSearchTerm] = useState('');
const [sortBy, setSortBy] = useState('lastName'); // Default: alphabetical

// Sort options for People
const SORT_OPTIONS = [
  { value: 'lastName', label: 'Last Name (A-Z)' },
  { value: 'firstName', label: 'First Name (A-Z)' },
  { value: 'dateOfBirth', label: 'Birth Date (Oldest)' },
  { value: 'dateOfBirthDesc', label: 'Birth Date (Youngest)' },
  { value: 'house', label: 'By House' },
  { value: 'recentlyAdded', label: 'Recently Added' }
];

// Memoized filtered & sorted people
const displayedPeople = useMemo(() => {
  let filtered = [...people];
  
  // Apply search
  if (searchTerm) {
    const search = searchTerm.toLowerCase();
    filtered = filtered.filter(p => 
      p.firstName?.toLowerCase().includes(search) ||
      p.lastName?.toLowerCase().includes(search) ||
      p.maidenName?.toLowerCase().includes(search) ||
      p.titles?.some(t => t.toLowerCase().includes(search))
    );
  }
  
  // Apply sort
  filtered.sort((a, b) => {
    switch (sortBy) {
      case 'lastName':
        return (a.lastName || '').localeCompare(b.lastName || '');
      case 'firstName':
        return (a.firstName || '').localeCompare(b.firstName || '');
      case 'dateOfBirth':
        return (a.dateOfBirth || '9999').localeCompare(b.dateOfBirth || '9999');
      case 'dateOfBirthDesc':
        return (b.dateOfBirth || '').localeCompare(a.dateOfBirth || '');
      case 'house':
        const houseA = houses.find(h => h.id === a.houseId)?.houseName || '';
        const houseB = houses.find(h => h.id === b.houseId)?.houseName || '';
        return houseA.localeCompare(houseB);
      default:
        return 0;
    }
  });
  
  return filtered;
}, [people, houses, searchTerm, sortBy]);
```

#### 1D: Apply Same Pattern to HouseList

- Search by house name, motto, notes
- Sort options: Name (A-Z), Founded Date, Type, Recently Added

#### 1E: Apply Same Pattern to RelationshipList

- Search by person names involved
- Sort options: Type, Marriage Date, Recently Added

### Deliverables - Phase 1
- [ ] SearchBar shared component created (with `SearchBar.css`)
- [ ] SortDropdown shared component created (with `SortDropdown.css`)
- [ ] PersonList has working search and sort
- [ ] HouseList has working search and sort
- [ ] RelationshipList has working search and sort
- [ ] All search inputs are debounced (300ms)
- [ ] **THEME CHECK:** Royal Parchment (dark) renders correctly
- [ ] **THEME CHECK:** Light Manuscript (light) renders correctly
- [ ] **GUIDELINES CHECK:** No hardcoded colors - all use `var(--*)`
- [ ] **GUIDELINES CHECK:** File sizes under limits (components < 500 lines)
- [ ] **GUIDELINES CHECK:** No console.log statements in production code

---

## Phase 2: Advanced Filtering
**Priority: 🟠 High | Estimated: 1 session**

> ⚠️ **Before starting:** Ensure Phase 1 is complete and passing all checks. Continue following `DEVELOPMENT_GUIDELINES.md` and CSS theming requirements.

### Objectives
1. Add filter dropdowns for key attributes
2. Implement filter badge/tag display
3. Add "Clear All Filters" functionality

### Technical Implementation

#### 2A: Create FilterBar Component

**New File:** `src/components/shared/FilterBar.jsx`

```javascript
/**
 * FilterBar - Horizontal row of filter controls
 * 
 * Props:
 * - filters: Array of filter configurations
 * - values: Current filter values object
 * - onChange: Callback with updated values
 * - onClear: Callback to clear all filters
 */
```

#### 2B: PersonList Filter Options

| Filter | Type | Options |
|--------|------|---------|
| House | Dropdown | All houses from data |
| Status | Dropdown | Legitimate, Bastard, Adopted, Unknown |
| Living/Deceased | Dropdown | All, Living (no death date), Deceased |
| Has Biography | Toggle | Yes/No (has codexEntryId) |
| Generation | Dropdown | Calculated from relationships |

#### 2C: HouseList Filter Options

| Filter | Type | Options |
|--------|------|---------|
| Type | Dropdown | Great, Cadet, Minor, etc. |
| Has Heraldry | Toggle | Yes/No |
| Parent House | Dropdown | All great houses |

#### 2D: RelationshipList Filter Options

| Filter | Type | Options |
|--------|------|---------|
| Type | Dropdown | Parent, Spouse, Adopted, Foster, Mentor |
| House | Dropdown | Show relationships involving house members |
| Person | Searchable dropdown | Filter by specific person |

### Deliverables - Phase 2
- [ ] FilterBar shared component created (with `FilterBar.css`)
- [ ] PersonList filters implemented (House, Status, Living/Deceased, Has Biography)
- [ ] HouseList filters implemented (Type, Has Heraldry, Parent House)
- [ ] RelationshipList filters implemented (Type, House, Person)
- [ ] Active filter badges display with count
- [ ] "Clear Filters" button functional
- [ ] Result count updates dynamically ("Showing 12 of 38")
- [ ] **THEME CHECK:** Both themes render correctly
- [ ] **GUIDELINES CHECK:** All CSS uses theme variables
- [ ] **GUIDELINES CHECK:** Memoization applied to filter logic

---

## Phase 3: Grouping & Visual Organization
**Priority: 🟠 High | Estimated: 1 session**

> ⚠️ **Before starting:** Ensure Phases 1-2 are complete. The GroupHeader component must match the medieval manuscript aesthetic.

### Objectives
1. Add optional grouping by house for PersonList
2. Create collapsible group headers
3. Implement member counts per group

### Technical Implementation

#### 3A: Group Toggle Control

Add toggle to PersonList header:
```javascript
const [groupByHouse, setGroupByHouse] = useState(true); // Default: grouped
```

#### 3B: GroupHeader Component

**New File:** `src/components/shared/GroupHeader.jsx`

```javascript
/**
 * GroupHeader - Collapsible section header for grouped lists
 * 
 * Props:
 * - icon: Lucide icon name
 * - title: Group title (e.g., "House Wilfrey")
 * - count: Number of items in group
 * - color: Optional accent color
 * - collapsed: Boolean state
 * - onToggle: Callback to toggle collapsed state
 */
```

Visual design:
```
═══════════════════════════════════════════════════════════════
🏰 HOUSE WILFREY                                    12 members ▼
═══════════════════════════════════════════════════════════════
```

#### 3C: Grouped Data Processing

```javascript
const groupedPeople = useMemo(() => {
  if (!groupByHouse) return null;
  
  const groups = new Map();
  
  // Group by house
  displayedPeople.forEach(person => {
    const house = houses.find(h => h.id === person.houseId);
    const key = house?.id || 'unknown';
    
    if (!groups.has(key)) {
      groups.set(key, {
        house: house || { houseName: 'Unknown House', colorCode: '#666' },
        members: []
      });
    }
    
    groups.get(key).members.push(person);
  });
  
  // Sort groups by house name
  return Array.from(groups.values())
    .sort((a, b) => a.house.houseName.localeCompare(b.house.houseName));
}, [displayedPeople, houses, groupByHouse]);
```

### Deliverables - Phase 3
- [ ] Group toggle control added to PersonList header
- [ ] GroupHeader component created (with `GroupHeader.css`)
- [ ] PersonList renders grouped view correctly
- [ ] Collapsible groups with smooth Framer Motion animation
- [ ] Member counts per group displayed
- [ ] "Unknown House" fallback handling works
- [ ] Group preference persists in session (useState)
- [ ] **THEME CHECK:** GroupHeader styled correctly in both themes
- [ ] **GUIDELINES CHECK:** Uses `var(--font-display)` for headers
- [ ] **AESTHETIC CHECK:** Matches medieval manuscript divider style

---

## Phase 4: Pagination & Performance
**Priority: 🟡 Medium | Estimated: 1 session**

> ⚠️ **Before starting:** Ensure Phases 1-3 are complete. This phase focuses heavily on performance - review the memoization patterns in `DEVELOPMENT_GUIDELINES.md`.

### Objectives
1. Implement pagination for large datasets
2. Add virtual scrolling option for 100+ records
3. Optimize memoization patterns

### Technical Implementation

#### 4A: Pagination Component

**New File:** `src/components/shared/Pagination.jsx`

```javascript
/**
 * Pagination - Page navigation controls
 * 
 * Props:
 * - currentPage: Current page number (1-indexed)
 * - totalPages: Total number of pages
 * - onPageChange: Callback with new page number
 * - showInfo: Boolean to show "Page X of Y" text
 */
```

#### 4B: Pagination State & Logic

```javascript
// Configuration
const ITEMS_PER_PAGE = 25;

// State
const [currentPage, setCurrentPage] = useState(1);

// Reset page when filters change
useEffect(() => {
  setCurrentPage(1);
}, [searchTerm, sortBy, filterValues]);

// Calculate pagination
const totalPages = Math.ceil(displayedPeople.length / ITEMS_PER_PAGE);
const paginatedPeople = useMemo(() => {
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  return displayedPeople.slice(start, start + ITEMS_PER_PAGE);
}, [displayedPeople, currentPage]);
```

#### 4C: Performance Optimizations

1. **Lookup Maps** - Use Map for O(1) house lookups:
```javascript
const houseMap = useMemo(() => 
  new Map(houses.map(h => [h.id, h])), [houses]);
```

2. **Debounced Search** - Already implemented in Phase 1

3. **Virtual Scrolling** (optional for 200+ records):
```javascript
// Consider react-window or react-virtual for extreme cases
// Only implement if performance issues arise
```

### Deliverables - Phase 4
- [ ] Pagination component created (with `Pagination.css`)
- [ ] PersonList paginated (25 per page default)
- [ ] HouseList paginated (25 per page)
- [ ] RelationshipList paginated (25 per page)
- [ ] Page resets to 1 when filters/search change
- [ ] Lookup Maps implemented for O(1) house/person resolution
- [ ] **PERFORMANCE CHECK:** Smooth with 100+ records
- [ ] **THEME CHECK:** Pagination styled correctly in both themes
- [ ] **GUIDELINES CHECK:** All filtering/sorting logic memoized
- [ ] **GUIDELINES CHECK:** No unnecessary re-renders (React DevTools)

---

## Phase 5: Enhanced Visual Density & Polish
**Priority: 🟢 Low | Estimated: 1 session**

> ⚠️ **Before starting:** Ensure Phases 1-4 are complete and stable. This phase adds refinements - maintain all existing functionality.

### Objectives
1. Add compact/comfortable view toggle
2. Implement keyboard navigation
3. Add bulk selection capability (future-proofing)

### Technical Implementation

#### 5A: View Density Toggle

```javascript
const [viewDensity, setViewDensity] = useState('comfortable'); // 'compact' | 'comfortable'
```

Compact view:
- Reduced padding
- Single-line per person
- Icons only (no labels)

#### 5B: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Escape` | Clear search / close modal |
| `↑` / `↓` | Navigate list items |
| `Enter` | Edit selected item |
| `Delete` | Delete selected item (with confirmation) |

#### 5C: Selection State (Future-Proofing)

```javascript
// Prepare for future bulk operations
const [selectedIds, setSelectedIds] = useState(new Set());

const toggleSelection = (id) => {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};
```

### Deliverables - Phase 5
- [ ] View density toggle implemented (compact/comfortable)
- [ ] Compact view CSS created with reduced spacing
- [ ] Keyboard navigation working (`/` to search, arrows to navigate)
- [ ] Selection state infrastructure ready for future bulk operations
- [ ] Focus management correct (visible focus rings, logical tab order)
- [ ] **ACCESSIBILITY CHECK:** All interactive elements keyboard-accessible
- [ ] **THEME CHECK:** Both density modes work in both themes
- [ ] **GUIDELINES CHECK:** Final cleanup - no console.logs, no dead code
- [ ] **GUIDELINES CHECK:** All new files under size limits

---

## Implementation Strategy

### Development Order

```
Phase 1 ─────────────────────────────────────────────────►
         Search & Sort (Critical foundation)
         
         Phase 2 ────────────────────────────────────────►
                  Filtering (Most requested feature)
                  
                  Phase 3 ─────────────────────────────────►
                           Grouping (Visual organization)
                           
                           Phase 4 ──────────────────────────►
                                    Pagination (Performance)
                                    
                                    Phase 5 ─────────────────►
                                             Polish & Extras
```

### File Changes Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `SearchBar.jsx`, `SortDropdown.jsx` | `PersonList.jsx`, `HouseList.jsx`, `RelationshipList.jsx` |
| 2 | `FilterBar.jsx`, `FilterDropdown.jsx` | Same list components |
| 3 | `GroupHeader.jsx` | `PersonList.jsx` primarily |
| 4 | `Pagination.jsx` | All list components |
| 5 | `KeyboardShortcuts.jsx` (hook) | All list components |

### CSS Architecture

All new components should follow:

1. **BEM naming**: `.component__element--modifier`
2. **Theme variables**: `var(--color-name)` not hardcoded
3. **Separate CSS files**: `ComponentName.css` colocated
4. **Mobile-responsive**: Flexbox/grid with breakpoints

### Testing Checklist (Per Phase)

- [ ] Light theme renders correctly
- [ ] Dark theme renders correctly
- [ ] Empty state handles gracefully
- [ ] Filter "no results" state works
- [ ] Performance acceptable at 100+ records
- [ ] No console errors
- [ ] Animations smooth
- [ ] Accessibility basics (focus, labels)

---

## CSS Styling Reference

### ⚠️ MANDATORY: Theme Variable Usage

**Every color, spacing, and font value MUST come from CSS custom properties.** This ensures:
1. Instant theme switching between Royal Parchment (dark) and Light Manuscript (light)
2. Future theme expansion without code changes
3. Visual consistency across all components

### Shared Form Controls (Match Existing Patterns)

```css
/* 
 * Reference: CodexBrowse.css filter styles
 * NOTE: All values use CSS custom properties - NEVER hardcode!
 */

.search-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.search-bar:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary-transparent);
}

.search-bar__icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.search-bar__input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  outline: none;
}

.search-bar__input::placeholder {
  color: var(--text-tertiary);
}

.search-bar__clear {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
  transition: color 0.2s ease, background 0.2s ease;
}

.search-bar__clear:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

/* Filter Dropdown - matches existing select styling */
.filter-dropdown {
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.filter-dropdown:hover {
  border-color: var(--border-secondary);
}

.filter-dropdown:focus {
  outline: none;
  border-color: var(--accent-primary);
}

/* Group Header - medieval manuscript style */
.group-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-tertiary);
  border-top: 2px solid var(--border-primary);
  border-bottom: 1px solid var(--border-primary);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.group-header__count {
  color: var(--text-tertiary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-transform: none;
}

/* Pagination - consistent with existing patterns */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border-top: 1px solid var(--border-primary);
}

.pagination__button {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-body);
  cursor: pointer;
  transition: all 0.2s ease;
}

.pagination__button:hover:not(:disabled) {
  background: var(--bg-tertiary);
  border-color: var(--accent-primary);
}

.pagination__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination__info {
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
}
```

### Anti-Patterns to Avoid

```css
/* ❌ NEVER DO THIS */

/* Hardcoded colors */
.bad-component {
  color: #d4af37;           /* Use var(--accent-primary) */
  background: #1a1a2e;      /* Use var(--bg-primary) */
  border: 1px solid #333;   /* Use var(--border-primary) */
}

/* Hardcoded spacing */
.bad-spacing {
  padding: 16px;            /* Use var(--spacing-md) */
  margin: 8px;              /* Use var(--spacing-sm) */
  gap: 24px;                /* Use var(--spacing-lg) */
}

/* Hardcoded fonts */
.bad-typography {
  font-family: 'Cinzel';    /* Use var(--font-display) */
  font-size: 14px;          /* Use var(--text-sm) */
}

/* Hardcoded radii */
.bad-radius {
  border-radius: 8px;       /* Use var(--radius-md) */
}
```

---

## Migration Notes

### Breaking Changes
- **None** - All changes are additive enhancements

### Data Model Changes
- **None required** - Existing data works unchanged

### Backward Compatibility
- Default sort/filter state mimics current behavior
- Grouping defaults to `true` for familiarity
- No migration scripts needed

---

## Appendix A: Component Props Reference

### SearchBar
```typescript
interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;  // default: 300
  autoFocus?: boolean;  // default: false
}
```

### SortDropdown
```typescript
interface SortOption {
  value: string;
  label: string;
  icon?: string;  // Lucide icon name
}

interface SortDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: SortOption[];
  label?: string;  // e.g., "Sort by:"
}
```

### FilterBar
```typescript
interface FilterConfig {
  key: string;
  label: string;
  type: 'select' | 'toggle';
  options?: Array<{ value: string; label: string }>;
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string | boolean>;
  onChange: (key: string, value: string | boolean) => void;
  onClear: () => void;
  activeCount?: number;
}
```

### Pagination
```typescript
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showInfo?: boolean;  // default: true
  showFirstLast?: boolean;  // default: false
}
```

---

## Appendix B: Glossary

For reference, here are explanations of technical terms used in this proposal:

| Term | Explanation |
|------|-------------|
| **Debounce** | A technique that delays executing a function until the user stops triggering it. For search, this means waiting until the user stops typing before actually filtering, which prevents the app from trying to filter on every single keystroke. |
| **Memoization** | A performance optimization where the result of a calculation is "remembered" and reused if the inputs haven't changed, instead of recalculating every time. React's `useMemo` hook does this. |
| **BEM** | Block Element Modifier - a CSS naming convention like `.block__element--modifier` that keeps styles organized and predictable. |
| **CRUD** | Create, Read, Update, Delete - the four basic operations for managing data. |
| **Virtual Scrolling** | A technique for rendering long lists efficiently by only creating DOM elements for visible items, rather than thousands of items at once. |
| **CSS Custom Properties** | Also called CSS variables (like `--color-primary`), they allow colors and values to be defined once and reused throughout the stylesheet, making theming possible. |
| **O(1) Lookup** | "Order 1" - a computer science term meaning an operation that takes the same amount of time regardless of dataset size. Using a Map for lookups is O(1), while using Array.find() is O(n) and gets slower with more items. |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2025 | Initial proposal created |

---

*This document serves as the implementation guide for Data Management enhancements. Each phase is designed to be independently deployable while building toward the complete vision.*
