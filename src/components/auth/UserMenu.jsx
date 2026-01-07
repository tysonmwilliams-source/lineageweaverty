/**
 * UserMenu.jsx - User Account Menu Component
 * 
 * Displays the current user's info and provides sign-out functionality.
 * Designed to sit in the navigation bar/header.
 * 
 * Shows:
 * - User's profile photo (or initials fallback)
 * - User's display name
 * - Sign out button (in dropdown)
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Get initials from a display name
 * "John Doe" → "JD"
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

export default function UserMenu() {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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
      // AuthContext will update, App will show login
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  if (!user) return null;

  return (
    <div className="user-menu" ref={menuRef}>
      {/* Trigger Button */}
      <button 
        className="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.photoURL ? (
          <img 
            src={user.photoURL} 
            alt={user.displayName || 'User'} 
            className="user-avatar"
          />
        ) : (
          <span className="user-avatar user-avatar-initials">
            {getInitials(user.displayName)}
          </span>
        )}
        <span className="user-name">{user.displayName || user.email}</span>
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-menu-header">
            <p className="user-email">{user.email}</p>
          </div>
          <div className="user-menu-divider" />
          <button 
            className="user-menu-item signout-button"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      )}

      <style>{`
        .user-menu {
          position: relative;
        }

        .user-menu-trigger {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-1) var(--space-2);
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: var(--text-sm);
          cursor: pointer;
          transition: 
            background-color var(--duration-fast) var(--ease-standard),
            border-color var(--duration-fast) var(--ease-standard);
        }

        .user-menu-trigger:hover {
          background: var(--bg-elevated);
          border-color: var(--border-primary);
        }

        .user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          border: 1px solid var(--border-primary);
        }

        .user-avatar-initials {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--interactive-default);
          color: var(--text-inverse);
          font-size: var(--text-xs);
          font-weight: 600;
        }

        .user-name {
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dropdown-arrow {
          font-size: 8px;
          color: var(--text-tertiary);
        }

        .user-menu-dropdown {
          position: absolute;
          top: calc(100% + var(--space-1));
          right: 0;
          min-width: 200px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-secondary);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-lg);
          z-index: var(--z-dropdown);
          overflow: hidden;
        }

        .user-menu-header {
          padding: var(--space-3);
        }

        .user-email {
          font-size: var(--text-sm);
          color: var(--text-secondary);
          margin: 0;
          word-break: break-all;
        }

        .user-menu-divider {
          height: 1px;
          background: var(--border-primary);
        }

        .user-menu-item {
          display: block;
          width: 100%;
          padding: var(--space-3);
          background: transparent;
          border: none;
          text-align: left;
          font-family: var(--font-body);
          font-size: var(--text-sm);
          color: var(--text-primary);
          cursor: pointer;
          transition: background-color var(--duration-fast) var(--ease-standard);
        }

        .user-menu-item:hover:not(:disabled) {
          background: var(--bg-tertiary);
        }

        .user-menu-item:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .signout-button {
          color: var(--color-error-light);
        }

        .signout-button:hover:not(:disabled) {
          background: var(--color-error-bg);
        }

        /* Hide on small screens - just show avatar */
        @media (max-width: 640px) {
          .user-name {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
