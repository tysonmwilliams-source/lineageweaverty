/**
 * DignitiesLanding.jsx - Titles & Dignities Landing Page
 *
 * PURPOSE:
 * The fifth major system of Lineageweaver, tracking:
 * - Driht authority (lordship by right)
 * - Ward authority (custodial trust)
 * - Sir honour (knightly service)
 * - Feudal hierarchy and sworn bonds
 *
 * Based on "The Codified Charter of Driht, Ward, and Service"
 *
 * DESIGN:
 * Follows the medieval manuscript aesthetic established in Home.jsx
 * Uses Lucide icons, Framer Motion animations, and CSS custom properties
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import {
  getAllDignities,
  getDignityStatistics,
  deleteDignity,
  DIGNITY_CLASSES,
  DIGNITY_RANKS,
  getDignityIcon
} from '../services/dignityService';
import { getAllHouses, getAllPeople } from '../services/database';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { LoadingState, EmptyState, SectionHeader, Card, ActionButton } from '../components/shared';
import { AnalysisSummary, SuggestionsPanel } from '../components/suggestions';
import { useDignityAnalysis } from '../hooks';
import './DignitiesLanding.css';

// Animation variants
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

// Dignity class icons
const CLASS_ICONS = {
  crown: 'crown',
  driht: 'castle',
  ward: 'shield-check',
  sir: 'sword',
  other: 'scroll-text'
};

/**
 * DignitiesLanding Component
 */
function DignitiesLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [dignities, setDignities] = useState([]);
  const [houses, setHouses] = useState([]);
  const [people, setPeople] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [viewMode, setViewMode] = useState('hierarchy');

  // Dignity analysis hook
  const {
    suggestions,
    stats: analysisStats,
    lastAnalyzed,
    loading: analysisLoading,
    runAnalysis,
    applySuggestion,
    dismissSuggestion
  } = useDignityAnalysis({ autoRun: true });

  // Load data
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);

        const [dignitiesData, housesData, peopleData, stats] = await Promise.all([
          getAllDignities(),
          getAllHouses(),
          getAllPeople(),
          getDignityStatistics()
        ]);

        if (cancelled) return;

        setDignities(dignitiesData);
        setHouses(housesData);
        setPeople(peopleData);
        setStatistics(stats);
        setLoading(false);
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          console.error('Error loading dignities data:', error);
        }
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // Helper functions
  const getHouseName = useCallback((houseId) => {
    if (!houseId) return null;
    const house = houses.find(h => h.id === houseId);
    return house?.houseName || null;
  }, [houses]);

  const getPersonName = useCallback((personId) => {
    if (!personId) return null;
    const person = people.find(p => p.id === personId);
    if (!person) return null;
    return `${person.firstName} ${person.lastName}`;
  }, [people]);

  const getHouseColor = useCallback((houseId) => {
    if (!houseId) return 'var(--text-tertiary)';
    const house = houses.find(h => h.id === houseId);
    return house?.colorCode || 'var(--text-tertiary)';
  }, [houses]);

  // Get available ranks for current filter
  const availableRanks = useMemo(() => {
    if (filterClass === 'all') {
      return Object.entries(DIGNITY_RANKS).flatMap(([cls, ranks]) =>
        Object.values(ranks).map(r => ({ ...r, class: cls }))
      );
    }

    const classRanks = DIGNITY_RANKS[filterClass];
    if (!classRanks) return [];
    return Object.values(classRanks).map(r => ({ ...r, class: filterClass }));
  }, [filterClass]);

  // Filter and sort dignities
  const filteredDignities = useMemo(() => {
    let filtered = [...dignities];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(d => {
        if (d.name?.toLowerCase().includes(term)) return true;
        if (d.shortName?.toLowerCase().includes(term)) return true;
        if (d.placeName?.toLowerCase().includes(term)) return true;
        if (d.seatName?.toLowerCase().includes(term)) return true;
        const holderName = getPersonName(d.currentHolderId);
        if (holderName?.toLowerCase().includes(term)) return true;
        const houseName = getHouseName(d.currentHouseId);
        if (houseName?.toLowerCase().includes(term)) return true;
        return false;
      });
    }

    // Class filter
    if (filterClass !== 'all') {
      filtered = filtered.filter(d => d.dignityClass === filterClass);
    }

    // Rank filter
    if (filterRank !== 'all') {
      filtered = filtered.filter(d => d.dignityRank === filterRank);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'rank': {
          const classOrder = { crown: 0, driht: 1, ward: 2, sir: 3, other: 4 };
          const classCompare = (classOrder[a.dignityClass] || 5) - (classOrder[b.dignityClass] || 5);
          if (classCompare !== 0) return classCompare;
          const aRankInfo = DIGNITY_RANKS[a.dignityClass]?.[a.dignityRank];
          const bRankInfo = DIGNITY_RANKS[b.dignityClass]?.[b.dignityRank];
          return (aRankInfo?.order || 99) - (bRankInfo?.order || 99);
        }
        case 'house': {
          const houseA = getHouseName(a.currentHouseId) || 'zzz';
          const houseB = getHouseName(b.currentHouseId) || 'zzz';
          return houseA.localeCompare(houseB);
        }
        case 'created':
          return new Date(b.created) - new Date(a.created);
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

    return filtered;
  }, [dignities, searchTerm, filterClass, filterRank, sortBy, getPersonName, getHouseName]);

  // Build hierarchy tree for hierarchy view
  const hierarchyTree = useMemo(() => {
    if (viewMode !== 'hierarchy') return [];

    const rootDignities = dignities.filter(d =>
      !d.swornToId || d.dignityClass === 'crown'
    );

    function buildNode(dignity) {
      const subordinates = dignities.filter(d => d.swornToId === dignity.id);
      return {
        dignity,
        subordinates: subordinates.map(sub => buildNode(sub))
      };
    }

    return rootDignities.map(d => buildNode(d));
  }, [dignities, viewMode]);

  // Handlers
  const handleCreateDignity = useCallback(() => {
    navigate('/dignities/create');
  }, [navigate]);

  const handleViewDignity = useCallback((id) => {
    navigate(`/dignities/view/${id}`);
  }, [navigate]);

  const handleEditDignity = useCallback((id, event) => {
    event?.stopPropagation();
    navigate(`/dignities/edit/${id}`);
  }, [navigate]);

  const handleDeleteDignity = useCallback(async (id, name, event) => {
    event?.stopPropagation();

    if (!window.confirm(`Delete "${name}"?\n\nThis will remove the dignity and all associated tenure records.`)) {
      return;
    }

    try {
      await deleteDignity(id, user?.uid);
      // Refresh data
      const [dignitiesData, stats] = await Promise.all([
        getAllDignities(),
        getDignityStatistics()
      ]);
      setDignities(dignitiesData);
      setStatistics(stats);
    } catch (error) {
      console.error('Error deleting dignity:', error);
      alert('Failed to delete dignity');
    }
  }, [user?.uid]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterClass('all');
    setFilterRank('all');
  }, []);

  // Helper functions
  function getClassInfo(dignityClass) {
    return DIGNITY_CLASSES[dignityClass] || DIGNITY_CLASSES.other;
  }

  function getRankDisplayName(dignityClass, dignityRank) {
    const classRanks = DIGNITY_RANKS[dignityClass];
    if (!classRanks) return dignityRank || 'Unknown';
    const rankInfo = classRanks[dignityRank];
    return rankInfo?.name || dignityRank || 'Unknown';
  }

  function formatDate(isoString) {
    if (!isoString) return 'Unknown';
    const date = new Date(isoString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  // Render hierarchy node
  function renderHierarchyNode(node, depth = 0) {
    const { dignity, subordinates } = node;
    const icon = getDignityIcon(dignity);
    const holderName = getPersonName(dignity.currentHolderId);
    const houseColor = getHouseColor(dignity.currentHouseId);

    return (
      <div key={dignity.id} className="dignities-hierarchy__node" style={{ marginLeft: depth * 24 }}>
        <motion.div
          className="dignities-hierarchy__card"
          onClick={() => handleViewDignity(dignity.id)}
          whileHover={{ x: 4 }}
          transition={{ duration: 0.2 }}
        >
          {depth > 0 && <div className="dignities-hierarchy__connector" />}

          <span className="dignities-hierarchy__icon">{icon || <Icon name="scroll-text" size={20} />}</span>

          <div className="dignities-hierarchy__info">
            <span className="dignities-hierarchy__name">{dignity.name}</span>
            {holderName && (
              <span className="dignities-hierarchy__holder">
                <span
                  className="dignities-hierarchy__holder-dot"
                  style={{ backgroundColor: houseColor }}
                />
                {holderName}
              </span>
            )}
          </div>

          <span className="dignities-hierarchy__rank">
            {getRankDisplayName(dignity.dignityClass, dignity.dignityRank)}
          </span>
        </motion.div>

        {subordinates.length > 0 && (
          <div className="dignities-hierarchy__children">
            {subordinates.map(sub => renderHierarchyNode(sub, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="dignities-page">
          <div className="dignities-container">
            <LoadingState message="Opening the Rolls of the Realm..." size="lg" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="dignities-page">
        <div className="dignities-container">
          <motion.div
            className="dignities-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Hero Section */}
            <motion.header
              className="dignities-hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="dignities-hero__title">
                <span className="dignities-hero__initial">T</span>
                <span>ITLES & DIGNITIES</span>
              </h1>
              <p className="dignities-hero__subtitle">
                The Rolls of the Realm
              </p>
              <p className="dignities-hero__charter">
                Per the Codified Charter of Driht, Ward, and Service
              </p>
              <div className="dignities-hero__divider">
                <Icon name="crown" size={20} className="dignities-hero__divider-icon" />
              </div>
            </motion.header>

            {/* Statistics Dashboard */}
            {statistics && (
              <motion.section
                className="dignities-stats"
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                <div className="dignities-stats__grid">
                  <motion.div className="dignities-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="scroll-text" size={20} className="dignities-stats__icon" />
                    <span className="dignities-stats__value">{statistics.total}</span>
                    <span className="dignities-stats__label">Dignities</span>
                  </motion.div>
                  <motion.div className="dignities-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="castle" size={20} className="dignities-stats__icon" />
                    <span className="dignities-stats__value">{statistics.byClass?.driht || 0}</span>
                    <span className="dignities-stats__label">Driht Titles</span>
                  </motion.div>
                  <motion.div className="dignities-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="shield-check" size={20} className="dignities-stats__icon" />
                    <span className="dignities-stats__value">{statistics.byClass?.ward || 0}</span>
                    <span className="dignities-stats__label">Ward Titles</span>
                  </motion.div>
                  <motion.div className="dignities-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="sword" size={20} className="dignities-stats__icon" />
                    <span className="dignities-stats__value">{statistics.byClass?.sir || 0}</span>
                    <span className="dignities-stats__label">Knights</span>
                  </motion.div>
                  <motion.div className="dignities-stats__item dignities-stats__item--warning" variants={ITEM_VARIANTS}>
                    <Icon name="circle-alert" size={20} className="dignities-stats__icon" />
                    <span className="dignities-stats__value">{statistics.vacant}</span>
                    <span className="dignities-stats__label">Vacant</span>
                  </motion.div>
                </div>
              </motion.section>
            )}

            {/* Data Quality Analysis */}
            <motion.section
              className="dignities-analysis"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <AnalysisSummary
                stats={analysisStats}
                lastAnalyzed={lastAnalyzed}
                dataSnapshot={{
                  peopleCount: people.length,
                  housesCount: houses.length,
                  dignitiesCount: dignities.length
                }}
                loading={analysisLoading}
                onRunAnalysis={runAnalysis}
                compact
              />
              {suggestions.length > 0 && (
                <SuggestionsPanel
                  suggestions={suggestions.slice(0, 5)}
                  onApply={applySuggestion}
                  onDismiss={dismissSuggestion}
                  compact
                  maxVisible={3}
                />
              )}
              {(analysisStats || suggestions.length > 0) && (
                <div className="dignities-analysis__link">
                  <ActionButton
                    icon="external-link"
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/dignities/analysis')}
                  >
                    View Full Analysis Dashboard
                  </ActionButton>
                </div>
              )}
            </motion.section>

            {/* Search & Controls */}
            <motion.section
              className="dignities-controls"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <form onSubmit={(e) => e.preventDefault()} className="dignities-search">
                <div className="dignities-search__wrapper">
                  <Icon name="search" size={20} className="dignities-search__icon" />
                  <input
                    type="text"
                    className="dignities-search__input"
                    placeholder="Search by name, place, holder, house..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </form>

              <div className="dignities-filters">
                <div className="dignities-filters__select-wrapper">
                  <Icon name="crown" size={16} className="dignities-filters__select-icon" />
                  <select
                    className="dignities-filters__select"
                    value={filterClass}
                    onChange={(e) => {
                      setFilterClass(e.target.value);
                      setFilterRank('all');
                    }}
                  >
                    <option value="all">All Classes</option>
                    {Object.entries(DIGNITY_CLASSES).map(([key, info]) => (
                      <option key={key} value={key}>{info.name}</option>
                    ))}
                  </select>
                </div>

                <div className="dignities-filters__select-wrapper">
                  <Icon name="layers" size={16} className="dignities-filters__select-icon" />
                  <select
                    className="dignities-filters__select"
                    value={filterRank}
                    onChange={(e) => setFilterRank(e.target.value)}
                  >
                    <option value="all">All Ranks</option>
                    {availableRanks.map(rank => (
                      <option key={`${rank.class}-${rank.id}`} value={rank.id}>
                        {rank.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dignities-filters__select-wrapper">
                  <Icon name="arrow-up-down" size={16} className="dignities-filters__select-icon" />
                  <select
                    className="dignities-filters__select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="name">Name (A-Z)</option>
                    <option value="rank">By Rank</option>
                    <option value="house">By House</option>
                    <option value="created">Recently Created</option>
                  </select>
                </div>

                {/* View Mode Toggle */}
                <div className="dignities-view-toggle">
                  <button
                    className={`dignities-view-toggle__btn ${viewMode === 'grid' ? 'dignities-view-toggle__btn--active' : ''}`}
                    onClick={() => setViewMode('grid')}
                    title="Grid View"
                  >
                    <Icon name="grid" size={18} />
                  </button>
                  <button
                    className={`dignities-view-toggle__btn ${viewMode === 'hierarchy' ? 'dignities-view-toggle__btn--active' : ''}`}
                    onClick={() => setViewMode('hierarchy')}
                    title="Hierarchy View"
                  >
                    <Icon name="git-branch" size={18} />
                  </button>
                </div>
              </div>
            </motion.section>

            {/* Main Content */}
            {dignities.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <EmptyState
                  icon="scroll-text"
                  title="No Dignities Recorded"
                  description="The rolls stand empty. Begin recording the titles, offices, and honours of your realm."
                  action={{
                    label: 'Record First Dignity',
                    icon: 'plus',
                    onClick: handleCreateDignity
                  }}
                  size="lg"
                >
                  <div className="dignities-empty__hint">
                    <Icon name="lightbulb" size={18} />
                    <span>Start with your paramount lords, then add their sworn vassals.</span>
                  </div>
                </EmptyState>
              </motion.div>
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <motion.section
                className="dignities-gallery"
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                <div className="dignities-gallery__header">
                  <SectionHeader
                    icon="grid"
                    title={searchTerm || filterClass !== 'all' || filterRank !== 'all'
                      ? `${filteredDignities.length} Results`
                      : 'All Dignities'}
                    size="md"
                  />
                  <ActionButton icon="plus" variant="primary" onClick={handleCreateDignity}>
                    Create New
                  </ActionButton>
                </div>

                {filteredDignities.length === 0 ? (
                  <div className="dignities-gallery__empty">
                    <p>No dignities match your filters.</p>
                    <button className="dignities-gallery__clear" onClick={clearFilters}>
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  <div className="dignities-gallery__grid">
                    {filteredDignities.map((d, index) => {
                      const classInfo = getClassInfo(d.dignityClass);
                      const icon = getDignityIcon(d);
                      const holderName = getPersonName(d.currentHolderId);
                      const houseName = getHouseName(d.currentHouseId);
                      const houseColor = getHouseColor(d.currentHouseId);

                      return (
                        <motion.div
                          key={d.id}
                          className="dignities-card"
                          variants={CARD_VARIANTS}
                          custom={index}
                          onClick={() => handleViewDignity(d.id)}
                          whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        >
                          {/* Class Badge */}
                          <div className={`dignities-card__badge dignities-card__badge--${d.dignityClass}`}>
                            <Icon name={CLASS_ICONS[d.dignityClass] || 'scroll-text'} size={14} />
                            <span>{classInfo.name}</span>
                          </div>

                          {/* Icon */}
                          <div className="dignities-card__icon">
                            {icon || <Icon name="scroll-text" size={32} strokeWidth={1} />}
                          </div>

                          {/* Info */}
                          <div className="dignities-card__info">
                            <h3 className="dignities-card__name">{d.name}</h3>

                            <div className="dignities-card__rank">
                              {getRankDisplayName(d.dignityClass, d.dignityRank)}
                            </div>

                            {/* Holder */}
                            {holderName ? (
                              <div className="dignities-card__holder">
                                <span
                                  className="dignities-card__holder-dot"
                                  style={{ backgroundColor: houseColor }}
                                />
                                <span className="dignities-card__holder-name">{holderName}</span>
                              </div>
                            ) : (
                              <div className="dignities-card__vacant">
                                <Icon name="circle-alert" size={14} />
                                <span>Vacant</span>
                              </div>
                            )}

                            {/* House */}
                            {houseName && (
                              <div className="dignities-card__house">
                                <span
                                  className="dignities-card__house-dot"
                                  style={{ backgroundColor: houseColor }}
                                />
                                <span className="dignities-card__house-name">{houseName}</span>
                              </div>
                            )}

                            {/* Place */}
                            {d.placeName && (
                              <div className="dignities-card__place">
                                <Icon name="map-pin" size={14} />
                                {d.placeName}
                              </div>
                            )}

                            {/* Footer */}
                            <div className="dignities-card__footer">
                              <span className="dignities-card__date">
                                Added {formatDate(d.created)}
                              </span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="dignities-card__actions">
                            <motion.button
                              className="dignities-card__action dignities-card__action--edit"
                              onClick={(e) => handleEditDignity(d.id, e)}
                              title="Edit"
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Icon name="pencil" size={16} />
                            </motion.button>
                            <motion.button
                              className="dignities-card__action dignities-card__action--delete"
                              onClick={(e) => handleDeleteDignity(d.id, d.name, e)}
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
            ) : (
              /* Hierarchy View */
              <motion.section
                className="dignities-hierarchy"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <div className="dignities-hierarchy__header">
                  <SectionHeader icon="git-branch" title="Feudal Hierarchy" size="md" />
                  <ActionButton icon="plus" variant="primary" onClick={handleCreateDignity}>
                    Create New
                  </ActionButton>
                </div>

                <Card className="dignities-hierarchy__tree" padding="md">
                  {hierarchyTree.length === 0 ? (
                    <div className="dignities-hierarchy__empty">
                      <p>No hierarchy established. Create dignities and set their sworn relationships.</p>
                    </div>
                  ) : (
                    <div className="dignities-hierarchy__nodes">
                      {hierarchyTree.map(node => renderHierarchyNode(node))}
                    </div>
                  )}
                </Card>
              </motion.section>
            )}

            {/* Charter Reference */}
            <motion.section
              className="dignities-charter"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <SectionHeader icon="book-open" title="The Seven Articles" size="md" />
              <div className="dignities-charter__grid">
                {[
                  { title: 'Article I - Of Driht', text: 'Defines the hierarchy of lordship: Drihten, Drithen, Drith, Drithling, Drithman' },
                  { title: 'Article II - Of Ward', text: 'Defines custodial authority: Wardyn, Landward, Holdward, Marchward' },
                  { title: 'Article III - Of Sir', text: 'Defines knightly honour without inherent land' },
                  { title: 'Article IV - Of Tenure', text: 'Defines styling conventions: "of", "in", "at", and related forms' },
                  { title: 'Article V - Of Fealty', text: 'All authorities bound by oath; broken fealty forfeits honours' },
                  { title: 'Article VI - Of Cadency', text: 'Rules for cadet houses and derived authority' },
                  { title: 'Article VII - Of Record', text: 'All grants recorded in the rolls of the realm' }
                ].map((article, index) => (
                  <motion.div
                    key={index}
                    className="dignities-charter__article"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                  >
                    <h4 className="dignities-charter__article-title">{article.title}</h4>
                    <p className="dignities-charter__article-text">{article.text}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Action Buttons */}
            <motion.section
              className="dignities-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <ActionButton icon="plus" variant="primary" onClick={handleCreateDignity}>
                Record New Dignity
              </ActionButton>

              <ActionButton icon="tree-deciduous" variant="secondary" onClick={() => navigate('/tree')}>
                Family Tree
              </ActionButton>

              <ActionButton icon="scroll-text" variant="secondary" onClick={() => navigate('/codex')}>
                The Codex
              </ActionButton>

              <ActionButton icon="shield" variant="secondary" onClick={() => navigate('/heraldry')}>
                Heraldry
              </ActionButton>
            </motion.section>

            {/* Footer */}
            <footer className="dignities-footer">
              <p>By right of grant, by honour of service</p>
            </footer>
          </motion.div>
        </div>
      </div>
    </>
  );
}

export default DignitiesLanding;
