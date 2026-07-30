/**
 * Shared Components Index
 *
 * Barrel export for all shared/reusable components.
 * Makes imports cleaner: import { Card, ActionButton } from '../components/shared'
 *
 * All 14 are exported. Eight of them were missing from this file, so callers
 * had to deep-import them — which is why the list controls, search bar,
 * pagination and dropdowns saw only one to four uses each while pages
 * hand-rolled their own equivalents.
 */

// Layout & structure
export { default as SectionHeader } from './SectionHeader';
export { default as Card } from './Card';

// State views
export { default as EmptyState } from './EmptyState';
export { default as LoadingState } from './LoadingState';

// Controls
export { default as ActionButton } from './ActionButton';
export { default as ListControls } from './ListControls';
export { default as ListSearchBar } from './ListSearchBar';
export { default as FilterDropdown } from './FilterDropdown';
export { default as SortDropdown } from './SortDropdown';
export { default as Pagination } from './Pagination';
export { default as ViewDensityToggle } from './ViewDensityToggle';

// Grouping
export { default as GroupHeader } from './GroupHeader';
export { default as GroupToggle } from './GroupToggle';

// Animation
export { default as AnimatedList } from './AnimatedList';
