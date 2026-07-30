/**
 * Armoria API Integration - FIXED VERSION
 * 
 * Generates procedural heraldry using the free Armoria API
 * IMPORTANT: Extracts only the field/charges from Armoria, removes its shield outline,
 * then applies our professional shield shapes
 * 
 * API: https://armoria.herokuapp.com
 * Docs: https://github.com/Azgaar/Armoria
 */

import { createSVGHeraldryWithMask } from './shieldSVGProcessor';
import { logger } from './logger';

/**
 * Generate heraldry via Armoria API
 * Returns SVG content WITHOUT the shield outline (just the heraldic field)
 * 
 * @param {string} houseName - House name to use for seeding
 * @param {string|null} customSeed - Optional custom seed for specific designs
 * @param {number} size - SVG size (default 400)
 * @returns {Promise<Object>} Armoria data with SVG content (no shield outline)
 */
export async function generateArmoriaHeraldry(houseName, customSeed = null, size = 400) {
  try {
    // Generate seed from house name if no custom seed provided
    const seed = customSeed || hashString(houseName);
    
    // Call Armoria API
    const response = await fetch(
      `https://armoria.herokuapp.com/api/svg?seed=${seed}&size=${size}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'image/svg+xml'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Armoria API failed: ${response.statusText}`);
    }
    
    const svgText = await response.text();
    
    logger.log('📥 Armoria API response (first 200 chars):', svgText.substring(0, 200));
    
    // Check if response is actually SVG
    if (!svgText.includes('<svg')) {
      logger.error('❌ Armoria API did not return SVG. Response:', svgText);
      throw new Error('Armoria API returned invalid response (not SVG)');
    }
    
    // Extract heraldic content WITHOUT the shield outline
    const contentOnly = extractHeraldricContent(svgText);
    
    return {
      svg: contentOnly,
      seed: seed,
      source: 'armoria',
      format: 'svg',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error('Error generating Armoria heraldry:', error);
    throw error;
  }
}

/**
 * Extract heraldic content from Armoria SVG, removing shield outline
 * Armoria returns a complete coat of arms with shield outline.
 * We want ONLY the colored field and charges, so we can apply our own shield shape.
 * 
 * @param {string} svgText - Full Armoria SVG
 * @returns {string} SVG content with just field and charges (no shield outline)
 */
function extractHeraldricContent(svgText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    
    // Check for parsing errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      logger.error('❌ XML parsing error:', parserError.textContent);
      logger.log('📑 Returning original SVG as fallback');
      return svgText;
    }
    
    const svg = doc.querySelector('svg');
    
    if (!svg) {
      logger.error('❌ No SVG element found in parsed document');
      logger.log('📑 Returning original SVG as fallback');
      return svgText;
    }
    
    // Get viewBox for proper scaling
    const viewBox = svg.getAttribute('viewBox') || '0 0 200 200';
    
    // Find all groups and paths inside the SVG
    // Armoria structure typically has:
    // - A shield outline path (we want to REMOVE this)
    // - Field/division groups (we want to KEEP these)
    // - Charge groups (we want to KEEP these)
    
    const content = [];
    
    // Get all direct children of SVG
    const children = svg.children;
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const tagName = child.tagName.toLowerCase();
      
      // Skip defs (definitions)
      if (tagName === 'defs') {
        content.push(child.outerHTML); // Keep defs for gradients, patterns
        continue;
      }
      
      // Skip the shield outline path (usually has id="shield" or similar)
      const id = child.getAttribute('id') || '';
      const classes = child.getAttribute('class') || '';
      
      if (id.includes('shield') || id.includes('outline') || 
          classes.includes('shield') || classes.includes('outline')) {
        // Skip shield outline
        logger.log('Skipping shield outline:', id || classes);
        continue;
      }
      
      // Check if it's a path with stroke but no fill (likely outline)
      if (tagName === 'path') {
        const fill = child.getAttribute('fill');
        const stroke = child.getAttribute('stroke');
        
        // If it's just a black stroke with no fill, it's probably the outline
        if ((!fill || fill === 'none') && stroke) {
          logger.log('Skipping outline path');
          continue;
        }
      }
      
      // Keep everything else (field, divisions, charges)
      content.push(child.outerHTML);
    }
    
    // Reconstruct SVG with only content (no shield outline)
    const contentSVG = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
