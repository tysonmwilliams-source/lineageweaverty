# LineageWeaver Codebase Audit Report
Generated: 2026-01-12
Auditor: Claude Code

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Health Score** | 6.5/10 |
| **Critical Issues** | 8 |
| **High Priority Issues** | 15 |
| **Medium Priority Issues** | 12 |
| **Low Priority Issues** | 8 |
| **Estimated Performance Improvement Potential** | 40-60% |

### Key Findings

1. **Bundle Size Critical**: Single JS chunk is 1.45 MB (needs code-splitting)
2. **Performance Bottlenecks**: Major re-render issues in FamilyTree.jsx and QuickEditPanel.jsx
3. **Code Duplication**: ~500-800 lines of duplicate form/CSS patterns
4. **Unused Code**: ~250KB of dead/archived code can be removed
5. **Missing Infrastructure**: No error boundaries, minimal accessibility, no type safety

---

## Critical Issues (Fix Immediately)

### Issue 1: Bundle Size Exceeds 500KB
- **Location:** Build output
- **Problem:** Main JS bundle is 1,487 KB (gzipped: 426 KB)
- **Impact:** Slow initial load, poor user experience on slower connections
- **Solution:**
  - Implement React.lazy() for routes
  - Add manual chunks in vite.config.js
  - Consider dynamic imports for large components
- **Priority:** CRITICAL

### Issue 2: Massive useEffect Dependency Array
- **Location:** `src/pages/FamilyTree.jsx:664-666`
- **Problem:** useEffect has 13+ dependencies including frequently-changing objects
- **Impact:** D3 tree redraws on virtually every state change, causing major performance issues
- **Solution:**
  - Extract drawTree into useMemo-based calculations
  - Split effect into multiple smaller effects
  - Memoize theme and relationshipMap objects
- **Priority:** CRITICAL

### Issue 3: buildRelationshipMaps Called Multiple Times
- **Location:** `src/pages/FamilyTree.jsx:532-556`
- **Problem:** O(n) relationship map building occurs 3+ times per render cycle
- **Impact:** Significant CPU overhead, especially with 200+ people
- **Solution:** Memoize the function result based on people/houses/relationships
- **Priority:** CRITICAL

### Issue 4: No Error Boundaries
- **Location:** Entire application
- **Problem:** No React Error Boundaries implemented
- **Impact:** Any component error crashes the entire app
- **Solution:** Add ErrorBoundary component wrapping main routes
- **Priority:** CRITICAL

### Issue 5: Missing Debouncing on Cloud Sync
- **Location:** `src/contexts/GenealogyContext.jsx:274-293`
- **Problem:** Every field change triggers immediate Firestore write
- **Impact:** Excessive API calls, potential rate limiting, unnecessary costs
- **Solution:** Implement 500ms debounce on sync operations
- **Priority:** CRITICAL

### Issue 6: No Code-Splitting for Routes
- **Location:** `src/App.jsx:3-16`
- **Problem:** All 16 page components imported eagerly
- **Impact:** Large initial bundle, slow first load
- **Solution:** Use React.lazy() and Suspense for route components
- **Priority:** CRITICAL

### Issue 7: Database Schema Version Ordering
- **Location:** `src/services/database.js:191`
- **Problem:** Version 3 is defined AFTER Version 10
- **Impact:** May cause migration issues on fresh installs
- **Solution:** Reorganize schema versions sequentially
- **Priority:** CRITICAL

### Issue 8: Oversized Files Exceeding Maintainability Limits
- **Location:** Multiple files
- **Problem:** 6 files exceed 1000 lines, 2 exceed 2000 lines
- **Impact:** Difficult to maintain, test, and understand
- **Files:**
  - HeraldryCreator.jsx (2,484 lines)
  - FamilyTree.jsx (2,142 lines)
  - dignityService.js (1,918 lines)
  - DignityView.jsx (1,843 lines)
  - QuickEditPanel.jsx (1,701 lines)
  - DataHealthDashboard.jsx (1,042 lines)
- **Solution:** Split into smaller, focused components/modules
- **Priority:** CRITICAL

---

## High Priority Improvements

### Issue 9: Theme Object Recreation
- **Location:** `src/pages/FamilyTree.jsx:129-153`, `src/components/QuickEditPanel.jsx:129-153`
- **Problem:** Theme objects created inline every render, breaking memoization
- **Solution:** Wrap in useMemo() with [isDarkTheme] dependency
- **Priority:** HIGH

### Issue 10: Sibling Lookup O(m*n) Complexity
- **Location:** `src/components/QuickEditPanel.jsx:213-236`
- **Problem:** people.find() inside map creates O(n) lookup per sibling
- **Solution:** Use Map-based lookup for O(1) access
- **Priority:** HIGH

