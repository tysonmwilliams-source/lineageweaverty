/**
 * HeraldryThumbnail Component
 * 
 * UPDATED FOR PHASE 5: Now supports both legacy and new heraldry systems
 * 
 * Displays house heraldry as a thumbnail image or placeholder.
 * Used in sidebars, dropdowns, and anywhere house icons are needed.
 * 
 * ASPECT RATIO: Shields are naturally taller than wide (~5:6 ratio).
 * This component respects that by using 'contain' fitting and allowing
 * the natural aspect ratio to show.
 * 
 * DATA SOURCES (checked in order):
 * 1. NEW SYSTEM: house.heraldryId → fetches from heraldry table
 * 2. LEGACY SYSTEM: house.heraldryThumbnail / house.heraldryImageData
 * 3. PLACEHOLDER: Shows shield icon
 * 
 * Props:
 * - house: House object with heraldry data
 * - heraldryRecord: Optional pre-fetched heraldry record (avoids extra fetch)
 * - size: 'small' (40px) | 'medium' (80px) | 'large' (200px) | number (sets width, height auto)
 * - onClick: Optional click handler
 * - showBorder: Whether to show house color border
 * - isDarkTheme: Theme for placeholder styling
 * - loading: Optional loading state override
 * - preserveAspectRatio: If true (default), maintains shield proportions
 */

import React, { useState, useEffect } from 'react';
import { useDataset } from '../contexts/DatasetContext';
import { getHeraldry } from '../services/heraldryService';
import { logger } from '../utils/logger';

// Shield aspect ratio - most heraldic shields are taller than wide
// Common ratios: heater ~5:6, french ~4:5, etc.
const SHIELD_ASPECT_RATIO = 1.2; // height = width * 1.2

