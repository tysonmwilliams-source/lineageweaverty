# Heraldry System Expansion Proposal
## Lineageweaver's Fourth Major System

---

## Executive Summary

This proposal outlines the transformation of Lineageweaver's heraldry feature from a sub-component within house creation into a fully-fledged fourth major system, equal in scope and importance to the Family Tree, The Codex, and the Data Management systems.

The expanded Heraldry System will serve as both:
1. **A Standalone Creative Tool** - For designing, managing, and exploring heraldic designs
2. **An Integrated Component** - That seamlessly connects with houses, people, events, and locations

---

## Current State Analysis

### What Exists Now

| Component | File | Purpose |
|-----------|------|---------|
| HeraldryCreationModal | `components/HeraldryCreationModal.jsx` | Modal for generating heraldry during house creation |
| HeraldryThumbnail | `components/HeraldryThumbnail.jsx` | Displays heraldry thumbnails throughout the app |
| heraldryUtils | `utils/heraldryUtils.js` | Image processing, masking, composition utilities |
| simpleHeraldryGenerator | `utils/simpleHeraldryGenerator.js` | Creates basic heraldic patterns (7 divisions) |
| shieldSVGProcessor | `utils/shieldSVGProcessor.js` | Loads and processes professional shield shapes |
| armoriaIntegration | `utils/armoriaIntegration.js` | External API for procedural generation |

### Current Capabilities
- ✅ 5 professional shield shapes (heater, french, spanish, english, swiss)
- ✅ Procedural generation via Armoria API
- ✅ Simple pattern generation (7 divisions: plain, paly, barry, quarterly, chevron, bend, cross)
- ✅ 7 traditional tinctures (or, argent, gules, azure, sable, vert, purpure)
- ✅ SVG-based rendering for infinite zoom quality
- ✅ PNG fallbacks at multiple resolutions
- ✅ House color integration
- ✅ Impalement (halved) and quartering composition

### Current Limitations
- ❌ No standalone page/system - only accessible through house modal
- ❌ No charges (symbols/emblems) library
- ❌ No blazonry (heraldic text description) system
- ❌ No personal arms (for individuals)
- ❌ No cadency marks (birth order indicators)
- ❌ No heraldry browsing/gallery view
- ❌ No heraldry search or filtering
- ❌ No heraldry sharing between entities
- ❌ Limited customization control
- ❌ No historical accuracy guidance
- ❌ No ordinaries (basic geometric charges)

---

## Proposed Expansion

### Vision Statement

> The Heraldry System becomes a comprehensive visual identity management tool for worldbuilding, allowing creators to design historically-grounded or fantastically-inspired heraldic devices, track their lineage and evolution, and deploy them across houses, individuals, locations, and events.

---

## Proposed Route Structure

Following the pattern established by The Codex:

```
/heraldry                    → HeraldryLanding (gallery overview)
/heraldry/create             → HeraldryCreator (new design)
/heraldry/edit/:id           → HeraldryCreator (editing mode)
/heraldry/view/:id           → HeraldryDetailView (full detail + history)
/heraldry/charges            → ChargesLibrary (browse symbols)
/heraldry/tinctures          → TincturesGuide (color reference)
```

---

## System Architecture

### New Database Table: `heraldry`

