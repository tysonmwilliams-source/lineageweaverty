/**
 * DignityEducationPanel.jsx - Educational Reference Panel
 *
 * PURPOSE:
 * A collapsible left-margin panel that explains the hierarchy of dignities,
 * their modern equivalents, and typical responsibilities. Helps users understand
 * the naming conventions and feudal structure.
 *
 * DESIGN:
 * - Collapsible by class (Driht, Ward, Sir, etc.)
 * - Each rank shows: name, modern equivalent, responsibilities
 * - Visual rank indicators (pips)
 * - Follows medieval manuscript aesthetic
 */

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons';
import { DIGNITY_EDUCATION, CLASS_ORDER, DIGNITY_NATURE_EDUCATION, NATURE_ORDER } from '../data/dignityEducation';
import { RankPips } from './DignityVisuals';
import './DignityEducationPanel.css';

// Local storage key for collapse state
const STORAGE_KEY = 'lineageweaver-dignity-education-state';

/**
 * Load saved collapse state from localStorage
 */
function loadCollapseState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  // Default: all collapsed except the first class
  return {
    panel: false,
    classes: {
      crown: true,
      driht: false, // Driht expanded by default
      ward: true,
      sir: true,
      other: true
    }
  };
}

/**
 * Save collapse state to localStorage
 */
function saveCollapseState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

// RankPips was a private copy here (decision G2). The exported one in
// DignityVisuals is a strict superset — it already accepts `count` and `max`,
// which is exactly how this file called it — so the swap needed no API change.
// The two differed only in styling: 6px pips with no glow here, 7px with a
// faint gold glow and three size variants there. The shared one wins, being
// the richer of the two and the one other surfaces already use.

/**
 * Individual rank card
 */
