# Subsystem: Family Tree / Genealogy

## Inventory

| File | LOC | Purpose | Health |
|---|---|---|---|
| `src/pages/FamilyTree.jsx` | 1941 | D3 tree renderer + all tree UI state | **Critical** — 2.4x the 800-line page cap, 16 lint errors incl. a `no-undef`, one 21-dep effect, hardcoded person ID |
| `src/pages/ManageData.jsx` | 741 | Tabbed CRUD hub | Fair — all feedback is `window.alert`/`confirm` |
| `src/contexts/GenealogyContext.jsx` | 745 | Shared data + mutations + sync orchestration | **Poor** — dataset switch doesn't reload; periodic sync self-cancels; codex ops unscoped; 32 console.logs |
| `src/components/QuickEditPanel.jsx` | 1728 | Tree-side person inspector/editor | **Critical** — 3.4x cap; broken co-parent dropdown; silent unsaved-edit loss |
| `src/components/PersonForm.jsx` | 615 | Full person editor | Fair — string date comparison bug |
| `src/components/HouseForm.jsx` | 735 | House editor | Poor — hosts unsynced household-roles panel |
| `src/components/RelationshipForm.jsx` | 753 | Relationship editor | Fair — raw select over all people |
| `src/components/PersonList.jsx` | 586 | People list | **Poor** — house filter always returns 0; setState inside useMemo |
| `src/components/HouseList.jsx` | 506 | House list | Fair — same setState-in-useMemo (line 184) |
| `src/components/RelationshipList.jsx` | 383 | Relationship list | Good |
| `src/components/BranchView.jsx` | 553 | Split-screen fragment view | Fair — duplicate harmonizeColor w/ different formula |
| `src/components/TreeLandingView.jsx` | 364 | House-picker landing | Fair — wrong colour source; not keyboard-reachable |
| `src/components/TreeSettingsPanel.jsx` | 198 | Tree controls drawer | Fair — stale copy; focusable when hidden |
| `src/components/TreeControls.jsx` | 160 | Zoom | Good — 2 dead props |
| `src/components/FragmentNavigator.jsx` | 78 | Fragment jump pill | Poor — hover-only; callback throws |
| `src/components/PersonCard.jsx` (+css) | 388 | — | **DEAD** zero imports |
| `src/utils/treeHelpers.js` | 522 | Scoping/fragments/generations | Fair — 5 console.logs in hot path |
| `src/utils/familyBlockLayout.js` | 619 | Layout engine | Poor — unbounded recursion on cycles; O(n^2) includes |
| `src/utils/treeRelationshipMaps.js` | 44 | Lookup maps | Poor — 1:1 spouse map drops remarriages; ignores divorce |
| `src/utils/RelationshipCalculator.js` | 628 | Kinship labelling | Fair — duplicate buildRelationshipMaps w/ different semantics |
| `src/utils/layoutPatternAnalyser.js` | 649 | Pattern mining | **DEAD** zero imports |
| `src/components/household/HouseholdRolesPanel.jsx` | 348 | Household roles UI | **Poor** — no sync, no dataset scoping |
| `src/components/household/HouseholdRoleForm.jsx` | 313 | Role modal | **Poor** — never passes userId |
| `src/services/householdRoleService.js` | 363 | Role CRUD | **Critical** — default-DB singleton + wrong sync arity |
| `src/hooks/useListKeyboardShortcuts.js` | 47 | / focus, Esc clear | Good |

No tree-specific hooks; all tree state inline in FamilyTree.jsx.

## Part A — Autonomously fixable

**[CRITICAL] Dataset switch never reloads genealogy data**
`src/contexts/GenealogyContext.jsx:128-142` — load effect deps `[user, syncInitialized]`; `activeDataset` absent. `DatasetContext.switchDataset` (`DatasetContext.jsx:133-167`) only calls `setActiveDataset`, no reload/refreshData.
Failure: switch world A->B, screen still shows A. Editing writes A's IDs into B's IndexedDB and `syncUpdatePerson(uid, B, ...)` corrupts B in Firestore. Two worlds cross-contaminate.
Fix: add `activeDataset?.id` to deps + reset syncInitialized; or `<GenealogyProvider key={activeDataset?.id ?? 'default'}>` at `App.jsx:370`. Effort S.

**[CRITICAL] Household roles bypass dataset scoping**
`householdRoleService.js:10` imports default-DB singleton (`database.js:136`). `getRolesForHouse:102`, `createHouseholdRole:48`, `updateHouseholdRole:152`, `deleteHouseholdRole:178` — none accepts datasetId.
Failure: create Steward for House X in world B -> row lands in world A.
Fix: thread datasetId, use `getDatabase(datasetId)` like codexService. Effort M.

