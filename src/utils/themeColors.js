/**
 * themeColors.js
 * 
 * Utility functions for accessing theme colors from CSS custom properties.
 * This allows D3.js visualizations and other components to use theme colors dynamically.
 */

/**
 * Get a theme color by CSS variable name
 * 
 * @param {string} varName - CSS variable name (with or without --)
 * @returns {string} Color value (hex, rgb, etc.)
 * 
 * @example
 * const bgColor = getThemeColor('--bg-primary');
 * const textColor = getThemeColor('text-primary'); // Also works without --
 */
export function getThemeColor(varName) {
  const rootStyle = getComputedStyle(document.documentElement);
  const normalizedName = varName.startsWith('--') ? varName : `--${varName}`;
  return rootStyle.getPropertyValue(normalizedName).trim();
}

/**
 * Get house color from theme system
 * Houses cycle through 16 predefined colors that adapt to the current theme
 * 
 * @param {number} houseIndex - Index of house (0-based)
 * @returns {string} Hex color code
 * 
 * @example
 * const firstHouseColor = getHouseColor(0);  // Returns --house-red
 * const secondHouseColor = getHouseColor(1); // Returns --house-blue
 */
export function getHouseColor(houseIndex) {
  const rootStyle = getComputedStyle(document.documentElement);
  
  const houseColorVars = [
    '--house-red',
    '--house-blue',
    '--house-green',
    '--house-purple',
    '--house-gold',
    '--house-orange',
    '--house-teal',
    '--house-burgundy',
    '--house-navy',
    '--house-olive',
    '--house-brown',
    '--house-grey',
    '--house-maroon',
    '--house-forest',
    '--house-amber',
    '--house-slate'
  ];
  
  // Cycle through colors if more houses than colors
  const colorVar = houseColorVars[houseIndex % houseColorVars.length];
  return rootStyle.getPropertyValue(colorVar).trim();
}

/**
 * Get all relationship type colors from current theme
 * 
 * @returns {Object} Object with legitimate, bastard, and adopted colors
 * 
 * @example
 * const relationshipColors = getRelationshipColors();
 * svg.line.attr('stroke', relationshipColors.legitimate);
 */
export function getRelationshipColors() {
  const rootStyle = getComputedStyle(document.documentElement);
  
  return {
    legitimate: rootStyle.getPropertyValue('--legitimate-primary').trim(),
    bastard: rootStyle.getPropertyValue('--bastard-primary').trim(),
    adopted: rootStyle.getPropertyValue('--adopted-primary').trim(),
    commoner: rootStyle.getPropertyValue('--commoner-primary').trim(),
    unknown: rootStyle.getPropertyValue('--unknown-primary').trim()
  };
}

/**
 * Get all background colors from current theme
 * 
 * @returns {Object} Object with primary, secondary, tertiary, elevated backgrounds
 * 
 * @example
 * const backgrounds = getBackgroundColors();
 * div.style.backgroundColor = backgrounds.primary;
 */
export function getBackgroundColors() {
  const rootStyle = getComputedStyle(document.documentElement);
  
  return {
    primary: rootStyle.getPropertyValue('--bg-primary').trim(),
    secondary: rootStyle.getPropertyValue('--bg-secondary').trim(),
    tertiary: rootStyle.getPropertyValue('--bg-tertiary').trim(),
    elevated: rootStyle.getPropertyValue('--bg-elevated').trim()
  };
}

/**
 * Get all text colors from current theme
 * 
 * @returns {Object} Object with primary, secondary, tertiary, disabled text colors
 * 
 * @example
 * const textColors = getTextColors();
 * svg.text.attr('fill', textColors.primary);
 */
export function getTextColors() {
  const rootStyle = getComputedStyle(document.documentElement);
  
  return {
    primary: rootStyle.getPropertyValue('--text-primary').trim(),
    secondary: rootStyle.getPropertyValue('--text-secondary').trim(),
    tertiary: rootStyle.getPropertyValue('--text-tertiary').trim(),
    disabled: rootStyle.getPropertyValue('--text-disabled').trim()
  };
}

/**
 * Get all border colors from current theme
 * 
 * @returns {Object} Object with primary, secondary, heavy border colors
 * 
 * @example
 * const borders = getBorderColors();
 * rect.attr('stroke', borders.primary);
 */
