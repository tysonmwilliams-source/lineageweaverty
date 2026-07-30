# Subsystem: The Armory (Heraldry)

## Inventory

| File | LOC | Purpose | Verdict |
|---|---|---|---|
| `src/pages/HeraldryCreator.jsx` | 2257 | God component: line-path generators, field/ordinary SVG emitters, blazon generators, 2 sub-card components, editor page | **Critical** — 4.5x page budget; 3 concerns in one file; 4 malformed sync calls |
| `src/pages/HeraldryCreator.css` | 1589 | Creator styling | **Poor** — no :focus-visible on ~200 buttons, no prefers-reduced-motion, 12 dead class blocks |
| `src/pages/HeraldryLanding.jsx` | 700 | Gallery, stats, coverage | **Poor** — dataset-unaware delete (data-loss class), otherwise well built |
| `src/pages/HeraldryLanding.css` | 777 | — | Healthy (has reduced-motion) |
| `src/pages/ChargesLibrary.jsx` | 469 | Browse 287 charges | Good — but half its CATEGORY_ICONS keys don't exist |
| `src/services/heraldryService.js` | 703 | CRUD + links + personal arms | Fair — 5 exported fns zero callers; sync internals correct |
| `src/data/unifiedChargesLibrary.js` | 2608 | 287-charge catalog + 8 helpers | Good structure, wrong format — hand-maintained JS literal |
| `src/data/heraldicData.js` | 264 | Tinctures/lines/divisions/ordinaries | Healthy; the real source of truth |
| `src/data/tinctures.js` | 379 | Richer model incl. furs + checkRuleOfTincture | **Orphaned** — only 2 of 8 exports used |
| `src/data/divisions.js` | 578 | Data-driven division renderer | **100% DEAD** — zero importers |
| `src/utils/shieldSVGProcessor.js` | 326 | Loads french.svg, clip-path mask | Fair — one aspect bug |
| `src/utils/heraldryUtils.js` | 459 | Canvas masks, Armoria API, quartering/impalement | **100% DEAD** — targets a dead Heroku host |
| `src/utils/armoriaIntegration.js` | 324 | convertSVGtoPNG (used) + Armoria (dead) | Poor — the one live export distorts every PNG |
| `src/utils/personalArmsRenderer.js` | 266 | Cadency-mark overlay | Sound code, creation flow broken |
| `src/components/heraldry/ExternalChargeRenderer.jsx` | 439 | Fetch + recolor charge SVG | Fair — regex SVG surgery, no cache |
| `src/components/heraldry/HeraldryPickerModal.jsx` | 570 | Link arms to entity | Good — one state-mutating useMemo |
| `src/components/HeraldryThumbnail.jsx` | 292 | Shield thumbnail | Poor — mixBlendMode:multiply hack to hide baked-in white PNG bg |
| `src/components/HouseHeraldrySection.jsx` / `PersonalArmsSection.jsx` | 347 / 435 | Arms panels | Fair; PersonalArms creation link broken |
| `docs/HeraldryCreator_ChargesSection_Update.jsx` | — | Stray JSX artifact in docs/ | Dead |

**Tests: zero.** The two most testable things (blazon generation, generateFieldSVG) are pure functions with no coverage.
**Dead LOC in scope: ~1,040** (divisions.js 578 + heraldryUtils.js 459) + ~250 dead Armoria code.

## Asset inventory

