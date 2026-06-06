# Dynamic Generations System - Integration Guide

**Date:** January 2026  
**Version:** 2.0 - Dynamic Unlimited Generations  
**Backup Location:** `/Users/tywilliams/Desktop/lineageweaver/src/pages/FamilyTree.jsx.BACKUP_BEFORE_DYNAMIC_GENERATIONS`

---

## What Changed

### Core Architecture
- **REMOVED:** Hardcoded Gen 0, Gen 1, Gen 2, Gen 3 sections
- **ADDED:** Dynamic generation detection algorithm (`detectGenerations()`)
- **ADDED:** Flexible group building system (`buildGroupsForGeneration()`)
- **ADDED:** Unlimited generation support (1 to 100+)

### What Was Preserved
✅ All visual styling rules (card colors, borders, themes)  
✅ Child line offset system (legitimate, bastard, adopted)  
✅ Marriage line styling and positioning  
✅ Special case handling (Lochlann ID:18 yOffset)  
✅ Position Map and Marriage Centers tracking  
✅ Search highlighting functionality  
✅ Relationship calculator integration  
✅ Zoom and pan behavior  
✅ Theme system (Royal Parchment / Light Manuscript)

---

## New Functions

### `detectGenerations(peopleById, parentMap, childrenMap, spouseMap)`
**Purpose:** Automatically detects all generations in the tree  
**Returns:** Array of arrays, where each sub-array contains person IDs for that generation

**How it works:**
1. Finds oldest person with no parents who has a spouse
2. Sets them + their spouse as Generation 0
3. Recursively finds all children of each generation
4. Continues until no more descendants exist

**Example output:**
```javascript
[
  [1, 2],           // Gen 0: Root couple
  [3, 4, 5, 6],     // Gen 1: Their children
  [7, 8, 9, 10, 11], // Gen 2: Grandchildren
  [12, 13, 14]      // Gen 3: Great-grandchildren
]
```

### `buildGroupsForGeneration(genIds, peopleById, parentMap, childrenMap, spouseMap, prevGenIds)`
**Purpose:** Groups people by their parent couples  
**Returns:** Array of group objects with structure:
```javascript
{
  key: "18-19" or "18",     // Couple key or single parent ID
  parentId: 18,              // Primary parent
  spouseId: 19,              // Spouse (or null)
  children: [Person, ...]    // Array of child person objects
}
```

**Special handling:**
- Root generation (prevGenIds empty): Returns each person as individual group
- Subsequent generations: Groups by parent couple
- Merges spouse's children into same group
- Sorts children by birth date

---

## Integration Steps

### Step 1: Backup Verification
Confirm backup exists:
```bash
ls -la /Users/tywilliams/Desktop/lineageweaver/src/pages/FamilyTree.jsx.BACKUP_BEFORE_DYNAMIC_GENERATIONS
```

Should show file dated today with ~500+ lines.

### Step 2: File Replacement
Replace your current FamilyTree.jsx:

```bash
# Navigate to project directory
cd /Users/tywilliams/Desktop/lineageweaver

# Copy new version
cp [path_to_new_file] src/pages/FamilyTree.jsx
```

### Step 3: Test Launch
Start your development server:
```bash
npm run dev
```

Navigate to the Family Tree page.

### Step 4: Console Check
Open browser DevTools (F12) → Console tab.

Look for this log message:
```
Found X generations
```

This confirms the detection algorithm is working.

---

## Testing Checklist

### ✅ Core Functionality Tests

#### Test 1: Tree Loads
- [ ] Tree displays without errors
- [ ] Console shows "Found X generations" message
- [ ] Number of generations matches your data

#### Test 2: Visual Elements
- [ ] All person cards render correctly
- [ ] Names, dates, maiden names display properly
- [ ] House colors show correctly (harmonized with theme)
- [ ] Border colors match legitimacy status
  - Green = Legitimate
  - Orange = Bastard  
  - Blue = Adopted

#### Test 3: Relationship Lines
- [ ] Marriage lines connect couples horizontally
- [ ] Child lines connect generations vertically
- [ ] Legitimate children have green lines
- [ ] Bastard children have orange lines (with -5 offset)
- [ ] Adopted children have blue lines (with +5 offset)
- [ ] Mixed legitimacy groups show proper line separation

#### Test 4: Special Cases
- [ ] Lochlann (Person ID 18) child lines have correct offset
- [ ] Unmarried parents with bastards display correctly
- [ ] People with multiple spouses handled properly

#### Test 5: Interactive Features
- [ ] Click on person → Quick Edit Panel opens
- [ ] Search person → Yellow highlight appears
- [ ] Enable "Show Relationships" → Badges appear on cards
- [ ] Zoom in/out works smoothly
- [ ] Pan across tree works
- [ ] Reset view button centers tree

#### Test 6: Theme Switching
- [ ] Switch to Light Manuscript theme → Colors adjust
- [ ] Switch to Royal Parchment theme → Colors adjust
- [ ] All text remains readable in both themes

---

## Known Behaviors & Expectations

### Generation Counting
The system counts generations starting from the oldest married couple (root):
- **Gen 0:** Oldest couple with no parents
- **Gen 1:** Their children
- **Gen 2:** Their grandchildren
- And so on...