```javascript
{
  id: "unique-identifier",
  
  // === IDENTITY ===
  name: "string",                    // "Arms of House Wilfrey", "Personal Arms of Lord Aldric"
  description: "text",               // Free-form description
  blazon: "string | null",           // Formal heraldic description
  
  // === VISUAL DATA ===
  heraldrySVG: "string",             // Primary SVG (infinite zoom)
  heraldrySourceSVG: "string",       // Pre-mask version for reprocessing
  heraldryThumbnail: "base64",       // 40×40 PNG
  heraldryDisplay: "base64",         // 200×200 PNG
  heraldryHighRes: "base64",         // 400×400 PNG
  
  // === COMPOSITION ===
  shieldType: "heater | french | spanish | english | swiss",
  composition: {
    method: "simple | armoria | custom | composite",
    field: {
      division: "string",            // Division type
      tinctures: ["array"],          // Colors used
    },
    ordinaries: ["array"],           // Basic geometric charges
    charges: ["array"],              // Symbols/emblems
    augmentations: ["array"],        // Honors added later
    cadencyMark: "string | null",    // Birth order indicator
  },
  
  // === RELATIONSHIPS ===
  entityLinks: [{
    entityType: "house | person | location | event",
    entityId: "reference",
    linkType: "primary | quartered | impaled | banner | seal",
    since: "date | null",
    until: "date | null"
  }],
  
  // === LINEAGE ===
  parentHeraldryId: "reference | null",  // For derived arms
  derivationType: "cadency | marriage | grant | adoption | null",
  
  // === METADATA ===
  category: "noble | ecclesiastical | civic | guild | personal | fantasy",
  tags: ["array of strings"],
  isTemplate: "boolean",             // Can be used as starting point
  created: "timestamp",
  updated: "timestamp",
  codexEntryId: "reference | null"   // Link to Codex article
}
```

### New Database Table: `charges` (Symbols Library)

```javascript
{
  id: "unique-identifier",
  
  // === IDENTITY ===
  name: "string",                    // "Lion Rampant", "Dragon Passant"
  category: "beasts | birds | fish | mythical | plants | objects | geometric | fantasy",
  subcategory: "string",             // "predatory", "heraldic", "domestic", etc.
  
  // === VISUAL DATA ===
  svgContent: "string",              // The charge SVG
  svgThumbnail: "base64",            // Preview
  
  // === POSITIONING OPTIONS ===
  defaultAttitude: "string",         // "rampant", "passant", "displayed", etc.
  availableAttitudes: ["array"],     // All valid positions for this charge
  
  // === METADATA ===
  tags: ["array"],
  isBuiltIn: "boolean",              // Part of default library
  isCustom: "boolean",               // User-created
  source: "string | null",           // Attribution/license info
  created: "timestamp"
}
```

---

## Feature Breakdown by Phase

### Phase 1: Foundation (The Armory)
**Goal:** Establish the Heraldry System as a standalone major feature

#### 1A: Landing Page & Gallery
- **HeraldryLanding.jsx** - Grid gallery of all heraldic devices
- Filter by: entity type, category, tinctures, shield shape
- Search by: name, description, blazon
- Sort by: name, created date, entity
- Quick actions: view, edit, delete, duplicate
- "Create New" prominent call-to-action

#### 1B: Navigation Integration
- Add "Heraldry" to main Navigation component
- Add heraldry icon (🛡️) to match other systems
- Update App.jsx with new routes
- Active page highlighting

#### 1C: Database Migration
- Create `heraldry` table
- Migrate existing house heraldry data to new table
- Create entity links for existing house→heraldry relationships
- Preserve backward compatibility

---

### Phase 2: The Design Studio
**Goal:** Full-featured heraldry creation and editing

#### 2A: Enhanced Creator Interface
Replace the modal with a full-page design studio:

