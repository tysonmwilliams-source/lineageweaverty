/**
 * HeraldryLanding.jsx - The Armory Landing Page
 *
 * PURPOSE:
 * Gallery view for all heraldic devices in Lineageweaver.
 * Features:
 * - Animated hero section with illuminated initial
 * - Statistics dashboard
 * - Search and filter capabilities
 * - Grid gallery of heraldry cards
 * - House coverage progress
 * - Quick actions
 *
 * DESIGN:
 * Follows the medieval manuscript aesthetic established in Home.jsx
 * Uses Lucide icons, Framer Motion animations, and CSS custom properties
 */

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAllHeraldry,
  getHeraldryStatistics,
  deleteHeraldry,
  getHeraldryLinks
} from '../services/heraldryService';
import { getAllHouses, getDatabase } from '../services/database';
import { getAllEntries } from '../services/codexService';
import { useDataset } from '../contexts/DatasetContext';
import { useAuth } from '../contexts/AuthContext';
import { sanitizeSVG } from '../utils/sanitize';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { LoadingState, EmptyState, SectionHeader, Card, ActionButton } from '../components/shared';
import DignityEducationPanel from '../components/DignityEducationPanel';
import useDebouncedValue from '../hooks/useDebouncedValue';
import './HeraldryLanding.css';
import { logger } from '../utils/logger';
import { formatRelativeDate as formatDate } from '../utils/formatDate';

// Animation variants
/**
 * Decision C3, step 1: the dry-run report for the composition migration.
 *
 * Loaded lazily *and* behind `import.meta.env.DEV` on purpose. A plain
 * top-level import would tree-shake the component's JS out of the production
 * bundle but still ship its stylesheet, because a `import './x.css'` is a side
 * effect Rollup keeps regardless of the dead branch — verified: the CSS was in
 * dist/assets before this was changed. Behind a dynamic import the whole chunk,
 * styles included, is unreachable in production and is never emitted.
 *
 * Removed entirely once step 3 lands and applying moves into a real flow.
 */
const CompositionMigrationPanel = import.meta.env.DEV
  ? lazy(() => import('../components/heraldry/CompositionMigrationPanel'))
  : null;

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

// Category configuration with Lucide icons
const CATEGORIES = [
  { value: 'noble', label: 'Noble Houses', icon: 'castle' },
  { value: 'personal', label: 'Personal Arms', icon: 'user' },
  { value: 'ecclesiastical', label: 'Ecclesiastical', icon: 'church' },
  { value: 'civic', label: 'Civic', icon: 'landmark' },
  { value: 'guild', label: 'Guilds', icon: 'hammer' },
  { value: 'fantasy', label: 'Fantasy', icon: 'sparkles' }
];

// Category icon mapping
const CATEGORY_ICONS = {
  noble: 'castle',
  ecclesiastical: 'church',
  civic: 'landmark',
  guild: 'hammer',
  personal: 'user',
  fantasy: 'sparkles'
};

/**
 * HeraldryLanding Component
 */