| Metric | Value |
|---|---|
| SVG files on disk | **355** (`public/heraldic-charges/`) |
| Catalogued in unifiedChargesLibrary | **287** |
| **Orphans** (on disk, unreferenced) | **68 files, 936 KB** |
| Broken references | 0 |
| Duplicate filename refs | 0 |
| Total size | **21 MB** (avg 58 KB) |
| Largest | merman-or-triton-1-mono.svg 452 KB; sea-horse-natural-2 432 KB; oak-tree-fructed 404 KB |
| Naming | `{subject}-{blazon-attitude}-{variant#}-mono.svg`, consistent kebab-case |
| Format | SVG 1.1 + DOCTYPE, `clipPath id="artboard_clip_path"`, offset viewBoxes, `fill="#FFFFFF"` as recolor hook, `fill="black"` outlines. No `<style>`, no `class=`, no 3-digit hex — the recolor regex (`ExternalChargeRenderer.jsx:141`) is safe for this corpus but NOT format-agnostic |
| Load strategy | **Eager per-view, uncached, unbundled.** Files in `public/` so Vite copies all 21 MB into dist verbatim. Each fetched individually at runtime (`ExternalChargeRenderer.jsx:72`, `generateExternalChargeSVGAsync:315`). No module-level cache; preview regeneration refetches |
| Categories | flora 46, beasts 34, seaCreatures 34, birds 31, weapons 22, celestial 16, mythical 15, symbols 14, architecture 12, insects 12, serpents 11, objects 10, geometric 9, knots 7, crosses 6, military 6, bodyParts 2 |
| Licensing | **No LICENSE/NOTICE file.** Provenance is a code comment (`unifiedChargesLibrary.js:10-11`, "heraldicart.org … Public Domain / CC0") + a UI paragraph (`ChargesLibrary.jsx:434-440`). No per-file `<dc:>` metadata |

Worst case: opening **flora** triggers 46 fetches ~2.7 MB; scrolling the full ChargesLibrary = 287 fetches ~17 MB.

## Part A — Autonomously fixable

**[CRITICAL] Four malformed sync* calls create phantom IndexedDB databases and junk Firestore docs**
`HeraldryCreator.jsx:1634, 1641, 1666, 1667`. All four take `(userId, datasetId, id, data)` (`dataSyncService.js:1100,1192,1208`) but are called `(userId, id, data, datasetId)`. `getDatabase(42)` (`database.js:88`) instantiates a brand-new Dexie DB named **`LineageweaverDB_42`** (`:42-46`) — a phantom DB per heraldry record; then `addHeraldryCloud(uid, 42, {...'default', id:{…}})` spreads a string into char-indexed keys and writes to `users/{uid}/datasets/42/heraldry/[object Object]`. The calls are also **redundant** — createHeraldry/updateHeraldry already sync internally (`heraldryService.js:101-103,181-183`).
Fix: delete lines 1632-1642 and 1664-1668. Keep the correct syncUpdateHouse at `:1703`. Effort S.

**[CRITICAL] Deleting heraldry from the Armory operates on the wrong DB and never syncs**
`HeraldryLanding.jsx:240, 243-245`. `deleteHeraldry(id)` passes neither userId nor datasetId (sig `deleteHeraldry(id, userId, datasetId)` `heraldryService.js:200`). On any non-default dataset, getDatabase(null) -> default DB: the record isn't deleted and a same-ID record in the default world may be destroyed instead. The refresh calls also read default. With no userId the cloud copy survives and resurrects. HeraldryLanding doesn't even import useAuth. Effort S.

**[CRITICAL] Unlinking heraldry from a house passes datasetId into the userId slot**
`HouseForm.jsx:223` — `unlinkHeraldry(heraldryLinkId, datasetId)` vs `(linkId, userId=null, datasetId=null)` (`heraldryService.js:290`). Link deleted from default DB, `houses.heraldryId` cleared on the wrong world's house, and syncDeleteHeraldryLink never fires so the unlink reverts on next pull. `user` is already in scope (`HouseForm.jsx:72`). Effort S.

**[CRITICAL] "Create Personal Arms" is wired to parameters the creator never reads**
`PersonalArmsSection.jsx:175` navigates to `/heraldry/create?personId=X&deriveFrom=Y&birthPosition=N`; `HeraldryCreator.jsx:1208` reads **only** `houseId`. User gets a blank default shield; on save the arms link to no person, derive from nothing, carry no cadency. `heraldryService.createPersonalArmsFromHouse` (`:547`) and the whole 266-LOC `personalArmsRenderer.js` cadency engine have **zero callers**. Effort M.

