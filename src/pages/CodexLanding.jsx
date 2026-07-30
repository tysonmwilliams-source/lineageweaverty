/**
 * CodexLanding.jsx - Reimagined Codex Landing Page
 *
 * PURPOSE:
 * The main landing page for The Codex system, featuring:
 * - Illuminated hero section with animated title
 * - Statistics dashboard with count-up animations
 * - Quick navigation to content hubs
 * - Browse by category with animated cards
 * - Recent updates feed
 * - Biography coverage stats (Tree-Codex integration)
 *
 * DESIGN:
 * Follows the medieval manuscript aesthetic established in Home.jsx
 * Uses Lucide icons, Framer Motion animations, and CSS custom properties
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAllEntries,
  getCodexStatistics,
} from '../services/codexService';
import { importSeedData, getImportPreview } from '../utils/import-seed-data';
import { useGenealogy } from '../contexts/GenealogyContext';
import { useDataset } from '../contexts/DatasetContext';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import { LoadingState, EmptyState, SectionHeader, Card, ActionButton } from '../components/shared';
import CodexCleanupTool from '../components/CodexCleanupTool';
import './CodexLanding.css';
import { logger } from '../utils/logger';
import { formatRelativeDate as formatDate } from '../utils/formatDate';

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 }
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
  { type: 'personage', label: 'Personages', icon: 'user', color: 'info' },
  { type: 'house', label: 'Houses', icon: 'castle', color: 'warning' },
  { type: 'location', label: 'Locations', icon: 'map-pin', color: 'success' },
  { type: 'event', label: 'Events', icon: 'swords', color: 'error' },
  { type: 'mysteria', label: 'Mysteria', icon: 'sparkles', color: 'primary' },
  { type: 'concept', label: 'Concepts & Laws', icon: 'scroll-text', color: 'info' },
  { type: 'heraldry', label: 'Heraldry & Titles', icon: 'shield', color: 'warning' },
  { type: 'custom', label: 'Custom', icon: 'file', color: 'success' }
];

// Type icon mapping for Lucide
const TYPE_ICONS = {
  personage: 'user',
  house: 'castle',
  location: 'map-pin',
  event: 'swords',
  mysteria: 'sparkles',
  concept: 'scroll-text',
  heraldry: 'shield',
  custom: 'file'
};

/**
 * CodexLanding Component
 */
