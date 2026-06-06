# Heraldry System Expansion Proposal - UPDATED
## Lineageweaver's Fourth Major System

**Last Updated:** January 2025  
**Document Status:** Active Development - Phases 1-3 Complete

---

## Executive Summary

This document outlines the transformation of Lineageweaver's heraldry feature from a sub-component within house creation into a fully-fledged fourth major system, equal in scope and importance to the Family Tree, The Codex, and the Data Management systems.

The expanded Heraldry System serves as both:
1. **A Standalone Creative Tool** - For designing, managing, and exploring heraldic designs
2. **An Integrated Component** - That seamlessly connects with houses, people, events, and locations

---

## Build Progress Overview

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Complete | Landing page, gallery, navigation, database migration |
| **Phase 2: Design Studio** | ✅ Complete | Full creator interface, divisions, tinctures, line styles |
| **Phase 3: Charges Library** | ✅ Complete | 200+ charges, browseable library, creator integration |
| **Phase 4: Personal Arms** | 🔲 Planned | Individual heraldry, cadency, marriage arms |
| **Phase 5: Integration** | 🔲 Planned | House/Person/Codex deep connections |
| **Phase 6: Blazonry** | ⚡ Partial | Auto-generation working, parser planned |
| **Phase 7: Advanced** | 🔲 Planned | Export, templates, fantasy features |

---

## Current Implementation

### Route Structure (Implemented)

```
/heraldry                    → HeraldryLanding (gallery overview) ✅
/heraldry/create             → HeraldryCreator (new design) ✅
/heraldry/edit/:id           → HeraldryCreator (editing mode) ✅
/heraldry/charges            → ChargesLibrary (browse symbols) ✅
```

### Database Schema (Version 7)

```javascript
// heraldry table
{
  id: "unique-identifier",
  
  // === IDENTITY ===
  name: "string",                    // "Arms of House Wilfrey"
  description: "text",               // Free-form description
  blazon: "string | null",           // Auto-generated heraldic description
  
  // === VISUAL DATA ===
  heraldrySVG: "string",             // Primary SVG (infinite zoom)
  heraldrySourceSVG: "string",       // Pre-mask version for reprocessing
  heraldryThumbnail: "base64",       // 40×40 PNG
  heraldryDisplay: "base64",         // 200×200 PNG
  heraldryHighRes: "base64",         // 400×400 PNG
  
  // === COMPOSITION ===
  shieldType: "heater | french | spanish | english | swiss",
  composition: {
    field: { division, tinctures },
    ordinaries: [],
    charges: [],
    lineStyle: "string"
  },
  
  // === CLASSIFICATION ===
  category: "noble | ecclesiastical | civic | guild | personal | fantasy",
  tags: ["array of strings"],
  
  // === LINEAGE ===
  parentHeraldryId: "reference | null",
  derivationType: "cadency | marriage | grant | adoption | null",
  
  // === METADATA ===
  isTemplate: "boolean",
  codexEntryId: "reference | null",
  source: "string | null",           // 'simple', 'armoria', etc.
  seed: "string | null",             // For reproducibility
  metadata: "object | null",
  created: "timestamp",
  updated: "timestamp"
}

// heraldryLinks table
{
  id: "unique-identifier",
  heraldryId: "reference",
  entityType: "house | person | location | event",
  entityId: "reference",
  linkType: "primary | quartered | impaled | banner | seal",
  since: "date | null",
  until: "date | null",
  created: "timestamp"
}
```

---

## Phase 1: Foundation ✅ COMPLETE

### Deliverables Implemented

#### 1A: Landing Page & Gallery ✅
**File:** `src/pages/HeraldryLanding.jsx`

Features:
- Grid gallery of all heraldic devices
- Search by name, description, blazon, tags
- Filter by category (noble, ecclesiastical, civic, etc.)
- Filter by shield type
- Sort by name, created date, updated date
- Statistics dashboard (total, by category, linked entities)
- Quick actions: create, view, edit, delete, duplicate
- Prominent "Create New" call-to-action
- House linkage display

#### 1B: Navigation Integration ✅
**File:** `src/components/Navigation.jsx`

- "Heraldry" added to main navigation
- Shield icon (🛡️) for visual identification
- Active page highlighting
- Consistent with other major systems

#### 1C: Database Migration ✅
**File:** `src/services/database.js` (Version 7)

- `heraldry` table created with full schema
- `heraldryLinks` junction table for entity relationships
- Houses updated with `heraldryId` foreign key
- Backward compatibility preserved

#### 1D: Service Layer ✅
**File:** `src/services/heraldryService.js`

