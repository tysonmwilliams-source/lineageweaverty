# Cross-System Integrity & Performance at Scale

**Scope note on the snapshot.** `docs/claude-context/*.json` is a *field whitelist*, not a dump (`contextService.js:1096-1199`). It omits exactly the cross-link fields an integrity audit needs: `codexEntryId`, `swornToHouseId`, `heraldryId`, `gender`, `legitimacyStatus`, relationship marriage/betrothal dates, `codexEntries.personId/houseId`, and any heraldry->house link. Those checks are marked **unverifiable**. Usefully, the export *denormalizes* names (`houseName`, `person1`, `currentHolder`), so `"Unknown"`/`null` there is itself a dangling-ref detector — that is how the dignity-7 break was found.

## Real data anomalies (the owner's actual world)

**The genealogy core is exceptionally clean — every structural check passed.** The damage is concentrated in the Codex and at the top of the dignity hierarchy.

| Check | Count | Examples |
|---|---|---|
| people -> missing houseId | **0** | all 320 resolve; 0 null |
| relationships -> missing person id | **0** | 477/477 resolve |
| self-referential relationships | **0** | |
| duplicate relationships (exact + symmetric) | **0** | |
| reciprocal parent pairs (A<->B) | **0** | |
| people with >2 biological parents | **0** | 179 have 2, 23 have 1, 118 roots |
| ancestry cycles | **0** | full DFS over 381 parent edges |
| death before birth | **0** | 127 have both dates |
| implausible lifespan (>100y or 0y) | **0** | max 90y (Agnes Wilfern 1872-1962) |
| child born before parent / after parent's death | **0** | parent-age range 16-67, all 382 pairs |
| parent under 16 at birth | **0** | min 16 |
| house parentHouseId dangling/cyclic/self | **0** | 11 cadet branches, all valid |
| duplicate house names | **0** | |
| dignity currentHouseId / swornToId dangling, sworn cycles | **0** | |
| **dignity currentHolderId -> nonexistent person** | **1** | **dignity 7 "The Crown entire… Kingdom of Estargenn" -> currentHolderId 82, no such person** |
| **dignities with no successionType** | **2** | dignity **7** (The Crown), dignity **11** (Drihten of House Hendry of Gathin) |
| dignities vacant | 9 | Foster-Bookman, Foster-Reeve, Foster-Warden, Foster-Tallyman, Foster-Horseward, Foster-Edgemaster, Holdward of Lower western slopes, Drith of House Shadash, Drith of The Sefs |
| **broken [[wiki-links]]** | **219 of 1787 (12.3%)** across **109 distinct targets**, in **86 of 403 entries** | `[[Verisol]]` x16, `[[Wood-Warden's Oath]]` x10, `[[Woodland Marriage Tradition]]` x9, `[[Mirellune]]` x9, `[[Breakmount]]` x9, `[[Recordant]]` x9, `[[Wythern]]` x9 |
| ↳ fixable by whitespace normalization | 3 | `[[House\nShadash]]`->"House Shadash" (2938); `[[House\nWilfbole]]`->8; `[[Nivette  \nWilfson]]`->23 |
| ↳ fixable by plural tolerance | 5 | `[[Recordant]]`->"Recordants" (9x), `[[Dun-Name]]`, `[[Dum-Name]]`, `[[Acolyte]]`, `[[House Wilfrey's]]` |
| ↳ unedited template placeholders | 4 | `[[Location Name]]`, `[[Person 1]]`, `[[Person 2]]`, `[[House/Faction]]` |
| **duplicate codex titles (case-insensitive)** | **15** | `House Wilfson` (4, 2506), `Riverhead` (15, 2667), `Maisie Wilfrey` (48, 53), `Aldric Wilfrey` (2689, 2711), `Fosterheald` (2758, 2851), `House Wilfrey of Bramblehall` (2439, 2500) |
| **codex titles with doubled `House ` prefix** | **8** | 2845 "House House Cawdry ", 2846 "House House Westholme", 2847 "House House Thornbury", 2905-2909 "House House Wilfbauer/Wilfbole/Wilfbark/Wilfsbane/Wilfour" |
| ↳ related mis-prefix the repair tool will NOT catch | 2 | 2507 "House The Crown ", 2844 "House Commoner" (houses named "The Crown " / "Commoner") |
| codex entries with empty content (auto-created stubs) | **189 / 403** | 30 Anise Wilfrey, 32 Cáir Wilfrey, 2943-2964 the Shadash line |
| fully isolated codex entries (no inbound, no outbound) | **189** | same set |
| codex entries with zero inbound links | 209 / 403 | |
| personage entries with no matching person | **22** | 2840 "Baudin Wilson (Heir)", 2889-2891 "Baudin Wilson VII/VIII/I", 2926 "Harfalene Greenfinger", 2927 "Harfalene Wythern", 2928 "The Faire of Haligdene" |
| people with no personage entry | 123 | 402-445 the entire House Wilson line |
| house entries with no matching house | 11 | the 10 above + id 3 "House Wilfrey" (umbrella entry, likely intentional) |
| houses with no house entry | 20 | Salomon, Wentburn, Vespen, Hendry, Carlyle, Forpine, Parlin, Goff, "The Crown ", Salter of the Scorch, Ironfell, Millward, Reedham, Tillbrook, Commoner, Cawdry, Westholme, Ferncross, Thornbury, Shadmoor |
| **duplicate person full names** | **11 names / 31 people** | **`baudin wilson` x9** (403,410,415,420,425,430,435,440,445 — successive generations 1778->2007); `aldric wilfrey` x4 (306,317,449,476); `maisie wilfrey` x2 (32 b2009, 40 b1930) |
| duplicate name AND identical dates | **0** | no true accidental dupes — all namesakes |
| names with stray whitespace | 6 people, 5 houses | "Mychal ", "Salomon ", "Zoia ", "Vernus ", "Visla ", "Douvin "; "House Wilfrey of Fourhearth ", "The Crown ", "House Cawdry ", "House Wilfern ", "House Wilson " |
| people with 2-3 digit years | **6** | 533 Fenric Shadash 30-105, 534 Salenne 33-105, 535 Fenricson 55-135, 536 Fenrath Shadmoor 57-137, 537 Fenlith 55-145, 538 Fenrith 57-146 |
| people with no birth year | 4 | 529 Eldric Wythern, 530 Maris Wythern, 531 Theren Wythern, 532 Corven Ashwood (all "Commoner") |
| people in zero relationships (invisible in tree) | **13** | 365 Reginald Ferncross, 514-522 the Dunwilfrey/Dumwilfrey block, 528 Bram Wilfrey, 530 Maris Wythern, 532 Corven Ashwood |
| houses with zero members | 5 | 25 "The Crown ", 71 "House Cawdry ", 73 "House Westholme", 76 "House Thornbury", 84 "House Thornwick" |
| duplicate heraldry names | 1 | "Arms of House Wilfrey of Riverhead" (26, 27) |
| heraldry with no name-matching house | 1 | id 8 "Arms of House Wilfrey of **Blackmount**" — no such house (Breakmount?) |
| spouse age gap > 30y | 1 | 460 "The Old Knight Unknown" (b1710) x Raylegh Wilfrey (b1755) |
| **taxonomy drift — type** | 12 values | location(28) vs locations(11); personage(213) vs people(2); factions(4) |
| **taxonomy drift — category** | **42 values, 72 null** | Cadet Houses(11) vs cadet(7); Major Houses(6) vs main(12); Castles & Fortifications(6) vs Castles & Seats(8) vs Castles & Strongholds(1); Customs & Traditions(8) vs Traditions & Customs(1) vs Laws & Customs(2) |
| **unverifiable from snapshot** | — | codexEntryId/swornToHouseId/heraldryId dangling; heraldryLinks orphans; marriage-before-birth; codexEntries.personId/houseId |

