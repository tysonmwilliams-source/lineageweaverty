import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getEntry, getAllLinksForEntry, getEntry as getBacklinkEntry, updateEntry, deleteEntry } from '../services/codexService';
import { getHeraldry } from '../services/heraldryService';
import { getDatabase } from '../services/database';
import { useDataset } from '../contexts/DatasetContext';
import { parseWikiLinks, getContextSnippet } from '../utils/wikiLinkParser';
import { getPrimaryEpithet } from '../utils/epithetUtils';
import { sanitizeSVG, sanitizeHTML } from '../utils/sanitize';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import LoadingState from '../components/shared/LoadingState';
import EmptyState from '../components/shared/EmptyState';
import ActionButton from '../components/shared/ActionButton';
import './CodexEntryView.css';

/**
 * CodexEntryView - Detail View for Codex Entries
 *
 * Displays a single codex entry with:
 * - Rendered markdown content with wiki-links
 * - Entry metadata (type, tags, era)
 * - Backlinks panel showing entries that reference this one
 * - Linked heraldry display
 * - Epithets for personage entries
 */

// Animation variants
const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }
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

// Entry type configuration
const TYPE_CONFIG = {
  personage: { icon: 'user', label: 'Personage' },
  house: { icon: 'castle', label: 'House' },
  location: { icon: 'map-pin', label: 'Location' },
  event: { icon: 'swords', label: 'Event' },
  mysteria: { icon: 'sparkles', label: 'Mysteria' },
  concept: { icon: 'scroll-text', label: 'Concept' },
  heraldry: { icon: 'shield', label: 'Heraldry' },
  custom: { icon: 'scroll-text', label: 'Entry' }
};

