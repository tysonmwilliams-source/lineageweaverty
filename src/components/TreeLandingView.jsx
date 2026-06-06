/**
 * TreeLandingView Component
 *
 * Landing page shown when no house is selected on /tree.
 * Displays a hero section with stats, search/filter/sort controls,
 * and a responsive grid of house cards.
 *
 * Follows patterns from DignitiesLanding / HeraldryLanding.
 *
 * Props:
 * - houses: Array of house objects
 * - people: Array of people (for member counts)
 * - onSelectHouse: Callback when a house card is clicked
 */

import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { getHouseColor } from '../utils/themeColors';
import { isBastardCadet } from '../utils/treeHelpers';
import ListSearchBar from './shared/ListSearchBar';
import FilterDropdown from './shared/FilterDropdown';
import SortDropdown from './shared/SortDropdown';
import Icon from './icons';
import './TreeLandingView.css';

// ---- Animation variants (matching other landing pages) ----

const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' }
  }
};

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

// ---- Constants ----

const HOUSE_TYPE_OPTIONS = [
  { value: 'great', label: 'Great House' },
  { value: 'cadet', label: 'Cadet Branch' },
  { value: 'minor', label: 'Minor House' },
  { value: 'vassal', label: 'Vassal House' },
  { value: 'extinct', label: 'Extinct House' }
];

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name A\u2013Z' },
  { value: 'name-desc', label: 'Name Z\u2013A' },
  { value: 'members', label: 'Most Members' },
  { value: 'founded', label: 'Founded (Oldest)' },
  { value: 'type', label: 'By Type' },
  { value: 'lineage', label: 'By Lineage' }
];

const HOUSE_TYPE_SORT_ORDER = { great: 0, cadet: 1, minor: 2, vassal: 3, extinct: 4 };

const HOUSE_TYPE_LABELS = {
  great: 'Great House',
  cadet: 'Cadet Branch',
  minor: 'Minor House',
  vassal: 'Vassal House',
  extinct: 'Extinct House'
};

