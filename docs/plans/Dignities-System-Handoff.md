# Dignities System Handoff Document

**Date:** January 12, 2026  
**Status:** Core System Complete, Minor Integration Remaining  
**Priority:** Low - System is functional, remaining work is polish

---

## Executive Summary

The Titles & Dignities system (Lineageweaver's fifth major system) is **fully functional** with:
- Complete database schema and service layer
- Full UI pages (landing, form, view)
- Cloud sync infrastructure in place
- Navigation and routing integrated

**Remaining work is minor:**
1. Wire up userId to UI service calls (15-30 min)
2. Add tenure management UI (optional, 2-3 hours)

---

## System Architecture

### Database Tables (v8+)

```javascript
// dignities - The titles/offices themselves
dignities: '++id, name, dignityClass, dignityRank, currentHolderId, currentHouseId, swornToId'

// dignityTenures - Historical record of who held what, when
dignityTenures: '++id, dignityId, personId, dateStarted, dateEnded'

// dignityLinks - Junction table for entity relationships
dignityLinks: '++id, dignityId, entityType, entityId'
```

### File Structure

```
/src
  /services
    dignityService.js       ✅ Full CRUD + cloud sync integration
    
  /pages
    DignitiesLanding.jsx    ✅ Gallery with grid/hierarchy views
    DignitiesLanding.css    ✅ Styled
    DignityForm.jsx         ✅ Create/edit form
    DignityForm.css         ✅ Styled
    DignityView.jsx         ✅ Detail view with tenure history
    DignityView.css         ✅ Styled
```

### Routes (in App.jsx)

```javascript
/dignities              → DignitiesLanding (gallery)
/dignities/create       → DignityForm (new)
/dignities/edit/:id     → DignityForm (edit)
/dignities/view/:id     → DignityView (read)
```

### Navigation

"Titles & Dignities" link added to Navigation.jsx, appears between "Heraldry" and "Manage".

---

## The Charter Reference System

The dignities system is based on "The Codified Charter of Driht, Ward, and Service" - a fictional legal document defining the feudal structure of Estargenn.

### Dignity Classes (Article I-III)

| Class | Icon | Description |
|-------|------|-------------|
| `driht` | 👑 | Lordship by right - inherited authority |
| `ward` | 🏰 | Custodial trust - delegated authority |
| `sir` | ⚔️ | Knightly honour - personal, not inherited |
| `crown` | ♛ | Sovereign authority |
| `other` | 📜 | Non-Charter dignities |

### Dignity Ranks

**Driht Ranks:**
- Drihten (paramount lord)
- Drithen (great lord)
- Drith (full lord)
- Drithling (cadet lord)
- Drithman (lord-in-service)

**Ward Ranks:**
- Wardyn (senior custodian)
- Landward (custodial landholder)
- Holdward (minor estate)
- Marchward (borderlands)

**Sir Rank:**
- Sir (knightly honour)

**Crown Ranks:**
- Sovereign, Heir, Prince

### Tenure Types (Article IV)

| Type | Styling | Meaning |
|------|---------|---------|
| `of` | "Lord of [Place]" | Lawful holding |
| `in` | "Lord in [Place]" | Residence without rule |
| `at` | "Lord at [Place]" | Seat only |
| `of-house` | "of the House of" | Blood descent |
| `of-name` | "of the Name of" | Cadet line |
| `in-fee` | "in Fee of" | Bound in service |
| `in-wardship` | "in Wardship under" | Held in trust |

### Fealty Types (Article V)

- `sworn-to` - Direct oath of fealty
- `liege-to` - Primary lord relationship
- `under-banner` - Military allegiance

---

## What's Complete ✅

### 1. dignityService.js

**CRUD Operations:**
- `createDignity(data, userId)` - Create with optional cloud sync
- `getDignity(id)` - Get single record
- `getAllDignities()` - Get all records
- `updateDignity(id, updates, userId)` - Update with optional cloud sync
- `deleteDignity(id, userId)` - Delete with cascade to tenures/links

**Tenure Operations:**
- `createDignityTenure(data, userId)`
- `getTenuresForDignity(dignityId)`
- `getTenuresForPerson(personId)`
- `getCurrentTenure(dignityId)`
- `updateDignityTenure(id, updates, userId)`
- `deleteDignityTenure(id, userId)`

**Link Operations:**
- `linkDignityToEntity(data, userId)`
- `getDignityLinks(dignityId)`
- `getDignitiesForEntity(entityType, entityId)`
- `unlinkDignity(linkId, userId)`

**Query Helpers:**
- `getDignitiesByClass(class)`
- `getDignitiesByRank(rank)`
- `getDignitiesForHouse(houseId)`
- `getDignitiesForPerson(personId)`
- `getSubordinateDignities(dignityId)`
- `getFeudalChain(dignityId)` - Returns chain up to Crown
- `searchDignities(term)`
- `getDignityStatistics()`

**Helper Functions:**
- `formatDignityTitle(dignity, holderName)`
- `getDignityIcon(dignity)`
- `getRankInfo(class, rank)`

### 2. Cloud Sync (firestoreService.js + dataSyncService.js)

All cloud operations implemented:
- `addDignityCloud`, `updateDignityCloud`, `deleteDignityCloud`
- `addDignityTenureCloud`, `updateDignityTenureCloud`, `deleteDignityTenureCloud`
- `addDignityLinkCloud`, `deleteDignityLinkCloud`
- `syncAllToCloud` includes dignities
- `downloadAllFromCloud` includes dignities
- `forceCloudSync` restores dignities

### 3. UI Pages

**DignitiesLanding.jsx:**
- Statistics bar (total, by class, vacant)
- Search by name, place, holder, house
- Filter by class and rank
- Sort by name, rank, house, created date
- Grid view with cards
- Hierarchy view showing feudal relationships
- Empty state with guidance
- Charter reference section (Seven Articles)

**DignityForm.jsx:**
- Full create/edit form
- Classification section (class, rank, hereditary, vacant)
- Identity section (tenure type, place, name generator)
- Feudal hierarchy section (sworn to, fealty type)
- Current holder section with smart filtering
- Display options (icon, priority)
- Notes section
- Validation and error handling

**DignityView.jsx:**
- Full detail display
- Current holder with house color
- Feudal chain visualization
- Subordinate dignities list
- Tenure history timeline
- Edit/delete actions

---

## What Needs Doing ⚠️

### Priority 1: Wire Up Cloud Sync in UI (15-30 minutes)

The service functions accept optional `userId` for cloud sync, but the UI components don't pass it yet.

**DignityForm.jsx** - Add auth and pass userId:

```javascript
// Add import at top
import { useAuth } from '../contexts/AuthContext';

// Inside component, add:
const { user } = useAuth();

// Update handleSubmit (around line 380):
if (isEditMode) {
  await updateDignity(parseInt(id), dignityData, user?.uid);  // Add user?.uid
  navigate(`/dignities/view/${id}`);
} else {
  const newId = await createDignity(dignityData, user?.uid);  // Add user?.uid
  navigate(`/dignities/view/${newId}`);
}
```

**DignitiesLanding.jsx** - Add auth and pass userId to delete:

```javascript
// Add import at top
import { useAuth } from '../contexts/AuthContext';

// Inside component, add:
const { user } = useAuth();

// Update handleDeleteDignity (around line 180):
await deleteDignity(id, user?.uid);  // Add user?.uid
```

**DignityView.jsx** - Same pattern if delete is used there.

### Priority 2: Tenure Management UI (Optional, 2-3 hours)

Currently, tenure history is **read-only**. To fully use the tenure system:

**Option A: Add to DignityForm**
- Add "Tenure History" section at bottom
- "Record New Tenure" button opens inline form
- "End Current Tenure" button with end type selection

**Option B: Separate TenureForm**
- New page at `/dignities/:id/tenure/create`
- Full form for tenure details (dates, acquisition type, etc.)

**Tenure Form Fields Needed:**
- `personId` - Who held/holds it (dropdown)
- `dateStarted` - When they acquired it
- `dateEnded` - When they lost it (null if current)
- `acquisitionType` - inheritance, grant, conquest, etc.
- `endType` - death, abdication, forfeiture, etc.
- `grantedById` - Who granted it (optional)
- `notes`

**Workflow Example:**
1. Lord dies → User clicks "End Tenure" on DignityView
2. Select end type: "Death"
3. Enter date ended
4. Optionally "Transfer to Heir" → Opens form pre-filled with heir

### Priority 3: QuickEditPanel Integration (Future Enhancement)

Show person's dignities in the sidebar:
- List of current dignities held
- "View" link to DignityView
- "Create Dignity" link pre-filled with person

### Priority 4: Family Tree Display (Future Enhancement)

Show dignity icons on person cards:
- Small icon in corner of card (👑, ⚔️, 🏰)
- Tooltip with title names
- Could use `getDignitiesForPerson()` but need async handling

---

## Testing Checklist

### Core Functionality
- [ ] Create a new dignity with all fields
- [ ] Edit an existing dignity
- [ ] Delete a dignity (verify cascade deletes tenures/links)
- [ ] Search by name, place, holder
- [ ] Filter by class and rank
- [ ] Switch between grid and hierarchy views

### Cloud Sync (after Priority 1 fix)
- [ ] Create dignity while signed in → appears in Firestore
- [ ] Edit dignity → updates in Firestore
- [ ] Delete dignity → removed from Firestore
- [ ] Sign out, sign in on new device → dignities download

### Hierarchy
- [ ] Create dignity sworn to another → appears in hierarchy view
- [ ] View feudal chain on DignityView
- [ ] Subordinates list shows correct dignities

---

## Reference: Service Function Signatures

```javascript
// Dignities
createDignity(dignityData, userId = null) → Promise<number>
getDignity(id) → Promise<Object|undefined>
getAllDignities() → Promise<Array>
updateDignity(id, updates, userId = null) → Promise<number>
deleteDignity(id, userId = null) → Promise<void>

// Tenures
createDignityTenure(tenureData, userId = null) → Promise<number>
getTenuresForDignity(dignityId) → Promise<Array>
getTenuresForPerson(personId) → Promise<Array>
getCurrentTenure(dignityId) → Promise<Object|null>
updateDignityTenure(id, updates, userId = null) → Promise<number>
deleteDignityTenure(id, userId = null) → Promise<void>

// Links
linkDignityToEntity(linkData, userId = null) → Promise<number>
getDignityLinks(dignityId) → Promise<Array>
getDignitiesForEntity(entityType, entityId) → Promise<Array>
unlinkDignity(linkId, userId = null) → Promise<void>
```

---

## Files Modified in This Session

1. `/src/services/firestoreService.js` - Added ~190 lines for dignities cloud ops
2. `/src/services/dataSyncService.js` - Added ~110 lines for sync wrappers
3. `/src/services/dignityService.js` - Added userId params to 8 functions

---

## Conclusion

The Dignities system is **production-ready** for basic use. Users can:
- Create, view, edit, delete dignities
- Build feudal hierarchies
- Track which houses/people hold which titles
- See the relationship between titles

The remaining work (cloud sync wiring, tenure UI) is polish that can be done incrementally. The system is fully usable without these enhancements.