```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back]     ⚔️ Heraldry Studio     [Preview] [Save] [Export]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌───────────────────────────────────────┐  │
│  │             │    │                                       │  │
│  │   SHIELD    │    │         FIELD & DIVISIONS             │  │
│  │   PREVIEW   │    │                                       │  │
│  │   (Live)    │    │  Division: [Quarterly    ▼]           │  │
│  │             │    │                                       │  │
│  │    400×     │    │  Tincture 1: [Gules (Red)  ▼]         │  │
│  │             │    │  Tincture 2: [Argent (White) ▼]       │  │
│  │             │    │                                       │  │
│  └─────────────┘    │  ┌──────────────────────────────────┐ │  │
│                     │  │      VISUAL DIVISION PICKER      │ │  │
│  Shield Shape:      │  │  [Plain] [Paly] [Barry] [Pale]   │ │  │
│  [Heater ▼]         │  │  [Fess] [Chevron] [Quarterly]    │ │  │
│                     │  │  [Bend] [Saltire] [Cross]        │ │  │
│  ┌───────────────┐  │  └──────────────────────────────────┘ │  │
│  │ Quick Actions │  │                                       │  │
│  │ ─────────────│  └───────────────────────────────────────┘  │
│  │ 🎲 Randomize │                                              │
│  │ ♻️ Reset     │    ┌───────────────────────────────────────┐  │
│  │ 📋 Duplicate │    │           CHARGES                     │  │
│  └───────────────┘   │                                       │  │
│                      │  [+ Add Charge]                       │  │
│                      │                                       │  │
│                      │  Current: (none)                      │  │
│                      │                                       │  │
│                      └───────────────────────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📜 Blazon: "Quarterly gules and argent"                       │
│  (Auto-generated heraldic description)                         │
└─────────────────────────────────────────────────────────────────┘
```

#### 2B: Division System Expansion
Current: 7 divisions
Proposed: 20+ divisions organized by category

**Variations of the Field:**
- Plain (solid color)
- Party per pale (vertical split)
- Party per fess (horizontal split)
- Party per bend (diagonal split)
- Party per bend sinister (opposite diagonal)
- Party per chevron (chevron split)
- Party per saltire (X split)
- Quarterly (4 quarters)
- Gyronny (8 triangles)
- Paly (vertical stripes)
- Barry (horizontal stripes)
- Bendy (diagonal stripes)
- Chequy (checkerboard)
- Lozengy (diamond grid)
- Paly-bendy (complex grid)
- Barry-bendy (complex grid)
- Tierced in pale (3 vertical)
- Tierced in fess (3 horizontal)
- Tierced in pairle (Y-shaped)

Each division rendered as a visual button/tile for easy selection.

#### 2C: Tincture System Expansion
Current: 7 tinctures
Proposed: Full traditional set + fantasy extensions

**Metals (Light):**
- Or (Gold) `#FFD700`
- Argent (Silver/White) `#FFFFFF`

**Colours (Dark):**
- Gules (Red) `#DC143C`
- Azure (Blue) `#0047AB`
- Sable (Black) `#000000`
- Vert (Green) `#228B22`
- Purpure (Purple) `#9B30FF`

**Stains (Less Common):**
- Tenne (Orange-brown) `#CD853F`
- Sanguine (Blood red) `#8B0000`
- Murrey (Mulberry) `#8B008B`

**Furs (Patterns):**
- Ermine (white with black spots)
- Ermines (reverse ermine)
- Erminois (gold with black spots)
- Pean (black with gold spots)
- Vair (blue and white bell pattern)
- Counter-vair
- Potent (T-shaped pattern)

**Fantasy Extensions (🪝 Future):**
- Starfield (night sky pattern)
- Flames (animated fire pattern)
- Void (dark matter effect)
- Prismatic (rainbow/magical)
- Custom patterns via upload

#### 2D: Rule of Tincture Guidance
Historical heraldry follows the "rule of tincture": metal should not be placed on metal, nor color on color. The system can:

- **Warn** when rules are violated (soft guidance)
- Show a ⚠️ icon with explanation
- Offer "Fix" suggestions
- Allow override for fantasy worlds
- Toggle: "Enforce Historical Rules" checkbox

---

### Phase 3: The Charges Library
**Goal:** Browsable library of symbols and emblems

#### 3A: Built-in Charges Library
Organize charges by category with searchable interface:

**Beasts of the Field:**
- Lion (rampant, passant, statant, sejant, couchant, dormant)
- Wolf, Bear, Boar, Stag, Horse
- Dog, Hound, Talbot