Full CRUD operations:
- `createHeraldry()` - Create new heraldic devices
- `getHeraldry()` - Get single record by ID
- `getAllHeraldry()` - Get all records
- `updateHeraldry()` - Update existing record
- `deleteHeraldry()` - Delete with cascade to links

Link management:
- `linkHeraldryToEntity()` - Create entity associations
- `unlinkHeraldry()` - Remove associations
- `getHeraldryLinks()` - Get links for heraldry
- `getHeraldryForEntity()` - Get heraldry for house/person/etc.

Query helpers:
- `getHeraldryByCategory()`
- `searchHeraldry()`
- `getHeraldryStatistics()`
- `getRecentHeraldry()`
- `getHeraldryTemplates()`

---

## Phase 2: The Design Studio ✅ COMPLETE

### Deliverables Implemented

#### 2A: Enhanced Creator Interface ✅
**File:** `src/pages/HeraldryCreator.jsx`

Full-page design studio featuring:
- **Live Shield Preview** - Real-time SVG rendering at 400×400
- **Layered Architecture** - Field → Ordinaries → Charges
- **Quick Actions Panel** - Randomize, Reset, Duplicate
- **Shield Shape Selector** - 5 professional shapes
- **Auto-Generated Blazon** - Real-time heraldic description
- **Edit Mode** - Load and modify existing heraldry
- **House Linking** - Associate with houses during creation

Layout:
```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back]     ⚔️ Heraldry Studio     [Preview] [Save] [Export]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌───────────────────────────────────────┐  │
│  │             │    │         FIELD & DIVISIONS             │  │
│  │   SHIELD    │    │                                       │  │
│  │   PREVIEW   │    │  Division: [Visual picker grid]       │  │
│  │   (Live)    │    │  Line Style: [Dropdown with preview]  │  │
│  │             │    │  Tincture 1: [Color swatch picker]    │  │
│  │    400×     │    │  Tincture 2: [Color swatch picker]    │  │
│  │             │    │                                       │  │
│  └─────────────┘    └───────────────────────────────────────┘  │
│                                                                 │
│  Shield Shape:      ┌───────────────────────────────────────┐  │
│  [5 shapes]         │         ORDINARIES                    │  │
│                     │  [+ Add Ordinary] [Clear All]         │  │
│  ┌───────────────┐  │  Up to 3 independent layers           │  │
│  │ Quick Actions │  └───────────────────────────────────────┘  │
│  │ ─────────────│                                              │
│  │ 🎲 Randomize │    ┌───────────────────────────────────────┐  │
│  │ ♻️ Reset     │    │           CHARGES                     │  │
│  │ 📋 Duplicate │    │  [+ Add Charge from Library]          │  │
│  └───────────────┘   │  Up to 3 charges with positioning     │  │
│                      └───────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📜 Blazon: "Quarterly gules and argent, a lion rampant Or"    │
│  (Auto-generated heraldic description)                         │
└─────────────────────────────────────────────────────────────────┘
```

#### 2B: Division System ✅
**File:** `src/data/divisions.js`

**22 Divisions Implemented:**

| Category | Divisions |
|----------|-----------|
| **Plain** | Plain (solid field) |
| **Partitions** | Per Pale, Per Fess, Per Bend, Per Bend Sinister, Per Chevron, Per Saltire |
| **Complex** | Quarterly, Gyronny, Tierced in Pale, Tierced in Fess, Tierced in Pairle |
| **Patterns** | Paly, Barry, Bendy, Chequy, Lozengy |
| **Ordinaries** | Chief, Base, Pale, Fess, Bend, Bend Sinister, Chevron, Saltire, Cross, Bordure |

Each division includes:
- Visual preview icon
- SVG rendering function
- Tincture requirements (1-3)
- Description and display name
- Support for line styles

#### 2C: Tincture System ✅
**File:** `src/data/tinctures.js`

**17+ Tinctures Implemented:**

| Type | Tinctures |
|------|-----------|
| **Metals** | Or (Gold), Argent (Silver), Copper, Steel |
| **Colours** | Gules (Red), Azure (Blue), Sable (Black), Vert (Green), Purpure (Purple), Celeste (Sky), Carnation (Flesh), Brunâtre (Brown) |
| **Fantasy** | Crimson (Blood), Midnight (Navy), Jade (Sea Green) |
| **Stains** | Tenné (Orange-Brown), Sanguine (Blood Red), Murrey (Mulberry) |
| **Furs** | Ermine, Ermines, Erminois, Pean, Vair, Counter-Vair, Potent |
| **Fantasy Patterns** | Starfield, Flames, Void, Prismatic |

