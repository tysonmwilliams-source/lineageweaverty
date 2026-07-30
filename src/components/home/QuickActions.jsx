/**
 * QuickActions.jsx - Quick Action Buttons
 * 
 * PURPOSE:
 * Provides fast access to common actions like adding a person,
 * creating a codex entry, searching, or exporting data.
 * 
 * ANIMATIONS:
 * - Staggered entrance
 * - Hover pulse/lift effects
 * 
 * FEATURES USED:
 * - quickActions: Whether to show this section
 * - staggeredEntrance: Whether buttons animate in
 * - cardAnimations: Hover effects
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '../icons';
import './QuickActions.css';

// Animation variants defined outside component to prevent recreation on each render
const CONTAINER_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05
    }
  }
};

const BUTTON_VARIANTS = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20
    }
  }
};

/**
 * QuickActions Component
 * 
 * @param {Object} props
 * @param {Object} props.features - Feature flags
 * @param {Function} props.onExport - Callback for export action
 * @param {Function} props.onSearch - Callback for search action (optional)
 */
export default function QuickActions({ features, onExport, onSearch }) {
  const navigate = useNavigate();
  const { quickActions, staggeredEntrance, cardAnimations } = features;

  // NOTE: the early return for `!quickActions` lives at the bottom of this
  // component, after every hook. It used to sit here, which made all six hooks
  // below conditional — React identifies hooks by call order, so toggling the
  // flag would have shifted every subsequent hook's identity and corrupted
  // this component's hook state.

  // Memoized navigation handlers
  const handleAddPerson = useCallback(() => {
    navigate('/manage', { state: { openTab: 'people', action: 'add' } });
  }, [navigate]);
  
  const handleAddHouse = useCallback(() => {
    navigate('/manage', { state: { openTab: 'houses', action: 'add' } });
  }, [navigate]);
  
  const handleNewCodex = useCallback(() => {
    navigate('/codex/create');
  }, [navigate]);
  
  const handleCreateArms = useCallback(() => {
    navigate('/heraldry/create');
  }, [navigate]);
  
  const handleExport = useCallback(() => {
    if (onExport) {
      onExport();
    } else {
      navigate('/manage', { state: { openTab: 'import-export' } });
    }
  }, [navigate, onExport]);
  
  // Define the quick actions with icon names
  const actions = useMemo(() => [
    { id: 'add-person', iconName: 'user', label: 'Add Person', onClick: handleAddPerson },
    { id: 'add-house', iconName: 'castle', label: 'Add House', onClick: handleAddHouse },
    { id: 'new-codex', iconName: 'file-edit', label: 'New Entry', onClick: handleNewCodex },
    { id: 'create-arms', iconName: 'shield', label: 'Create Arms', onClick: handleCreateArms },
    { id: 'export', iconName: 'download', label: 'Export', onClick: handleExport },
  ], [handleAddPerson, handleAddHouse, handleNewCodex, handleCreateArms, handleExport]);

  // Feature gate — after all hooks, so hook order is stable either way.
  if (!quickActions) return null;

  return (
    <section className="quick-actions">
      <h2 className="quick-actions-title">
        <Icon name="zap" size={22} className="section-title-icon" />
        Quick Actions
      </h2>
      
      <motion.div 
        className="quick-actions-grid"
        variants={staggeredEntrance ? CONTAINER_VARIANTS : {}}
        initial={staggeredEntrance ? "hidden" : false}
        animate={staggeredEntrance ? "visible" : false}
      >
        {actions.map((action) => (
          <motion.button
            key={action.id}
            className="quick-action-button"
            onClick={action.onClick}
            variants={staggeredEntrance ? BUTTON_VARIANTS : {}}
            whileHover={cardAnimations ? { 
              y: -2,
              scale: 1.02,
              transition: { duration: 0.15 }
            } : {}}
            whileTap={cardAnimations ? { scale: 0.98 } : {}}
          >
            <span className="action-icon">
              <Icon name={action.iconName} size={20} strokeWidth={1.75} />
            </span>
            <span className="action-label">{action.label}</span>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
