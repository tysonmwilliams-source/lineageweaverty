# Lineageweaver

A browser-based fantasy **genealogy + worldbuilding suite** for novelists and worldbuilders — combining an interactive family tree, a wiki-style encyclopedia, a heraldic design studio, a feudal titles/succession system, and a novel-writing workspace, all backed by local-first storage with optional cloud sync.

## What is Lineageweaver?

Lineageweaver helps fantasy writers track complex worlds and the stories set in them:

- **Family trees** — multiple marriages, illegitimate children, fostering/adoption, cadet branches, magical bloodlines, and non-human species
- **The Codex** — a wiki-style encyclopedia with `[[wiki-links]]` and automatic backlinks, cross-linked to the tree
- **The Armory** — a professional SVG coat-of-arms designer linked to houses and people
- **Dignities** — feudal titles, offices, tenure history, and succession (with dispute and regency tracking)
- **The Writing Studio** — a TipTap-based editor with story planning, canon-checking, and prose analysis
- **AI Assistant** — optional Google Gemini integration for worldbuilding help and reviewable data proposals
- **Cloud sync & datasets** — local-first IndexedDB storage, optional Firebase sync, and multiple independent worlds per account

> 📐 Building on this project? Start with [`CLAUDE.md`](CLAUDE.md) for architecture, conventions, and the cloud-sync rules, then `docs/DEVELOPMENT_GUIDELINES.md` for the full playbook.

## Current Status

Lineageweaver is in **active development** (solo project). The last formally tagged milestone was **v0.9.0 — "The Heraldry Reboot"** (January 2026); several major systems have shipped since.

**Major systems (current state):**

| System | Status |
|--------|--------|
| Family Tree / Genealogy | ✅ Mature |
| The Codex (wiki) | ✅ Mature |
| The Armory (heraldry) | ✅ Mature — house + personal arms built |
| Dignities (titles & succession) | ✅ Feature-complete |
| Writing Studio + Planner | ✅ Feature-complete |
| Canon Check / Prose Analysis | ✅ Rule-based complete (AI checks partial) |
| AI Assistant (Gemini) | ⚠️ Integrated — requires API key |
| Cloud Sync (Firebase) | ✅ Working — last-write-wins |
| Multi-dataset (multiple worlds) | ✅ Working |
| Bug Tracker | ✅ Built-in |

**Tech at a glance:** React 19 · React Router 7 · Vite 7 · Dexie/IndexedDB (schema v17) · Firebase Auth + Firestore · D3 v7 · TipTap 3 · Tailwind 4. ~103k LOC.

---

## The Armory — Heraldry System

The Armory is Lineageweaver's integrated heraldry design system. Create authentic coats of arms using traditional heraldic principles, then link them to noble houses and individual people.

**Access:** Navigate to `/heraldry` ("The Armory"), `/heraldry/create` (Design Studio), or `/heraldry/charges` (Charges Library).

### Roadmap

| Phase | Name | Status |
|-------|------|--------|
| 0 | Planning & Architecture | ✅ Complete |
| 1 | Foundation (DB schema, service layer) | ✅ Complete |
| 2 | Design Studio (divisions, tinctures, ordinaries) | ✅ Complete |
| 3 | Charges Library | ✅ Complete |
| 4 | House Integration & Personal Arms | ✅ Complete |
| 5 | Codex Integration & Cloud Sync | 🔄 Mostly complete |
| 6 | Polish, Export, Mobile UI | ⬜ Planned |

### What you can design

The Design Studio uses a **3-layer composition model** (field → ordinaries → charges) with a live preview and automatic blazon generation:

