/**
 * ReferenceBrowser.jsx - Browse World Data While Writing
 *
 * Allows writers to browse and search their codex, people, houses, and dignities
 * without leaving the writing page. Includes preview panels and quick insert.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import { getAllPeople, getAllHouses } from '../../../services/database';
import { getAllEntries } from '../../../services/codexService';
import { getAllDignities } from '../../../services/dignityService';
import { getHeraldryForEntity } from '../../../services/heraldryService';
import './ReferenceBrowser.css';

/**
 * Tab definitions
 */
const TABS = [
  { key: 'people', label: 'People', icon: 'users' },
  { key: 'houses', label: 'Houses', icon: 'castle' },
  { key: 'codex', label: 'Codex', icon: 'book' },
  { key: 'dignities', label: 'Dignities', icon: 'crown' }
];

/**
 * Format person name
 */
function formatPersonName(person) {
  const parts = [];
  if (person.firstName) parts.push(person.firstName);
  if (person.middleName) parts.push(person.middleName);
  if (person.lastName) parts.push(person.lastName);
  if (person.suffix) parts.push(person.suffix);
  return parts.join(' ') || 'Unnamed Person';
}

/**
 * Entity List Item
 */
function EntityListItem({ entity, isSelected, onClick, onInsert }) {
  return (
    <div
      className={`ref-item ${isSelected ? 'ref-item--selected' : ''}`}
      onClick={() => onClick(entity)}
    >
      <div className="ref-item__icon">
        <Icon name={entity.icon} size={16} />
      </div>
      <div className="ref-item__content">
        <span className="ref-item__name">{entity.name}</span>
        {entity.subtitle && (
          <span className="ref-item__subtitle">{entity.subtitle}</span>
        )}
      </div>
      <button
        className="ref-item__insert"
        onClick={(e) => {
          e.stopPropagation();
          onInsert(entity);
        }}
        title="Insert link"
        type="button"
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}

/**
 * Person Preview Panel
 */
function PersonPreview({ person, onInsert }) {
  if (!person) return null;

  return (
    <div className="ref-preview">
      <div className="ref-preview__header">
        <Icon name="user" size={20} />
        <h4>{formatPersonName(person)}</h4>
      </div>

      <div className="ref-preview__content">
        {person.epithet && (
          <div className="ref-preview__field">
            <label>Epithet</label>
            <span>"{person.epithet}"</span>
          </div>
        )}

        {/*
          These read person.birthYear / person.deathYear / person.biography —
          none of which exist on the record. The schema has dateOfBirth and
          dateOfDeath, and there is no biography field (long-form prose lives
          in the linked Codex entry). Every preview rendered a bare name.
        */}
        {person.dateOfBirth && (
          <div className="ref-preview__field">
            <label>Born</label>
            <span>{person.dateOfBirth}</span>
          </div>
        )}

        {person.dateOfDeath && (
          <div className="ref-preview__field">
            <label>Died</label>
            <span>{person.dateOfDeath}</span>
          </div>
        )}

        {person.maidenName && (
          <div className="ref-preview__field">
            <label>Née</label>
            <span>{person.maidenName}</span>
          </div>
        )}

        {person.notes && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Notes</label>
            <p className="ref-preview__text">{person.notes}</p>
          </div>
        )}
      </div>

      <div className="ref-preview__actions">
        <button
          className="ref-preview__insert-btn"
          onClick={() => onInsert({
            id: person.id,
            type: 'person',
            name: formatPersonName(person)
          })}
          type="button"
        >
          <Icon name="plus" size={16} />
          Insert Link
        </button>
      </div>
    </div>
  );
}

/**
 * House Preview Panel with Heraldry
 */
function HousePreview({ house, heraldry, onInsert }) {
  if (!house) return null;

  return (
    <div className="ref-preview">
      <div className="ref-preview__header">
        <Icon name="castle" size={20} />
        <h4>{house.houseName || 'Unnamed House'}</h4>
      </div>

      <div className="ref-preview__content">
        {heraldry && (
          <div className="ref-preview__heraldry">
            <div
              className="ref-preview__shield"
              style={{
                background: heraldry.field?.color || '#666'
              }}
            >
              {heraldry.charges?.map((charge, i) => (
                <div
                  key={i}
                  className="ref-preview__charge"
                  style={{
                    color: charge.tincture || '#fff'
                  }}
                >
                  <Icon name={charge.type || 'shield'} size={32} />
                </div>
              ))}
            </div>
          </div>
        )}

        {house.motto && (
          <div className="ref-preview__field">
            <label>Motto</label>
            <span className="ref-preview__motto">"{house.motto}"</span>
          </div>
        )}

        {/*
          house.seat / house.region / house.history do not exist on the record.
          (`seatName` is a dignity field, not a house field — CLAUDE.md is wrong
          about that.) The real house fields are below.
        */}
        {house.foundedDate && (
          <div className="ref-preview__field">
            <label>Founded</label>
            <span>{house.foundedDate}</span>
          </div>
        )}

        {house.sigil && (
          <div className="ref-preview__field">
            <label>Sigil</label>
            <span>{house.sigil}</span>
          </div>
        )}

        {house.notes && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Notes</label>
            <p className="ref-preview__text">{house.notes}</p>
          </div>
        )}
      </div>

      <div className="ref-preview__actions">
        <button
          className="ref-preview__insert-btn"
          onClick={() => onInsert({
            id: house.id,
            type: 'house',
            name: house.houseName
          })}
          type="button"
        >
          <Icon name="plus" size={16} />
          Insert Link
        </button>
      </div>
    </div>
  );
}

