/**
 * Shield SVG Processor
 * 
 * Loads and processes professional shield SVG files from /public/shields/
 * Properly scales and positions heraldic content to fit shield bounds
 * Supports infinite zoom quality through vector graphics
 * 
 * NOTE: As of Phase 4, only the default (French) shield shape is used.
 * Other shapes are preserved in code for potential future re-addition.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SHIELD CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// The default shield shape used throughout the application
// This is the French shield (embowed/arched style)
import { logger } from './logger';

export const DEFAULT_SHIELD_TYPE = 'default';

// Shield SVG file paths (in /public/shields/)
// NOTE: 'default' maps to the french.svg file
const SHIELD_FILES = {
  default: '/shields/french.svg',  // Primary shield - always used
  
  // 🪝 FUTURE EXPANSION: Other shield shapes preserved for potential re-addition
  // These are not currently exposed in the UI but remain available in code
  // heater: '/shields/heater.svg',    // Classic medieval (c.1245)
  // english: '/shields/english.svg',  // Late medieval (c.1403)
  // spanish: '/shields/spanish.svg',  // Engrailed notched
  // swiss: '/shields/swiss.svg'       // Engrailed peaked
};

// Legacy mapping - allows old code using 'french' to still work
const LEGACY_SHIELD_MAPPING = {
  french: 'default',
  heater: 'default',   // Fallback to default
  english: 'default',  // Fallback to default
  spanish: 'default',  // Fallback to default
  swiss: 'default'     // Fallback to default
};

// Cache loaded SVGs to avoid repeated fetches
const svgCache = {};

/**
 * Resolve shield type to actual type
 * Handles legacy names and defaults
 * 
 * @param {string} shieldType - The requested shield type
 * @returns {string} The resolved shield type
 */
function resolveShieldType(shieldType) {
  // If no type specified, use default
  if (!shieldType) return DEFAULT_SHIELD_TYPE;
  
  // Check if it's a legacy name that needs mapping
  if (LEGACY_SHIELD_MAPPING[shieldType]) {
    return LEGACY_SHIELD_MAPPING[shieldType];
  }
  
  // Check if the type exists in SHIELD_FILES
  if (SHIELD_FILES[shieldType]) {
    return shieldType;
  }
  
  // Fallback to default
  logger.warn(`Unknown shield type "${shieldType}", using default`);
  return DEFAULT_SHIELD_TYPE;
}

/**
 * Load shield SVG file and extract path data + bounds
 * 
 * @param {string} shieldType - Shield type (defaults to 'default')
 * @returns {Promise<Object>} Shield data with pathData, bounds, and full SVG
 */
export async function loadShieldSVG(shieldType) {
  // Resolve to actual type
  const resolvedType = resolveShieldType(shieldType);
  
  // Return cached version if available
  if (svgCache[resolvedType]) {
    return svgCache[resolvedType];
  }
  
  try {
    const filePath = SHIELD_FILES[resolvedType];
    if (!filePath) {
      throw new Error(`No file path defined for shield type: ${resolvedType}`);
    }
    
    const response = await fetch(filePath);
    
    if (!response.ok) {
      throw new Error(`Failed to load ${resolvedType} shield: ${response.statusText}`);
    }
    
    const svgText = await response.text();
    
    // Parse SVG to extract path data
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    
    // Get the main path element (the shield outline)
    const pathElements = svgDoc.querySelectorAll('path');
    
    // Find the path with actual fill (not clipPath)
    let mainPath = null;
    for (const path of pathElements) {
      const fill = path.getAttribute('fill');
      const stroke = path.getAttribute('stroke');
      const parent = path.parentElement;
      
      // Skip paths inside clipPath or defs
      if (parent.tagName === 'clipPath' || parent.tagName === 'defs') {
        continue;
      }
      
      // Found the main shield path if it has:
      // - A fill that's not 'none' OR
      // - A stroke (for shields that are outline-only)
      if ((fill && fill !== 'none') || stroke) {
        mainPath = path;
        break;
      }
    }
    
    if (!mainPath) {
      throw new Error(`Could not find main path in ${resolvedType} shield SVG`);
    }
    
    const pathData = mainPath.getAttribute('d');
    const svgElement = svgDoc.querySelector('svg');
    const viewBox = svgElement.getAttribute('viewBox');
    
    // Parse viewBox to get bounds
    const [vbX, vbY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);
    
    // Get actual shield path bounds (for precise fitting)
    const bounds = getPathBounds(mainPath);
    
    // Cache the result
    svgCache[resolvedType] = {
      svgText: svgText,
      pathData: pathData,
      viewBox: viewBox,
      viewBoxParsed: { x: vbX, y: vbY, width: vbWidth, height: vbHeight },
      bounds: bounds,
      originalSVG: svgElement.outerHTML
    };
    
    return svgCache[resolvedType];
    
  } catch (error) {
    logger.error(`Error loading shield SVG (${resolvedType}):`, error);
    throw error;
  }
}

/**
 * Get bounding box of SVG path
 * Uses the browser's SVGPathElement.getBBox() if available
 * 
 * @param {SVGPathElement} pathElement - The path element
 * @returns {Object} Bounds with x, y, width, height
 */
