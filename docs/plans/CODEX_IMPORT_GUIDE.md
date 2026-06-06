# Codex Import System - Complete Guide

This guide explains how to use the enhanced codex import system to add worldbuilding content to your LineageWeaver codex.

## Overview

The import system now supports:
- ✅ Multiple data sources (House Wilfrey, Veritists, custom)
- ✅ Duplicate detection (skip entries that already exist)
- ✅ Progress tracking during import
- ✅ Validation before import
- ✅ Easy-to-use React component
- ✅ Repeatable process for adding new content over time

## Files Created

### 1. `veritists-codex-import.js`
**Location:** Put in `/src/data/`

Contains all seven Veritist entries:
- Verithold (location)
- Veritown (location)
- Chronicle Chambers (mysteria)
- The Veritists (mysteria)
- Acolytes (mysteria)
- Recordants (mysteria)
- Provosts (mysteria)

### 2. `enhanced-codex-import.js`
**Location:** Put in `/src/utils/`

Enhanced import utility with features:
- Import from multiple sources
- Duplicate detection
- Progress callbacks
- Validation
- Quick import functions

### 3. `EnhancedCodexImportTool.jsx`
**Location:** Put in `/src/components/`

React component providing UI for:
- Selecting data sources
- Viewing previews
- Importing with progress tracking
- Error handling and results display

## Installation Steps

### Step 1: Copy Files

```bash
# Copy the data file
cp veritists-codex-import.js /Users/tywilliams/Desktop/lineageweaver/src/data/

# Copy the utility
cp enhanced-codex-import.js /Users/tywilliams/Desktop/lineageweaver/src/utils/

# Copy the component
cp EnhancedCodexImportTool.jsx /Users/tywilliams/Desktop/lineageweaver/src/components/
```

### Step 2: Add to Your App

In your main App.jsx or a settings page:

```javascript
import EnhancedCodexImportTool from './components/EnhancedCodexImportTool';
import VERITISTS_CODEX_DATA from './data/veritists-codex-import';

// Add to your render:
<EnhancedCodexImportTool veritistsData={VERITISTS_CODEX_DATA} />
```

Or add it to a dedicated admin/settings page if you prefer.

### Step 3: Import Data

1. Navigate to the page with the import tool
2. Select which data source to import:
   - **House Wilfrey**: Original 23 entries
   - **Veritists**: New 7 entries
   - **Everything**: All 30 entries combined
3. Click "Import Data" or "Clear & Import"
4. Watch progress and review results

## Usage Options

### Option A: UI Import (Recommended for First Time)

Use the React component for a visual interface with progress tracking and error handling.

### Option B: Programmatic Import

If you need to import programmatically:

```javascript
import { importCodexData, quickImports } from './utils/enhanced-codex-import';
import VERITISTS_CODEX_DATA from './data/veritists-codex-import';

// Import Veritists only
await importCodexData(VERITISTS_CODEX_DATA);

// Or use quick imports
await quickImports.veritists(VERITISTS_CODEX_DATA);

// Import everything
await quickImports.everything(VERITISTS_CODEX_DATA);
```

### Option C: Console Import

In browser console:

```javascript
// Get the functions
const { importCodexData } = await import('./utils/enhanced-codex-import.js');
const VERITISTS = await import('./data/veritists-codex-import.js');

// Import
await importCodexData(VERITISTS.default);
```

## Creating New Data Sets

When you create more codex content in the future, follow this pattern:

### 1. Create Data File

```javascript
// my-new-content.js

export const MY_NEW_DATA = {
  locations: [
    {
      type: 'location',
      title: 'New Place',
      subtitle: 'A mysterious location',
      category: 'Settlements',
      tags: ['new', 'mysterious', 'location'],
      era: 'Current Era',
      locationId: null,
      content: `Full markdown content here with [[wiki links]]...`
    }
  ],
  
  mysteria: [
    {
      type: 'mysteria',
      title: 'New Custom',
      subtitle: 'An interesting tradition',
      category: 'Customs & Institutions',
      tags: ['custom', 'tradition'],
      era: 'Ancient - Current',
      content: `Full content here...`
    }
  ]
};

export default MY_NEW_DATA;
```

### 2. Import the New Data

