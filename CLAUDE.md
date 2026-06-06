# CLAUDE.md

Guidance for Claude Code when working in this repository. Keep it accurate — update it when architecture or conventions change.

## What this is

**Lineageweaver** — a browser-based fantasy **genealogy + worldbuilding suite** for novelists. Solo project. It is **local-first**: everything runs in the browser on IndexedDB, with **optional** Firebase cloud sync layered on top. No backend server of our own.

~103k LOC, React 19 SPA. Six interconnected subsystems (see below).

## Commands

```bash
npm run dev            # Vite dev server (also exposes the claude-context endpoint, see below)
npm run build          # Production build → dist/
npm run preview        # Preview the production build
npm run lint           # ESLint (flat config, eslint.config.js)
npm test               # Vitest watch mode
npm run test:run       # Vitest single run (use this for CI / verifying)
npm run test:coverage  # Coverage report
```

Node 22. No TypeScript — plain JS/JSX with ESM (`"type": "module"`).

## Tech stack

- **React 19** + **React Router 7** (routes are lazy-loaded in `src/App.jsx`)
- **Dexie / IndexedDB** for local storage — schema is at **version 17**, ~26 tables
- **Firebase** Auth + Firestore for cloud sync (config via `VITE_FIREBASE_*` env vars)
- **D3 v7** (family tree viz), custom SVG pipeline (heraldry)
- **TipTap 3** (writing editor), **Framer Motion**, **Tailwind 4** + PostCSS
- **Google Gemini 2.5 Flash** for AI features — optional, needs `VITE_GEMINI_API_KEY`
- **Vitest** + jsdom + fake-indexeddb for tests

Copy `.env.example` → `.env.local` and fill in Firebase + Gemini keys. All Firebase config is browser-safe (security is enforced by `firestore.rules`, not by hiding keys).

## Architecture

### Local-first + cloud sync (the most important pattern)

Every data mutation follows: **local IndexedDB first → update React state (instant UI) → async cloud sync (non-blocking)**. Sync failures must NOT break local operations — catch and log them, never throw.

**THE GOLDEN RULE: always call the matching `sync*` function from `src/services/dataSyncService.js` after a local CRUD op, guarded by a `user` check and passing `datasetId`.** Forgetting this is the #1 source of "my data disappeared on refresh" bugs.

```js
const newId = await dbAddPerson(personData, datasetId);   // 1. local
setPeople(prev => [...prev, { ...personData, id: newId }]); // 2. state
if (user) syncAddPerson(user.uid, datasetId, newId, personData); // 3. cloud
```

Sync function signatures: add `(userId, datasetId, localId, fullData)`, update `(userId, datasetId, id, changedFields)`, delete `(userId, datasetId, id)`. There's a `sync{Add,Update,Delete}*` trio per entity type. See `docs/DEVELOPMENT_GUIDELINES.md` (§ Firebase & Cloud Sync) for the full table and the steps to add a new synced entity type.

- **Conflict resolution is last-write-wins** — fine for one user, lossy across devices/tabs. Don't assume merge semantics.
- A `syncQueue` table tracks pending changes; startup sync is **blocked if local pending changes exist** (data-loss guard), and the app warns on tab-close with unsynced changes.
- Firestore layout: `users/{userId}/datasets/{datasetId}/{collection}/{docId}`. Batches cap at 500 ops.

### Datasets (multiple worlds per account)

A user can have multiple independent "datasets" (separate worlds). Each gets its own IndexedDB database (`LineageweaverDB_{datasetId}`; the default is `LineageweaverDB`) and its own Firestore subtree. **Always thread `datasetId` through data operations** — get it via `useDataset()`: `const datasetId = activeDataset?.id || 'default'`.

### Provider hierarchy (`src/App.jsx`)

`AuthProvider → ThemeProvider → LearningModeProvider → ProtectedRoute → DatasetProvider → AppContent`, and inside AppContent: `GenealogyProvider → BugTrackerProvider`. Auth is outermost (sync needs `user.uid`); the app is auth-gated by `ProtectedRoute`. `GenealogyContext` holds the shared genealogy data + sync orchestration.

### Vite claude-context endpoint

`vite.config.js` adds a dev-only middleware: `POST /__claude-context` writes JSON to `docs/claude-context/` (and `DELETE` clears it). The running app exports its world state there so Claude sessions can read current data. Those JSON files (people, houses, relationships, codex-entries, dignities, heraldry) are the canonical machine-readable snapshot.

## The six subsystems & where they live

