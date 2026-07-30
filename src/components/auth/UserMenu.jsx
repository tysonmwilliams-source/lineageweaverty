/**
 * UserMenu.jsx - User Account Menu Component
 *
 * PURPOSE:
 * Displays the current user's info, dataset switching, and sign-out functionality.
 * Designed to sit in the navigation bar/header.
 *
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useDataset } from '../../contexts/DatasetContext';
import Icon from '../icons';
import './UserMenu.css';
import { logger } from '../../utils/logger';

// ==================== ANIMATION VARIANTS ====================
const DROPDOWN_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -10,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 400
    }
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: 0.15 }
  }
};

/**
 * Get initials from a display name
 */
function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function UserMenu({ onOpenDatasetManager }) {
  const { user, signOut } = useAuth();
  const { datasets, activeDataset, switchDataset, isLoading: datasetsLoading } = useDataset();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle sign out
  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
    } catch (error) {
      logger.error('Sign out failed:', error);
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  // Handle dataset switch
  const handleDatasetSwitch = async (datasetId) => {
    if (activeDataset?.id === datasetId || isSwitching) return;

    try {
      setIsSwitching(true);
      await switchDataset(datasetId);
      // Reload page to refresh all data with new dataset
      window.location.reload();
    } catch (error) {
      logger.error('Dataset switch failed:', error);
    } finally {
      setIsSwitching(false);
    }
  };

  // Handle manage datasets click
  const handleManageDatasets = () => {
    setIsOpen(false);
    if (onOpenDatasetManager) {
      onOpenDatasetManager();
    }
  };

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      {/* Trigger Button */}
      <button
        className="user-menu__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="user-menu__avatar"
          />
        ) : (
          <span className="user-menu__avatar user-menu__avatar--initials">
            {getInitials(user.displayName)}
          </span>
        )}
        <span className="user-menu__name">{user.displayName || user.email}</span>
        <Icon
          name="chevron-down"
          size={14}
          className={`user-menu__arrow ${isOpen ? 'user-menu__arrow--open' : ''}`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="user-menu__dropdown"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="user-menu__header">
              <p className="user-menu__email">{user.email}</p>
            </div>

            {/* Datasets Section */}
            <div className="user-menu__divider" />
            <div className="user-menu__datasets">
              <div className="user-menu__datasets-header">
                <span className="user-menu__datasets-label">
                  <Icon name="database" size={14} />
                  Datasets
                </span>
                <button
                  className="user-menu__datasets-manage"
                  onClick={handleManageDatasets}
                  title="Manage datasets"
                >
                  <Icon name="settings" size={14} />
                </button>
              </div>
              <div className="user-menu__datasets-list">
                {datasetsLoading ? (
                  <div className="user-menu__datasets-loading">Loading...</div>
                ) : datasets.length === 0 ? (
                  <div className="user-menu__datasets-empty">No datasets</div>
                ) : (
                  datasets.map(dataset => (
                    <button
                      key={dataset.id}
                      className={`user-menu__dataset-item ${
                        activeDataset?.id === dataset.id
                          ? 'user-menu__dataset-item--active'
                          : ''
                      }`}
                      onClick={() => handleDatasetSwitch(dataset.id)}
                      disabled={isSwitching || activeDataset?.id === dataset.id}
                    >
                      <Icon
                        name={activeDataset?.id === dataset.id ? 'check-circle' : 'circle'}
                        size={14}
                        className="user-menu__dataset-icon"
                      />
                      <span className="user-menu__dataset-name">{dataset.name}</span>
                      {dataset.isDefault && (
                        <span className="user-menu__dataset-badge">Default</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Sign Out */}
            <div className="user-menu__divider" />
            <button
              className="user-menu__item user-menu__item--signout"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <Icon name="log-out" size={16} />
              <span>{isSigningOut ? 'Signing out...' : 'Sign out'}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
