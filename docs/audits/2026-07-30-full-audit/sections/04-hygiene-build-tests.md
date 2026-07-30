# Layer: Repo Hygiene, Build, Tooling, Tests & Docs

## Hard numbers

**Build** — `npm run build` exit 0, **13.33s**, 3,121 modules, 28 MB output.

| Chunk | Raw | Gzip |
|---|---|---|
| index-BoE9wpSZ.js | **1,153.32 kB** | 346.19 kB |
| WritingEditor | **504.07 kB** | 158.86 kB |
| ManageData | 201.74 kB | 47.30 kB |
| FamilyTree | 169.01 kB | 49.05 kB |
| StoryPlannerModal | 113.93 kB | 24.29 kB |
| index CSS | 134.29 kB | 20.84 kB |

3 warnings, same class: `database.js`, `codexService.js`, `dignityService.js` are **both statically and dynamically imported** (37/27/17 static importers), so the `import()` calls buy nothing. `vite.config.js` has **no `build` block at all** — no manualChunks, so Firebase (113 refs), Dexie, D3 and React all land in one 1.15 MB entry chunk. caniuse-lite 7 months stale.

**Lint** — 256 files, 148 with problems: **521 errors, 39 warnings (560)**.
446 no-unused-vars · 39 react-hooks/exhaustive-deps · 22 react-refresh/only-export-components · 11 rules-of-hooks · 11 set-state-in-effect · 8 no-case-declarations · 6 no-undef · plus immutability/static-components/set-state-in-render/refs/no-dupe-keys/preserve-manual-memoization/no-control-regex.
Worst file: **`dataSyncService.js` — 164 problems alone.** 18 problems come from `old-build-archive/`, which the config doesn't ignore (`globalIgnores(['dist'])` only).

**Tests** — 148 passed / 148, 5 files, 7.50s, but **EXIT CODE 1** (4 unhandled rejections). CI would fail today.

**Repo weight** (tracked 56.73 MB / 5,278 files): extras/ 29.27 MB (4,459 files) · public/ 20.19 MB (361) · src/ 4.30 MB (334) · docs/ 1.92 MB (72) · root 0.59 MB · old-build-archive/ 0.44 MB (33) · archived-components/ 0.02 MB (2).
**`.git` = 313 MB** for 56 MB of content. `count: 5653, size: 313.14 MiB, in-pack: 0, packs: 0` — every object loose, never gc'd. Largest historical blob is only 0.54 MB; no binaries to purge.
`dist/` and `node_modules/` NOT committed. `.env`/`.env.local` correctly ignored, never committed.

