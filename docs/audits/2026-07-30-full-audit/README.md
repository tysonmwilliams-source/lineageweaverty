# Lineageweaver — Full Audit

> **Status:** Part One is complete and merged to `main` (Phases 0–5, plus a
> Phase 6 follow-up pass for bugs found while implementing them). Part Two is
> **in progress** — see the **DECIDED** table below for what has been answered
> and shipped, and [`HANDOFF.md`](HANDOFF.md) for current baselines and every
> place this document turned out to be wrong.
>
> **A1 is done (2026-07-30).** The leaked Gemini key was deleted in Google AI
> Studio along with two others, a replacement was issued and stored in
> `.env.local`. The key string is redacted from this report, but it remains in
> git history by decision **A2** — so treat it as public and permanently dead,
> never as a secret that was recovered.

> **Correction (Phase 5):** three Part One items were described inaccurately.
> **#66** — `downloadHeraldry()` does not exist and never did; there was no
> heraldry export path at all, so it was written from scratch rather than wired
> up. **#64** — `runIntegrityCheck()` could *not* have caught the broken Crown:
> `findOrphanedRecords` never looked at dignities in any form. It was extended
> with dignity and heraldry reference checks before being wired. **#68** —
> `targetWordCount` was already rendered for story *beats*; the unrendered one is
> the per-writing target. Separately, `reorderChapters`/`moveChapter` (#67) and
> `validateWikiLinks`/`getSuggestedEntries` (#63) each carried a latent bug that
> only became reachable once wired — no cloud sync, and a missing `datasetId`
> respectively — so both were fixed as part of connecting them.

> **Correction (Phase 4):** **#60** — SVGO also needs `mergePaths` disabled, not
> only `convertColors`. It collapsed 133 paths into 8 on a single charge, and
> rewriting subpaths into one `d` can flip even-odd/nonzero winding and silently
> alter traced art that has no source to regenerate from. **#61** understated the
> count: CLAUDE.md was wrong in six places, not three. **#55** — `.DS_Store` was
> already in `.gitignore`. **#57** — dropping `@types/react*` would pre-empt
> decision F4, which recommends keeping them; they were left in place. And the
> `arcMilestones` phantom (#50) was actively harmful rather than inert: both
> upload paths threw a `TypeError` reading its nonexistent Dexie table on every
> sync.

> **Correction (Phase 3):** Part One item #35 said to import the 1,468 lines of
> shared CSS in `src/styles/shared/` and `shared-forms.css`. That was wrong.
> Measured during implementation: those files define 112 class names, of which
> **zero** are referenced in any JSX (the one apparent match, `.form-group`, is
> a collision — every page defines its own). `buttons.css` uses an `.lw-*`
> prefix, `shared-forms.css` uses `.form-*`; they are two incompatible,
> unadopted drafts. Importing them would ship 1,468 lines of dead CSS and risk
> restyling two forms. They were left unimported — whether to delete them or
> keep them as a seed is now folded into decision **B1/B3**.

**Date:** 2026-07-30
**Scope:** every file in the repository — 103,087 LOC JS/JSX, 46,738 lines CSS, 342 source files, 72 docs, 21 MB of assets
**Method:** eight parallel deep-read passes (one per subsystem plus data layer, design system, repo hygiene, and cross-system integrity), plus scripted integrity checks against the real world snapshot in `docs/claude-context/`
**Baseline:** last substantive commit `6f5e36b` (2026-02-06); `be17827` (2026-06) was docs/tooling only

Detailed findings live in [`sections/`](sections/). This file is the synthesis and the work plan.

---

## The short version

The app is more capable than it looks and less safe than it feels.

Six real subsystems, a genuinely populated world (320 people, 52 houses, 403 codex entries, 477 relationships, 26 dignities, 33 coats of arms), and a lot of genuinely good code — the dignity analysis service, the backlinks panel, the timeline view, the AI proposal validator, the login page. None of that is in question.

What's wrong falls into three buckets, and each has a single root cause rather than a long list of unrelated defects.

### 1. It doesn't look right because the design system was built and never turned on

`src/styles/shared/` and `src/styles/shared-forms.css` contain **1,468 lines of button, card, section, animation and form CSS** that **nothing imports**. `docs/DEVELOPMENT_GUIDELINES.md:73` documents `shared-forms.css` as the canonical place for form styling — a file that has never been loaded by the running app.

Because it was never wired up, every surface reinvented itself. The measurements:

| | |
|---|---|
| CSS lines across 115 files | **46,738** (0.86 lines of CSS per line of JSX) |
| Distinct class selectors defined | 3,559, against 596 referenced in JSX |
| Files defining their own button styles | **56** |
| Distinct button classes | 194 |
| Distinct card classes | 367, across 28 files |
| Modal implementations | 126 classes / 14 files — the shared `Modal` has **2** consumers |
| Distinct page container widths | 7 (900/1000/1200/1400/1600 + nav at 1400) |
| Distinct breakpoints | 7 |
| Hardcoded hex/rgba in CSS | 202 + 528 |
| Hardcoded hex in JSX | 227 across 23 files |
| Separate `@keyframes spin` definitions | **22** |

Two further things make it read as flat and grey regardless of the CSS sprawl:

- **`--border-primary` fails 3:1 contrast in all seven themes** (1.44 to 1.74) and is used **470 times**. Card edges, table rules, input borders and section dividers are literally below perceptual threshold. The structural grid of the UI is invisible.
- **The type scale is bottom-heavy.** `--text-base` is 14px, `--text-xs` is 11px, and usage is `xs` (345) + `sm` (486) = **831 uses** versus 307 for everything base-and-up. Crimson Text is a low-x-height old-style serif; at 11px it is hard to read and at 13px it is the app's most common size.

Small grey text on brown with no visible structure. That combination, not the individual page layouts, is what "I'm not happy with how it looks" is describing.

Two more contributors worth naming: **239 emoji used as UI chrome** alongside a 207-icon Lucide system that already exists (`components/icons/Icon.jsx`), and a **full-screen white flash on every cold load** because `main.jsx` bundles only `theme-base.css` — which defines zero colours — while the real theme is injected as a `<link>` after first paint.

### 2. The background fragility is one root cause repeated sixty times

`dataSyncService.js` (2,450 lines) and `firestoreService.js` (2,238 lines) are **~2,800 lines of mechanical repetition**: 87 per-entity cloud functions and 60 sync wrappers that differ only by a collection-name string, plus the same 190-line restore block copy-pasted verbatim into two functions, plus four separate hardcoded collection lists **with three different contents**.

Every sync bug in this audit is a copy-paste divergence in that structure:

- Household roles call `sync*(userId, id, role)` against a 4-arg signature → documents written to `users/{uid}/datasets/<numericRoleId>/householdRoles/[object Object]`, and queue rows with `entityId: "[object Object]"` that can never be replayed or cleared.
- Heraldry does the same in four places → `getDatabase(42)` creates a **phantom IndexedDB named `LineageweaverDB_42`**, one per record.
- Codex imports do the same → one phantom database per imported entry.
- `dignityTenure`, `dignityLink` and `heraldryLink` are queued but have **no replay handler**, and are marked synced anyway — offline changes silently discarded.
- `acknowledgedDuplicates` and `bugs` are cleared by `deleteAllData` but appear in neither upload nor download — destroyed on every cloud restore.
- `arcMilestones` has a full cloud stack, a Firestore rule, and three sync wrappers, but **the Dexie table was never created**.

Only **10 of 25 entity types** have complete, correctly-wired local↔cloud CRUD. Eight have none at all.

The fix is not thirty patches. It's a manifest — one declarative table of entities, four generic operations — which collapses 4,700 lines to roughly 980 and makes five whole bug classes structurally impossible. Full design in [`sections/02-data-sync.md`](sections/02-data-sync.md).

### 3. There are four independent ways to silently lose data

Ranked by likelihood:

1. **The Story Planner never syncs and gets wiped.** `planningService.js` has zero `dataSyncService` imports; the 21 planner sync functions have zero callers. Because planner writes never enter `syncQueue`, `getPendingChangeCount()` is *structurally blind* to them — so the data-loss guard in `initializeSync` sees zero pending changes and proceeds to `deleteAllData()` (which explicitly clears all six planner tables, `database.js:1257-1263`) then restores from a Firestore subtree that was never written. Beat sheets, plot threads, character arcs, scene plans: gone on a sync-triggering login, no warning, no undo.
2. **"Complete backup" exports 4 of 26 tables.** `MigrationHooks.js:331-343` writes only people/houses/relationships/codexEntries. Not exported: all 33 heraldry, all 26 dignities and their tenures, all codexLinks, the entire Writing Studio, all planning tables, householdRoles. The house formatter also emits legacy `cadetBranchOf` while omitting `parentHouseId`, so **all 11 cadet branches flatten on restore**. The UI calls it "a complete backup" (`ImportExportManager.jsx:481`).
3. **Restoring a backup can be wiped by the next sync** — import bulk-adds straight to Dexie without touching `syncQueue`, so the same guard fails to trip.
4. **Deletes that come back.** Deleting a house reverts in the cloud (member `houseId`s and the codex entry are cleared locally only). Deleting a codex entry never syncs — including from the cleanup tool, whose entire purpose is removing duplicates, making its deletions the ones *guaranteed* to return. Deleting heraldry hits the default dataset and leaves `houses.heraldryId` dangling while the UI promises otherwise.

Plus one that's already spent: **a live Gemini API key sits in git history on `origin/main`** (`267d0e4`, `src/services/aiAssistantService.js:21` — an assignment, not a fallback). Source is clean now and `.env.local` has a different key, but rotating locally does not disable the old one.

---

## The pattern behind all of it

The most striking thing in 1,573 lines of findings isn't any single bug. It's how much finished, working code is **built but not connected**:

| Built | Connected? |
|---|---|
| 1,468 lines of shared design-system CSS | Never imported |
| `ListSearchBar` with a 300ms debounce | 1 caller; four other search boxes are undebounced |
| `searchCharges()` — keyword-indexed, 287 charges | Unused; the creator has 17 tabs and no search |
| `validateWikiLinks()` / `getSuggestedEntries()` | Zero callers — the two missing wiki features |
| `runIntegrityCheck()` / `findOrphanedRecords()` | Zero callers — would have caught the broken Crown |
| `divisions.js` — a data-driven division renderer | Zero importers; a 400-line `switch` does it instead |
| The AI proposal validator, differ and rollback stack | Unreachable — executor called with the wrong context shape |
| `useDignityAnalysis({ autoRun: true })` | `autoRun` is never destructured; there is no `useEffect` |
| `reorderChapters` / `moveChapter` | Zero callers; chapters can't be reordered |
| `personalArmsRenderer.js` — a full cadency engine | Zero callers; "Create Personal Arms" passes params the creator doesn't read |
| Heraldry `parentHeraldryId` / `derivationType` schema | No UI — "create cadet arms from this" is modelled and unbuilt |
| 8 of 14 shared components | Missing from the barrel, so they're deep-imported and see 1–4 uses each |
| 37 of 40 feature flags | Gate nothing at all |

This is the signature of chat-driven development: each feature was built well and completely, then the next conversation started somewhere else. **A large fraction of the available improvement is wiring, not writing.** That's good news — it's the cheapest kind of work there is.

The corollary is that the codebase is not in bad shape structurally. The god components are real (`HeraldryCreator.jsx` 2,257; `DignityView.jsx` 2,149; `FamilyTree.jsx` 1,941; `QuickEditPanel.jsx` 1,728) but they're mostly *long*, not tangled — the extraction boundaries are clean and obvious.

---

## Health check

| Signal | Result |
|---|---|
| `npm run build` | Passes, 13.3s — but a **1,153 kB entry chunk** (Firebase-dominated), no `manualChunks`, no `build` block in `vite.config.js` at all |
| `npm run lint` | **521 errors, 39 warnings** across 148 files. `dataSyncService.js` alone has 164. Includes 6 `no-undef`, 11 rules-of-hooks violations, 1 duplicate JSON key |
| `npm run test:run` | 148/148 pass — **but exits 1** on unhandled rejections. Unusable as a CI gate |
| Test coverage | 5 test files / 103k LOC. **Five of six subsystems have zero tests** |
| `console.*` | **1,175** (CLAUDE.md says ~450 — that's `console.log` only). 22 DEV guards |
| Dead code | **~7,338 lines** across 15 orphan modules, verified by full import-graph resolution |
| `.git` | **313 MB** for 56 MB of content — 5,653 loose objects, never packed. `git gc` reclaims most of it |
| `extras/` | 29 MB / 4,459 files, entirely unreferenced. `extras/heraldic-svgs` is a 100% subset of already-shipped assets |
| Charge assets | 21 MB / 355 SVGs, 68 of them orphaned; all copied verbatim into `dist/` |
| npm audit | 44 vulns. Two matter: `react-router-dom` (RCE, fix available) and `dompurify` ≤3.4.11 (XSS — the app's only sanitizer, 21 call sites) |

And the world data itself, scripted against the real snapshot:

**The genealogy core is exceptionally clean.** Zero dangling `houseId`s, zero broken relationship references, zero ancestry cycles, zero people with >2 biological parents, zero impossible dates across all 382 parent-child pairs, zero cadet-branch cycles. That's unusual and worth saying plainly.

The damage is elsewhere:
- **The Crown (dignity 7) is structurally broken** — `currentHolderId: 82` points at a nonexistent person, `successionType` is unset, and its house has zero members. All 24 other dignities chain up to it, and `calculateSuccessionLine` returns an empty array with only a `console.warn`.
- **219 of 1,787 wiki-links are broken** (12.3%), across 109 targets in 86 entries.
- **189 of 403 codex entries are empty auto-created stubs** — nearly half the Codex.
- **15 duplicate codex titles**, which resolve non-deterministically because wiki-links key on lowercased title and the last one inserted wins.
- **Codex taxonomy has drifted to 12 `type` values and 42 `category` values** (72 null) — so the browse filters silently miss entries.

---

# PART ONE — What I can fix autonomously

Everything here has a determinate right answer. No taste calls, no worldbuilding decisions, no destructive operations on your content.

I've sequenced it so each phase is independently shippable and testable, and so the safety work lands before the cosmetic work.

### Phase 0 — Stop the data loss (highest priority)

| # | Fix | Where |
|---|---|---|
| 1 | Wire the 21 planner sync functions into `planningService.js`; thread `user?.uid` through all 8 planner views | `planningService.js`, `components/writing/Planner/**` |
| 2 | Fix `useAutoSave`'s unmount effect (`[data]` → `[]` + ref) — restores the 1500ms debounce, ends per-keystroke Firestore writes | `hooks/useAutoSave.js:107` |
| 3 | Capture `chapterId` with the autosave payload so a chapter switch can't overwrite the wrong chapter | `WritingEditor.jsx:155-200` |
| 4 | Make the backup export enumerate all 26 tables from the schema and stop field-whitelisting | `MigrationHooks.js:331-343` |
| 5 | Route backup import through the sync wrappers (or enqueue `syncQueue` rows) and wrap it in a transaction | `ImportExportManager.jsx:404-420` |
| 6 | Fix the 3 household-role, 4 heraldry and 2 codex-import `sync*` arity bugs — these create phantom databases | 9 call sites |
| 7 | Add the 3 missing `syncMap` handlers; make unknown entity types throw instead of silently marking synced | `dataSyncService.js:298-400` |
| 8 | Stop `deleteAllData` clearing `bugs` and `acknowledgedDuplicates` (they have no cloud counterpart) | `database.js:1235,1247` |
| 9 | Sync the house-delete cascade and the codex-delete paths; null `houses.heraldryId`/`people.heraldryId` in `deleteHeraldry` | 5 files |
| 10 | Reload genealogy data on dataset switch (`key` the provider) — currently edits in world B write into world A | `App.jsx:370` |
| 11 | Pass `datasetId` to the 6 places that silently fall back to the default database | Codex, dignities, heraldry, wiki-links |

**Effort: ~2–3 days.** This is the phase that stops you losing work.

### Phase 1 — Crashes and dead features

| # | Fix | Where |
|---|---|---|
| 12 | `setFragmentNavExpanded` is undefined — every fragment navigation throws | `FamilyTree.jsx:243` |
| 13 | Add cycle guards to `familyBlockLayout` and `DignitiesLanding.buildNode` (currently: browser freeze / stack overflow) | 2 files |
| 14 | Fix the `'parent-child'` vs `'parent'` vocabulary bug — this makes *all* circular-ancestry and integrity checking dead | `dataIntegrity.js`, `database.js:917` |
| 15 | Guard the null holder in `runFullAnalysis` — deleting a titled person currently breaks the whole analysis page | `dignityAnalysisService.js:347` |
| 16 | Implement the ignored `autoRun` option — turns on two permanently-empty suggestion panels | `useDignityAnalysis.js:38` |
| 17 | Fix the co-parent dropdown (renders blank options, silently creates single-parent children) | `QuickEditPanel.jsx:1557` |
| 18 | Fix the People-list house filter (compares number to string — always returns 0 results) | `PersonList.jsx:199` |
| 19 | Fix the 17 wrong field names (`house.name`, `person.birthYear`, `house.seat`…) that kill the wiki-link house search, the lifespan canon check, and most Reference Browser previews | `entitySearchService`, `canonCheckService`, `ReferenceBrowser` |
| 20 | Wire the AI proposal executor's context correctly — switches on validation, diffs and rollback, all already built | `AIAssistant.jsx:223` |
| 21 | Fix the TipTap v2→v3 `setContent` signature and `history`→`undoRedo` | `TipTapEditor.jsx:226,139` |
| 22 | Fix 3-digit-year string comparison in every date validator (born 999 / died 1010 currently fails to save) | 3 files |
| 23 | Fix `setState`-in-`useMemo` in 3 list components; hoist 11 conditional hooks | 5 files |

**Effort: ~2 days.**

### Phase 2 — Make the app feel solid

| # | Fix | Where |
|---|---|---|
| 24 | Add `personId/houseId/dignityId/heraldryId` indexes to `codexEntries` (Dexie v18) and convert the four `getEntryBy*Id` scans — **measured 8,292ms → 4ms** | `database.js:527`, `codexService.js` |
| 25 | Debounce the four undebounced search inputs by reusing the existing `ListSearchBar` | 4 files |
| 26 | Memoize `sanitizeSVG` (currently re-parses 33 SVGs per keystroke in the Armory) | 8 call sites |
| 27 | Memoize `buildRelationshipMaps` and split the 21-dependency `drawTree` effect | `FamilyTree.jsx` |
| 28 | Replace `Array.includes` with `Set` in the layout hot paths | `familyBlockLayout.js`, `FamilyTree.jsx` |
| 29 | Share the `visited` set in `findAncestors`/`findDescendants` (currently O(n²) per redraw) | `treeHelpers.js` |
| 30 | Debounce prose analysis and precompile its regexes — currently ~22,000 regex compilations per keystroke | `WritingWizard`, `proseAnalysisService` |
| 31 | Add `AbortController`, timeout, backoff, and `finishReason`/`blockReason` handling to the Gemini transport; dedupe the two request builders | `aiAssistantService.js` |
| 32 | Add cleanup flags to the un-cancelled async loads (panels currently show mismatched data when clicked through quickly) | `QuickEditPanel`, `EntitySidebar`, `HeraldryCreator` |
| 33 | Add `manualChunks` for firebase/d3/tiptap — splits the 1,153 kB entry chunk | `vite.config.js` |

**Effort: ~2–3 days.**

### Phase 3 — Design system foundations (no aesthetic decisions yet)

| # | Fix | Where |
|---|---|---|
| 34 | Bootstrap the theme in `index.html` — kills the white flash on every load | `index.html`, `main.jsx` |
| 35 | Import the 1,468 lines of shared CSS that already exist; rename the ~15 colliding class names first | `index.css` |
| 36 | Add the 28 referenced-but-undefined CSS custom properties to all 7 themes | `styles/themes/**` |
| 37 | Raise `--border-primary` to ≥3:1 in all 7 themes; add `--border-subtle` for decorative rules | `styles/themes/**` |
| 38 | Fix the 29 token pairs failing AA contrast (accent, focus ring, warning, disabled text) | `styles/themes/**` |
| 39 | Point `--font-body` at a font that is actually loaded | `theme-base.css:36` |
| 40 | Delete the 47 duplicate token declarations that conflict between `theme-base` and the themes | `styles/**` |
| 41 | Fix `toggleTheme` so it doesn't discard your chosen theme | `ThemeContext.jsx:180` |
| 42 | Add `<MotionConfig reducedMotion="user">` — one line, fixes all 458 unguarded animations | `App.jsx` |
| 43 | Memoize the 4 unmemoized context provider values | `contexts/**` |
| 44 | Make the 6 Home system cards real `<Link>`s (currently keyboard-inaccessible); add `onKeyDown` to `Card` | `SystemCard.jsx`, `Card.jsx` |
| 45 | Replace `outline: none` with `:focus:not(:focus-visible)` + a `:focus-visible` companion across 46 files | codemod |
| 46 | Export all 14 shared components from the barrel | `shared/index.js` |
| 47 | Add a Vitest contrast test that fails CI on any theme pair below threshold | new |
| 48 | Add the missing catch-all route; standardise container widths on 3 tokens | `App.jsx`, themes |

**Effort: ~3 days.** Nothing here changes the design direction — it fixes what's broken and gives you a foundation to make that decision on.

### Phase 4 — Cleanup and hygiene

| # | Fix |
|---|---|
| 49 | Delete ~7,338 lines of verified dead code (15 orphan modules) |
| 50 | Delete or archive the `arcMilestones` phantom entity (~150 lines across 6 files) |
| 51 | Strip or DEV-guard 1,175 `console.*` calls |
| 52 | Replace 239 emoji with the existing `Icon` component |
| 53 | Fix the exit-code-1 test failure; add a GitHub Actions CI gate |
| 54 | Patch `react-router-dom` and `dompurify` specifically |
| 55 | `git gc --aggressive` (313 MB → ~30 MB); add `.DS_Store` to `.gitignore`; delete `src/features/` |
| 56 | Fix the ESLint config (ignore `old-build-archive`, add Node globals for config/test files) |
| 57 | Remove `@tiptap/extension-mention`; move build-time deps to devDependencies; add the phantom `@tiptap/suggestion` dep |
| 58 | Consolidate 22 `@keyframes spin`, 3 `formatDate`s, 3 `CLASS_ICONS`, 2 `harmonizeColor`s (with divergent maths), 2 `RankPips` |
| 59 | Delete the dead `withTheme` HOC; move `ThemeContext` into `contexts/` |
| 60 | Run SVGO over the 21 MB charge library — **but preserve `fill="#FFFFFF"` exactly**, since `convertColors` would break every recolor |
| 61 | Fix the 3 CLAUDE.md errors: 7 themes not 2; 1,175 console calls not 450; the contextRegistry tables *are* written; the README is accurate and the warning about it is the stale part |

**Effort: ~2 days.**

### Phase 5 — Wire up what's already built

The highest value-per-hour work in the whole audit.

| # | Fix |
|---|---|
| 62 | Wire `searchCharges()` into the Heraldry Creator — 287 charges currently have no search |
| 63 | Wire `validateWikiLinks()` and `getSuggestedEntries()` — gives you `[[` autocomplete and a broken-links report |
| 64 | Wire `runIntegrityCheck()` into the Data Health Dashboard — it would have caught the broken Crown |
| 65 | Read `personId`/`deriveFrom`/`birthPosition` in the Heraldry Creator — switches on the entire personal-arms cadency engine |
| 66 | Add a download button to the Armory (`downloadHeraldry()` exists, dead) — a design tool that can't export isn't finished |
| 67 | Wire `reorderChapters`/`moveChapter`; surface per-chapter `status`/`povCharacter`; allow inline rename |
| 68 | Surface `targetWordCount` (already persisted, never rendered) as a progress ring + session counter |
| 69 | Prune stale `codexLinks` on save so removed links stop producing phantom backlinks |
| 70 | Propagate person/house/dignity renames to the linked codex entry's denormalized title |

**Effort: ~3 days.**

---

**Part One total: roughly 14–16 working days.** I'd take it phase by phase, with a checkpoint after each — Phase 0 first regardless of anything else.

Two structural refactors are also unambiguously right, but they're big enough that I'd want a green light on timing rather than folding them in:

- **The sync manifest** (~4,700 lines → ~980, eliminates five bug classes structurally). Design and migration path in [`sections/02-data-sync.md`](sections/02-data-sync.md). ~1 week, 7 independently revertable steps.
- **The planner view abstraction** (`usePlanningEntity` + `PlannerMasterDetail` + `PlannerFormModal`): 3,873 lines of view code → ~1,400 and 7,858 CSS → ~3,000, and it's the natural place to enforce the sync rule once. ~4 days.

---

# DECIDED — answered by the owner, implemented

| # | Decision | Chosen | Commit |
|---|---|---|---|
| **B1** | Aesthetic direction | **Full manuscript** — everywhere, not split | `44ee951` |
| **B2** | Base font size | **Swap the body face**, sizes unchanged → Source Serif 4 | `e14bfa7` |
| **B3** | Tailwind | **Remove it** | `f51d5c7` |
| **F3/G6** | Lint severity | **Downgrade `no-unused-vars` to warn**, make lint a blocking gate | `e14bfa7` |
| **B4** | Themes | **Keep all seven** (contrast gate makes it cheap) | `705583f` |
| **C1** | Mobile | **Full responsive** — complete | `4d1f784`…`1dc3d83` |
| **A2** | Key history | **Revoke, leave history** — no code change | — |
| **F2, F6, G4, G5** | Housekeeping | Archives + stale branch deleted, favicon, claude-context untracked | `705583f` |
| **D1** | Succession rules | **Correct rules + change report**, adopted | `cf59650`…`91904b4` |
| **D2** | Dynasty | **House plus its cadet branches**, via `parentHouseId` | `91904b4` |
| **D3** | Adoption | **Adopted inherit after natural issue**; adopted links now count | `91904b4` |
| **D4** | The broken Crown | **Vacant**, and male-primogeniture — owner applies in-app | `9da1c19` (guard) |
| **G2** | `RankPips` | **Shared component wins**; private copy deleted | `adbbb73` |
| **G3** | Unimported shared CSS | **Deleted** — 1,481 lines | `adbbb73` |
| **G1** | Remaining emoji | **Partly done**: 3 invisible icons fixed; the rest deliberate | `adbbb73` |
| **G7** | React Compiler lint | **`static-components` now**, rest scheduled — rule promoted to error | `bb8fd32` |
| **C4** | Planner | **Promote to a route** — `/writing/:id/plan/:planId/:view` | `72068fe` |
| **C3** | Marshalling | **Recursive composition** — the full rebuild | **complete** — 6 steps, `87aa243`…`8740b32` |
| **F4** | TypeScript | **Full migration** to `.ts`/`.tsx` | *underway* — services done bar the blocked pair, `4208429`…`0a06ec2` |

Notes worth carrying forward:

- **B1 was chosen as "full manuscript", against the recommendation of a split.**
  The ornament layer (`src/styles/manuscript.css`) is therefore built to be
  *opt-in per surface* rather than applied globally. That is how the stated risk
  is contained: the tree, Manage Data and the dignity tables are dense data
  surfaces where ornament fights scanning, so each opts in on its own merits. The
  token-level changes (radius, warm shadows) do apply globally, because those
  improve every surface.
- **B1 + B2 turned out to reinforce each other.** A taller-x-height body face
  directly mitigates the density risk of committing the whole app to manuscript
  styling — the legibility gain buys back what the ornament costs.
- **B3 removed three hardcoded `theme` objects as a side effect**, which fixed a
  bug nobody had catalogued: those objects branched only on `isDarkTheme`, so
  EpithetsSection, PersonalArmsSection and DataHealthDashboard rendered
  royal-parchment's browns in the five themes that are neither plainly dark nor
  plainly light.
- **F3 exposed a second class of lint debt.** `eslint-plugin-react-hooks` v7
  ships five React Compiler rules as errors and there are 33 violations. They
  were downgraded to warnings to get the gate green, but they are *not* the same
  kind of debt as an unused import — `static-components` (4, all in
  `CodexBrowse.jsx`) is a real bug class, and `set-state-in-effect` (14) is the
  cascading-render pattern. See G7.

- **G7 exposed a wrong severity claim, not a wrong fix.** All four
  `static-components` violations were one component — `SubsectionHeader` in
  `CodexBrowse.jsx`, built with `useCallback(fn, [])` and rendered as JSX. An
  empty dependency array makes the identity stable for a mounted instance, and
  the component holds no state, so the "resets its state on every parent render"
  framing in this document and in the handoff was wrong. What was true is that
  nothing enforced the stability. Hoisted to module scope; the rule is now an
  **error**, which is the part that prevents recurrence.
- **C3 and F4 are both multi-period programs, chosen together.** Between them
  they account for more calendar time than everything else outstanding. The
  sequencing constraint is real and is recorded under "Sequencing C3 and F4"
  below: a TypeScript migration and a heraldry-pipeline rewrite landing on the
  same files simultaneously is worse than either alone.

| **Sync manifest** | Timing of the structural refactor | **Go — manifest first, then type the two files it collapses** | step 1 done, `3204ecc` |

**Still to decide: C2, C5, C6, E1–E9, F1, F5, F7, F8** — and the planner view
abstraction, the one structural refactor still gated.

---

# PART TWO — What needs your input

Grouped by the kind of decision. My recommendation is marked in each, but these are genuinely yours.

## A. Urgent, action required from you

**A1. ~~Revoke the leaked Gemini key.~~ — DONE (2026-07-30).** `AIzaSyDhw4eI0…[redacted]` was deleted in Google AI Studio (https://aistudio.google.com/apikey), along with two other keys, and a replacement was issued and stored in `.env.local`. Verified locally: the configured key is no longer the leaked one and the Firebase key is untouched.

*Two corrections to this entry as originally written.* It said the key was in **two** commits; it is in **four** — `267d0e4` and `e4545d4` (source), plus `7be05a0` and `68afb6a`, because this audit report itself quoted the key in full. It also sent the owner to Google Cloud Console; for a key created through AI Studio, **AI Studio is the place**, and Cloud Console → APIs & Services → Credentials is only the authoritative second view. Worth knowing for next time: the Firebase browser key has the identical `AIzaSy` format and sits in the same Credentials list, so "delete the Google API key" is an ambiguous instruction and deleting the wrong one breaks auth and Firestore.

*Also worth recording:* the replacement key has an **`AQ.` prefix, not `AIzaSy`** — Google's newer AI Studio key format, 53 characters. Anything validating a Gemini key by the `AIzaSy` prefix or a 39-character length will reject a currently-issued key.

**A2. ~~Then decide about the history itself.~~ — DECIDED: revoke and leave history.** The key string stays in GitHub permanently, which is acceptable now that A1 has actually killed it. The report is redacted so a secret scanner has nothing live to find in the working tree, but **history is unchanged by choice** — anyone reading old commits will still see the string, and it is dead.

## B. Aesthetic direction — the actual answer to "I don't like how it looks"

These four are the ones I can't decide for you, and they're the ones that matter most for your stated complaint.

**B1. ~~What is this app trying to look like?~~ — DECIDED: full manuscript (`44ee951`).**
Right now it reads as *desaturated brown admin panel*, not *illuminated manuscript*. Every surface is a 6px rounded rectangle; shadows are pure black on warm brown (reads dirty grey, not candlelit); the accent gold appears 456 times as text colour and never as structure; the only genuinely thematic assets in the entire app are one fleur-de-lis and two corner flourishes on the Home hero.
- **(a) Lean into the manuscript** — warm-tinted shadows, a visible rule system in the accent hue, drop caps on Codex entries and chapter openers, ornamental section breaks, near-zero radius so surfaces read as trimmed vellum rather than iOS cards.
- **(b) Lean into the tool** — crisp high-contrast information design, serif for headings and prose only, clean sans for all chrome and data. Faster, more legible, less distinctive.
- **(c) Split it** — chrome is (b), content surfaces (Codex reading view, Writing Studio, Home, heraldry) are (a).
**Recommend (c).** The data surfaces are where legibility is failing and the content surfaces are where the atmosphere earns its keep. But this is your product's voice.

**B2. ~~Base font size.~~ — DECIDED: swap the body face to Source Serif 4, sizes unchanged (`e14bfa7`).** `--text-base: 14px`, `--text-xs: 11px`, and 73% of all type usage is at 11–13px in a low-x-height serif.
- **(a)** Bump the scale one step (base 16 / sm 14 / xs 12). Most legible, needs re-tuning of dense tables and tree labels.
- **(b)** Keep the sizes, switch the body face to something with a taller x-height at small sizes (Source Serif 4, Literata). Every layout intact. **Cheapest real win.**
- **(c)** Split the scale — 14px for data surfaces, 16–17px reading scale for Codex and Writing Studio.
**Recommend (b) now, (c) later** if you go with B1(c).

**B3. ~~Tailwind: commit or remove.~~ — DECIDED: removed (`f51d5c7`).** The app is 94% hand-written BEM and 6% Tailwind (7 files). `tailwind.config.js` defines 4 custom colours that Tailwind 4 never reads. Worse, Tailwind's theme variables *name-collide* with yours — `className="text-sm"` in `FamilyTree.jsx` renders at your 13px with a line-height computed from Tailwind's 14px assumption. Meanwhile the most-repeated stray hex values in your custom CSS *are* Tailwind's default palette, pasted by hand.
- **(a) Remove it** — rewrite ~513 utility usages in 7 files, drop the dep. **Recommend this**; it's the low-risk default and ends the collision.
- **(b) Go Tailwind-first** — one system, far less CSS, but a 6–12 month background project against 46,738 lines, and it fights the bespoke ornament.
- **(c) Keep both formally** — namespace your tokens `--lw-*`, Tailwind for layout only. Honest but permanently two mental models.

**B4. Seven themes, or two done well?** There are seven, not the two CLAUDE.md claims — 1,050 token declarations to keep in contrast parity, five of which currently ship an accent or focus ring below 3:1.
- **(a)** Two themes, both fixed to AA, delete five (1,470 lines).
- **(b)** Keep seven, add the automated contrast gate (Phase 3 #47 builds it anyway).
- **(c)** Two surface modes × N accent overlays (~10 tokens each) — keeps the variety, kills 90% of the maintenance.
**Recommend (c)** if you actually use them, (a) if you don't. Only you know.

## C. Product scope

**C1. ~~Mobile: support it or drop it?~~ — DECIDED: full responsive, and DONE (`4d1f784`, `630c09b`, `1dc3d83`).** Currently half-built and silently broken: below 1200px the Writing Editor hides the entity sidebar, below 768px it hides the chapter list too — with no replacement affordance, so your chapter list becomes unreachable. 28 of 115 stylesheets have zero media queries. Only 15 declarations anywhere meet the 44px touch target. But there *is* a full hamburger menu and a `--nav-height-mobile` token.
- (a) Declare desktop-only with an explicit gate below 900px.
- **(b) Mobile-read, desktop-write** — Home, Codex, Dignities responsive; Tree, Heraldry, Editor, Manage gated. **Recommend this** — it matches how a novelist actually uses this.
- (c) Full responsive — needs a list/breadcrumb fallback for the tree and bottom-sheet sidebars.

**C2. Gemini key architecture.** Any `VITE_` key ships to the browser. Firebase config is safe that way because rules enforce access; a Gemini key *is* the access.
- (a) Accept it — correct if this stays local-only. Better version: drop the env var, add a Settings field storing the user's own key in IndexedDB.
- (b) Proxy through a Cloud Function with App Check — ~60 lines, gives you rate limiting and per-user quotas, but breaks the "no backend of our own" premise.
- (c) Firebase AI Logic — purpose-built, no key in the client, no new vendor; costs a transport rewrite and a Blaze plan.
**Recommend (a)-with-Settings-field** unless you plan to deploy publicly, in which case (c).

**C3. ~~Quartering and impalement.~~ — DECIDED: commit to recursive composition. Not started.**

*Two corrections to what this entry originally said.* It claimed the quartering
and impalement functions still exist and "naively composite finished PNGs in a
file with zero importers". They do not exist: they lived in
`src/utils/heraldryUtils.js`, all 459 lines of which were **deleted in Phase 4**
(`cbcbeec`). The only survivor is two words in a JSDoc `@param` at
`heraldryService.js:280`. Second, the shield-shape claim checks out and is
better than stated — all five SVGs are present in `public/shields/`,
`SHIELD_TYPES` is already a live export from `heraldicData.js`, and the only
blockers are a commented-out `SHIELD_FILES` block
(`shieldSVGProcessor.js:27`) and a commented-out UI section
(`HeraldryCreator.jsx:2299-2331`).

So the work is a build, not a repair: the composition model becomes a recursive
node so quarters can contain quarters, and marriage arms — which *are*
impalement — become expressible. Every renderer, the save format, the Dexie
record shape and the SVG pipeline change, and existing coats need a migration.
**This is the one outstanding item that can damage heraldry already drawn**, so
it needs the migration and tests written before anything touches saved data.

**C4. ~~Story Planner: modal or route?~~ — DECIDED: promoted to a route (`72068fe`).**
`/writing/:id/plan` and `/writing/:id/plan/:planId/:view`. Bookmarkable,
refresh-safe, back button works. `StoryPlannerModal` is deleted.

*Correction:* this entry offered "fold into the editor's right rail" as an
untouched option. `PlanningSidebar` (545 lines) already occupied that rail; its
two buttons did nothing but open the modal. The planner refactor is now a
**routing change**, as the choice determined.

**C5. Household roles: fix or fold into Dignities?** Roles are dataset-unscoped, unsynced, and buried inside `HouseForm` — they read as an unfinished experiment, and `dignityService` already models offices via `dignityNature: 'office'`.

**C6. Multiple spouses.** The renderer assumes one spouse per person; the data model stores several. Today a widowed-and-remarried king shows one queen and his other children render as bastard lines. Also, the relationship *calculator* excludes divorced spouses and the *renderer* doesn't — one of them is wrong. Full support is an L-effort change through the layout engine; a "primary spouse + m.×3 badge" convention is M.

## D. Succession semantics — worldbuilding rules, not bugs

**D1. What should the succession algorithm actually model?** The current one matches no real system: a correct depth-first primogeniture walk is then **overwritten by a generational sort**, so a holder's grandson-via-eldest-son ranks *behind* his second son, and representation through a predeceased heir is broken entirely. Separately, women are globally demoted below all men, so a holder's daughter ranks behind his brother's grandson.
- (a) Implement the textbook rules properly in a pure, tested `successionRules.js` — 1–2 days, **but it will reorder lines you may have written prose around**.
- (b) Minimal correctness patch — ~2 hours, fixes the worst wrongness.
- (c) Relabel it "suggested" and add manual override.
**Recommend (a)** — this subsystem's entire purpose is succession — but the reordering risk is yours to accept.

**D2. Is a "dynasty" a house or a bloodline?** Agnatic seniority matches on `houseId`, so it **silently excludes every cadet branch** — the exact people who inherit under that system.

**D3. How do adopted and fostered children rank?** Currently `adopted` inherits identically to a natural legitimate child, and adopted/foster parent links are invisible to succession entirely. Both defaults are silent.

**D4. ~~The Crown (dignity 7) is broken.~~ — DECIDED: vacant, and male-primogeniture.**
The owner applies both fields in the app; the code half is `9da1c19`, which stops
a dignity being given a holder who does not exist.

*Two corrections from checking this against the data.* It said **24** other
dignities chain up to the Crown; it is **25** — every other dignity in the world
— though only 2 are sworn to it directly and the rest reach it through those.
And it asked whether person 82 was "someone you deleted": 82 sits inside a
contiguous gap of **103 missing ids (82–184)**, with a second at 189–284. That is
the shape of a bulk import rolled back or a mass delete, not a king removed on
purpose — so "who was 82" is probably unanswerable and does not need answering.

*A second defect, not in the audit:* the Crown has **no `successionType`**, so no
line could ever have been computed for it even with a valid holder. One of only
two dignities missing one. Answered as male-primogeniture, matching 24 of 26.

Its house (25, `"The Crown "`, with a trailing space and zero members) is
decision **E5**, still open.

## E. Your world data — 219 broken links and friends

I won't touch your creative content. These need a call:

**E1. 219 broken wiki-links (12.3%), three distinct kinds.** **8 are mechanical** (3 newline-in-title, 5 plural/singular — `[[Recordant]]` → "Recordants" alone is 9 occurrences) and I can fix those on your say-so. **4 are unedited template placeholders** (`[[Person 1]]`, `[[Location Name]]`) and are clearly accidental. **23 name real people or houses with no codex entry.** The remaining **72 point at nothing at all** (`[[Verisol]]` ×16, `[[Wood-Warden's Oath]]` ×10, `[[Mirellune]]` ×9) — these read as a deliberate forward-reference backlog, and stubbing or deleting them would destroy that. My suggestion: fix the 8 and the 4, leave the 72, and build you a "links to write" report.

**E2. 189 of 403 codex entries are empty stubs.** Auto-created for every person and house. They inflate every full-table read and the search index. Delete and regenerate on demand, keep as writing prompts, or stop auto-creating?

**E3. 15 duplicate codex titles.** `House Wilfson` (ids 4, 2506), `Riverhead` (15, 2667), `Aldric Wilfrey` (2689, 2711) and 12 more. Wiki-links key on lowercased title and the last insert wins, so `[[Riverhead]]` resolves non-deterministically. Merging means choosing which body text survives.

**E4. Codex taxonomy has drifted.** 12 `type` values (`location` 28 vs `locations` 11; `personage` 213 vs `people` 2) and 42 `category` values with 72 null (`Cadet Houses` 11 vs `cadet` 7; three spellings of "Castles &…"). The browse filters silently miss entries. Which vocabulary is canonical, and what should the 72 nulls become?

**E5. Two house titles the repair tool won't catch.** `fixHouseHousePrefixes` fixes 8 of the 10 doubled-prefix entries. It won't fix `"House The Crown "` (2507) or `"House Commoner"` (2844), because those houses are literally named `"The Crown "` and `"Commoner"`. What should those two be called?

**E6. Six people with 2–3 digit years.** The Shadash line — Fenric 30–105, Salenne 33–105, Fenricson 55–135, and three more — against a world otherwise dated 1680–2016. Their 80–90 year lifespans are internally consistent, which reads deliberate (an ancient era?), but they sort to the far left of every timeline. Intentional or typos?

**E7. Nine people named Baudin Wilson.** Spanning 1778→2007 in House Wilson — obviously a dynastic naming tradition, not duplicates (zero name+date collisions anywhere in your data). But the duplicate detector flags all 36 pairs and runs Levenshtein over them on every health check. Bulk-acknowledge them, or add regnal numbers (which changes displayed names throughout the tree)?

**E8. Two heraldry oddities.** "Arms of House Wilfrey of **Blackmount**" references a house that doesn't exist — Breakmount? And ids 26/27 are both "Arms of House Wilfrey of Riverhead"; which is canonical?

**E9. 13 people in zero relationships, 5 houses with zero members.** The 9-person Dunwilfrey/Dumwilfrey block plus four others are invisible in the tree. Almost certainly work-in-progress — confirm and I'll leave them alone.

## F. Housekeeping decisions

**F1. `extras/` — 29 MB, 4,459 files, entirely unreferenced.** `extras/heraldic-svgs` (19 MB) is a **100% subset** of already-shipped assets — safe to delete. `extras/icons` is 17 MB / 4,087 SVGs and `public/icons` is an empty directory, so they were never wired up: staging area or abandoned? `extras/Backups` is 2.5 MB of dated world exports.

**F2. `old-build-archive/` and `archived-components/`.** Only 0.44 MB but they pollute lint (18 problems) and every repo-wide grep. Git history already has all of it — but "I might want to look at the old layout code" is a legitimate reason to keep them.

**F3. ~~`no-unused-vars` severity.~~ — DECIDED: downgraded to warn; lint is now a blocking CI gate (`e14bfa7`).** Set to `error`, so lint can never pass and functions as noise rather than a gate. Downgrade to `warn` and error only on the high-signal rules (green gate today), or bulk-fix first?

**F4. ~~TypeScript.~~ — DECIDED: full migration to `.ts`/`.tsx`. Not started.**
Chosen against the recommendation of `// @ts-check` + JSDoc on `src/services/`.
Current state as verified: `@types/react` 19.2.5 and `@types/react-dom` are
installed, there are zero TS files, and there is **no `tsconfig.json` or
`jsconfig.json` and no `typescript` dependency at all** — so step one is
toolchain, not conversion. The two highest-value bugs in this audit
(`setFragmentNavExpanded` undefined, a duplicate JSON key) are exactly what a
type checker catches for free. See "Sequencing C3 and F4".

**F5. Feature flags.** 40 flags, 8 helpers, 368 lines — and exactly **3 flags are read**, all already `true`, one of the two consuming files being dead code. CLAUDE.md calls the rest "intentionally off", which reads as *implemented but disabled*; they are in fact **unimplemented**. Delete the file, or keep it as an explicit roadmap document? (If it *is* your roadmap, say so and I'll relabel it rather than delete it.)

**F6. `docs/claude-context/` — 700 KB of regenerable JSON, tracked in git**, six weeks stale, and every export churns a new ~0.5 MB blob. Gitignore it (regenerates on demand, but a fresh clone has no snapshot), or keep it?

**F7. Docs restructure.** 72 files / 1.92 MB, nothing touched since January, three directories with spaces in their names, four overlapping audit reports from the same week, two versions of the same heraldry proposal, three competing project overviews, and 580 KB of *worldbuilding content* mixed into engineering docs. Proposed structure — `guides/` (must be true or deleted), a single `roadmap.md` replacing all 16 files in `plans/`, `decisions/` (append-only), `archive/` (write-only, never pruned), and `world/` moved out of `docs/` entirely — is in [`sections/04-hygiene-build-tests.md`](sections/04-hygiene-build-tests.md).

**F8. Bug tracker path.** `bugService.js` claims cloud sync in its header comment and contains none; the real sync lives in `BugContext.jsx` bypassing `dataSyncService`, writing to `users/{uid}/bugs/{id}` while `firestoreService.js` lists `bugs` as a *per-dataset* collection. "Bugs are per-account, not per-world" may well be intentional — confirm and I'll fix the comment instead of the code.

---

## G. Carried over from Phases 4–6

Everything in Part One is now implemented. These are the items that surfaced
*during* implementation and stopped at a decision rather than a technical
blocker. Each one is small; none can be resolved without an answer.

**G1. ~~The remaining 44 emoji.~~ — PARTLY DONE (`adbbb73`); the rest is deliberate.**

*The count was wrong, in the usual direction.* Measured: ~90 emoji sit in `icon:`
data fields and ~86 elsewhere in non-logger code; a naive scan reports **1,163**,
almost all of them `logger.log('👑 …')` prefixes that no user ever sees. Another
scanner count that is not a defect count.

*What was actually broken was not emoji at all.* Three **icon names** —
`briefcase`, `medal`, `heart-handshake` — were read from
`data/dignityEducation.js` and passed to `<Icon name={...}>` without being in
`LUCIDE_ICONS`, so the office, personal-honour and courtesy dignity badges
rendered nothing. `icon-map.test.jsx` could not catch it because it scans for
the *literal* `<Icon name="…">` form. Fixed, and the test now also scans the
data maps that feed `<Icon>`.

*What remains is deliberate, not pending:*

- The `<option>` emoji in `BugReporterButton` and `DignityForm` stay. Browsers
  allow only text inside `<option>`, so a component child is invalid markup —
  this is the one place emoji is the technically correct choice.
- The `heraldicData` division glyphs (`✳`, `☷`, `✚`, `✕`) stay. They are
  diagram approximations of heraldic divisions, Lucide has no equivalent and
  never will, and replacing them with a generic line icon would make the picker
  less informative rather than more.
- The remaining `icon:` fields in data maps are a large mechanical conversion
  with no defect behind it, and several entries have no sensible Lucide
  equivalent. Worth doing as its own pass if ever, not as part of G1.

**G1 (original entry).** *(B1 is now decided — full manuscript — so the
`icon:` data-map group below can proceed whenever you want it; the other three
groups still stand on their own reasons.)* 55 more were converted to `<Icon>` in Phase 6, on
top of the 30 in Phase 4. What's left is left for a reason, and each group needs a
different kind of answer:

- **9 inside `<option>` elements** (`BugReporterButton.jsx` — severity and
  category selects). Browsers only allow text inside `<option>`, so a component
  child is invalid markup. The options are `🟢 Low` / `🟡 Medium` / `🟠 High` /
  `🔴 Critical` and `⚙️ General` / `🌳 Family Tree` / … Either they stay emoji, or
  they become plain text and the colour cue is lost, or the selects become custom
  listboxes (real work, and worse for accessibility unless done carefully).
  **Recommend: keep the emoji here.** This is the one place where emoji is the
  technically correct choice.
- **The `heraldicData` division glyphs** — `✳` for gyronny, `☷` for tierced in
  fess, `✚`, `✕`. These are diagram approximations of heraldic charges, not
  chrome. Lucide has no gyronny and never will. The right fix is real division
  artwork, which is what the (now deleted, recoverable from git) `divisions.js`
  renderer was reaching for. Related to **C3**.
- **`icon:` fields in the remaining data maps** (`epithetUtils`,
  `unifiedChargesLibrary` categories, `heraldicData` categories, and
  `DIGNITY_CLASSES.icon` which now has an `iconName` sibling). Mechanical to
  convert, but which surfaces keep an illustrative glyph and which get a uniform
  line icon is exactly what **B1** decides.
- **`🏴`** on the Armory's "Field (Base Layer)" section header — no Lucide
  equivalent. Needs either a different metaphor or a custom glyph.

**G2. ~~`RankPips` is still duplicated.~~ — DONE (`adbbb73`).** The exported
component in `DignityVisuals` turned out to be a strict superset — it already
accepted `count` and `max`, exactly how the private copy was called — so no API
change was needed. The two styles differed only by 6px vs 7px pips and a faint
gold glow; the shared one wins.

**G2 (original entry).** `DignityVisuals.jsx` exports a
feature-rich version styled with `.rank-pips*`; `DignityEducationPanel.jsx` has a
private copy styled with `.dignity-education__pip*`. The component logic is
trivially unifiable — the APIs are already compatible — but the two have
*different visual styling in different stylesheets*, so consolidating picks a
winner on screen. That's **B1/B3**, not a dedupe. Say which pip style wins and
this is ten minutes.

**G3. ~~`src/styles/shared/` + `shared-forms.css`.~~ — DONE: deleted (`adbbb73`).**
1,481 lines across five files, imported by nothing. Of their 115 class names
exactly one (`form-group`) appears in JSX, and that is the collision the Phase 3
correction identified. The "keep them as a seed for whatever B1 decides"
argument expired when B1 was decided and produced `styles/manuscript.css`
instead.

**G3 (original entry).**
Unchanged since the Phase 3 correction at the top of this document. Delete them,
or keep them as a seed for whatever **B1** decides? They cannot simply be
imported; that was the original plan and it was wrong.

**G4. The favicon is still Vite's default.** `index.html:5` points at
`/vite.svg`. Phase 3 added the meta description and theme-color, so this is the
last piece of default scaffolding in the page head. The app's only real mark is
the fleur-de-lis inlined in `components/home/HeroSection.jsx` — extracting that
into `public/favicon.svg` would work and would use your own artwork rather than
inventing branding, but choosing the app's mark is yours. Also worth deciding
whether the tab title stays plain "Lineageweaver".

**G5. The stale `audit/comprehensive-fixes` branch exists locally and on
`origin`.** Superseded by this audit's work. Deleting a remote branch is not
reversible from here, so it needs an explicit yes.

**G6. ~~Lint as a gate.~~ — DONE (`e14bfa7`).** Answered as decision F3.
Lint exits 0 and CI blocks on it. Every high-signal rule is a hard error
(`no-undef`, `no-dupe-keys`, `rules-of-hooks`, all at zero); `no-unused-vars` and the
React Compiler rules are warnings. See G7 for what this exposed.

**G7. ~~33 React Compiler lint violations.~~ — DECIDED: `static-components` taken, rest scheduled (`bb8fd32`).**
Done: all four were `SubsectionHeader` in `CodexBrowse.jsx`, now hoisted to
module scope, and `react-hooks/static-components` is promoted from `warn` to
`error` so it cannot come back. See the correction in the DECIDED notes — the
"resets state on every parent render" claim below was overstated for this
instance. 29 warnings remain, scheduled, described accurately below.

**G7 (original entry, for the 29 that remain).**
`eslint-plugin-react-hooks` v7 ships five React Compiler rules as errors. They
were downgraded to warnings so the lint gate could go green, and they are
flagged in `eslint.config.js` as deserving a dedicated pass. Do not confuse them
with the unused-variable debt:

- `react-hooks/static-components` (4, all in `CodexBrowse.jsx`) — a component
  created during render resets its state on every parent render. Real bug class.
- `react-hooks/set-state-in-effect` (14) — the cascading-render pattern.
- `react-hooks/preserve-manual-memoization` (10) — a `useMemo`/`useCallback` the
  compiler had to skip, so the memoization is not doing what it looks like.
- `react-hooks/refs` (3, `TipTapEditor.jsx`) — refs read during render.
- `react-hooks/immutability` (2, `CodexEntryForm.jsx`).

Fixing them is mechanical but touches render logic in files with no test
coverage, which is why it is a decision about appetite rather than something to
fold into a cleanup pass. ~~Recommend: take `static-components` now.~~ Done.

---

## Sequencing C3 and F4

Both were answered at their most ambitious option, and together they are longer
than everything else outstanding combined. They are not independent, and the
order is not arbitrary.

**Do not run them concurrently.** C3 rewrites the heraldry composition model —
the SVG pipeline, the save format, the Dexie record shape, and every renderer
that touches a coat. F4 converts those same files to TypeScript. Migrating a
file to `.ts` and then rewriting it is the worst case: the types get written
against a model that is about to be replaced, and the rewrite lands as a
conflict with itself. Either order avoids that; running them at once does not.

**Recommended order: C3 first, then F4 over the settled result.** Two reasons.
The heraldry model is the thing whose shape is about to change, so typing it
last is typing it once. And F4 is the interruptible one — a per-file migration
can pause at any file boundary with the build green, whereas C3 has a
mid-flight state where saved coats are in the old shape and the code expects the
new one. Long-running work should be the interruptible kind.

**F4's first step is toolchain, not conversion — DONE (`4208429`).**
`typescript`, `tsconfig.json` with `allowJs`, `npm run typecheck`, and a
blocking CI step, because Vite strips types without checking them and a green
build proves nothing about type correctness.

Three things that step settled, worth not rediscovering:

- **`checkJs` is off, deliberately.** On, it checks all 103k lines of existing
  JS at once, the gate is red from the first commit, and it gets switched off —
  exactly how `no-unused-vars` ended up at `error` with 411 violations and CI
  running lint with `continue-on-error`.
- **A `.ts` file matched no ESLint config**, so ESLint skipped it with "File
  ignored because no matching configuration was supplied". Every converted file
  would have silently left the lint gate. Fixed with a `typescript-eslint`
  block; verified in both directions with a probe.
- **TypeScript is pinned to 5.x, not 7.** `typescript-eslint` peers on
  `<6.1.0`, so TS 7 can only be installed by forcing a resolution the tooling
  does not support. Lint-covered TS 5 beats unlinted TS 7.

**Beachhead: `src/utils/succession`** — pure, no React, 32 tests, and its types
document the succession data model, which nothing else records.

**C3's first step is the migration and its tests, not the renderer.** This is
the only outstanding item that can damage heraldry already drawn.

### C3 progress — complete

All six steps are done, plus undo and combining arms by hand (`6c27246`), which
came out of the owner using the editor. The Armory can now express impalement,
quartering and arbitrary nesting; a marriage can be borne from the spouse
relationship in one click; and the stored format migrated without altering a
single drawn shield.


| Step | What | Status |
|---|---|---|
| 1 | The recursive model, the v1/v2 → v3 migration, and its tests | **done** — `87aa243` |
| 2 | Read path: readers go through `primaryLeaf`/`allLeaves`/`readCadency` | **done** — `5fa1bda` |
| 3 | Save path: `composeCoat` writes v3; cadency recorded; apply flow | **done** — `face632` |
| 4 | Render marshalled nodes — the SVG pipeline divides a shield | **done** — `991171a` |
| 5 | Full recursive tree editor | **done** — `1db2936`, `81db30f`, `26047a5`, `ffe2472` |
| 6 | Marriage arms: impale with a spouse's house arms | **done** — `8740b32` |

Step 1 is inert by design — nothing imports it, so it cannot break anything.
**The stored data is still v2 and nothing has been rewritten**; the migration is
dry-run by default and must be invoked deliberately.

**Dry run against the real Armory (2026-07-30), via the dev panel:**

| | |
|---|---|
| arms total | 33 |
| would migrate | 33 |
| already current | 0 |
| no composition | 0 |
| failed | **0** |
| would visibly change | **0** |
| unrecognised keys | **0** |

This is the result that de-risks step 3. Three things it establishes about the
real data, none of which could be assumed from the code:

- **No coat hits the legacy ordinary-as-division bug.** That was the one way
  applying the migration could alter a drawn shield, and it does not occur here.
  The recovery path stays in the migration because the bug is real and the data
  could still contain it in another dataset — it simply does not fire on this one.
- **Nothing is malformed**, so no record needs a human decision before applying.
- **Every coat was built in the Armory** — zero uploaded or generated arms. The
  "never fabricate a composition" branch is correct but unexercised here.

Applying is therefore expected to be a pure format change with no visual
consequence. It still waits for step 3, because a migrated record needs a
renderer that understands version 3.

**What step 2 found.** Two live readers recognised storage version 2 and
nothing else, both failing by drawing a wrong shield rather than by erroring:
the creator's edit-load path rebuilt legacy records from an inline copy of the
lossy conversion, and the personal-arms derivation path (`comp?.field`, no
else) opened a **blank shield** when deriving from a legacy record. That second
one is why step 2 had to precede step 3 — a migrated record has no top-level
`field`, so the same check would have failed for *every* record the moment
anything wrote version 3, converting a legacy-only bug into a universal one.

A third composition shape also turned up and was deleted:
`createPersonalArmsSVG` returned `composition: { base, cadency }`, nested unlike
either stored format, which nothing read. Left alone it would have been adopted
by step 4.

**What step 3 found.** Two problems, both of which would have surfaced as data
loss rather than errors:

- **Cadency was never in the composition.** It existed only as marks burned into
  the stored SVG by `addCadencyToSVG`. Harmless while rendering read that SVG,
  and data loss the moment step 4 renders from the composition instead — every
  set of personal arms would lose its cadency on the next redraw. Now recorded
  on save.
- **`createPersonalArmsFromHouse` could invent a coat.** It spread the house
  composition raw; when the house had none (uploaded or generated arms), the
  spread of `null` produced `{ cadency }` alone, which reads back as a legacy
  composition and migrates into a default azure coat. Deriving personal arms
  from an image-only house therefore fabricated arms nobody drew. It also has
  **zero callers** — the live path is the creator — and is kept only because
  derived arms are what step 6 is about.

The apply flow also exposed a sync gap worth remembering: `updateHeraldry` only
syncs when passed a `userId`, and conflict resolution here is last-write-wins.
Applying the migration without one would have rewritten every record locally
while the cloud kept the old copies, letting the next download silently undo it.

**What step 4 settled, and one thing it did not.** `generatePreview` is now
composition-driven: its old body became the leaf renderer, and the preview is
whatever `renderNode` makes of the composition. A single plain node renders
byte-identically to before, so existing coats are untouched. Step 5 therefore
only has to change *what composition the creator holds* — the pipeline is done.

Marshalled coats were rendered and looked at in a browser, not only asserted on
as strings, and all four cases are correct. That raised a question the tests
could not:

**DECIDED — impalement is dimidiated** (`1db2936`). The three options were
rendered side by side and looked at. Squeezing a full coat into the half
distorts every charge in it, and since step 6 generates marriage arms
automatically that distortion would appear on every married couple rather than
once. Dimidiation distorts nothing and fills the shield; the cost is that half
of each coat is cut away and abutting halves can merge into a hybrid — which is
the historical artefact, and also what medieval marriage arms actually look
like.

Fit is **per-arrangement**, declared in `PART_FIT`. Quartering is *not*
dimidiated: quarters are square, so the whole coat is fitted in with equal scale
in both axes and charges keep their proportions.

**DECIDED — no dividing line between parts.** Armory reads the division from
the tinctures meeting; a drawn line would be house style, not convention. The
known cost is that two adjacent parts sharing a field tincture will merge
visually.

**DECIDED — step 5 is the full recursive tree editor**, chosen over a
pick-a-saved-coat picker. Arbitrary depth built by hand, no reference
resolution, no cycles.

Step 5 is being taken in four slices, because only the last one is visible:

| Slice | What | Status |
|---|---|---|
| 5a | Dimidiation, per the decision above | **done** — `1db2936` |
| 5b | Extract the editing UI so it edits a *node*, not the page | **done** — `81db30f` |
| 5c | Creator state becomes a composition tree + a selected path | **done** — `26047a5` |
| 5d | Tree navigation UI; `linkType` corrected, not wired | **done** — `ffe2472` |

**5d: the audit was wrong about `linkType`, and acting on it would have caused
a bug.** The report lists `quartered`/`impaled` as enum values "no code path
sets", which reads as an instruction to set them once marshalling exists.
`linkType` records the *role a link plays for an entity*, not how the coat is
composed — and `primary` is the lookup key in **eleven** places, including the
back-links that assign `heraldryId` onto a house or person record,
`getPersonalArms`, and the Armory's house-coverage count. A house whose arms are
quartered still links as `primary`; labelling that link `quartered` would make
its own arms invisible to every one of those lookups. The enum values are for
*additional* links — another entity whose arms appear inside someone else's
shield — and nothing creating them is correct rather than missing. Documented on
`linkHeraldryToEntity`.

**5c bought more than state plumbing.** A marshalled shield now survives a save
and load — the old save path rebuilt one coat from three state variables, so a
divided shield could not have round-tripped even if something had built one.
Loading restores the whole tree rather than its first leaf, deriving personal
arms carries the parent's marshalling with it, and blazon learned marshalling
("A impaling B", "Quarterly, 1st … 2nd …"), since describing a divided shield
with only its first coat's blazon is the wrong blazon rather than a short one.

**5b took `HeraldryCreator` from 2,441 lines to 1,579** — the first real
reduction of a file the audit has flagged as a god component throughout. The
editing UI also gained its first test coverage (20 tests), which mattered
because the extraction changed how an edit is applied: from three setters on
page state to returning a new node. A mutator that mutates its input instead of
replacing it looks correct in React until something memoises, so every test
asserts both the output and that the input was untouched.

Two things step 1 established that the rest depends on:

- **The audit was wrong about what exists.** C3 described two quartering
  functions that "naively composite finished PNGs". They do not exist —
  `src/utils/heraldryUtils.js` and all 459 lines of it were deleted in Phase 4
  of this same audit (`cbcbeec`). This is new construction, not a repair.
- **The old v1→v2 conversion was lossy and never persisted.** It ran in
  `HeraldryCreator`'s load effect, so an unopened legacy record stayed legacy
  and an opened one silently changed format on save. It also dropped ordinaries
  outright — the comment at `HeraldryCreator.jsx:1528` documents giving up on
  detecting them. Recovered in step 1, and the migration report names every coat
  that gets its band back.

---

## What I'd suggest

*Rewritten after the C3/C4/G7/F4 batch. Part One is done and merged; A1, A2, all
of B, C1, C4, F2, F3, F6, G4–G7 are answered. What follows is what is actually
left, not what was left in July.*

**Nothing is now blocked on an urgent owner action.** A1 is done — the leaked key
is dead — and A2 settled history as-is. That was the only genuinely time-sensitive
item in this report, and it is closed.

**The next real decision is D1: what the succession algorithm should model.** It
is the largest correctness item outstanding and it is the whole point of the
Dignities subsystem. The current implementation matches no real system — a
correct depth-first primogeniture walk is overwritten by a generational sort, so
a holder's grandson via his eldest son ranks behind his second son, and
representation through a predeceased heir is broken outright. It carries a cost
only the owner can accept: **fixing it reorders succession lines that may already
have prose written around them.** That cost is why it has sat unanswered, and it
does not get cheaper by waiting.

**Three items are unblocked and cheap now that B1 is answered.** G1 (the
remaining emoji), G2 (the duplicated `RankPips`) and G3 (the unimported shared
CSS) were each parked on the aesthetic direction. Together they are under a day.

**Then E1–E9, at your pace.** These are your world, not the code's, and nothing
should touch them without you. The integrity check now *reports* the structural
ones (the broken Crown, dangling references) instead of failing silently, so they
will stop being invisible while you decide.

The two structural refactors (the sync manifest, the planner abstraction) remain
worth doing and remain gated on timing, not on agreement. C4 is now answered, so
the planner one is a **routing change**: `pages/StoryPlanner.jsx` already mounts
the seven views from the URL, and the shared shell each view reimplements is
what lifts into the route.

**The two big answered items, C3 and F4, now dominate the remaining calendar.**
Read "Sequencing C3 and F4" above before starting either. If they run in series
as recommended, most of the list above sits untouched until they are through —
which is worth being deliberate about rather than discovering.

## Section index

| Section | Covers |
|---|---|
| [01-genealogy.md](sections/01-genealogy.md) | Family Tree, ManageData, GenealogyContext, relationship/layout utils, household roles |
| [02-data-sync.md](sections/02-data-sync.md) | Dexie schema, sync layer, Firestore rules, migrations, **the manifest refactor design** |
| [03-heraldry.md](sections/03-heraldry.md) | The Armory, SVG pipeline, charge library, asset inventory |
| [04-hygiene-build-tests.md](sections/04-hygiene-build-tests.md) | Build, lint, tests, deps, security, dead code, **docs restructure** |
| [05-design-system.md](sections/05-design-system.md) | Tokens, type, spacing, primitives, a11y, contrast tables, **the target design system** |
| [06-codex-dignities.md](sections/06-codex-dignities.md) | The Codex, wiki-links, Dignities, succession logic |
| [07-writing-ai.md](sections/07-writing-ai.md) | Writing Studio, editor, planner, Gemini integration, proposals |
| [08-cross-system.md](sections/08-cross-system.md) | **Real world-data anomalies**, referential integrity matrix, performance at scale |
