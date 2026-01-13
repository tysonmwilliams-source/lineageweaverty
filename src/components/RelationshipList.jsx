/**
 * RelationshipList.jsx - Relationship List Component
 *
 * PURPOSE:
 * Displays all relationships in an animated list format.
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 *
 * Props:
 * - relationships: Array of relationship objects
 * - people: Array of people (to show names)
 * - onEdit: Function to call when user wants to edit a relationship
 * - onDelete: Function to call when user wants to delete a relationship
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons';
import ActionButton from './shared/ActionButton';
import EmptyState from './shared/EmptyState';
import './RelationshipList.css';

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
  hidden: { opacity: 0, y: 10 },
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

// ==================== RELATIONSHIP TYPE CONFIG ====================
const RELATIONSHIP_CONFIG = {
  parent: {
    icon: 'users',
    color: 'blue',
    getDescription: (p1, p2, rel) => {
      // Handle missing biologicalParent field gracefully - assume biological if not specified
      const isBiological = rel.biologicalParent !== false;  // true or undefined = biological
      return `${p1} is the ${isBiological ? 'biological' : 'non-biological'} parent of ${p2}`;
    }
  },
  spouse: {
    icon: 'heart',
    color: 'rose',
    getDescription: (p1, p2, rel) =>
      `${p1} and ${p2} are ${rel.marriageStatus || 'married'}`
  },
  'adopted-parent': {
    icon: 'link',
    color: 'purple',
    getDescription: (p1, p2) => `${p1} adopted ${p2}`
  },
  'foster-parent': {
    icon: 'home',
    color: 'green',
    getDescription: (p1, p2) => `${p1} is foster parent of ${p2}`
  },
  mentor: {
    icon: 'graduation',
    color: 'amber',
    getDescription: (p1, p2) => `${p1} is mentor to ${p2}`
  },
  twin: {
    icon: 'users',
    color: 'indigo',
    getDescription: (p1, p2) => `${p1} and ${p2} are twins`
  },
  default: {
    icon: 'link',
    color: 'gray',
    getDescription: (p1, p2) => `${p1} and ${p2}`
  }
};

function RelationshipList({ relationships, people, onEdit, onDelete }) {
  /**
   * Get person name by ID
   */
  const getPersonName = (personId) => {
    const person = people.find(p => p.id === personId);
    return person ? `${person.firstName} ${person.lastName}` : 'Unknown';
  };

  /**
   * Get relationship details with icon and description
   */
  const getRelationshipDetails = (rel) => {
    const person1 = getPersonName(rel.person1Id);
    const person2 = getPersonName(rel.person2Id);
    const config = RELATIONSHIP_CONFIG[rel.relationshipType] || RELATIONSHIP_CONFIG.default;

    return {
      text: config.getDescription(person1, person2, rel),
      icon: config.icon,
      color: config.color
    };
  };

  // Memoize processed relationships
  const processedRelationships = useMemo(() => {
    return relationships.map(rel => ({
      ...rel,
      details: getRelationshipDetails(rel)
    }));
  }, [relationships, people]);

  if (relationships.length === 0) {
    return (
      <EmptyState
        icon="link"
        title="No Relationships Yet"
        description="Create your first relationship to connect people in your family tree."
      />
    );
  }

  return (
    <motion.div
      className="relationship-list"
      variants={LIST_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {processedRelationships.map(rel => (
          <motion.div
            key={rel.id}
            className={`relationship-list__item relationship-list__item--${rel.details.color}`}
            variants={ITEM_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            whileHover={{ y: -2 }}
          >
            <div className="relationship-list__content">
              {/* Icon and Description */}
              <div className="relationship-list__info">
                <div className="relationship-list__icon-wrapper">
                  <Icon name={rel.details.icon} size={20} />
                </div>
                <div className="relationship-list__details">
                  <p className="relationship-list__description">
                    {rel.details.text}
                  </p>

                  {/* Additional details for spouse relationships */}
                  {rel.relationshipType === 'spouse' && (rel.marriageDate || rel.divorceDate) && (
                    <div className="relationship-list__meta">
                      {rel.marriageDate && (
                        <span className="relationship-list__meta-item">
                          <Icon name="calendar" size={14} />
                          <span>Married: {rel.marriageDate}</span>
                        </span>
                      )}
                      {rel.divorceDate && (
                        <span className="relationship-list__meta-item relationship-list__meta-item--muted">
                          <Icon name="calendar" size={14} />
                          <span>Divorced: {rel.divorceDate}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="relationship-list__actions">
                <ActionButton
                  variant="ghost"
                  size="sm"
                  icon="edit"
                  onClick={() => onEdit(rel)}
                  title="Edit relationship"
                >
                  Edit
                </ActionButton>
                <ActionButton
                  variant="danger"
                  size="sm"
                  icon="trash"
                  onClick={() => onDelete(rel)}
                  title="Delete relationship"
                >
                  Delete
                </ActionButton>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

export default RelationshipList;