function RankCard({ rank, isExpanded, onToggle }) {
  return (
    <div className={`dignity-education__rank ${isExpanded ? 'dignity-education__rank--expanded' : ''}`}>
      <button
        className="dignity-education__rank-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="dignity-education__rank-title">
          <span className="dignity-education__rank-name">{rank.name}</span>
          <span className="dignity-education__rank-equiv">{rank.modernEquivalent}</span>
        </div>
        <div className="dignity-education__rank-meta">
          <RankPips count={rank.pips} />
          <Icon
            name="chevron-down"
            size={14}
            className={`dignity-education__rank-chevron ${isExpanded ? 'dignity-education__rank-chevron--open' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className="dignity-education__rank-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="dignity-education__rank-inner">
              {/* Pronunciation */}
              {rank.pronunciation && (
                <p className="dignity-education__pronunciation">
                  /{rank.pronunciation}/
                </p>
              )}

              {/* Description */}
              <p className="dignity-education__description">
                {rank.description}
              </p>

              {/* Responsibilities */}
              {rank.responsibilities && rank.responsibilities.length > 0 && (
                <div className="dignity-education__responsibilities">
                  <h5 className="dignity-education__subheading">Responsibilities</h5>
                  <ul className="dignity-education__list">
                    {rank.responsibilities.map((resp, idx) => (
                      <li key={idx}>{resp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Chain of command */}
              <div className="dignity-education__chain">
                {rank.commands && rank.commands !== 'Varies' && (
                  <div className="dignity-education__chain-item">
                    <Icon name="chevrons-down" size={12} />
                    <span className="dignity-education__chain-label">Commands:</span>
                    <span className="dignity-education__chain-value">{rank.commands}</span>
                  </div>
                )}
                {rank.answersTo && rank.answersTo !== 'Varies' && (
                  <div className="dignity-education__chain-item">
                    <Icon name="chevrons-up" size={12} />
                    <span className="dignity-education__chain-label">Answers to:</span>
                    <span className="dignity-education__chain-value">{rank.answersTo}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Class section (e.g., Driht, Ward)
 */
function ClassSection({ classData, isExpanded, onToggle, expandedRanks, onToggleRank }) {
  const ranks = Object.entries(classData.ranks);

  return (
    <div className={`dignity-education__class ${isExpanded ? 'dignity-education__class--expanded' : ''}`}>
      <button
        className="dignity-education__class-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="dignity-education__class-title">
          <Icon name={classData.icon} size={18} className="dignity-education__class-icon" />
          <span className="dignity-education__class-name">{classData.name}</span>
        </div>
        <div className="dignity-education__class-meta">
          <span className="dignity-education__class-equiv">{classData.modernEquivalent}</span>
          <Icon
            name="chevron-down"
            size={16}
            className={`dignity-education__class-chevron ${isExpanded ? 'dignity-education__class-chevron--open' : ''}`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className="dignity-education__class-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="dignity-education__class-inner">
              {/* Class description */}
              <p className="dignity-education__class-description">
                {classData.description}
              </p>
              <p className="dignity-education__class-ref">
                <Icon name="book-open" size={12} />
                {classData.articleRef}
              </p>

              {/* Ranks within this class */}
              <div className="dignity-education__ranks">
                {ranks.map(([rankId, rankData]) => (
                  <RankCard
                    key={rankId}
                    rank={rankData}
                    isExpanded={expandedRanks[rankId] || false}
                    onToggle={() => onToggleRank(rankId)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Nature card component
 */
function NatureCard({ nature, isExpanded, onToggle }) {
  return (
    <div className={`dignity-education__nature ${isExpanded ? 'dignity-education__nature--expanded' : ''}`}>
      <button
        className="dignity-education__nature-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="dignity-education__nature-title">
          <Icon name={nature.icon} size={16} className={`dignity-education__nature-icon dignity-education__nature-icon--${nature.id}`} />
          <span className="dignity-education__nature-name">{nature.name}</span>
        </div>
        <Icon
          name="chevron-down"
          size={14}
          className={`dignity-education__nature-chevron ${isExpanded ? 'dignity-education__nature-chevron--open' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className="dignity-education__nature-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="dignity-education__nature-inner">
              <p className="dignity-education__nature-summary">{nature.summary}</p>
              <p className="dignity-education__description">{nature.description}</p>

              {nature.characteristics && nature.characteristics.length > 0 && (
                <div className="dignity-education__responsibilities">
                  <h5 className="dignity-education__subheading">Characteristics</h5>
                  <ul className="dignity-education__list">
                    {nature.characteristics.map((char, idx) => (
                      <li key={idx}>{char}</li>
                    ))}
                  </ul>
                </div>
              )}

              {nature.examples && nature.examples.length > 0 && (
                <div className="dignity-education__examples">
                  <h5 className="dignity-education__subheading">Examples</h5>
                  <div className="dignity-education__example-list">
                    {nature.examples.map((ex, idx) => (
                      <span key={idx} className="dignity-education__example">{ex}</span>
                    ))}
                  </div>
                </div>
              )}

              {nature.whenToUse && (
                <p className="dignity-education__when-to-use">
                  <Icon name="lightbulb" size={12} />
                  {nature.whenToUse}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Natures section (collapsible)
 */
function NaturesSection({ isExpanded, onToggle, expandedNatures, onToggleNature }) {
  return (
    <div className={`dignity-education__natures-section ${isExpanded ? 'dignity-education__natures-section--expanded' : ''}`}>
      <button
        className="dignity-education__natures-header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <div className="dignity-education__natures-title">
          <Icon name="sparkles" size={18} className="dignity-education__natures-icon" />
          <span>Understanding Dignity Natures</span>
        </div>
        <Icon
          name="chevron-down"
          size={16}
          className={`dignity-education__natures-chevron ${isExpanded ? 'dignity-education__natures-chevron--open' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className="dignity-education__natures-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="dignity-education__natures-inner">
              <p className="dignity-education__natures-intro">
                Every dignity has a <em>nature</em> that determines how it behaves - whether it passes to heirs, tracks who has served, or was granted by someone.
              </p>

              <div className="dignity-education__natures-list">
                {NATURE_ORDER.map(natureId => {
                  const nature = DIGNITY_NATURE_EDUCATION[natureId];
                  if (!nature) return null;

                  return (
                    <NatureCard
                      key={natureId}
                      nature={nature}
                      isExpanded={expandedNatures[natureId] || false}
                      onToggle={() => onToggleNature(natureId)}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Main Education Panel Component
 */
function DignityEducationPanel({ defaultCollapsed = false }) {
  // State for panel and class collapse
  const [state, setState] = useState(() => {
    const saved = loadCollapseState();
    return {
      ...saved,
      panel: defaultCollapsed
    };
  });

  // State for individual rank expansion (not persisted)
  const [expandedRanks, setExpandedRanks] = useState({});

  // State for natures section
  const [naturesExpanded, setNaturesExpanded] = useState(false);
  const [expandedNatures, setExpandedNatures] = useState({});

  // Save state changes
  useEffect(() => {
    saveCollapseState(state);
  }, [state]);

  // Toggle entire panel
  const togglePanel = useCallback(() => {
    setState(prev => ({ ...prev, panel: !prev.panel }));
  }, []);

  // Toggle a class section
  const toggleClass = useCallback((classId) => {
    setState(prev => ({
      ...prev,
      classes: {
        ...prev.classes,
        [classId]: !prev.classes[classId]
      }
    }));
  }, []);

  // Toggle a rank within a class
  const toggleRank = useCallback((rankId) => {
    setExpandedRanks(prev => ({
      ...prev,
      [rankId]: !prev[rankId]
    }));
  }, []);

  // Toggle natures section
  const toggleNaturesSection = useCallback(() => {
    setNaturesExpanded(prev => !prev);
  }, []);

  // Toggle individual nature
  const toggleNature = useCallback((natureId) => {
    setExpandedNatures(prev => ({
      ...prev,
      [natureId]: !prev[natureId]
    }));
  }, []);

  // Expand all
  const expandAll = useCallback(() => {
    const allClasses = {};
    CLASS_ORDER.forEach(id => { allClasses[id] = false; }); // false = expanded
    setState(prev => ({ ...prev, classes: allClasses }));
  }, []);

  // Collapse all
  const collapseAll = useCallback(() => {
    const allClasses = {};
    CLASS_ORDER.forEach(id => { allClasses[id] = true; }); // true = collapsed
    setState(prev => ({ ...prev, classes: allClasses }));
    setExpandedRanks({});
  }, []);

  const isPanelCollapsed = state.panel;

  return (
    <aside className={`dignity-education ${isPanelCollapsed ? 'dignity-education--collapsed' : ''}`}>
      {/* Panel Header */}
      <div className="dignity-education__header">
        <button
          className="dignity-education__toggle"
          onClick={togglePanel}
          title={isPanelCollapsed ? 'Expand guide' : 'Collapse guide'}
        >
          <Icon name="book-marked" size={20} className="dignity-education__header-icon" />
          {!isPanelCollapsed && (
            <span className="dignity-education__header-title">Understanding the Ranks</span>
          )}
          <Icon
            name={isPanelCollapsed ? 'chevron-right' : 'chevron-left'}
            size={16}
            className="dignity-education__header-chevron"
          />
        </button>

        {!isPanelCollapsed && (
          <div className="dignity-education__actions">
            <button
              className="dignity-education__action"
              onClick={expandAll}
              title="Expand all"
            >
              <Icon name="maximize" size={14} />
            </button>
            <button
              className="dignity-education__action"
              onClick={collapseAll}
              title="Collapse all"
            >
              <Icon name="minimize" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Panel Content */}
      <AnimatePresence initial={false}>
        {!isPanelCollapsed && (
          <motion.div
            className="dignity-education__content"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <div className="dignity-education__intro">
              <p>
                This guide explains the hierarchy of titles and their modern equivalents.
                Expand each section to learn more.
              </p>
            </div>

            <div className="dignity-education__classes">
              {/* Natures Section - inside scrollable area */}
              <NaturesSection
                isExpanded={naturesExpanded}
                onToggle={toggleNaturesSection}
                expandedNatures={expandedNatures}
                onToggleNature={toggleNature}
              />
              {CLASS_ORDER.map(classId => {
                const classData = DIGNITY_EDUCATION[classId];
                if (!classData) return null;

                return (
                  <ClassSection
                    key={classId}
                    classData={classData}
                    isExpanded={!state.classes[classId]}
                    onToggle={() => toggleClass(classId)}
                    expandedRanks={expandedRanks}
                    onToggleRank={toggleRank}
                  />
                );
              })}
            </div>

            {/* Quick Reference Footer */}
            <div className="dignity-education__footer">
              <div className="dignity-education__legend">
                <span className="dignity-education__legend-item">
                  <RankPips count={5} max={5} />
                  <span>= Highest Authority</span>
                </span>
                <span className="dignity-education__legend-item">
                  <RankPips count={1} max={5} />
                  <span>= Entry Rank</span>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

export default DignityEducationPanel;