### Centering Behavior
Current version centers each generation around the ANCHOR_X (1500px).

**Initial view position:** 
- `translate(200, 100)` 
- `scale(0.8)`

This may not perfectly center on the root couple - this is expected and can be adjusted in Phase 2.

### Anchor Line
The vertical dashed line extends to Y=5000 (up from 1500) to accommodate more generations. This may still be visible if you have 30+ generations, which is normal.

---

## Troubleshooting

### Problem: "No root couple found" message
**Cause:** No person exists with (a) no parents AND (b) a spouse  
**Solution:** Add parent relationships for younger generations, or ensure oldest couple has spouse relationship

### Problem: Person cards missing/duplicate
**Cause:** Generation detection may have skipped or double-counted someone  
**Check:**
1. Open browser console
2. Look for `Found X generations` message
3. Check if number seems right for your data

**Debug:**
```javascript
// Add this temporarily to detectGenerations() function
console.log('Generations detected:', generations);
```

### Problem: Child lines connecting to wrong parents
**Cause:** Marriage center not calculated correctly  
**Check:**
1. Verify parent relationships in database are correct
2. Check if both parents have spouse relationship
3. Look for orphaned children (no parent listed)

### Problem: Theme colors look wrong
**Cause:** Theme system may not be loading correctly  
**Solution:** 
1. Check that `getAllThemeColors()` is imported
2. Verify ThemeContext is wrapping the app
3. Try switching themes and back

---

## Rollback Procedure

If things go wrong and you need to revert:

### Quick Rollback
```bash
cd /Users/tywilliams/Desktop/lineageweaver/src/pages

# Restore backup
cp FamilyTree.jsx.BACKUP_BEFORE_DYNAMIC_GENERATIONS FamilyTree.jsx

# Restart dev server
npm run dev
```

### Verify Rollback
1. Refresh browser
2. Should see original hardcoded 4-generation tree
3. All features should work as before

---

## Performance Notes

### Expected Performance
- **1-5 generations:** Instant render (<100ms)
- **6-10 generations:** Fast render (<500ms)
- **11-20 generations:** Acceptable render (<2s)
- **20+ generations:** May see slight delay (2-5s)

### If Performance Degrades
Future optimization opportunities:
1. Virtual scrolling (only render visible cards)
2. Canvas rendering instead of SVG for large trees
3. Generation caching between redraws
4. Lazy loading of distant generations

---

## Next Steps (Phase 2 - Future)

Once this version is stable, potential enhancements:

1. **Generation Collapse/Expand Controls**
   - Toggle button for each generation
   - Collapsed view shows summary bar
   - Smooth animation

2. **Better Initial Centering**
   - Center on middle generation
   - Or center on most populated generation
   - User preference setting

3. **Anchor Line Improvements**
   - Dynamic positioning based on tree center
   - Or remove entirely
   - Make it a toggle option

4. **Performance Optimization**
   - Implement virtual scrolling for 30+ generations
   - Add loading indicators for large trees

---

## Success Criteria

✅ This refactor is successful if:
1. Tree displays all generations (not just 4)
2. New generations can be added above/below root
3. All visual rules preserved (colors, lines, offsets)
4. No features broke (search, relationships, zoom, themes)
5. Performance acceptable for current dataset

---

## Support & Debugging

### Enable Debug Logging
Add these console logs to track behavior:

```javascript
// In detectGenerations():
console.log('Root candidates:', rootCandidates.length);
console.log('Generations found:', generations.length);
console.log('Generation sizes:', generations.map(g => g.length));

// In drawTree():
console.log('Position Map size:', positionMap.size);
console.log('Marriage Centers count:', marriageCenters.size);
```

### Common Questions

**Q: Can I have more than one root couple?**  
A: Currently no - the system picks the oldest couple. Multi-root support would require tree merging logic (Phase 2 feature).

**Q: What if someone has no spouse but has children?**  
A: They should still display! The group building handles single parents. The child lines will originate from the person's card center instead of a marriage line.

**Q: Can generations go upward (older ancestors)?**  
A: Not yet - current version starts from oldest couple and goes down. Upward extension requires inverse traversal (Phase 2).

**Q: What's the maximum number of generations?**  
A: Technically unlimited, but performance will degrade around 50+ generations. At that scale, you'd want optimization (Phase 3).

---

## File Manifest

**Backup:**
- `FamilyTree.jsx.BACKUP_BEFORE_DYNAMIC_GENERATIONS` - Original hardcoded version

**New Files:**
- `FamilyTree.jsx` - Dynamic generations version (this file)
- `generation_refactor_risk_analysis.md` - Risk analysis document
- `Dynamic_Generations_Integration_Guide.md` - This guide

**Unchanged:**
- All other components (Navigation, TreeControls, QuickEditPanel, etc.)
- All utility files (themeColors, RelationshipCalculator, etc.)
- All services (database.js)

---

## Version History

**v2.0 - Dynamic Generations** (January 2026)
- Added unlimited generation support
- Removed hardcoded Gen 0-3 structure
- Preserved all visual rules and features
- Added generation detection algorithm

**v1.0 - Fixed Generations** (December 2024)
- Original implementation with hardcoded 4 generations
- Full theme system
- Search and relationship features

---

*End of Integration Guide*