**Birds:**
- Eagle (displayed, rising)
- Falcon, Hawk
- Swan, Pelican, Crane
- Raven, Crow, Owl

**Mythical Creatures:**
- Dragon (various attitudes)
- Griffin, Wyvern
- Phoenix, Unicorn
- Basilisk, Manticore

**Flora:**
- Rose, Lily, Thistle
- Oak tree, Oak leaves
- Wheat sheaves, Vines

**Objects:**
- Swords, Axes, Maces
- Crowns, Coronets
- Towers, Castles
- Ships, Anchors
- Keys, Chains
- Books, Scrolls

**Celestial:**
- Sun, Moon, Stars
- Crescents, Mullets (5-pointed stars)

**Ordinaries (Basic Geometry):**
- Chief, Base, Pale, Fess
- Bend, Bend sinister
- Chevron, Saltire, Cross
- Bordure, Orle, Tressure
- Canton, Quarter, Inescutcheon

#### 3B: Charge Picker Interface
```
┌────────────────────────────────────────────────────────┐
│  🔍 Search charges...                          [×]     │
├────────────────────────────────────────────────────────┤
│ [All] [Beasts] [Birds] [Mythical] [Flora] [Objects]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 🦁   │ │ 🐺   │ │ 🐻   │ │ 🦌   │ │ 🐗   │        │
│  │ Lion │ │ Wolf │ │ Bear │ │ Stag │ │ Boar │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│  │ 🦅   │ │ 🐉   │ │  🦄  │ │  ⚔️  │ │  👑  │        │
│  │Eagle │ │Dragon│ │Unicrn│ │Sword │ │Crown │        │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
│                                                        │
│  [...more charges...]                                  │
│                                                        │
├────────────────────────────────────────────────────────┤
│ Selected: Lion Rampant                                 │
│ Tincture: [Or (Gold) ▼]                               │
│ Position: [Center ▼]  Size: [●●●○○]                   │
│                                     [Add to Shield]    │
└────────────────────────────────────────────────────────┘
```

#### 3C: Charge Sources
1. **Built-in SVG Library** - Curated set of ~50-100 essential charges
2. **Armoria Integration** - Use Armoria's charge generation
3. **User Uploads** - Allow custom SVG uploads
4. **AI Generation** (🪝 Future) - Google Whisk/image AI integration

#### 3D: SVG Charge Sources
For built-in charges, we can source from:
- **Wikimedia Commons** - Public domain heraldic SVGs
- **heraldicart.org** - Creative Commons heraldic vectors (already used for shields!)
- **Custom Creation** - Commission/create essential charges

---

### Phase 4: Personal Arms & Cadency
**Goal:** Extend heraldry beyond houses to individuals

#### 4A: Personal Arms System
Allow individuals (not just houses) to have heraldry:
- Primary house arms with personal differences
- Completely custom personal arms
- Ecclesiastical arms (for religious figures)
- Civic arms (for mayors, officials)

#### 4B: Cadency Marks
Traditional marks indicating birth order:

| Position | English | French |
|----------|---------|--------|
| 1st Son | Label (3-point) | Lambel |
| 2nd Son | Crescent | Croissant |
| 3rd Son | Mullet (5-star) | Étoile |
| 4th Son | Martlet (bird) | Merlette |
| 5th Son | Annulet (ring) | Anille |
| 6th Son | Fleur-de-lis | Fleur-de-lis |
| 7th Son | Rose | Rose |
| 8th Son | Cross moline | Croix moline |
| 9th Son | Octofoil | Fleur double |

Auto-suggest cadency based on person's birth order in family!

#### 4C: Marriage Arms
When two houses marry, their arms can combine:
- **Impalement** - Side-by-side (already implemented)
- **Quartering** - 4 quarters (already implemented)
- **Escutcheon of Pretense** - Small shield overlay
- **En surtout** - Over-all overlay

Auto-suggest combinations based on relationships in the family tree!

---