**[CRITICAL] Household-role sync wrong arity + never called**
`householdRoleService.js:55` `syncAddHouseholdRole(userId, id, role)` vs signature `(userId, datasetId, roleId, roleData)` (`dataSyncService.js:1412`). Same at :159, :185. UI callers never pass userId: `HouseholdRoleForm.jsx:113,115`, `HouseholdRolesPanel.jsx:157,169`.
Failure: roles never sync (GOLDEN RULE violation). If userId were passed, junk rows in syncQueue would block startup sync and wedge all syncing.
Fix: correct arity + add datasetId + pass user?.uid and activeDataset?.id. Effort M.

**[CRITICAL] Auto-created Codex entries written to wrong database**
`GenealogyContext.jsx:258` `createCodexEntry({...})` with no datasetId (sig `createEntry(entryData, datasetId)` `codexService.js:32`); `getDatabase(undefined)` -> default (`database.js:88-89`). Same at :358 `deleteCodexEntry(codexEntryId)`.
Failure: in non-default dataset, adding a person writes bio stub into world A's codex, stores foreign codexEntryId on person in B. QuickEditPanel `getEntryByPersonId(personId, activeDataset.id)` (`:179`) finds nothing -> "No Codex entry linked". Deleting person deletes a stranger's entry in A.
Fix: pass datasetId to both. Effort S.

**[CRITICAL] navigateToFragment throws ReferenceError**
`FamilyTree.jsx:243` `setFragmentNavExpanded(false);` — no such state anywhere (ESLint no-undef). Reached from `FragmentNavigator.jsx:61`.
Failure: any multi-fragment house — clicking a branch throws uncaught error into render tree.
Fix: delete the line. Effort S.

**[CRITICAL] House filter in People list matches nothing**
`PersonList.jsx:199` `p.houseId === filterHouse`. houseOptions uses `value: h.id` (number, `:177`); FilterDropdown emits `e.target.value` (string, `shared/FilterDropdown.jsx:30`); `person.houseId` is number (`PersonForm.jsx:164` parseInt).
Failure: pick any house -> "0 of 412", empty list, every time.
Fix: `Number(filterHouse)`. Effort S.

**[HIGH] Periodic background sync started then immediately cancelled**
`GenealogyContext.jsx:165-169` sets syncInitialized(true) then startPeriodicSync in same tick; re-render runs cleanup `:139-141` stopPeriodicSync; re-run hits neither branch.
Failure: the 5-minute data-loss safety net (`dataSyncService.js:462-477`) never fires all session.
Fix: separate effect keyed `[user?.uid, activeDataset?.id]`. Effort S.

**[HIGH] Co-parent dropdown renders blank unselectable options**
`QuickEditPanel.jsx:1557-1561` maps `spouse.id` but spouses is `[{person, relationshipId}]` (`:270-282`).
Failure: Add Child -> "Other Parent" shows blank rows; coParentId null; `createRelationshipForPerson:684` never creates 2nd parent link; child renders as single-parent bastard line.
Fix: `spouses.map(({person: sp}) => ...)`. Effort S.

**[HIGH] Remarriages and divorces silently erased from tree**
`treeRelationshipMaps.js:28-29` plain Map keeps only last spouse; no divorce filter — unlike `RelationshipCalculator.js:612-618` which does filter.
Failure: widowed+remarried king shows one queen; other children drawn as bastard lines (`FamilyTree.jsx:1249-1255`). Divorced couples still show solid marriage line. Calculator and renderer disagree.
Fix: Map<id,id[]> + primarySpouseOf accessor; consolidate the two buildRelationshipMaps. Effort L.

**[HIGH] Cyclic ancestry hangs browser; DB guard is dead**
`database.js:918` checks `'parent-child'` but app writes `'parent'` (`RelationshipForm.jsx:52`, `QuickEditPanel.jsx:666`, `treeRelationshipMaps.js:33`). So detectCircularAncestry never runs (only caller `database.js:932`). `familyBlockLayout.js:95-116` getDescendantGenerations has no visited set.
Failure: one cyclic edge from bulk import / AI proposal executor / restored backup (all bypass SmartDataValidator) -> infinite loop, tab freeze, no error.
Fix: guard `=== 'parent' || === 'adopted-parent'`; add visited Set. Effort S.

