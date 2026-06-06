# NEXT SESSION HANDOFF PROMPT

**Copy this entire prompt into your next chat with Claude to continue where we left off:**

---

## Project Context

I'm working on **Lineageweaver**, a web-based fantasy genealogy tool with an integrated wiki-style encyclopedia system called **The Codex**. The project uses React, D3.js, IndexedDB (via Dexie), and has a medieval manuscript aesthetic with dual themes.

## Current Status: Phase 2 COMPLETE ✅

**We just finished:**
- ✅ The Codex Phase 2 Week 1: Entry View System with Wiki-Links
- ✅ The Codex Phase 2 Week 2: Backlinks Panel & Advanced Browse Pages

**Everything is working perfectly!**

## What We Have Now

### The Codex Features (All Working):

1. **Entry View System**
   - Entries render with markdown support
   - `[[Wiki Links]]` automatically become clickable
   - Broken links show with strikethrough + warning icon
   - Navigates between entries via wiki-links

2. **Backlinks Panel**
   - Shows all entries that reference current entry
   - Grouped by entry type (collapsible)
   - Context snippets showing sentence with link
   - Reference count badge

3. **Advanced Browse Pages**
   - 6 routes: `/codex/browse/{type}` for each entry type
   - Advanced filtering: search + tags + era + sort
   - Pagination (20 entries per page)
   - Hybrid list layout with metadata
   - Statistics panels

4. **Navigation Flow**
   - Landing → Category cards → Browse pages
   - Browse → Entries → View with backlinks
   - Entry → Wiki-links → Related entries
   - Full discovery loops working

### File Structure:
```
/Users/tywilliams/Desktop/lineageweaver/
├── src/
│   ├── pages/
│   │   ├── CodexLanding.jsx (landing with Article of Interest)
│   │   ├── CodexEntryView.jsx (entry view with backlinks)
│   │   ├── CodexBrowse.jsx (browse pages with filters)
│   │   └── ... (other pages)
│   ├── services/
│   │   ├── codexService.js (all CRUD operations)
│   │   └── database.js (Dexie v5 with codexEntries + codexLinks)
│   ├── utils/
│   │   ├── wikiLinkParser.js (wiki-link parsing + context extraction)
│   │   └── ... (other utils)
│   └── App.jsx (all routes configured)
```

### Database Schema:
- **codexEntries**: type, title, subtitle, content (markdown), tags, era, category, wordCount, created, updated
- **codexLinks**: sourceId, targetId, type, label, bidirectional
- **Sample Data**: 23 canonical House Wilfrey entries imported

## What We're Building Next: PHASE 3

**The Codex - Phase 3: Tree Integration (Bi-Directional Navigation)**

### Objectives:

Connect the family tree visualization with The Codex encyclopedia for seamless bi-directional navigation:

1. **From Tree to Codex:**
   - Add "📜" icon to person cards when biography exists
   - Click icon → navigate to that person's codex entry
   - Quick-create biography button in QuickEditPanel

2. **From Codex to Tree:**
   - Add mini family tree widget to personage entries
   - Widget shows person + immediate family (parents, spouse, children)
   - Click any person in widget → jump to full tree at that person
   - Highlight that person in tree view

3. **Data Sync:**
   - Changes to name/dates in tree suggest updating codex
   - Changes to name/dates in codex suggest updating tree
   - No duplication - single source of truth
   - Bidirectional linking via personId field

4. **Enhanced Search:**
   - Global search across both tree AND codex
   - Results show type (Person from tree vs Entry from codex)
   - Click result → navigate to appropriate view

### Technical Approach:

**Integration Points:**
- Person cards in FamilyTree.jsx need codex icon
- QuickEditPanel needs "Create Biography" button
- CodexEntryView needs family tree widget component
- Search needs to query both systems
- Navigation needs context preservation

**Key Design Decisions:**
- Keep tree and codex as separate systems (loose coupling)
- Use personId as the linking field
- Suggest updates but don't auto-sync (user confirms)
- Mini tree widget is read-only (navigate to full tree to edit)

**Files to Modify:**
- `src/pages/FamilyTree.jsx` - Add codex icon to cards
- `src/components/QuickEditPanel.jsx` - Add biography button
- `src/pages/CodexEntryView.jsx` - Add family tree widget
- `src/components/Navigation.jsx` - Enhance search
- Create new: `src/components/MiniTreeWidget.jsx`

## Development Preferences

**How I Work:**
- **Permission-based development**: Present concepts first, get approval, then code
- **Complete file creation**: You create full files with descriptive names, I manually integrate
- **Surgical changes**: For small updates, edit existing files directly
- **Comprehensive handoffs**: Detailed documentation for session continuity
- **Testing checklists**: Provide step-by-step verification guides

**What I Value:**
- Clear explanations of what things mean (I'm learning as we go)
- Medieval manuscript aesthetic throughout (Cinzel + Crimson Text fonts)
- Professional quality code and UI/UX
- Maintaining canonical content integrity
- No breaking existing features

## Project Documentation

**Main docs:**
- `/mnt/project/Lineageweaver_Project_Documentation.md` - Original specs
- `/Users/tywilliams/Desktop/lineageweaver/README.md` - Just updated with Phase 2 completion

**Recent Integration Guides:**
- Week 1: Entry view system
- Week 2A: Backlinks panel
- Week 2B: Browse pages

## What to Do When We Start Phase 3

1. **Read the project documentation** to understand the full vision
2. **Review Phase 3 objectives** listed above
3. **Propose the first deliverable** - probably the codex icon on person cards
4. **Present the technical approach** before coding
5. **Get my approval**, then build!

## Important Notes

- **Database is version 5** (codexEntries + codexLinks tables)
- **23 seed entries imported** from House Wilfrey
- **All Phase 2 features working perfectly**
- **Theme system is complete** (Royal Parchment + Light Manuscript)
- **No console errors** currently

## Ready to Begin?

When we start the next session, I'll say something like:

> "Ready to start Phase 3: Tree-Codex Integration! Let's begin with adding the codex icon to person cards."

And you'll:
1. Review the files
2. Understand the integration point
3. Propose the implementation approach
4. Get approval
5. Build it!

---

## Quick Reference

**Project Location:** `/Users/tywilliams/Desktop/lineageweaver`

**Dev Server:** `npm run dev` → `http://localhost:5173`

**Key Routes:**
- `/tree` - Family tree visualization
- `/codex` - Codex landing page
- `/codex/browse/{type}` - Browse entries by type
- `/codex/entry/{id}` - View entry with backlinks
- `/codex/create` - Create new entry
- `/codex/edit/{id}` - Edit entry

**Database:** IndexedDB (Dexie) with auto-backup every 15 minutes

**Themes:** Royal Parchment (dark) / Light Manuscript (light)

---

**Let's build Phase 3 together!** 🚀

