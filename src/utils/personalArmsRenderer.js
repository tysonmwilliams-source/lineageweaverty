/**
 * Personal Arms Renderer
 * 
 * Utility for rendering personal arms with cadency marks.
 * This module handles the visual composition of personal heraldry,
 * adding cadency triangles to house arms to create differenced arms.
 * 
 * CADENCY SYSTEM:
 * Lineageweaver uses a simple triangle-based cadency system:
 * - Small black triangles along the top (chief) of the shield
 * - Number of triangles = birth position among legitimate sons
 * - 1st son = 1 triangle, 2nd son = 2 triangles, etc.
 * 
 * USAGE:
 * This is used when:
 * 1. Creating new personal arms from house arms
 * 2. Rendering personal arms in the family tree
 * 3. Displaying personal arms in QuickEditPanel
 */

import { generateCadencyTriangles, generateCadencySVG } from './birthOrderUtils';
import { logger } from './logger';

/**
 * Add cadency marks to an existing heraldry SVG
 * 
 * Takes the house heraldry SVG and overlays cadency triangles.
 * The triangles are positioned at the top (chief) of the shield.
 * 
 * @param {string} baseSVG - The base heraldry SVG (house arms)
 * @param {number} birthPosition - Birth order position (1, 2, 3, etc.)
 * @param {Object} options - Optional customization
 * @returns {string} Modified SVG with cadency marks
 */
export function addCadencyToSVG(baseSVG, birthPosition, options = {}) {
  if (!baseSVG || !birthPosition || birthPosition < 1) {
    return baseSVG;
  }
  
  const {
    triangleSize = 10,
    topMargin = 12,
    fillColor = '#1a1410',      // Sable (black)
    strokeColor = '#d4c4a8',    // Light outline for visibility
    strokeWidth = 0.5
  } = options;
  
  // Parse the SVG to find its dimensions
  const viewBoxMatch = baseSVG.match(/viewBox="([^"]+)"/);
  if (!viewBoxMatch) {
    logger.warn('Could not find viewBox in base SVG, returning unchanged');
    return baseSVG;
  }
  
  const [, , width, height] = viewBoxMatch[1].split(' ').map(Number);
  
  // Generate the cadency triangles
  const triangles = generateCadencyTriangles(birthPosition, width, {
    triangleSize,
    topMargin,
    fillColor,
    strokeColor,
    strokeWidth
  });
  
  if (triangles.length === 0) {
    return baseSVG;
  }
  
  // Create the triangle paths SVG content
  const trianglePaths = triangles.map(t => 
    `<path d="${t.path}" fill="${t.fillColor}" stroke="${t.strokeColor}" stroke-width="${t.strokeWidth}" class="cadency-mark"/>`
  ).join('\n    ');
  
  // Create a group for the cadency marks
  const cadencyGroup = `
  <g class="cadency-marks" data-birth-position="${birthPosition}">
    ${trianglePaths}
  </g>`;
  
  // Insert the cadency group before the closing </svg> tag
  // but after the shield outline (so triangles appear on top)
  const modifiedSVG = baseSVG.replace(
    /<\/svg>\s*$/,
    `${cadencyGroup}\n</svg>`
  );
  
  return modifiedSVG;
}

/**
 * Create a complete personal arms SVG from house heraldry
 * 
 * This is the main function for generating personal arms visuals.
 * It takes house heraldry and creates a new SVG with cadency marks.
 * 
 * @param {Object} houseHeraldry - The house heraldry record
 * @param {number} birthPosition - Birth order position
 * @param {Object} options - Optional customization
 * @returns {Object} Object with SVG and metadata
 */
export function createPersonalArmsSVG(houseHeraldry, birthPosition, options = {}) {
  if (!houseHeraldry) {
    return {
      success: false,
      error: 'No house heraldry provided',
      svg: null
    };
  }
  
  // Get the base SVG - prefer heraldrySVG, fall back to heraldrySourceSVG
  const baseSVG = houseHeraldry.heraldrySVG || houseHeraldry.heraldrySourceSVG;
  
  if (!baseSVG) {
    return {
      success: false,
      error: 'House heraldry has no SVG data',
      svg: null
    };
  }
  
  // Add cadency marks
  const personalArmsSVG = addCadencyToSVG(baseSVG, birthPosition, options);
  
  return {
    success: true,
    svg: personalArmsSVG,
    birthPosition,
    parentHeraldryId: houseHeraldry.id,
    composition: {
      base: houseHeraldry.composition,
      cadency: {
        type: 'triangles',
        count: birthPosition,
        position: 'chief',
        tincture: 'sable'
      }
    }
  };
}