### Issue 11: Fragment Detection Algorithm Complexity
- **Location:** `src/pages/FamilyTree.jsx:562-595`
- **Problem:** detectFragments uses BFS with O(n²) potential complexity
- **Solution:** Cache fragment results, optimize BFS traversal
- **Priority:** HIGH

### Issue 12: Search Filtering Without Debouncing
- **Location:** `src/components/QuickEditPanel.jsx:274-281`
- **Problem:** Filtering runs on every keystroke
- **Solution:** Add 300ms debounce to search input
- **Priority:** HIGH

### Issue 13: Form Pattern Duplication (5 files)
- **Location:** PersonForm.jsx, HouseForm.jsx, RelationshipForm.jsx, DignityForm.jsx, CodexEntryForm.jsx
- **Problem:** Identical form state management patterns repeated
- **Solution:** Create useFormState() and useFormValidation() hooks
- **Priority:** HIGH

### Issue 14: CSS Theme Duplication (95%)
- **Location:** `src/styles/themes/theme-royal-parchment.css`, `src/styles/themes/theme-light-manuscript.css`
- **Problem:** 314 lines each with only color values differing
- **Solution:** Extract common structure to base theme file
- **Priority:** HIGH

### Issue 15: Missing useCallback for Handlers
- **Location:** Multiple components
- **Problem:** Handler functions recreated every render
- **Solution:** Wrap in useCallback with appropriate dependencies
- **Priority:** HIGH

### Issue 16: getPersonName() Duplicated 8+ Times
- **Location:** RelationshipForm.jsx, DignityForm.jsx, PersonCard.jsx, etc.
- **Problem:** Same function implemented in 8+ files
- **Solution:** Extract to shared utility: `src/utils/entityLookup.js`
- **Priority:** HIGH

### Issue 17: No Cleanup for Async Operations
- **Location:** `src/components/QuickEditPanel.jsx:94-105`
- **Problem:** Async state updates can fire after unmount
- **Solution:** Add cleanup function with AbortController or isMounted flag
- **Priority:** HIGH

### Issue 18: Form CSS Duplication
- **Location:** HouseForm.css, DignityForm.css, CodexEntryForm.css, HeraldryCreator.css
- **Problem:** .form-group, .form-label, .form-input repeated across 4+ files
- **Solution:** Create shared form CSS module
- **Priority:** HIGH

### Issue 19: Service Layer CRUD Duplication
- **Location:** codexService.js, heraldryService.js, dignityService.js
- **Problem:** Similar create/read/update/delete patterns repeated
- **Solution:** Create base service factory or class
- **Priority:** HIGH

### Issue 20: Console Statements in Production Code
- **Location:** 55 files, 533 occurrences
- **Problem:** Debug logging left in production code
- **Solution:** Remove or wrap with development-only flag
- **Priority:** HIGH

### Issue 21: Accessibility - Minimal ARIA Support
- **Location:** Entire application
- **Problem:** Only 2 ARIA label usages, no tabIndex usage
- **Solution:** Add aria-labels to interactive elements, implement keyboard nav
- **Priority:** HIGH

### Issue 22: Accessibility - No Error Boundary UI
- **Location:** Entire application
- **Problem:** No user-friendly error recovery
- **Solution:** Implement ErrorBoundary with retry UI
- **Priority:** HIGH

### Issue 23: Unused Legacy File
- **Location:** `src/pages/HeraldryCreator_Legacy.jsx`
- **Problem:** 76KB / 1,816 lines of unused code
- **Solution:** Delete or move to archive outside src/
- **Priority:** HIGH

---

## Medium Priority Improvements

### Issue 24: Data Loading Pattern Duplication
- **Location:** CodexEntryView.jsx, DignityForm.jsx, HouseForm.jsx
- **Problem:** Similar async loading pattern repeated
- **Solution:** Create useDataLoader() custom hook
- **Priority:** MEDIUM

### Issue 25: Inline Tailwind Class Duplication
- **Location:** Multiple components, 50+ occurrences
- **Problem:** Same className strings repeated
- **Solution:** Extract to utility classes or components
- **Priority:** MEDIUM

### Issue 26: Color Harmonization Not Memoized
- **Location:** `src/pages/FamilyTree.jsx:127-161`
- **Problem:** harmonizeColor() runs for every card on every render
- **Solution:** Implement Map-based cache
- **Priority:** MEDIUM

### Issue 27: Mixed Import Styles for database.js
- **Location:** Build warning
- **Problem:** database.js has both static and dynamic imports
- **Solution:** Standardize to one import style
- **Priority:** MEDIUM

### Issue 28: availableExistingPeople Multiple O(n) Operations
- **Location:** `src/components/QuickEditPanel.jsx:241-291`
- **Problem:** Filter → Filter → Filter → Sort on each keystroke
- **Solution:** Consolidate into single pass, add debouncing
- **Priority:** MEDIUM