Helper functions:
- `getTincture()` - Get tincture by ID
- `getTinctureColor()` - Get hex color
- `checkRuleOfTincture()` - Validate contrast rules
- `getContrastingTinctures()` - Suggest valid combinations
- `getTincturesByType()` - Organized for UI display

#### 2D: Line Styles ✅
**In:** `src/pages/HeraldryCreator.jsx`

**10 Line Styles Implemented:**
- Straight (default)
- Wavy (undulating waves)
- Engrailed (scalloped outward)
- Invected (scalloped inward)
- Embattled (battlements/crenellated)
- Indented (zigzag teeth)
- Dancetty (large zigzag)
- Raguly (broken branch stubs)
- Dovetailed (dovetail joints)
- Nebuly (cloud-like curves)

#### 2E: Shield Shapes ✅
**Source:** heraldicart.org (CC0)
**Location:** `/public/shields/`

**5 Professional Shield Shapes:**
1. **Heater** - Classic medieval shield
2. **French** - Curved bottom, formal
3. **Spanish** - Pointed bottom
4. **English** - Square top, rounded bottom
5. **Swiss** - Wide curved shape

---

## Phase 3: The Charges Library ✅ COMPLETE

### Deliverables Implemented

#### 3A: Unified Charges Library ✅
**File:** `src/data/unifiedChargesLibrary.js`

**200+ Charges Across 17 Categories:**

| Category | Count | Examples |
|----------|-------|----------|
| **Beasts** | 30+ | Lion Rampant, Bear, Boar, Wolf, Stag, Horse |
| **Birds** | 25+ | Eagle Displayed, Falcon, Owl, Peacock, Crane |
| **Sea Creatures** | 30+ | Fish, Whale, Crab, Mermaid, Sea Serpent |
| **Mythical** | 15+ | Dragon, Griffin, Unicorn, Phoenix, Basilisk |
| **Insects** | 12+ | Bee, Butterfly, Spider, Dragonfly |
| **Serpents** | 10+ | Serpent Erect, Crocodile, Lizard, Frog |
| **Weapons** | 20+ | Sword, Dagger, Axe, Bow, Mace, Lance |
| **Flora** | 35+ | Rose, Oak, Wheat, Thistle, Laurel Wreath |
| **Architecture** | 10+ | Castle, Tower, Bridge, Portcullis |
| **Objects** | 15+ | Chalice, Cauldron, Horn, Amphora |
| **Body Parts** | 5+ | Fist, Woman figure |
| **Military** | 10+ | Helm, Breastplate, Gauntlet, Pennon |
| **Celestial** | 15+ | Sun, Moon, Crescent, Comet, Stars |
| **Geometric** | 10+ | Lozenge, Mascle, Triangle, Annulets |
| **Crosses** | 8+ | Cross Bottony, Cross of Calatrava |
| **Knots** | 8+ | Stafford Knot, Triquetra, Triskelion |
| **Symbols** | 15+ | Heart, Key, Wheel, Banner, Orb |

**Source:** heraldicart.org - Traceable Heraldic Art (Public Domain/CC0)

Each charge includes:
- Name and display name
- Category classification
- SVG filename reference
- Blazon term for description generation
- Keywords for search
- Description text

#### 3B: Charges Library Page ✅
**File:** `src/pages/ChargesLibrary.jsx`

Features:
- **Category tabs** with icons for each category
- **Search functionality** across name, keywords, description
- **Tincture preview** - Select color to preview charges
- **Lazy loading** - Intersection Observer for performance
- **Detail panel** - View charge info and preview at multiple sizes
- **Quick navigation** to HeraldryCreator with selected charge