export function getBorderColors() {
  const rootStyle = getComputedStyle(document.documentElement);
  
  return {
    primary: rootStyle.getPropertyValue('--border-primary').trim(),
    secondary: rootStyle.getPropertyValue('--border-secondary').trim(),
    heavy: rootStyle.getPropertyValue('--border-heavy').trim(),
    focus: rootStyle.getPropertyValue('--focus-ring').trim()
  };
}

/**
 * Get all semantic colors from current theme
 * 
 * @returns {Object} Object with success, warning, error, info colors
 * 
 * @example
 * const semantic = getSemanticColors();
 * alert.style.backgroundColor = semantic.error;
 */
export function getSemanticColors() {
  const rootStyle = getComputedStyle(document.documentElement);
  
  return {
    success: rootStyle.getPropertyValue('--color-success').trim(),
    warning: rootStyle.getPropertyValue('--color-warning').trim(),
    error: rootStyle.getPropertyValue('--color-error').trim(),
    info: rootStyle.getPropertyValue('--color-info').trim()
  };
}

/**
 * Get comprehensive theme colors for complex visualizations
 * This is a convenience function that returns all color categories at once
 * 
 * @returns {Object} Object with all theme color categories
 * 
 * @example
 * const colors = getAllThemeColors();
 * // colors.bg.primary, colors.text.secondary, colors.lines.legitimate, etc.
 */
export function getAllThemeColors() {
  return {
    bg: getBackgroundColors(),
    text: getTextColors(),
    border: getBorderColors(),
    semantic: getSemanticColors(),
    relationship: getRelationshipColors(),
    lines: getRelationshipColors(), // Alias for relationship colors
    statusBorders: getRelationshipColors() // Alias for borders
  };
}

/**
 * Apply house color as background tint to person card
 * Returns inline style object ready to use in React
 * 
 * @param {string} houseId - House ID (not used currently, for future expansion)
 * @param {number} houseIndex - House color index
 * @param {number} opacity - Opacity for the tint (default: 0.15)
 * @returns {Object} Style object with backgroundColor and opacity
 * 
 * @example
 * <div style={getPersonCardHouseStyle(house.id, 0)}>
 *   Person card content
 * </div>
 */
export function getPersonCardHouseStyle(houseId, houseIndex, opacity = 0.15) {
  const color = getHouseColor(houseIndex);
  return {
    backgroundColor: color,
    opacity: opacity
  };
}

/**
 * Check if current theme is dark
 * Useful for conditional styling
 * 
 * @returns {boolean} True if dark theme is active
 * 
 * @example
 * const shadowIntensity = isDarkTheme() ? 0.5 : 0.2;
 */
export function isDarkTheme() {
  const bgColor = getThemeColor('--bg-primary');
  // Convert to RGB and check luminance
  // Dark themes have low luminance values
  
  // Simple heuristic: if background starts with # and first digit is low, it's dark
  if (bgColor.startsWith('#')) {
    const firstDigit = parseInt(bgColor.charAt(1), 16);
    return firstDigit < 8; // 0-7 = dark, 8-F = light
  }
  
  return true; // Default to dark if can't determine
}

/**
 * Get appropriate text color for a given background
 * Ensures good contrast
 * 
 * @param {string} backgroundColor - Background color (hex, rgb, etc.)
 * @returns {string} Either --text-primary or --text-inverse
 * 
 * @example
 * const textColor = getContrastingTextColor('#1a1410');
 */
export function getContrastingTextColor(backgroundColor) {
  // For now, use theme detection
  // In future, could calculate luminance of specific backgroundColor
  return isDarkTheme() ? getThemeColor('--text-primary') : getThemeColor('--text-inverse');
}

/**
 * Get shadow intensity based on current theme
 * Dark themes need stronger shadows, light themes need softer ones
 * 
 * @returns {number} Shadow opacity (0-1)
 * 
 * @example
 * const shadow = `0 4px 8px rgba(0, 0, 0, ${getShadowIntensity()})`;
 */
export function getShadowIntensity() {
  return isDarkTheme() ? 0.5 : 0.2;
}

/**
 * Get all 16 house colors at once
 * Useful for creating legends or color pickers
 * 
 * @returns {Array<string>} Array of 16 hex color codes
 * 
 * @example
 * const allColors = getAllHouseColors();
 * allColors.forEach((color, i) => {
 *   console.log(`House ${i}: ${color}`);
 * });
 */
export function getAllHouseColors() {
  return Array.from({ length: 16 }, (_, i) => getHouseColor(i));
}