function getPathBounds(pathElement) {
  try {
    // Create a temporary SVG to get accurate bounds
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.style.position = 'absolute';
    tempSvg.style.visibility = 'hidden';
    document.body.appendChild(tempSvg);
    
    const clonedPath = pathElement.cloneNode(true);
    tempSvg.appendChild(clonedPath);
    
    const bbox = clonedPath.getBBox();
    
    document.body.removeChild(tempSvg);
    
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    };
  } catch (error) {
    logger.error('Error getting path bounds:', error);
    // Fallback: parse from viewBox
    return null;
  }
}

/**
 * Create SVG heraldry with shield mask applied
 * Properly scales heraldic content to fit shield bounds
 * Note: Uses non-uniform scaling to fill shield. Charges should pre-compensate.
 * 
 * @param {string} sourceImageSVG - SVG content to be masked (should have viewBox="0 0 200 200")
 * @param {string} shieldType - Shield shape to use as mask (defaults to 'default')
 * @param {number} size - Output size (default 400)
 * @returns {Promise<string>} Complete SVG with shield mask applied and properly scaled
 */
export async function createSVGHeraldryWithMask(sourceImageSVG, shieldType, size = 400) {
  // Always resolve to actual type (handles legacy names)
  const resolvedType = resolveShieldType(shieldType);
  const shield = await loadShieldSVG(resolvedType);
  
  // Parse source SVG to extract content
  const parser = new DOMParser();
  const sourceDoc = parser.parseFromString(sourceImageSVG, 'image/svg+xml');
  const sourceRoot = sourceDoc.documentElement;
  
  // Get source viewBox (should be "0 0 200 200" from our generators)
  const sourceViewBox = sourceRoot.getAttribute('viewBox') || '0 0 200 200';
  const [srcX, srcY, srcWidth, srcHeight] = sourceViewBox.split(' ').map(Number);
  
  // Use shield bounds for precise fitting
  const targetBounds = shield.bounds || shield.viewBoxParsed;
  
  // Calculate transform to scale source content to fit shield bounds
  // This uses non-uniform scaling to fill the shield shape
  const scaleX = targetBounds.width / srcWidth;
  const scaleY = targetBounds.height / srcHeight;
  const translateX = targetBounds.x - (srcX * scaleX);
  const translateY = targetBounds.y - (srcY * scaleY);
  
  // Extract all content from source SVG (skip the svg wrapper itself)
  let sourceContent = '';
  for (let i = 0; i < sourceRoot.children.length; i++) {
    sourceContent += sourceRoot.children[i].outerHTML;
  }
  
  // Create unique ID for this mask to avoid conflicts
  const maskId = `shield-mask-${Date.now()}`;
  
  // Create masked SVG with properly transformed content
  const maskedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="${shield.viewBox}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="max-width: 100%; max-height: 100%;">
  <defs>
    <clipPath id="${maskId}">
      <path d="${shield.pathData}" />
    </clipPath>
  </defs>
  <g clip-path="url(#${maskId})">
    <g transform="translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})">
      ${sourceContent}
    </g>
  </g>
  <path d="${shield.pathData}" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  
  logger.log(`🎯 Shield transform: translate(${translateX.toFixed(1)}, ${translateY.toFixed(1)}) scale(${scaleX.toFixed(2)}, ${scaleY.toFixed(2)})`);
  
  return maskedSVG;
}

/**
 * Get shield path data only (for canvas-based masking)
 * 
 * @param {string} shieldType - Shield type (defaults to 'default')
 * @returns {Promise<string>} SVG path data string
 */
export async function getShieldPathData(shieldType) {
  const shield = await loadShieldSVG(shieldType);
  return shield.pathData;
}

/**
 * Get shield viewBox dimensions
 * 
 * @param {string} shieldType - Shield type (defaults to 'default')
 * @returns {Promise<Object>} Object with x, y, width, height
 */
export async function getShieldViewBox(shieldType) {
  const shield = await loadShieldSVG(shieldType);
  return shield.viewBoxParsed;
}

/**
 * Preload the default shield SVG (call this on app initialization)
 * 
 * @returns {Promise<void>}
 */
export async function preloadAllShields() {
  try {
    // Only preload the default shield now
    await loadShieldSVG(DEFAULT_SHIELD_TYPE);
    logger.log('✅ Default shield SVG preloaded successfully');
  } catch (error) {
    logger.error('❌ Error preloading shield:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🪝 FUTURE EXPANSION: Enable additional shield shapes
// ═══════════════════════════════════════════════════════════════════════════════
// 
// To re-enable multiple shield shapes in the future:
// 
// 1. Update SHIELD_FILES to uncomment the other shapes:
//    const SHIELD_FILES = {
//      default: '/shields/french.svg',
//      heater: '/shields/heater.svg',
//      english: '/shields/english.svg',
//      spanish: '/shields/spanish.svg',
//      swiss: '/shields/swiss.svg'
//    };
//
// 2. Update LEGACY_SHIELD_MAPPING to map to proper types instead of 'default'
//
// 3. Re-enable the Shield Shape section in HeraldryCreator.jsx
//
// 4. Update any components that hardcode 'default' or 'french'
//
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  loadShieldSVG,
  createSVGHeraldryWithMask,
  getShieldPathData,
  getShieldViewBox,
  preloadAllShields,
  DEFAULT_SHIELD_TYPE
};
