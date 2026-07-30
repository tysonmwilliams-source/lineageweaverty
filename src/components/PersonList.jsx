/**
 * PersonList.jsx - Person List Component
 *
 * PURPOSE:
 * Displays all people in an animated list with their key information.
 * Shows house affiliation and provides edit/delete options.
 * Includes search and sort functionality.
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 *
 * Props:
 * - people: Array of person objects
 * - houses: Array of house objects (to show house names)
 * - onEdit: Function to call when user wants to edit a person
 * - onDelete: Function to call when user wants to delete a person
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons';
import ActionButton from './shared/ActionButton';
import EmptyState from './shared/EmptyState';
import ListControls from './shared/ListControls';
import ListSearchBar from './shared/ListSearchBar';
import SortDropdown from './shared/SortDropdown';
import FilterDropdown from './shared/FilterDropdown';
import GroupHeader from './shared/GroupHeader';
import GroupToggle from './shared/GroupToggle';
import Pagination from './shared/Pagination';
import ViewDensityToggle from './shared/ViewDensityToggle';
import useListKeyboardShortcuts from '../hooks/useListKeyboardShortcuts';
import './PersonList.css';
import { compareYears } from '../utils/parseYear';

// ==================== PAGINATION CONFIG ====================
const ITEMS_PER_PAGE = 25;

// ==================== FILTER OPTIONS ====================
const LEGITIMACY_OPTIONS = [
  { value: 'legitimate', label: 'Legitimate' },
  { value: 'bastard', label: 'Bastard' },
  { value: 'adopted', label: 'Adopted' },
  { value: 'unknown', label: 'Unknown' }
];

const LIVING_STATUS_OPTIONS = [
  { value: 'living', label: 'Living' },
  { value: 'deceased', label: 'Deceased' }
];

// ==================== ANIMATION VARIANTS ====================
const LIST_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 300
    }
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.2 }
  }
};

// ==================== LEGITIMACY COLORS ====================
const LEGITIMACY_COLORS = {
  legitimate: 'var(--color-success)',
  bastard: 'var(--color-warning)',
  adopted: 'var(--color-info)',
  unknown: 'var(--text-tertiary)'
};

// ==================== SORT OPTIONS ====================
const SORT_OPTIONS = [
  { value: 'lastName', label: 'Last Name (A-Z)' },
  { value: 'lastNameDesc', label: 'Last Name (Z-A)' },
  { value: 'firstName', label: 'First Name (A-Z)' },
  { value: 'dateOfBirth', label: 'Birth Date (Oldest)' },
  { value: 'dateOfBirthDesc', label: 'Birth Date (Youngest)' },
  { value: 'house', label: 'By House' }
];

function PersonList({ people, houses, onEdit, onDelete }) {
  // ==================== SEARCH & SORT STATE ====================
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('lastName');

  // ==================== FILTER STATE ====================
  const [filterHouse, setFilterHouse] = useState('');
  const [filterLegitimacy, setFilterLegitimacy] = useState('');
  const [filterLivingStatus, setFilterLivingStatus] = useState('');

  // ==================== GROUPING STATE ====================
  const [groupByHouse, setGroupByHouse] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  // ==================== PAGINATION STATE ====================
  const [currentPage, setCurrentPage] = useState(1);

  // ==================== VIEW DENSITY STATE ====================
  const [viewDensity, setViewDensity] = useState('comfortable');

  // ==================== REFS ====================
  const searchInputRef = useRef(null);

  // ==================== KEYBOARD SHORTCUTS ====================
  useListKeyboardShortcuts({
    searchInputRef,
    onClearSearch: () => setSearchTerm('')
  });

  // Toggle group collapsed state
  const toggleGroupCollapsed = useCallback((groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ==================== HOUSE LOOKUP MAP ====================
  const houseMap = useMemo(() => {
    return new Map(houses.map(h => [h.id, h]));
  }, [houses]);

  /**
   * Get house by ID (using Map for O(1) lookup)
   */
  const getHouse = (houseId) => {
    return houseMap.get(houseId);
  };

  /**
   * Get house name by house ID
   */
  const getHouseName = (houseId) => {
    const house = getHouse(houseId);
    return house ? house.houseName : 'Unknown House';
  };

  /**
   * Get house color by house ID
   */
  const getHouseColor = (houseId) => {
    const house = getHouse(houseId);
    return house ? house.colorCode : 'var(--text-tertiary)';
  };

  /**
   * Format date for display
   */
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return dateStr;
  };

  // ==================== HOUSE OPTIONS FOR FILTER ====================
  const houseOptions = useMemo(() => {
    return houses
      .map(h => ({ value: h.id, label: h.houseName }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [houses]);

  // ==================== FILTERED & SORTED PEOPLE ====================
  const filteredAndSortedPeople = useMemo(() => {
    let filtered = [...people];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.firstName?.toLowerCase().includes(search) ||
        p.lastName?.toLowerCase().includes(search) ||
        p.maidenName?.toLowerCase().includes(search) ||
        p.titles?.some(t => t.toLowerCase().includes(search)) ||
        getHouseName(p.houseId).toLowerCase().includes(search)
      );
    }

    // Apply house filter.
    // filterHouse arrives from a <select> so it is always a string, while
    // person.houseId is a number — the strict compare never matched and the
    // filter returned zero results for every house.
    if (filterHouse) {
      const houseIdFilter = Number(filterHouse);
      filtered = filtered.filter(p => p.houseId === houseIdFilter);
    }

    // Apply legitimacy filter
    if (filterLegitimacy) {
      filtered = filtered.filter(p => p.legitimacyStatus === filterLegitimacy);
    }

    // Apply living status filter
    if (filterLivingStatus) {
      if (filterLivingStatus === 'living') {
        filtered = filtered.filter(p => !p.dateOfDeath);
      } else if (filterLivingStatus === 'deceased') {
        filtered = filtered.filter(p => p.dateOfDeath);
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'lastName':
          return (a.lastName || '').localeCompare(b.lastName || '');
        case 'lastNameDesc':
          return (b.lastName || '').localeCompare(a.lastName || '');
        case 'firstName':
          return (a.firstName || '').localeCompare(b.firstName || '');
        // localeCompare sorted these as strings, so everyone born in the 900s
        // came after everyone born in the 1000s.
        case 'dateOfBirth':
          return compareYears(a.dateOfBirth, b.dateOfBirth);
        case 'dateOfBirthDesc':
          return compareYears(b.dateOfBirth, a.dateOfBirth);
        case 'house': {
          const houseA = getHouseName(a.houseId);
          const houseB = getHouseName(b.houseId);
          return houseA.localeCompare(houseB);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [people, houses, searchTerm, sortBy, filterHouse, filterLegitimacy, filterLivingStatus, houseMap]);

  // Memoize processed people with house data
  const processedPeople = useMemo(() => {
    return filteredAndSortedPeople.map(person => ({
      ...person,
      houseName: getHouseName(person.houseId),
      houseColor: getHouseColor(person.houseId),
      legitimacyColor: LEGITIMACY_COLORS[person.legitimacyStatus] || LEGITIMACY_COLORS.unknown
    }));
  }, [filteredAndSortedPeople, houseMap]);

  // ==================== GROUPED PEOPLE ====================
  const groupedPeople = useMemo(() => {
    if (!groupByHouse) return null;

    const groups = new Map();

    processedPeople.forEach(person => {
      const house = houseMap.get(person.houseId);
      const key = house?.id || 'unknown';

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          house: house || { houseName: 'Unknown House', colorCode: null },
          members: []
        });
      }

      groups.get(key).members.push(person);
    });

    // Sort groups by house name
    return Array.from(groups.values())
      .sort((a, b) => a.house.houseName.localeCompare(b.house.houseName));
  }, [processedPeople, groupByHouse, houseMap]);

  // Check if filters are active
  const hasActiveFilters = searchTerm.length > 0 ||
    filterHouse.length > 0 ||
    filterLegitimacy.length > 0 ||
    filterLivingStatus.length > 0;

  // ==================== PAGINATION LOGIC ====================
  // Reset page when filters/sort change.
  // This was a useMemo, which runs during render — calling a setter there is a
  // render-phase side effect that forces an extra render and warns in React 19.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, filterHouse, filterLegitimacy, filterLivingStatus]);

  // Calculate total pages (only for ungrouped view)
  const totalPages = Math.ceil(processedPeople.length / ITEMS_PER_PAGE);

  // Paginate processed people (only for ungrouped view)
  const paginatedPeople = useMemo(() => {
    if (groupByHouse) return processedPeople; // No pagination in grouped view
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return processedPeople.slice(start, start + ITEMS_PER_PAGE);
  }, [processedPeople, currentPage, groupByHouse]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterHouse('');
    setFilterLegitimacy('');
    setFilterLivingStatus('');
    setSortBy('lastName');
    setCurrentPage(1);
  }, []);

  // If no data at all, show empty state without controls
  if (people.length === 0) {
    return (
      <EmptyState
        icon="user"
        title="No People Yet"
        description="Create your first person to start building your family tree."
      />
    );
  }

  return (
    <div className="person-list-container">
      {/* Search, Filter & Sort Controls */}
      <ListControls
        resultCount={processedPeople.length}
        totalCount={people.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
      >
        <ListSearchBar
          ref={searchInputRef}
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search people... (press / to focus)"
        />
        <FilterDropdown
          value={filterHouse}
          onChange={setFilterHouse}
          options={houseOptions}
          label="House:"
          icon="castle"
          allLabel="All Houses"
        />
        <FilterDropdown
          value={filterLegitimacy}
          onChange={setFilterLegitimacy}
          options={LEGITIMACY_OPTIONS}
          label="Status:"
          icon="shield"
          allLabel="All Statuses"
        />
        <FilterDropdown
          value={filterLivingStatus}
          onChange={setFilterLivingStatus}
          options={LIVING_STATUS_OPTIONS}
          label="Living:"
          icon="heart"
          allLabel="All"
        />
        <SortDropdown
          value={sortBy}
          onChange={setSortBy}
          options={SORT_OPTIONS}
        />
        <GroupToggle
          enabled={groupByHouse}
          onChange={setGroupByHouse}
          label="Group by House"
        />
        <ViewDensityToggle
          density={viewDensity}
          onChange={setViewDensity}
        />
      </ListControls>

      {/* Empty state for filtered results */}
      {processedPeople.length === 0 && hasActiveFilters ? (
        <EmptyState
          icon="search"
          title="No Matching People"
          description="Try adjusting your search terms or clear the filters."
        />
      ) : groupByHouse && groupedPeople ? (
        /* Grouped View */
        <div className={`person-list person-list--grouped ${viewDensity === 'compact' ? 'person-list--compact' : ''}`}>
          {groupedPeople.map(group => (
            <div key={group.id} className="person-list__group">
              <GroupHeader
                icon="castle"
                title={group.house.houseName}
                count={group.members.length}
                color={group.house.colorCode}
                collapsed={collapsedGroups.has(group.id)}
                onToggle={() => toggleGroupCollapsed(group.id)}
              />
              <AnimatePresence>
                {!collapsedGroups.has(group.id) && (
                  <motion.div
                    className="person-list__group-members"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {group.members.map(person => (
                      <PersonItem
                        key={person.id}
                        person={person}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        showHouse={false}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      ) : (
        /* Ungrouped View */
        <>
          <motion.div
            className={`person-list ${viewDensity === 'compact' ? 'person-list--compact' : ''}`}
            variants={LIST_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {paginatedPeople.map(person => (
                <PersonItem
                  key={person.id}
                  person={person}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  showHouse={true}
                />
              ))}
            </AnimatePresence>
          </motion.div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </div>
  );
}

// ==================== PERSON ITEM SUBCOMPONENT ====================
function PersonItem({ person, onEdit, onDelete, showHouse = true }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return dateStr;
  };

  return (
    <motion.div
      className="person-list__item"
      style={{ '--legitimacy-color': person.legitimacyColor }}
      variants={ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      whileHover={{ y: -2 }}
    >
      <div className="person-list__content">
        {/* Person Info */}
        <div className="person-list__info">
          {/* Name and House */}
          <div className="person-list__header">
            <div
              className="person-list__house-dot"
              style={{ backgroundColor: person.houseColor }}
              title={person.houseName}
            />
            <h3 className="person-list__name">
              {person.firstName} {person.lastName}
              {person.maidenName && (
                <span className="person-list__maiden-name">
                  (née {person.maidenName})
                </span>
              )}
            </h3>
          </div>

          {/* House affiliation - only show in ungrouped view */}
          {showHouse && (
            <p className="person-list__house">
              <Icon name="castle" size={14} />
              <span>{person.houseName}</span>
            </p>
          )}

          {/* Dates */}
          {(person.dateOfBirth || person.dateOfDeath) && (
            <p className="person-list__dates">
              <Icon name="calendar" size={14} />
              <span>
                {person.dateOfBirth && `b. ${formatDate(person.dateOfBirth)}`}
                {person.dateOfBirth && person.dateOfDeath && ' - '}
                {person.dateOfDeath && `d. ${formatDate(person.dateOfDeath)}`}
              </span>
            </p>
          )}

          {/* Titles */}
          {person.titles && person.titles.length > 0 && (
            <div className="person-list__titles">
              {person.titles.map((title, idx) => (
                <span key={idx} className="person-list__title-badge">
                  {title}
                </span>
              ))}
            </div>
          )}

          {/* Badges row */}
          <div className="person-list__badges">
            {/* Biography indicator */}
            {person.codexEntryId && (
              <span className="person-list__badge person-list__badge--biography">
                <Icon name="book-open" size={12} />
                <span>Biography</span>
              </span>
            )}

            {/* Legitimacy badge */}
            {person.legitimacyStatus !== 'legitimate' && (
              <span
                className={`person-list__badge person-list__badge--${person.legitimacyStatus}`}
              >
                {person.legitimacyStatus.charAt(0).toUpperCase() + person.legitimacyStatus.slice(1)}
              </span>
            )}
          </div>

          {/* Fantasy elements */}
          {(person.species || person.magicalBloodline) && (
            <div className="person-list__fantasy">
              {person.species && (
                <span className="person-list__fantasy-item">
                  <Icon name="sparkles" size={14} />
                  <span>{person.species}</span>
                </span>
              )}
              {person.magicalBloodline && (
                <span className="person-list__fantasy-item">
                  <Icon name="zap" size={14} />
                  <span>{person.magicalBloodline}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="person-list__actions">
          <ActionButton
            variant="ghost"
            size="sm"
            icon="edit"
            onClick={() => onEdit(person)}
            title="Edit person"
          >
            Edit
          </ActionButton>
          <ActionButton
            variant="danger"
            size="sm"
            icon="trash"
            onClick={() => onDelete(person)}
            title="Delete person"
          >
            Delete
          </ActionButton>
        </div>
      </div>
    </motion.div>
  );
}

export default PersonList;
