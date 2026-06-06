# Phase 5: Deep Integration Plan
## Heraldry System Integration with Tree & Codex

**Created:** January 2025  
**Status:** Planning  
**Estimated Effort:** 3-5 development sessions

---

## Overview

Phase 5 transforms the Heraldry System from a standalone tool into a fully integrated component that connects seamlessly with the Family Tree, The Codex, and the Data Management interfaces.

### Current State

**What exists:**
- `heraldryId` field on houses (database schema)
- `HeraldryThumbnail` component (displays house heraldry in QuickEditPanel)
- `HeraldryCreationModal` (basic modal, triggered from QuickEditPanel)
- `heraldryLinks` table (supports linking heraldry to houses/people/locations/events)
- Heraldry service with full CRUD + linking functions

**What's missing:**
- Bidirectional navigation (heraldry → house, house → heraldry)
- Heraldry display in House forms/listings
- Codex entry type for heraldry
- Family Tree visual heraldry (house legend, tooltips)
- "Create Heraldry" action from house context
- Wiki-links for heraldry in Codex content

---

## Batch 1: House ↔ Heraldry Bidirectional Linking

**Goal:** Strengthen the connection between houses and their heraldic devices.

### 1A: Enhanced HouseForm with Heraldry

**File:** `src/components/HouseForm.jsx`

Update the house creation/editing form to include heraldry management:

```
┌─────────────────────────────────────────────────┐
│ House Form                                      │
├─────────────────────────────────────────────────┤
│ House Name: [___________________]               │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ 🛡️ House Heraldry                          │ │
│ │ ┌──────┐                                   │ │
│ │ │      │  Arms of House Wilfrey            │ │
│ │ │ IMG  │  "Quarterly gules and argent..."  │ │
│ │ │      │                                   │ │
│ │ └──────┘  [View] [Edit] [Change] [Remove]  │ │
│ │                                            │ │
│ │ -- OR --                                   │ │
│ │                                            │ │
│ │ [+ Create New Heraldry]                    │ │
│ │ [🔗 Link Existing Heraldry]                │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ Motto: [___________________]                    │
│ Founded: [____]                                 │
│ Color: [🎨]                                     │
└─────────────────────────────────────────────────┘
```

