/**
 * HouseHeraldrySection.jsx
 * 
 * PHASE 5 BATCH 2: Family Tree ↔ Heraldry Integration
 * 
 * A dedicated section for displaying and managing house heraldry
 * within the QuickEditPanel sidebar. Replaces the old inline
 * HeraldryCreationModal with navigation-based integration to The Armory.
 * 
 * DATA ARCHITECTURE:
 * - NEW SYSTEM: house.heraldryId → fetches from heraldry table
 * - LEGACY SYSTEM: house.heraldryThumbnail / house.heraldryImageData
 * - Both systems are supported for backward compatibility
 * 
 * FEATURES:
 * - Displays heraldry thumbnail (100×100)
 * - Shows blazon text if available
 * - "View in Armory" button → /heraldry/edit/:id
 * - "Create Arms" button → /heraldry/create?houseId=X
 * - Supports both new and legacy heraldry systems
 * - Uses CSS custom properties for theming
 * 
 * Props:
 * - house: House object (required)
 * - isDarkTheme: Boolean for theme styling
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDataset } from '../contexts/DatasetContext';
import { getHeraldry } from '../services/heraldryService';
import HeraldryThumbnail from './HeraldryThumbnail';
import './HouseHeraldrySection.css';
import { logger } from '../utils/logger';
import Icon from './icons';

function HouseHeraldrySection({ house, isDarkTheme = true }) {
  const navigate = useNavigate();
  const { activeDataset } = useDataset();

  // ==================== STATE ====================
  const [heraldry, setHeraldry] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ==================== THEME ====================
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    bgLight: '#3a2f20',
    bgLighter: '#4a3d2a',
    text: '#e9dcc9',
    textSecondary: '#b8a989',
    border: '#4a3d2a',
    accent: '#d4a574',
    accentHover: '#e0b585'
  } : {
    bg: '#ede7dc',
    bgLight: '#e5dfd0',
    bgLighter: '#d8d0c0',
    text: '#2d2418',
    textSecondary: '#4a3d2a',
    border: '#d4c4a4',
    accent: '#b8874a',
    accentHover: '#a07840'
  };

  // ==================== LOAD HERALDRY ====================
  useEffect(() => {
    if (house?.heraldryId) {
      loadHeraldry(house.heraldryId);
    } else {
      setHeraldry(null);
      setLoading(false);
    }
  }, [house?.heraldryId, activeDataset]);

  const loadHeraldry = async (heraldryId) => {
    const datasetId = activeDataset?.id;
    setLoading(true);
    setError(null);

    try {
      const data = await getHeraldry(heraldryId, datasetId);
      setHeraldry(data);
    } catch (err) {
      logger.error('❌ Failed to load heraldry:', err);
      setError('Failed to load heraldry');
      setHeraldry(null);
    } finally {
      setLoading(false);
    }
  };

  // ==================== DETERMINE HERALDRY STATUS ====================
  /**
   * Determine if the house has heraldry and from which system
   * Returns: { hasHeraldry, source, data }
   */
  const getHeraldryStatus = () => {
    // Check new system first
    if (house?.heraldryId && heraldry) {
      return {
        hasHeraldry: true,
        source: 'new',
        data: heraldry
      };
    }
    
    // Check if still loading new system
    if (house?.heraldryId && loading) {
      return {
        hasHeraldry: false,
        source: 'loading',
        data: null
      };
    }
    
    // Check legacy system
    if (house?.heraldryThumbnail || house?.heraldryImageData || house?.heraldrySVG) {
      return {
        hasHeraldry: true,
        source: 'legacy',
        data: {
          name: `${house.houseName} Arms`,
          heraldryThumbnail: house.heraldryThumbnail,
          heraldryDisplay: house.heraldryImageData,
          heraldrySVG: house.heraldrySVG,
          shieldType: house.heraldryShieldType
        }
      };
    }
    
    // No heraldry
    return {
      hasHeraldry: false,
      source: 'none',
      data: null
    };
  };

  const status = getHeraldryStatus();

  // ==================== HANDLERS ====================
  const handleViewInArmory = () => {
    if (heraldry?.id) {
      navigate(`/heraldry/edit/${heraldry.id}`);
    }
  };

  const handleCreateNew = () => {
    // Navigate to creator with house pre-selected
    const params = new URLSearchParams();
    params.set('houseId', house.id);
    params.set('houseName', house.houseName);
    navigate(`/heraldry/create?${params.toString()}`);
  };

  const handleBrowseArmory = () => {
    navigate('/heraldry');
  };

  // ==================== RENDER ====================
  if (!house) return null;

  return (
    <section className={`house-heraldry-section ${isDarkTheme ? 'dark' : 'light'}`}>
      {/* Section Header */}
      <h3 
        className="section-header"
        style={{ color: theme.textSecondary }}
      >
        <Icon name="shield" /> House Heraldry
      </h3>

      {/* Loading State */}
      {status.source === 'loading' && (
        <div 
          className="heraldry-loading"
          style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
        >
          <div className="loading-spinner">⏳</div>
          <span style={{ color: theme.textSecondary }}>Loading heraldry...</span>
        </div>
      )}

      {/* Has Heraldry - Display it */}
      {status.hasHeraldry && (
        <div className="heraldry-display">
          {/* Main Content Row */}
          <div 
            className="heraldry-content"
            style={{ backgroundColor: theme.bgLight, borderColor: theme.border }}
          >
            {/* Thumbnail - using size 70 for good detail in sidebar */}
            <div className="heraldry-thumb-container">
              <HeraldryThumbnail
                house={house}
                heraldryRecord={status.data}
                size={70}
                showBorder={false}
                isDarkTheme={isDarkTheme}
                onClick={status.source === 'new' ? handleViewInArmory : null}
                preserveAspectRatio={true}
              />
            </div>

            {/* Info */}
            <div className="heraldry-info">
              <div 
                className="heraldry-name"
                style={{ color: theme.text }}
              >
                {status.data?.name || `${house.houseName} Arms`}
              </div>
              
              {/* Blazon (if available) */}
              {status.data?.blazon && (
                <div 
                  className="heraldry-blazon"
                  style={{ color: theme.textSecondary }}
                >
                  <em>"{status.data.blazon}"</em>
                </div>
              )}
              
              {/* Shield Type */}
              {status.data?.shieldType && (
                <div 
                  className="heraldry-shield-type"
                  style={{ color: theme.textSecondary }}
                >
                  {status.data.shieldType.charAt(0).toUpperCase() + status.data.shieldType.slice(1)} shield
                </div>
              )}

              {/* Source Badge */}
              <div 
                className={`heraldry-source-badge ${status.source}`}
                style={{ 
                  backgroundColor: status.source === 'new' ? `${theme.accent}33` : theme.bgLighter,
                  color: status.source === 'new' ? theme.accent : theme.textSecondary
                }}
              >
                {status.source === 'new' ? '✨ Armory' : '📜 Legacy'}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="heraldry-actions">
            {status.source === 'new' ? (
              // New system - can edit in Armory
              <button
                onClick={handleViewInArmory}
                className="action-btn primary"
                style={{
                  backgroundColor: theme.accent,
                  color: isDarkTheme ? '#1a1410' : '#ffffff'
                }}
              >
                <Icon name="shield" />
                <span>Edit in Armory</span>
              </button>
            ) : (
              // Legacy system - can create new (migrate)
              <button
                onClick={handleCreateNew}
                className="action-btn secondary"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.accent,
                  borderColor: theme.accent
                }}
              >
                <Icon name="sparkles" />
                <span>Upgrade in Armory</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* No Heraldry - Show Creation Prompt */}
      {!status.hasHeraldry && status.source === 'none' && (
        <div className="heraldry-empty">
          {/* Placeholder */}
          <div 
            className="empty-placeholder"
            style={{ 
              backgroundColor: theme.bgLight, 
              borderColor: theme.border,
              color: theme.textSecondary
            }}
          >
            <div className="empty-icon">🛡️</div>
            <div className="empty-text">No heraldry assigned</div>
            <div className="empty-subtext">
              Create arms for {house.houseName} in The Armory
            </div>
          </div>

          {/* Action Buttons */}
          <div className="heraldry-actions">
            <button
              onClick={handleCreateNew}
              className="action-btn primary"
              style={{
                backgroundColor: theme.accent,
                color: isDarkTheme ? '#1a1410' : '#ffffff'
              }}
            >
              <Icon name="sparkles" />
              <span>Create Arms</span>
            </button>
            <button
              onClick={handleBrowseArmory}
              className="action-btn secondary"
              style={{
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                borderColor: theme.border
              }}
            >
              <Icon name="search" />
              <span>Browse Armory</span>
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div 
          className="heraldry-error"
          style={{ 
            backgroundColor: '#a65d5d22', 
            borderColor: '#a65d5d',
            color: theme.text
          }}
        >
          <Icon name="alert-triangle" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

export default HouseHeraldrySection;
