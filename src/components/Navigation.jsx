/**
 * Navigation.jsx - Main Navigation Component
 *
 * PURPOSE:
 * Consistent navigation bar across all pages featuring:
 * - App logo with icon (links to home)
 * - Page navigation links with icons
 * - Optional search bar
 * - Theme toggle
 * - User menu and sync status
 * - Mobile-responsive hamburger menu
 *
 * DESIGN SYSTEM:
 * Uses Lucide icons and CSS custom properties for theming.
 * Animations via Framer Motion for smooth transitions.
 */

import { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons';
import SearchBar from './SearchBar';
import ThemeSelector from './ThemeSelector';
import { useTheme } from './ThemeContext';
import { UserMenu, SyncStatusIndicator } from './auth';
import { SuggestionsBadge } from './suggestions';
import { useDignityAnalysis } from '../hooks';
import './Navigation.css';

// Navigation link configuration
const NAV_LINKS = [
  { path: '/', label: 'Home', icon: 'home', exact: true },
  { path: '/tree', label: 'Family Tree', icon: 'tree-deciduous' },
  { path: '/codex', label: 'The Codex', icon: 'book-open' },
  { path: '/heraldry', label: 'Heraldry', icon: 'shield' },
  { path: '/dignities', label: 'Dignities', icon: 'crown' },
  { path: '/manage', label: 'Manage', icon: 'anvil' }
];

// Mobile menu animation variants
const MOBILE_MENU_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 }
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: 'easeOut' }
  }
};

/**
 * Navigation Component
 *
 * @param {Object} props
 * @param {Array} props.people - People data for search (optional)
 * @param {Function} props.onSearchResults - Search results callback (optional)
 * @param {boolean} props.showSearch - Whether to show search bar
 * @param {boolean} props.showControlsToggle - Whether to show controls toggle (tree page)
 * @param {boolean} props.controlsExpanded - Controls expanded state
 * @param {Function} props.onToggleControls - Controls toggle callback
 * @param {boolean} props.compactMode - Use icon-only nav links to save space
 */
function Navigation({
  people = [],
  onSearchResults = null,
  showSearch = false,
  showControlsToggle = false,
  controlsExpanded = false,
  onToggleControls = null,
  compactMode = false
}) {
  const location = useLocation();
  const { isDarkTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Get critical suggestion count for nav badge
  const { criticalCount } = useDignityAnalysis({ autoRun: false });

  // Check if link is active
  const isActive = useCallback((path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  }, [location.pathname]);

  // Toggle mobile menu
  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  // Close mobile menu on link click
  const handleMobileLinkClick = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <nav className="nav">
      <div className="nav__container">
        <div className="nav__content">
          {/* Logo/Brand */}
          <Link to="/" className="nav__brand">
            <span className="nav__brand-icon">
              <Icon name="network" size={24} strokeWidth={1.5} />
            </span>
            <span>Lineageweaver</span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className={`nav__links ${compactMode ? 'nav__links--compact' : ''}`}>
            {NAV_LINKS.map(({ path, label, icon, exact }) => (
              <Link
                key={path}
                to={path}
                className={`nav__link ${isActive(path, exact) ? 'nav__link--active' : ''} ${compactMode ? 'nav__link--icon-only' : ''}`}
              >
                <span className="nav__link-icon">
                  <Icon name={icon} size={compactMode ? 20 : 18} strokeWidth={1.5} />
                </span>
                {/* In compact mode, show label in hover tooltip; otherwise inline */}
                {compactMode ? (
                  <span className="nav__link-tooltip">{label}</span>
                ) : (
                  <span className="nav__link-label">{label}</span>
                )}
                {/* Show suggestion badge for Dignities link */}
                {path === '/dignities' && criticalCount > 0 && (
                  <SuggestionsBadge
                    count={criticalCount}
                    severity="critical"
                    size="sm"
                    pulse
                  />
                )}
              </Link>
            ))}
          </div>

          {/* Right Side Actions */}
          <div className="nav__actions">
            {/* Search Bar */}
            {showSearch && people.length > 0 && (
              <SearchBar
                people={people}
                onSearchResults={onSearchResults || (() => {})}
                isDarkTheme={isDarkTheme()}
              />
            )}

            {/* Controls Toggle (Tree page) */}
            {showControlsToggle && onToggleControls && (
              <motion.button
                className={`nav__controls-toggle ${controlsExpanded ? 'nav__controls-toggle--expanded' : ''}`}
                onClick={onToggleControls}
                title={controlsExpanded ? 'Hide controls' : 'Show controls'}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="nav__controls-toggle-icon">
                  <Icon name="chevron-down" size={18} strokeWidth={2} />
                </span>
              </motion.button>
            )}

            {/* Theme Toggle */}
            <ThemeSelector variant="toggle" showLabel={false} />

            {/* Cloud Sync Status */}
            <SyncStatusIndicator />

            {/* User Menu */}
            <UserMenu />

            {/* Mobile Menu Toggle */}
            <motion.button
              className="nav__mobile-toggle"
              onClick={toggleMobileMenu}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon name={mobileMenuOpen ? 'x' : 'menu'} size={22} strokeWidth={2} />
            </motion.button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              className="nav__mobile-menu nav__mobile-menu--open"
              variants={MOBILE_MENU_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <div className="nav__mobile-links">
                {NAV_LINKS.map(({ path, label, icon, exact }) => (
                  <Link
                    key={path}
                    to={path}
                    className={`nav__mobile-link ${isActive(path, exact) ? 'nav__mobile-link--active' : ''}`}
                    onClick={handleMobileLinkClick}
                  >
                    <Icon name={icon} size={20} strokeWidth={1.5} />
                    <span>{label}</span>
                    {path === '/dignities' && criticalCount > 0 && (
                      <SuggestionsBadge
                        count={criticalCount}
                        severity="critical"
                        size="sm"
                      />
                    )}
                  </Link>
                ))}
              </div>

              <div className="nav__mobile-actions">
                <ThemeSelector variant="toggle" showLabel />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

export default Navigation;
