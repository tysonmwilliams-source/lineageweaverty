/**
 * HeraldryPickerModal.jsx
 *
 * A reusable modal for selecting existing heraldry to link to an entity
 * (house, person, location, event). Used in HouseForm, PersonForm, etc.
 *
 * PHASE 5: Deep Integration - Batch 1
 * Updated: Phase 4 UI/UX Overhaul - Framer Motion, BEM, Lucide Icons
 *
 * Features:
 * - Search by name, blazon, tags
 * - Filter by category
 * - Preview on selection
 * - Shows which entities already use each heraldry
 * - Supports future person heraldry (Phase 4 hooks)
 * - Uses CSS custom properties for theming
 * - Framer Motion animations
 *
 * Props:
 * - isOpen: Boolean to control visibility
 * - onClose: Function to close modal
 * - onSelect: Function called with selected heraldry when confirmed
 * - entityType: 'house' | 'person' | 'location' | 'event' (for context display)
 * - entityName: Name of entity being linked (for display)
 * - excludeHeraldryId: Optional ID to exclude from list (e.g., current heraldry)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataset } from '../../contexts/DatasetContext';
import { getAllHeraldry } from '../../services/heraldryService';
import { getDatabase } from '../../services/database';
import Icon from '../icons';
import ActionButton from '../shared/ActionButton';
import LoadingState from '../shared/LoadingState';
import { sanitizeSVG } from '../../utils/sanitize';
import EmptyState from '../shared/EmptyState';
import './HeraldryPickerModal.css';
import { logger } from '../../utils/logger';

// ==================== ANIMATION VARIANTS ====================
const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 }
  }
};

const MODAL_VARIANTS = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 300,
      delay: 0.05
    }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.15 }
  }
};

const GRID_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03
    }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  }
};

const PREVIEW_VARIANTS = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 200
    }
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.15 }
  }
};

// ==================== ICON MAPPINGS ====================
const ENTITY_TYPE_ICONS = {
  house: 'castle',
  person: 'user',
  location: 'map-pin',
  event: 'calendar'
};

function HeraldryPickerModal({
  isOpen,
  onClose,
  onSelect,
  entityType = 'house',
  entityName = '',
  excludeHeraldryId = null
}) {
  // ==================== CONTEXT ====================
  const { activeDataset } = useDataset();

  // ==================== STATE ====================
  const [allHeraldry, setAllHeraldry] = useState([]);
  const [heraldryLinks, setHeraldryLinks] = useState([]);
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedHeraldry, setSelectedHeraldry] = useState(null);

  // ==================== DATA LOADING ====================
  useEffect(() => {
    if (isOpen) {
      loadData();
      // Reset selection when opening
      setSelectedHeraldry(null);
      setSearchTerm('');
      setCategoryFilter('all');
    }
  }, [isOpen, activeDataset]);

  const loadData = async () => {
    const datasetId = activeDataset?.id;
    const db = getDatabase(datasetId);

    try {
      setLoading(true);

      // Load all heraldry
      const heraldryData = await getAllHeraldry(datasetId);
      setAllHeraldry(heraldryData);

      // Load all links to show which entities use which heraldry
      const links = await db.heraldryLinks.toArray();
      setHeraldryLinks(links);

      // Load houses for displaying linked house names
      const housesData = await db.houses.toArray();
      setHouses(housesData);

    } catch (error) {
      logger.error('Error loading heraldry data:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FILTERING ====================
  const categories = useMemo(() => {
    const cats = new Set(allHeraldry.map(h => h.category || 'uncategorized'));
    return ['all', ...Array.from(cats).sort()];
  }, [allHeraldry]);

  const filteredHeraldry = useMemo(() => {
    let results = allHeraldry;

    // Exclude specified heraldry (e.g., already linked)
    if (excludeHeraldryId) {
      results = results.filter(h => h.id !== excludeHeraldryId);
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      results = results.filter(h => (h.category || 'uncategorized') === categoryFilter);
    }

    // Apply search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      results = results.filter(h => {
        if (h.name?.toLowerCase().includes(term)) return true;
        if (h.blazon?.toLowerCase().includes(term)) return true;
        if (h.description?.toLowerCase().includes(term)) return true;
        if (h.tags?.some(tag => tag.toLowerCase().includes(term))) return true;
        return false;
      });
    }

    // Sort by name
    results.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return results;
  }, [allHeraldry, excludeHeraldryId, categoryFilter, searchTerm]);

  // ==================== HELPERS ====================

  // Get linked entities for a heraldry item
  const getLinkedEntities = (heraldryId) => {
    const links = heraldryLinks.filter(l => l.heraldryId === heraldryId);

    return links.map(link => {
      if (link.entityType === 'house') {
        const house = houses.find(h => h.id === link.entityId);
        return {
          type: 'house',
          name: house?.houseName || 'Unknown House',
          linkType: link.linkType
        };
      }
      // Future: handle person, location, event
      return {
        type: link.entityType,
        name: `${link.entityType} #${link.entityId}`,
        linkType: link.linkType
      };
    });
  };

  // Get fallback image for heraldry (used when SVG not available)
  const getHeraldryFallbackImage = (heraldry) => {
    return heraldry.heraldryDisplay ||
           heraldry.heraldryThumbnail ||
           heraldry.heraldryImageData ||
           null;
  };

  // ==================== HANDLERS ====================
  const handleSelect = (heraldry) => {
    setSelectedHeraldry(heraldry);
  };

  const handleConfirm = () => {
    if (selectedHeraldry && onSelect) {
      onSelect(selectedHeraldry);
    }
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // ==================== RENDER ====================
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="heraldry-picker__overlay"
          onClick={onClose}
          variants={OVERLAY_VARIANTS}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="heraldry-picker__modal"
            onClick={(e) => e.stopPropagation()}
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >

            {/* Header */}
            <div className="heraldry-picker__header">
              <div className="heraldry-picker__header-row">
                <div className="heraldry-picker__header-info">
                  <h2 className="heraldry-picker__title">
                    <Icon name="shield" size={22} />
                    <span>Select Heraldry</span>
                  </h2>
                  {entityName && (
                    <p className="heraldry-picker__subtitle">
                      <Icon name={ENTITY_TYPE_ICONS[entityType] || 'link'} size={14} />
                      <span>Linking to: {entityName}</span>
                    </p>
                  )}
                </div>
                <button
                  className="heraldry-picker__close-btn"
                  onClick={onClose}
                  title="Close (Esc)"
                  aria-label="Close modal"
                >
                  <Icon name="x" size={20} />
                </button>
              </div>

              {/* Search and Filter */}
              <div className="heraldry-picker__controls">
                <div className="heraldry-picker__search-wrapper">
                  <Icon name="search" size={18} className="heraldry-picker__search-icon" />
                  <input
                    type="text"
                    className="heraldry-picker__search"
                    placeholder="Search by name, blazon, tags..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      className="heraldry-picker__search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  )}
                </div>
                <div className="heraldry-picker__filter-wrapper">
                  <Icon name="filter" size={18} className="heraldry-picker__filter-icon" />
                  <select
                    className="heraldry-picker__filter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat === 'all' ? 'All Categories' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="heraldry-picker__content">
              {/* Heraldry List */}
              <div className={`heraldry-picker__list ${selectedHeraldry ? 'heraldry-picker__list--has-selection' : ''}`}>
                {loading ? (
                  <LoadingState
                    message="Loading heraldry collection..."
                    icon="shield"
                  />
                ) : filteredHeraldry.length === 0 ? (
                  <EmptyState
                    icon="search"
                    title="No heraldry found"
                    description={
                      searchTerm || categoryFilter !== 'all'
                        ? 'No heraldry matches your search criteria'
                        : 'No heraldry available in the collection'
                    }
                  />
                ) : (
                  <motion.div
                    className="heraldry-picker__grid"
                    variants={GRID_VARIANTS}
                    initial="hidden"
                    animate="visible"
                  >
                    {filteredHeraldry.map(heraldry => {
                      const isSelected = selectedHeraldry?.id === heraldry.id;
                      const linkedEntities = getLinkedEntities(heraldry.id);
                      const fallbackImage = getHeraldryFallbackImage(heraldry);

                      return (
                        <motion.div
                          key={heraldry.id}
                          className={`heraldry-picker__item ${isSelected ? 'heraldry-picker__item--selected' : ''}`}
                          onClick={() => handleSelect(heraldry)}
                          variants={ITEM_VARIANTS}
                          whileHover={{ y: -2, scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {/* Thumbnail - prefer SVG */}
                          <div className="heraldry-picker__item-thumb">
                            {heraldry.heraldrySVG ? (
                              <div
                                className="heraldry-picker__item-svg"
                                dangerouslySetInnerHTML={{ __html: sanitizeSVG(heraldry.heraldrySVG) }}
                              />
                            ) : fallbackImage ? (
                              <img src={fallbackImage} alt={heraldry.name} />
                            ) : (
                              <Icon name="shield" size={32} className="heraldry-picker__item-placeholder" />
                            )}
                          </div>

                          {/* Name */}
                          <div className="heraldry-picker__item-name">
                            {heraldry.name || 'Untitled Arms'}
                          </div>

                          {/* Linked indicator */}
                          {linkedEntities.length > 0 && (
                            <div className="heraldry-picker__item-linked">
                              <Icon name="link" size={12} />
                              <span>{linkedEntities.length} linked</span>
                            </div>
                          )}

                          {/* Selection indicator */}
                          {isSelected && (
                            <div className="heraldry-picker__item-badge">
                              <Icon name="check" size={14} />
                              <span>Selected</span>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </div>

              {/* Preview Panel (shows when selected) */}
              <AnimatePresence>
                {selectedHeraldry && (
                  <motion.div
                    className="heraldry-picker__preview"
                    variants={PREVIEW_VARIANTS}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <h3 className="heraldry-picker__preview-title">
                      <Icon name="eye" size={16} />
                      <span>Preview</span>
                    </h3>

                    {/* Large preview image - prefer SVG */}
                    <div className="heraldry-picker__preview-image">
                      {selectedHeraldry.heraldrySVG ? (
                        <div
                          className="heraldry-picker__preview-svg"
                          dangerouslySetInnerHTML={{ __html: sanitizeSVG(selectedHeraldry.heraldrySVG) }}
                        />
                      ) : selectedHeraldry.heraldryHighRes || selectedHeraldry.heraldryDisplay ? (
                        <img
                          src={selectedHeraldry.heraldryHighRes || selectedHeraldry.heraldryDisplay}
                          alt={selectedHeraldry.name}
                        />
                      ) : (
                        <Icon name="shield" size={64} className="heraldry-picker__preview-placeholder" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="heraldry-picker__preview-name">
                      {selectedHeraldry.name || 'Untitled Arms'}
                    </div>
                    {selectedHeraldry.category && (
                      <div className="heraldry-picker__preview-category">
                        <Icon name="tag" size={12} />
                        <span>{selectedHeraldry.category}</span>
                      </div>
                    )}

                    {/* Blazon */}
                    {selectedHeraldry.blazon && (
                      <div className="heraldry-picker__preview-blazon">
                        <div className="heraldry-picker__preview-blazon-label">
                          <Icon name="scroll-text" size={12} />
                          <span>Blazon</span>
                        </div>
                        <div className="heraldry-picker__preview-blazon-text">
                          {selectedHeraldry.blazon}
                        </div>
                      </div>
                    )}

                    {/* Linked entities */}
                    {(() => {
                      const linked = getLinkedEntities(selectedHeraldry.id);
                      if (linked.length === 0) return null;

                      return (
                        <div className="heraldry-picker__preview-linked">
                          <div className="heraldry-picker__preview-linked-label">
                            <Icon name="link" size={12} />
                            <span>Currently Linked To</span>
                          </div>
                          {linked.map((entity, idx) => (
                            <div key={idx} className="heraldry-picker__preview-linked-item">
                              <Icon
                                name={ENTITY_TYPE_ICONS[entity.type] || 'link'}
                                size={14}
                              />
                              <span className="heraldry-picker__preview-linked-name">
                                {entity.name}
                              </span>
                              {entity.linkType !== 'primary' && (
                                <span className="heraldry-picker__preview-linked-type">
                                  {entity.linkType}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Shield type */}
                    {selectedHeraldry.shieldType && (
                      <div className="heraldry-picker__preview-shield">
                        <Icon name="shield" size={12} />
                        <span>Shield: {selectedHeraldry.shieldType.charAt(0).toUpperCase() + selectedHeraldry.shieldType.slice(1)}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="heraldry-picker__footer">
              <div className="heraldry-picker__count">
                <Icon name="shield" size={16} />
                <span>
                  {filteredHeraldry.length} heraldic device{filteredHeraldry.length !== 1 ? 's' : ''} available
                </span>
              </div>

              <div className="heraldry-picker__actions">
                <ActionButton
                  variant="ghost"
                  onClick={onClose}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  variant="primary"
                  icon="link"
                  onClick={handleConfirm}
                  disabled={!selectedHeraldry}
                >
                  Link Selected
                </ActionButton>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HeraldryPickerModal;