### Issue 29: src/docs/ Contains Code Files
- **Location:** `src/docs/`
- **Problem:** Patch files and code snippets in src/ directory
- **Solution:** Move to docs/ or remove if not needed
- **Priority:** MEDIUM

### Issue 30: _archived Folder in Active Source
- **Location:** `src/components/_archived/`
- **Problem:** Archived components still in src/ tree
- **Solution:** Move to project root archive folder
- **Priority:** MEDIUM

### Issue 31: old-build-archive in Repository
- **Location:** `/old-build-archive/`
- **Problem:** 160KB+ of old code in repo
- **Solution:** Consider .gitignore or separate archive
- **Priority:** MEDIUM

### Issue 32: PropTypes Not Used
- **Location:** All components
- **Problem:** No runtime prop validation
- **Solution:** Add PropTypes or consider TypeScript migration
- **Priority:** MEDIUM

### Issue 33: GenealogyContext State Not Normalized
- **Location:** `src/contexts/GenealogyContext.jsx`
- **Problem:** Arrays require O(n) lookups
- **Solution:** Store as Maps for O(1) access
- **Priority:** MEDIUM

### Issue 34: Dignities Effect Loads on Every dataVersion Change
- **Location:** `src/pages/FamilyTree.jsx:628-659`
- **Problem:** Dignities reloaded on any data change
- **Solution:** Add specific dependency or separate context
- **Priority:** MEDIUM

### Issue 35: Date Validation Regex Duplicated
- **Location:** PersonForm.jsx:76, RelationshipForm.jsx:141, others
- **Problem:** Same regex pattern in multiple files
- **Solution:** Extract to validation utility
- **Priority:** MEDIUM

---

## Low Priority / Nice-to-Have

### Issue 36: Unused Utility Files
- **Location:** addGenderData.js, MigrationHooks.js, CodexHooks.js, PersonSchema.js, themeColorsExamples.js, simpleHeraldryGenerator.js
- **Problem:** Files not imported anywhere
- **Solution:** Delete or document why kept
- **Priority:** LOW

### Issue 37: Database Console Logging
- **Location:** `src/services/database.js` (39 occurrences)
- **Problem:** CRUD operations log to console
- **Solution:** Remove or make conditional
- **Priority:** LOW

### Issue 38: Inline Styles in Loading/Error States
- **Location:** `src/App.jsx:89-186`
- **Problem:** CSS defined inline in component
- **Solution:** Extract to CSS file
- **Priority:** LOW

### Issue 39: Route Configuration Not Centralized
- **Location:** `src/App.jsx:196-214`
- **Problem:** Routes defined inline
- **Solution:** Consider routes configuration object
- **Priority:** LOW

### Issue 40: extras/ Folder Large Data Files
- **Location:** `/extras/`
- **Problem:** Backup JSON files in repo (1+ MB)
- **Solution:** Add to .gitignore
- **Priority:** LOW

### Issue 41: No Index Files for Folders
- **Location:** src/components/, src/pages/, src/utils/
- **Problem:** No barrel exports
- **Solution:** Add index.js files for cleaner imports
- **Priority:** LOW

### Issue 42: Version String in Package.json
- **Location:** `package.json:4`
- **Problem:** Version is "0.0.0"
- **Solution:** Update to meaningful version number
- **Priority:** LOW

### Issue 43: Missing .nvmrc File
- **Location:** Project root
- **Problem:** No Node version specification
- **Solution:** Add .nvmrc with Node version
- **Priority:** LOW

---

## Redundancies Found

| File | Redundancy Type | Duplicated In | Action |
|------|-----------------|---------------|--------|
| PersonForm.jsx | Form state pattern | HouseForm, RelationshipForm, DignityForm, CodexEntryForm | Extract to hook |
| theme-royal-parchment.css | 95% structure | theme-light-manuscript.css | Create base theme |
| HouseForm.css | Form styles | DignityForm.css, CodexEntryForm.css | Create shared CSS |
| RelationshipForm.jsx | getPersonName() | 8+ files | Extract to utility |
| FamilyTree.jsx | buildRelationshipMaps() | Called 3x internally | Memoize result |
| QuickEditPanel.jsx | Inline theme object | FamilyTree.jsx | Extract and memoize |

---

## Unused Code Inventory