/**
 * Codex Entry Preview Panel
 */
function CodexPreview({ entry, onInsert }) {
  if (!entry) return null;

  return (
    <div className="ref-preview">
      <div className="ref-preview__header">
        <Icon name="book" size={20} />
        <h4>{entry.title || 'Untitled Entry'}</h4>
      </div>

      <div className="ref-preview__content">
        {entry.category && (
          <div className="ref-preview__badge">
            {entry.category}
          </div>
        )}

        {entry.summary && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Summary</label>
            <p className="ref-preview__text">{entry.summary}</p>
          </div>
        )}

        {entry.content && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Content</label>
            <p className="ref-preview__text">
              {entry.content.length > 500
                ? entry.content.slice(0, 500) + '...'
                : entry.content}
            </p>
          </div>
        )}

        {entry.tags && entry.tags.length > 0 && (
          <div className="ref-preview__tags">
            {entry.tags.map((tag, i) => (
              <span key={i} className="ref-preview__tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      <div className="ref-preview__actions">
        <button
          className="ref-preview__insert-btn"
          onClick={() => onInsert({
            id: entry.id,
            type: 'codex',
            name: entry.title
          })}
          type="button"
        >
          <Icon name="plus" size={16} />
          Insert Link
        </button>
      </div>
    </div>
  );
}

/**
 * Dignity Preview Panel
 */
function DignityPreview({ dignity, onInsert }) {
  if (!dignity) return null;

  return (
    <div className="ref-preview">
      <div className="ref-preview__header">
        <Icon name="crown" size={20} />
        <h4>{dignity.name || 'Unnamed Dignity'}</h4>
      </div>

      <div className="ref-preview__content">
        {dignity.type && (
          <div className="ref-preview__badge">
            {dignity.type}
          </div>
        )}

        {dignity.rank && (
          <div className="ref-preview__field">
            <label>Rank</label>
            <span>{dignity.rank}</span>
          </div>
        )}

        {dignity.territory && (
          <div className="ref-preview__field">
            <label>Territory</label>
            <span>{dignity.territory}</span>
          </div>
        )}

        {dignity.description && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Description</label>
            <p className="ref-preview__text">{dignity.description}</p>
          </div>
        )}

        {dignity.responsibilities && (
          <div className="ref-preview__field ref-preview__field--full">
            <label>Responsibilities</label>
            <p className="ref-preview__text">{dignity.responsibilities}</p>
          </div>
        )}
      </div>

      <div className="ref-preview__actions">
        <button
          className="ref-preview__insert-btn"
          onClick={() => onInsert({
            id: dignity.id,
            type: 'dignity',
            name: dignity.name
          })}
          type="button"
        >
          <Icon name="plus" size={16} />
          Insert Link
        </button>
      </div>
    </div>
  );
}

/**
 * Main ReferenceBrowser Component
 */
export default function ReferenceBrowser({
  datasetId,
  onInsertEntity,
  onClose
}) {
  const [activeTab, setActiveTab] = useState('people');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data state
  const [people, setPeople] = useState([]);
  const [houses, setHouses] = useState([]);
  const [codexEntries, setCodexEntries] = useState([]);
  const [dignities, setDignities] = useState([]);
  const [heraldryCache, setHeraldryCache] = useState({});

  // Load all data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [peopleData, housesData, codexData, dignitiesData] = await Promise.all([
          getAllPeople(datasetId),
          getAllHouses(datasetId),
          getAllEntries(datasetId),
          getAllDignities(datasetId)
        ]);

        setPeople(peopleData || []);
        setHouses(housesData || []);
        setCodexEntries(codexData || []);
        setDignities(dignitiesData || []);
      } catch (error) {
        console.error('Failed to load reference data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [datasetId]);

  // Load heraldry for selected house
  useEffect(() => {
    async function loadHeraldry() {
      if (activeTab !== 'houses' || !selectedEntity?.id) return;
      if (heraldryCache[selectedEntity.id]) return;

      try {
        const heraldry = await getHeraldryForEntity('house', selectedEntity.id, datasetId);
        if (heraldry) {
          setHeraldryCache(prev => ({
            ...prev,
            [selectedEntity.id]: heraldry
          }));
        }
      } catch (error) {
        console.error('Failed to load heraldry:', error);
      }
    }

    loadHeraldry();
  }, [activeTab, selectedEntity?.id, datasetId, heraldryCache]);

  // Format entities for display
  const formattedEntities = useMemo(() => {
    switch (activeTab) {
      case 'people':
        return people.map(p => ({
          id: p.id,
          type: 'person',
          name: formatPersonName(p),
          subtitle: p.epithet || null,
          icon: 'user',
          data: p
        }));
      case 'houses':
        return houses.map(h => ({
          id: h.id,
          type: 'house',
          name: h.houseName || 'Unnamed House',
          subtitle: h.motto || null,
          icon: 'castle',
          data: h
        }));
      case 'codex':
        return codexEntries.map(e => ({
          id: e.id,
          type: 'codex',
          name: e.title || 'Untitled Entry',
          subtitle: e.category || null,
          icon: 'book',
          data: e
        }));
      case 'dignities':
        return dignities.map(d => ({
          id: d.id,
          type: 'dignity',
          name: d.name || 'Unnamed Dignity',
          subtitle: d.type || null,
          icon: 'crown',
          data: d
        }));
      default:
        return [];
    }
  }, [activeTab, people, houses, codexEntries, dignities]);

  // Filter by search query
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return formattedEntities;

    const query = searchQuery.toLowerCase();
    return formattedEntities.filter(e =>
      e.name.toLowerCase().includes(query) ||
      (e.subtitle && e.subtitle.toLowerCase().includes(query))
    );
  }, [formattedEntities, searchQuery]);

  // Handle entity selection
  const handleSelectEntity = useCallback((entity) => {
    setSelectedEntity(entity);
  }, []);

  // Handle insert
  const handleInsert = useCallback((entity) => {
    if (onInsertEntity) {
      onInsertEntity({
        id: entity.id,
        type: entity.type,
        label: entity.name
      });
    }
  }, [onInsertEntity]);

  // Clear selection when tab changes
  useEffect(() => {
    setSelectedEntity(null);
    setSearchQuery('');
  }, [activeTab]);

  // Get counts for tabs
  const tabCounts = useMemo(() => ({
    people: people.length,
    houses: houses.length,
    codex: codexEntries.length,
    dignities: dignities.length
  }), [people.length, houses.length, codexEntries.length, dignities.length]);

  return (
    <div className="ref-browser">
      {/* Header */}
      <div className="ref-browser__header">
        <div className="ref-browser__title">
          <Icon name="library" size={18} />
          <h3>Reference Browser</h3>
        </div>
        <button
          className="ref-browser__close"
          onClick={onClose}
          type="button"
          title="Close"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="ref-browser__tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`ref-tab ${activeTab === tab.key ? 'ref-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            <Icon name={tab.icon} size={14} />
            <span>{tab.label}</span>
            <span className="ref-tab__count">{tabCounts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="ref-browser__search">
        <Icon name="search" size={16} />
        <input
          type="text"
          placeholder={`Search ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="ref-browser__search-clear"
            onClick={() => setSearchQuery('')}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="ref-browser__content">
        {loading ? (
          <div className="ref-browser__loading">
            <div className="loader-spinner loader-spinner--small" />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            {/* Entity List */}
            <div className="ref-browser__list">
              {filteredEntities.length === 0 ? (
                <div className="ref-browser__empty">
                  <Icon name={TABS.find(t => t.key === activeTab)?.icon || 'file'} size={24} />
                  <p>No {activeTab} found</p>
                  {searchQuery && <span>Try a different search term</span>}
                </div>
              ) : (
                filteredEntities.map(entity => (
                  <EntityListItem
                    key={`${entity.type}-${entity.id}`}
                    entity={entity}
                    isSelected={selectedEntity?.id === entity.id && selectedEntity?.type === entity.type}
                    onClick={handleSelectEntity}
                    onInsert={handleInsert}
                  />
                ))
              )}
            </div>

            {/* Preview Panel */}
            <AnimatePresence mode="wait">
              {selectedEntity && (
                <motion.div
                  className="ref-browser__preview"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'people' && (
                    <PersonPreview
                      person={selectedEntity.data}
                      onInsert={handleInsert}
                    />
                  )}
                  {activeTab === 'houses' && (
                    <HousePreview
                      house={selectedEntity.data}
                      heraldry={heraldryCache[selectedEntity.id]}
                      onInsert={handleInsert}
                    />
                  )}
                  {activeTab === 'codex' && (
                    <CodexPreview
                      entry={selectedEntity.data}
                      onInsert={handleInsert}
                    />
                  )}
                  {activeTab === 'dignities' && (
                    <DignityPreview
                      dignity={selectedEntity.data}
                      onInsert={handleInsert}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