Performance optimizations:
- Only renders visible charges (lazy loading)
- 100px root margin for pre-loading
- Maintains loaded state (doesn't unload when scrolling away)

#### 3C: Charge Renderer Component ✅
**File:** `src/components/heraldry/ExternalChargeRenderer.jsx`

Features:
- Fetches SVG from `/public/heraldic-charges/`
- Applies tincture color dynamically
- Handles outline/stroke rendering
- Async SVG generation for layering
- Multiple size support

---

## Phase 6: Blazonry System (Partial Implementation)

### What's Implemented

#### Auto-Generated Blazon ✅
The HeraldryCreator automatically generates blazon descriptions based on:
- Field division
- Tinctures used
- Line styles
- Ordinaries present
- Charges and their positions

Example outputs:
- "Azure" (plain blue field)
- "Quarterly gules and argent" (quartered red and white)
- "Or, a lion rampant gules" (gold field with red lion)
- "Per pale wavy azure and argent, a tower sable" (wavy vertical split with black tower)

#### Not Yet Implemented
- Blazon parser (type blazon → render shield)
- Complex multi-charge arrangements
- Attitude variations in blazon

---

## Remaining Phases

### Phase 4: Personal Arms & Cadency (Planned)

**Objectives:**
- Allow individuals (not just houses) to have heraldry
- Implement cadency marks for birth order
- Marriage arms composition (impalement, quartering)

**Cadency Marks (Traditional):**
| Position | English | Mark |
|----------|---------|------|
| 1st Son | Label | 3-point band |
| 2nd Son | Crescent | Moon shape |
| 3rd Son | Mullet | 5-pointed star |
| 4th Son | Martlet | Legless bird |
| 5th Son | Annulet | Ring |
| 6th Son | Fleur-de-lis | Lily |
| 7th Son | Rose | Rose flower |
| 8th Son | Cross moline | Forked cross |
| 9th Son | Octofoil | 8-petaled flower |

**Integration Points:**
- Person form with heraldry selection
- Family tree display of personal arms
- Automatic cadency suggestion based on birth order

### Phase 5: Deep Integration (Planned)

**House Integration:**
- Bidirectional heraldry ↔ house linking
- Cadet house arms derivation
- House sidebar heraldry display

**Person Integration:**
- Personal arms on person cards
- Arms inheritance tracking
- Codex auto-display

**Codex Integration:**
- Heraldry entries with wiki-links
- Blazon term definitions
- Cross-referencing

### Phase 7: Advanced Features (Planned)

**Export/Import:**
- SVG export for external use
- PNG export at multiple resolutions
- JSON backup/restore
- Library sharing

**Templates:**
- Mark designs as templates
- Template gallery for quick starts
- Copy-and-modify workflow

**Fantasy Extensions:**
- Animated elements (fire, water effects)
- Magical property links to Mysteria
- Non-traditional shapes

---

## File Structure (Current)

```
/src
  /pages
    HeraldryLanding.jsx          ✅ Gallery overview
    HeraldryLanding.css          ✅ Styles
    HeraldryCreator.jsx          ✅ Full design studio
    HeraldryCreator.css          ✅ Styles
    ChargesLibrary.jsx           ✅ Browse charges
    ChargesLibrary.css           ✅ Styles
    
  /components
    /heraldry
      ExternalChargeRenderer.jsx ✅ Charge rendering
      
  /data
    divisions.js                 ✅ Division definitions
    tinctures.js                 ✅ Tincture definitions
    unifiedChargesLibrary.js     ✅ 200+ charges
    
  /services
    heraldryService.js           ✅ CRUD operations
    database.js                  ✅ Version 7 schema
    
  /utils
    heraldryUtils.js             ✅ Image processing
    simpleHeraldryGenerator.js   ✅ Pattern generation
    shieldSVGProcessor.js        ✅ Shield masking
    armoriaIntegration.js        ✅ External API
    
/public
  /shields                       ✅ 5 shield SVGs
  /heraldic-charges              ✅ 200+ charge SVGs
```

---

## Technical Implementation Notes

### SVG Architecture
- All heraldry rendered as SVG for infinite zoom
- PNG fallbacks generated at 40×40, 200×200, 400×400
- Shield masking applied via shieldSVGProcessor
- Charges loaded dynamically and recolored

### Performance Considerations
- Lazy loading in ChargesLibrary prevents 200+ simultaneous fetches
- Thumbnail caching reduces re-rendering
- SVG compression for storage efficiency

### Theming Integration
- All heraldry components respect theme CSS variables
- Medieval manuscript aesthetic maintained
- Accessible color contrast preserved

---

## Next Steps Recommendation

Based on current progress, recommended next actions:

### Immediate (Polish Phase 3)
1. Final routing/styling review for ChargesLibrary
2. Charge positioning refinement in creator
3. Multi-charge arrangement improvements

### Short-term (Phase 4 Start)
1. Person form heraldry integration
2. Basic cadency mark implementation
3. Marriage arms composition

### Medium-term (Phase 5)
1. House ↔ Heraldry bidirectional linking
2. Codex integration for heraldry entries
3. Family tree heraldry display

---

## Questions Resolved From Original Proposal

| Question | Resolution |
|----------|------------|
| Charges approach? | Built curated SVG library (200+ from heraldicart.org) |
| Historical accuracy? | Soft guidance with rule-of-tincture checking, no enforcement |
| Personal arms timing? | Deferred to Phase 4 |
| Existing data migration? | Backward compatibility maintained, gradual migration |

---

## Version History

- **v0.1** - Initial proposal document
- **v0.2** - Phase 1 implementation complete
- **v0.3** - Phase 2 implementation complete  
- **v0.4** - Phase 3 implementation complete (current)

---

*This document serves as the living reference for Heraldry System development. Updates reflect actual implementation progress.*