| File | Lines | Size | Reason Unused | Action |
|------|-------|------|---------------|--------|
| HeraldryCreator_Legacy.jsx | 1,816 | 76 KB | Not imported | Delete |
| _archived/HeraldryCreationModal.jsx | ~400 | 16 KB | Archived | Move out of src/ |
| addGenderData.js | ~50 | 2 KB | Not imported | Delete |
| MigrationHooks.js | ~100 | 3 KB | Not imported | Delete |
| CodexHooks.js | ~80 | 2 KB | Not imported | Delete |
| PersonSchema.js | ~50 | 2 KB | Not imported | Delete |
| themeColorsExamples.js | ~100 | 3 KB | Example file | Delete |
| simpleHeraldryGenerator.js | ~100 | 3 KB | Only used by archived | Delete |
| old-build-archive/ | ~3000 | 160 KB | Old versions | Move/delete |

**Total Unused Code:** ~5,700 lines / ~267 KB

---

## Performance Metrics

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| JS Bundle Size | 1,487 KB | 400 KB | ~73% reduction |
| CSS Bundle Size | 216 KB | 150 KB | ~30% reduction |
| Gzipped Total | 456 KB | 150 KB | ~67% reduction |
| Initial Load Time | ~3-5s | <1.5s | ~60% improvement |
| Tree Re-renders | Every change | Only relevant | ~80% reduction |

---

## Dependency Recommendations

| Package | Issue | Recommendation |
|---------|-------|----------------|
| firebase | 109 MB in node_modules | Consider tree-shaking unused modules |
| All deps | Minor versions behind | Update react-router-dom, vite |
| None | - | Dependencies are generally well-chosen |

---

## File-by-File Detailed Analysis

### /src/pages/FamilyTree.jsx
- **Lines:** 2,142
- **Complexity:** Very High
- **Issues:**
  - Massive useEffect with 13+ deps (line 664)
  - buildRelationshipMaps called 3x per cycle
  - D3 operations not optimized
  - Theme object recreated every render
- **Recommendations:**
  - Split into FamilyTree, TreeRenderer, TreeControls components
  - Extract D3 logic to custom hook
  - Memoize all expensive computations

### /src/pages/HeraldryCreator.jsx
- **Lines:** 2,484
- **Complexity:** Very High
- **Issues:**
  - Excessive line count
  - Multiple responsibilities
  - Complex state management
- **Recommendations:**
  - Split into HeraldryCreator, ShieldEditor, ChargeSelector, ColorPicker
  - Extract heraldry logic to service

### /src/components/QuickEditPanel.jsx
- **Lines:** 1,701
- **Complexity:** Very High
- **Issues:**
  - availableExistingPeople O(n) operations
  - No debouncing on search
  - Theme object not memoized
  - Missing useCallback wrappers
- **Recommendations:**
  - Split into QuickEditPanel, PersonEditor, RelationshipEditor
  - Add debouncing
  - Memoize expensive computations

### /src/services/dignityService.js
- **Lines:** 1,918
- **Complexity:** High
- **Issues:**
  - Very large service file
  - Many helper functions
  - Console logging throughout
- **Recommendations:**
  - Split into DignityService, TenureService, DignityLinkService
  - Remove console statements

### /src/contexts/GenealogyContext.jsx
- **Lines:** ~700 (estimated)
- **Complexity:** High
- **Issues:**
  - Arrays require O(n) lookups
  - No debouncing on sync
  - Single context for all data
- **Recommendations:**
  - Normalize state with Maps
  - Add debounced sync
  - Consider splitting into PeopleContext, HousesContext

---

## Implementation Roadmap

### Phase A: Quick Wins (< 1 hour each)
1. Delete HeraldryCreator_Legacy.jsx
2. Move _archived folder out of src/
3. Remove unused utility files (6 files)
4. Update package.json version
5. Add .nvmrc file

### Phase B: Medium Effort (1-4 hours each)
1. Implement React.lazy() for all routes
2. Create useFormState() and useFormValidation() hooks
3. Extract shared form CSS to common file
4. Create base theme CSS file
5. Add Error Boundary component
6. Create entityLookup utility
7. Add debouncing to search and sync
8. Memoize theme objects in FamilyTree and QuickEditPanel

### Phase C: Significant Refactoring (> 4 hours)
1. Split FamilyTree.jsx into smaller components
2. Split HeraldryCreator.jsx into smaller components
3. Split QuickEditPanel.jsx into smaller components
4. Refactor GenealogyContext state to use Maps
5. Implement comprehensive ARIA labels
6. Add PropTypes to all components
7. Configure Vite manual chunks for optimal splitting
8. Optimize D3 rendering in FamilyTree

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Files Analyzed | 158 |
| Critical Issues | 8 |
| High Priority | 15 |
| Medium Priority | 12 |
| Low Priority | 8 |
| **Total Issues** | **43** |
| Estimated Removable Code | ~5,700 lines |
| Estimated Duplicate Code | ~500-800 lines |

---

*Report generated by Claude Code audit process*
*Commit: c84c8f4 (pre-audit backup)*
*Tag: pre-audit-backup-20260112*
