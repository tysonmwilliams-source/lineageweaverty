# Subsystems: The Codex & Dignities

## Inventory

| File | LOC | Purpose | Health |
|---|---|---|---|
| `services/codexService.js` | 869 | Entry + link CRUD, stats, mysteria migration | Over limit; **zero cloud sync inside**, every caller must remember (most don't) |
| `utils/wikiLinkParser.js` | 338 | `[[wiki-link]]` -> HTML, auto-creates link rows | **Dataset-blind**; 3 of 5 exports dead |
| `pages/CodexLanding.jsx` | 683 | Codex home | Static-imports 57.9 KB seed data; 4 calls drop datasetId |
| `pages/CodexBrowse.jsx` | 863 | Type-filtered list | Pagination broken in grouped views; no error state |
| `pages/CodexEntryView.jsx` | 780 | Entry detail + backlinks | Delete/move don't sync; 3 DEBUG console.logs per view |
| `pages/CodexEntryForm.jsx` | 834 | Create/edit | **Only Codex file that syncs correctly.** 232 lines are inline templates |
| `pages/CodexImport.jsx` | 45 | Route shell | Fine |
| `components/CodexCleanupTool.jsx` | 604 | De-duplicate entries | Deletes without sync — **recreates the duplicates it removes** |
| `components/CodexImportTool.jsx` | 288 | Seed import UI | **DEAD — zero importers** |
| `components/EnhancedCodexImportTool.jsx` | 197 | Northern-seats import | Writes to default dataset, uploads the active one |
| `utils/codexImportProcessor.js` | 184 | Unified-import codex path | `syncAddCodexEntry` wrong arity |
| `utils/enhanced-codex-import.js` | 471 | Bulk import + clearCodex | Same arity bug; no datasetId; unsynced `.clear()` |
| `utils/codex-enhancement-import.js` | 379 | Appends voice sections | Updates without sync |
| `data/codex-seed-data.js` | 1717 (64 KB) | Wilfrey seed pack | **Shipped on /codex** |
| `data/northern-seats-codex-data.js` | 250 (11 KB) | Seats pack | Shipped in CodexImport chunk |
| `data/{veritists,charter,bastardy-naming,alliance,wilfrey-voice}-*.js` | 4363 (156 KB) | Lore packs | **DEAD — no importers, 0 KB shipped** |
| `services/dignityService.js` | 2129 | Reference data, CRUD, succession, disputes, regency | 5x limit; **succession algorithm incorrect** |
| `services/dignityAnalysisService.js` | 1064 | 10 pure data-quality analyzers | **Best-designed file in scope** — pure, Map-based, individually exported. Untested; one crash; N+1 |
| `pages/DignityView.jsx` | 2149 | Detail + 3 inline modals | State mutation in render; .find() in loops |
| `pages/DignitiesLanding.jsx` | 1059 | Grid/hierarchy browser | **Infinite recursion on cyclic fealty** |
| `pages/DignityForm.jsx` | 1054 | Create/edit | Recomputes filtered people 3x per render; no succession fields |
| `pages/DignityAnalysis.jsx` | 455 | Suggestions dashboard | Clean, but dismissals are session-only |
| `pages/DignityCrisisDashboard.jsx` | 382 | Crisis overview | Double-counts; one always-fallback icon |
| `hooks/useDignityAnalysis.js` | 504 | Analysis state + executor | **Silently ignores `autoRun`** — no useEffect exists |
| `components/DignityEducationPanel.jsx` | 537 | Rank reference | Duplicate RankPips |
| `components/DignityVisuals.jsx` / `DignityTerm.jsx` | 293 / 237 | Pips, chain, badges | Good |
| CSS (13 files) | 8,368 | — | Codex CSS theme-clean (1-3 hardcoded colours); **DignityView.css has 66**, DignitiesLanding.css 22 |

## Part A — Autonomously fixable

**[CRITICAL] Wiki-links resolve against the wrong database on any non-default dataset**
`wikiLinkParser.js:36,52,64,126` + `CodexEntryView.jsx:179`. `parseWikiLinks(markdown, sourceEntryId = null)` takes two params; the caller passes three — the datasetId is silently discarded. Inside, `getAllEntries()` (`:52`), `getOutgoingLinks()` (`:64`), `createLink()` (`:126`) all run with datasetId undefined -> default DB (`database.js:87-88`).
Failure: on world B every `[[Entry]]` renders as a grey broken link even though it exists — or worse, resolves to a **world-A entry** and emits `<a href="/codex/entry/{A's id}">`, plus writes cross-world rows into world A's codexLinks. Same for `validateWikiLinks:278`, `getSuggestedEntries:301`. Effort S.

**[CRITICAL] Deleting a Codex entry doesn't sync — deleted entries resurrect**
`CodexEntryView.jsx:266-277`, `CodexCleanupTool.jsx:148`. Both delete locally with no syncDeleteCodexEntry; neither imports useAuth. **The cleanup tool is the sharpest version: it exists to remove duplicates and its deletions are the only ones guaranteed to come back.** Effort S.

**[CRITICAL] syncAddCodexEntry called with 3 args instead of 4 — imports never reach the cloud and spawn phantom databases**
`codexImportProcessor.js:162`, `enhanced-codex-import.js:149`. Signature `(userId, datasetId, entryId, entryData)` (`dataSyncService.js:1100`); both pass `(userId, id, {...entryData, id})`, shifting datasetId = numeric entry id. `getDatabase(12)` **creates a new IndexedDB `LineageweaverDB_12` — one per imported entry.** Queue row gets `entityId: "[object Object]"`. codexImportProcessor has datasetId in scope at `:87` and just doesn't pass it. Effort S.

**[CRITICAL] DignitiesLanding hierarchy view recurses infinitely on a cyclic fealty chain**
`DignitiesLanding.jsx:264-273`. `buildNode` has no visited set; `rootDignities` (`:260-262`) admits any dignity with dignityClass==='crown' regardless of swornToId. Crown sworn to Duchy X, X sworn to Crown -> stack overflow, white screen, no error-boundary output. **This data state is common enough that `analyzeCircularFeudalChains` (`dignityAnalysisService.js:642`) was written to detect it.** Secondary: a 2-cycle without a crown makes both nodes non-roots and non-subordinates — silently invisible. Effort S.

**[CRITICAL] runFullAnalysis throws when a dignity's holder was deleted**
`dignityAnalysisService.js:347-359` — `maps.peopleById.get(dignity.currentHolderId)` unguarded, then `holder.id` at `:359`. `analyzeDeceasedHolders:262` guards this; `analyzeNoTenureRecords` doesn't. **GenealogyContext has no dignity awareness at all** (grep `dignit` returns nothing), so deleting a titled person leaves the dangling reference routinely -> `/dignities/analysis` and the landing analysis panel both error out. Effort S.

**[CRITICAL] autoRun is accepted, documented, passed by two pages, and ignored**
`useDignityAnalysis.js:38-39` destructures only scope and entityId; the hook contains **no useEffect**. `DignityView.jsx:194` and `DignitiesLanding.jsx:111` both pass `autoRun: true`. Failure: DignityView's Suggestions sidebar (`:1545`, gated on length>0) never renders; DignitiesLanding's analysis panel is permanently empty with a "Run Analysis" button as the only path. Effort S.

**[HIGH] Primogeniture ordering destroyed by the final sort — descendants of the eldest son rank behind the second son**
`dignityService.js:1688-1711`. `traversePrimogeniture` (`:1576-1619`) correctly pushes depth-first; the subsequent `candidates.sort()` reorders by `a.depth - b.depth` (`:1707`) and birth date, **converting depth-first primogeniture into breadth-first by generation.** Concrete: holder has son A (b.1200) with son A1 (b.1225), and son B (b.1205). Correct line is A, A1, B; this emits A, B, A1. Because a deceased son is marked excluded (`:1478`) and excluded candidates are pushed to the very end (`:1690`), **representation through a predeceased heir is also broken** — a dead eldest son's children land behind every living collateral. Fix: drop the depth/birth tiebreakers, preserve DFS insertion order, stop sorting excluded to the end. Effort M.

**[HIGH] Male-preference primogeniture demotes daughters below distant male cousins**
`dignityService.js:1483-1485, 1694-1695`. A female candidate gets `lowerPriority: true` and the global sort places **all** lower-priority behind **all** others, so the holder's only daughter ranks behind his brother's grandson. Real male-preference ranks a daughter after her brothers but ahead of her uncles. Fix: apply the preference only within a sibling group (it already is, at `:1607-1610`) and delete the global tiebreaker. Effort S.

**[HIGH] excludeWomen and requiresConfirmation are stored, editable in code, and never read**
`dignityService.js:608-609`; `DignityView.jsx:132-133, 553-554, 574-575`. Defaulted into successionRules, copied into modal form state, written back by handleSaveSuccessionRules. Neither is rendered as an input (the modal exposes only excludeBastards / legitimizedBastardsEligible, `:1778-1801`) and neither is read by calculateSuccessionLine. **Write-only dead state that persists to Firestore.** Effort S.

**[HIGH] Adding a second open-ended tenure produces two simultaneous "Current" holders**
`DignityView.jsx:502-519`. createDignityTenure with a blank dateEnded sets currentHolderId but never closes the existing open tenure. Two rows render a "Current" badge (`:1352-1354`), `getCurrentTenure` (`dignityService.js:915`) returns whichever comes first, and analyzeNoTenureRecords is satisfied while the history is wrong. Effort S.

**[HIGH] Ending an interregnum installs a holder with no tenure record**
`dignityService.js:1997-2013`; `DignityView.jsx:726-744`. endInterregnum writes currentHolderId and flips status to stable but creates no dignityTenures row. Same gap in the executor's transfer-dignity (`useDignityAnalysis.js:207-223`). **The succession event the whole subsystem exists to record is the one event that never lands in the rolls** — and analyzeNoTenureRecords then flags the dignity you just fixed. Effort M.

**[HIGH] updateDispute / removeDispute clobber vacant and interregnum status**
`dignityService.js:1830-1835, 1882-1887` hard-reset successionStatus='stable' when no active disputes remain, ignoring the current value. A dignity in interregnum with one resolved dispute -> remove it -> status becomes stable while `dignity.interregnum` is still populated: badge says Stable, the interregnum panel still renders (`DignityView.jsx:1073`), and getDignitiesInInterregnum still lists it (`:2023`). Fix: only downgrade when `!dignity.interregnum && !dignity.isVacant`. Effort S.

**[HIGH] Auto-created dignity Codex entries never sync, and the back-link is lost in the cloud copy**
`dignityService.js:637-666`. `createEntry(...)` at `:644` has no syncAddCodexEntry. Worse, `:655` writes codexEntryId onto the dignity locally but the `syncAddDignity(...)` at `:665` sends `record`, which still has `codexEntryId: null` (`:622`). Restore from cloud and **every dignity<->codex link is gone.** The cascade delete at `:751-758` has the mirror bug — deleteEntry without syncDeleteCodexEntry, so the codex entry resurrects orphaned. Effort S.

**[HIGH] Imports write to the default dataset regardless of the active world**
`enhanced-codex-import.js:90,142`; `import-seed-data.js:46,63,80,97,114`; `CodexLanding.jsx:184,187,190,620`. `importCodexData`'s options bag (`:50-55`) doesn't even accept a datasetId. `EnhancedCodexImportTool.jsx:43-47` then calls `forceUploadToCloud(user.uid, activeDataset.id)` — **uploading the world the rows didn't go into.** Effort M.

**[MEDIUM] Grouped browse views render every entry while showing a non-functional pager**
`CodexBrowse.jsx:674-815, 825, 831`. The flat branch maps paginated displayedEntries; the heraldry and concept branches map groupedEntries.*, derived from the full filteredEntries (`:285-299`). totalPages still uses filteredEntries.length, so with 45 heraldry entries you see all 45 **and** a "Page 1 of 3" control whose buttons change state nothing reads. Effort S.

**[MEDIUM] Codex load errors render as "no entries yet"**
`CodexBrowse.jsx:150-153` — catch logs and setLoading(false) with allEntries still [], so a failed IndexedDB read shows "No Personages Yet — Create your first entry". Same in `DignityCrisisDashboard.jsx:106-109` and `CodexCleanupTool.jsx:91` (which renders a false "No Duplicates Found!"). Effort S.

**[MEDIUM] `people` state array mutated during render** — `DignityView.jsx:1638-1639` `{people.sort(...).map(...)}`. `:1811/:1925/:2091` are safe only because .filter copies first. Effort S.

**[MEDIUM] .find() in render loops across all four Dignity pages**
`DignityView.jsx:200,206,212` and `:1643-1644`; `DignitiesLanding.jsx:149-166` (called inside the search filter at `:193-196`); `DignityForm.jsx:809,822,829` (getFilteredPeople() invoked three times per render, each copying/filtering/sorting people with a getHouseName .find() inside the comparator, `:223-231`). With 800 people and 250 dignities, **every keystroke in the DignitiesLanding search box performs ~200k linear scans; there is no debounce** (`:500`). Effort M.

**[MEDIUM] N+1 tenure fetch** — `dignityAnalysisService.js:929-934` sequential await per dignity. Fix: one `db.dignityTenures.toArray()` grouped by dignityId. Effort S.

**[MEDIUM] analyzeEntity runs all ten analyzers over the whole dataset to filter for one entity** — `dignityAnalysisService.js:1034-1042`, called per-DignityView once autoRun is fixed. Effort M.

**[MEDIUM] "Transfer to Heir" marks the dignity vacant** — `useDignityAnalysis.js:216-222` sets `currentHolderId: null, isVacant: true`, identical to the "Mark as Vacant" alternative, despite the label and preview saying "transfer to heir" (`dignityAnalysisService.js:283-293`). Effort S.

**[MEDIUM] Stale codexLinks are never pruned; renames break inbound links**
`wikiLinkParser.js:98-121` only ever *adds* link rows. Remove a `[[Foo]]` and the row survives, so Foo keeps a phantom backlink forever (with an empty snippet, since getContextSnippet can no longer find the pattern, `:172`). Renaming a title leaves every `[[Old Title]]` pointing at nothing — no rename propagation, no broken-link report (**`validateWikiLinks` exists at `:274` with zero callers**). Effort M.

**[MEDIUM] Wiki-links are matched against HTML-escaped output**
`wikiLinkParser.js:41-45` — `marked.parse()` runs first, then `[[...]]` is matched in the resulting HTML. An entry titled `Houses & Cadet Branches` appears as `[[Houses &amp; Cadet Branches]]`, so `entryMap.get(...)` (`:91`) misses and it renders broken. `String.replace` at `:96` also interprets `$&`/`$1`, so a title containing `$` corrupts output. Fix: substitute on raw markdown before parse, or use a replacer function. Effort S.

**[MEDIUM] Debug logging shipped on the hot path** — `CodexEntryView.jsx:174-176, 182, 214`: five unguarded console.logs per entry view, three prefixed `📝 RAW CONTENT` / `📝 PARSED HTML` dumping 200-300 chars of user content. Totals in scope: dignityService 56, codexService 39, DignityView 13, CodexEntryView 11, useDignityAnalysis 5, enhanced-codex-import 31 (incl. a ~20-line banner at `:316-355`). Effort S.

**[MEDIUM] Dead code** — five lore data files (4,363 lines / 156.5 KB, no importers, verified absent from dist/); `CodexImportTool.jsx` (288); `wikiLinkParser.js:239,274,298` (extractWikiLinks, validateWikiLinks, getSuggestedEntries — WritingEditor uses a different function from writingLinkService); `enhanced-codex-import.js:208,432` (branches throwing errors referencing a deleted file); `DignityCrisisDashboard.jsx:19` (unused DIGNITY_CLASSES). **Delete the data files and CodexImportTool; WIRE UP validateWikiLinks and getSuggestedEntries rather than deleting them — they're the two missing wiki features.** Effort S.

**[MEDIUM] /codex ships 57.9 KB of seed data to display five integers**
`CodexLanding.jsx:25,166` -> `import-seed-data.js:16,205-219` -> `codex-seed-data.js`. Verified against a real build: `codex-seed-data-DpBzg2Nm.js` is 57,930 B raw / 17,119 B gzip, shared by `/codex` and `/codex/import`. It is **2.2x the size of the CodexLanding chunk itself** (25,751 B), and the only thing read on load is getImportPreview()'s five `.length` values. `northern-seats-codex-data.js` is 9,305 B of the 19,636 B CodexImport chunk (47%) via a static import at `EnhancedCodexImportTool.jsx:15`. Total codex data shipped ~75.4 KB raw / ~23.4 KB gzip = 2.87% of 2,627.5 KB total JS. Fix: hardcode the preview counts, move both to click-time `await import()`. Effort S.
*Context: the real bundle problem is elsewhere — index-*.js is 1,153 KB (346 gzip), 42.9% of all JS, on first paint, partly because Vite warns codexService.js and dignityService.js are both statically and dynamically imported (28 and 16 static importers), defeating their own lazy splitting.*

**[MEDIUM] DignityView.css hardcodes 66 colours on dark-theme assumptions**
`:96-112, 235-256, 590-611, 691-692` (+22 in DignitiesLanding.css). Class/succession-status/claim-strength badges use a fixed palette (#ffd700, #d4af37, #22c55e, #3b82f6, #fbbf24, #ef4444, #a78bfa) over rgba(...,0.15-0.2) washes that only read as tinted chips on a dark surface. **There are seven themes, not the two CLAUDE.md mentions**; in light-manuscript these become near-white chips with saturated small text. Codex stylesheets are clean by comparison (1-3 each). Effort M.

**[LOW] Framer animations ignore prefers-reduced-motion** — ten in-scope stylesheets have the CSS block; `grep useReducedMotion src/` returns nothing, and essentially all motion here is Framer-driven, so the CSS blocks are decorative.
**[LOW] Duplicate formatDate x3** (`CodexLanding.jsx:666`, `CodexBrowse.jsx:302`, `DignitiesLanding.jsx:332`), **duplicate RankPips** (`DignityVisuals.jsx:34` exported vs `DignityEducationPanel.jsx:61` local with different props), **CLASS_ICONS defined identically 3x** (`DignityView.jsx:97`, `DignitiesLanding.jsx:71`, `DignityCrisisDashboard.jsx:62`).
**[LOW] Non-keyboard-accessible rows and modals** — `CodexBrowse.jsx:351-358`, `DignitiesLanding.jsx:359-364` (motion.article onClick, no role/tabIndex/onKeyDown); all four DignityView modals (`:1572, :1733, :1857, :2028`) lack role="dialog", aria-modal, focus trap, Escape; `DignityCrisisDashboard.jsx:339-346` builds a table from divs.

**[LOW] Assorted small breakages**
- `DignitiesLanding.jsx:1023` renders `selectedDignity.description` — the record has `notes`, never `description` (`dignityService.js:562-632`). Preview panel always omits notes.
- `DignityCrisisDashboard.jsx:354` reads `dispute.dignityClass`; getAllDisputes only attaches dignityId and dignityName (`dignityService.js:1931-1935`) -> icon always falls back.
- `DignityCrisisDashboard.jsx:127` sums interregnums + crises + vacants, which overlap -> headline over-reports.
- `CodexEntryView.jsx:251-256` falls back to `linkedPerson?.id`, but the calling button is gated on `entry.personId` (`:534`) -> the auto-match path is unreachable.
- `DignityView.jsx:1345` numbers tenures `tenures.length - index` over an oldest-first list -> the oldest row is #N and the newest is #1.
- `DignityView.jsx:1033` defaults nature to 'territorial', `:1260` doesn't -> legacy rows never show Grant Details.
- `dignityService.js:1743` getHeir uses maxDepth=5; the view uses 10 -> heir and line can disagree.
- `CodexEntryForm.jsx:137-145` switching type while creating silently overwrites typed content with the new template.
- `CodexCleanupTool.jsx:46` `entry.title.toLowerCase()` unguarded; `:58` `new Date(undefined)` -> NaN sort, so "keep the oldest" isn't guaranteed. **The cleanup tool keys on `title.toLowerCase().trim()` while the importers dedupe on an exact case-sensitive Set (`codexImportProcessor.js:110`) — that mismatch is a plausible origin of the duplicates.**
- `enhanced-codex-import.js:449-456` quickImports.everything drops `concepts`, handled everywhere else.
- `codexImportProcessor.js:136-150` `delete entryData._autoLink` only runs inside the ID-map branch -> the internal field persists to IndexedDB and Firestore.
- `useDignityAnalysis.js:267,341` lexical const inside a switch case without braces.
- `dignityAnalysisService.js:578` and `dignityService.js:1612` both treat year 0 as missing.

## Part B — Needs user input

**1. What should the succession algorithm actually model?** The current implementation matches no real system: DFS traversal (primogeniture) overwritten by a generational sort (seniority-ish), with women globally demoted and the dead pushed to the end. Fixing the sort is mechanical; deciding the target semantics isn't.
(a) *Implement textbook rules properly* — male-preference primogeniture with representation, absolute primogeniture, agnatic seniority — extracted into a pure `src/utils/successionRules.js` with a test per rule. ~1-2 days incl. tests; **will reorder existing displayed lines**, and you may have written prose around the current output.
(b) *Minimal correctness patch* — preserve DFS order, keep the dead in place as "skipped, issue passes through", scope male preference to sibling groups. ~2 hours; leaves agnatic seniority's house-equals-dynasty assumption.
(c) *Make it advisory* — relabel "Suggested line of succession", add manual override ordering. Cheapest, abandons the feature's core promise.

**2. Is a "dynasty" a house, or a bloodline?** `traverseAgnaticSeniority` (`dignityService.js:1627-1632`) defines the dynasty as `p.houseId === currentHolder.houseId`. Cadet branches have their own houseId with a parentHouseId link, so **agnatic seniority silently excludes every cadet — the exact people who inherit under that system.** (a) walk parentHouseId to the root house; (b) compute genuine agnatic descent from the relationship graph, ignoring houseId; (c) a per-dignity "dynasty root house" field. (b) is most correct and most expensive.

**3. How should adopted and fostered children rank?** `checkEligibility` (`:1476-1500`) handles bastard and nothing else. `adopted` currently inherits identically to a natural legitimate child, and childrenMap is built only from `relationshipType === 'parent'` (`DignityView.jsx:259`, `dignityAnalysisService.js:49`) so adopted-parent / foster-parent links are invisible to succession. Both defaults are silent. (a) add `excludeAdopted` to successionRules and surface it; (b) hard-code a genre default (adopted excluded from territorial, eligible for office); (c) include adopted-parent edges with lower priority. **A worldbuilding rule, not a bug — you have to pick.**

**4. Should suggestion dismissals persist?** useDignityAnalysis holds dismissed/deferred/applied in React state only, and suggestion IDs regenerate every run (`dignityAnalysisService.js:27` uses Date.now() + random), so **a dismissal cannot survive a re-run even in principle.** The dashboard offers Deferred and History tabs over data that evaporates on reload. (a) derive a stable fingerprint (type + sorted affected entity ids) and persist in a Dexie table with sync; (b) localStorage, unsynced, per-device; (c) remove the tabs and the dismiss button, making the panel a live report. (a) adds a synced entity type.

**5. Where do dignities live in the Codex?** createDignity auto-creates the entry as `type: 'mysteria'` (`dignityService.js:645`), while `codexService.js:668-792` provides four functions and `CodexEntryView.jsx:554-562` a per-entry button to migrate mysteria entries *out* to `type:'heraldry', category:'titles'`. **Every new dignity re-creates the problem the migration exists to solve.** (a) change the default to heraldry/titles and run the migration once; (b) add a first-class `dignity` codex type (touches TYPE_CONFIG in three files, CATEGORIES, ENTRY_TYPES, TYPE_ICONS); (c) stop auto-creating and make it an explicit button.

**6. Should Codex titles be unique?** Wiki-links resolve by lowercased title through a Map (`wikiLinkParser.js:56-59`), so two entries titled "Aldric" silently collapse to whichever was inserted last and the other becomes unreachable by link. Nothing enforces or warns. (a) enforce uniqueness at save with an inline error; (b) allow duplicates, resolve by title+type, support `[[Aldric|personage]]`; (c) auto-disambiguate on save. Affects existing data either way.

## Redesign opportunities

### The Codex

**What it is today.** `/codex` is a vertically stacked marketing page: full-width illuminated "THE CODEX" hero, decorative divider, a search box that only submits on Enter and navigates away, a 2-up stats grid, a 3-column quicknav, an 8-tile category grid, a Recently Updated list, a biography-coverage bar, four action buttons, and a footer reading "A living chronicle of your world". **Nothing above the fold is content.** `/codex/browse/:type` re-renders a breadcrumb, a 32px icon header, *the same two stat cards again*, a filter row, a collapsed tag drawer, then a flat list of rows (icon, title, subtitle, up to three tags, "N words · 3d ago · Era", chevron). 20 per page, prev/next only. `/codex/entry/:id` is a single centred article card with **a red Delete button at the top of the page**, an optional heraldry panel, sparkle dividers, the markdown, and the grouped backlinks panel. Editing is a separate full-page route with a 20-row raw `<textarea>`, no preview, no autocomplete, and a "Clean Formatting" button that exists because pasting is unreliable.

**The gap: a codex should feel like a fast wiki. This one is a brochure wrapped around a form.**

1. **The landing page should be the search page.** Search on `/codex` is a form that navigates to `/codex/browse/all?search=…` (`CodexLanding.jsx:225-230`), and the state doesn't round-trip back. Replace the hero with a persistent command palette (⌘K anywhere): live-ranked results grouped by type, Enter to open, ⌘Enter to create with that title. **`searchEntriesFullText` already exists (`codexService.js:369`) and is unused.** Demote stats/quicknav/coverage to a right rail or an Overview tab.
2. **Reading and editing should be the same screen.** Two full-page routes and a `window.confirm("Discard changes?")` (`CodexEntryForm.jsx:312`) between reading a typo and fixing it is the single biggest friction point. Click-to-edit in place, autosave on blur with a debounce, entity/backlinks/metadata stable around it. Keep `/codex/edit/:id` as a deep link.
3. **Wiki-links need to feel alive.** `getSuggestedEntries` (`wikiLinkParser.js:298`) is written, correct, sorted exact->prefix->contains, and called by nothing. Wire it to a `[[` trigger. Then hover-preview cards, red-underline broken links with one-click "Create this entry", and a per-entry "N broken links" chip driven by the equally unused `validateWikiLinks`.
4. **The backlinks panel is the best thing here — promote it.** Grouped by type with context snippets (`CodexEntryView.jsx:685-752`) is genuinely good. Move it into a persistent right rail with outgoing links and a small local graph, instead of burying it below the article behind two sparkle dividers.
5. **Kill the destructive-action prominence.** A red Delete sits in the header row next to Edit (`:564-570`), fired by window.confirm. Overflow menu; in-app dialog; undo toast. Replace confirm/alert at `:268, :275, :283, :300, :303`.
6. **Browse should support a scan.** Two stat cards repeated from the landing page consume the top of every list. Density toggle (comfortable/compact/table), virtualised list, infinite scroll or a jump-to-letter rail instead of prev/next, every filter mirrored into the URL so a filtered view is linkable. **Rows should show a content excerpt — that's what tells you whether it's the entry you want.**
7. **The eight category tiles are a taxonomy, not navigation.** personage/house/location/event/mysteria/concept/heraldry/custom, two of which are secretly two-level via a `category` field (`CodexBrowse.jsx:285-299`), one of which (mysteria) is mid-migration. Flatten to a faceted sidebar over one list.

### Dignities

**What it is today.** `/dignities` opens with a title, subtitle, Charter epigraph, crown divider, a 5-up stat strip, four filter dropdowns and a grid/hierarchy toggle. Grid mode renders spring-animated cards; clicking one opens a **preview modal** showing a subset of the same fields plus "View Details" — a modal between you and the page you asked for. Hierarchy mode is an indented list, `marginLeft: depth * 24`. Below the fold: all seven Charter articles as static cards, an analysis panel, four nav buttons, a closing epigraph. `/dignities/view/:id` is a 1fr/320px detail page: Current Holder, Feudal Hierarchy, Linked Entities, Succession (rules summary, interregnum alert, line of succession as up to 10 numbered rows, disputed claims), Grant Details, Tenure History — plus a sidebar and four modals.

**The gap: succession is the reason this subsystem exists, and it is rendered as a numbered text list two-thirds of the way down a long scroll — the same visual weight as "Linked Entities". Meanwhile the hierarchy view, which is the actual shape of the data, is an indented `<div>` list.**

1. **Lead the detail page with a succession banner.** One always-visible row: current holder -> heir apparent -> status, colour-coded by successionStatus, dispute count and interregnum state inline.
2. **Draw the line of succession as a tree, not a list.** The data is a family-tree walk; the render is `1. Aldric — Son / 2. Beren — Brother / 3. Cara — Niece (collateral)`. A small vertical tree — holder at the root, direct issue in the trunk, collateral branches offset, excluded people struck through with the reason as a chip — makes primogeniture legible instantly, **and would have made the depth-sort bug visible on day one.** Add "why?" popovers: *"2nd — eldest son of the holder's predeceased eldest son (representation)"*.
3. **Merge the crisis dashboard into the landing page.** `/dignities/crises` (382 lines) is three thin filters over getAllDignities; it duplicates the analysis panel and the counts overlap (`:127`). One "Needs attention" strip at the top of `/dignities`, full list one click away.
4. **The hierarchy view should be the default and a real tree.** It is the domain model. Collapsible branches, drag-to-reparent (writing swornToId), inline holder + vacancy badges, and a cycle guard that surfaces broken chains rather than crashing. Grid becomes the secondary view — **and a genuine sortable table would serve "which of my 200 titles is vacant" better than 200 spring-animated cards.**
5. **Delete the preview modal** (`DignitiesLanding.jsx:920-1053`). Navigate directly; use the shared layoutId for the transition if the animation is the point.
6. **Move succession configuration into the form.** DignityForm has no succession fields at all — every dignity is born male-primogeniture and the only way to change it is a modal three clicks deep on the detail page (`DignityView.jsx:1049`). It belongs next to Dignity Nature, shown conditionally on natureHasSuccession.
7. **Make tenure history a timeline.** A horizontal band with gaps visible and overlaps flagged in red — **which is how the two-simultaneous-current-holders bug would announce itself.** `analyzeTemporalIssues` already computes exactly these anomalies.
8. **Retire the Charter recital.** Seven static articles on every landing visit, duplicating DignityEducationPanel (537 lines, collapsible, better) and DignityTerm's contextual tooltips. Link to it; don't recite it.
9. **Extract the four modals.** DignityView is 2,149 lines, ~580 of which are inline modal JSX (`:1569-2144`) sharing a header/body/footer skeleton, none trapping focus or handling Escape. One `<DignityModal>` + four small forms takes the page under 900 lines and fixes a11y in one place.
10. **Fix the theme break before adding anything.** 66 hardcoded colours in DignityView.css on translucent-dark assumptions means every status/class/claim-strength chip degrades in the six non-parchment themes. **Cheapest visible quality win in the subsystem.**