**The single worst finding:** dignity 7 — *The Crown*, the root of the feudal hierarchy that all 24 other dignities chain up to — has a currentHolderId (82) pointing at a nonexistent person, no successionType, and a currentHouseId (25, "The Crown ") whose house has zero members. `calculateSuccessionLine` (`dignityService.js:1456-1462`) bails with a bare console.warn in both cases, **so the Crown silently renders an empty line of succession.**

## Referential integrity matrix

Dexie has no FK constraints; every cascade is hand-rolled. `deleteAllData` (`database.js:1221`) clears 22 of 26 tables.

| Entity | Deleted by | Cascades to | Dangling refs left | Verdict |
|---|---|---|---|---|
| **Person** | `database.js:648`; ctx wrapper `GenealogyContext.jsx:340` | relationships (both dirs); its own codex entry — but only via the context wrapper at `:359`, **without datasetId** | dignities.currentHolderId/grantedById/designatedHeirId/interregnum.regentId, dignityTenures.personId, dignityLinks, householdRoles.currentHolderId, heraldryLinks, people.heraldryId, codexEntries.personId, acknowledgedDuplicates, scenePlans.povCharacterId, characterArcs.characterId, houses.foundedBy, writingLinks | partial |
| **House** | `database.js:843` | nulls people.houseId; deletes **first** matching codex entry | **people.swornToHouseId** (v17 field, reader `database.js:792` + writer `QuickEditPanel.jsx:897`, zero cleanup), houses.parentHouseId on cadets, houses.swornTo, houses.foundedBy, dignities.currentHouseId/swornToId, dignityLinks, householdRoles.houseId, heraldryLinks, houses.heraldryId, other codexEntries.houseId, contextRegistry.houseId | **leaky** |
| **Relationship** | `database.js:1004` | nothing (leaf) | none | OK |
| **Codex entry** | `codexService.js:421` | codexLinks both directions (`:578`) | people/houses/dignities/heraldry.codexEntryId, and **every inbound `[[wiki-link]]` in other entries' content** | **leaky** |
| **Dignity** | `dignityService.js:745` | dignityTenures, dignityLinks, its codex entry — each individually synced | other dignities.swornToId, grantedByDignityId, other codexEntries.dignityId | **best in codebase** |
| **Heraldry** | `heraldryService.js:200` | heraldryLinks only | **houses.heraldryId, people.heraldryId** (never nulled — `unlinkHeraldry:290` *does* null them; deleteHeraldry bypasses it), codexEntries.heraldryId, heraldry.parentHeraldryId | **leaky + the UI lies** (`HeraldryLanding.jsx:235` promises "unlink it from any houses or people") |
| **Writing / Chapter** | `writingService.js:166` / `chapterService.js:166` | chapters, writingLinks locally | cloud deletes only the single doc -> **orphan chapters + links in Firestore**; storyPlans.writingId | local ok, cloud broken |
| **Story plan** | `planningService.js:277` | 5 child tables locally | **planningService imports nothing from dataSyncService** — all planning sync wrappers are dead code | never syncs |
| **Household role** | `householdRoleService.js:176` | leaf | **arity bug** at `:55, :159, :185`; imports `{db}` directly -> dataset-blind. `deleteRolesForHouse:299` and `clearHolderFromAllRoles:321` are written, exported, **never called** | **broken** |