### Phase 5: Integration & Cross-References
**Goal:** Connect heraldry to all other systems

#### 5A: House Integration
- When creating a house, option to "Create Heraldry" or "Select Existing"
- House sidebar shows heraldry thumbnail with link to full view
- House Codex entries auto-display heraldry
- Cadet houses can derive arms from parent (with difference marks)

#### 5B: Person Integration
- People can have personal arms (cadenced from house)
- Display on person cards in family tree
- Display in person detail sidebar
- Track arms changes over lifetime (inheritance, grants)

#### 5C: Location Integration (🪝 Future)
- Cities, castles, regions can have arms
- Location Codex entries display associated heraldry
- Map visualization with heraldic markers

#### 5D: Event Integration (🪝 Future)
- Battles display participating house arms
- Tournaments show heraldic banners
- Treaty documents show signatory arms

#### 5E: The Codex Integration
- Heraldry can have linked Codex entries (history, symbolism)
- Codex entries can embed heraldry images via wiki-links
- "Mysteria" entries can describe magical heraldry elements
- Cross-reference between blazon terms and Codex definitions

---

### Phase 6: Blazonry System
**Goal:** Generate formal heraldic descriptions

#### 6A: Auto-Generated Blazon
Based on the shield composition, generate proper heraldic language:

```
Input: Quarterly division, gules and argent, lion rampant or in first quarter

Output: "Quarterly gules and argent, in the first a lion rampant Or"
```

The blazon should:
- Follow traditional grammar (tinctures after charges)
- Use proper heraldic terms
- Be parseable back into a visual

#### 6B: Blazon Parser (🪝 Future)
Allow users to TYPE a blazon and have it rendered:
```
Input: "Azure, a chevron Or between three mullets Argent"
Output: [Visual shield with chevron and stars]
```

This is complex but powerful for users who know heraldic language.

---

### Phase 7: Advanced Features
**Goal:** Power-user and fantasy-specific enhancements

#### 7A: Heraldry History Tracking
- Track changes to arms over time
- Record grants of arms (with dates, grantors)
- Record augmentations of honor
- Visualize heraldry evolution timeline

#### 7B: Export & Import
- Export single heraldry as SVG, PNG, or JSON
- Export entire heraldry library
- Import from JSON backup
- Share templates between users

#### 7C: Heraldry Templates
- Mark certain designs as "templates"
- Templates appear in creation flow
- Copy-and-modify workflow for consistency

#### 7D: Fantasy Heraldry Extensions
For worldbuilding beyond historical accuracy:

- **Animated Elements** - Fire, water, magical effects
- **3D Preview** (🪝 Future) - See shield from angles
- **Banner Generator** - Long pennants, gonfalons
- **Seal Generator** - Circular seal format
- **Magical Properties** - Link to Mysteria, enchantments

---

## Technical Implementation Plan

### File Structure
```
/src
  /pages
    HeraldryLanding.jsx          # Gallery overview
    HeraldryLanding.css
    HeraldryCreator.jsx          # Full design studio
    HeraldryCreator.css
    HeraldryDetailView.jsx       # Single heraldry view
    HeraldryDetailView.css
    ChargesLibrary.jsx           # Browse charges
    ChargesLibrary.css
    TincturesGuide.jsx           # Color reference
    TincturesGuide.css
    
  /components
    /heraldry
      ShieldPreview.jsx          # Live SVG preview
      DivisionPicker.jsx         # Visual division selection
      TincturePicker.jsx         # Color selection with swatches
      ChargePicker.jsx           # Add charges modal
      ChargePositioner.jsx       # Drag-and-drop positioning
      CadencySelector.jsx        # Birth order marks
      BlazanDisplay.jsx          # Formatted blazon text
      HeraldryCard.jsx           # Gallery card component
      HeraldryFilters.jsx        # Filter/search controls
      EntityLinker.jsx           # Link to houses/people
      CompositionPanel.jsx       # Complex arms builder
      
  /utils
    heraldryUtils.js             # (existing, expand)
    simpleHeraldryGenerator.js   # (existing, expand)
    shieldSVGProcessor.js        # (existing)
    armoriaIntegration.js        # (existing)
    blazonGenerator.js           # NEW: Generate blazon text
    chargeProcessor.js           # NEW: Handle charge SVGs
    divisionRenderer.js          # NEW: Render divisions
    tinctureLibrary.js           # NEW: Tincture definitions
    cadencyMarks.js              # NEW: Birth order logic
    
  /data
    charges/                     # Built-in charge SVGs
      beasts/
      birds/
      mythical/
      objects/
      ordinaries/
    divisions.js                 # Division definitions
    tinctures.js                 # Tincture colors
    
  /contexts
    HeraldryContext.jsx          # Shared heraldry state
```

