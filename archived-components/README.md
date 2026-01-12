# Archived Components

This folder contains deprecated components that have been replaced by newer implementations.

## Contents

### HeraldryCreationModal.jsx
**Archived:** January 2025
**Replaced By:** HouseHeraldrySection.jsx + The Armory (/heraldry routes)
**Reason:** Phase 5 Batch 2 integration - heraldry creation now uses the full Armory system via navigation rather than inline modals.

The old modal allowed simple heraldry generation within the QuickEditPanel sidebar. The new system:
- Uses `HouseHeraldrySection.jsx` for display in the sidebar
- Navigates to `/heraldry/create` for new arms creation
- Navigates to `/heraldry/edit/:id` for editing existing arms
- Supports both legacy data (stored on house) and new system (heraldry table + heraldryId foreign key)

---

*These files are kept for reference but should not be imported or used.*