/**
 * Generate a standalone cadency overlay SVG
 * 
 * Creates an SVG that can be layered over existing heraldry.
 * Useful for real-time preview without modifying the base.
 * 
 * @param {number} birthPosition - Birth order position
 * @param {number} width - SVG width (should match base heraldry)
 * @param {number} height - SVG height (should match base heraldry)
 * @param {Object} options - Optional customization
 * @returns {string} Standalone SVG with just the cadency marks
 */
export function createCadencyOverlaySVG(birthPosition, width = 200, height = 240, options = {}) {
  if (!birthPosition || birthPosition < 1) {
    return '';
  }
  
  return generateCadencySVG(birthPosition, width, height, options);
}

/**
 * Check if an SVG already has cadency marks
 * 
 * Useful to avoid double-applying cadency.
 * 
 * @param {string} svg - The SVG to check
 * @returns {boolean} True if cadency marks are present
 */
export function hasCadencyMarks(svg) {
  if (!svg) return false;
  return svg.includes('class="cadency-marks"') || svg.includes('class="cadency-mark"');
}

/**
 * Remove cadency marks from an SVG
 * 
 * Useful for "resetting" personal arms back to house arms.
 * 
 * @param {string} svg - The SVG with cadency marks
 * @returns {string} SVG with cadency marks removed
 */
export function removeCadencyMarks(svg) {
  if (!svg) return svg;
  
  // Remove the entire cadency-marks group
  return svg.replace(/<g class="cadency-marks"[^>]*>[\s\S]*?<\/g>/g, '');
}

/**
 * Get the birth position from an SVG's cadency marks
 * 
 * Reads the data-birth-position attribute if present.
 * 
 * @param {string} svg - The SVG to check
 * @returns {number|null} The birth position, or null if not found
 */
export function getCadencyPositionFromSVG(svg) {
  if (!svg) return null;
  
  const match = svg.match(/data-birth-position="(\d+)"/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Fallback: count the cadency-mark paths
  const pathMatches = svg.match(/<path[^>]*class="cadency-mark"/g);
  if (pathMatches) {
    return pathMatches.length;
  }
  
  return null;
}

/**
 * Render personal arms as a React-compatible dangerouslySetInnerHTML object
 * 
 * Convenience function for React components.
 * 
 * @param {Object} houseHeraldry - The house heraldry record
 * @param {number} birthPosition - Birth order position
 * @param {Object} options - Optional customization
 * @returns {Object} Object with __html property for dangerouslySetInnerHTML
 */
export function renderPersonalArmsHTML(houseHeraldry, birthPosition, options = {}) {
  const result = createPersonalArmsSVG(houseHeraldry, birthPosition, options);
  
  if (!result.success || !result.svg) {
    return { __html: '' };
  }
  
  return { __html: result.svg };
}

/**
 * Generate blazon description for personal arms
 * 
 * Adds cadency description to the base blazon.
 * 
 * @param {string} baseBlazon - The house arms blazon
 * @param {number} birthPosition - Birth order position
 * @returns {string} Modified blazon with cadency
 */
export function generatePersonalArmsBlazon(baseBlazon, birthPosition) {
  if (!baseBlazon) return '';
  if (!birthPosition || birthPosition < 1) return baseBlazon;
  
  // In traditional heraldry, cadency marks are described
  // For our triangle system, we describe it simply
  const cadencyDescription = birthPosition === 1 
    ? 'with a label of one point sable'
    : `with ${birthPosition} labels sable in chief`;
  
  // Add cadency to the end of the blazon
  return `${baseBlazon}, ${cadencyDescription}`;
}

export default {
  addCadencyToSVG,
  createPersonalArmsSVG,
  createCadencyOverlaySVG,
  hasCadencyMarks,
  removeCadencyMarks,
  getCadencyPositionFromSVG,
  renderPersonalArmsHTML,
  generatePersonalArmsBlazon
};