**[HIGH] Person renames leave Codex entry permanently stale**
`GenealogyContext.jsx:315-335` updatePerson never touches linked codex entry although addPerson `:258-276` denormalizes title/subtitle/genealogyData.
Failure: rename -> Codex still shows old name; wiki-links and search resolve to old name forever.
Fix: on mirrored-field change call updateEntry + syncUpdateCodexEntry. Effort M.

**[HIGH] setState during render in list components**
`PersonList.jsx:286-288`, `HouseList.jsx:184-186` — setCurrentPage inside useMemo. Fix: useEffect. Effort S.

**[HIGH] Dead 649-line module + dead 388-line component**
`utils/layoutPatternAnalyser.js` and `components/PersonCard.jsx`+css — zero importers. Archive. Effort S.

**[MEDIUM] Hardcoded person ID in layout algorithm**
`FamilyTree.jsx:1514-1515` `const isLochlann = group.parentId === 18; const yOffset = isLochlann ? -5 : 0;` — one-off nudge baked into shared code. Effort S.

**[MEDIUM] Three-digit years compare wrong in every date validator**
`PersonForm.jsx:144`, `RelationshipForm.jsx:217`, `PersonList.jsx:226-228` (localeCompare).
Failure: born 999 died 1010 -> "1010" < "999" true -> refuses to save. 900s sort after 1000s.
Fix: shared parseYear + numeric compare. Effort S.

**[MEDIUM] harmonizeColor duplicated with divergent maths**
`treeHelpers.js:85-118` (x0.8, hex) vs `BranchView.jsx:36-65` (255-(255-c)x0.85, rgb()). Same house darker in Branch View side by side. Also duplicate CARD_WIDTH/HEIGHT/SPACING (`BranchView.jsx:24-31` vs `FamilyTree.jsx:101-117`). Effort S.

**[MEDIUM] Tree landing cards use wrong colour system**
`TreeLandingView.jsx:294` `getHouseColor(house.id)` — takes palette INDEX not ID (`themeColors.js:35`). Every other surface uses `house.colorCode`. First screen of /tree shows different colours than the tree. Effort S.

**[MEDIUM] drawTree re-runs on 21 deps, rebuilds every map**
`FamilyTree.jsx:352` 21-entry dep array. `buildRelationshipMaps` (`:145`) unmemoized, called from `:152, :954, :368, :1840, :1877`, each rebuilding six Maps over whole dataset. Then `d3.selectAll('*').remove()` + re-append all.
Failure: typing in nav search full-rebuilds SVG every keystroke.
Fix: useMemo the maps; hoist positionMap; split effect. Effort M.

**[MEDIUM] O(n^2) membership tests in layout hot path**
`familyBlockLayout.js:408,502,532,281,290`; `FamilyTree.jsx:1246,1262,1337`. 400-person generation = ~160k array scans per redraw. Fix: Sets. Effort S.

**[MEDIUM] Cousin marriage produces NaN x and vanishing children**
`familyBlockLayout.js:522-535` — spouse positions (`:479`, `:587`) carry no blockCenterX. Both spouses in prevGenIds -> `currentX = NaN` -> `x="NaN"`, children vanish from SVG. Effort S.

**[MEDIUM] No cleanup on async loads**
`QuickEditPanel.jsx:142-161` four un-cancelled loaders; `loadWritingBacklinks:230-246` serial await loop. `HouseholdRolesPanel.jsx:99-101` no cancelled flag.
Failure: clicking through people fast shows person 5's header with person 2's dignities. Effort S.

**[MEDIUM] Tree settings drawer focusable while invisible**
`TreeSettingsPanel.jsx:52-55` maxHeight:0/opacity:0 — children stay in tab order & SR. Fix: inert. Effort S.

**[MEDIUM] Dignities on tree cards from wrong dataset**
`FamilyTree.jsx:304` `getAllDignities()` no arg -> default DB (`dignityService.js:697`, `database.js:89`). Effort S.

**[LOW] Stale "coming soon" copy over shipped feature** `TreeSettingsPanel.jsx:108-110`.
**[LOW] Fragment-separator style persisted but no UI** `FamilyTree.jsx:205-213` unused handler.
**[LOW] Dead imports/props/state/commented block** FamilyTree.jsx `:16, :21, :67, :86, :1534`, 137-line commented drawDevAuraOverlay `:802-939`, dev layout stubs `:119-126` keeping ~70 lines of drag code `:403-470` unreachable. QuickEditPanel `:35`. GenealogyContext `:56, :75`. TreeControls onZoomChange/isDarkTheme (`FamilyTree.jsx:1825-1826`).
**[LOW] 64 console.logs in subsystem hot paths** FamilyTree 26, GenealogyContext 32, treeHelpers 5 (`detectGenerations:455,462,466,471,520` every redraw), QuickEditPanel 6. householdRoleService already guards correctly — copy that.

