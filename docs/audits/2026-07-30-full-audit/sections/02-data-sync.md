# Layer: Data, Persistence & Sync

## Inventory

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `src/services/database.js` | 1794 | Dexie schema v1-v17, per-dataset DB instances, local CRUD, syncQueue | **Poor.** 4.5x service budget. 17 fully-copied schema blocks (~410 lines) where only the diff matters. Dead validation, full-table-scan cascades. |
| `src/services/database/MigrationHooks.js` | 604 | Field registry / schema-version manifest for import-export | **Orphaned-ish.** One consumer (`ImportExportManager.jsx:29`). Declares "VERSION 2.0.0" while Dexie is v17 — two unreconciled versioning systems. |
| `src/services/dataSyncService.js` | 2450 | 60 sync* wrappers, initializeSync, forceCloudSync, forceUploadToCloud, periodic sync | **Bad.** ~800 lines identical wrappers; initializeSync and forceCloudSync contain the same 190-line restore block verbatim. 21 wrappers dead. |
| `src/services/firestoreService.js` | 2238 | 87 *Cloud functions over 21 collections + bulk up/download | **Bad.** ~1300 lines differ only by a collection-name string. No pagination, no delete-reconciliation. |
| `src/services/migrationService.js` | 1411 | Codex backfills, cross-linking, Firestore dataset move | **Poor.** Hard-wired to default dataset. Only 1 of 6 entry points auto-runs. Latent DB-destroying branch. |
| `src/services/contextService.js` | 1318 | Context-library generation | **OK-ish.** Correctly dataset-scoped. **CLAUDE.md is wrong that these tables are never written.** |
| `src/services/datasetService.js` | 324 | Dataset metadata CRUD | **Fair.** Leaks local IndexedDB on delete. |
| `src/contexts/DatasetContext.jsx` | 348 | Active-dataset provider | **Fair.** Dataset switch only works because `DatasetManager.jsx:154` does `window.location.reload()`. |
| `firestore.rules` | 273 | Security rules | **Fair on isolation, weak on validation.** Two "catch-all deny" blocks are no-ops; create-time type checks silently reject legit writes. |
| `firestore.indexes.json` | 4 | empty | Consistent — app issues no compound queries. |
| `src/services/database.test.js` | 560 | CRUD + cascade + multi-dataset isolation | Good for what it covers; zero tests over dataSyncService/firestoreService/migrationService/rules. |
| `src/utils/SmartDataValidator.js` | 935 | Validation, health check | **Poor placement.** Wired into 3 UI components only; every service/import path bypasses it. `validatePerson` (`:305`) has zero call sites. |
| `src/utils/dataIntegrity.js` | 326 | Circular ancestry, orphans, bidirectional | **Effectively dead.** Keys off `'parent-child'`, never written in production. |

## Entity x Sync coverage matrix

| Entity | Local CRUD | syncAdd | syncUpdate | syncDelete | datasetId | Verdict |
|---|---|---|---|---|---|---|
| people | Y | Y | Y | Y (+rel cascade) | Y | OK |
| houses | Y | Y | Y | wired but cascade unsynced | Y | **Broken cascade** |
| relationships | Y | Y | Y | Y | Y | OK |
| codexEntries | Y | Y (6 sites, caller-owned) | Y | Y | Y | Fragile — service has 0 sync refs |
| codexLinks | Y | Y | n/a | **syncDeleteCodexLink 0 call sites** | Y | Delete never propagates |
| heraldry | Y | Y | Y | Y | Y | OK |
| heraldryLinks | Y | Y | n/a | Y | Y | OK live; **unreplayable** |
| dignities | Y | Y | Y | Y | Y | OK |
| dignityTenures | Y | Y | Y | Y | Y | OK live; **unreplayable** |
| dignityLinks | Y | Y | n/a | Y | Y | OK live; **unreplayable** |
| householdRoles | Y | **wrong arity** | **wrong arity** | **wrong arity** | **none** | **Critical** |
| writings | Y | Y | Y | Y | Y | OK |
| chapters | Y | Y | Y | Y | Y | OK |
| writingLinks | Y | **0 call sites** | n/a | **0 call sites** | Y | Never syncs |
| storyPlans | Y | 0 | 0 | 0 | Y | Never syncs |
| storyArcs | Y | 0 | 0 | 0 | Y | Never syncs |
| storyBeats | Y | 0 | 0 | 0 | Y | Never syncs |
| scenePlans | Y | 0 | 0 | 0 | Y | Never syncs |
| characterArcs | Y | 0 | 0 | 0 | Y | Never syncs |
| plotThreads | Y | 0 | 0 | 0 | Y | Never syncs |
| arcMilestones | **table does not exist** | 0 | 0 | 0 | — | **Phantom entity** |
| acknowledgedDuplicates | Y | none | — | — | Y | Local-only, **wiped on download** |
| bugs | Y | none | — | — | **none** | Local-only, **wiped on download** |
| syncQueue | Y | n/a | n/a | n/a | Y | OK by design |
| contextRegistry/Files/Log | Y | — | — | — | Y | Local-only by design; not cleared by deleteAllData |

