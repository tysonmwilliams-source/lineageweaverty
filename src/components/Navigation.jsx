import { Link, useLocation } from 'react-router-dom';
import SearchBar from './SearchBar';
import ThemeSelector from './ThemeSelector';
import { useTheme } from './ThemeContext';
import { UserMenu, SyncStatusIndicator } from './auth';

/**
 * Navigation Component
 * 
 * Consistent navigation bar across all pages with:
 * - App title/logo (links to home)
 * - Page links (Home, Family Tree, Codex, Manage)
 * - Search bar (optional - only shown when people data provided)
 * - Theme toggle
 */
function Navigation({ people = [], onSearchResults = null, showSearch = false, showControlsToggle = false, controlsExpanded = false, onToggleControls = null }) {
  const location = useLocation();
  const { isDarkTheme } = useTheme();
  
  // Helper to determine if link is active
  const isActive = (path) => location.pathname === path;
  
  // Style for active/inactive links
  const getLinkStyle = (path) => ({
    color: isActive(path) ? 'var(--focus-ring)' : 'var(--text-secondary)',
    fontWeight: isActive(path) ? '600' : '400'
  });

  return (
    <nav style={{ 
      backgroundColor: 'var(--bg-secondary)', 
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' 
    }}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          {/* Logo/Title */}
          <Link 
            to="/" 
            className="text-xl font-bold hover:opacity-80 transition" 
            style={{ 
              color: 'var(--text-primary)', 
              fontFamily: 'var(--font-display)' 
            }}
          >
            Lineageweaver
          </Link>
          
          {/* Navigation Links & Controls */}
          <div className="flex items-center space-x-4">
            <Link 
              to="/" 
              style={getLinkStyle('/')} 
              className="hover:opacity-80 transition"
            >
              Home
            </Link>
            
            <Link 
              to="/tree" 
              style={getLinkStyle('/tree')} 
              className="hover:opacity-80 transition"
            >
              Family Tree
            </Link>
            
            <Link 
              to="/codex" 
              style={getLinkStyle('/codex')} 
              className="hover:opacity-80 transition"
            >
              The Codex
            </Link>
            
            <Link 
              to="/manage" 
              style={getLinkStyle('/manage')} 
              className="hover:opacity-80 transition"
            >
              Manage
            </Link>
            
            {/* Search Bar - only shown when people data provided */}
            {showSearch && people.length > 0 && (
              <SearchBar 
                people={people}
                onSearchResults={onSearchResults || (() => {})}
                isDarkTheme={isDarkTheme()}
              />
            )}
            
            {/* Controls Toggle - only shown on Family Tree page */}
            {showControlsToggle && onToggleControls && (
              <button
                onClick={onToggleControls}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-all hover:opacity-80"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  borderWidth: '1px',
                  borderColor: 'var(--border-primary)'
                }}
                title={controlsExpanded ? "Hide controls" : "Show controls"}
              >
                <span style={{ 
                  fontSize: '0.875rem', 
                  transform: controlsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', 
                  transition: 'transform 0.3s ease',
                  display: 'block'
                }}>
                  ▼
                </span>
              </button>
            )}
            
            {/* Theme Toggle */}
            <ThemeSelector variant="toggle" showLabel={false} />
            
            {/* Cloud Sync Status */}
            <SyncStatusIndicator />
            
            {/* User Menu - Sign out */}
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;