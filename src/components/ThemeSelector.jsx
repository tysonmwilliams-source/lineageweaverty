/**
 * ThemeSelector.jsx
 * 
 * UI component for selecting and switching themes in Lineageweaver.
 * Can be displayed as a dropdown, toggle button, or button group.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from './ThemeContext';
import './ThemeSelector.css';

/**
 * ThemeSelector Component
 * 
 * @param {Object} props
 * @param {string} props.variant - Display variant: 'dropdown' | 'toggle' | 'buttons'
 * @param {boolean} props.showLabel - Show "Theme:" label
 * @param {string} props.className - Additional CSS classes
 */
export const ThemeSelector = ({ 
  variant = 'dropdown', 
  showLabel = true,
  className = '' 
}) => {
  const { theme, setTheme, toggleTheme, availableThemes, getCurrentThemeConfig } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Render dropdown variant
  if (variant === 'dropdown') {
    const currentConfig = getCurrentThemeConfig();

    return (
      <div className={`theme-selector theme-selector--dropdown ${className}`} ref={dropdownRef}>
        {showLabel && <label className="theme-selector__label">Theme:</label>}
        
        <button 
          className="theme-selector__trigger"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
        >
          <span className="theme-selector__current">
            {currentConfig.name}
          </span>
          <svg 
            className={`theme-selector__arrow ${isOpen ? 'theme-selector__arrow--open' : ''}`}
            width="16" 
            height="16" 
            viewBox="0 0 16 16" 
            fill="none"
          >
            <path 
              d="M4 6L8 10L12 6" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="theme-selector__dropdown">
            {availableThemes.map((themeConfig) => (
              <button
                key={themeConfig.id}
                className={`theme-selector__option ${
                  themeConfig.id === theme ? 'theme-selector__option--selected' : ''
                }`}
                onClick={() => {
                  setTheme(themeConfig.id);
                  setIsOpen(false);
                }}
              >
                <div className="theme-selector__option-content">
                  <span className="theme-selector__option-name">
                    {themeConfig.name}
                  </span>
                  {themeConfig.id === theme && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path 
                        d="M3 8L6 11L13 4" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="theme-selector__option-description">
                  {themeConfig.description}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Render toggle button variant
  if (variant === 'toggle') {
    const currentConfig = getCurrentThemeConfig();
    const isDark = currentConfig.category === 'dark';

    return (
      <div className={`theme-selector theme-selector--toggle ${!showLabel ? 'theme-selector--icon-only' : ''} ${className}`}>
        {showLabel && <label className="theme-selector__label">Theme:</label>}
        
        <button 
          className={`theme-selector__toggle-button ${!showLabel ? 'theme-selector__toggle-button--icon-only' : ''}`}
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          title={`Current: ${currentConfig.name}. Click to switch to ${isDark ? 'light' : 'dark'} theme`}
        >
          {isDark ? (
            // Moon icon for dark theme
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path 
                d="M17 10.5C16.1 13.8 13 16 10 16C6 16 3 13 3 9C3 6 5.2 3.9 8.5 3C7 4.5 6 6.5 6 9C6 12 8 14 11 14C13.5 14 15.5 13 17 11.5V10.5Z" 
                fill="currentColor"
              />
            </svg>
          ) : (
            // Sun icon for light theme
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="3" fill="currentColor"/>
              <line x1="10" y1="2" x2="10" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="10" y1="16" x2="10" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="18" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="4" y1="10" x2="2" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="15.5" y1="4.5" x2="14" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="6" y1="14" x2="4.5" y2="15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="15.5" y1="15.5" x2="14" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="6" y1="6" x2="4.5" y2="4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
          {showLabel && (
            <span className="theme-selector__toggle-text">
              {currentConfig.name}
            </span>
          )}
        </button>
      </div>
    );
  }

  // Render button group variant
  if (variant === 'buttons') {
    return (
      <div className={`theme-selector theme-selector--buttons ${className}`}>
        {showLabel && <label className="theme-selector__label">Theme:</label>}
        
        <div className="theme-selector__button-group">
          {availableThemes.map((themeConfig) => (
            <button
              key={themeConfig.id}
              className={`theme-selector__button ${
                themeConfig.id === theme ? 'theme-selector__button--active' : ''
              }`}
              onClick={() => setTheme(themeConfig.id)}
              title={themeConfig.description}
            >
              {themeConfig.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default ThemeSelector;
