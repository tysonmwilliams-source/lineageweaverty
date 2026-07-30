# Handoff — continue the audit remediation from Phase 4

**Branch:** `audit/phase-0-data-safety` (not merged, not pushed)
**Full audit:** [`README.md`](README.md) — read this first, especially Part One (the work plan) and Part Two (decisions pending the owner)
**Detail sections:** [`sections/`](sections/) — eight files, one per subsystem/layer

---

## What is already done

| Commit | Phase | Summary |
|---|---|---|
| `68afb6a` | — | The audit report itself |
| `2332671` | 0 | Closed four silent data-loss paths |
| `8fb5fa2` | 1 | Crashes and dead features |
| `05f61df` | 2 | Measured performance hot paths |
| `bd01c46` | 3 | Design system foundations |

**Current baselines** (verify these still hold before and after your work):

```bash
npm run build      # passes, ~10s
npx vitest run     # 260 tests pass, 7 files. NOTE: exits 1 — see Phase 4 item 53
npx eslint .       # 514 errors, 39 warnings
```

The lint error count is the yardstick: it should go **down**, never up. Same for tests.

---

## What is left

### Phase 4 — Cleanup and hygiene (est. ~2 days)

Full detail in README Part One, items 49–61. In priority order:

1. **Green the test suite.** `npx vitest run` reports 260 passing but **exits 1** on 4 unhandled rejections in `src/utils/retryWithBackoff.test.js` (e.g. the block at `:319-344`): it creates rejected promises, awaits `vi.runAllTimersAsync()`, then attaches `try/catch` one tick too late. Fix, then add a GitHub Actions gate running `npm ci && npm run build && npm run test:run`.
2. **Two security patches**, specifically — not a blanket `npm audit fix`: `react-router-dom` past 7.14.1 (vendored turbo-stream RCE) and `dompurify` past 3.4.11 (XSS; it is the app's only sanitizer, 21 call sites).
3. **`git gc --aggressive --prune=now`** — `.git` is 313 MB for 56 MB of content, 5,653 loose objects, never packed. Non-destructive.
4. **Delete ~7,338 lines of dead code** — 15 orphan modules, list in `sections/04-hygiene-build-tests.md`. Verify each with a fresh import-graph check before deleting; some were touched in phases 0–3.
5. **Delete the `arcMilestones` phantom** (~150 lines across 6 files) — full cloud stack, Firestore rule, three sync wrappers, but the Dexie table was never created. See README Part Two B1 if you would rather build it.
6. **1,175 `console.*` calls** — strip or guard with `import.meta.env.DEV`. `firestoreService.js` 153, `dataSyncService.js` 141, `database.js` 78.
7. **239 emoji used as UI chrome** — replace with the existing `Icon` component (`src/components/icons/Icon.jsx`, 207 icons already mapped).
8. **ESLint config** — ignore `old-build-archive`/`archived-components`/`extras`; add `globals.node` for `*.config.js` and `src/test/**` (currently 6 spurious `no-undef`).
9. **Deps** — remove unused `@tiptap/extension-mention`; add the phantom `@tiptap/suggestion` (imported at `WikiLinkExtension.js:10`, resolves only transitively); move `autoprefixer`/`postcss`/`tailwindcss` to devDependencies; drop `@types/react*` (zero TS files).
10. **Dedupe** — 22 `@keyframes spin`, 3 `formatDate`, 3 `CLASS_ICONS`, 2 `harmonizeColor` **with divergent maths** (`treeHelpers.js:85` vs `BranchView.jsx:36` — the same house renders a different shade side by side), 2 `RankPips`.
11. **`src/features/`** contains only a `.DS_Store`. Delete; add `.DS_Store` to the repo `.gitignore`.
12. **SVGO over the 21 MB charge library** — likely 7–10 MB. **Must preserve `fill="#FFFFFF"` exactly**; SVGO's `convertColors` rewrites it to `#fff` and silently breaks every charge recolor.
13. **Fix CLAUDE.md.** Six errors found so far — see below.

### Phase 5 — Wire up what's already built (est. ~3 days)

README Part One, items 62–70. This is the highest value-per-hour work in the audit: `searchCharges()`, `validateWikiLinks()` + `getSuggestedEntries()`, `runIntegrityCheck()`, the personal-arms cadency engine, a heraldry download button, chapter reorder/rename, `targetWordCount` UI, `codexLinks` pruning, rename propagation.

---

## CLAUDE.md is wrong in six places

Fix these together in Phase 4:

1. **7 themes, not 2** — `ThemeContext.jsx:34` lists royal-parchment, light-manuscript, emerald-court, sapphire-dynasty, autumn-chronicle, rose-lineage, twilight-realm.
2. **1,175 `console.*` calls, not ~450** — 450 is `console.log` only.
3. **`contextRegistry`/`contextFiles`/`contextLog` ARE written** — `contextService.js:711/744/768`, reached via `notifyChange` on every mutation. What is true: they never sync and are not cleared by `deleteAllData`.
4. **README.md is accurate** — the "stale README" warning is itself the stale artifact. README documents Dignities, Writing Studio and heraldry correctly, and its npm scripts match `package.json`.
5. **House has no `seatName` field** — that is a *dignity* field. House uses `houseName`, `sigil`, `motto`, `foundedDate`, `colorCode`, `notes`, `houseType`, `parentHouseId`, `cadetTier`, `foundingType`, `foundedBy`, `swornTo`, `heraldryId`, `codexEntryId`.
6. **Feature flags are unimplemented, not "intentionally off"** — 40 flags, exactly 3 read (all `MODULE_1E`, all already `true`), and one of the two consuming files is dead code. "Intentionally off" reads as implemented-but-disabled, which is misleading for planning.

Also worth adding to CLAUDE.md while you are there:
- Dexie schema is now **v18** (was 17). New versions should declare **only the changed store** — Dexie inherits the rest. Restating all 26 tables is how the `dateOfDeath` index went missing in v3/v4.
- `addHouse(data, options)` takes an **options object** (`{datasetId, skipCodexCreation}`) while `addPerson(data, datasetId)` takes a string. Real inconsistency; easy to get wrong.
- Planning-service mutations now take a trailing `userId` and sync. Do not add a planner mutation without it.

---

## Corrections already made to the audit

Recorded at the top of `README.md`, but so you do not re-derive them:

- **Part One #35 was wrong.** Do NOT import `src/styles/shared/` or `shared-forms.css`. Those 112 class names are used **zero** times in JSX; `buttons.css` uses `.lw-*`, `shared-forms.css` uses `.form-*` — two incompatible, unadopted drafts. Importing ships dead CSS and risks restyling two forms. Keep-or-delete folds into decision B1/B3.
- **The dataset-switch bug was latent, not live** — both switch paths call `window.location.reload()`. Provider is now keyed defensively anyway.
- The audit's "the design system was built and never turned on" framing was too generous. It was drafted twice and neither draft was adopted. The fix is a decision, not wiring.

---

## Still needs the owner (do not decide these unilaterally)

Full detail in README Part Two. The ones that block work:

- **URGENT, owner action only:** revoke Gemini key `AIzaSyDhw4eI0…NjlU` in Google Cloud Console → Credentials. It is in commits `267d0e4` and `e4545d4`, both on `origin/main`. `.env.local` was rotated but that does not disable the old key. Then decide on history rewrite (Part Two A2).
- **B1 / B2 / B3** — aesthetic direction, base font size, Tailwind keep-or-remove. These three unlock all remaining visual work. Phase 3 repaired the foundation specifically so they can be judged properly.
- **E1–E9** — the owner's world data: 219 broken wiki-links, 15 duplicate codex titles, 189 empty stubs, the broken Crown (dignity 7 → nonexistent person 82), 6 people with 2–3 digit years, 9 people named Baudin Wilson. **Never auto-change creative content.**
- **D1–D4** — succession semantics. The current algorithm matches no real system; fixing it will reorder lines the owner may have written prose around.

---

## Working conventions used so far

- One commit per phase, on `audit/phase-0-data-safety`. Commit messages explain *why the bug existed*, not just what changed.
- Verify build + tests + lint before each commit; report the deltas honestly.
- Add tests for anything whose failure mode is silent. Phases 0–3 took the suite from 148 to 260.
- Leave `docs/claude-context/*.json` alone — those are the owner's uncommitted working-tree changes from before this work started.
- When a fix reveals the audit was wrong, say so plainly and correct the audit file.
