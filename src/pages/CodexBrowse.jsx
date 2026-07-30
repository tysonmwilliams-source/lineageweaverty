import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getEntriesByType } from '../services/codexService';
import { getHeraldry } from '../services/heraldryService';
import { useDataset } from '../contexts/DatasetContext';
import { sanitizeSVG } from '../utils/sanitize';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import LoadingState from '../components/shared/LoadingState';
import EmptyState from '../components/shared/EmptyState';
import ActionButton from '../components/shared/ActionButton';
import DignityEducationPanel from '../components/DignityEducationPanel';
import useDebouncedValue from '../hooks/useDebouncedValue';
import './CodexBrowse.css';

/**
 * CodexBrowse - Browse Codex Entries by Type
 *
 * Features:
 * - Filterable, sortable, paginated list of entries
 * - Advanced filtering (search, tags, era)
 * - Sorting (title, date, word count)
 * - Statistics panel
 * - Animated list items
 */

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

const LIST_ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

// Type configuration
const TYPE_CONFIG = {
  all: { icon: 'book-open', label: 'All Entries', singular: 'Entry' },
  personage: { icon: 'user', label: 'Personages', singular: 'Personage' },
  house: { icon: 'castle', label: 'Houses', singular: 'House' },
  location: { icon: 'map-pin', label: 'Locations', singular: 'Location' },
  event: { icon: 'swords', label: 'Events', singular: 'Event' },
  mysteria: { icon: 'sparkles', label: 'Mysteria', singular: 'Mysteria' },
  concept: { icon: 'scroll-text', label: 'Concepts & Laws', singular: 'Entry' },
  heraldry: { icon: 'shield', label: 'Heraldry & Titles', singular: 'Entry' },
  custom: { icon: 'scroll-text', label: 'Entries', singular: 'Entry' }
};