**Score: 10 of 25 real entity types have complete correctly-wired CRUD<->sync. 8 have none. 1 is a phantom.**

## Part A — Autonomously fixable

**[CRITICAL] Household-role sync wrong arity — roles written to garbage Firestore path**
`householdRoleService.js:55, :159, :185`. Sig is `(userId, datasetId, roleId, roleData)` (`dataSyncService.js:1412`); call is `(userId, id, role)`. `addHeraldryCloud`-equivalent `addHouseholdRoleCloud` (`firestoreService.js:1767`) does `String(roleData.id)` on `{id:<object>}` -> writes to `users/{uid}/datasets/<numericRoleId>/householdRoles/[object Object]`. Queue entry equally corrupt: `entityId: "[object Object]"` (`database.js:1463`) — poisoned rows can never be replayed or cleared by entity.
Fix: thread datasetId; correct all three calls; one-off cleanup deleting syncQueue rows where `entityId === '[object Object]'`. Effort S.

**[CRITICAL] Three entity types queued but have no replay handler — then marked synced anyway**
`dataSyncService.js:298-400` syncMap, consumed `:270-271`. No keys for `dignityTenure`, `dignityLink`, `heraldryLink`, yet queued at `:1327`, `:1375`, `:1241`. `syncSingleChange` hits `if (!handler) { console.warn; return; }` (`:393-397`) and returns *successfully* -> `markEntitySynced` at `:271` runs unconditionally. Any tenure/dignity-link/heraldry-link change made offline or during an outage is **silently discarded**, and the pending-changes guard stops protecting it.
Fix: add the three syncMap entries; make syncSingleChange return false/throw on unknown type and gate the mark. Effort S.

**[CRITICAL] Circular-ancestry validation dead twice over — wrong type string AND swapped args**
`database.js:917`, `:932`; `dataIntegrity.js:36, :52`. addRelationship validates only when type === `'parent-child'`; production writes `'parent'` (`QuickEditPanel.jsx:452,500,506,666`, `sampleData.js:144-184`, `SmartDataValidator.js:913`). Even if matched, `:932` calls `detectCircularAncestry(parentId, childId)` vs signature `(childId, proposedParentId)` — reversed. `dataIntegrity.js:52/:95/:249` also filter `'parent-child'`, so findOrphanedRecords, validateBidirectionalRelationships and runIntegrityCheck are all dead for parent edges. Nothing prevents a person becoming their own grandparent.
Fix: normalise on `'parent'` (or a set incl. adopted/foster, matching `SmartDataValidator.js:472-475`), fix the gate, swap the args. Update dataIntegrity.test.js — 20+ fixtures use `'parent-child'`/`'marriage'`, neither of which the app writes. Effort M.

**[HIGH] arcMilestones is a phantom — table never added to Dexie schema**
`database.js:523-549` (v17 stores, no arcMilestones); accessed at `dataSyncService.js:617, :879, :2193, :2298`. `localDb.arcMilestones` undefined -> TypeError; at `:2291-2301` one shared try swallows it and upload silently proceeds. Full cloud stack exists: `firestoreService.js:930-991`, syncAllToCloud `:1247`, downloadAllFromCloud `:1327`, three dead wrappers (`dataSyncService.js:1904-1947`), a rule (`firestore.rules:239`), entries in `datasetService.js:222` + `firestoreService.js:2083`. Not in planningService either — `addCharacterMilestone` (`planningService.js:806`) stores milestones inline on the arc.
Fix: delete the phantom (4 accesses, 3 wrappers, syncMap entry `:386`, 4 firestore functions, 2 bulk legs, the rule). Effort S.

**[HIGH] Deleting a house silently reverts in the cloud; React state goes stale**
`database.js:853-863`, `:866-881`; `GenealogyContext.jsx:427-445`. deleteHouse clears houseId on members (`:859`) and cascade-deletes the house Codex entry (`:874`) — locally only. Context fires only `syncDeleteHouse` (`:437`) and never touches setPeople. Next downloadAllFromCloud restores every member's houseId and the orphaned Codex entry. deletePerson (`:339-384`) does it correctly in the same file.
Fix: return affected person ids + deleted codexEntryId; emit syncUpdatePerson per member + syncDeleteCodexEntry; update setPeople. Effort M.