**Cloud-resurrection bugs:** `HeraldryLanding.jsx:240` calls deleteHeraldry with no userId/datasetId; `CodexEntryView.jsx:271` and `CodexCleanupTool.jsx:148` call deleteEntry with no sync at all. **codexService.js contains zero sync imports.**

**Rename/merge:** No merge feature exists anywhere (grep for `merge` finds only TipTap mergeAttributes and Firestore `{merge:true}`). Duplicate resolution offers only *acknowledge* or *delete*. Renaming a codex entry does **not** rewrite inbound `[[Old Title]]` text — links resolve by title at render time (`wikiLinkParser.js:52-58, 90`) — so every inbound link silently breaks while the stale codexLinks row survives and the backlinks panel shows a link the source no longer produces.

## Cross-link map

**Denormalized copies that drift** (no propagation on rename in any case):
1. `codexEntries.title` <- `houses.houseName` (`database.js:708-711`). updateHouse (`:817-832`) is 3 lines, no propagation.
2. `codexEntries.title` <- `dignities.name` (`dignityService.js:646`). updateDignity (`:716`) no propagation.
3. `people.lastName` <- `houses.houseName` (`database.js:1181`, plus `bastardNaming.js:74/94` for Dun-/Dum- surnames). `BastardNameAudit.jsx:43` is a manual advisory-only repair tool.
4. `houses.namePrefix` <- `parentHouse.houseName.substring(0,4)` (`database.js:1174`); `houses.notes` embeds parent house name + founder name (`:1178`).

