/**
 * HouseList.jsx - House List Component
 *
 * PURPOSE:
 * Displays all houses in a list with heraldry thumbnails,
 * edit and delete options, and quick heraldry actions.
 * Includes search and sort functionality.
 *
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 *
 * Props:
 * - houses: Array of house objects
 * - onEdit: Function to call when user wants to edit a house
 * - onDelete: Function to call when user wants to delete a house
 * - onAddHeraldry: Function to handle adding heraldry to a house
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataset } from '../contexts/DatasetContext';
import { getHeraldry } from '../services/heraldryService';
import Icon from './icons';
import EmptyState from './shared/EmptyState';
import ListControls from './shared/ListControls';
import ListSearchBar from './shared/ListSearchBar';
import SortDropdown from './shared/SortDropdown';
import FilterDropdown from './shared/FilterDropdown';
import Pagination from './shared/Pagination';
import { sanitizeSVG } from '../utils/sanitize';
import './HouseList.css';

// ==================== PAGINATION CONFIG ====================
const ITEMS_PER_PAGE = 25;

// ==================== FILTER OPTIONS ====================
const HOUSE_TYPE_OPTIONS = [
  { value: 'great', label: 'Great House' },
  { value: 'cadet', label: 'Cadet Branch' },
  { value: 'minor', label: 'Minor House' },
  { value: 'vassal', label: 'Vassal House' },
  { value: 'extinct', label: 'Extinct House' }
];

const HAS_HERALDRY_OPTIONS = [
  { value: 'yes', label: 'Has Heraldry' },
  { value: 'no', label: 'No Heraldry' }
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
  hidden: { opacity: 0, y: 20 },
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

const EMPTY_VARIANTS = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 300
    }
  }
};

// ==================== SORT OPTIONS ====================
const SORT_OPTIONS = [
  { value: 'name', label: 'House Name (A-Z)' },
  { value: 'nameDesc', label: 'House Name (Z-A)' },
  { value: 'founded', label: 'Founded (Oldest)' },
  { value: 'foundedDesc', label: 'Founded (Newest)' },
  { value: 'type', label: 'By Type' }
];

function HouseList({
  houses,
  onEdit,
  onDelete,
  onAddHeraldry = null,
  onFoundBranch = null
}) {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();

  // ==================== SEARCH & SORT STATE ====================
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name');

  // ==================== FILTER STATE ====================
  const [filterType, setFilterType] = useState('');
  const [filterHasHeraldry, setFilterHasHeraldry] = useState('');

  // ==================== PAGINATION STATE ====================
  const [currentPage, setCurrentPage] = useState(1);

  // Cache heraldry data for houses
  const [heraldryCache, setHeraldryCache] = useState({});
  const [loadingHeraldry, setLoadingHeraldry] = useState({});

  // ==================== FILTERED & SORTED HOUSES ====================
  const filteredAndSortedHouses = useMemo(() => {
    let filtered = [...houses];

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(h =>
        h.houseName?.toLowerCase().includes(search) ||
        h.motto?.toLowerCase().includes(search) ||
        h.notes?.toLowerCase().includes(search) ||
        h.sigil?.toLowerCase().includes(search) ||
        h.houseType?.toLowerCase().includes(search)
      );
    }

    // Apply type filter
    if (filterType) {
      filtered = filtered.filter(h => h.houseType === filterType);
    }

    // Apply heraldry filter
    if (filterHasHeraldry) {
      if (filterHasHeraldry === 'yes') {
        filtered = filtered.filter(h => h.heraldryId || h.heraldryThumbnail || h.heraldryImageData);
      } else if (filterHasHeraldry === 'no') {
        filtered = filtered.filter(h => !h.heraldryId && !h.heraldryThumbnail && !h.heraldryImageData);
      }
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.houseName || '').localeCompare(b.houseName || '');
        case 'nameDesc':
          return (b.houseName || '').localeCompare(a.houseName || '');
        case 'founded':
          return (a.foundedDate || '9999').localeCompare(b.foundedDate || '9999');
        case 'foundedDesc':
          return (b.foundedDate || '').localeCompare(a.foundedDate || '');
        case 'type':
          return (a.houseType || 'zzz').localeCompare(b.houseType || 'zzz');
        default:
          return 0;
      }
    });

    return filtered;
  }, [houses, searchTerm, sortBy, filterType, filterHasHeraldry]);

  // Check if filters are active
  const hasActiveFilters = searchTerm.length > 0 ||
    filterType.length > 0 ||
    filterHasHeraldry.length > 0;

  // ==================== PAGINATION LOGIC ====================
  // Reset page when filters/sort change.
  // This was a useMemo, which runs during render — calling a setter there is a
  // render-phase side effect that forces an extra render and warns in React 19.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, filterType, filterHasHeraldry]);

  // Calculate total pages
  const totalPages = Math.ceil(filteredAndSortedHouses.length / ITEMS_PER_PAGE);

  // Paginate houses
  const paginatedHouses = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedHouses.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAndSortedHouses, currentPage]);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterType('');
    setFilterHasHeraldry('');
    setSortBy('name');
    setCurrentPage(1);
  }, []);

  // ==================== LOAD HERALDRY ====================
  useEffect(() => {
    const datasetId = activeDataset?.id;
    houses.forEach(house => {
      if (house.heraldryId && !heraldryCache[house.heraldryId] && !loadingHeraldry[house.heraldryId]) {
        loadHeraldryForHouse(house.heraldryId, datasetId);
      }
    });
  }, [houses, activeDataset]);

  const loadHeraldryForHouse = async (heraldryId, datasetId) => {
    setLoadingHeraldry(prev => ({ ...prev, [heraldryId]: true }));

    try {
      const heraldry = await getHeraldry(heraldryId, datasetId);
      if (heraldry) {
        setHeraldryCache(prev => ({ ...prev, [heraldryId]: heraldry }));
      }
    } catch (error) {
      console.error('Error loading heraldry:', error);
    } finally {
      setLoadingHeraldry(prev => ({ ...prev, [heraldryId]: false }));
    }
  };

  // ==================== HANDLERS ====================
  const handleHeraldryClick = (house) => {
    if (house.heraldryId) {
      navigate(`/heraldry/edit/${house.heraldryId}`);
    } else {
      navigate(`/heraldry/create?houseId=${house.id}&houseName=${encodeURIComponent(house.houseName)}`);
    }
  };

  const handleAddHeraldry = (house) => {
    if (onAddHeraldry) {
      onAddHeraldry(house);
    } else {
      navigate(`/heraldry/create?houseId=${house.id}&houseName=${encodeURIComponent(house.houseName)}`);
    }
  };

  // ==================== RENDER HELPERS ====================
  const renderHeraldryThumbnail = (house) => {
    const heraldry = house.heraldryId ? heraldryCache[house.heraldryId] : null;
    const isLoading = house.heraldryId && loadingHeraldry[house.heraldryId];
    const legacyImage = house.heraldryThumbnail || house.heraldryImageData;

    if (isLoading) {
      return (
        <div
          className="house-list__heraldry house-list__heraldry--loading"
          style={{ borderColor: house.colorCode || 'var(--border-primary)' }}
          title="Loading heraldry..."
        >
          <Icon name="loader" size={20} className="house-list__heraldry-loader" />
        </div>
      );
    }

    if (heraldry || legacyImage) {
      // Prefer SVG (scales infinitely, transparent background) over PNG thumbnails
      const hasSVG = heraldry?.heraldrySVG;
      const fallbackImage = heraldry?.heraldryThumbnail ||
                           heraldry?.heraldryDisplay ||
                           legacyImage;

      return (
        <motion.div
          className="house-list__heraldry"
          style={{ borderColor: house.colorCode || 'var(--border-primary)' }}
          onClick={() => handleHeraldryClick(house)}
          title={`View heraldry for ${house.houseName}`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {hasSVG ? (
            <div
              className="house-list__heraldry-svg"
              dangerouslySetInnerHTML={{ __html: sanitizeSVG(heraldry.heraldrySVG) }}
            />
          ) : fallbackImage ? (
            <img src={fallbackImage} alt={`${house.houseName} heraldry`} />
          ) : (
            <Icon name="shield" size={24} />
          )}
        </motion.div>
      );
    }

    // No heraldry - show placeholder with add option
    return (
      <motion.div
        className="house-list__heraldry house-list__heraldry--placeholder"
        style={{
          borderColor: house.colorCode || 'var(--border-primary)',
          backgroundColor: house.colorCode ? `${house.colorCode}15` : undefined
        }}
        onClick={() => handleAddHeraldry(house)}
        title={`Add heraldry for ${house.houseName}`}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Icon name="plus" size={24} className="house-list__heraldry-add" />
      </motion.div>
    );
  };

  // ==================== EMPTY STATE ====================
  if (houses.length === 0) {
    return (
      <EmptyState
        icon="castle"
        title="No Houses Yet"
        description="Create your first noble house to start building your dynasty."
      />
    );
  }

  // ==================== RENDER ====================
  return (
    <div className="house-list-container">
      {/* Search, Filter & Sort Controls */}
      <ListControls
        resultCount={filteredAndSortedHouses.length}
        totalCount={houses.length}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={handleClearFilters}
      >
        <ListSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search houses..."
        />
        <FilterDropdown
          value={filterType}
          onChange={setFilterType}
          options={HOUSE_TYPE_OPTIONS}
          label="Type:"
          icon="crown"
          allLabel="All Types"
        />
        <FilterDropdown
          value={filterHasHeraldry}
          onChange={setFilterHasHeraldry}
          options={HAS_HERALDRY_OPTIONS}
          label="Heraldry:"
          icon="shield"
          allLabel="All"
        />
        <SortDropdown
          value={sortBy}
          onChange={setSortBy}
          options={SORT_OPTIONS}
        />
      </ListControls>

      {/* Empty state for filtered results */}
      {filteredAndSortedHouses.length === 0 && hasActiveFilters ? (
        <EmptyState
          icon="search"
          title="No Matching Houses"
          description="Try adjusting your search terms or clear the filters."
        />
      ) : (
        <>
          <motion.div
            className="house-list"
            variants={LIST_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {paginatedHouses.map(house => {
          const heraldry = house.heraldryId ? heraldryCache[house.heraldryId] : null;
          const hasHeraldry = heraldry || house.heraldryThumbnail || house.heraldryImageData;

          return (
            <motion.div
              key={house.id}
              className="house-list__card"
              variants={ITEM_VARIANTS}
              layout
              exit="exit"
            >
              <div className="house-list__card-content">
                {/* Heraldry Thumbnail */}
                {renderHeraldryThumbnail(house)}

                {/* House Info */}
                <div className="house-list__info">
                  <div className="house-list__header">
                    <div
                      className="house-list__color"
                      style={{ backgroundColor: house.colorCode || '#666' }}
                      title="House color"
                    />

                    <h3 className="house-list__name">{house.houseName}</h3>

                    {house.foundedDate && (
                      <span className="house-list__founded">
                        (Founded {house.foundedDate})
                      </span>
                    )}

                    {house.houseType && house.houseType !== 'great' && (
                      <span className="house-list__type">
                        {house.houseType}
                      </span>
                    )}
                  </div>

                  {/* Blazon or Sigil Description */}
                  {(heraldry?.blazon || house.sigil) && (
                    <p className="house-list__blazon">
                      {heraldry?.blazon ? `"${heraldry.blazon}"` : house.sigil}
                    </p>
                  )}

                  {/* Motto */}
                  {house.motto && (
                    <p className="house-list__motto">"{house.motto}"</p>
                  )}

                  {/* Notes preview */}
                  {house.notes && (
                    <p className="house-list__notes">{house.notes}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="house-list__actions">
                  {/* Found Branch button (only for non-extinct houses) */}
                  {onFoundBranch && house.houseType !== 'extinct' && (
                    <motion.button
                      onClick={() => onFoundBranch(house)}
                      className="house-list__btn house-list__btn--branch"
                      title="Found a cadet branch from this house"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon name="git-branch" size={14} />
                      <span>Found Branch</span>
                    </motion.button>
                  )}

                  {/* Add Heraldry button (only if no heraldry) */}
                  {!hasHeraldry && (
                    <motion.button
                      onClick={() => handleAddHeraldry(house)}
                      className="house-list__btn house-list__btn--heraldry"
                      title="Add heraldry"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon name="shield" size={14} />
                      <span>Add Arms</span>
                    </motion.button>
                  )}

                  <motion.button
                    onClick={() => onEdit(house)}
                    className="house-list__btn house-list__btn--edit"
                    title="Edit house"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon name="edit" size={14} />
                    <span>Edit</span>
                  </motion.button>

                  <motion.button
                    onClick={() => onDelete(house)}
                    className="house-list__btn house-list__btn--delete"
                    title="Delete house"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Icon name="trash-2" size={14} />
                    <span>Delete</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
                );
              })}
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

export default HouseList;