**[HIGH] Every exported PNG is stretched ~20% and has white baked in**
`armoriaIntegration.js:292-308` — `fillRect` white then `drawImage(img,0,0,size,size)` into a square canvas. The masked SVG's viewBox comes from french.svg (`125 179 362 433.64`, aspect 0.835), so all three PNGs (thumbnail 40, display 200, highRes 400) are squashed to 1:1 = 19.8% horizontal stretch. The opaque white then forces `HeraldryThumbnail.jsx:258` to hack around it with `mixBlendMode:'multiply'`, which renders shields near-black on royal-parchment and breaks hover transforms (see apologetic comments at `:224`, `:182`).
Fix: compute canvas w/h from source viewBox aspect (letterbox not stretch); drop fillRect for transparency; delete the blend hack. Effort S.

**[HIGH] Charge aspect pre-compensation uses a hardcoded 0.76 that doesn't match the shield**
`ExternalChargeRenderer.jsx:310, 358, 397, 428`. Real shield bounds give scaleX/scaleY ~0.835; net vertical scale = 0.76 x 1.198 = 0.910, so **every charge renders ~9% squashed** in every saved shield. Fix: export computed scaleX/scaleY from shieldSVGProcessor instead of the magic number. Effort S.

**[HIGH] Heraldry records can silently exceed Firestore's 1 MiB doc limit**
`HeraldryCreator.jsx:1607-1611` + `firestoreService.js:1388`. A record embeds the fully-inlined charge SVG **twice** (heraldrySVG + heraldrySourceSVG) plus three base64 PNGs. count:3 of a 452 KB charge x2 fields ~= 2.7 MB before PNGs. addHeraldryCloud does a plain setDoc with no size guard; Firestore rejects >1 MiB and syncAddHeraldry swallows it into console.error (`dataSyncService.js:1203`). User sees a successful save and silently loses cloud backup.
Fix: drop heraldrySourceSVG (reconstructible from composition) and heraldryHighRes; add a byte check warning above ~900 KB. Real fix is B-1. Effort M.

**[HIGH] Async preview generation has no cancellation — out-of-order responses show stale shields**
`HeraldryCreator.jsx:1513-1583`. No cancelled flag, no AbortController; **no debounce** either, so the range input at `:1989-1997` fires a full regeneration per input event. A slow 452 KB fetch from edit N can resolve after edit N+1. Effort S.

**[HIGH] No fetch cache for charge SVGs**
`ExternalChargeRenderer.jsx:72, :315` — no module-scope memo, unlike `shieldSVGProcessor.js:43` which does have svgCache. Opening a category refetches/re-regexes up to 46 files; every preview regeneration refetches all active charges. Effort S.

**[HIGH] sanitizeSVG runs on every render on strings up to megabytes**
`HeraldryCreator.jsx:1764`, `HeraldryLanding.jsx:479`, `HeraldryPickerModal.jsx:402,458`, `ExternalChargeRenderer.jsx:230`, `HouseList.jsx:285`, `HouseForm.jsx:547`, `PersonalArmsSection.jsx:233` — never inside useMemo. The gallery with 33 records re-sanitizes all 33 inline SVGs on every keystroke in the search box. Fix: memoize, or a `<SafeSVG>` wrapped in React.memo. Effort S.

**[MEDIUM] Charge grid rebuilds a 287-entry filter on every interaction**
`HeraldryCreator.jsx:1015, 1096-1106` — `getChargesByCategory` called in ChargeCard's render body, no memo, over 287 records. ChargeCard isn't React.memo'd and `updateCharge` (`:1324`) recreates the whole array, so every control click re-renders all cards, re-runs all filters, re-mounts up to 46 LazyChargePreview subtrees. Handlers also close over stale ordinaries/charges. Effort M.

**[MEDIUM] Rule-of-tincture check ignores ordinaries and charges**
`HeraldryCreator.jsx:1495-1510` checks only field.tincture1 vs tincture2, for 7 divisions. An `or` charge on `argent`, or a `gules` fess on `azure`, raises no warning — the canonical violations. `tinctures.js:304` exports a complete checkRuleOfTincture that nothing calls. Effort S.

**[MEDIUM] Section and card headers are non-interactive elements with onClick**
`HeraldryCreator.jsx:1865-1871, 2026-2032, 2077-2083, 2161-2167, 2204-2210` (`<h2 onClick>`) and `:811, 1019` (`<div onClick>`). No tabIndex/role/onKeyDown/aria-expanded. `HeraldryCreator.css` has **zero** :focus/:focus-visible rules for the ~200 tincture/division/charge buttons (only .text-input/.select-input at `:281-282`). The entire editor is mouse-only. Effort S.