function CodexBrowse() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { activeDataset } = useDataset();

  const [allEntries, setAllEntries] = useState([]);
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [displayedEntries, setDisplayedEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters - initialize search from URL query parameter
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  // The filter memo below scans every record; without this it re-ran on
  // every keystroke. The input stays instant, the filtering waits 300ms.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const [sortBy, setSortBy] = useState('updated');
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedEra, setSelectedEra] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [availableEras, setAvailableEras] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 20;

  // Statistics
  const [statistics, setStatistics] = useState({
    total: 0,
    totalWords: 0
  });

  // Heraldry cache for displaying actual shields
  const [heraldryCache, setHeraldryCache] = useState({});

  // Subsection collapse state (for heraldry & titles)
  const [collapsedSubsections, setCollapsedSubsections] = useState(new Set());

  // Tags filter collapse state (collapsed by default)
  const [tagsExpanded, setTagsExpanded] = useState(false);

  // Get type configuration
  const typeConfig = useMemo(() => {
    return TYPE_CONFIG[type] || TYPE_CONFIG.custom;
  }, [type]);

  // Calculate statistics
  const calculateStatistics = useCallback((entries) => {
    setStatistics({
      total: entries.length,
      totalWords: entries.reduce((sum, e) => sum + (e.wordCount || 0), 0)
    });
  }, []);

  // Load entries
  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);

      const entries = await getEntriesByType(type, activeDataset?.id);
      setAllEntries(entries);

      // Extract unique tags, eras, and categories
      const tags = new Set();
      const eras = new Set();
      const categories = new Set();

      entries.forEach(entry => {
        if (entry.tags) {
          entry.tags.forEach(tag => tags.add(tag));
        }
        if (entry.era) {
          eras.add(entry.era);
        }
        if (entry.category) {
          categories.add(entry.category);
        }
      });

      setAvailableTags(Array.from(tags).sort());
      setAvailableEras(Array.from(eras).sort());
      setAvailableCategories(Array.from(categories).sort());
      calculateStatistics(entries);
      setLoading(false);
    } catch (error) {
      console.error('Error loading entries:', error);
      setLoading(false);
    }
  }, [type, calculateStatistics, activeDataset]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Load heraldry data for entries that have heraldryId (for heraldry type entries)
  useEffect(() => {
    if (type !== 'heraldry') return;

    const loadHeraldryData = async () => {
      const entriesWithHeraldry = allEntries.filter(e => e.heraldryId && !heraldryCache[e.heraldryId]);

      for (const entry of entriesWithHeraldry) {
        try {
          const heraldry = await getHeraldry(entry.heraldryId, activeDataset?.id);
          if (heraldry) {
            setHeraldryCache(prev => ({ ...prev, [entry.heraldryId]: heraldry }));
          }
        } catch (error) {
          console.error('Error loading heraldry:', error);
        }
      }
    };

    loadHeraldryData();
  }, [allEntries, type, activeDataset]);

  // Apply filters and sorting
  const applyFiltersAndSort = useCallback(() => {
    let filtered = [...allEntries];

    // Apply search filter
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.title.toLowerCase().includes(searchLower) ||
        entry.subtitle?.toLowerCase().includes(searchLower) ||
        entry.content?.toLowerCase().includes(searchLower)
      );
    }

    // Apply tag filter
    if (selectedTags.length > 0) {
      filtered = filtered.filter(entry =>
        entry.tags && selectedTags.some(tag => entry.tags.includes(tag))
      );
    }

    // Apply era filter
    if (selectedEra) {
      filtered = filtered.filter(entry => entry.era === selectedEra);
    }

    // Apply category filter
    if (selectedCategory) {
      filtered = filtered.filter(entry => entry.category === selectedCategory);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'updated':
          return new Date(b.updated) - new Date(a.updated);
        case 'wordCount':
          return (b.wordCount || 0) - (a.wordCount || 0);
        default:
          return 0;
      }
    });

    setFilteredEntries(filtered);
    setCurrentPage(1);
  }, [allEntries, debouncedSearchTerm, sortBy, selectedTags, selectedEra, selectedCategory]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  // Paginate entries
  useEffect(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    const endIndex = startIndex + entriesPerPage;
    setDisplayedEntries(filteredEntries.slice(startIndex, endIndex));
  }, [filteredEntries, currentPage]);

  // Handlers
  const handleViewEntry = useCallback((entryId) => {
    navigate(`/codex/entry/${entryId}`);
  }, [navigate]);

  const handleCreateEntry = useCallback(() => {
    navigate(`/codex/create?type=${type}`);
  }, [navigate, type]);

  const handleBackToCodex = useCallback(() => {
    navigate('/codex');
  }, [navigate]);

  const toggleTag = useCallback((tag) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedTags([]);
    setSelectedEra('');
    setSelectedCategory('');
    setSortBy('updated');
  }, []);

  // Toggle subsection collapse (for heraldry & titles)
  const toggleSubsection = useCallback((subsection) => {
    setCollapsedSubsections(prev => {
      const next = new Set(prev);
      if (next.has(subsection)) {
        next.delete(subsection);
      } else {
        next.add(subsection);
      }
      return next;
    });
  }, []);

  // Group entries by subsection (for heraldry and concept types)
  const groupedEntries = useMemo(() => {
    if (type === 'heraldry') {
      return {
        heraldry: filteredEntries.filter(e => e.category !== 'titles'),
        titles: filteredEntries.filter(e => e.category === 'titles')
      };
    }
    if (type === 'concept') {
      return {
        concepts: filteredEntries.filter(e => e.category !== 'laws'),
        laws: filteredEntries.filter(e => e.category === 'laws')
      };
    }
    return null;
  }, [type, filteredEntries]);

  // Format date for display
  const formatDate = useCallback((isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return `${hours}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else if (diffInHours < 168) {
      const days = Math.floor(diffInHours / 24);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  }, []);

  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage);
  const hasFilters = searchTerm || selectedTags.length > 0 || selectedEra || selectedCategory;

  // Subsection header component for heraldry & titles
  const SubsectionHeader = useCallback(({ label, icon, count, collapsed, onToggle }) => (
    <motion.button
      className="browse-subsection-header"
      onClick={onToggle}
      whileHover={{ backgroundColor: 'var(--bg-hover)' }}
      whileTap={{ scale: 0.99 }}
    >
      <motion.div
        className="browse-subsection-header__chevron"
        animate={{ rotate: collapsed ? -90 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <Icon name="chevron-down" size={18} />
      </motion.div>
      <Icon name={icon} size={18} className="browse-subsection-header__icon" />
      <span className="browse-subsection-header__label">{label}</span>
      <span className="browse-subsection-header__count">({count})</span>
    </motion.button>
  ), []);

  // Render entry item (reusable for both grouped and flat lists)
  const renderEntryItem = useCallback((entry, index) => (
    <motion.article
      key={entry.id}
      className="browse-list__item"
      variants={LIST_ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      transition={{ delay: index * 0.03 }}
      onClick={() => handleViewEntry(entry.id)}
      whileHover={{ x: 4 }}
    >
      <div className="browse-list__item-main">
        {/* Show actual heraldry thumbnail for heraldry entries */}
        {type === 'heraldry' && entry.heraldryId && heraldryCache[entry.heraldryId] ? (
          <div className="browse-list__item-heraldry">
            {heraldryCache[entry.heraldryId].heraldrySVG ? (
              <div
                className="browse-list__item-heraldry-svg"
                dangerouslySetInnerHTML={{ __html: sanitizeSVG(heraldryCache[entry.heraldryId].heraldrySVG) }}
              />
            ) : heraldryCache[entry.heraldryId].heraldryDisplay || heraldryCache[entry.heraldryId].heraldryThumbnail ? (
              <img
                src={heraldryCache[entry.heraldryId].heraldryDisplay || heraldryCache[entry.heraldryId].heraldryThumbnail}
                alt={entry.title}
              />
            ) : (
              <Icon name="shield" size={20} />
            )}
          </div>
        ) : (
          <div className="browse-list__item-icon">
            <Icon name={entry.category === 'titles' ? 'crown' : typeConfig.icon} size={20} />
          </div>
        )}
        <div className="browse-list__item-content">
          <h3 className="browse-list__item-title">{entry.title}</h3>
          {entry.subtitle && (
            <p className="browse-list__item-subtitle">{entry.subtitle}</p>
          )}
          {entry.tags && entry.tags.length > 0 && (
            <div className="browse-list__item-tags">
              {entry.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="browse-list__item-tag">
                  {tag}
                </span>
              ))}
              {entry.tags.length > 3 && (
                <span className="browse-list__item-tag-more">
                  +{entry.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="browse-list__item-meta">
        <span className="browse-list__item-meta-item">
          <Icon name="file-text" size={12} />
          <span>{entry.wordCount || 0} words</span>
        </span>
        <span className="browse-list__item-meta-separator">
          <Icon name="circle" size={4} />
        </span>
        <span className="browse-list__item-meta-item">
          <Icon name="clock" size={12} />
          <span>{formatDate(entry.updated)}</span>
        </span>
        {entry.era && (
          <>
            <span className="browse-list__item-meta-separator">
              <Icon name="circle" size={4} />
            </span>
            <span className="browse-list__item-meta-item browse-list__item-meta-era">
              {entry.era}
            </span>
          </>
        )}
      </div>

      <div className="browse-list__item-arrow">
        <Icon name="arrow-right" size={18} />
      </div>
    </motion.article>
  ), [type, heraldryCache, typeConfig.icon, handleViewEntry, formatDate]);

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="browse-page">
          <div className="browse-container">
            <LoadingState message={`Loading ${typeConfig.label}...`} icon={typeConfig.icon} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />

      <div className="browse-page">
        <div className="browse-layout">
          {/* Education Panel Sidebar */}
          <DignityEducationPanel defaultCollapsed={true} />

          <motion.div
            className="browse-container"
            variants={CONTAINER_VARIANTS}
            initial="hidden"
            animate="visible"
          >
            {/* Breadcrumb */}
          <motion.nav className="browse-breadcrumb" variants={ITEM_VARIANTS}>
            <button onClick={handleBackToCodex} className="browse-breadcrumb__link">
              <Icon name="book-open" size={14} />
              <span>The Codex</span>
            </button>
            <Icon name="chevron-right" size={14} className="browse-breadcrumb__separator" />
            <span className="browse-breadcrumb__current">{typeConfig.label}</span>
          </motion.nav>

          {/* Header */}
          <motion.header className="browse-header" variants={ITEM_VARIANTS}>
            <div className="browse-header__main">
              <div className="browse-header__icon">
                <Icon name={typeConfig.icon} size={32} />
              </div>
              <div className="browse-header__text">
                <h1 className="browse-header__title">
                  <span className="browse-header__initial">{typeConfig.label.charAt(0)}</span>
                  {typeConfig.label.slice(1)}
                </h1>
                <p className="browse-header__subtitle">
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
                  {hasFilters && ` (filtered from ${allEntries.length})`}
                </p>
              </div>
            </div>

            <ActionButton
              icon="plus"
              onClick={handleCreateEntry}
              variant="primary"
            >
              Create New
            </ActionButton>
          </motion.header>

          {/* Statistics */}
          <motion.section className="browse-stats" variants={ITEM_VARIANTS}>
            <div className="browse-stats__card">
              <Icon name="scroll-text" size={20} />
              <div className="browse-stats__value">{statistics.total}</div>
              <div className="browse-stats__label">Total Entries</div>
            </div>
            <div className="browse-stats__card">
              <Icon name="file-text" size={20} />
              <div className="browse-stats__value">{statistics.totalWords.toLocaleString()}</div>
              <div className="browse-stats__label">Total Words</div>
            </div>
          </motion.section>

          {/* Filters */}
          <motion.section className="browse-filters" variants={ITEM_VARIANTS}>
            {/* Search */}
            <div className="browse-filters__search">
              <Icon name="search" size={18} className="browse-filters__search-icon" />
              <input
                type="text"
                className="browse-filters__search-input"
                placeholder="Search entries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className="browse-filters__search-clear"
                  onClick={() => setSearchTerm('')}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="browse-filters__group">
              <label className="browse-filters__label">
                <Icon name="arrow-up-down" size={14} />
                <span>Sort:</span>
              </label>
              <select
                className="browse-filters__select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="updated">Recently Updated</option>
                <option value="title">Title (A-Z)</option>
                <option value="wordCount">Word Count</option>
              </select>
            </div>

            {/* Era Filter */}
            {availableEras.length > 0 && (
              <div className="browse-filters__group">
                <label className="browse-filters__label">
                  <Icon name="clock" size={14} />
                  <span>Era:</span>
                </label>
                <select
                  className="browse-filters__select"
                  value={selectedEra}
                  onChange={(e) => setSelectedEra(e.target.value)}
                >
                  <option value="">All Eras</option>
                  {availableEras.map(era => (
                    <option key={era} value={era}>{era}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Category Filter */}
            {availableCategories.length > 0 && (
              <div className="browse-filters__group">
                <label className="browse-filters__label">
                  <Icon name="folder" size={14} />
                  <span>Category:</span>
                </label>
                <select
                  className="browse-filters__select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {availableCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Clear Filters */}
            {hasFilters && (
              <button className="browse-filters__clear" onClick={clearFilters}>
                <Icon name="x-circle" size={14} />
                <span>Clear Filters</span>
              </button>
            )}
          </motion.section>

          {/* Tag Filters - Collapsible */}
          {availableTags.length > 0 && (
            <motion.section className="browse-tags" variants={ITEM_VARIANTS}>
              <button
                className="browse-tags__header"
                onClick={() => setTagsExpanded(!tagsExpanded)}
              >
                <div className="browse-tags__label">
                  <Icon name="tags" size={14} />
                  <span>Filter by tags</span>
                  {selectedTags.length > 0 && (
                    <span className="browse-tags__count">{selectedTags.length} selected</span>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: tagsExpanded ? 0 : -90 }}
                  transition={{ duration: 0.2 }}
                >
                  <Icon name="chevron-down" size={16} />
                </motion.div>
              </button>
              <AnimatePresence>
                {tagsExpanded && (
                  <motion.div
                    className="browse-tags__list"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {availableTags.map(tag => (
                      <button
                        key={tag}
                        className={`browse-tags__item ${selectedTags.includes(tag) ? 'browse-tags__item--active' : ''}`}
                        onClick={() => toggleTag(tag)}
                      >
                        <Icon name="tag" size={12} />
                        <span>{tag}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* Entries List */}
          <AnimatePresence mode="wait">
            {filteredEntries.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <EmptyState
                  icon={typeConfig.icon}
                  title={hasFilters ? 'No Matching Entries' : `No ${typeConfig.label} Yet`}
                  description={
                    hasFilters
                      ? 'Try adjusting your filters or search terms.'
                      : `Create your first ${typeConfig.singular.toLowerCase()} entry to get started.`
                  }
                  action={!hasFilters ? {
                    label: 'Create First Entry',
                    onClick: handleCreateEntry,
                    icon: 'plus'
                  } : undefined}
                />
              </motion.div>
            ) : type === 'heraldry' && groupedEntries ? (
              /* Grouped view for Heraldry & Titles */
              <motion.section
                key="grouped-list"
                className="browse-list browse-list--grouped"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Heraldry Subsection */}
                <div className="browse-subsection">
                  <SubsectionHeader
                    label="Heraldry"
                    icon="shield"
                    count={groupedEntries.heraldry.length}
                    collapsed={collapsedSubsections.has('heraldry')}
                    onToggle={() => toggleSubsection('heraldry')}
                  />
                  <AnimatePresence>
                    {!collapsedSubsections.has('heraldry') && (
                      <motion.div
                        className="browse-subsection__content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {groupedEntries.heraldry.length > 0 ? (
                          groupedEntries.heraldry.map((entry, index) => renderEntryItem(entry, index))
                        ) : (
                          <div className="browse-subsection__empty">
                            <Icon name="shield" size={20} />
                            <span>No heraldry entries yet</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Dignities & Titles Subsection */}
                <div className="browse-subsection">
                  <SubsectionHeader
                    label="Dignities & Titles"
                    icon="crown"
                    count={groupedEntries.titles.length}
                    collapsed={collapsedSubsections.has('titles')}
                    onToggle={() => toggleSubsection('titles')}
                  />
                  <AnimatePresence>
                    {!collapsedSubsections.has('titles') && (
                      <motion.div
                        className="browse-subsection__content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {groupedEntries.titles.length > 0 ? (
                          groupedEntries.titles.map((entry, index) => renderEntryItem(entry, index))
                        ) : (
                          <div className="browse-subsection__empty">
                            <Icon name="crown" size={20} />
                            <span>No titles entries yet</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>
            ) : type === 'concept' && groupedEntries ? (
              /* Grouped view for Concepts & Laws */
              <motion.section
                key="grouped-list-concepts"
                className="browse-list browse-list--grouped"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {/* Concepts Subsection */}
                <div className="browse-subsection">
                  <SubsectionHeader
                    label="Concepts"
                    icon="scroll-text"
                    count={groupedEntries.concepts.length}
                    collapsed={collapsedSubsections.has('concepts')}
                    onToggle={() => toggleSubsection('concepts')}
                  />
                  <AnimatePresence>
                    {!collapsedSubsections.has('concepts') && (
                      <motion.div
                        className="browse-subsection__content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {groupedEntries.concepts.length > 0 ? (
                          groupedEntries.concepts.map((entry, index) => renderEntryItem(entry, index))
                        ) : (
                          <div className="browse-subsection__empty">
                            <Icon name="scroll-text" size={20} />
                            <span>No concept entries yet</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Laws Subsection */}
                <div className="browse-subsection">
                  <SubsectionHeader
                    label="Laws"
                    icon="scale"
                    count={groupedEntries.laws.length}
                    collapsed={collapsedSubsections.has('laws')}
                    onToggle={() => toggleSubsection('laws')}
                  />
                  <AnimatePresence>
                    {!collapsedSubsections.has('laws') && (
                      <motion.div
                        className="browse-subsection__content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {groupedEntries.laws.length > 0 ? (
                          groupedEntries.laws.map((entry, index) => renderEntryItem(entry, index))
                        ) : (
                          <div className="browse-subsection__empty">
                            <Icon name="scale" size={20} />
                            <span>No law entries yet</span>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>
            ) : (
              /* Standard flat list for other types */
              <motion.section
                key="list"
                className="browse-list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {displayedEntries.map((entry, index) => renderEntryItem(entry, index))}
              </motion.section>
            )}
          </AnimatePresence>

          {/* Pagination */}
          {totalPages > 1 && (
            <motion.section className="browse-pagination" variants={ITEM_VARIANTS}>
              <button
                className="browse-pagination__button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <Icon name="chevron-left" size={16} />
                <span>Previous</span>
              </button>

              <div className="browse-pagination__info">
                <span>Page {currentPage} of {totalPages}</span>
              </div>

              <button
                className="browse-pagination__button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <span>Next</span>
                <Icon name="chevron-right" size={16} />
              </button>
            </motion.section>
          )}
        </motion.div>
        </div>
      </div>
    </>
  );
}

export default CodexBrowse;