function HeraldryLanding() {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();
  const { user } = useAuth();

  // State
  const [heraldry, setHeraldry] = useState([]);
  const [houses, setHouses] = useState([]);
  const [heraldryLinks, setHeraldryLinks] = useState([]);
  const [codexEntries, setCodexEntries] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // The filter memo below scans every record; without this it re-ran on
  // every keystroke. The input stays instant, the filtering waits 300ms.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('updated');

  // Load data
  useEffect(() => {
    let cancelled = false;
    const datasetId = activeDataset?.id;

    async function loadData() {
      try {
        setLoading(true);

        const db = getDatabase(datasetId);
        const [heraldryData, housesData, stats, linksData, codexData] = await Promise.all([
          getAllHeraldry(datasetId),
          getAllHouses(datasetId),
          getHeraldryStatistics(datasetId),
          db.heraldryLinks.toArray(),
          getAllEntries(datasetId)
        ]);

        if (cancelled) return;

        setHeraldry(heraldryData);
        setHouses(housesData);
        setStatistics(stats);
        setHeraldryLinks(linksData);
        setCodexEntries(codexData);
        setLoading(false);
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          logger.error('Error loading heraldry data:', error);
        }
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [activeDataset]);

  // Get linked house for a heraldry item
  const getLinkedHouse = useCallback((heraldryId) => {
    const link = heraldryLinks.find(l =>
      l.heraldryId === heraldryId &&
      l.entityType === 'house' &&
      l.linkType === 'primary'
    );

    if (link) {
      return houses.find(h => h.id === link.entityId);
    }

    return houses.find(h => h.heraldryId === heraldryId);
  }, [heraldryLinks, houses]);

  // Get linked codex entry for a heraldry item
  const getLinkedCodexEntry = useCallback((heraldryId) => {
    return codexEntries.find(entry => entry.heraldryId === heraldryId);
  }, [codexEntries]);

  // Filter and sort heraldry
  const filteredHeraldry = useMemo(() => {
    let filtered = [...heraldry];

    // Search filter
    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(h => {
        if (h.name?.toLowerCase().includes(term)) return true;
        if (h.description?.toLowerCase().includes(term)) return true;
        if (h.blazon?.toLowerCase().includes(term)) return true;
        if (h.tags?.some(tag => tag.toLowerCase().includes(term))) return true;
        const linkedHouse = getLinkedHouse(h.id);
        if (linkedHouse?.houseName?.toLowerCase().includes(term)) return true;
        return false;
      });
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(h => h.category === filterCategory);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'created':
          return new Date(b.created) - new Date(a.created);
        case 'house': {
          const houseA = getLinkedHouse(a.id)?.houseName || 'zzz';
          const houseB = getLinkedHouse(b.id)?.houseName || 'zzz';
          return houseA.localeCompare(houseB);
        }
        case 'updated':
        default:
          return new Date(b.updated) - new Date(a.updated);
      }
    });

    return filtered;
  }, [heraldry, debouncedSearchTerm, filterCategory, sortBy, getLinkedHouse]);

  // Houses without heraldry
  const housesWithoutHeraldry = useMemo(() => {
    return houses.filter(house =>
      !house.heraldrySVG && !house.heraldryImageData && !house.heraldryId
    );
  }, [houses]);

  // Coverage percentage
  const coveragePercent = useMemo(() => {
    if (houses.length === 0) return 0;
    return Math.round(((houses.length - housesWithoutHeraldry.length) / houses.length) * 100);
  }, [houses, housesWithoutHeraldry]);

  // Handlers
  const handleCreateHeraldry = useCallback(() => {
    navigate('/heraldry/create');
  }, [navigate]);

  const handleViewHeraldry = useCallback((id) => {
    navigate(`/heraldry/edit/${id}`);
  }, [navigate]);

  const handleEditHeraldry = useCallback((id, event) => {
    event.stopPropagation();
    navigate(`/heraldry/edit/${id}`);
  }, [navigate]);

  const handleDeleteHeraldry = useCallback(async (id, name, event) => {
    event.stopPropagation();

    if (!window.confirm(`Delete "${name}"?\n\nThis will remove the heraldry and unlink it from any houses or people.`)) {
      return;
    }

    try {
      const datasetId = activeDataset?.id;
      // Without userId/datasetId this deleted from the default world and never
      // reached the cloud, so the record came back on the next pull.
      await deleteHeraldry(id, user?.uid, datasetId);
      // Refresh data
      const [heraldryData, stats] = await Promise.all([
        getAllHeraldry(datasetId),
        getHeraldryStatistics(datasetId)
      ]);
      setHeraldry(heraldryData);
      setStatistics(stats);
    } catch (error) {
      logger.error('Error deleting heraldry:', error);
      alert('Failed to delete heraldry');
    }
  }, [user, activeDataset]);

  const handleViewInCodex = useCallback((entryId, event) => {
    event.stopPropagation();
    navigate(`/codex/entry/${entryId}`);
  }, [navigate]);

  const handleCreateCodexEntry = useCallback((heraldryId, heraldryName, event) => {
    event.stopPropagation();
    navigate(`/codex/create?type=heraldry&heraldryId=${heraldryId}&title=${encodeURIComponent(heraldryName)}`);
  }, [navigate]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterCategory('all');
  }, []);

  const handleCreateForHouse = useCallback((house) => {
    navigate(`/heraldry/create?houseId=${house.id}&houseName=${encodeURIComponent(house.houseName)}`);
  }, [navigate]);

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="armory-page">
          <div className="armory-container">
            <LoadingState message="Opening The Armory..." size="lg" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="armory-page">
        <div className="armory-container">
          {/* Education Panel Sidebar */}
          <DignityEducationPanel defaultCollapsed={true} />

          <motion.div
            className="armory-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Hero Section */}
            <motion.header
              className="armory-hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="armory-hero__title">
                <span className="armory-hero__initial">T</span>
                <span>HE ARMORY</span>
              </h1>
              <p className="armory-hero__subtitle">
                A Gallery of Heraldic Devices
              </p>
              <div className="armory-hero__divider">
                <Icon name="shield" size={20} className="armory-hero__divider-icon" />
              </div>
            </motion.header>

            {/* Statistics Dashboard */}
            {statistics && (
              <motion.section
                className="armory-stats"
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                <div className="armory-stats__grid">
                  <motion.div className="armory-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="shield" size={24} className="armory-stats__icon" />
                    <span className="armory-stats__value">{statistics.total}</span>
                    <span className="armory-stats__label">Heraldic Devices</span>
                  </motion.div>
                  <motion.div className="armory-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="castle" size={24} className="armory-stats__icon" />
                    <span className="armory-stats__value">{statistics.linkedHouses}</span>
                    <span className="armory-stats__label">Houses Emblazoned</span>
                  </motion.div>
                  <motion.div className="armory-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="scroll-text" size={24} className="armory-stats__icon" />
                    <span className="armory-stats__value">{statistics.withBlazon}</span>
                    <span className="armory-stats__label">With Blazon</span>
                  </motion.div>
                </div>
              </motion.section>
            )}

            {CompositionMigrationPanel && (
              <Suspense fallback={null}>
                <CompositionMigrationPanel />
              </Suspense>
            )}

            {/* Search & Filters */}
            <motion.section
              className="armory-controls"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <form onSubmit={handleSearchSubmit} className="armory-search">
                <div className="armory-search__wrapper">
                  <Icon name="search" size={20} className="armory-search__icon" />
                  <input
                    type="text"
                    className="armory-search__input"
                    placeholder="Search by name, blazon, house..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </form>

              <div className="armory-filters">
                <div className="armory-filters__select-wrapper">
                  <Icon name="filter" size={16} className="armory-filters__select-icon" />
                  <select
                    className="armory-filters__select"
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                <div className="armory-filters__select-wrapper">
                  <Icon name="arrow-up-down" size={16} className="armory-filters__select-icon" />
                  <select
                    className="armory-filters__select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="updated">Recently Updated</option>
                    <option value="created">Recently Created</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="house">By House</option>
                  </select>
                </div>
              </div>
            </motion.section>

            {/* Main Content */}
            {heraldry.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <EmptyState
                  icon="shield"
                  title="The Armory Awaits"
                  description="No heraldic devices have been created yet. Begin designing coats of arms for your houses and characters."
                  action={{
                    label: 'Create First Heraldry',
                    icon: 'plus',
                    onClick: handleCreateHeraldry
                  }}
                  size="lg"
                >
                  {housesWithoutHeraldry.length > 0 && (
                    <div className="armory-empty__hint">
                      <Icon name="lightbulb" size={18} />
                      <span>
                        You have <strong>{housesWithoutHeraldry.length}</strong> houses without heraldry.
                        Create arms for them to bring your world to life!
                      </span>
                    </div>
                  )}
                </EmptyState>
              </motion.div>
            ) : (
              <motion.section
                className="armory-gallery"
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                <div className="armory-gallery__header">
                  <SectionHeader
                    icon="grid"
                    title={searchTerm || filterCategory !== 'all'
                      ? `${filteredHeraldry.length} Results`
                      : 'All Heraldic Devices'}
                    size="md"
                  />
                  <ActionButton icon="plus" variant="primary" onClick={handleCreateHeraldry}>
                    Create New
                  </ActionButton>
                </div>

                {filteredHeraldry.length === 0 ? (
                  <div className="armory-gallery__empty">
                    <p>No heraldry matches your filters.</p>
                    <button className="armory-gallery__clear" onClick={clearFilters}>
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  <div className="armory-gallery__grid">
                    {filteredHeraldry.map((h, index) => {
                      const linkedHouse = getLinkedHouse(h.id);
                      const codexEntry = getLinkedCodexEntry(h.id);

                      return (
                        <motion.div
                          key={h.id}
                          className="armory-card"
                          variants={CARD_VARIANTS}
                          custom={index}
                          onClick={() => handleViewHeraldry(h.id)}
                          whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        >
                          {/* Shield Display */}
                          <div className="armory-card__shield">
                            {h.heraldrySVG ? (
                              <div
                                className="armory-card__shield-svg"
                                dangerouslySetInnerHTML={{ __html: sanitizeSVG(h.heraldrySVG) }}
                              />
                            ) : h.heraldryDisplay || h.heraldryThumbnail ? (
                              <img
                                src={h.heraldryDisplay || h.heraldryThumbnail}
                                alt={h.name}
                                className="armory-card__shield-img"
                              />
                            ) : (
                              <div className="armory-card__shield-placeholder">
                                <Icon name="shield" size={48} strokeWidth={1} />
                              </div>
                            )}
                          </div>

                          {/* Card Info */}
                          <div className="armory-card__info">
                            <h3 className="armory-card__name">{h.name}</h3>

                            {/* Linked House Display */}
                            {linkedHouse ? (
                              <div className="armory-card__house">
                                <span
                                  className="armory-card__house-dot"
                                  style={{ backgroundColor: linkedHouse.colorCode || 'var(--text-tertiary)' }}
                                />
                                <span className="armory-card__house-name">{linkedHouse.houseName}</span>
                              </div>
                            ) : (
                              <div className="armory-card__unlinked">
                                <span>Not linked</span>
                              </div>
                            )}

                            {h.blazon && (
                              <p className="armory-card__blazon">{h.blazon}</p>
                            )}

                            <div className="armory-card__meta">
                              <Icon name={CATEGORY_ICONS[h.category] || 'shield'} size={14} />
                              <span>{getCategoryName(h.category)}</span>
                            </div>

                            <div className="armory-card__footer">
                              <span className="armory-card__date">
                                Updated {formatDate(h.updated)}
                              </span>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="armory-card__actions">
                            {codexEntry ? (
                              <motion.button
                                className="armory-card__action armory-card__action--codex"
                                onClick={(e) => handleViewInCodex(codexEntry.id, e)}
                                title="View in Codex"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Icon name="scroll-text" size={16} />
                              </motion.button>
                            ) : (
                              <motion.button
                                className="armory-card__action armory-card__action--codex-create"
                                onClick={(e) => handleCreateCodexEntry(h.id, h.name, e)}
                                title="Create Codex Entry"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Icon name="file-plus" size={16} />
                              </motion.button>
                            )}
                            <motion.button
                              className="armory-card__action armory-card__action--edit"
                              onClick={(e) => handleEditHeraldry(h.id, e)}
                              title="Edit"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Icon name="pencil" size={16} />
                            </motion.button>
                            <motion.button
                              className="armory-card__action armory-card__action--delete"
                              onClick={(e) => handleDeleteHeraldry(h.id, h.name, e)}
                              title="Delete"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Icon name="trash-2" size={16} />
                            </motion.button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.section>
            )}

            {/* House Coverage Section */}
            {houses.length > 0 && (
              <motion.section
                className="armory-coverage"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <SectionHeader icon="castle" title="House Heraldry Coverage" size="md" />
                <Card className="armory-coverage__card" padding="lg">
                  <div className="armory-coverage__progress">
                    <div className="armory-coverage__bar">
                      <motion.div
                        className="armory-coverage__fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${coveragePercent}%` }}
                        transition={{ duration: 1, delay: 0.5 }}
                      />
                    </div>
                    <p className="armory-coverage__label">
                      {houses.length - housesWithoutHeraldry.length} of {houses.length} houses have heraldry
                    </p>
                  </div>

                  {housesWithoutHeraldry.length > 0 && (
                    <div className="armory-coverage__awaiting">
                      <h4 className="armory-coverage__awaiting-title">
                        <Icon name="clock" size={16} />
                        Houses Awaiting Arms
                      </h4>
                      <div className="armory-coverage__chips">
                        {housesWithoutHeraldry.slice(0, 8).map(house => (
                          <motion.button
                            key={house.id}
                            className="armory-coverage__chip"
                            style={{ borderColor: house.colorCode || 'var(--border-secondary)' }}
                            onClick={() => handleCreateForHouse(house)}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            {house.houseName}
                          </motion.button>
                        ))}
                        {housesWithoutHeraldry.length > 8 && (
                          <span className="armory-coverage__chip armory-coverage__chip--more">
                            +{housesWithoutHeraldry.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              </motion.section>
            )}

            {/* Action Buttons */}
            <motion.section
              className="armory-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <ActionButton icon="plus" variant="primary" onClick={handleCreateHeraldry}>
                Create New Heraldry
              </ActionButton>

              <ActionButton icon="sparkles" variant="secondary" onClick={() => navigate('/heraldry/charges')}>
                Charges Library
              </ActionButton>

              <ActionButton icon="castle" variant="secondary" onClick={() => navigate('/manage')}>
                Manage Houses
              </ActionButton>

              <ActionButton icon="tree-deciduous" variant="secondary" onClick={() => navigate('/tree')}>
                Family Tree
              </ActionButton>
            </motion.section>

            {/* Footer */}
            <footer className="armory-footer">
              <p>Heraldic achievements for your world</p>
            </footer>
          </motion.div>
        </div>
      </div>
    </>
  );
}

// Helper functions
function getCategoryName(category) {
  const names = {
    noble: 'Noble Houses',
    ecclesiastical: 'Ecclesiastical',
    civic: 'Civic',
    guild: 'Guilds',
    personal: 'Personal Arms',
    fantasy: 'Fantasy'
  };
  return names[category] || category || 'Uncategorized';
}


export default HeraldryLanding;
