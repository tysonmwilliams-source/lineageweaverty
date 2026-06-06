# Writing Studio Implementation Plan

## Overview

A canon-aware creative writing environment deeply integrated with LineageWeaver's world-building data (People, Houses, Dignities, Codex, Heraldry).

---

## Core Features

| Feature | Description |
|---------|-------------|
| **Rich Text Editor** | Word-like editing with TipTap (ProseMirror-based) |
| **[[Wiki-Links]]** | Autocomplete mentions to any entity type |
| **Document Management** | Create, save, rename, delete writings with auto-save |
| **Chapter Organization** | Multi-chapter support for novels/novellas |
| **Entity Sidebar** | Shows all referenced entities with quick-view |
| **AI Canon Checking** | Validates writing against established lore |
| **Cloud Sync** | Full sync like other entity types |

---

## Technical Decisions

### Editor: TipTap (Recommended)
- Built on ProseMirror (used by Notion, Atlassian)
- Excellent React integration via `@tiptap/react`
- Has `@tiptap/extension-mention` - perfect for [[wiki-links]]
- Stores content as JSON (preserves structure) with HTML export
- Supports collaborative editing for future enhancement

### Data Model

**`writings` table:**
```javascript
{
  id, title, type, status, synopsis,
  tags[], targetWordCount, currentWordCount,
  metadata: { genre, timelineStart, timelineEnd, mainCharacters[] },
  datasetId, createdAt, updatedAt
}
```

**`chapters` table:**
```javascript
{
  id, writingId, title, order,
  content (TipTap JSON), contentHtml, contentPlainText,
  wordCount, status, notes, povCharacter,
  createdAt, updatedAt
}
```

**`writingLinks` table:**
```javascript
{
  id, writingId, chapterId,
  targetType, targetId, displayText, context, position,
  createdAt
}
```

---

## File Structure

```
src/
├── pages/
│   ├── WritingStudio.jsx        # Landing page (project list)
│   └── WritingEditor.jsx        # Full editor page
│
├── components/writing/
│   ├── WritingList.jsx          # Grid of writing cards
│   ├── WritingCard.jsx          # Individual card
│   ├── WritingForm.jsx          # Create/edit metadata
│   ├── ChapterList.jsx          # Sidebar navigation
│   ├── Editor/
│   │   ├── TipTapEditor.jsx     # Editor wrapper
│   │   ├── EditorToolbar.jsx    # Formatting tools
│   │   ├── WikiLinkExtension.js # Custom [[]] extension
│   │   └── WikiLinkSuggestion.jsx
│   ├── Sidebar/
│   │   ├── EntitySidebar.jsx    # Referenced entities
│   │   └── QuickInsertPanel.jsx # Browse & insert
│   └── CanonCheck/
│       ├── CanonCheckPanel.jsx  # Validation results
│       └── CanonIssueCard.jsx   # Individual issue
│
├── services/
│   ├── writingService.js        # Writing CRUD
│   ├── chapterService.js        # Chapter CRUD
│   └── canonCheckService.js     # AI validation
│
├── hooks/
│   ├── useAutoSave.js           # Debounced saving
│   └── useCanonCheck.js         # Validation hook
│
└── styles/
    └── WritingStudio.css
```

**Modified existing files:**
- `App.jsx` - Add routes
- `database.js` - Add v14 schema
- `firestoreService.js` - Add sync functions
- `dataSyncService.js` - Add sync wrappers
- `Navigation.jsx` - Add nav item

---

## Implementation Phases

### Phase 1: Foundation
- Database schema (writings, chapters, writingLinks tables)
- writingService.js and chapterService.js
- Cloud sync support
- WritingStudio.jsx landing page with list view
- Basic routing (`/writing`, `/writing/:id`)

### Phase 2: Rich Editor
- TipTap integration with formatting toolbar
- Chapter sidebar navigation
- Auto-save with visual indicator
- Word count tracking

### Phase 3: Wiki-Link Integration
- Custom TipTap extension for `[[` trigger
- Autocomplete dropdown with entity search
- Link tracking in writingLinks table
- Hover preview for linked entities

### Phase 4: Entity Sidebar
- Right panel showing referenced entities
- Quick-insert panel to browse & add entities
- Character usage tracking

