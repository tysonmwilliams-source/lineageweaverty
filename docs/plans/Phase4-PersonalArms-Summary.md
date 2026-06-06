# Phase 4: Personal Arms & Cadency - Implementation Summary

**Date:** January 12, 2026  
**Status:** Core Implementation Complete (4A-4E), Tree Display Deferred (4F)

---

## Overview

Phase 4 adds personal heraldry for individuals, building on the house heraldry system (The Armory). Personal arms are "differenced" versions of house arms with cadency marks to distinguish between family members.

### Lineageweaver's Cadency System

Rather than traditional cadency marks (labels, crescents, mullets, etc.), Lineageweaver uses a simplified triangle-based system:

- **Small black triangles** in the chief (top) of the shield
- **Number of triangles = birth position** among legitimate sons
- 1st son = 1 triangle, 2nd son = 2 triangles, etc.

### Eligibility Rules

Personal arms with cadency are limited to:
- **Male** individuals only (traditional rule)
- **Legitimate** status only (bastards and adopted excluded)
- Must have **recorded parents** (for birth order calculation)

---

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| `src/utils/birthOrderUtils.js` | Birth order calculation among legitimate male siblings |
| `src/utils/personalArmsRenderer.js` | SVG rendering with cadency triangle overlays |
| `src/components/PersonalArmsSection.jsx` | QuickEditPanel section for personal arms |

### Modified Files

| File | Changes |
|------|---------|
| `src/services/database.js` | Version 10 migration adds `heraldryId` to people table |
| `src/services/heraldryService.js` | Added `getPersonalArms`, `hasPersonalArms`, `createPersonalArmsFromHouse`, `getPeopleWithPersonalArms` |
| `src/components/QuickEditPanel.jsx` | Integrated PersonalArmsSection component |

---

## Component Architecture

### PersonalArmsSection.jsx

This component displays in the QuickEditPanel sidebar and shows:

1. **For people WITH personal arms:**
   - Shield preview with cadency marks
   - Arms name and blazon
   - Birth order label
   - Edit button → HeraldryCreator

2. **For ELIGIBLE people WITHOUT personal arms:**
   - Eligibility status (green badge)
   - Birth order info (e.g., "2nd Son among 4 legitimate sons")
   - Preview showing house arms + cadency overlay
   - "Create Personal Arms" button

3. **For INELIGIBLE people:**
   - Gray badge explaining why (female, bastard, adopted, etc.)
   - Link to view house arms (if exists)

### Birth Order Calculation

The `calculateBirthOrder` function:
1. Checks eligibility (male, legitimate)
2. Finds parents via relationships
3. Gets all children of those parents
4. Filters to legitimate males only
5. Sorts by birth date
6. Returns position (1st, 2nd, etc.)

### Cadency Rendering

The `addCadencyToSVG` function:
1. Parses base SVG viewBox
2. Generates triangle paths based on birth position
3. Inserts cadency group before closing `</svg>` tag
4. Returns modified SVG with data attribute

---

## Usage Flow

### Creating Personal Arms

1. User clicks person in family tree → QuickEditPanel opens
2. PersonalArmsSection shows eligibility status
3. If eligible, preview shows house arms + cadency triangles
4. User clicks "Create Personal Arms"
5. Navigates to HeraldryCreator with query params:
   - `personId` - links arms to person
   - `deriveFrom` - house heraldry ID to base on
   - `birthPosition` - for cadency mark count
6. HeraldryCreator creates new heraldry with cadency
7. Links via heraldryService to person

### Viewing Personal Arms

1. Personal arms display in QuickEditPanel when person has them
2. Click to navigate to HeraldryCreator in edit mode
3. Can view house arms separately via link

---

## Database Schema (v10)

```javascript
// people table now includes:
people: '++id, firstName, lastName, houseId, dateOfBirth, dateOfDeath, 
         bastardStatus, codexEntryId, heraldryId'  // <-- new field

// heraldry table for personal arms:
{
  id: number,
  name: "Arms of Wenton Wilfrey",
  category: "personal",
  parentHeraldryId: 5,          // House heraldry ID
  derivationType: "cadency",
  composition: {
    // base composition from house...
    cadency: {
      type: "triangles",
      count: 1,
      position: "chief",
      tincture: "sable"
    }
  },
  metadata: {
    personId: 12,
    birthPosition: 1,
    derivedFrom: "Arms of House Wilfrey"
  }
}
```

---

## Deferred Work

### Phase 4F: D3 Tree Personal Arms Display

Showing personal arms on the family tree visualization was deferred due to complexity:

1. **Async Data Loading:** D3 renders synchronously, but fetching heraldry is async
2. **Performance:** Loading heraldry for all visible people could be expensive
3. **Visual Space:** Person cards are compact (150x70px)

**Potential Approaches:**
- Pre-load heraldry data in context
- Add small shield icon/indicator instead of full arms
- Load on demand when zoomed in
- Add "Arms View" toggle that shows shields instead of name cards

This is marked as a future enhancement after core Phase 4 is stable.

---

## Testing Checklist

- [ ] Legitimate male with 2+ legitimate brothers shows correct position
- [ ] 1st son shows 1 triangle, 2nd shows 2, etc.
- [ ] Female shows "not eligible" message
- [ ] Bastard shows "not eligible" message  
- [ ] Person with no parents shows appropriate message
- [ ] Creating personal arms links to person correctly
- [ ] Editing personal arms preserves cadency
- [ ] Preview updates when birth order data changes
- [ ] House without heraldry shows "create house heraldry first"

---

## Extension Points

### 🪝 Additional Cadency Marks

The current triangle system could be extended with:
- Traditional marks (label, crescent, mullet, etc.)
- Custom marks for fantasy settings
- Different positions (not just chief)

### 🪝 Marriage Arms

Phase 5 could add:
- Impaled arms (husband + wife side by side)
- Quartered arms (combining multiple lineages)
- Arms for widows/widowers

### 🪝 Illegitimate Arms

Could allow bastards to have arms with:
- Bend sinister (diagonal stripe)
- Bordure (border)
- Custom bastard marks per house

---

## Version History

- **v4.0** - Initial Phase 4 implementation
  - birthOrderUtils.js created
  - personalArmsRenderer.js created
  - PersonalArmsSection.jsx created
  - QuickEditPanel integration complete
  - Database v10 migration applied