**[HIGH] acknowledgedDuplicates and bugs destroyed on every cloud download**
`database.js:1235, :1247`; `firestoreService.js:1007, :1306`. deleteAllData clears both, called before every restore (`dataSyncService.js:682, :1997`), but neither is in syncAllToCloud's destructure nor downloadAllFromCloud's Promise.all. Every acknowledged namesake and bug report permanently lost on first multi-device login. Both ARE listed in firestore.rules (`:247, :251`), deleteAllCloudData (`:2083`) and datasetService (`:205,211`) — plumbing written assuming they sync.
Fix: simplest is remove them from deleteAllData's clear list (one line) so they survive as local-only. Effort S.

**[HIGH] markEntitySynced marks every pending row for an entity, including ones queued after the in-flight write**
`database.js:1501-1512`. No filter on the specific queue row. Edit person (row 1, upload starts), edit again 200ms later (row 2), upload of 1 returns -> both flip to synced. Edit 2 never uploads and is no longer protected by the pending guard. `addToSyncQueue` already returns the row id (`:1471`) and `markSynced(queueId)` (`:1484`) already does the right thing — the wrappers just don't use it. Effort M (trivial after factory refactor).

**[HIGH] Cloud upload never deletes — forceUploadToCloud resurrects deleted entities**
`firestoreService.js:1027-1255`. Every leg is `batch.set` (upsert); cloud docs with no local counterpart are never removed. Delete 50 people offline -> come online -> forceUploadToCloud (`dataSyncService.js:2218`, the documented post-bulk-import safety net) -> the 50 remain in Firestore -> next download brings them back. forceUploadToCloud then calls clearSyncQueue (`:2329`), destroying the pending deletes that would have fixed it.
Fix: read existing doc ids per collection and batch.delete any absent locally. Effort M.

**[MEDIUM] initializeSync and forceUploadToCloud read the DEFAULT dataset's Codex while syncing another**
`dataSyncService.js:556`, `:2244` — `getAllCodexEntries()` no arg; `getDatabase(undefined)` -> 'default' (`database.js:89`). Every sibling call passes dsId (`:563, :585, :595`). Uploading a non-default dataset writes the default world's Codex into it. Effort S.

**[MEDIUM] hasCloudData probes only houses and reads the whole collection**
`firestoreService.js:1368-1378` — no `limit(1)`, so 500 houses = 500 reads per login for a boolean. A dataset with people but no houses reports false, routing initializeSync (`:540`) into "fresh start"/"upload local" and potentially overwriting real cloud data. Effort S.

**[MEDIUM] Cascade deletes ignore existing indexes, do full table scans**
`database.js:657-659`, `:853-855` use `.filter(...)` despite person1Id/person2Id/houseId all indexed since v1 (`:148`). Idiomatic form already used at `:956-958` and `:623`. `:857-861` also issues N sequential updates in a loop — replace with `.where('houseId').equals(id).modify({houseId: null})`. Effort S.

**[MEDIUM] fixHouseHousePrefixes runs against default dataset and is not idempotent**
`migrationService.js:877-889`; called from `DataMigrationTool.jsx:184` with no arg. `replace(/^House /,'')` strips one prefix per run. Fix: require datasetId; `replace(/^(House )+/, 'House ')`. Effort S.

**[MEDIUM] The two Firestore catch-all deny blocks are no-ops**
`firestore.rules:260-262`, `:269-271`. Rules are a disjunction of allows; `allow read, write: if false` cannot revoke. Inert, but the comment at `:256` invites a false sense of constraint. Delete both. Effort S.

**[MEDIUM] beforeunload guard: dead handler + 5-second staleness window**
`App.jsx:163-166` (empty body, never registered) and `:180-192` (pendingCount refreshed by a 5s setInterval `:184`). Edit-then-close gives no warning. Fix: delete dead handler; refresh on `onSyncStatusChange` (`dataSyncService.js:205`); drop interval to ~1s backstop. Effort S.

**[MEDIUM] Local IndexedDB never deleted when a dataset is deleted**
`datasetService.js:196-249` wipes 23 Firestore collections + metadata but never `LineageweaverDB_{datasetId}`. `deleteDatabaseForDataset` exists (`database.js:120-132`) with **zero** call sites outside tests. Deleted worlds leak storage; cached instance in `dbInstances` (`:34`) stays open. Fix: call it from `DatasetContext.deleteDataset` (`:256`). Effort S.