**[MEDIUM] No prefers-reduced-motion in the creator stylesheet** — HeraldryLanding.css:773, ChargesLibrary.css:797, HeraldryPickerModal.css:671 all honor it; the creator doesn't, despite `transition: all 0.2s ease` on most controls. Effort S.

**[MEDIUM] ChargesLibrary category icons key off names that don't exist**
`ChargesLibrary.jsx:56-69` defines `fish`, `plants`, `human`; real ids are `seaCreatures`, `flora`, `bodyParts`. Missing: serpents, architecture, military, knots, symbols. Nine of seventeen categories fall through to a generic circle icon. Effort S.

**[MEDIUM] useMemo mutates state via in-place sort** — `HeraldryPickerModal.jsx:213`. Effort S.

**[MEDIUM] Save can persist a stale design** — `HeraldryCreator.jsx:1586-1596` guards on name and previewSVG but not `generating`; clicking Save mid-generation writes the previous SVG/blazon, which the async generator then overwrites in local state, so UI and DB disagree. Fix: disable at `:2244` + early return. Effort S.

**[MEDIUM] Mask ids are Date.now()-based** — `shieldSVGProcessor.js:236` bakes `shield-mask-${Date.now()}` into every persisted SVG; two arms saved in the same ms, or the same arms rendered twice on one page, produce duplicate DOM ids and the second clip-path resolves to the first. Fix: crypto.randomUUID(). Effort S.

**[MEDIUM] Home.jsx heraldry count is dataset-blind** — `Home.jsx:69` `getHeraldryCount()` no datasetId. Effort S.

**[LOW] ~1,040 lines fully dead** — `divisions.js` (578) and `heraldryUtils.js` (459, targets the dead `armoria.herokuapp.com` at `:409`, contains the quartering/impalement "stubs"). `armoriaIntegration.js` is ~250 dead lines around one live 60-line function. Also dead: heraldryService exports getHeraldryByCategory, searchHeraldry, getRecentHeraldry, getHeraldryTemplates, createPersonalArmsFromHouse, getPeopleWithPersonalArms; ExternalChargeRenderer's useExternalChargeSVG hook (`:374-437`) and ExternalChargePreview (`:241`); `docs/HeraldryCreator_ChargesSection_Update.jsx`. NOTE: divisions.js should be **revived**, not deleted (see redesign 9).

**[LOW] 68 orphan charge SVGs (936 KB) ship to production** — e.g. annulet-fleury-mono.svg, cross-bottony-4-mono.svg. Several are crosses/annulets, categories thin in the catalog (crosses: 6). Either catalog or delete; add a CI check comparing filename refs to `ls`.

**[LOW] ~26 console.logs** — heraldryService x6 (`:98,178,211,269,308,612`), armoriaIntegration x10, heraldryUtils x7, shieldSVGProcessor x2 (incl. `:254`, logging the transform on **every preview regeneration**), HeraldryCreator `:1670`. Also `heraldryService.js:612` has a mojibake lone-surrogate emoji.

**[LOW] Dead CSS: 12 class blocks with no JSX counterpart** in HeraldryCreator.css.

## Part B — Needs user input

**B-1. How should composed arms be persisted?** Today each record stores the inlined charge artwork twice plus three base64 PNGs. `composition` (`HeraldryCreator.jsx:1613-1620`, version 2) already fully describes the design; every stored pixel is derived data. This is simultaneously the Firestore-limit bug, the IndexedDB bloat, and why PNG fidelity matters.
(a) **Composition-only** — records drop to ~1 KB, sync trivial, deterministic re-render. Cost: 8 consumer components read heraldrySVG/PNG directly and would need async render + a client render cache; historical records depend on charge ids never changing.
(b) **Composition + one derived SVG**, drop heraldrySourceSVG and heraldryHighRes — halves record size, every consumer keeps working, stays under 1 MiB for typical designs. Doesn't fix the pathological case.
(c) Keep blobs locally, composition-only in the cloud — introduces a local/cloud schema divergence LWW isn't built for.

