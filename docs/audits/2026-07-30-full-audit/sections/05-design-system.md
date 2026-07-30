# Layer: Design System, Visual Language & App Shell

## Quantified inventory

**Scale of the surface layer**

| Metric | Count |
|---|---|
| CSS files in src/ | 115 |
| CSS lines in src/ | 46,738 |
| JSX files | 122 |
| JSX lines | 54,117 |
| CSS:JSX line ratio | 0.86 : 1 |
| JSX files with a co-located sibling .css | 100 of 122 |
| Distinct class selectors defined in CSS | 3,559 |
| Distinct static class names referenced in JSX | 596 |
| Built CSS shipped | 792 KB across 40+ chunks; index 134 KB, ManageData 128 KB, StoryPlannerModal 114 KB |

**Design tokens**

| Metric | Count |
|---|---|
| Distinct custom-property names app-wide | 185 |
| Token declarations per theme file | 150 (identical name set across all 7 themes — this part is clean) |
| Declarations in theme-base.css | 79 |
| Total token declarations | 1,129 |
| Tokens defined in BOTH theme-base and every theme with **conflicting values** | 47 |
| Tokens referenced via var() but **never defined** | 34 (6 set inline via style prop -> **28 genuinely broken**) |
| Dead tokens | --space-7, --space-20, --space-0 (2 uses), --font-normal/medium/semibold/bold (0 uses) |

Broken-token hot spots: `--accent-glow` (36 uses/12 files, all with fallbacks), `--focus-ring-alpha` (19/11), `--border-hover` (15/8, **no fallback**), `--text-2xs` (13/2, no fallback), `--bg-hover` (10/8, no fallback), `--surface-primary`/`--surface-elevated` (9, no fallback), `--parchment-*` (9, no fallback).

**Hardcoded colour (CLAUDE.md forbids it)**

| Where | Count |
|---|---|
| Hex literals in non-theme CSS | 202 occurrences, 36 distinct values |
| rgba() literals in non-theme CSS | 528 |
| Hex literals in JSX | 227 across 23 files |
| Worst files | AIProposalCard.css 27, StoryPlannerDashboard.css 24, DignityView.css 20, PlanningSidebar.css 19 |
| Most-repeated strays | #ef4444 x22, #3b82f6 x22, #f59e0b x20, #8b5cf6 x20, #22c55e x20 — i.e. **the Tailwind default palette, pasted by hand** |

**Typography**

| Metric | Value |
|---|---|
| Webfonts | Cinzel (3 weights) + Crimson Text (4 styles), single render-blocking `<link>` at `index.html:12`, no preload, no self-host |
| `--font-body` at `theme-base.css:36` | `'Cormorant Garamond'` — **never loaded**; dead fallback chain |
| Distinct font-size values in CSS | 49 (40 literal, 9 token) |
| Literal font-size occurrences | 239 vs 1,134 token uses (17% bypass) |
| Distinct font-weight values | 6 — 498 occurrences, **0 token uses** despite tokens existing |
| Distinct line-height values | 13 — 136 literal vs 18 token (88% bypass) |
| Resolved base | `--text-base: 14px`, `--text-xs: 11px` (`theme-royal-parchment.css:181,179`) |
| Scale skew | xs 345 + sm 486 = **831 uses**, vs base 139, lg 82, xl 45, 2xl 27, 3xl 12, 4xl 2 |

**Spacing, layout, breakpoints**

| Metric | Value |
|---|---|
| --space-* uses | 3,335 (good adoption); literal padding 173, literal gap 158 |
| Distinct literal padding values | 50 |
| Distinct literal border-radius values | 13 (4px x27, 6px x27, 3px x18, 10px x5 — all off-scale) |
| z-index | 33 literal vs 12 token; literals include 9999 x3, 1000 x10, 1001 x2 |
| Media-query blocks | 180 |
| Distinct breakpoints | **7** (768 x52, 480 x41, 640 x25, 1200 x18, 1024 x8, 900 x3, 1000 x1) + a stray min-width:768 |
| CSS files with zero media queries | 28 of 115 |
| Distinct page container max-width | **7 values**: 900, 1000, 1200, 1400, 1600; nav is 1400 |

**Component primitives — how many times each is reinvented**