### Database Migrations

**Version 7:** Add heraldry system tables
```javascript
db.version(7).stores({
  // Existing tables...
  people: '++id, firstName, lastName, houseId, codexEntryId, heraldryId',
  houses: '++id, houseName, parentHouseId, houseType, codexEntryId, heraldryId',
  
  // New heraldry tables
  heraldry: '++id, name, category, *tags, created, updated',
  heraldryLinks: '++id, heraldryId, entityType, entityId, linkType',
  charges: '++id, name, category, subcategory, *tags, isBuiltIn'
});
```

---

## Development Phases Summary

| Phase | Focus | Key Deliverables | Sessions Est. |
|-------|-------|------------------|---------------|
| 1 | Foundation | Landing page, gallery, navigation, DB migration | 2-3 |
| 2 | Design Studio | Full creator, divisions, tinctures | 3-4 |
| 3 | Charges Library | Built-in charges, picker, positioning | 2-3 |
| 4 | Personal Arms | Individual heraldry, cadency, marriage | 2-3 |
| 5 | Integration | House/Person/Codex connections | 2-3 |
| 6 | Blazonry | Auto-generation, display | 1-2 |
| 7 | Advanced | Export, templates, fantasy features | 2-3 |

**Total Estimated: 14-21 development sessions**

---

## Priority Recommendation

If we want to deliver value incrementally, I recommend this order:

### Immediate (Phase 1)
Get heraldry visible as its own system - even if creation still uses the existing modal, having a gallery page establishes the presence.

### Short-term (Phase 2A-2C)
Expand the creation interface to a full page with more divisions and tinctures. This adds immediate creative power.

### Medium-term (Phase 3 + 5)
Charges library and integration with other systems. This is where heraldry becomes truly useful for worldbuilding.

### Long-term (Phase 4, 6, 7)
Personal arms, blazonry, and advanced features. These are enhancements for power users.

---

## Questions for Clarification

Before proceeding, a few questions to ensure alignment:

1. **Scope Priority:** Should we focus first on the standalone system (gallery, navigation) or on expanding creation capabilities?

2. **Charges Approach:** Would you prefer:
   - Start with Armoria's procedural charges (faster, less control)
   - Build a curated SVG library (more work, full control)
   - Both approaches available?

3. **Historical vs Fantasy:** How important is historical accuracy guidance? Should it be:
   - Always-on with warnings
   - Toggle-able
   - Completely optional/hidden

4. **Personal Arms Timing:** Should personal heraldry be an early feature or later enhancement?

5. **Existing Data:** Your current houses already have heraldry data. Should we:
   - Migrate to new table immediately
   - Keep backward compatibility for a transition period
   - Both approaches?

---

## Next Steps

Once you've reviewed this proposal and answered the clarification questions, I'll prepare:

1. **Detailed Phase 1 Implementation Guide** - Exact files, code structure, integration points
2. **Database Migration Script** - Safe upgrade path
3. **Component Architecture Diagram** - Visual overview of new components

Ready to build The Armory! 🛡️