There is **no houseName-beside-houseId column** in any Dexie table — display names resolve at render (`utils/entityLookup.js`). Drift is confined to those four sites.

**Bidirectional pairs that can desync:** `houses.heraldryId` <-> `heraldryLinks{heraldryId, entityType:'house', entityId}` and `people.heraldryId` <-> same — kept in step by `linkHeraldryToEntity:260/266` and `unlinkHeraldry:298/304`, but **broken by deleteHeraldry**, which bulk-deletes links without touching the columns. Likewise `houses.codexEntryId` <-> `codexEntries.houseId` (only the first match is ever resolved, via an unindexed scan at `codexService.js:190`).

**Polymorphic bridges never cleaned from the target side:** heraldryLinks{entityType,entityId}, dignityLinks{entityType,entityId}, writingLinks{targetType,targetId} — the last being the Writing Studio's only tie into genealogy.

**Fields that don't exist** despite appearing in the brief: `relatedEntryIds`, `holderId`, `seatId`. The persisted founder column is `foundedBy`, not `founderId`.

## Performance hot paths

| file:line | complexity | cost at 320p / 477r / 403c | breaks at N |
|---|---|---|---|
| `migrationService.js:509-532` (+`:611`,`:694`, `unifiedImport.js:435`) -> `codexService.js:168` | O(P x C) full-table scans; **no index on personId/houseId** (`database.js:527`) | **measured 8,292 ms** for 513 calls x 403 records = 206,739 deserializations. Map-based rewrite: **4 ms -> 2073x faster** | 1000p -> ~77 s; 5000 entries -> ~50 GB cumulative reads |
| `SearchBar.jsx:61-86` + `FamilyTree.jsx:352` | undebounced; searchResults is a drawTree dep -> full SVG teardown per keystroke | ~150-250k ops + ~3,000 SVG nodes **per character** | 1000p -> 2-5 s per keystroke |
| `treeHelpers.js:215/240/243-247` | findAncestors/findDescendants default `visited = new Set()` per call -> no shared memo, **O(P²)** | up to 102,400 recursive frames per drawTree | 1000p -> 1M frames, 0.5-1.5 s blocked |
| `CodexBrowse.jsx:183-233` (`:192`) | linear .includes() over all content, undebounced, .toLowerCase() allocates per entry | measured 0.55 ms/keystroke CPU — CPU is fine; the real cost is setFilteredEntries->memo cascade + 480 KB alloc/keystroke. Service twin `codexService.js:369` additionally re-reads the whole table | 4000 entries -> 5.5 ms + multi-MB IDB read per keystroke |
| `contextService.js:203-230` | `JSON.stringify(entry).toLowerCase()` per entry x 52 houses; `people.find()` inside relationship loop | 20,956 substring searches ~= 25M char comparisons + 305,280 finds — **fires 5 s after every mutation** | linear x linear; getHouseStats:280 repeats per house (~25 MB churn) |
| `aiDataService.js:749-762` | O(Σnk² x R) — relationships.some() inside an all-pairs loop | ~1.5M ops | 1000p/2000r -> 39.8M ops, 1-3 s freeze |
| `SmartDataValidator.js:740` + `:369-404` | O(P²) with Levenshtein + O(R) scan per match | 102,400 outer + 1.22M relationship scans, 200-600 ms | 1000p -> 3-8 s freeze |
| `HeraldryLanding.jsx:479` | DOMPurify.sanitize() per card per render, unmemoized, undebounced search | 33 parses of 10-60 KB ~= 0.3-2 MB markup **per render** | linear but heavy |
| `familyBlockLayout.js:408, 502-507` | Array.includes against generation arrays inside per-person loops | ~45,000 ops per drawTree | 1000p -> 500,000; one-line `new Set()` fix |
| `DignitiesLanding.jsx:264-273` | buildNode O(D²), **no cycle guard** | 676 | 1000 dignities -> 1M; a swornToId loop -> stack overflow, blank page |
| `dataSyncService.js:685-890` | 22 sequential loops, one Dexie txn per record | ~1,300 sequential awaits -> 1.3-4 s | bulkPut would fix |
| `dataSyncService.js:267-278` | unbatched Firestore, one round-trip per record | 320 x ~150 ms = **32-96 s** | 1000 -> 150-300 s. (`firestoreService.js:1016` *is* correctly batched at 450 ops — this path just doesn't use it) |
| `canonCheckService.js:128-134` | new RegExp per person x full chapter text | 320 compiles + ~9.6M char steps, then `.slice(0,5)` discards 99% | linear x linear |
| `wikiLinkParser.js:96/119` | processedHtml.replace() inside the match loop -> O(links x htmlLen) | 50 links x 5 KB rescanned each | quadratic in links |
| `RelationshipCalculator.js:568` | P bounded-BFS per invocation | **measured 12 ms per click**, 398 ms all-pairs — **not a hot path** | 1000p -> 38 ms/click, fine |
| `dignityService.js:1414` succession | called **once**, for the viewed dignity only — the "26x graph walk" hypothesis is **false** | waste is `getRelationshipDescription:1505` re-deriving the holder's neighbourhood per candidate ~= 12,000 redundant ops | fine |

**Zero `React.memo` anywhere in `src/components/*.jsx`.** `FamilyTree.jsx:989` calls setZoomLevel on every wheel event, reconciling the whole subtree at 60 fps during a pan (the SVG survives — zoomLevel isn't a drawTree dep).

## Part A — Autonomously fixable

**[CRITICAL] Cycle prevention is a no-op — the guard never matches the data**
`dataIntegrity.js:52`, `:95`. Both filter `'parent-child'`; the app writes `'parent'` everywhere. `detectCircularAncestry` is the only integrity function wired into production (`database.js:931`, on every parent add) and can only catch the trivial `childId === proposedParentId` case at `:38`. **My DFS found 0 cycles in the real data — that is luck, not enforcement.** Its tests pass because they use the fictional `'parent-child'`/`'marriage'` vocabulary. `validateBidirectionalRelationships:200` has the identical bug (`'marriage'` vs the actual `'spouse'`, 93 rows). Fix: change both strings; update fixtures; then add a visited guard to `familyBlockLayout.js:95` and `DignitiesLanding.jsx:266`. Effort S.

**[CRITICAL] Backup export silently drops 22 of 26 tables and the cadet hierarchy**
`database/MigrationHooks.js:331-343`, `ImportExportManager.jsx:217-238`. Export writes only people/houses/relationships/codexEntries. **Lost on restore: all 33 heraldry + heraldryLinks, all 26 dignities + tenures + links, all codexLinks, the entire Writing Studio and 6 planning tables, householdRoles, acknowledgedDuplicates.** Field-level, the house formatter (`:301-312`) emits legacy `cadetBranchOf` while omitting `parentHouseId` — **all 11 cadet branches flatten** — plus houseType (40 houses) and heraldryId; `fullPerson` (`:284`) drops bastardStatus, heraldryId, swornToHouseId. **UI at `:481` claims "a complete backup".** Fix: enumerate tables from the Dexie schema — `dataSyncService.js:622-644` already has the correct list — and use `{...row}` instead of whitelisting. Effort M.

**[CRITICAL] Restoring a backup can be silently wiped by the next sync**
`ImportExportManager.jsx:404-420`. Import bulkAdds straight to Dexie calling no sync function, so syncQueue stays empty; on next start the guard at `dataSyncService.js:663` doesn't trip and `:681` runs localDeleteAllData then overwrites from cloud. Also: handleImport re-parses the raw file at `:348`, discarding the validated+migrated `result.data` from `:295`; nothing runs in a transaction so partial failures don't roll back; the `skip` strategy filters people/houses but not relationships/codex -> guaranteed BulkError mid-import. Effort M.

**[HIGH] deleteHeraldry leaves houses.heraldryId / people.heraldryId dangling, and never syncs**
`heraldryService.js:200-212`, `HeraldryLanding.jsx:240`. Bulk-deletes heraldryLinks without nulling the denormalized columns — `unlinkHeraldry:298/304` already does this correctly and is bypassed. The UI at `:235` promises the opposite. The call site passes neither userId nor datasetId, so getDatabase(null) hits the **default** dataset and no cloud delete fires. Effort S.

**[HIGH] Codex deletes resurrect from Firestore** — `CodexEntryView.jsx:271`, `CodexCleanupTool.jsx:148`. codexService has zero sync imports; these call sites add none. Only the person path (`GenealogyContext.jsx:363`) syncs a codex delete. `deleteLinksForEntry:578` never calls deleteCodexLinkCloud either. Effort S.

**[HIGH] Household role sync called with wrong arity — it has never worked** — `householdRoleService.js:55, :159, :185`. Two-arg calls against three-arg signatures (`dataSyncService.js:1412/1428/1444`). Module also imports `{db}` directly (`:10`) -> dataset-blind. `HouseholdRolesPanel.jsx:157` passes no userId at all. Effort S.

**[HIGH] 2073x speedup: index codexEntries and stop scanning**
`database.js:527`, `codexService.js:168/193/218/243`. Measured: the `migrationService.js:509` loop takes **8.3 s** at the owner's exact scale; a Map-based rewrite takes **4 ms**. Fix: add `personId, houseId, dignityId, heraldryId` to the codexEntries store in a new `db.version(18)`; switch the four getEntryBy*Id functions from `.filter()` to `.where().equals()`; hoist a lookup Map out of the loops in migrationService and `unifiedImport.js:435`. Effort M.

**[HIGH] Debounce four search inputs** — `CodexBrowse.jsx:526`, `HeraldryLanding.jsx:367`, `DignitiesLanding.jsx:500`, `SearchBar.jsx:61`. **`shared/ListSearchBar.jsx:61-66` already implements a 300 ms debounce and has exactly one caller** (`TreeLandingView.jsx:242`). SearchBar is the worst — searchResults is a drawTree dependency, so each keystroke tears down and rebuilds the whole SVG. Effort S.

**[MEDIUM] Share the visited set in tree scoping** — `treeHelpers.js:215, :240, :243-247`. 3 lines. Effort S.
**[MEDIUM] Array.includes inside per-generation loops** — `familyBlockLayout.js:408, :502, :507`; `FamilyTree.jsx:1246, :1262`. Effort S.
**[MEDIUM] parseWikiLinks silently drops its third argument** — `wikiLinkParser.js:36` vs `CodexEntryView.jsx:179`. On any non-default dataset every wiki-link renders broken and stray codexLinks rows are written to the wrong DB. Same class: `fixHouseHousePrefixes()` called with no datasetId (`DataMigrationTool.jsx:184`). Also replace the in-loop `.replace()` at `:96`/`:119` with a single regex pass. Effort S.
**[MEDIUM] Wire up the integrity checker that already exists** — `dataIntegrity.js:131` findOrphanedRecords, `:241` runIntegrityCheck. Both written, exported, unit-tested; **zero call sites** outside the module. **Surfacing them in DataHealthDashboard would have caught the dignity-7 break.** Effort S.
**[MEDIUM] Memoize sanitizeSVG and batch the sync loops** — `HeraldryLanding.jsx:479`, `CodexBrowse.jsx:368`, `HouseList.jsx:285`; `dataSyncService.js:267-278` and `:685-890` (bulkPut; reuse the existing 450-op batching from `firestoreService.js:1016`). Effort M.
**[LOW] Strip stray whitespace in 6 person and 5 house names** — affects search, dedup and wiki-link title matching. Trim on save; existing names need a one-off pass (touches content — see Part B).

## Part B — Needs user input

These are the owner's creative content. None should be auto-changed.

**1. The Crown is structurally broken (dignity 7).** currentHolderId 82 -> nonexistent person; successionType unset; currentHouseId 25 ("The Crown ") has zero members. All 24 other dignities chain up to it. calculateSuccessionLine returns [] with only a console.warn. (a) identify who person 82 was and recreate them; (b) mark the Crown vacant, matching the 9 already-vacant dignities; (c) point it at an existing person. Separately set a successionType for dignities 7 and 11 (the other 24 all use male-primogeniture). **Regardless of the answer, the code should fail loudly rather than silently return an empty succession line.**

**2. 219 broken wiki-links across 109 targets.** Three classes needing different treatment: **8 are mechanical** (3 newline-in-title, 5 plural/singular — `[[Recordant]]`->"Recordants" alone is 9 occurrences); **72 point at nothing at all** — these read as deliberate forward-references to unwritten entries (`[[Verisol]]` x16, `[[Wood-Warden's Oath]]` x10, `[[Mirellune]]` x9); **23 name real people/houses that have no codex entry** (`[[House Vespen]]`, `[[Lysara Wilfrey]]`). (a) fix only the 8 mechanical; (b) also auto-create stubs for the 23 real entities; (c) leave forward-references as intentional "to write" markers and add a Codex report listing them. 4 targets are unedited template placeholders and are clearly accidental — but the other 72 are plausibly a deliberate worldbuilding backlog.

**3. 15 duplicate codex titles — wiki-links resolve to an arbitrary one.** parseWikiLinks builds entryMap keyed on lowercased title (`wikiLinkParser.js:55-58`); with duplicates the **last one wins**, non-deterministically. (a) merge each pair manually; (b) disambiguate titles; (c) unique-constrain going forward with a conflict warning. Merging means choosing which body text survives.

**4. 189 of 403 codex entries are empty auto-created stubs.** From `database.js:705` / `migrationService.js:145`. Nearly half the Codex is contentless; they inflate every full-table read, the search index, and the "403 entries" figure. (a) delete and re-create on demand; (b) keep as writing prompts; (c) stop auto-creating and only make an entry when content is first written.

**5. 10 mis-prefixed house entry titles.** `fixHouseHousePrefixes` (`migrationService.js:877`, wired to `DataMigrationTool.jsx:184`) will fix **8**. It will **not** catch "House The Crown " (2507) or "House Commoner" (2844), because those houses are named "The Crown " and "Commoner" — the `startsWith('House ')` guard added in be17827 works; these are pre-guard legacy rows. Note the repair runs updateEntry, which does not sync, so the fix is local-only until the sync gap closes. Decision needed on the two names.

**6. Codex taxonomy drift — 12 type values and 42 category values (72 null).** Type/category filters in CodexBrowse silently miss entries. (a) pick a canonical vocabulary and bulk-remap; (b) constrain to an enum at the form level and migrate. Which vocabulary is canonical, and what the 72 null-category entries become.

**7. The 6 Shadash people with 2-3 digit years** (30-105 … 57-146) against a world otherwise dated 1680-2016. (a) intentional ancient/mythic era, leave alone; (b) typos for 4-digit years. **They sort to the far left of every timeline and tree, and their 80-90 year lifespans are internally consistent, which suggests deliberate.**

**8. `baudin wilson` x9 and 10 other repeated names.** Nine spanning 1778->2007 in House Wilson — clearly a dynastic naming tradition, not duplicates (zero name+date collisions in the whole dataset). But the duplicate detector flags all 36 pairs and SmartDataValidator runs Levenshtein over them on every health check. (a) bulk-add to acknowledgedDuplicates; (b) add regnal numbers as already done for "Baudin Wilson VII/VIII" in the Codex — but that changes displayed names throughout the tree.

**9. 13 people in zero relationships and 5 empty houses.** The 9-person Dunwilfrey/Dumwilfrey block (514-522) plus Reginald Ferncross, Bram Wilfrey, Maris Wythern, Corven Ashwood are invisible in the tree; houses 25/71/73/76/84 have no members. Almost certainly in-progress content.

**10. Heraldry: "Arms of House Wilfrey of Blackmount" and a duplicated Riverhead.** Id 8 references "Blackmount", not among the 52 houses (Breakmount?). Ids 26 and 27 share "Arms of House Wilfrey of Riverhead". Note the snapshot carries no heraldry->house link field, so true orphan status can't be confirmed without a live DB read.