**[LOW] v3/v4 schema typo dropped the dateOfDeath index for two versions**
`database.js:182`, `:217` — `dateOfBirth` listed twice, `dateOfDeath` gone; restored at v5 (`:236`). Harmless now; a live example of why 17 hand-copied blocks are a liability.

**[LOW] `parseInt(x) || x` mishandles id 0 in all 21 restore blocks**
`dataSyncService.js:689-879` and the same 21 lines in forceCloudSync `:2006-2193`. Unreachable today (Dexie autoincrement never issues 0) but replicated 42 times. Fix: `Number.isNaN(n) ? raw : n`.

## Part B — Needs user input

**B1. arcMilestones: delete the phantom, or finish it?** Cloud half fully built, local half nonexistent; planningService already stores milestones as an array on characterArcs (`:806`). (a) delete: -150 lines, zero behaviour change; (b) build: Dexie v18 `arcMilestones: '++id, characterArcId, order, createdAt'` + migration lifting embedded milestones out. Hinges on whether milestones need independent querying/reordering.

**B2. Story-planning + writing-links: wire per-op sync, or accept snapshot-only?** Seven entity types have complete wrappers with zero call sites; planningService.js has no sync references. Today they reach the cloud only via manual forceUploadToCloud. (a) wire up: thread userId into ~21 planningService fns + ~4 writingLinkService, matching dignityService (`:665,727,788,836,997`); (b) snapshot-only: delete 21 dead wrappers, debounce-trigger forceUploadToCloud on planning change; (c) do nothing (status quo — planning data is silently device-local). Effort ratio ~4:1.

**B3. Firestore create-time type checks can silently reject legitimate writes** `firestore.rules:66-68` requires firstName/lastName is string; `:75`, `:100-102`, `:125`, `:148`, `:190` similar. `addPersonCloud` (`firestoreService.js:103`) uses setDoc = create on first sync, so a person with `lastName: null` (foundlings, single-name characters, partial imports) is rejected, the error swallowed by syncAddPerson's catch (`dataSyncService.js:925`), and that person never reaches the cloud. `allow update: if isOwner(userId)` (`:69` +10 more) lets the invariant be violated one write later anyway. (a) relax to ownership-only; (b) tighten symmetrically + normalise nulls locally (must first confirm no existing record violates them, else they become permanently unsyncable); (c) keep but surface failures. Depends on whether blank lastName is a legal state.

**B4. Schema representation: keep 17 copied blocks or move to diff-only versions?** `database.js:145-554` restates ~25 tables per bump; v17 (`:523`) differs from v16 by one index. Dexie only needs changed stores. Converting cuts ~350 lines and kills the `:182`/`:217` bug class — but changes how Dexie computes the upgrade path, and this is a live single-user DB with real data. Needs a backup + restore rehearsal decision.

**B5. Is last-write-wins actually acceptable?** `dataSyncService.js:36-38` documents LWW as fine for single-user. Three things make it worse than advertised: cloud writes carry serverTimestamp() but nothing ever *compares* timestamps — initializeSync (`:657`) unconditionally treats cloud as truth and wipes local; no soft-delete anywhere, so an un-uploaded delete on device A is indistinguishable from a record device B never saw; syncAllToCloud is upsert-only. Two tabs on one machine can lose data. (a) accept LWW + harden guards (make the pending guard fail closed — `database.js:1549` currently returns false on error, failing open); (b) add updatedAt + per-field LWW (people/houses/relationships currently have no timestamps); (c) tombstones (`deletedAt` + filtered reads, touches every query).

**B6. Migrations that never run.** runAllMigrations, migrateHousesToCodex, migrateDignitiesToCodex, migrateDignityNatures, runCrossLinkingMigrations, fixHouseHousePrefixes are reachable only from `DataMigrationTool.jsx` (`:93,124,164,184`). Only runDatasetMigration auto-runs (`App.jsx:136`). Consequences: (a) migrateHousesToCodex writes Codex entries with **no** cloud sync (`migrationService.js:144-155`) so the next download deletes them; (b) needsDatasetMigration (`:1096`) probes the `people` collection alone (`:1112`) — a legacy user with houses and Codex but zero people is skipped forever and stranded. (i) auto-run behind the existing MIGRATION_VERSION cache (`:24`) after threading syncContext into the two unsynced ones; (ii) keep manual but fix the sync gap and the people-only probe.

**Also flagged (no decision needed):** `migrateLocalDatabase` (`migrationService.js:1303-1313`) will `indexedDB.deleteDatabase('LineageweaverDB')` — the primary local DB — whenever `LineageweaverDB_default` exists. It cannot fire today because `getDatabase('default')` names the DB `LineageweaverDB` not `LineageweaverDB_default` (`database.js:42-44`). A loaded gun armed by any future change to that naming rule. Delete the branch.

