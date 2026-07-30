/**
 * EntitySidebar.jsx - Referenced Entities Panel
 *
 * Displays all entities referenced in the current writing via wiki-links.
 * Shows entities grouped by type with quick-view capability.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../../icons';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_ICONS,
  getEntityById
} from '../../../services/entitySearchService';
import { getLinksByWriting } from '../../../services/writingLinkService';
import './EntitySidebar.css';
import { logger } from '../../../utils/logger';

/**
 * EntityItem Component - Single entity display
 */
function EntityItem({ entity, onClick }) {
  return (
    <button
      className="entity-item"
      onClick={() => onClick(entity)}
      type="button"
    >
      <div className="entity-item__icon">
        <Icon name={entity.icon} size={14} strokeWidth={2} />
      </div>
      <div className="entity-item__content">
        <span className="entity-item__name">{entity.name}</span>
        {entity.subtitle && (
          <span className="entity-item__subtitle">{entity.subtitle}</span>
        )}
      </div>
      <span className="entity-item__count">{entity.count}</span>
    </button>
  );
}

/**
 * EntityGroup Component - Group of entities by type
 */
function EntityGroup({ type, entities, onEntityClick, isExpanded, onToggle }) {
  const label = ENTITY_TYPE_LABELS[type] || type;
  const icon = ENTITY_TYPE_ICONS[type] || 'circle';

  return (
    <div className="entity-group">
      <button
        className="entity-group__header"
        onClick={onToggle}
        type="button"
      >
        <Icon name={icon} size={16} strokeWidth={2} />
        <span className="entity-group__label">{label}s</span>
        <span className="entity-group__count">{entities.length}</span>
        <Icon
          name={isExpanded ? 'chevron-down' : 'chevron-right'}
          size={14}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="entity-group__list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {entities.map((entity) => (
              <EntityItem
                key={`${entity.type}-${entity.id}`}
                entity={entity}
                onClick={onEntityClick}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * EntitySidebar Component
 *
 * @param {Object} props
 * @param {number} props.writingId - Current writing ID
 * @param {string} props.datasetId - Dataset ID
 * @param {Function} props.onEntityClick - Callback when entity is clicked
 * @param {Function} props.onInsertEntity - Callback to insert entity into editor
 */
export default function EntitySidebar({
  writingId,
  datasetId,
  onEntityClick,
  onInsertEntity
}) {
  const [links, setLinks] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTypes, setExpandedTypes] = useState(new Set(Object.values(ENTITY_TYPES)));

  // Load links and resolve entities
  useEffect(() => {
    async function loadEntities() {
      if (!writingId) return;

      try {
        setLoading(true);
        const allLinks = await getLinksByWriting(writingId, datasetId);
        setLinks(allLinks);

        // Group and count links by entity
        const entityMap = new Map();
        for (const link of allLinks) {
          const key = `${link.targetType}-${link.targetId}`;
          if (entityMap.has(key)) {
            entityMap.get(key).count++;
          } else {
            entityMap.set(key, {
              type: link.targetType,
              id: link.targetId,
              count: 1
            });
          }
        }

        // Resolve entity details
        const resolvedEntities = [];
        for (const [key, data] of entityMap) {
          const entity = await getEntityById(data.type, data.id, datasetId);
          if (entity) {
            resolvedEntities.push({
              ...entity,
              count: data.count
            });
          }
        }

        setEntities(resolvedEntities);
      } catch (error) {
        logger.error('Failed to load entities:', error);
      } finally {
        setLoading(false);
      }
    }

    loadEntities();
  }, [writingId, datasetId, links.length]);

  // Group entities by type
  const groupedEntities = useMemo(() => {
    const groups = {};
    for (const type of Object.values(ENTITY_TYPES)) {
      groups[type] = entities.filter(e => e.type === type);
    }
    return groups;
  }, [entities]);

  // Toggle group expansion
  const toggleGroup = (type) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Handle entity click
  const handleEntityClick = (entity) => {
    if (onEntityClick) {
      onEntityClick(entity);
    }
  };

  if (loading) {
    return (
      <div className="entity-sidebar entity-sidebar--loading">
        <div className="entity-sidebar__header">
          <h3>Referenced Entities</h3>
        </div>
        <div className="entity-sidebar__loading">
          <div className="loader-spinner loader-spinner--small" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="entity-sidebar entity-sidebar--empty">
        <div className="entity-sidebar__header">
          <h3>Referenced Entities</h3>
        </div>
        <div className="entity-sidebar__empty">
          <Icon name="link" size={24} strokeWidth={1.5} />
          <p>No entities referenced</p>
          <span>Type [[  to link to entities</span>
        </div>
      </div>
    );
  }

  return (
    <div className="entity-sidebar">
      <div className="entity-sidebar__header">
        <h3>Referenced Entities</h3>
        <span className="entity-sidebar__total">{entities.length}</span>
      </div>

      <div className="entity-sidebar__content">
        {Object.entries(groupedEntities).map(([type, typeEntities]) => {
          if (typeEntities.length === 0) return null;

          return (
            <EntityGroup
              key={type}
              type={type}
              entities={typeEntities}
              onEntityClick={handleEntityClick}
              isExpanded={expandedTypes.has(type)}
              onToggle={() => toggleGroup(type)}
            />
          );
        })}
      </div>

      {onInsertEntity && (
        <div className="entity-sidebar__actions">
          <button
            className="entity-sidebar__insert-btn"
            onClick={onInsertEntity}
            type="button"
          >
            <Icon name="plus" size={16} strokeWidth={2} />
            Quick Insert
          </button>
        </div>
      )}
    </div>
  );
}