**Changes:**
- Add heraldry section to form
- Show current linked heraldry with thumbnail
- "Create New" button → opens HeraldryCreator with house pre-selected
- "Link Existing" button → opens heraldry picker modal
- "View" button → navigates to `/heraldry/edit/:id`
- "Remove" button → unlinks heraldry (doesn't delete)

### 1B: HeraldryPicker Modal Component

**New File:** `src/components/heraldry/HeraldryPickerModal.jsx`

A reusable modal for selecting existing heraldry to link:

```
┌─────────────────────────────────────────────────┐
│ Select Heraldry                            [X]  │
├─────────────────────────────────────────────────┤
│ Search: [_________________________]             │
│                                                 │
│ Filter: [All ▼] [Noble ▼]                       │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ [🛡️] Arms of House Targaryen                │ │
│ │      "Sable, a dragon gules"                │ │
│ ├─────────────────────────────────────────────┤ │
│ │ [🛡️] Arms of House Baratheon    ✓ Selected │ │
│ │      "Or, a stag sable"                     │ │
│ ├─────────────────────────────────────────────┤ │
│ │ [🛡️] Arms of House Lannister               │ │
│ │      "Gules, a lion or"                     │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│              [Cancel]  [Link Selected]          │
└─────────────────────────────────────────────────┘
```

**Features:**
- Search by name, blazon, tags
- Filter by category
- Shows linked status (which houses already use this)
- Preview on hover/click

### 1C: Update HeraldryLanding with House Links

**File:** `src/pages/HeraldryLanding.jsx`

Enhance the gallery to show linked houses:

```
┌─────────────────────────────────────────────────┐
│ [🛡️ Arms Image]                                │
│ Arms of House Wilfrey                          │
│ "Quarterly gules and argent..."                │
│                                                 │
│ 🏰 Linked to: House Wilfrey                    │
│              [View House →]                     │
│                                                 │
│ [Edit] [Duplicate] [Delete]                    │
└─────────────────────────────────────────────────┘
```

**Changes:**
- Show linked house name with link to ManageData
- Show "Unlinked" badge if not associated
- Add "Link to House" action for unlinked heraldry

### 1D: Update HeraldryCreator with House Context

**File:** `src/pages/HeraldryCreator.jsx`

When creating heraldry from a house context:

**Changes:**
- Accept `?houseId=X` query parameter
- Pre-select the house in linking dropdown
- Auto-name as "Arms of [House Name]"
- On save, automatically link to the house
- "Back" button returns to house edit context

---

## Batch 2: Codex Integration

**Goal:** Create Codex entries for heraldry and enable wiki-links.

### 2A: Heraldry Codex Entry Type

**File:** `src/services/codexService.js`

Add support for heraldry entries in the Codex:

**New entry type:** `heraldry`

```javascript
{
  type: 'heraldry',
  title: 'Arms of House Wilfrey',
  content: 'The arms of House Wilfrey...',
  
  // Special fields for heraldry entries
  heraldryId: 123,  // Link to heraldry table
  blazon: 'Quarterly gules and argent, a lion rampant Or'
}
```

### 2B: Auto-Create Codex Entry for Heraldry

**File:** `src/services/heraldryService.js`

When heraldry is created, optionally create a Codex entry:

```javascript
async function createHeraldryWithCodexEntry(heraldryData, createCodexEntry = true) {
  const heraldryId = await createHeraldry(heraldryData);
  
  if (createCodexEntry) {
    const codexId = await codexService.createEntry({
      type: 'heraldry',
      title: heraldryData.name,
      content: generateHeraldryDescription(heraldryData),
      tags: heraldryData.tags || [],
      heraldryId: heraldryId
    });
    
    await updateHeraldry(heraldryId, { codexEntryId: codexId });
  }
  
  return heraldryId;
}
```

### 2C: Heraldry Display in CodexEntryView

**File:** `src/pages/CodexEntryView.jsx`

When viewing a heraldry Codex entry, show the actual arms:

```
┌─────────────────────────────────────────────────┐
│ 🛡️ Arms of House Wilfrey                       │
│                                                 │
│ ┌──────────┐                                   │
│ │          │  Blazon: Quarterly gules and      │
│ │   ARM    │  argent, a lion rampant Or        │
│ │  IMAGE   │                                   │
│ │  200x200 │  [View in Armory →]               │
│ └──────────┘                                   │
│                                                 │
│ ═══════════════════════════════════════════════ │
│                                                 │
│ The arms of House Wilfrey date back to...      │
│                                                 │
│ This heraldic device features a [[lion]]       │
│ rampant, symbolizing courage and strength.     │
│ The [[quarterly]] division represents the      │
│ union of two great houses.                     │
└─────────────────────────────────────────────────┘
```

### 2D: Wiki-Links for Heraldry Terms

**File:** `src/utils/wikiLinkParser.js`

Support heraldry-specific wiki-links:

- `[[heraldry:Arms of House Wilfrey]]` → links to heraldry Codex entry
- `[[blazon:quarterly]]` → links to blazon term definition (future)
- `[[tincture:gules]]` → links to tincture explanation (future)

### 2E: House Codex Entries Show Heraldry

**File:** `src/pages/CodexEntryView.jsx`

When viewing a house's Codex entry, show their heraldry:

```
┌─────────────────────────────────────────────────┐
│ 🏰 House Wilfrey                               │
│                                                 │
│ ┌──────┐                                       │
│ │ 🛡️  │  House Wilfrey is a noble house...    │
│ └──────┘                                       │
│                                                 │
│ Founded: 1120                                  │
│ Seat: Wilfrey Keep                             │
│ Heraldry: [[heraldry:Arms of House Wilfrey]]  │
└─────────────────────────────────────────────────┘
```

---

## Batch 3: Family Tree Integration

**Goal:** Display heraldry visually in the Family Tree.

### 3A: House Legend Panel

**File:** `src/pages/FamilyTree.jsx` + **New:** `src/components/HouseLegend.jsx`

A collapsible panel showing all houses with their heraldry:

```
┌─────────────────────────────┐
│ 🏰 Houses                [−]│
├─────────────────────────────┤
│ [🛡️] House Wilfrey          │
│ [🛡️] House Targaryen        │
│ [🛡️] House Baratheon        │
│ [⬜] House Stark (no arms)   │
└─────────────────────────────┘
```

**Features:**
- Shows all houses with heraldry thumbnails
- Click to filter tree to that house
- Hover shows full heraldry preview
- Click thumbnail → opens heraldry detail

### 3B: Person Card Heraldry Indicator

**File:** `src/pages/FamilyTree.jsx` (person card rendering)

Show house heraldry on person cards in the tree:

**Option A: Small badge in corner**
```
┌─────────────────────────────┐
│ [🛡️] John Wilfrey           │
│ b. 1245 - d. 1302           │
│ House Wilfrey               │
└─────────────────────────────┘
```

**Option B: Background watermark**
```
┌─────────────────────────────┐
│      John Wilfrey           │
│   b. 1245 - d. 1302         │
│     House Wilfrey           │
│        [🛡️ faint bg]        │
└─────────────────────────────┘
```

### 3C: Heraldry Tooltip on Hover

**File:** `src/pages/FamilyTree.jsx`

When hovering over a person card, show expanded heraldry info:

```
┌───────────────────────────────────────────────┐
│ John Wilfrey                                  │
│                                               │
│ ┌──────┐  House Wilfrey                       │
│ │ 🛡️  │  "Quarterly gules and argent..."    │
│ └──────┘                                      │
│                                               │
│ Born: 1245 • Died: 1302                       │
│ Status: Legitimate                            │
└───────────────────────────────────────────────┘
```

### 3D: Tree Controls Heraldry Toggle

**File:** `src/components/TreeControls.jsx`

Add a toggle to show/hide heraldry in the tree:

```
┌─────────────────────────────┐
│ Tree Controls               │
├─────────────────────────────┤
│ Layout: [Vertical ▼]        │
│ Spacing: [──●──────]        │
│                             │
│ ☑ Show heraldry badges      │
│ ☐ Show heraldry background  │
└─────────────────────────────┘
```

---

## Batch 4: ManageData Integration

**Goal:** Make heraldry management accessible from data management.

### 4A: House List with Heraldry

**File:** `src/components/HouseList.jsx`

Show heraldry thumbnails in house listings:

```
┌─────────────────────────────────────────────────┐
│ Houses                            [+ New House] │
├─────────────────────────────────────────────────┤
│ [🛡️] House Wilfrey              [Edit] [Delete] │
│      Founded 1120 • 12 members                  │
├─────────────────────────────────────────────────┤
│ [⬜] House Targaryen             [Edit] [Delete] │
│      Founded 1015 • 8 members   [+ Add Heraldry]│
└─────────────────────────────────────────────────┘
```

### 4B: Quick Heraldry Actions

**File:** `src/pages/ManageData.jsx`

Add quick actions for heraldry:

- "Add Heraldry" button on houses without arms
- "View Heraldry" button on houses with arms
- Batch action: "Create heraldry for all houses"

### 4C: Data Health Dashboard Updates

**File:** `src/components/DataHealthDashboard.jsx`

Add heraldry coverage statistics:

```
┌─────────────────────────────────────────────────┐
│ 📊 Data Health                                  │
├─────────────────────────────────────────────────┤
│ Houses: 12 total                               │
│ - With heraldry: 8 (67%)                       │
│ - Without heraldry: 4                          │
│                                                 │
│ Heraldry: 10 total                             │
│ - Linked to houses: 8                          │
│ - Unlinked: 2                                  │
└─────────────────────────────────────────────────┘
```

---

## Implementation Order

### Recommended Sequence

**Session 1: Batch 1A-1B** (House Form + Picker Modal)
- Core bidirectional linking foundation
- Enables creating/linking heraldry from house context

**Session 2: Batch 1C-1D** (Landing + Creator updates)
- Complete the house ↔ heraldry connection
- Navigation flows both directions

**Session 3: Batch 3A-3B** (Tree Legend + Card badges)
- Visual heraldry in the Family Tree
- Most user-visible improvement

**Session 4: Batch 2A-2C** (Codex entry type + display)
- Heraldry entries in the encyclopedia
- Auto-creation of Codex entries

**Session 5: Batch 4A-4C** (ManageData + Dashboard)
- Polish and completeness
- Statistics and quick actions

---

## Technical Notes

### Database Considerations

The `heraldryId` foreign key already exists on houses. The `heraldryLinks` table supports multiple link types:

```javascript
{
  heraldryId: 1,
  entityType: 'house',  // or 'person', 'location', 'event'
  entityId: 5,
  linkType: 'primary'   // or 'quartered', 'impaled', 'banner', 'seal'
}
```

This means a house can have:
- Primary arms (main heraldry)
- Additional arms (for historical versions, banner variants, etc.)

### Component Reuse

**HeraldryThumbnail** - Already exists, works well
**HeraldryPickerModal** - New, reusable for any entity linking
**HouseLegend** - New, specific to FamilyTree

### Navigation Patterns

```
/heraldry              → View all heraldry
/heraldry/create       → Create new (standalone)
/heraldry/create?houseId=5 → Create new for specific house
/heraldry/edit/1       → Edit existing
/manage                → House list with heraldry
/tree                  → Tree with heraldry badges
/codex/entry/X         → Codex view with heraldry display
```

---

## Questions to Resolve

1. **Person heraldry?** Should individuals be able to have their own arms (separate from house)? This is Phase 4 territory but affects our design decisions now.

2. **Multiple arms per house?** Should we support houses having multiple heraldic devices (historical, ceremonial, different branches)?

3. **Tree display preference?** Badge in corner vs background watermark vs both as options?

4. **Auto-create Codex entries?** When creating heraldry, should we always create a Codex entry, or make it optional?

---

## Success Criteria

After Phase 5 completion:

- ✅ Can create heraldry directly from house editing
- ✅ Can link existing heraldry to houses
- ✅ Heraldry landing shows linked houses
- ✅ Family Tree shows house heraldry badges
- ✅ Codex entries for heraldry type
- ✅ House Codex entries display their heraldry
- ✅ Data Health shows heraldry coverage
- ✅ Bidirectional navigation works throughout

---

*This plan serves as the roadmap for Phase 5 development. Implementation should follow the batch sequence for optimal incremental progress.*