**console.*** — **1,175 calls** (CLAUDE.md's ~450 counts only console.log): 605 error, 454 log, 113 warn, 3 group/table. Only 22 `import.meta.env.DEV` guards. By dir: services 764, utils 135, components 102, pages 87, contexts 64, config 8, hooks 6. Top: firestoreService 153, dataSyncService 141, database 78, migrationService 65, planningService 61, dignityService 56.

**Orphan files** — 14 real orphans, **7,181 lines**, + `useFormState.js` (157, barrel-exported, zero consumers) = ~7,338 dead lines:
veritists-codex-import 1525 · charter-codex-import 1181 · bastardy-naming-codex-import 882 · layoutPatternAnalyser 650 · BulkFamilyImportTool 608 · divisions 579 · heraldryUtils 460 · PersonCard 389 · CodexImportTool 289 · alliance-codex-import 277 · useFormState 157 · entityLookup 131 · wilfreyData 119 · importData 80 · components/bugs/index 11.
(`src/test/setup.js` was a false positive — referenced as a string in vitest.config.js.)

**Deps** — `@tiptap/extension-mention` **unused** (only a comment at `WikiLinkExtension.js:5`). `autoprefixer`/`postcss`/`tailwindcss` in `dependencies` but build-time only. `@types/react` + `@types/react-dom` with **0 TypeScript files**. `firebase-tools` devDep drags ~100 MB (pglite 23, electric-sql 21, opentelemetry 19, re2 18). **31 packages outdated.**

**npm audit** — 44 vulns (5 critical, 21 high, 16 moderate, 2 low). Shipped/direct:
- HIGH `react-router-dom`/`react-router` — vendored turbo-stream RCE; open redirect via `//` paths; range 7.0.0-7.14.1, fix available
- MODERATE `dompurify` <=3.4.11 — XSS + FORBID_TAGS bypass; **used at 21 sanitize call sites**
- HIGH `vite` 7.0.0-7.3.3 — path traversal, server.fs.deny bypass (dev only)
- CRITICAL `vitest` >=4.0.0 <4.1.0 — UI server arbitrary file read/exec (dev only)
- HIGH postcss, rollup — build-time

## Part A — Autonomously fixable

**[CRITICAL] Real Gemini API key committed to git history and pushed to origin/main**
`src/services/aiAssistantService.js:21` @ commit `267d0e4` (2026-01-20). The line was an **assignment, not a fallback**: `const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY='AIzaSyDhw4eI0_nBXKU9C7s23vdukrUMx28NjlU';`. `git merge-base --is-ancestor 267d0e4 main` -> reachable from `main` AND `remotes/origin/main`. Also in `e4545d4`. The current `.env.local` key differs and even carries the comment "the old one was exposed!" — so it appears rotated locally, but **the exposed key must be REVOKED in Google Cloud, not just replaced**; revocation could not be verified. Effort S (user action).

**[CRITICAL] The Gemini API key ships in the production bundle**
`dist/assets/index-BoE9wpSZ.js` contains the live VITE_GEMINI_API_KEY (verified by matching .env.local against the bundle). Unlike Firebase config (genuinely browser-safe because firestore.rules enforces access), a Gemini key is a **bearer credential billed to the owner's GCP account**. `.env.example:34-40` asserts "All Firebase config is safe for the browser" — true — but the Gemini key sits under the same VITE_ heading and inherits the false reassurance. Mitigation now: HTTP-referrer + API restriction in GCP. Real fix is Part B #2. Note `firebase.json` has **no hosting block**, so the app isn't deployed via Firebase Hosting — blast radius limited until deployed.

**[HIGH] setFragmentNavExpanded is not defined — guaranteed ReferenceError**
`src/pages/FamilyTree.jsx:243`. grep returns only line 243 — the useState was deleted, the setter call left. Every fragment navigation throws after the d3 transition. Effort S.

**[HIGH] Duplicate JSON key silently corrupts a person record**
`src/data/wilfreyData.js:18` (id 25, "Signa Wilfrey"): `"dateOfBirth":"2007","dateOfBirth":5,` — second key should be `"houseId":5`. Signa gets `dateOfBirth: 5` and no houseId. Caught by no-dupe-keys. File is currently orphaned but it's seed data. Effort S.

**[HIGH] `npm run test:run` exits 1 despite all 148 passing**
`src/utils/retryWithBackoff.test.js`, e.g. `:319-344`. Creates rejected promises, awaits `vi.runAllTimersAsync()`, attaches try/catch only afterwards. Node flags unhandled rejections during the timer flush; the comment at `:330` claims to prevent this but attaches one tick too late. Makes the suite unusable as a gate. Fix: `.catch(e=>e)` at creation, or `await expect(p).rejects.toMatchObject(...)`. Effort S.

**[HIGH] 11 conditional-hook violations**
`src/components/home/QuickActions.jsx:63,67,71,75,79,88` (5 useCallback + 1 useMemo) and `RecentActivity.jsx:102,106,110,115` called conditionally — hook order can change between renders, corrupting React's hook state. Plus 3 set-state-in-render (`PersonList.jsx:287`, `RelationshipList.jsx:222`, `WritingWizard.jsx:164`). Latent crash/infinite-render bugs. Fix: hoist above the early return. Effort M.

**[HIGH] `git gc` will reclaim most of a 313 MB .git** — 5,653 objects, 0 packs, never packed. Non-destructive. Effort S.

**[HIGH] Patch the two shipped-runtime vulnerabilities** — react-router-dom past 7.14.1 and dompurify past 3.4.11 **specifically**, not a blanket `npm audit fix`. DOMPurify is the app's only defense across 21 sanitize call sites (`src/utils/sanitize.js` handles external SVG charges AND user markdown). Effort S.

**[MEDIUM] ESLint lints old-build-archive/ and lacks Node globals** — `eslint.config.js:9` globalIgnores(['dist']) only. no-undef fires on `vite.config.js:15` (process), `src/test/setup.js:42,49,70` (global), `featureFlags.js:359` (process) purely because only globals.browser is configured. Effort S.

**[MEDIUM] `process.env.NODE_ENV` in browser source** — `featureFlags.js:359`. Vite statically replaces it (verified: no `process.env.*` in dist), so not a live crash, but it's the only `process` reference in src/ and the codebase uses import.meta.env everywhere else. Effort S.

**[MEDIUM] Delete 14 orphan modules (~7,181 lines) + useFormState.js**
Notable: `BulkFamilyImportTool.jsx` (608) is explicitly superseded — `UnifiedImportTool.jsx:11` says "Replaces BulkFamilyImportTool with broader capabilities" — yet the file and CSS remain. `PersonCard.jsx` (389) is dead AND is one of only two files consuming feature flags, inflating the flag system's apparent usage. `components/bugs/index.js` is an 11-line barrel nobody imports. Effort M.

**[MEDIUM] `src/features/` contains only a .DS_Store** — an empty scaffold. No .DS_Store is tracked in git, but they litter the working tree. Add `.DS_Store` to the repo .gitignore (currently only global). Effort S.

**[MEDIUM] Remove unused dep, move build-time deps to devDependencies** — see Deps above. Effort S.

**[MEDIUM] No CI, no pre-commit hooks** — no .github/.gitlab-ci.yml/.circleci; 0 husky/lint-staged. Nothing enforces build/lint/test. A gate added today would fail, so sequence after the fixes above. Effort S.

**[LOW] index.html ships the default Vite favicon and no metadata** — `:5` `href="/vite.svg"`; no meta description, no theme-color; two blocking Google Fonts links.
**[LOW] Stale caniuse-lite** — `npx update-browserslist-db@latest`.
**[LOW] Local main is 1 commit behind origin/main**; stale `audit/comprehensive-fixes` branch local+remote. Commit style is good: 31/37 conventional.

## Part B — Needs user input

1. **Purging the leaked key from git history.** `267d0e4` and `e4545d4` are on origin/main. (a) Revoke + leave history — zero risk to clones, string stays in GitHub forever (fine if the key is genuinely dead; secret-scanning will keep flagging). (b) `git filter-repo` + force-push — removes it, rewrites every SHA, breaks the audit branch and any clone. (c) Delete and recreate the GitHub repo from fresh history. Depends on whether the repo is public and whether SHA stability matters.

2. **Gemini key architecture.** Any VITE_ key is public by construction. (a) GCP referrer/API restrictions — 10 min, but referrers are spoofable; stops casual not determined abuse. (b) Proxy through a Firebase Cloud Function with App Check — actually secure, but breaks the "no backend server of our own" premise in CLAUDE.md and adds cost/deploy surface. (c) Each user supplies their own key in app settings, stored in IndexedDB — keeps local-first pure, moves billing to the user, adds onboarding friction.

3. **`extras/` — 29.27 MB, 4,459 files, entirely unreferenced.** No hits for "extras/" in src/index.html/vite.config.js. `extras/icons` 17 MB / 4,087 SVGs (`public/icons` is an **empty directory**, so never wired up); `extras/heraldic-svgs` 19 MB / 235 SVGs whose basenames are a **100% subset** of public/heraldic-charges — pure duplication of shipped assets; `extras/Backups` 2.5 MB of dated JSON world exports. (a) delete heraldic-svgs (provably duplicated), keep icons as a source library; (b) move to a separate assets repo or Git LFS; (c) keep — after gc the repo isn't painful. Can't tell whether extras/icons is a staging area or abandoned.

4. **`old-build-archive/` (36 files) and `archived-components/` (2).** old-build-archive is a complete copy of a previous app version plus `*BACKUP_BEFORE_DYNAMIC_GENERATIONS`, `AppBackup.jsx`, `CodexEntryView copy.jsx`. Only 0.44 MB but pollutes lint (18 problems) and every repo-wide grep. (a) delete — git history already has it; (b) keep + gitignore/lint-ignore; (c) tag the last commit containing the old build, then delete.

5. **`firebase-tools` as a devDependency.** ~100 MB of node_modules and the source of the basic-ftp critical / hono high / grpc-js high advisories. (a) remove, install globally — slims installs, drops most audit noise, loses version pinning; (b) keep for reproducible deploys. Depends on whether deploys run from CI or laptop.

6. **TypeScript.** @types/* installed against 0 TS files. The two highest-value bugs found (setFragmentNavExpanded undefined, duplicate JSON key) are exactly what a type checker catches free. (a) drop the @types and stay JS; (b) keep + add `// @ts-check` + JSDoc to services incrementally — real safety, zero build change; (c) full migration, unrealistic at 103k LOC solo. Recommendation: (b) on `src/services/` only.

7. **`no-unused-vars` severity — 446 errors making lint useless.** Set to `error` at `eslint.config.js:23`; lint can never pass, so it's noise not a gate. (a) downgrade to warn, error only for no-undef/no-dupe-keys/rules-of-hooks — green gate today, tolerates debt; (b) bulk-fix all 446 first (dataSyncService alone has 164); (c) add argsIgnorePattern '^_' and fix the rest.

8. **Bug tracker sync bypasses the documented architecture.** `bugService.js` (586 lines) header at `:4` and `:15` claims "CRUD operations for bug reports with cloud sync support" and "Bugs sync to Firestore under /users/{userId}/bugs/{bugId}" — but contains **zero sync calls**. Actual sync is a private `syncBugToCloud()` at `BugContext.jsx:64` importing firebase/firestore directly, bypassing dataSyncService. The path also differs from every other entity (`users/{uid}/bugs/{id}` vs the documented `users/{uid}/datasets/{datasetId}/{collection}/{docId}`) — though `firestoreService.js:2083` DOES list 'bugs' in its per-dataset array, so the two disagree. (a) move sync into dataSyncService and pick one path; (b) document bugs as a deliberate account-level exception and fix the misleading comment. "Bugs are per-account, not per-world" may well be intentional.

9. **Feature flags: 36 of 40 are inert.** `featureFlags.js` is 368 lines / 40 flags (16 true, 24 false) / 8 helpers. Complete consumer set: `PersonForm.jsx` and `PersonCard.jsx` — and PersonCard is an orphan. They use exactly **3 flags**, all MODULE_1E (SPECIES_FIELD, MAGICAL_BLOODLINES, TITLES_SYSTEM), all already true. The other 37 gate nothing. 7 of 8 helpers have no callers. **CLAUDE.md:116 says "intentionally off," which reads as implemented-but-disabled — they are in fact unimplemented**, a materially different thing and misleading for planning. (a) delete the file, inline the 3 live checks; (b) keep flags matching real roadmap items, delete the rest, treat as a roadmap doc; (c) keep and correct CLAUDE.md.

10. **`docs/claude-context/` — 700 KB of regenerable JSON tracked in git.** Internally coherent (stats match array lengths in every file), but exported **2026-06-18** (~6 weeks stale) and 3 of 8 files are dirty right now. `codex-entries.json` (0.46 MB) is the #2 largest blob in history and appears at multiple sizes — every export churns a new ~0.5 MB blob. (a) gitignore it — regenerates on demand, but a fresh clone has no snapshot for Claude; (b) keep and accept churn (mitigated by gc); (c) track only `_master-summary.json` + `houses.json`.

11. **Bundle splitting.** The 1.15 MB entry chunk is dominated by Firebase (113 matches vs 18 Dexie, 7 D3). (a) manualChunks splitting firebase/d3/TipTap-ProseMirror — biggest win, ~30 min; (b) make Firebase truly lazy (currently imported at module scope by `src/config/firebase.js`) so offline-only users never download it — matches the local-first premise, real refactor; (c) raise chunkSizeWarningLimit and move on — legitimate for a solo local-first app loaded once.

## Recommended test strategy

Current: **5 test files, 148 tests**, covering `src/utils/` (3), `database.js` (1), `PersonForm.jsx` (1) — against 103,087 LOC.

| Dir | LOC | Test files |
|---|---|---|
| components | 34,815 | 1 |
| services | 23,631 | 1 |
| pages | 16,602 | **0** |
| data | 11,394 | **0** |
| utils | 10,238 | 3 |
| contexts | 1,939 | **0** |
| hooks | 1,029 | **0** |
| config | 488 | **0** |

**Five of six subsystems have zero tests** (Codex, Armory, Dignities, Writing Studio, AI). Only Family Tree has partial coverage via RelationshipCalculator.test.js.

Fix the exit-code-1 problem first — an unreliable suite discourages adding to it.

Top 10 highest-risk untested modules (data-mutation risk x size):
1. **dataSyncService.js** — golden-rule enforcement point, 164 lint problems, LWW. Test: each trio issues the right op with the right datasetId; sync failure never throws into the caller.
2. **firestoreService.js** — 1,900+ lines, 500-op batch cap. Test: batches split at >500; the collection list at `:2083` matches what dataSyncService writes.
3. **migrationService.js** — Test: each migration is idempotent and a no-op on already-migrated data.
4. **utils/bulkFamilyImport.js** — bulk mutation entry point. Test: the validation rules in CLAUDE_CODE_DATA_INTEGRATION_GUIDELINES reject bad input rather than half-importing.
5. **contexts/GenealogyContext.jsx** — Test: CRUD updates local state optimistically and survives a sync rejection.
6. **dignityService / dignityAnalysisService** — succession is pure computation over graph data; **highest test-value-per-effort in the repo**.
7. **treeRelationshipMaps + familyBlockLayout** — pure functions feeding D3, trivially testable.
8. **wikiLinkParser** — runs marked + DOMPurify. Test XSS payloads survive sanitization, especially given the open DOMPurify advisory.
9. **codexService.js** — backlink bookkeeping is exactly the bidirectional state that silently drifts.
10. **bugService.js** — the sync-path discrepancy in B#8 is precisely what a test would pin down.

Sequence: (1) green the suite -> (2) pure-function tests for #6/#7/#8 (fast, no mocking) -> (3) fake-indexeddb integration tests for #1-#5 using the existing `src/test/setup.js`. `src/test/testUtils.jsx` itself has 10 lint problems — clean before building on it. Skip component tests: 34k LOC with 1 test, ROI far lower than locking down sync.

## Recommended docs structure

72 files / 1.92 MB: 12 root files + plans/ (16) + Family-Buildout-Drafts/ (22) + claude-context/ (8) + audits/ (5) + Bulk-import-testing/ (4+) + "Deep Lore"/. **Three directories have spaces in their names** ("Deep Lore", "Family history Bulk import files", "Wilfrey of Riverhead") — breaks naive shell tooling.

Concrete problems:
- **CLAUDE.md is wrong about README.md.** CLAUDE.md:108 says it "predates Dignities + Writing Studio; understates heraldry." In fact README has a `### 👑 Dignities` section (`:115`), `### ✍️ The Writing Studio` (`:125`), a 50-line Armory section (`:42`), a status table listing all ten systems, and a stack section (`:205`) correctly naming Vite 7 / Dexie v17 / Firebase 12 / TipTap 3. Its 7 documented npm scripts exactly match package.json. **The README is accurate; the warning about it is the stale artifact.**
- CLAUDE.md undercounts console calls (~450 vs 1,175).
- CLAUDE.md mischaracterizes feature flags as "intentionally off" when 37 of 40 gate nothing.
- **Four overlapping audit docs** from the same week: AUDIT_REPORT.md (Jan 12), AUDIT_REPORT_2026-01.md (Jan 23), CODEBASE_AUDIT_REPORT.md (Jan 23), Audit-doc-.md (Jan 23, trailing-hyphen typo).
- Two versions of the same proposal: heraldry-system-proposal.md and -updated.md.
- **docs/plans/ conflates three things**: completed handoffs, live guides, speculative proposals. CLAUDE.md:114 admits "some aspirational" without saying which, so every file must be read to find out.
- **Worldbuilding content mixed into engineering docs**: house_wilfrey_datasheet.md, the_codified_charter..., medieval_place_derived_naming_codex.md, Family-Buildout-Drafts/ (22 files, 580 KB), Deep Lore/. That's *world data*, and much duplicates the app's own 403-entry Codex.
- `Lineageweaver_Project_Documentation_Updated.md` (Jan 15) is a third overview competing with README and CLAUDE.md. `lineageweaver-claude-code-prompt.md` (Jan 14) predates and is superseded by CLAUDE.md.
- Nothing touched since Jan 31 except claude-context/.

Proposed — four tiers, one rule each:
```
README.md          # WHAT + how to run. Already good — keep.
CLAUDE.md          # HOW to work in the code. Fix the 3 errors above.
docs/
  guides/          # Evergreen. Must be true or deleted.
    development.md · data-import.md · firebase-setup.md
  roadmap.md       # ONE file. Replaces all 16 of docs/plans/.
  decisions/       # Dated, append-only, never edited.
  archive/         # Write-only. audits/ · handoffs/
  claude-context/  # Machine-generated. Do not hand-edit.
world/             # OUT of docs/ — content, not documentation.
```
Four rules that make it survivable solo:
1. **One roadmap file, not a directory.** 16 files is 16 files nobody deletes. A single roadmap.md with Now/Next/Someday/Abandoned lets an idea move to Abandoned in one line.
2. **archive/ is write-only.** Anything not currently true goes there instead of being deleted — removes the emotional cost of pruning, which is the actual reason solo doc trees rot.
3. **Separate world content from software docs.** The app already has a 403-entry Codex for exactly this.
4. **kebab-case directory names, no spaces.**

For staleness: a `> Last verified: YYYY-MM-DD` line at the top of each `guides/` file; anything older than the last schema bump is archive-eligible. `archive/` is exempt by definition — which is what makes the rule survivable.