function CodexLanding() {
  const navigate = useNavigate();
  const { people } = useGenealogy();
  const { activeDataset } = useDataset();

  // State
  const [statistics, setStatistics] = useState(null);
  const [recentEntries, setRecentEntries] = useState([]);
  const [quickNavData, setQuickNavData] = useState({
    majorHouses: [],
    lawAndGovernance: [],
    recentlyEdited: []
  });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCleanupTool, setShowCleanupTool] = useState(false);

  // Load data
  useEffect(() => {
    let cancelled = false;
    const datasetId = activeDataset?.id;

    async function loadCodexData() {
      try {
        setLoading(true);

        const stats = await getCodexStatistics(datasetId);
        if (cancelled) return;
        setStatistics(stats);

        const allEntries = await getAllEntries(datasetId);
        if (cancelled) return;

        // Get recent entries
        const sorted = allEntries.sort(
          (a, b) => new Date(b.updated) - new Date(a.updated)
        );
        setRecentEntries(sorted.slice(0, 5));

        // Build Quick Navigation data
        const majorHouses = allEntries.filter(entry =>
          entry.category === 'Major Houses' ||
          (entry.tags && entry.tags.some(tag =>
            ['major-house', 'drihten', 'great-house'].includes(tag.toLowerCase())
          ))
        ).slice(0, 6);

        const lawAndGovernance = allEntries.filter(entry =>
          entry.category === 'Law & Governance' ||
          (entry.tags && entry.tags.some(tag =>
            ['charter', 'law', 'governance', 'driht', 'ward', 'fealty'].includes(tag.toLowerCase())
          ))
        ).slice(0, 6);

        const recentlyEdited = sorted.slice(0, 4);

        setQuickNavData({
          majorHouses,
          lawAndGovernance,
          recentlyEdited
        });

        setLoading(false);
      } catch (error) {
        if (!cancelled && import.meta.env.DEV) {
          logger.error('Error loading codex data:', error);
        }
        if (!cancelled) setLoading(false);
      }
    }

    loadCodexData();
    return () => { cancelled = true; };
  }, [activeDataset]);

  // Handlers
  const handleImportSeedData = useCallback(async () => {
    const preview = getImportPreview();

    if (!window.confirm(
      `Import House Wilfrey Codex Data\n\n` +
      `This will import ${preview.total} canonical entries:\n` +
      `${preview.houses} Houses\n` +
      `${preview.locations} Locations\n` +
      `${preview.events} Events\n` +
      `${preview.personages} Personages\n` +
      `${preview.mysteria} Mysteria\n\n` +
      `Continue?`
    )) {
      return;
    }

    setImporting(true);

    try {
      const results = await importSeedData();

      // Reload data
      const stats = await getCodexStatistics();
      setStatistics(stats);

      const allEntries = await getAllEntries();
      const sorted = allEntries.sort(
        (a, b) => new Date(b.updated) - new Date(a.updated)
      );
      setRecentEntries(sorted.slice(0, 5));

      alert(
        `Import Successful!\n\n` +
        `Imported ${results.houses.length + results.locations.length + results.events.length + results.personages.length + results.mysteria.length} entries`
      );
    } catch (error) {
      logger.error('Import failed:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  }, []);

  const handleBrowseByType = useCallback((type) => {
    navigate(`/codex/browse/${type}`);
  }, [navigate]);

  const handleCreateEntryOfType = useCallback((type, event) => {
    event.stopPropagation();
    navigate(`/codex/create?type=${type}`);
  }, [navigate]);

  const handleCreateEntry = useCallback(() => {
    navigate('/codex/create');
  }, [navigate]);

  const handleViewEntry = useCallback((entryId) => {
    navigate(`/codex/entry/${entryId}`);
  }, [navigate]);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/codex/browse/all?search=${encodeURIComponent(searchTerm.trim())}`);
    }
  }, [navigate, searchTerm]);

  // Computed values
  const hasQuickNavContent = useMemo(() =>
    quickNavData.majorHouses.length > 0 ||
    quickNavData.lawAndGovernance.length > 0,
    [quickNavData]
  );

  const biographyStats = useMemo(() => {
    if (!people || people.length === 0) return null;
    const withCodex = people.filter(p => p.codexEntryId);
    const withoutCodex = people.filter(p => !p.codexEntryId);
    const percent = Math.round((withCodex.length / people.length) * 100);
    return { total: people.length, withCodex: withCodex.length, withoutCodex: withoutCodex.length, percent };
  }, [people]);

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="codex-page">
          <div className="codex-container">
            <LoadingState message="Opening The Codex..." size="lg" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="codex-page">
        <div className="codex-container">
          <motion.div
            className="codex-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {/* Hero Section */}
            <motion.header
              className="codex-hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="codex-hero__title">
                <span className="codex-hero__initial">T</span>
                <span>HE CODEX</span>
              </h1>
              <p className="codex-hero__subtitle">
                A Chronicle of Houses and Histories
              </p>
              <div className="codex-hero__divider">
                <Icon name="book-open" size={20} className="codex-hero__divider-icon" />
              </div>
            </motion.header>

            {/* Search Section */}
            <motion.section
              className="codex-search"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <form onSubmit={handleSearchSubmit} className="codex-search__form">
                <div className="codex-search__input-wrapper">
                  <Icon name="search" size={20} className="codex-search__icon" />
                  <input
                    type="text"
                    className="codex-search__input"
                    placeholder="Search all entries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </form>
            </motion.section>

            {/* Statistics Dashboard */}
            {statistics && statistics.total > 0 && (
              <motion.section
                className="codex-stats"
                variants={CONTAINER_VARIANTS}
                initial="hidden"
                animate="visible"
              >
                <SectionHeader icon="chart" title="Codex at a Glance" size="md" />
                <div className="codex-stats__grid">
                  <motion.div className="codex-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="file" size={24} className="codex-stats__icon" />
                    <span className="codex-stats__value">{statistics.total}</span>
                    <span className="codex-stats__label">Total Entries</span>
                  </motion.div>
                  <motion.div className="codex-stats__item" variants={ITEM_VARIANTS}>
                    <Icon name="scroll-text" size={24} className="codex-stats__icon" />
                    <span className="codex-stats__value">{statistics.totalWords.toLocaleString()}</span>
                    <span className="codex-stats__label">Words Written</span>
                  </motion.div>
                </div>
              </motion.section>
            )}

            {/* Quick Navigation */}
            {hasQuickNavContent && (
              <motion.section
                className="codex-quicknav"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <SectionHeader icon="zap" title="Quick Navigation" size="md" />
                <div className="codex-quicknav__grid">
                  {/* Major Houses */}
                  {quickNavData.majorHouses.length > 0 && (
                    <Card className="codex-quicknav__column" padding="md">
                      <h3 className="codex-quicknav__heading">
                        <Icon name="castle" size={18} />
                        <span>The Great Houses</span>
                      </h3>
                      <ul className="codex-quicknav__list">
                        {quickNavData.majorHouses.map(entry => (
                          <li key={entry.id}>
                            <button
                              className="codex-quicknav__link"
                              onClick={() => handleViewEntry(entry.id)}
                            >
                              {entry.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {quickNavData.majorHouses.length >= 6 && (
                        <button
                          className="codex-quicknav__more"
                          onClick={() => handleBrowseByType('house')}
                        >
                          View all houses
                          <Icon name="arrow-right" size={14} />
                        </button>
                      )}
                    </Card>
                  )}

                  {/* Law & Governance */}
                  {quickNavData.lawAndGovernance.length > 0 && (
                    <Card className="codex-quicknav__column" padding="md">
                      <h3 className="codex-quicknav__heading">
                        <Icon name="scroll-text" size={18} />
                        <span>Law & Governance</span>
                      </h3>
                      <ul className="codex-quicknav__list">
                        {quickNavData.lawAndGovernance.map(entry => (
                          <li key={entry.id}>
                            <button
                              className="codex-quicknav__link"
                              onClick={() => handleViewEntry(entry.id)}
                            >
                              {entry.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {quickNavData.lawAndGovernance.length >= 6 && (
                        <button
                          className="codex-quicknav__more"
                          onClick={() => handleBrowseByType('concept')}
                        >
                          View all concepts
                          <Icon name="arrow-right" size={14} />
                        </button>
                      )}
                    </Card>
                  )}

                  {/* Recently Edited */}
                  {quickNavData.recentlyEdited.length > 0 && (
                    <Card className="codex-quicknav__column" padding="md">
                      <h3 className="codex-quicknav__heading">
                        <Icon name="clock" size={18} />
                        <span>Recently Edited</span>
                      </h3>
                      <ul className="codex-quicknav__list">
                        {quickNavData.recentlyEdited.map(entry => (
                          <li key={entry.id}>
                            <button
                              className="codex-quicknav__link"
                              onClick={() => handleViewEntry(entry.id)}
                            >
                              <Icon name={TYPE_ICONS[entry.type] || 'file'} size={14} className="codex-quicknav__type-icon" />
                              {entry.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>
              </motion.section>
            )}

            {/* Browse by Category */}
            <motion.section
              className="codex-browse"
              variants={CONTAINER_VARIANTS}
              initial="hidden"
              animate="visible"
            >
              <SectionHeader icon="grid" title="Browse by Category" size="md" />
              <div className="codex-browse__grid">
                {CATEGORIES.map((category, index) => (
                  <motion.div
                    key={category.type}
                    className="codex-browse__card-wrapper"
                    variants={CARD_VARIANTS}
                    custom={index}
                  >
                    <motion.button
                      className={`codex-browse__card codex-browse__card--${category.color}`}
                      onClick={() => handleBrowseByType(category.type)}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Icon name={category.icon} size={36} className="codex-browse__card-icon" strokeWidth={1.5} />
                      <span className="codex-browse__card-label">{category.label}</span>
                      <span className="codex-browse__card-count">
                        {statistics?.byType[category.type] || 0}
                      </span>
                    </motion.button>
                    <motion.button
                      className="codex-browse__create-btn"
                      onClick={(e) => handleCreateEntryOfType(category.type, e)}
                      title={`Create new ${category.label.toLowerCase()} entry`}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon name="plus" size={16} strokeWidth={2.5} />
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Recent Updates */}
            {recentEntries.length > 0 && (
              <motion.section
                className="codex-recent"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                <SectionHeader icon="clock" title="Recently Updated" size="md" />
                <Card className="codex-recent__list" padding="none">
                  {recentEntries.map((entry, index) => (
                    <motion.button
                      key={entry.id}
                      className="codex-recent__item"
                      onClick={() => handleViewEntry(entry.id)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * index }}
                      whileHover={{ backgroundColor: 'var(--bg-tertiary)' }}
                    >
                      <Icon name={TYPE_ICONS[entry.type] || 'file'} size={18} className="codex-recent__icon" />
                      <div className="codex-recent__info">
                        <span className="codex-recent__title">{entry.title}</span>
                        <span className="codex-recent__meta">
                          {entry.type} &bull; {formatDate(entry.updated)}
                        </span>
                      </div>
                      <Icon name="chevron-right" size={16} className="codex-recent__arrow" />
                    </motion.button>
                  ))}
                </Card>
              </motion.section>
            )}

            {/* Biography Coverage Stats */}
            {biographyStats && (
              <motion.section
                className="codex-biography"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <SectionHeader icon="users" title="Biography Coverage" size="md" />
                <Card className="codex-biography__card" padding="lg">
                  <div className="codex-biography__progress">
                    <div className="codex-biography__progress-bar">
                      <motion.div
                        className="codex-biography__progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${biographyStats.percent}%` }}
                        transition={{ duration: 1, delay: 0.6 }}
                      />
                    </div>
                    <p className="codex-biography__progress-label">
                      {biographyStats.percent}% of people have Codex entries
                    </p>
                  </div>

                  <div className="codex-biography__stats">
                    <div className="codex-biography__stat">
                      <span className="codex-biography__stat-value">{biographyStats.total}</span>
                      <span className="codex-biography__stat-label">Total People</span>
                    </div>
                    <div className="codex-biography__stat codex-biography__stat--linked">
                      <span className="codex-biography__stat-value">{biographyStats.withCodex}</span>
                      <span className="codex-biography__stat-label">With Biographies</span>
                    </div>
                    <div className="codex-biography__stat codex-biography__stat--pending">
                      <span className="codex-biography__stat-value">{biographyStats.withoutCodex}</span>
                      <span className="codex-biography__stat-label">Awaiting Entry</span>
                    </div>
                  </div>

                  {biographyStats.withoutCodex > 0 && (
                    <div className="codex-biography__hint">
                      <Icon name="lightbulb" size={18} />
                      <span>
                        {biographyStats.withoutCodex} people need Codex entries.
                        Use the <strong>Migration Tool</strong> in Data Management.
                      </span>
                    </div>
                  )}

                  {biographyStats.withoutCodex === 0 && (
                    <div className="codex-biography__complete">
                      <Icon name="check-circle" size={18} />
                      <span>All people have Codex entries!</span>
                    </div>
                  )}
                </Card>
              </motion.section>
            )}

            {/* Action Buttons */}
            <motion.section
              className="codex-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <ActionButton icon="plus" variant="primary" onClick={handleCreateEntry}>
                Create New Entry
              </ActionButton>

              <ActionButton icon="tree-deciduous" variant="secondary" onClick={() => navigate('/tree')}>
                View Family Trees
              </ActionButton>

              <ActionButton icon="upload" variant="secondary" onClick={() => navigate('/codex/import')}>
                Import Worldbuilding
              </ActionButton>

              <ActionButton
                icon="refresh"
                variant="secondary"
                onClick={() => setShowCleanupTool(!showCleanupTool)}
              >
                {showCleanupTool ? 'Hide Cleanup Tool' : 'Cleanup Duplicates'}
              </ActionButton>

              {statistics && statistics.total === 0 && (
                <ActionButton
                  icon="download"
                  variant="primary"
                  onClick={handleImportSeedData}
                  loading={importing}
                >
                  {importing ? 'Importing...' : 'Import Sample Data'}
                </ActionButton>
              )}
            </motion.section>

            {/* Cleanup Tool */}
            <AnimatePresence>
              {showCleanupTool && (
                <motion.section
                  className="codex-cleanup"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <CodexCleanupTool
                    onCleanupComplete={async () => {
                      const stats = await getCodexStatistics();
                      setStatistics(stats);
                    }}
                  />
                </motion.section>
              )}
            </AnimatePresence>

            {/* Empty State */}
            {statistics && statistics.total === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <EmptyState
                  icon="scroll-text"
                  title="The Codex Awaits"
                  description="Begin documenting your world's history, characters, and lore. Create your first entry to get started."
                  action={{
                    label: 'Create First Entry',
                    icon: 'plus',
                    onClick: handleCreateEntry
                  }}
                  secondaryAction={{
                    label: 'Import Sample Data',
                    icon: 'download',
                    onClick: handleImportSeedData
                  }}
                  size="lg"
                />
              </motion.div>
            )}

            {/* Footer */}
            <footer className="codex-footer">
              <p>A living chronicle of your world</p>
            </footer>
          </motion.div>
        </div>
      </div>
    </>
  );
}

// Helper function to format dates

export default CodexLanding;