| Primitive | Distinct classes | Base-level | Files |
|---|---|---|---|
| Buttons | 194 | 30 | **56** |
| Cards | 367 | 29 | 28 |
| Headers | 231 | 17 | 63 |
| Badges | 135 | 7 | 35 |
| Modals | 126 | 13 | 14 |
| Sections | 133 | 21 | 35 |
| Empty states | 91 | 7 | 40 |
| Panels | 66 | 9 | 8 |
| Search | 59 | 6 | 14 |
| Loading/spinner | 66 | 19 | 40 (22 separate @keyframes spin) |
| Inputs/fields | 61 | 15 | 32 |
| Tabs | 38 | 7 | 5 |
| Overlays | 16 | 4 | 14 |

Shared-primitive adoption (of 122 JSX files): ActionButton 37 · EmptyState 16 · LoadingState 13 · Card 12 · SectionHeader/ListSearchBar/Pagination/FilterDropdown/SortDropdown 4 each · ListControls 3 · **Modal 2** · GroupHeader/GroupToggle/ViewDensityToggle 1 each · **AnimatedList 0 (dead)**.

**Tailwind vs custom CSS**

| Metric | Value |
|---|---|
| JSX files using unmistakable Tailwind utilities | **7 of 122 (5.7%)** |
| Total Tailwind-ish tokens in all JSX | ~513, concentrated in FamilyTree, DataHealthDashboard, StatsGlance, TreeSettingsPanel, EpithetsSection, PersonalArmsSection, FragmentNavigator |
| tailwind.config.js custom colors | 4 (legitimate/bastard/adopted/unknown) — **0 uses in src/** |
| Tailwind theme vars emitted into :root | 58 --tw-* + 37 --color-*-N00 + --spacing, --text-*, --font-weight-*, --radius-* |

**Accessibility**

| Metric | Value |
|---|---|
| `<div>` 1,909 | vs `<button>` 404, `<main>` 7, `<nav>` 1, `<table>` 0, `<dialog>` 0, `<ol>` 0, `<fieldset>` 0 |
| `<div onClick>` | **34** across 10 files, **0** with role= |
| `<label>` 238 vs htmlFor 77 | **161 labels with no programmatic association**; 240 form controls, only 39 inputs carry an id |
| Total aria-* attributes | 68 app-wide (31 are aria-label) |
| role="tab"/"tablist"/"tabpanel" | **0** — across all 5 tab implementations |
| outline:none / outline:0 | 60 declarations in 46 files; **44 of those define zero :focus-visible** |
| :focus-visible | 22 total, 7 of which are the one global rule per theme file |
| tabIndex 2 · onKeyDown 12 | |
| prefers-reduced-motion blocks | 41 (CSS only) |
| prefers-color-scheme / prefers-contrast / forced-colors | **0 / 0 / 0** |

**Contrast (computed WCAG ratios from actual token pairs)**

| Theme | text-disabled/bg | accent-primary/bg | focus-ring/bg | color-warning/bg | border-primary/bg |
|---|---|---|---|---|---|
| light-manuscript | **2.99** | **2.95** | **2.55** | **2.19** | **1.59** |
| emerald-court | **2.66** | **3.89** | **3.76** | **2.65** | **1.44** |
| sapphire-dynasty | **2.70** | 5.17 | **4.24** | **3.18** | **1.56** |
| autumn-chronicle | **3.26** | **3.57** | **3.15** | **2.87** | **1.64** |
| rose-lineage | **3.51** | 5.13 | **4.49** | **2.55** | **1.65** |
| twilight-realm | **3.17** | 4.62 | 5.25 | 7.93 | **1.60** |
| royal-parchment | **2.87** | 7.54 | 8.19 | 6.41 | **1.74** |

**29 token pairs fail AA (4.5:1); 12 fail even the 3:1 UI threshold. `--border-primary` fails 3:1 in ALL 7 themes and is used 470 times.**

**Motion**

| Metric | Value |
|---|---|
| JSX files importing framer-motion | **80 of 122 (66%)** |
| `<motion.*>` elements | 458 |
| AnimatePresence | 297 |
| useReducedMotion | **0** |
| whileHover / whileTap | 52 / 37 |
| Distinct Framer duration values | 10 (.15 .2 .25 .3 .4 .5 .6 .8 1 1.5) |
| CSS transition declarations | 434 (346 token, 57 literal) |
| @keyframes | 58 distinct names, incl. **22 separate definitions of `spin`** |

## Part A — Autonomously fixable

**[CRITICAL] 1,468 lines of the shared design-system CSS layer are never imported**
`src/styles/shared/index.css:1-12`, `buttons.css` (236), `cards.css` (193), `animations.css` (345), `sections.css` (306), `src/styles/shared-forms.css` (376). Nothing imports any of them — grep for `styles/shared` across src/, index.html, vite.config.js returns only the file's own doc comment. `lw-btn`/`lw-card`/`lw-section` appear **3 times total** in JSX (all `lw-icon` in one file) against 64 `.lw-*` definitions. `docs/DEVELOPMENT_GUIDELINES.md:73` documents shared-forms.css as the canonical form-CSS location — **a file that has never been loaded.**
**This is the single reason the app looks inconsistent: a design system was built and never wired up, so all 56 files reinvented buttons.**
Fix: add the two @imports to `src/index.css` after the Tailwind import; `.form-group` and `.btn` collide with `WritingStudio.css:504` and `HeraldryCreator.css:255`, so rename those two page-scoped first. Effort S.

**[CRITICAL] --font-body names a font that is never loaded** — `theme-base.css:36` declares 'Cormorant Garamond'; `index.html:12` loads only Cinzel + Crimson Text. Themes override to 'Crimson Text' (`theme-royal-parchment.css:175`), so the base value only surfaces before the theme lands — exactly the first-paint window. Effort S.

**[CRITICAL] Flash of unstyled content on every cold load** — `main.jsx:7` bundles only theme-base.css, which defines **zero** surface/text colours. `ThemeContext.jsx:100-138` injects the real theme as a `<link>` inside a useEffect **after first paint**. `index.html` has no data-theme and no bootstrap script. First frame renders `background: var(--bg-primary)` -> unset -> white, black serif text, then snaps to dark. On the default dark theme that's a full-screen white flash every load.
Fix: inline a 6-line script in `<head>` reading `localStorage['lineageweaver-theme']`, set `documentElement.dataset.theme` + a matching background-color on html; and statically import the default theme in main.jsx. Effort S.

**[HIGH] Tailwind's theme variables collide by name with the app's tokens and silently hijack the 7 files using utilities**
Built output: `.text-sm{font-size:var(--text-sm)}`, `.rounded-lg{border-radius:var(--radius-lg)}`, `.font-medium{font-weight:var(--font-weight-medium)}`. Tailwind emits `--text-sm: .875rem` into :root; `theme-royal-parchment.css:180` overrides `--text-sm: 13px` under [data-theme], which wins by source order. So `className="text-sm"` in FamilyTree.jsx renders **13px with a line-height ratio computed from Tailwind's 14px assumption** (`--text-sm--line-height: calc(1.25/.875)`). `.rounded-lg` picks up the app's 8px, not Tailwind's.
Safe immediate action: namespace app tokens (`--lw-*`), mechanical. Strategic call in Part B #1. Effort M.

**[HIGH] 28 CSS custom properties referenced but never defined**
No-fallback cases: `--border-hover` (15/8), `--bg-hover` (10/8), `--text-2xs` (13/2), `--surface-primary`/`--surface-elevated` (9), `--parchment-bg/-text/-border/-accent/-text-secondary` (9), `--accent-codex` and `--accent-armory` at `BranchView.css:174,178`. Without a fallback, `var(--undefined)` makes the declaration invalid at computed-value time — `border-top: 3px solid var(--accent-codex)` renders as `currentColor`; `background: var(--bg-hover)` drops the hover state entirely.
Fix: add the 28 to all 7 themes (map --bg-hover->--bg-tertiary, --border-hover->--border-secondary, --surface-*->--bg-*, --parchment-* already exist as --parchment-dark/base/light, --text-2xs: 10px). Effort M.

**[HIGH] Six primary navigation cards on Home are keyboard-inaccessible** — `SystemCard.jsx:82-92` is `<motion.article onClick>` with no role/tabIndex/onKeyDown/Link. These are the app's main IA affordance; Tab skips all six. Fix: wrap in `<Link to={path}>` (also gives free middle-click / open-in-new-tab, currently impossible). Effort S.

**[HIGH] `Card` sets role="button" + tabIndex={0} but never handles Enter/Space** — `shared/Card.jsx:123-124`. Announces itself as a button to AT then does nothing — worse than an unlabeled div, because it promises interactivity. Effort S.

**[HIGH] 44 CSS files kill focus outlines with no :focus-visible replacement** — 60 `outline: none` across 46 files; only 2 define any :focus-visible. The per-theme global rule is overridden by the more specific component `:focus { outline: none }`. Keyboard users lose the cursor entirely inside every form and modal. Fix: codemod to `:focus:not(:focus-visible)` + a companion `:focus-visible` rule. Effort M.

**[HIGH] Zero Framer Motion animation respects prefers-reduced-motion** — 80/122 files, 458 motion elements, 297 AnimatePresence, **0** useReducedMotion. The 41 CSS blocks only suppress CSS keyframes/transitions and have no effect on JS-driven transforms. A vestibular-sensitive user still gets the blur-in hero (`HeroSection.jsx:50-60`, `filter: blur(10px)` over 0.8s), staggered card entrances, 1.5s SVG path draws.
Fix: wrap the app in `<MotionConfig reducedMotion="user">` in App.jsx — one line, globally neutralizes transform/opacity animations. Effort S (M for per-component tuning).

**[MEDIUM] --border-primary fails 3:1 in all 7 themes and is used 470 times** — 1.44 (emerald-court) to 1.74 (royal-parchment). Card edges, table rules, input borders, section dividers are effectively invisible. **A large part of why the app reads flat and mushy: the entire structural grid of the UI is below perceptual threshold.** Fix: raise to >=3:1 per theme (light-manuscript #d4c4a4 -> #a08a5e gives 3.1:1); keep the old value as `--border-subtle` for decorative rules. Effort M.

**[MEDIUM] light-manuscript — the only non-default theme with parity — has a 2.95:1 accent and 2.55:1 focus ring** — `theme-light-manuscript.css:81` (--accent-primary #b8874a), `:90` (--focus-ring #c4943c), `:53` (--color-warning #d4a034, 2.19:1). --accent-primary is used as a text colour **456 times**. WCAG 2.1 SC 1.4.11 requires focus indicators >=3:1. Fix: #8a5f28 (4.9:1), #8a6420 (4.6:1), #8a6410. Same for emerald-court (3.89) and autumn-chronicle (3.57). Effort S.

**[MEDIUM] 239 emoji rendered as UI chrome, alongside a 207-icon Lucide system** — HeraldryCreator 37, CodexCleanupTool 28, DataHealthDashboard 25, FamilyTree 21, BugReporterButton 19, `App.jsx:216,267,320`. Emoji render as full-colour Apple Color Emoji at fixed weight — they cannot inherit --text-primary or stroke weight, and visually shatter a monochrome medieval serif UI. `components/icons/Icon.jsx` already maps 207 names; straight mappings exist for all top 15. Effort M.

**[MEDIUM] Two of six Home system cards have no accent styling** — `Home.jsx:143,151` pass `accent-dignities`/`accent-writing`; `SystemCard.css:112-141` defines only accent-tree/codex/armory/forge. Dignities and Writing Studio silently fall back — an obvious inconsistency on the front door. Effort S.

**[MEDIUM] App.jsx duplicates the same 30-line `<style>` block three times** — `:36, :213, :264, :318`; `:213` and `:264` are byte-identical. Inline `<style>` re-injects on every render and can't be extracted, minified separately, or themed. Effort S.

**[MEDIUM] Nav and page containers use five different max-widths** — Navigation.css:24 is 1400. Pages: Home 1200/900, CodexBrowse 1200, CodexLanding 1200/900, CodexEntryView 900, ManageData 1400/1000, DignitiesLanding 1400/1000, HeraldryLanding 1400/1000, DignityView 1400, ChargesLibrary 1400, HeraldryCreator 1600. On a 1440px viewport the brand mark sits ~100px left of Home's content edge; **every route transition shifts the optical left margin.** Effort S.

**[MEDIUM] theme-base.css and every theme define 47 of the same tokens with different values** — base `:41-43` xs/sm/base = 0.75/0.875/1rem vs theme `:179-181` 11/13/14px; base `:67-68` radius-sm/md 2/4px vs theme 4/6px. Both are :root specificity, so the winner is source order — **and source order depends on the async `<link>` injection in ThemeContext.** Nothing about this is guaranteed; it happens to work. Fix: delete the 47 duplicates from the theme files, keep theme-base as the single scale. Effort M.

**[LOW] No `<Route path="*">`** — `App.jsx:381-403`, 23 routes, no catch-all; a bad URL renders an empty page.
**[LOW] LearningModeProvider is global with 3 consumers, all in Dignities** — `App.jsx:435`. Move inside /dignities.
**[LOW] Dead exports and tokens** — `shared/AnimatedList.jsx` (173 lines, 0 importers, but exported from the barrel at `shared/index.js:16`); --space-7, --space-20; --font-normal/medium/semibold/bold (0 uses across 498 font-weight declarations); tailwind.config.js custom colors.
**[LOW] Eight shared components missing from the barrel** — `shared/index.js` exports 6 of 14. FilterDropdown, SortDropdown, ListSearchBar, Pagination, ListControls, GroupHeader, GroupToggle, ViewDensityToggle must be deep-imported — **which is exactly why they see 1-4 uses each.**
**[LOW] 22 separate @keyframes spin** + unified-import-spin, threads-spin, lw-spin, lw-spin-slow = 26 rotation keyframes for one behaviour.

## Part B — Needs user input

**1. Tailwind: commit or remove.** The app is 94% hand-written BEM (3,559 classes, 46,738 lines) and 6% Tailwind (7 files, ~513 tokens). tailwind.config.js has 4 unused custom colors. Preflight ships in the 134 KB index.css regardless, and Tailwind's theme vars name-collide with app tokens. Meanwhile the 36 most-repeated stray hex values in custom CSS **are** Tailwind's default palette pasted by hand — the systems are already leaking. FamilyTree.jsx mixes `className="min-h-screen flex items-center justify-center"` and `className="tree-back-btn"` in the same component.
- **A — Remove Tailwind.** Rewrite ~513 usages in 7 files as BEM; drop tailwindcss/@tailwindcss/postcss/tailwind.config.js and the @import. Removes the collision and ~15 KB preflight. Cost: 7 files, plus theme-base needs a slightly stronger reset. **Low-risk default.**
- **B — Go Tailwind-first.** Map the 185 tokens into `@theme`, delete the 1,468 dead shared-CSS lines, migrate 115 stylesheets over time. One system, much less CSS, but a 6-12 month background project against 46,738 lines, and it fights the manuscript aesthetic which relies on bespoke ornament.
- **C — Keep both, formally.** Namespace app tokens `--lw-*`, Tailwind for layout utilities in new code, CSS for theming and ornament. Honest but permanently two mental models.

**2. Base font size and the 11px/13px problem.** --text-base is 14px, --text-xs is 11px. Usage is bottom-heavy: xs (345) + sm (486) = 831 vs 307 for everything base and up. Crimson Text is a low-x-height old-style serif — at 11px it's genuinely hard to read, and 13px is the app's most common size. Combined with --border-primary at 1.5:1, the result is small grey text on brown with no visible structure. **This, more than anything else in the audit, is likely what "doesn't look good" means in practice.**
- **A — Bump the scale one step:** base 16, sm 14, xs 12, delete --text-2xs. ~14% larger everywhere; dense tables and tree card labels need re-tuning. Most legible, most disruptive.
- **B — Keep sizes, switch the body face** to a taller x-height at small sizes (Source Serif 4, Literata, EB Garamond larger optical size). Every layout intact, fixes readability where it hurts. **Cheapest real win.**
- **C — Split the scale:** 14px for dense data surfaces (tree, tables, manage), 16-17px reading scale for Codex and Writing Studio. Most correct, most work.

**3. Seven themes, or two done well?** 7 x 150 tokens = 1,050 declarations to keep in contrast parity; five currently ship an accent or focus ring below 3:1. `ThemeContext.jsx:181-193` toggleTheme() finds the *first* opposite-category theme, so from any of the five light themes it always lands on royal-parchment and the toggle isn't reversible. Four themes are labelled category:'light', correct but making "toggle light/dark" meaningless. No prefers-color-scheme detection anywhere.
- **A — Two themes.** Keep royal-parchment + light-manuscript, fix both to AA, delete five (1,470 lines).
- **B — Keep seven, add a lint gate.** A Vitest test parsing each theme and asserting every documented pair clears 4.5:1 / 3:1. ~30 lines.
- **C — Two modes x N accents.** Dark and light as the only surface systems; reduce the other five to accent-hue overlays (~10 tokens each). Keeps variety, kills 90% of maintenance.

**4. Mobile: support it or drop it.** Evidence it's currently non-functional on core surfaces: `WritingEditor.css:413-422` display:none's the 380px entity sidebar at <=1200px and the 240px chapter sidebar at <=768px **with no replacement affordance** — the chapter list becomes unreachable on a phone. FamilyTree is a 1,941-line D3 SVG with pan/zoom, no touch-gesture handling, no stylesheet of its own. `QuickEditPanel.css:22` is a 384px fixed panel. 28 of 115 stylesheets have zero media queries. Only 15 declarations anywhere meet the 44px touch target. Yet `Navigation.jsx:198-238` has a full hamburger and --nav-height-mobile exists — half a mobile story.
- **A — Declare desktop-only.** Viewport gate below 900px, delete the hamburger and the 41 max-width:480px blocks. Honest, frees you from 7 breakpoints.
- **B — Mobile-read, desktop-write.** Home, Codex browse/view, Dignities view fully responsive; gate Tree, Heraldry Creator, Writing Editor, Manage behind a desktop notice. **Matches how a novelist actually uses this.**
- **C — Full responsive.** Requires a list/breadcrumb fallback for the tree and bottom-sheet sidebars for the editor. Large.

**5. The visual direction itself.** The aesthetic currently reads as *desaturated brown admin panel* rather than *illuminated manuscript*. Concretely: every surface is a rounded rectangle (--radius-md: 6px on everything); borders are invisible (1.5:1); shadows are the only depth cue and they're pure-black rgba(0,0,0,.3-.7) on a warm brown ground, which reads as dirty grey not candlelit; the accent gold #c9a227 appears 456 times as text colour and nowhere as a structural element; the only genuinely thematic assets in the whole app are one fleur-de-lis SVG and two corner flourishes on the Home hero (`HeroSection.jsx:34,110`). Meanwhile 239 emoji undercut whatever mood the serif type establishes.
- **A — Lean into the manuscript.** Warm-tinted shadows (rgba(40,25,10,.4) not black), a visible 1px rule system at 3:1 in the accent hue, drop caps on Codex entries and chapter openers, a small library of ornamental rules/corner-pieces at section boundaries, near-zero border radius (2px) so surfaces read as trimmed vellum rather than iOS cards.
- **B — Lean into the tool.** Accept it's a data application: crisp high-contrast tighter-radius information design, serif reserved for headings and prose, clean sans for all UI chrome and data. Faster, more legible, less distinctive.
- **C — Split it.** Chrome (nav, forms, tables, manage) = B; content surfaces (Codex reading view, Writing Studio, Home hero, heraldry) = A. Needs a disciplined boundary but gives both.
**This is the actual question behind "I don't like how it looks," and no amount of token hygiene answers it.**

## Proposed design system

Single source in theme-base.css, namespaced `--lw-*` to end the Tailwind collision. Themes override **colour only**.

```
Spacing (4px base, 8 steps — drop 5/7/20, all near-unused)
  --lw-space-1 4  -2 8  -3 12  -4 16  -6 24  -8 32  -12 48  -16 64

Type (1.2 modular, 16px base — resolves B#2 Option A)
  --lw-text-xs 12  -sm 14  -base 16  -lg 19  -xl 23  -2xl 28  -3xl 33  -4xl 40
  --lw-leading-tight 1.2  -snug 1.35  -normal 1.55  -relaxed 1.75
  --lw-weight-regular 400  -medium 500  -semibold 600  -bold 700   (currently 0% adopted)
  --lw-tracking-tight -0.01em  -normal 0  -wide 0.04em

Radius (4 steps — currently 13 literal values)
  --lw-radius-sm 2  -md 4  -lg 8  -full 9999

Elevation (warm-tinted, not pure black)
  --lw-elev-0 none
  --lw-elev-1 0 1px 2px  rgb(from var(--lw-shadow-hue) r g b / .18)
  --lw-elev-2 0 4px 10px … / .24
  --lw-elev-3 0 12px 28px … / .32
  --lw-shadow-hue per theme (#281908 royal-parchment, #6b5836 light-manuscript)

Colour — per theme, contract-enforced:
  surface:  bg-canvas, bg-surface, bg-raised, bg-overlay
  content:  text-primary(>=7:1), text-secondary(>=4.5:1), text-muted(>=4.5:1), text-disabled(>=3:1)
  line:     border-strong(>=3:1, structural), border-subtle(decorative only)
  accent:   accent(>=4.5:1 on bg-canvas), accent-hover, accent-quiet, on-accent
  status:   success|warning|error|info x {fg >=4.5:1, bg, border >=3:1}
  focus:    focus-ring (>=3:1 mandatory)

Motion
  --lw-dur-1 120ms  -2 200ms  -3 320ms   (currently 10 Framer + 5 CSS durations)
  --lw-ease-out cubic-bezier(.2,0,0,1) · --lw-ease-in-out cubic-bezier(.4,0,.2,1)

Layout
  --lw-container-prose 720  -narrow 900  -default 1200  -wide 1400
  --lw-bp-sm 640  -md 900  -lg 1200      (3 breakpoints, down from 7)
  --lw-z-* keep the 8-step scale; ban literals >=1000
```

**Primitives to build** — `src/components/ui/`, each with a demo at `/dev/ui` behind a flag:

| Primitive | Replaces | Sprawl |
|---|---|---|
| Button (variant x size x icon x loading) | ActionButton + lw-btn + 194 ad-hoc classes | 56 files |
| Surface (card/panel/section base) | Card + 367 card + 66 panel classes | 28 + 8 |
| Dialog (portal, focus trap, ESC, aria-modal, scroll-lock) | Modal + 126 modal + 12 overlay classes | 14 |
| Field (label+control+hint+error, auto-wires id/htmlFor/aria-describedby) | 244 form-ish classes; fixes all 161 orphan labels | 32 |
| Tabs (roving tabindex, full ARIA) | 5 hand-rolled tab bars, all 0 ARIA | 5 |
| Badge, Chip | 135 + 14 classes | 35 |
| Stack / Cluster / Grid | ~160 bespoke grid-template-columns | everywhere |
| Icon | exists and is good (207 icons) — **enforce it**, delete the 239 emoji | 21 |
| StateView (loading/empty/error in one) | EmptyState + LoadingState + 91 + 66 classes | 40 |
| AppShell (route element: nav + `<main>` + container width) | Navigation imported by hand in 18 pages; 5 container widths | 18 |

**Phased migration** — each phase independently shippable.

*Phase 0 — Stop the bleeding (1-2 days).* Bootstrap the theme in index.html (kills the FOUC). Fix --font-body. Add the 28 missing tokens. Fix light-manuscript's accent/focus/warning and --border-primary in all 7. Add `<MotionConfig reducedMotion="user">`. Wrap SystemCard in `<Link>`. Add onKeyDown to Card. Add the catch-all route. **Nothing visual changes except that it stops being broken.**

*Phase 1 — Wire up what already exists (2-3 days).* Import styles/shared/index.css and shared-forms.css. Rename the 15 colliding class names. Delete AnimatedList, dead tokens, tailwind.config's unused colors. Export all 14 shared components from the barrel. Collapse the four App.jsx `<style>` blocks. Add a Vitest contrast test failing CI on any theme pair below threshold. **You immediately get 1,468 lines of already-written design system doing work.**

*Phase 2 — Resolve Tailwind (1 week).* Execute the B#1 decision. Either way the collision ends.

*Phase 3 — Build the primitives (2 weeks).* Write the 10 components against the new scale. Migrate nothing yet. Ship `/dev/ui` so you can see them side by side — **this is where the aesthetic decision from B#5 actually gets made, on one page, cheaply, instead of across 115 stylesheets.**

*Phase 4 — Migrate by route, newest-first (1 route/week).* Home -> Manage -> Codex -> Dignities -> Writing -> Heraldry -> Tree. Per route: swap to AppShell, replace buttons/cards/dialogs/fields, delete the route's stylesheet down to genuinely bespoke rules, gain the ARIA for free. Track the win as `wc -l` deleted. Expect 46,738 -> under 15,000. Add an ESLint rule banning new co-located .css files for components under 100 lines.

*Phase 5 — Ornament (1 week, optional, after B#5).* Drop caps, section rules, corner pieces, warm shadows, a reduced-motion-aware flourish system.

## Surface-by-surface visual critique

**Home** (`Home.jsx` 236 + 1,144 lines of CSS across 6 components). Structurally the best page and still the weakest first impression. The hero animates `blur(10px)` -> `blur(0)` over 800ms (`HeroSection.jsx:50-60`) — a filter animation on a large text node, forcing a compositor repaint; reads sluggish, can't be skipped. Below: stats row, quick-actions row, recent-activity, 3-column card grid — four consecutive full-width bands with the same visual weight and the same --space-12 gap, so nothing establishes hierarchy. The six system cards are the actual product IA and are `<article onClick>` — no keyboard, no middle-click — and two of six have no accent rule, so Writing Studio and Dignities visibly differ from their four siblings on hover. Content maxes at 900px inside a 1200px container inside a 1400px nav: **three different left edges stacked vertically.**

**Navigation** (257 / 496). The most competently built surface — real BEM, four thoughtful breakpoints, aria-expanded on the toggle, tooltips in compact mode. Two problems: it's imported by hand in 18 pages rather than being a `<Layout>` route element (prop drift is inevitable — showSearch, compactMode, showControlsToggle set per-page); and at <=1200px it visually-hides all seven link labels with no affordance that labels exist, so between 769px and 1200px — most laptops in a split window — the user gets seven unlabeled 18px glyphs. The right cluster is five controls with no grouping or separator.

**Family Tree** (1,941 lines, **zero stylesheet**). The flagship feature has no CSS file — loading and empty states are Tailwind utilities sitting next to BEM classes in the same JSX. `text-4xl` there resolves to the theme's 28px, not Tailwind's 36px: a silent 8px difference nobody chose. 21 emoji inside the component. D3 SVG with no touch handling.

**Writing Editor** (`.css` 506 lines, **2 media queries**). A 240px chapter sidebar and a 380px entity sidebar = 620px of fixed chrome. At <=1200px the entity sidebar display:none's; at <=768px so does the chapter sidebar. Neither gets a replacement. On a laptop in split view you lose the reference browser silently; on a phone you cannot reach your chapter list at all. **The surface where a novelist spends the most time has the fewest media queries of any major page.**

**Manage Data** (`.css` 689 -> 128 KB built, second-largest CSS chunk). Opens with a hero whose title is a single drop-cap letter in `.manage-hero__initial` — a nice manuscript gesture, and the only one outside the Home hero, which makes it read as an accident rather than a system. The tab bar (`:390-408`) is bare `<button>`s in a `<div>`: no role="tablist"/"tab", no aria-selected, no arrow keys — same as all five tab implementations. Uses `Card padding="none"` as the tab container; almost nothing else on the page uses a primitive.

**Dignities Landing (1,115 CSS) and Dignity View (1,889 CSS).** The two heaviest stylesheets after Heraldry; DignityView.css alone has 20 hardcoded hex values. These carry the app's densest information — successional hierarchies, crisis states — rendered at 11-13px against borders at 1.7:1. The information is there; the structure that would let you scan it is below perceptual threshold. **This is where "borders invisible + type too small" does the most damage.**

**Heraldry Creator** (`.css` 1,589). 37 emoji, 24 button-class definitions, its own 1600px container (widest in the app, 400px wider than Home), 12 separate page/container/content shell classes, and its own `.form-group` colliding with WritingStudio.css:504 and the never-loaded shared-forms.css:48. Nine media queries — the most responsive attention of any page — spent on a surface that is inherently desktop-only.

**Login** (176 / 228). Genuinely good: proper BEM, a spring entrance, AnimatePresence on the error, sparkle-ornament dividers, real 3-part structure. It's also the only page not behind ProtectedRoute, so it's the only page users see before the theme loads — **and therefore the surface where the FOUC is most visible**: white flash, then the dark card snaps in.

**Loading and error states** (`App.jsx:213-330`, PageLoader at `:33`). Three near-identical full-screen states, two byte-identical, each with an emoji as its primary visual rendered at 48px in full-colour on dark brown. PageLoader is a bare grey spinner with "Loading..." and no skeleton, shown on every one of the 23 lazy routes. Given WritingEditor is a 504 KB chunk and ManageData is 202 KB + 128 KB CSS, **this spinner is on screen for a meaningful fraction of every session, and it's the least considered pixel in the app.**
