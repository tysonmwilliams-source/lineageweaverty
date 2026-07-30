/**
 * RecentActivity.jsx - Recent Activity Feed / Onboarding
 * 
 * PURPOSE:
 * Shows recent edits and activity when data exists, or provides
 * onboarding guidance when the database is empty.
 * 
 * ANIMATIONS:
 * - Staggered slide-in for activity items
 * - Fade transitions
 * 
 * FEATURES USED:
 * - recentActivity: Whether to show this section
 * - staggeredEntrance: Whether items animate in
 */

import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../icons';
import './RecentActivity.css';

// Animation variants defined outside component to prevent recreation on each render
const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08
    }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: 20 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }
  }
};

/**
 * Format a relative time string
 * @param {string} dateString - ISO date string
 * @returns {string} Relative time like "2 hours ago"
 */
function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown';
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Get icon name for activity type
 */
function getActivityIconName(type) {
  const iconMap = {
    person: 'user',
    house: 'castle',
    codex: 'book-open',
    heraldry: 'shield',
    relationship: 'heart',
    default: 'file-edit'
  };
  return iconMap[type] || iconMap.default;
}

/**
 * RecentActivity Component
 * 
 * @param {Object} props
 * @param {Object} props.features - Feature flags
 * @param {Array} props.people - All people (to find recent)
 * @param {Array} props.houses - All houses
 * @param {Array} props.codexEntries - All codex entries
 * @param {boolean} props.hasData - Whether any data exists
 */
export default function RecentActivity({ features, people, houses, codexEntries, hasData }) {
  const navigate = useNavigate();
  const { recentActivity, staggeredEntrance } = features;

  // The `!recentActivity` early return is at the bottom, after every hook —
  // placing it here made the four hooks below conditional, which corrupts
  // React's hook state when the flag changes.

  // Navigation handlers wrapped in useCallback for performance
  const handleNavigateToPerson = useCallback((personId) => {
    navigate('/tree', { state: { selectedPersonId: personId } });
  }, [navigate]);
  
  const handleNavigateToHouse = useCallback((houseId) => {
    navigate('/manage', { state: { selectedHouseId: houseId } });
  }, [navigate]);
  
  const handleNavigateToCodex = useCallback((entryId) => {
    navigate(`/codex/entry/${entryId}`);
  }, [navigate]);
  
  // Build recent activity list from available data
  const activityItems = useMemo(() => {
    const items = [];
    
    // Add people (if they have timestamps)
    people.forEach(p => {
      if (p.updated || p.created) {
        items.push({
          id: `person-${p.id}`,
          type: 'person',
          title: `${p.firstName} ${p.lastName}`,
          action: p.updated ? 'Updated' : 'Created',
          timestamp: p.updated || p.created,
          entityId: p.id,
          navigationType: 'person'
        });
      }
    });
    
    // Add houses
    houses.forEach(h => {
      if (h.updated || h.created) {
        items.push({
          id: `house-${h.id}`,
          type: 'house',
          title: h.houseName,
          action: h.updated ? 'Updated' : 'Created',
          timestamp: h.updated || h.created,
          entityId: h.id,
          navigationType: 'house'
        });
      }
    });
    
    // Add codex entries
    codexEntries.forEach(e => {
      items.push({
        id: `codex-${e.id}`,
        type: 'codex',
        title: e.title,
        action: e.updated !== e.created ? 'Updated' : 'Created',
        timestamp: e.updated || e.created,
        entityId: e.id,
        navigationType: 'codex'
      });
    });
    
    // Sort by timestamp (most recent first) and take top 5
    return items
      .filter(item => item.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);
  }, [people, houses, codexEntries]);

  // Feature gate — after all hooks, so hook order is stable either way.
  if (!recentActivity) return null;

  // Show onboarding if no data
  if (!hasData) {
    return (
      <section className="recent-activity recent-activity-empty">
        <h2 className="activity-title">
          <Icon name="rocket" size={22} className="section-title-icon" />
          Getting Started
        </h2>
        
        <motion.div 
          className="onboarding-content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="onboarding-steps">
            <div className="onboarding-step">
              <span className="step-number">1</span>
              <span className="step-text">Create your first <strong>House</strong> to establish a noble family</span>
            </div>
            <div className="onboarding-step">
              <span className="step-number">2</span>
              <span className="step-text">Add <strong>People</strong> and define their relationships</span>
            </div>
            <div className="onboarding-step">
              <span className="step-number">3</span>
              <span className="step-text">Explore the <strong>Family Tree</strong> to visualize your lineage</span>
            </div>
            <div className="onboarding-step">
              <span className="step-number">4</span>
              <span className="step-text">Document lore in <strong>The Codex</strong> encyclopedia</span>
            </div>
          </div>
          
          <p className="onboarding-tip">
            <Icon name="lightbulb" size={16} className="tip-icon" />
            <em>Tip: Use the Quick Actions above to get started quickly!</em>
          </p>
        </motion.div>
      </section>
    );
  }
  
  // Show activity feed if we have items
  if (activityItems.length === 0) {
    return (
      <section className="recent-activity">
        <h2 className="activity-title">
          <Icon name="clock" size={22} className="section-title-icon" />
          Recent Activity
        </h2>
        <p className="activity-empty-text">No recent activity to display.</p>
      </section>
    );
  }
  
  return (
    <section className="recent-activity">
      <h2 className="activity-title">
        <Icon name="clock" size={22} className="section-title-icon" />
        Recent Activity
      </h2>
      
      <motion.ul 
        className="activity-list"
        variants={staggeredEntrance ? CONTAINER_VARIANTS : {}}
        initial={staggeredEntrance ? "hidden" : false}
        animate={staggeredEntrance ? "visible" : false}
      >
        {activityItems.map((item) => (
          <motion.li 
            key={item.id}
            className="activity-item"
            variants={staggeredEntrance ? ITEM_VARIANTS : {}}
            onClick={() => {
              if (item.navigationType === 'person') handleNavigateToPerson(item.entityId);
              else if (item.navigationType === 'house') handleNavigateToHouse(item.entityId);
              else if (item.navigationType === 'codex') handleNavigateToCodex(item.entityId);
            }}
            whileHover={{ x: 4, backgroundColor: 'var(--bg-secondary)' }}
          >
            <span className="activity-icon">
              <Icon name={getActivityIconName(item.type)} size={18} strokeWidth={1.75} />
            </span>
            <span className="activity-details">
              <span className="activity-action">{item.action}:</span>
              <span className="activity-name">{item.title}</span>
            </span>
            <span className="activity-time">{formatRelativeTime(item.timestamp)}</span>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}