function CodexEntryView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeDataset } = useDataset();

  const [entry, setEntry] = useState(null);
  const [renderedContent, setRenderedContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Backlinks state
  const [backlinks, setBacklinks] = useState([]);
  const [backlinkDetails, setBacklinkDetails] = useState([]);
  const [loadingBacklinks, setLoadingBacklinks] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  // Linked heraldry state
  const [linkedHeraldry, setLinkedHeraldry] = useState(null);
  const [loadingHeraldry, setLoadingHeraldry] = useState(false);

  // Linked person data for personage entries
  const [linkedPerson, setLinkedPerson] = useState(null);

  // Load linked heraldry record
  const loadLinkedHeraldry = useCallback(async (heraldryId) => {
    try {
      setLoadingHeraldry(true);
      const heraldryData = await getHeraldry(heraldryId, activeDataset?.id);
      setLinkedHeraldry(heraldryData);
    } catch (err) {
      console.error('Error loading linked heraldry:', err);
      setLinkedHeraldry(null);
    } finally {
      setLoadingHeraldry(false);
    }
  }, [activeDataset]);

  // Load backlinks for the entry
  const loadBacklinks = useCallback(async (entryData) => {
    try {
      setLoadingBacklinks(true);
      const datasetId = activeDataset?.id;

      const links = await getAllLinksForEntry(entryData.id, datasetId);
      const incomingLinks = links.incoming || [];

      setBacklinks(incomingLinks);

      if (incomingLinks.length > 0) {
        const details = await Promise.all(
          incomingLinks.map(async (link) => {
            // Use referringEntryId which handles both traditional and bidirectional links
            // For incoming links: referringEntryId = sourceId (the entry that contains [[this entry]])
            // For bidirectional outgoing: referringEntryId = targetId (the entry we link to)
            const referringId = link.referringEntryId || link.sourceId;
            const referringEntry = await getBacklinkEntry(referringId, datasetId);
            
            // Get context snippet - for bidirectional outgoing links, we look for
            // mentions of the referring entry in OUR content instead
            let snippet = '';
            if (link.direction === 'outgoing-bidirectional') {
              // This entry links TO referringEntry, so look in THIS entry's content
              snippet = getContextSnippet(entryData.content, referringEntry.title);
            } else {
              // Traditional incoming: referringEntry links TO us, look in THEIR content
              snippet = getContextSnippet(referringEntry.content, entryData.title);
            }

            return {
              ...link,
              entry: referringEntry,
              snippet: snippet
            };
          })
        );

        setBacklinkDetails(details);
      }

      setLoadingBacklinks(false);
    } catch (err) {
      console.error('Error loading backlinks:', err);
      setLoadingBacklinks(false);
    }
  }, [activeDataset]);

  // Load the main entry
  const loadEntry = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const datasetId = activeDataset?.id;
      const db = getDatabase(datasetId);

      const entryData = await getEntry(parseInt(id), datasetId);

      if (!entryData) {
        setError('Entry not found');
        setLoading(false);
        return;
      }

      setEntry(entryData);

      // DEBUG: Log raw content to see what's stored
      console.log('📝 RAW CONTENT for', entryData.title, ':', entryData.content?.substring(0, 200));
      console.log('📝 Content starts with spaces?', entryData.content?.match(/^[ \t]+/));
      console.log('📝 Content has code fence?', entryData.content?.includes('```'));

      // Parse markdown and process wiki-links
      const html = await parseWikiLinks(entryData.content, entryData.id, datasetId);

      // DEBUG: Log parsed HTML
      console.log('📝 PARSED HTML:', html?.substring(0, 300));

      setRenderedContent(html);

      // Load backlinks
      await loadBacklinks(entryData);

      // Load linked heraldry if entry has heraldryId
      if (entryData.heraldryId) {
        await loadLinkedHeraldry(entryData.heraldryId);
      } else {
        setLinkedHeraldry(null);
      }

      // Load linked person data for personage entries
      if (entryData.type === 'personage') {
        try {
          let personData = null;

          if (entryData.personId) {
            // Use explicit personId if available
            personData = await db.people.get(entryData.personId);
          } else {
            // Try to find matching person by title (firstName lastName)
            const allPeople = await db.people.toArray();
            const titleLower = entryData.title.toLowerCase().trim();
            personData = allPeople.find(p => {
              const fullName = `${p.firstName} ${p.lastName}`.toLowerCase().trim();
              return fullName === titleLower;
            });

            if (personData) {
              console.log(`🔗 Auto-matched codex entry "${entryData.title}" to person ID ${personData.id}`);
            }
          }

          setLinkedPerson(personData || null);
        } catch (err) {
          console.error('Error loading linked person:', err);
          setLinkedPerson(null);
        }
      } else {
        setLinkedPerson(null);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading entry:', err);
      setError('Failed to load entry');
      setLoading(false);
    }
  }, [id, loadBacklinks, loadLinkedHeraldry, activeDataset]);

  useEffect(() => {
    loadEntry();
  }, [loadEntry]);

  // Navigation handlers
  const handleEdit = useCallback(() => {
    navigate(`/codex/edit/${id}`);
  }, [navigate, id]);

  const handleBackToCodex = useCallback(() => {
    navigate('/codex');
  }, [navigate]);

  const handleViewInFamilyTree = useCallback(() => {
    // Navigate to tree with person ID for highlighting
    // Use explicit personId if available, otherwise use auto-matched linkedPerson
    const personId = entry?.personId || linkedPerson?.id;
    if (personId) {
      navigate(`/tree/${personId}`);
    } else {
      navigate('/tree');
    }
  }, [navigate, entry?.personId, linkedPerson?.id]);

  const handleViewInArmory = useCallback(() => {
    if (entry?.heraldryId) {
      navigate(`/heraldry/edit/${entry.heraldryId}`);
    }
  }, [navigate, entry?.heraldryId]);

  // Delete this codex entry
  const handleDelete = useCallback(async () => {
    if (!entry) return;
    if (!window.confirm(`Delete "${entry.title}"?\n\nThis action cannot be undone.`)) return;

    try {
      await deleteEntry(parseInt(id), activeDataset?.id);
      navigate('/codex');
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('Failed to delete entry: ' + err.message);
    }
  }, [entry, id, activeDataset?.id, navigate]);

  // Move mysteria entry to Dignities & Titles subsection
  const handleMoveToTitles = useCallback(async () => {
    if (!entry || entry.type !== 'mysteria') return;

    if (!window.confirm(`Move "${entry.title}" to Dignities & Titles?\n\nThis will move this entry from Mysteria to the Dignities & Titles subsection under Heraldry & Titles.`)) {
      return;
    }

    try {
      await updateEntry(parseInt(id), {
        type: 'heraldry',
        category: 'titles'
      }, activeDataset?.id);

      // Update local state to reflect the change
      setEntry(prev => ({
        ...prev,
        type: 'heraldry',
        category: 'titles'
      }));

      alert('Entry moved to Dignities & Titles successfully!');
    } catch (err) {
      console.error('Error moving entry:', err);
      alert('Failed to move entry: ' + err.message);
    }
  }, [entry, id, activeDataset?.id]);

  const handleViewBacklink = useCallback((backlinkId) => {
    navigate(`/codex/entry/${backlinkId}`);
  }, [navigate]);

  const toggleGroup = useCallback((groupType) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupType]: !prev[groupType]
    }));
  }, []);

  // Format date for display
  const formatDate = useCallback((isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, []);

  // Get type configuration
  const getTypeConfig = useCallback((type) => {
    return TYPE_CONFIG[type] || TYPE_CONFIG.custom;
  }, []);

  // Group backlinks by entry type
  const groupedBacklinks = useMemo(() => {
    const grouped = {};

    backlinkDetails.forEach(backlink => {
      const type = backlink.entry.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(backlink);
    });

    return grouped;
  }, [backlinkDetails]);

  // Get type label (pluralized)
  const getTypeLabel = useCallback((type, count) => {
    const labels = {
      personage: count === 1 ? 'Personage' : 'Personages',
      house: count === 1 ? 'House' : 'Houses',
      location: count === 1 ? 'Location' : 'Locations',
      event: count === 1 ? 'Event' : 'Events',
      mysteria: count === 1 ? 'Mysteria' : 'Mysteria',
      heraldry: count === 1 ? 'Heraldry' : 'Heraldry',
      custom: count === 1 ? 'Entry' : 'Entries'
    };
    return labels[type] || 'Entries';
  }, []);

  const hasBacklinks = backlinkDetails.length > 0;

  // Loading state
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="entry-page">
          <div className="entry-container">
            <LoadingState message="Loading entry..." icon="scroll-text" />
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error || !entry) {
    return (
      <>
        <Navigation />
        <div className="entry-page">
          <div className="entry-container">
            <EmptyState
              icon="file-x"
              title="Entry Not Found"
              description={error || 'The requested entry does not exist.'}
              action={{
                label: 'Back to Codex',
                onClick: handleBackToCodex,
                icon: 'arrow-left'
              }}
            />
          </div>
        </div>
      </>
    );
  }

  const typeConfig = getTypeConfig(entry.type);

  return (
    <>
      <Navigation />

      <div className="entry-page">
        <motion.div
          className="entry-container"
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
        >
          {/* Breadcrumb Navigation */}
          <motion.nav className="entry-breadcrumb" variants={ITEM_VARIANTS}>
            <button onClick={handleBackToCodex} className="entry-breadcrumb__link">
              <Icon name="book-open" size={14} />
              <span>The Codex</span>
            </button>
            <Icon name="chevron-right" size={14} className="entry-breadcrumb__separator" />
            <span className="entry-breadcrumb__current">{entry.title}</span>
          </motion.nav>

          {/* Main Content Card */}
          <motion.article className="entry-card" variants={CARD_VARIANTS}>
            {/* Entry Header */}
            <header className="entry-header">
              {/* Type Badge */}
              <div className="entry-header__badge">
                <Icon name={typeConfig.icon} size={16} />
                <span>{typeConfig.label}</span>
              </div>

              {/* Title with Illuminated Initial */}
              <h1 className="entry-header__title">
                <span className="entry-header__initial">{entry.title.charAt(0)}</span>
                {entry.title.slice(1)}
              </h1>

              {/* Epithets for personage entries */}
              {linkedPerson && linkedPerson.epithets && linkedPerson.epithets.length > 0 && (
                <div className="entry-header__epithets">
                  <span className="entry-header__epithets-label">Known as: </span>
                  {(() => {
                    const primary = getPrimaryEpithet(linkedPerson.epithets);
                    const others = linkedPerson.epithets.filter(e => !e.isPrimary);
                    return (
                      <>
                        {primary && (
                          <span className="entry-header__epithet--primary">
                            {primary.text}
                          </span>
                        )}
                        {others.length > 0 && (
                          <span className="entry-header__epithets-others">
                            {others.map((e, i) => (
                              <span key={e.id} className="entry-header__epithet--secondary">
                                {i > 0 || primary ? ', ' : ''}{e.text}
                              </span>
                            ))}
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Subtitle */}
              {entry.subtitle && (
                <p className="entry-header__subtitle">{entry.subtitle}</p>
              )}

              {/* Reference Count Badge */}
              {hasBacklinks && (
                <div className="entry-header__references">
                  <Icon name="link" size={14} />
                  <span>
                    Referenced in {backlinkDetails.length} {backlinkDetails.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
              )}

              {/* Metadata Row */}
              <div className="entry-header__meta">
                {entry.era && (
                  <span className="entry-header__meta-item">
                    <Icon name="clock" size={14} />
                    <span className="entry-header__meta-label">Era:</span>
                    <span className="entry-header__meta-value">{entry.era}</span>
                  </span>
                )}

                {entry.category && (
                  <span className="entry-header__meta-item">
                    <Icon name="folder" size={14} />
                    <span className="entry-header__meta-label">Category:</span>
                    <span className="entry-header__meta-value">{entry.category}</span>
                  </span>
                )}

                {entry.wordCount > 0 && (
                  <span className="entry-header__meta-item">
                    <Icon name="file-text" size={14} />
                    <span className="entry-header__meta-label">Words:</span>
                    <span className="entry-header__meta-value">{entry.wordCount.toLocaleString()}</span>
                  </span>
                )}
              </div>

              {/* Tags */}
              {entry.tags && entry.tags.length > 0 && (
                <div className="entry-header__tags">
                  {entry.tags.map((tag, index) => (
                    <span key={index} className="entry-header__tag">
                      <Icon name="tag" size={12} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="entry-header__actions">
                <ActionButton
                  icon="edit-3"
                  onClick={handleEdit}
                  variant="primary"
                >
                  Edit Entry
                </ActionButton>

                {entry.type === 'personage' && entry.personId && (
                  <ActionButton
                    icon="git-branch"
                    onClick={handleViewInFamilyTree}
                    variant="secondary"
                  >
                    View in Family Tree
                  </ActionButton>
                )}

                {entry.heraldryId && linkedHeraldry && (
                  <ActionButton
                    icon="shield"
                    onClick={handleViewInArmory}
                    variant="secondary"
                  >
                    View in Armory
                  </ActionButton>
                )}

                {entry.type === 'mysteria' && (
                  <ActionButton
                    icon="crown"
                    onClick={handleMoveToTitles}
                    variant="secondary"
                  >
                    Move to Dignities & Titles
                  </ActionButton>
                )}

                <ActionButton
                  icon="trash-2"
                  onClick={handleDelete}
                  variant="danger"
                >
                  Delete Entry
                </ActionButton>
              </div>

              {/* Linked Heraldry Display */}
              {linkedHeraldry && (
                <motion.div
                  className="entry-heraldry"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="entry-heraldry__header">
                    <Icon name="shield" size={16} />
                    <span>Linked Heraldry</span>
                  </div>
                  <div className="entry-heraldry__content">
                    <div
                      className="entry-heraldry__preview"
                      onClick={handleViewInArmory}
                      title="Click to view in The Armory"
                    >
                      {linkedHeraldry.heraldrySVG ? (
                        <div
                          className="entry-heraldry__svg"
                          dangerouslySetInnerHTML={{ __html: sanitizeSVG(linkedHeraldry.heraldrySVG) }}
                        />
                      ) : linkedHeraldry.heraldryDisplay || linkedHeraldry.heraldryThumbnail ? (
                        <img
                          src={linkedHeraldry.heraldryDisplay || linkedHeraldry.heraldryThumbnail}
                          alt={linkedHeraldry.name}
                          className="entry-heraldry__img"
                        />
                      ) : (
                        <Icon name="shield" size={64} className="entry-heraldry__placeholder" />
                      )}
                    </div>
                    <div className="entry-heraldry__info">
                      <h4 className="entry-heraldry__name">{linkedHeraldry.name}</h4>
                      {linkedHeraldry.blazon && (
                        <p className="entry-heraldry__blazon">{linkedHeraldry.blazon}</p>
                      )}
                      <button className="entry-heraldry__link" onClick={handleViewInArmory}>
                        <span>View in The Armory</span>
                        <Icon name="arrow-right" size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </header>

            {/* Decorative Divider */}
            <div className="entry-divider">
              <Icon name="sparkle" size={16} />
            </div>

            {/* Entry Content (Rendered Markdown) */}
            <section className="entry-content">
              <div
                className="entry-content__markdown"
                dangerouslySetInnerHTML={{ __html: sanitizeHTML(renderedContent) }}
              />
            </section>

            {/* Divider before backlinks */}
            <div className="entry-divider">
              <Icon name="sparkle" size={16} />
            </div>

            {/* Backlinks Section */}
            <section className="entry-backlinks">
              <div className="entry-backlinks__header">
                <h2 className="entry-backlinks__title">
                  <Icon name="link" size={20} />
                  <span>Referenced In</span>
                </h2>
                {loadingBacklinks && (
                  <span className="entry-backlinks__loading">
                    <Icon name="loader-2" size={14} className="spin" />
                    <span>Loading...</span>
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {!loadingBacklinks && !hasBacklinks && (
                  <motion.div
                    key="empty"
                    className="entry-backlinks__empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Icon name="link-2-off" size={24} />
                    <p className="entry-backlinks__empty-message">
                      No other entries reference this one yet.
                    </p>
                    <p className="entry-backlinks__empty-hint">
                      When other entries include <code>[[{entry.title}]]</code> in their content, they'll appear here.
                    </p>
                  </motion.div>
                )}

                {!loadingBacklinks && hasBacklinks && (
                  <motion.div
                    key="content"
                    className="entry-backlinks__content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="entry-backlinks__description">
                      This entry is mentioned in {backlinkDetails.length} other {backlinkDetails.length === 1 ? 'entry' : 'entries'}:
                    </p>

                    {Object.entries(groupedBacklinks).map(([type, links]) => {
                      const groupConfig = getTypeConfig(type);
                      const isCollapsed = collapsedGroups[type];

                      return (
                        <motion.div
                          key={type}
                          className="entry-backlinks__group"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <button
                            className="entry-backlinks__group-header"
                            onClick={() => toggleGroup(type)}
                          >
                            <Icon name={groupConfig.icon} size={18} />
                            <span className="entry-backlinks__group-title">
                              {getTypeLabel(type, links.length)} ({links.length})
                            </span>
                            <Icon
                              name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                              size={16}
                              className="entry-backlinks__group-chevron"
                            />
                          </button>

                          <AnimatePresence>
                            {!isCollapsed && (
                              <motion.ul
                                className="entry-backlinks__list"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                {links.map(backlink => {
                                  const linkConfig = getTypeConfig(backlink.entry.type);
                                  return (
                                    <li key={backlink.id} className="entry-backlinks__item">
                                      <button
                                        onClick={() => handleViewBacklink(backlink.entry.id)}
                                        className="entry-backlinks__link"
                                      >
                                        <div className="entry-backlinks__link-main">
                                          <Icon name={linkConfig.icon} size={16} />
                                          <span className="entry-backlinks__link-title">
                                            {backlink.entry.title}
                                          </span>
                                          <Icon name="arrow-right" size={14} className="entry-backlinks__link-arrow" />
                                        </div>
                                        {backlink.snippet && (
                                          <div className="entry-backlinks__link-context">
                                            <Icon name="quote" size={14} />
                                            <span className="entry-backlinks__link-snippet">
                                              {backlink.snippet}
                                            </span>
                                          </div>
                                        )}
                                      </button>
                                    </li>
                                  );
                                })}
                              </motion.ul>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Footer Metadata */}
            <footer className="entry-footer">
              <div className="entry-footer__meta">
                <span className="entry-footer__item">
                  <Icon name="calendar-plus" size={14} />
                  <span>Created: {formatDate(entry.created)}</span>
                </span>
                {entry.updated && entry.updated !== entry.created && (
                  <span className="entry-footer__item">
                    <Icon name="calendar-check" size={14} />
                    <span>Last updated: {formatDate(entry.updated)}</span>
                  </span>
                )}
              </div>
            </footer>
          </motion.article>
        </motion.div>
      </div>
    </>
  );
}

export default CodexEntryView;