### Phase 5: AI Canon Checking
- Rule-based validation (timeline, relationships, entities)
- AI-powered deep validation via Claude
- Results panel with issues and suggestions
- On-demand validation (button trigger)

### Phase 6: Polish
- Export (PDF, DOCX, Markdown)
- Version history
- Outline mode toggle

---

## Canon Checking Approach

**Rule-Based (Fast, Local):**
- Entity existence validation
- Character lifespan checks (alive during story?)
- Dignity tenure validation (held title at story time?)

**AI-Powered (Deep):**
- Relationship consistency
- Plot hole detection
- Contextual validation
- Uses existing aiDataService.js pattern

**Mode: Real-Time with Smart Prompting**
- Background validation every 5 minutes while writing
- Non-intrusive indicator (subtle badge/icon) when issues found
- Click to expand full issue panel
- Dismiss options:
  - "Dismiss for now" (until next check)
  - "Dismiss for 20 mins" (flow state protection)
  - "Dismiss for session" (ignore until next open)
  - "Acknowledge" (mark as intentional, don't flag again)
- Manual "Check Now" button for immediate full validation
- Batch validation for entire writing on-demand

---

## Integration Points

| System | Integration |
|--------|-------------|
| **Codex** | Wiki-links via `[[Entry Title]]`, backlinks |
| **People** | Character mentions, lifespan validation |
| **Houses** | House mentions, membership validation |
| **Dignities** | Title validation, tenure checking |
| **Heraldry** | Shield previews in tooltips |
| **Cloud Sync** | Full sync like other entities |

---

## Modular Architecture

Each feature built as a **self-contained module** with standard interfaces:

```
src/components/writing/modules/
├── index.js                    # Module registry & loader
├── ModuleTemplate/             # Template for new modules
│   ├── index.js                # Module definition
│   ├── hooks.js                # Module-specific hooks
│   ├── Panel.jsx               # UI component
│   └── service.js              # Data operations
├── CanonCheck/                 # Canon checking module
├── EntitySidebar/              # Entity reference module
├── QuickInsert/                # Entity insertion module
├── Export/                     # Export functionality module
├── VersionHistory/             # Version tracking module
└── OutlineMode/                # Outline toggle module
```

**Module Interface:**
```javascript
// Each module exports:
export default {
  id: 'canon-check',
  name: 'Canon Checker',
  icon: 'shield-check',

  // Hooks into editor lifecycle
  hooks: {
    onContentChange: (content, context) => {},
    onSave: (writing, chapter) => {},
    onLoad: (writing, chapter) => {},
  },

  // UI integration points
  panels: {
    sidebar: CanonCheckPanel,      // Right sidebar panel
    toolbar: CanonCheckButton,     // Toolbar button
    statusBar: CanonCheckStatus,   // Bottom status indicator
  },

  // Data layer
  service: canonCheckService,

  // Module settings
  settings: {
    enabled: true,
    checkInterval: 300000,  // 5 mins
  }
}
```

**Benefits:**
- Add new features without touching core editor code
- Consistent patterns for hooks, UI, and data
- Easy to enable/disable features per user preference
- Clear template for future modules (AI writing assistant, timeline view, etc.)

---

## Document Structure Decision

**Approach: Always Chapters (UI-adaptive)**

- All writings have chapters internally (minimum 1)
- For single-chapter works (short stories, notes):
  - Chapter sidebar hidden
  - No "Chapter 1" header shown
  - Feels like a single document
- For multi-chapter works (novels, novellas):
  - Full chapter navigation in sidebar
  - Chapter headers and organization
- User can convert single → multi-chapter at any time

---

## Key Dependencies

```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-mention
@tiptap/extension-placeholder
@tiptap/extension-character-count
```

---

## Verification Plan

1. **CRUD Operations**: Create writing, add chapters, edit, delete
2. **Auto-Save**: Make changes, verify saved without explicit action
3. **Wiki-Links**: Type `[[`, verify autocomplete, verify link renders
4. **Entity Sidebar**: Verify referenced entities appear
5. **Canon Check**: Add inconsistency, run check, verify flagged
6. **Cloud Sync**: Create offline, go online, verify synced
7. **Export**: Export to PDF/DOCX, verify formatting preserved