**B-2. Charge asset delivery — 21 MB of unoptimized SVG.** Files carry XML prologs, DOCTYPEs, unused artboard_clip_path defs (which the code strips at runtime, `ExternalChargeRenderer.jsx:156`), full-precision coords.
(a) **SVGO only** — likely 21 MB -> 7-10 MB, zero code changes. **Risk: must preserve `fill="#FFFFFF"` exactly — SVGO's convertColors would rewrite it to `#fff` and silently break every recolor.**
(b) Optimize + pre-normalize viewBoxes to `0 0 w h` at build time, killing the runtime translate wrapper and regex extraction.
(c) Optimize + a fetched versioned manifest / sprite sheet — fewer requests, bigger build commitment.
Trade-off: (b)/(c) mean on-disk assets no longer match upstream heraldicart.org, affecting re-sync.

**B-3. Asset licensing and attribution.** Only a code comment asserting CC0 + a UI credit. No LICENSE/NOTICE, no per-file provenance, no `<dc:>` metadata. Heraldry exported into a published novel is exactly the redistribution case where this matters. (a) verify upstream terms + add `public/heraldic-charges/LICENSE.md` with source URL, retrieval date, license text, 287-file manifest; (b) additionally embed attribution in exported artwork via `<metadata>`/`<desc>`; (c) leave as-is if genuinely CC0.

**B-4. Finish or delete quartering, impalement, shield shapes.** These are **less built than "stubs" suggests.**
- *Shield shapes:* most complete. All 5 SVGs exist (`public/shields/`, 20 KB), SHIELD_TYPES is a live export (`heraldicData.js:258-264`), SHIELD_FILES entries commented out (`shieldSVGProcessor.js:27-30`), LEGACY_SHIELD_MAPPING collapses everything to default (`:34-40`), UI block commented out (`HeraldryCreator.jsx:2124-2157`). **Re-enabling is ~30 minutes** (CSS `.shield-type-grid` already exists at `HeraldryCreator.css:865`). Real work: the hardcoded aspectCorrection would need to become per-shield, and resolveShieldType currently rewrites saved records' shape.
- *Quartering/impalement:* **not built.** `heraldryUtils.js:324/:360` naively drawImage two/four finished PNGs into halves/quadrants — no re-blazoning, no per-quarter scaling, no line of partition, no charge repositioning. Zero importers. `heraldryLinks.linkType` already reserves 'quartered'/'impaled' (`heraldryService.js:237`) with no code path setting them. Real quartering requires composition to become **recursive** (a quarter is itself a full arms) — a data-model change.
- Options: (a) ship shield shapes now, delete quartering fns; (b) delete both + the linkType values; (c) commit to recursive composition — multi-week, but **marriage arms ARE impalement**, so this is arguably the biggest feature gap for a genealogy app.

**B-5. Two competing tincture/division models.** `heraldicData.js` (used, 18 flat tinctures, no furs) vs `tinctures.js` (unused except 2 helpers; 21+ tinctures incl. ermine/vair/potent + 4 fantasy patterns, checkRuleOfTincture, getContrastingTinctures). Likewise the 400-line inline switch in generateFieldSVG vs `divisions.js`'s data-driven renderSVG — the latter is a better architecture and is 100% dead. **Furs are table stakes in heraldry and are currently unreachable.**
(a) Consolidate onto tinctures.js + divisions.js — unlocks furs (needs `<pattern>` support) and drops ~450 lines from the god component; changes the persisted tincture id vocabulary for existing records.
(b) Consolidate onto heraldicData.js — less work, permanently forfeits furs.
(c) Keep both — ongoing drift.

## Redesign opportunities

**What the creator is today.** Sticky header. Two-column grid `400px 1fr` (`HeraldryCreator.css:62-64`). Left: sticky preview — shield in a 3:4 box, blazon, tincture warning, three-chip counter, Codex link. Right: five sections, four of which are a **single-open accordion** on one `activeSection` string (`:1378`) — opening Charges closes Field. Inside Charges, "+ Add Charge" yields a card containing, stacked: 17 category tabs -> a grid of up to 46 thumbnails -> 18 tincture swatches labelled by **first letter** (so sable/steel/sanguine all render "S") -> 8 size buttons -> 3 count buttons -> arrangement buttons. Every card carries a 5-button emoji toolbar (▲ ▼ 📋 👁 ✕). Bottom: Cancel/Save. **No search. No undo. No download. No unsaved-changes guard. No keyboard access.** It reads as a settings form that happens to draw a shield, not a design tool.