| Subsystem | Routes | Key files |
|---|---|---|
| **Family Tree / Genealogy** | `/tree`, `/manage` | `pages/FamilyTree.jsx`, `utils/RelationshipCalculator.js`, `utils/treeRelationshipMaps.js`, `utils/familyBlockLayout.js`, `contexts/GenealogyContext.jsx` |
| **The Codex** (wiki) | `/codex/*` | `pages/Codex*.jsx`, `services/codexService.js`, `utils/wikiLinkParser.js` |
| **The Armory** (heraldry) | `/heraldry/*` | `pages/HeraldryCreator.jsx`, `services/heraldryService.js`, `data/unifiedChargesLibrary.js`, `utils/shieldSVGProcessor.js`, `public/heraldic-charges/` |
| **Dignities** (titles/succession) | `/dignities/*` | `pages/Dignity*.jsx`, `services/dignityService.js`, `services/dignityAnalysisService.js` |
| **Writing Studio** | `/writing/*` | `pages/Writing*.jsx`, `components/writing/**`, `services/writingService.js`, `services/planningService.js`, `services/canonCheckService.js` |
| **AI Assistant** | (in-page) | `services/aiAssistantService.js`, `services/aiProposalService.js`, `services/aiProposalExecutor.js`, `services/aiDataService.js` |

Plus a built-in **Bug Tracker** (`/bugs` + floating reporter) and extensive **import/export** tooling (`components/*ImportTool.jsx`, `utils/bulkFamilyImport.js`).

These systems are **deeply cross-linked** (people↔houses↔dignities↔codex↔heraldry). Before changing a data model or adding a field, do a **Connection Audit** (template in `docs/DEVELOPMENT_GUIDELINES.md`): trace where the data flows to/from, cross-system sync, and every UI render context. Missing a touchpoint is the most common bug class here.

## Data model essentials

- **Person**: `firstName`, `lastName`, `houseId`, `gender`, `dateOfBirth`/`dateOfDeath` (year ints), `legitimacyStatus` (legitimate/bastard/adopted/unknown), `bastardStatus`, `maidenName`, `codexEntryId`, `swornToHouseId`.
- **House**: `houseName`, `houseColor`, `parentHouseId` (cadet branches), `seatName`, `founded`/`dissolved`, `heraldryId`.
- **Relationship**: `person1Id`, `person2Id`, `relationshipType`. Parent = `person1Id` is PARENT, `person2Id` is CHILD. Types: parent, spouse (with betrothal/marriage/divorce dates), adopted-parent, foster-parent, mentor, twin, named-after, lineage-gap. Max 2 biological parents per person.
- Dexie schema + all migrations live in `src/services/database.js`; cloud ops in `firestoreService.js`; sync orchestration in `dataSyncService.js`; data migrations in `migrationService.js`. Validation rules (ages, lifespans, duplicates) are documented in `docs/CLAUDE_CODE_DATA_INTEGRATION_GUIDELINES.md`.

## Conventions (from `docs/DEVELOPMENT_GUIDELINES.md`)

- **File size limits**: components ≤500 lines, services ≤400, pages ≤800, utils ≤200. (Several legacy files violate this — see Gotchas.) Don't add to oversized files; extract.
- **Performance**: memoize expensive objects (`useMemo`), wrap handlers in `useCallback`, debounce user input (~300ms) and sync (~500ms), use `Map` for O(1) lookups instead of repeated `.find()`.
- **Theming**: never hardcode colors — use CSS custom properties (`var(--text-primary)`). Default theme is `royal-parchment`; also `light-manuscript`. Test both.
- **useEffect**: one concern per effect, target ≤4 deps; clean up async effects (`cancelled` flag / AbortController).
- **Barrel exports**: component folders use an `index.js`.
- Components should handle loading + empty + error states; wrap critical paths in `ErrorBoundary`.

## Gotchas / known debt

- **God components**: `FamilyTree.jsx`, `HeraldryCreator.jsx`, `DignityView.jsx`, `dataSyncService.js`, `firestoreService.js` all exceed 1,900 lines. Prior audits (`docs/audits/`) flag these; refactors are incremental.
- **Tests are thin**: 148 tests but only over pure utils + data integrity (`*.test.js` in `utils/`, `services/database.test.js`). Services and UI are largely untested. Add tests when touching logic-heavy code.
- **~450 `console.log`s** remain in `src/`. Guideline says strip before commit (or guard with `import.meta.env.DEV`).
- **Migrations don't auto-run** — `migrationService.js` functions must be invoked (the dataset migration check runs in `App.jsx` on load; others are manual).
- **Dead/incomplete**: `contextRegistry`/`contextFiles`/`contextLog` tables (v16) are defined but never written; shield-shape selection and heraldry quartering/impalement are coded-but-disabled stubs.
- **AI features fail gracefully without `VITE_GEMINI_API_KEY`** — expect "API key not configured" errors if it's unset. AI-powered canon check is partially stubbed (rule-based check works fully).
- **README.md is stale** in places (predates Dignities + Writing Studio; understates heraldry). Trust the code and this file over the README for current state.

## Deeper docs

- `docs/DEVELOPMENT_GUIDELINES.md` — full conventions, Connection Audit template, cloud-sync recipes.
- `docs/CLAUDE_CODE_DATA_INTEGRATION_GUIDELINES.md` — the bulk data-import workflow (understand→plan→execute→verify→iterate) and validation rules.
- `docs/plans/` — roadmap, handoff notes, and feature proposals (some aspirational).
- `docs/audits/` — prior codebase audits and their findings.
- `src/config/featureFlags.js` — feature gating; many integration/experimental flags are intentionally off.