```javascript
import MY_NEW_DATA from './data/my-new-content';

// Use the enhanced import tool
await importCodexData(MY_NEW_DATA);
```

### 3. Update the Component (Optional)

If you want to add it to the UI dropdown:

```javascript
// In EnhancedCodexImportTool.jsx
<label>
  <input
    type="radio"
    value="my-new-content"
    ...
  />
  <strong>My New Content</strong> - {preview.total} entries
</label>
```

## Required Data Structure

Each entry must have:

```javascript
{
  type: 'house' | 'location' | 'event' | 'personage' | 'mysteria',
  title: 'Entry Title',                    // Required
  subtitle: 'Short tagline',               // Optional
  category: 'Category Name',               // Optional
  tags: ['tag1', 'tag2'],                  // Optional array
  era: 'Time Period',                      // Optional
  content: 'Full markdown content...',     // Required
  
  // Optional integration hooks
  personId: null,
  houseId: null,
  locationId: null,
  eventId: null,
  
  // Optional structured sections
  sections: [
    {
      heading: 'Section Name',
      content: 'Brief description',
      order: 1
    }
  ]
}
```

## Tips for Creating Content

### Wiki Links
Use `[[Entry Name]]` syntax for cross-references:
- `[[House Wilfrey]]`
- `[[Verithold]]`
- `[[The Fostering System]]`

### Tags
Use kebab-case for multi-word tags:
- ✅ `verithold`, `chronicle-chambers`, `neutral-institution`
- ❌ `Verithold`, `Chronicle Chambers`, `neutral institution`

### Markdown
Full markdown supported:
- Headers: `## Heading`, `### Subheading`
- Bold: `**text**`
- Italic: `*text*`
- Lists: `- item` or `1. item`
- Quotes: `> quote`

### Content Length
- Be comprehensive but focused
- Use sections to organize long entries
- Cross-reference related entries
- Include cultural context

## Validation

The system validates:
- ✅ Required fields (type, title, content)
- ✅ Data structure (proper categories)
- ✅ Array formats
- ❌ Will show clear error messages if validation fails

## Duplicate Handling

By default, the system:
- Checks existing entries by title
- Skips duplicates automatically
- Reports skipped entries in results
- Allows "Clear & Import" to start fresh

## Troubleshooting

### "Veritists data not available"
- Make sure you imported the data file
- Pass it to the component: `veritistsData={VERITISTS_CODEX_DATA}`

### "Invalid data structure"
- Check that your data has the right categories (houses, locations, etc.)
- Ensure each entry has required fields (type, title, content)
- Verify the structure matches the examples

### Entries Not Appearing
- Check browser console for errors
- Verify import completed successfully
- Check that codexService.js is working
- Make sure database is initialized

### Duplicates Being Created
- The system checks titles, not IDs
- Make sure titles match exactly (case-sensitive)
- Use "Clear & Import" to start completely fresh

## Future Expansions

When you create new worldbuilding content:

1. **Draft the Content**
   - Work with Claude to develop entries
   - Include all necessary cross-references
   - Add appropriate tags and metadata

2. **Create Import File**
   - Copy the structure from veritists-codex-import.js
   - Add your new entries following the same format
   - Save in /src/data/

3. **Import**
   - Use the enhanced import tool
   - Verify entries appear correctly
   - Check that wiki links work

4. **Iterate**
   - This process can be repeated indefinitely
   - Each new expansion can be its own file
   - All can be imported separately or together

## Technical Notes

### Database
- Uses Dexie.js (IndexedDB wrapper)
- Entries stored in `codexEntries` table
- Links stored in `codexLinks` table
- All operations asynchronous

### Performance
- Import is batched by category
- Progress updates in real-time
- Typical import: ~1 second per 10 entries
- Large imports may take several seconds

### Browser Storage
- IndexedDB has generous storage limits
- Typical entry: 2-5 KB
- 1000 entries: ~2-5 MB
- No practical limit for your use case

## Summary

This system allows you to:
1. ✅ Create codex content collaboratively with Claude
2. ✅ Format it properly with all metadata
3. ✅ Import it with a single click
4. ✅ Repeat the process for future expansions
5. ✅ Maintain quality and consistency

The Veritists content demonstrates the complete workflow - use it as a template for future worldbuilding imports!