1. **Kill the accordion; persistent left rail + canvas.** You currently cannot see the field division and the charge you're placing at once — the two things you most need to reconcile. Shield on a large center canvas, narrow icon rail (Field/Ordinaries/Charges/Meta), contextual controls in a right inspector. Standard design-tool grammar; costs only a re-layout.
2. **A real layer stack, not two arrays with emoji toolbars.** `ordinaries` and `charges` are separate arrays with duplicated handlers (`:1274-1305` and `:1331-1362` are copy-paste), and the 3-item caps are arbitrary. One `layers[]` with `kind: 'ordinary'|'charge'` -> one handler set, drag-to-reorder, click-layer-to-select with preview highlight. The cap can go; the renderer doesn't care.
3. **The charge picker must be a searchable command palette.** 287 charges, 17 tabs, no search — while `searchCharges()` (`unifiedChargesLibrary.js:2508`) exists, fully implemented, keyword-indexed, and **unused by the creator**. Replace tabs+grid with a ⌘K overlay: type "lion", filtered results across categories, keyboard nav, Enter to place. Virtualize the grid so a category never mounts 46 fetching components. Add recent/favourite charges — worldbuilders reuse the same 10 across a house's cadet branches.
4. **Tinctures need names, groups, contrast feedback.** An 18-swatch grid labelled by first letter is unreadable. Group under Metals/Colours/Stains/Furs (the `type` field exists at `heraldicData.js:18-43`), show names, and mark rule-of-tincture violations **inline on the swatch** rather than one global box that only inspects the field.
5. **Undo/redo, and a save flow that can't lie.** No undo of any kind — one misclick on a division wipes the field config. The design is a plain serializable object, so undo is ~20 lines: useReducer over `{past, present, future}` + ⌘Z/⇧⌘Z. Disable Save during generation; prompt on navigate-away (Cancel at `:2238` discards silently).
6. **Ship an export button.** A design tool that cannot export isn't finished. **No download path exists anywhere** in the Armory — not creator, not gallery, not house panel — though `downloadHeraldry()` exists (dead) at `heraldryUtils.js:454`. Add "Download SVG / PNG @1x @2x @4x" to the preview panel and gallery card hover. Highest value / lowest effort in the subsystem, and it's what a novelist actually wants.
7. **Fix mobile: the preview must never scroll away.** At <=1024px the grid collapses to one column and the preview becomes `position: relative` (`HeraldryCreator.css:807-812`) — it scrolls off the top and you edit blind. Make it a compact sticky strip / bottom sheet at ~120px. Collapse the emoji toolbar into an overflow menu; at 480px those are ~28px targets vs the 44px minimum.
8. **Landing page: provenance and bulk action.** Strongest surface in the subsystem — good stats, good empty state, nice "Houses Awaiting Arms" coverage widget (`:603-629`). Gaps: (i) no duplicate/derive action despite parentHeraldryId/derivationType/isTemplate existing in the schema (`heraldryService.js:82-86`) with zero UI — **"Create cadet arms from this" is the natural genealogy verb and it's already modeled**; (ii) delete is a window.confirm with no undo on a record that took 20 minutes; (iii) the "Awaiting Arms" chips cap at 8 with a dead `+N more` label (`:622-626`).
9. **Revive divisions.js as the render engine.** The 400-line switch in generateFieldSVG/generateOrdinarySVG (`HeraldryCreator.jsx:247-623`) shouldn't live in a page component. divisions.js already expresses exactly this as `{id, name, tincturesNeeded, preview, renderSVG(tinctures, size)}` — extensible without touching the editor. Move line-path generators (`:64-238`) to `utils/heraldryLines.js`, blazon generators (`:628-726`) to `utils/blazon.js`, shape emitters into the divisions registry. ~700 lines out of the god component and three trivially unit-testable pure modules — and since the subsystem has zero tests, that's where coverage should start.