- **22 field divisions** — simple, partitions (per pale/fess/bend/chevron/saltire, quarterly), stripes (paly/barry/bendy, 4–10 count), complex patterns (chequy, lozengy, fusily, gyronny), and tierced
- **14 ordinaries** — chief, base, fess, pale, bend(s), chevron, pile, cross, saltire — each with independent tincture, thickness (narrow/normal/wide), count (1–3), and inversion
- **17 tinctures** — traditional metals & colours (Or, Argent, Gules, Azure, Sable, Vert, Purpure), stains (Tenné, Sanguine, Murrey), plus extended/fantasy hues
- **10 line styles** — straight, wavy, engrailed, invected, embattled, indented, dancetty, raguly, dovetailed, nebuly
- **287 charges across 17 categories** — beasts, birds, sea creatures, mythical, insects, serpents, weapons, flora, architecture, objects, body parts, military, celestial, geometric, crosses, knots, symbols. Charges support per-charge tincture, multiple size steps (Small → Titanic), count (1–3), and arrangement (in pale/fess/bend, 2&1, 1&2). Browse them all at `/heraldry/charges`.

Charge artwork is sourced from [Traceable Heraldic Art](https://www.heraldicart.org/) (CC0 / public domain), stored as external SVGs in `public/heraldic-charges/` and colorized at render time.

> **Shield shapes:** five historical outlines (Heater, English, French, Spanish, Swiss) exist in `public/shields/`, but shape selection is currently disabled — designs render on the default (French) shield.

### Blazon generation & heraldic rules

Designs auto-generate formal blazons (e.g. *"Per pale Gules and Or, a chevron wavy Argent"*) and show a non-blocking **Rule of Tincture** warning for metal-on-metal or colour-on-colour field divisions.

### Rendering & storage pipeline

1. **Compose SVG** (200×200) — field + ordinaries + charges
2. **Apply shield mask** via `clipPath` for crisp rendering at any size
3. **Rasterize to PNG** at three sizes (thumbnail, display, high-res) for fast lists/exports
4. **Store** the SVG, PNGs, and the editable `composition` object (versioned, with backward-compat migration from the legacy flat format)

### House & personal arms

- **House arms** — link any design to a house (`HouseHeraldrySection`); the primary link updates the house record for quick display
- **Personal arms** — derive a person's arms from their house with **cadency marks** computed from birth order (`PersonalArmsSection`, `personalArmsRenderer.js`)
- **External generation** — optional integration with the [Armoria](https://armoria.herokuapp.com/) API for procedural base designs (`utils/armoriaIntegration.js`)

**Key files:** `pages/HeraldryCreator.jsx`, `pages/HeraldryLanding.jsx`, `pages/ChargesLibrary.jsx`, `services/heraldryService.js`, `data/unifiedChargesLibrary.js`, `data/heraldicData.js`, `utils/shieldSVGProcessor.js`.

---

## Feature areas

### 🌳 Family Tree

- Interactive D3.js genealogy tree with pan/zoom (deep-linkable via `/tree/:personId`)
- Custom "family block" layout; horizontal and vertical orientations (press `H` to toggle)
- Rich relationship model: marriages (with betrothal/marriage/divorce dates), illegitimate children, adoption, fostering, twins, namesakes, mentor bonds, and "lineage-gap" bridges for fragmentary data
- Cadet houses, legitimacy/bastard status, bastard-naming conventions, and epithets
- **Quick Edit Panel** — view details and add spouse/parent/child/sibling directly from the tree
- Relationship calculator with extensive test coverage (`utils/RelationshipCalculator.js`)

**Keyboard shortcuts:** `H` toggle layout · `+`/`=` zoom in · `-` zoom out · `0` reset view

### 📚 The Codex (Encyclopedia)

- Wiki-style entries across 8 types (personage, house, location, event, mysteria, concept, heraldry, custom)
- Markdown with `[[wiki-link]]` syntax (alias support), automatic backlinks, full-text search, and tag/era/category filtering
- Cross-linked with the tree (people/houses), heraldry, and dignities
- Auto-creation of entries for new people, cascade delete, bidirectional navigation, and biography-coverage stats

### 👑 Dignities (Titles & Succession)

Models a fictional feudal legal framework (the "Charter of Driht, Ward, and Service"):

- Titles classified by **class/rank/nature** (territorial, office, personal honour, courtesy)
- **Tenure history** — who held a dignity, when, and how it ended
- **Succession lines** — auto-calculated for primogeniture variants; manual for elective/appointed
- **Disputes & claimants**, **interregnum/regency** tracking, and feudal hierarchy (sworn-to chains)
- **Crisis dashboard** (`/dignities/crises`) and a data-quality **analysis** view (`/dignities/analysis`)

### ✍️ The Writing Studio

- TipTap rich-text editor with chapters, debounced auto-save, and `[[wiki-link]]` autocomplete to your world entities
- **Intelligent Planner** — 5 story frameworks (Three-Act, Save the Cat, Hero's Journey, Seven-Point, Story Circle), beat sheets, plot threads, character arcs, story arcs, timelines, and scene cards
- **Canon Check** — validates story references against your world data (dead characters, missing entities, timeline conflicts)
- **Prose Analysis** — flags weak adverbs, filter words, passive voice, and tell-vs-show (fully client-side)

### 🤖 AI Assistant

- Optional Google **Gemini 2.5 Flash** integration (requires `VITE_GEMINI_API_KEY`)
- World-aware chat, plus specialized helpers (mottos, backstories, blazons, story beats, character arcs)
- Generates **reviewable proposals** (create/update/delete entities) that require explicit approval before execution, with rollback support
- Features fail gracefully with a clear message when no API key is configured

### ☁️ Cloud Sync & Datasets

- **Local-first**: every change writes to IndexedDB first (instant, offline-safe), then syncs to Firestore in the background
- A pending-changes queue guards against data loss (sync is blocked on startup if local changes are unsynced; the app warns on tab-close)
- **Multiple datasets** — keep several independent worlds under one account, each fully isolated locally and in the cloud
- Conflict resolution is currently **last-write-wins** (best for single-device use)

### 🎨 Medieval Theme System

Two CSS-variable-driven themes: **Royal Parchment** (dark, warm browns) and **Light Manuscript** (light, cream). The default is Royal Parchment.

### 🐛 Bug Tracker

A built-in tracker (`/bugs`) with a floating reporter button available on every page.

---

## Getting Started

### Prerequisites

- Node.js 18+ (developed on Node 22)
- A modern browser (Chrome/Edge 90+, Firefox 88+, Safari 14+)

### Installation

```bash
cd lineageweaver
npm install
npm run dev          # http://localhost:5173
```

### Environment setup (optional but recommended)

Cloud sync and the AI assistant need API keys. Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

- `VITE_FIREBASE_*` — Firebase project config (for auth + cloud sync). See `docs/FIREBASE_SETUP_GUIDE.md`.
- `VITE_GEMINI_API_KEY` — Google Gemini key (for AI features).

All Firebase config values are safe to expose in the browser — security is enforced by `firestore.rules`, not by hiding keys. The app runs fully offline (local-only) without any of these.

### Scripts

```bash
npm run dev            # Dev server
npm run build          # Production build → dist/
npm run preview        # Preview the production build
npm run lint           # ESLint
npm run test:run       # Run the test suite once
npm run test:coverage  # Coverage report
```

### First steps in the app

1. **Sign in** (the app is auth-gated when Firebase is configured)
2. **Explore the Family Tree** (`/tree`) — click a person card to open the Quick Edit panel
3. **Browse The Codex** (`/codex`) and try `[[wiki-links]]`
4. **Design a coat of arms** (`/heraldry/create`) and link it to a house
5. **Import sample/world data** via Data Management (`/manage` → Import/Export)

---

## Technology Stack

- **React 19** + **React Router 7** — lazy-loaded routes
- **Vite 7** — build tool & dev server (with a custom `/__claude-context` endpoint for AI tooling)
- **Dexie.js** — IndexedDB wrapper (schema v17)
- **Firebase 12** — Auth + Firestore (cloud sync)
- **D3.js v7** — family tree visualization
- **TipTap 3** — rich-text writing editor
- **Tailwind CSS 4** + PostCSS — styling
- **Framer Motion** — animations
- **marked** + **DOMPurify** — Markdown parsing & sanitization
- **Google Gemini 2.5 Flash** — optional AI features
- **Vitest** + jsdom + fake-indexeddb — testing

---

## Project Structure

```
lineageweaver/
├── CLAUDE.md                       # Architecture & conventions (start here)
├── src/
│   ├── App.jsx                     # Root: providers + routes
│   ├── components/                 # Reusable UI (auth/, writing/, heraldry/, household/, shared/, ...)
│   ├── contexts/                   # Auth, Genealogy, Dataset, Bug, LearningMode
│   ├── config/                     # firebase.js, featureFlags.js
│   ├── data/                       # Static data (unifiedChargesLibrary.js, heraldicData.js, seed data)
│   ├── hooks/                      # useAutoSave, useDictation, useDignityAnalysis, ...
│   ├── pages/                      # Route components (FamilyTree, Codex*, Heraldry*, Dignity*, Writing*, ...)
│   ├── services/                   # Data layer
│   │   ├── database.js             # Dexie schema + local CRUD + sync queue
│   │   ├── firestoreService.js     # Cloud CRUD
│   │   ├── dataSyncService.js      # Sync orchestration (the sync* functions)
│   │   ├── migrationService.js     # Data migrations
│   │   ├── codexService.js / heraldryService.js / dignityService.js / writingService.js / ...
│   │   └── ai*Service.js           # Gemini integration + proposals
│   └── utils/                      # Pure helpers (RelationshipCalculator, wikiLinkParser, shieldSVGProcessor, ...)
├── public/
│   ├── heraldic-charges/           # Charge SVG assets
│   └── shields/                    # Shield outline SVGs
├── docs/                           # Guidelines, plans, audits, worldbuilding drafts
├── firestore.rules                 # Cloud security rules
└── package.json
```

---

## Development Roadmap

### ✅ Completed

| Module | Version |
|--------|---------|
| Core application | v0.1–0.3 |
| Theme system | v0.4 |
| The Codex (Phases 1–2) | v0.5–0.6 |
| Genealogy fixes | v0.6.1 |
| Shared state architecture | v0.7.0 |
| Tree–Codex integration | v0.8.0 |
| Module 1E (Import/Export, layout) | v0.8.1–0.8.2 |
| Heraldry Reboot (Phases 0–3) | v0.9.0 |
| Heraldry Phase 4 (house + personal arms) | since v0.9.0 |
| Dignities (titles & succession) | since v0.9.0 |
| Writing Studio + Planner | since v0.9.0 |
| Cloud sync + multi-dataset | since v0.9.0 |

### 🔜 In Progress / Planned

| Feature | Status |
|---------|--------|
| Heraldry Phase 5: deeper Codex integration | 🔄 Mostly done |
| Heraldry Phase 6: export formats, mobile UI, shield-shape selection | ⬜ Planned |
| AI-powered canon checks | 🔄 Partial |
| Tree–Codex unified profiles (see `featureFlags.js`) | ⬜ Planned |
| Broader automated test coverage | ⬜ Ongoing |
| Conflict-aware sync (beyond last-write-wins) | ⬜ Planned |

---

## Previous Versions

### v0.9.0 — The Heraldry Reboot (January 9, 2026)
Ground-up rebuild of the heraldry system with a professional SVG design studio: field divisions, tinctures, ordinaries, line styles, a charges library, shield masking, blazon generation, and PNG export.

### v0.8.2 — Horizontal Layout (January 7, 2026)
Left-to-right family tree view with a toggle button, the `H` keyboard shortcut, persisted preference, and auto-centering — working in both themes.

### v0.8.1 — Module 1E Core (January 7, 2026)
Export/import to JSON (with auto-backup, validation, and conflict resolution), species field, titles system, and magical-bloodline tracking.

### v0.8.0 — Tree–Codex Integration (January 7, 2026)
Auto-creation of Codex entries for new people, cascade delete, bidirectional navigation, biography badges in lists, and coverage stats.

### v0.7.0 — Shared State Architecture (January 6, 2026)
`GenealogyContext` as a single source of truth, instant synchronization across views, and an enhanced Quick Edit panel for relationship management.

### v0.6.1 — Generation Sorting Fixes (January 5, 2026)
Parent-DOB sorting, corrected bastard-line origins, and adjusted generation spacing.

---

## Browser Compatibility

Tested on Chrome/Edge 90+, Firefox 88+, Safari 14+. Requires ES6+, SVG, CSS Grid/Flexbox, and IndexedDB.

---

## License

MIT

---

## Author

Ty Williams — December 2024 onward.

**Status:** Active development · post-v0.9.0