function HeraldryThumbnail({
  house,
  heraldryRecord = null,  // Optional: pre-fetched heraldry data
  size = 'small',
  onClick = null,
  showBorder = true,
  isDarkTheme = true,
  loading: externalLoading = false,
  preserveAspectRatio = true  // New prop to maintain shield proportions
}) {

  // ==================== CONTEXT ====================
  const { activeDataset } = useDataset();

  // ==================== STATE ====================
  const [fetchedHeraldry, setFetchedHeraldry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // ==================== SIZE CALCULATION ====================
  const sizeMap = {
    small: 40,
    medium: 80,
    large: 200
  };
  
  const baseSize = typeof size === 'number' ? size : (sizeMap[size] || 40);
  
  // Calculate dimensions based on aspect ratio preference
  const width = baseSize;
  const height = preserveAspectRatio ? Math.round(baseSize * SHIELD_ASPECT_RATIO) : baseSize;
  
  // ==================== THEME ====================
  const theme = isDarkTheme ? {
    bg: '#2d2418',
    text: '#e9dcc9',
    border: '#4a3d2a',
    placeholder: '#3a2f20'
  } : {
    bg: '#ede7dc',
    text: '#2d2418',
    border: '#d4c4a4',
    placeholder: '#f5ede0'
  };

  // ==================== FETCH HERALDRY FROM NEW SYSTEM ====================
  useEffect(() => {
    // If we already have a pre-fetched record, no need to fetch
    if (heraldryRecord) {
      setFetchedHeraldry(null);
      return;
    }

    // Check if house has a heraldryId (new system)
    if (house?.heraldryId && !fetchedHeraldry) {
      fetchHeraldryData(house.heraldryId);
    } else if (!house?.heraldryId) {
      // Clear fetched data if house no longer has heraldryId
      setFetchedHeraldry(null);
    }
  }, [house?.heraldryId, heraldryRecord, activeDataset]);

  const fetchHeraldryData = async (heraldryId) => {
    const datasetId = activeDataset?.id;
    setIsLoading(true);
    setFetchError(false);

    try {
      const data = await getHeraldry(heraldryId, datasetId);
      setFetchedHeraldry(data);
    } catch (error) {
      logger.error('❌ Failed to fetch heraldry:', error);
      setFetchError(true);
      setFetchedHeraldry(null);
    } finally {
      setIsLoading(false);
    }
  };

  // ==================== DETERMINE IMAGE SOURCE ====================
  /**
   * Priority order for image source (prefer higher quality):
   * 1. heraldryDisplay (200×200) or heraldryHighRes (400×400) for larger sizes
   * 2. heraldryThumbnail (40×40) for small sizes
   * 3. Legacy heraldryImageData
   */
  const getImageSource = () => {
    const record = heraldryRecord || fetchedHeraldry;
    
    if (record) {
      // For larger displays, prefer higher resolution
      if (baseSize > 60) {
        return record.heraldryHighRes || 
               record.heraldryDisplay || 
               record.heraldryThumbnail ||
               record.heraldryImageData ||
               null;
      }
      // For small displays, thumbnail is fine
      return record.heraldryThumbnail || 
             record.heraldryDisplay ||
             record.heraldryImageData ||
             null;
    }
    
    // Legacy data on house
    if (house?.heraldryThumbnail || house?.heraldryImageData || house?.heraldryDisplay) {
      if (baseSize > 60) {
        return house.heraldryDisplay || house.heraldryHighRes || house.heraldryThumbnail || house.heraldryImageData;
      }
      return house.heraldryThumbnail || house.heraldryImageData;
    }
    
    return null;
  };

  const imageSource = getImageSource();
  const hasHeraldry = !!imageSource;
  const showLoading = isLoading || externalLoading;

  // ==================== STYLES ====================
  const containerStyle = {
    width: `${width}px`,
    height: `${height}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onClick ? 'pointer' : 'default',
    border: showBorder ? `2px solid ${house?.colorCode || theme.border}` : 'none',
    borderRadius: '4px',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    backgroundColor: 'transparent', // Let the image show through
    flexShrink: 0
  };

  // ==================== HANDLERS ====================
  const handleClick = (e) => {
    if (onClick) {
      onClick(e);
    }
  };

  const handleMouseEnter = (e) => {
    if (onClick) {
      // Subtle opacity change instead of scale (scale breaks mixBlendMode)
      e.currentTarget.style.opacity = '0.85';
      e.currentTarget.style.cursor = 'pointer';
    }
  };

  const handleMouseLeave = (e) => {
    if (onClick) {
      e.currentTarget.style.opacity = '1';
    }
  };

  // ==================== RENDER: LOADING STATE ====================
  if (showLoading) {
    return (
      <div 
        style={{
          ...containerStyle,
          backgroundColor: theme.placeholder
        }}
        title="Loading heraldry..."
      >
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.text,
          fontSize: `${baseSize * 0.4}px`,
          animation: 'pulse 1.5s ease-in-out infinite'
        }}>
          ⏳
        </div>
      </div>
    );
  }

  // ==================== RENDER: HAS HERALDRY ====================
  if (hasHeraldry) {
    // For heraldry display, we use a cleaner container without border
    // The shield image itself provides the visual boundary
    // NO hover effects here - they interfere with mixBlendMode
    const heraldryContainerStyle = {
      width: `${width}px`,
      height: `${height}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: onClick ? 'pointer' : 'default',
      border: 'none',  // No border - shield provides its own boundary
      borderRadius: '0',
      overflow: 'hidden',
      backgroundColor: 'transparent',
      flexShrink: 0
    };

    return (
      <div 
        style={heraldryContainerStyle}
        onClick={handleClick}
        // No hover handlers - they break mixBlendMode rendering
        title={house?.houseName ? `${house.houseName} Heraldry` : 'House Heraldry'}
      >
        <img 
          src={imageSource} 
          alt={`${house?.houseName || 'House'} Heraldry`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',  // Preserve aspect ratio, fit within container
            display: 'block',
            // Mix-blend-mode helps the white background blend with surrounding area
            // 'multiply' makes white transparent while preserving colors
            mixBlendMode: 'multiply'
          }}
        />
      </div>
    );
  }

  // ==================== RENDER: PLACEHOLDER (No Heraldry) ====================
  return (
    <div 
      style={{
        ...containerStyle,
        backgroundColor: house?.colorCode ? `${house.colorCode}22` : theme.placeholder
      }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={onClick ? 'Click to add heraldry' : 'No heraldry set'}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: house?.colorCode || theme.text,
        fontSize: `${baseSize * 0.5}px`,
        fontWeight: 'bold',
        fontFamily: 'serif'
      }}>
        🛡️
      </div>
    </div>
  );
}

export default HeraldryThumbnail;