## Proposed refactor: collapsing the sync layer

**Measurement.** firestoreService exports 87 `*Cloud` functions across 21 entity types (~62 lines each differing only by a collection-name literal and a console.log). dataSyncService exports 60 `sync*` wrappers, 10-18 lines each with an identical five-step body.

| Duplicated construct | Location | Lines |
|---|---|---|
| 87 per-entity *Cloud CRUD functions | `firestoreService.js:103-991, 1388-2070` | ~1300 |
| 60 sync* wrappers | `dataSyncService.js:911-1947` | ~800 |
| 21 identical syncAllToCloud upload loops | `firestoreService.js:1027-1255` | ~190 |
| 21 restore blocks in initializeSync | `dataSyncService.js:685-883` | ~190 |
| The same 21 restore blocks copy-pasted into forceCloudSync | `dataSyncService.js:2003-2197` | ~190 |
| 21-way destructure + Promise.all in downloadAllFromCloud | `firestoreService.js:1306-1355` | ~50 |
| Collection-name lists duplicated 4x with **three different contents** (23/23/13/20) | `firestoreService.js:2083`, `datasetService.js:199-223`, `migrationService.js:1070-1084`, `database.js:1226-1263` | ~90 |

**~2,800 of the 4,688 lines in these two files are mechanical repetition.** The divergence between those four collection lists is exactly why acknowledgedDuplicates/bugs are cleared but never restored, and why dignityTenures/dignityLinks/heraldryLinks are queued but unreplayable.

**Target: one manifest, four generic operations.**
- `src/services/syncManifest.js` (~120 lines) — `ENTITIES` map: per entity `{collection, table, ops, localGetAll, restore, cascades}`. Declarative cascades replace hand-written logic in `database.js:657`. `bugs`/`acknowledgedDuplicates` declare `cloud: false`.
- `src/services/cloudRepo.js` (~90 lines) — generic `add/update/delete/getAll` over `getUserDoc(uid, ds, coll, id)`. Replaces ~1300 lines.
- `src/services/syncEngine.js` (~120 lines) — `syncOp(entity, op, {userId, datasetId, id, data})`: queue -> retryWithBackoff -> `markSynced(queueId)` (fixes the mark-everything bug) -> never throws. `syncSingleChange` becomes `cloud[entityType]?.[operation] ?? throw`, making the missing-handler bug structurally impossible.
- Bulk ops become manifest loops: `uploadAll` with a `batchUpsertAndPrune` (fixes upsert-only), `restoreAll` shared by initializeSync and forceCloudSync (kills the 190-line verbatim duplication and the drift between them).
- 60 thin generated shims keep existing call sites working: `syncAddPerson = (uid, ds, id, data) => syncOp('person','add',{...})` — ~25 lines instead of 800. Generating them mechanically makes the arity slip a type-shaped error rather than silent corruption.

**Migration path (each step independently shippable/revertable):**
1. Land the manifest, change nothing else. Assert in a test that every ENTITIES key has a Dexie table (this alone fails on arcMilestones) and a firestore.rules match block.
2. Replace the four divergent collection lists with manifest derivations. Kills the drift class immediately.
3. Introduce cloudRepo.js; re-export the 87 old names as one-line aliases; delete the bodies. ~1200 lines gone.
4. Introduce syncEngine.js; regenerate the 60 wrappers as shims; fold in markSynced(queueId) and unknown-entity-throws in the same commit.
5. Replace syncAllToCloud/downloadAllFromCloud/the two restore blocks with manifest loops; add the prune leg.
6. Move cascades into the manifest — makes the house-delete cascade correct-by-construction.
7. Delete the shims once call sites migrate to syncOp.

**Projected: firestoreService 2238 -> ~250; dataSyncService 2450 -> ~400; plus ~330 new. Roughly 4,700 lines -> 980**, with five bug classes eliminated structurally. Adding entity type #22 becomes a 6-line manifest entry instead of the 5-step, 8-file checklist in `docs/DEVELOPMENT_GUIDELINES.md:332-368`.

## CLAUDE.md correction
Gotchas says contextRegistry/contextFiles/contextLog "are defined but never written". They ARE written — `contextService.js:711, :744, :768` — reached via generateAllContexts from `ImportExportManager.jsx:173` and via notifyChange, which `database.js:8` and `codexService.js:15` invoke on every mutation. What IS true: they never sync to cloud and are not cleared by deleteAllData.