${content.join('\n')}
</svg>`;
    
    return contentSVG;
    
  } catch (error) {
    logger.error('Error extracting heraldic content:', error);
    // If extraction fails, return original
    logger.log('📑 Returning original SVG as fallback');
    return svgText;
  }
}

/**
 * Simple string hash function for reproducible seed generation
 * Same input always produces same output
 * 
 * @param {string} str - String to hash
 * @returns {string} Hash as string
 */
function hashString(str) {
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString();
}

/**
 * Complete flow: Generate Armoria heraldry → Apply shield mask → Convert to PNG fallbacks
 * 
 * @param {Object} house - House object with houseName and heraldryShieldType
 * @param {string|null} customSeed - Optional custom seed
 * @returns {Promise<Object>} Complete heraldry package ready to save
 */
export async function createArmoriaHeraldryForHouse(house, customSeed = null) {
  try {
    // Step 1: Generate base heraldry from Armoria (content only, no shield outline)
    logger.log(`🛡️ Generating Armoria heraldry for ${house.houseName}...`);
    const armoria = await generateArmoriaHeraldry(house.houseName, customSeed);
    
    // Step 2: Apply our professional shield mask to the content
    const shieldType = house.heraldryShieldType || 'heater';
    logger.log(`🛡️ Applying ${shieldType} shield mask...`);
    const maskedSVG = await createSVGHeraldryWithMask(
      armoria.svg,
      shieldType,
      400
    );
    
    // Step 3: Generate PNG versions for fallback/compatibility
    logger.log('🛡️ Converting to PNG fallbacks...');
    const pngVersions = await convertSVGtoPNG(maskedSVG);
    
    // Step 4: Return complete heraldry package
    const result = {
      // PRIMARY: SVG for infinite zoom
      heraldrySVG: maskedSVG,
      heraldrySourceSVG: armoria.svg,
      heraldryType: 'svg',
      
      // FALLBACK: PNG versions
      heraldryImageData: pngVersions.display,    // 200×200
      heraldryThumbnail: pngVersions.thumbnail,  // 40×40
      heraldryHighRes: pngVersions.highRes,      // 400×400
      
      // METADATA
      heraldrySource: 'armoria',
      heraldrySeed: armoria.seed,
      heraldryShieldType: shieldType,
      heraldryMetadata: {
        generatedAt: armoria.timestamp,
        armoriaVersion: '1.0',
        method: 'api'
      }
    };
    
    logger.log('✅ Armoria heraldry generation complete!');
    return result;
    
  } catch (error) {
    logger.error('❌ Error in Armoria heraldry creation:', error);
    throw error;
  }
}

/**
 * Convert SVG to PNG at multiple sizes
 * Used for fallback when SVG rendering isn't available
 * 
 * @param {string} svgText - SVG markup
 * @returns {Promise<Object>} Object with thumbnail, display, and highRes base64 PNGs
 */
export async function convertSVGtoPNG(svgText) {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        try {
          const versions = {
            thumbnail: renderSVGToCanvas(img, 40),
            display: renderSVGToCanvas(img, 200),
            highRes: renderSVGToCanvas(img, 400)
          };
          
          URL.revokeObjectURL(url);
          resolve(versions);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = url;
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Render SVG to canvas at specific size and return as base64 PNG
 * 
 * @param {HTMLImageElement} img - Loaded SVG image
 * @param {number} size - Output size (square)
 * @returns {string} Base64 PNG data URL
 */
function renderSVGToCanvas(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  
  const ctx = canvas.getContext('2d');
  
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  
  // Draw SVG
  ctx.drawImage(img, 0, 0, size, size);
  
  // Return as base64 PNG
  return canvas.toDataURL('image/png');
}

/**
 * Randomize seed to get different heraldry design
 * 
 * @returns {string} Random seed
 */
export function generateRandomSeed() {
  return Math.floor(Math.random() * 1000000).toString();
}

export default {
  generateArmoriaHeraldry,
  createArmoriaHeraldryForHouse,
  convertSVGtoPNG,
  generateRandomSeed
};