function TreeLandingView({ houses, people, onSelectHouse }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');

  // Build house lookup for parent references
  const housesById = useMemo(() => {
    const map = new Map();
    houses.forEach(h => map.set(h.id, h));
    return map;
  }, [houses]);

  // Build member count map in O(n)
  const memberCountMap = useMemo(() => {
    const map = new Map();
    people.forEach(p => {
      map.set(p.houseId, (map.get(p.houseId) || 0) + 1);
    });
    return map;
  }, [people]);

  // Total stats
  const totalHouses = houses.length;
  const totalPeople = people.length;

  // Debounced search handler
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const handleDebouncedSearch = useCallback((val) => {
    setDebouncedSearch(val);
  }, []);

  // Filter, sort, and search houses
  const displayedHouses = useMemo(() => {
    let result = [...houses];

    // Filter by type
    if (filterType) {
      result = result.filter(h => h.houseType === filterType);
    }

    // Search by houseName and motto
    if (debouncedSearch) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(h =>
        h.houseName.toLowerCase().includes(term) ||
        (h.motto && h.motto.toLowerCase().includes(term))
      );
    }

    // Sort
    switch (sortBy) {
      case 'name-asc':
        result.sort((a, b) => a.houseName.localeCompare(b.houseName));
        break;
      case 'name-desc':
        result.sort((a, b) => b.houseName.localeCompare(a.houseName));
        break;
      case 'members':
        result.sort((a, b) => (memberCountMap.get(b.id) || 0) - (memberCountMap.get(a.id) || 0));
        break;
      case 'founded':
        result.sort((a, b) => {
          const aYear = parseInt(a.founded) || 9999;
          const bYear = parseInt(b.founded) || 9999;
          return aYear - bYear;
        });
        break;
      case 'type':
        result.sort((a, b) => {
          const aOrder = HOUSE_TYPE_SORT_ORDER[a.houseType] ?? 99;
          const bOrder = HOUSE_TYPE_SORT_ORDER[b.houseType] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.houseName.localeCompare(b.houseName);
        });
        break;
      case 'lineage': {
        // Group cadets directly after their parent house
        const parentHouses = result.filter(h => !h.parentHouseId);
        const cadetsByParent = new Map();
        result.forEach(h => {
          if (h.parentHouseId) {
            const list = cadetsByParent.get(h.parentHouseId) || [];
            list.push(h);
            cadetsByParent.set(h.parentHouseId, list);
          }
        });
        // Sort parents by type then name
        parentHouses.sort((a, b) => {
          const aOrder = HOUSE_TYPE_SORT_ORDER[a.houseType] ?? 99;
          const bOrder = HOUSE_TYPE_SORT_ORDER[b.houseType] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.houseName.localeCompare(b.houseName);
        });
        // Interleave: parent, then its cadets
        result = [];
        parentHouses.forEach(parent => {
          result.push(parent);
          const cadets = cadetsByParent.get(parent.id) || [];
          cadets.sort((a, b) => a.houseName.localeCompare(b.houseName));
          result.push(...cadets);
        });
        // Add orphan cadets (parentHouseId set but parent not in result)
        const addedIds = new Set(result.map(h => h.id));
        houses.forEach(h => {
          if (h.parentHouseId && !addedIds.has(h.id)) {
            result.push(h);
          }
        });
        break;
      }
    }

    return result;
  }, [houses, filterType, debouncedSearch, sortBy, memberCountMap]);

  return (
    <div className="tree-landing">
      {/* Hero Section */}
      <motion.section
        className="tree-landing__hero"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <motion.h1 className="tree-landing__title" variants={ITEM_VARIANTS}>
          <span className="tree-landing__initial">F</span>amily Trees
        </motion.h1>

        <motion.div className="tree-landing__stats" variants={ITEM_VARIANTS}>
          <div className="tree-landing__stat">
            <Icon name="castle" size={18} />
            <span className="tree-landing__stat-value">{totalHouses}</span>
            <span className="tree-landing__stat-label">Houses</span>
          </div>
          <div className="tree-landing__stat-divider" />
          <div className="tree-landing__stat">
            <Icon name="users" size={18} />
            <span className="tree-landing__stat-value">{totalPeople}</span>
            <span className="tree-landing__stat-label">People</span>
          </div>
        </motion.div>

        <motion.p className="tree-landing__subtitle" variants={ITEM_VARIANTS}>
          Select a house to explore its lineage
        </motion.p>
      </motion.section>

      {/* Controls Bar */}
      <motion.div
        className="tree-landing__controls"
        variants={ITEM_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <ListSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          onChangeDebounced={handleDebouncedSearch}
          placeholder="Search houses..."
          debounceMs={300}
        />

        <div className="tree-landing__controls-row">
          <FilterDropdown
            value={filterType}
            onChange={setFilterType}
            options={HOUSE_TYPE_OPTIONS}
            allLabel="All Types"
            icon="filter"
            label="Type:"
          />

          <SortDropdown
            value={sortBy}
            onChange={setSortBy}
            options={SORT_OPTIONS}
            label="Sort:"
          />
        </div>
      </motion.div>

      {/* House Cards Grid */}
      {displayedHouses.length === 0 ? (
        <motion.div
          className="tree-landing__empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Icon name="search" size={32} />
          <p>No houses match your search</p>
          <button
            className="tree-landing__empty-btn"
            onClick={() => {
              setSearchTerm('');
              setDebouncedSearch('');
              setFilterType('');
            }}
          >
            Clear filters
          </button>
        </motion.div>
      ) : (
        <motion.div
          className="tree-landing__grid"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {displayedHouses.map(house => {
            const memberCount = memberCountMap.get(house.id) || 0;
            const houseColor = getHouseColor(house.id);
            const parentHouse = house.parentHouseId ? housesById.get(house.parentHouseId) : null;
            const isBastard = isBastardCadet(house);
            const isCadet = house.houseType === 'cadet' && house.parentHouseId;

            return (
              <motion.div
                key={house.id}
                className={
                  'tree-landing__card' +
                  (isCadet && sortBy === 'lineage' ? ' tree-landing__card--cadet' : '')
                }
                variants={CARD_VARIANTS}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                onClick={() => onSelectHouse(house.id)}
              >
                {/* Color accent bar */}
                <div
                  className="tree-landing__card-accent"
                  style={{ backgroundColor: houseColor }}
                />

                <div className="tree-landing__card-body">
                  {/* Header row */}
                  <div className="tree-landing__card-header">
                    <span
                      className="tree-landing__card-swatch"
                      style={{ backgroundColor: houseColor }}
                    />
                    <h3 className="tree-landing__card-name">{house.houseName}</h3>
                    <span className={`tree-landing__card-badge tree-landing__card-badge--${isBastard ? 'bastard' : house.houseType}`}>
                      {isBastard ? 'Bastard Branch' : (HOUSE_TYPE_LABELS[house.houseType] || house.houseType)}
                    </span>
                  </div>

                  {/* Parent house label for cadet branches */}
                  {parentHouse && (
                    <p className="tree-landing__card-parent">
                      Branch of {parentHouse.houseName}
                    </p>
                  )}

                  {/* Motto */}
                  {house.motto && (
                    <p className="tree-landing__card-motto">"{house.motto}"</p>
                  )}

                  {/* Footer stats */}
                  <div className="tree-landing__card-footer">
                    <span className="tree-landing__card-stat">
                      <Icon name="users" size={13} />
                      {memberCount} {memberCount === 1 ? 'member' : 'members'}
                    </span>
                    {house.founded && (
                      <span className="tree-landing__card-stat">
                        <Icon name="calendar" size={13} />
                        Est. {house.founded}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

export default TreeLandingView;