## Part B — Needs user input

1. **Multiple spouses: model change or UI constraint?** Renderer assumes 1 spouse (`treeRelationshipMaps.js:28`), model stores many. (a) full support Map<id,id[]>, stacked couples + marriage dates — correct for domain, L effort touching familyBlockLayout/detectGenerations/drawChildLines/BranchView; (b) primary-spouse convention + "m. 3x" badge, M effort; (c) block second concurrent spouse in SmartDataValidator.

2. **Should divorce/widowhood change the tree, and how?** `RelationshipCalculator.buildRelationshipMaps:614` excludes divorced; `treeRelationshipMaps.js` includes. One is wrong. (a) distinct line style (betrothal dash exists at `FamilyTree.jsx:672`), (b) hidden from tree but kept in record, (c) only current marriage renders.

3. **QuickEditPanel unsaved-edit loss — autosave or guard?** `:142` resets editedPerson on person change; `handleSave:391` only on footer button. (a) autosave on blur (`src/hooks/useAutoSave.js` exists), (b) dirty-check confirm, (c) disable relative chips while dirty. Autosave is chattier under last-write-wins sync.

4. **FamilyTree.jsx decomposition appetite.** 1941 lines, ~800 in the D3 drawTree closure capturing 20+ locals. (a) useTreeLayout + pure renderTree — clean but big diff over hand-tuned pixel logic; (b) extract only drawPersonCard/drawChildLines/drawMarriageLine/fragment decorations to `utils/treeRenderers.js` (~600 lines out, layout untouched); (c) leave it.

5. **Household roles: fix in place or fold into Dignities?** Roles are unscoped, unsynced, buried in HouseForm `:695` — reads as unfinished experiment. dignityService already models `dignityNature: 'office'`.

## Redesign opportunities

**QuickEditPanel should be a reading surface first.** 384px column with two live inputs + one live select + five collapsibles + a Save that only commits three fields, while Add Title / View Biography / Full Edit navigate away. Incoherent contract. Split into read view (name, dates, house, titles, relatives, bio snippet — no inputs) with an Edit affordance flipping to a form with explicit Save/Cancel + dirty indicator. Then relative chips navigate freely. Cut the staggered accordion mount animations (`:1031, :1073, :1163, :1232, :1311`, delay 0.25-0.4) that make the panel visibly assemble every click — single fade.

**Relationship editor needs a graph, not two selects.** `RelationshipForm.jsx:378-383, :406-411` render every person into native dropdowns; unusable at 400 people. `PersonPicker` already exists (`TreeSettingsPanel.jsx:75`). Add a live preview strip: "**Aldric** is the parent of **Cair**" with avatars, making direction self-evident (the eight person1Label/person2Label config entries exist only to explain it). Better: right-click card -> "Connect to..." -> click second card -> pick type.

**Manage Data is a 7-tab wall duplicating the tree.** People/Houses/Relationships are three lists of one graph; Relationships is a raw join table. Collapse to Records (people+houses, unified search, relationships edited inline on the person) + a Tools drawer (Import/Export, Health, Maintenance). Move the permanent "Danger Zone" reset button (`:606`) into Maintenance. Replace twelve window.alert/confirm (`:158,169,179,193,203,243,252,260,265,286,292,294`) with toasts + proper dialog (Modal.jsx exists).

**No keyboard story, no mobile story.** FragmentNavigator opens on onMouseEnter only (`:21`) — unreachable by keyboard and touch. TreeLandingView cards are motion.div onClick, no role/tabIndex/key handler (`:300-308`). Settings drawer tabbable while invisible. On phone: fixed 288px settings at top-20 right-6, fixed zoom cluster, fixed "All Houses" at bottom 6rem (`:1889`), full-width QuickEdit — four fixed layers over an SVG that only pinches. Min fix: real buttons, click-toggle fragment pill, and one bottom sheet under 768px.

**Surface the tree's diagnostics instead of logging them.** `FamilyTree.jsx:162-168` logs fragment counts and lineage gaps; `:1033-1035` logs scope size and root; `treeHelpers.js:462` warns "No root people found (everyone has parents)" — exactly what the user needs when they see "No root couple found." (`:1047`). Turn into an inline status line: "12 of 47 members shown - 3 disconnected branches - no root found: every member has a recorded parent", fragment count linking to the navigator.
