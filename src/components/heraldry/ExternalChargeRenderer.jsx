import { useState, useEffect, useMemo, useCallback } from 'react';
import { sanitizeSVG } from '../../utils/sanitize';
// Support both old external library and new unified library for backwards compatibility
import { getChargeUrl, getCharge } from '../../data/unifiedChargesLibrary';
import { logger } from '../../utils/logger';
import Icon from '../icons';

// Backwards compatibility helpers - try unified library first, fall back to external
function getExternalChargeUrl(chargeId) {
  return getChargeUrl(chargeId);
}

function getExternalCharge(chargeId) {
  return getCharge(chargeId);
}

/**
 * ExternalChargeRenderer
 * 
 * Renders external SVG charges with dynamic tincture coloring.
 * 
 * The external SVGs from Traceable Heraldic Art have:
 * - Black strokes (stroke="black")
 * - White fills (fill="#FFFFFF")
 * - Some black fills for outlines/shadows (fill="black")
 * 
 * This component:
 * 1. Fetches the SVG content
 * 2. Replaces white fills with the selected tincture color
 * 3. Keeps black strokes/fills for definition
 * 4. Returns inline SVG for use in heraldry designs
 * 
 * @param {string} chargeId - ID from externalChargesLibrary
 * @param {string} tincture - Hex color to apply (e.g., "#FFD700" for Or)
 * @param {number} size - Display size in pixels (default: 100)
 * @param {string} className - Additional CSS classes
 * @param {boolean} showOutline - Whether to show black outline (default: true)
 * @param {function} onLoad - Callback when SVG is loaded
 * @param {function} onError - Callback on load error
 */
function ExternalChargeRenderer({
  chargeId,
  tincture = '#FFD700',
  size = 100,
  className = '',
  showOutline = true,
  onLoad,
  onError
}) {
  const [svgContent, setSvgContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewBox, setViewBox] = useState('0 0 100 100');
  
  // Get the URL for this charge
  const chargeUrl = useMemo(() => getExternalChargeUrl(chargeId), [chargeId]);
  const chargeData = useMemo(() => getExternalCharge(chargeId), [chargeId]);
  
  // Fetch and process the SVG
  useEffect(() => {
    if (!chargeUrl) {
      setError('Unknown charge ID');
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    
    async function fetchSVG() {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(chargeUrl);
        if (!response.ok) {
          throw new Error(`Failed to load SVG: ${response.status}`);
        }
        
        const text = await response.text();
        
        if (cancelled) return;
        
        // Parse the SVG to extract viewBox
        const viewBoxMatch = text.match(/viewBox="([^"]+)"/);
        if (viewBoxMatch) {
          setViewBox(viewBoxMatch[1]);
        }
        
        // Extract just the content inside <svg>...</svg>
        const svgMatch = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (svgMatch) {
          setSvgContent(svgMatch[1]);
        } else {
          throw new Error('Invalid SVG format');
        }
        
        setLoading(false);
        onLoad?.();
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
        onError?.(err);
      }
    }
    
    fetchSVG();
    
    return () => {
      cancelled = true;
    };
  }, [chargeUrl, onLoad, onError]);
  
  // Normalize the viewBox to start at 0,0 for consistent rendering
  // This ensures the charge content is properly positioned within the SVG element
  const normalizedViewBox = useMemo(() => {
    const parts = viewBox.split(' ').map(Number);
    if (parts.length !== 4) return '0 0 100 100';
    
    const [minX, minY, width, height] = parts;
    // Return a viewBox that starts at 0,0 with the same dimensions
    return `0 0 ${width} ${height}`;
  }, [viewBox]);
  
  // Calculate the transform needed to shift content to 0,0 origin
  const contentTransform = useMemo(() => {
    const parts = viewBox.split(' ').map(Number);
    if (parts.length !== 4) return '';
    
    const [minX, minY] = parts;
    if (minX === 0 && minY === 0) return '';
    
    return `translate(${-minX}, ${-minY})`;
  }, [viewBox]);
  
  // Process SVG content to apply tincture AND wrap with transform if needed
  const processedContent = useMemo(() => {
    if (!svgContent) return null;
    
    let processed = svgContent;
    
    // Replace white fills with the tincture color
    processed = processed.replace(
      /fill="#FFFFFF"|fill="#ffffff"|fill="white"/gi,
      `fill="${tincture}"`
    );
    
    // Optionally hide or modify black strokes
    if (!showOutline) {
      processed = processed.replace(
        /stroke="black"/gi,
        `stroke="${tincture}"`
      );
    }
    
    // Remove clip-path references that would clip the transformed content
    // The clipPaths are defined at the original coordinates and don't move with transforms
    processed = processed.replace(/clip-path="url\(#[^"]+\)"/gi, '');
    
    // Wrap content in a group with transform if viewBox doesn't start at 0,0
    if (contentTransform) {
      processed = `<g transform="${contentTransform}">${processed}</g>`;
    }
    
    return processed;
  }, [svgContent, tincture, showOutline, contentTransform]);
  
  // Calculate dimensions while preserving aspect ratio
  // The SVG will fill the size box while maintaining proportions
  const dimensions = useMemo(() => {
    const parts = viewBox.split(' ').map(Number);
    if (parts.length !== 4) return { width: size, height: size };
    
    const [minX, minY, width, height] = parts;
    
    // Both dimensions are set to size - the viewBox and preserveAspectRatio
    // will handle proper scaling within the square container
    return { width: size, height: size };
  }, [viewBox, size]);
  
  if (loading) {
    return (
      <div 
        className={`external-charge-loading ${className}`}
        style={{ 
          width: size, 
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(139, 115, 85, 0.1)',
          borderRadius: '4px'
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#8b7355' }}>...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div 
        className={`external-charge-error ${className}`}
        style={{ 
          width: size, 
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(220, 20, 60, 0.1)',
          borderRadius: '4px',
          color: '#dc143c',
          fontSize: '0.75rem'
        }}
        title={error}
      >
        <Icon name="alert-triangle" size={12} />
      </div>
    );
  }
  
  return (
    <svg
      viewBox={normalizedViewBox}
      width={dimensions.width}
      height={dimensions.height}
      preserveAspectRatio="xMidYMid meet"
      className={`external-charge ${className}`}
      style={{
        display: 'block'
      }}
      dangerouslySetInnerHTML={{ __html: sanitizeSVG(processedContent) }}
    />
  );
}

/**
 * ExternalChargePreview
 * 
 * A simpler preview component for use in selection grids.
 * Shows the charge in a small thumbnail with hover effects.
 */
export function ExternalChargePreview({
  chargeId,
  tincture = '#000000',
  size = 60,
  selected = false,
  onClick,
  showName = false
}) {
  const chargeData = getExternalCharge(chargeId);
  
  if (!chargeData) return null;
  
  return (
    <button
      type="button"
      className={`external-charge-preview ${selected ? 'selected' : ''}`}
      onClick={() => onClick?.(chargeId)}
      title={chargeData.description}
      style={{
        padding: '8px',
        border: selected ? '2px solid #8b5e3c' : '1px solid rgba(139, 115, 85, 0.3)',
        borderRadius: '4px',
        background: selected ? 'rgba(139, 94, 60, 0.15)' : 'rgba(245, 235, 220, 0.5)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.2s ease'
      }}
    >
      <ExternalChargeRenderer
        chargeId={chargeId}
        tincture={tincture}
        size={size}
        showOutline={true}
      />
      {showName && (
        <span style={{ 
          fontSize: '0.65rem', 
          color: '#5c4a3a',
          textAlign: 'center',
          lineHeight: 1.2,
          maxWidth: size + 16
        }}>
          {chargeData.name}
        </span>
      )}
    </button>
  );
}

/**
 * Generate SVG string for an external charge
 * Used when compositing the final heraldry design
 * 
 * PRE-COMPENSATES for shield non-uniform scaling:
 * Shields are typically taller than wide (~1.3:1 ratio)
 * The shield mask applies scale(scaleX, scaleY) where scaleY > scaleX
 * To prevent vertical stretching, we pre-compress the charge vertically
 * 
 * @param {string} chargeId - The charge ID
 * @param {string} tincture - Hex color
 * @param {number} x - X position in target viewBox
 * @param {number} y - Y position in target viewBox  
 * @param {number} scale - Scale factor
 * @param {number} aspectCorrection - Ratio to correct for shield aspect (default ~0.76 for typical shields)
 * @returns {Promise<string>} SVG group element string
 */
export async function generateExternalChargeSVGAsync(chargeId, tincture, x, y, scale = 0.5, aspectCorrection = 0.76) {
  const chargeUrl = getExternalChargeUrl(chargeId);
  if (!chargeUrl) return '';
  
  try {
    const response = await fetch(chargeUrl);
    if (!response.ok) throw new Error('Failed to fetch');
    
    const text = await response.text();
    
    // Extract viewBox
    const viewBoxMatch = text.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 100 100';
    const [minX, minY, width, height] = viewBox.split(' ').map(Number);
    
    // Extract content
    const svgMatch = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    if (!svgMatch) return '';
    
    let content = svgMatch[1];
    
    // Apply tincture
    content = content.replace(
      /fill="#FFFFFF"|fill="#ffffff"|fill="white"/gi,
      `fill="${tincture}"`
    );
    
    // Remove clip-path references that would clip the transformed content
    content = content.replace(/clip-path="url\(#[^"]+\)"/gi, '');
    
    // Calculate positioning to preserve aspect ratio
    const maxDim = Math.max(width, height);
    const targetSize = 80 * scale; // Base size in the 200x200 shield viewBox
    const chargeScale = targetSize / maxDim;
    
    // Calculate the actual rendered dimensions after scaling
    const scaledWidth = width * chargeScale;
    const scaledHeight = height * chargeScale;
    
    // Calculate offset to center the charge at (x, y)
    // Apply aspect correction to Y position to account for shield stretching
    const offsetX = x - scaledWidth / 2;
    const offsetY = y - (scaledHeight * aspectCorrection) / 2;
    
    // Return a transformed group with aspect correction
    // The aspectCorrection compresses the charge vertically so that when
    // the shield's non-uniform scaling is applied, it looks correct
    return `
      <g transform="translate(${offsetX}, ${offsetY}) scale(${chargeScale}, ${chargeScale * aspectCorrection})">
        <g transform="translate(${-minX}, ${-minY})">
          ${content}
        </g>
      </g>
    `;
  } catch (err) {
    logger.error('Error generating external charge SVG:', err);
    return '';
  }
}

/**
 * Pre-fetch and cache an external charge for faster rendering
 * Returns a function that generates the SVG synchronously
 */
export function useExternalChargeSVG(chargeId) {
  const [svgData, setSvgData] = useState(null);
  
  useEffect(() => {
    const chargeUrl = getExternalChargeUrl(chargeId);
    if (!chargeUrl) return;
    
    fetch(chargeUrl)
      .then(res => res.text())
      .then(text => {
        const viewBoxMatch = text.match(/viewBox="([^"]+)"/);
        const svgMatch = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        
        if (viewBoxMatch && svgMatch) {
          setSvgData({
            viewBox: viewBoxMatch[1],
            content: svgMatch[1]
          });
        }
      })
      .catch(console.error);
  }, [chargeId]);
  
  const generateSVG = useCallback((tincture, x, y, scale = 0.5, aspectCorrection = 0.76) => {
    if (!svgData) return '';
    
    const [minX, minY, width, height] = svgData.viewBox.split(' ').map(Number);
    let content = svgData.content;
    
    // Apply tincture
    content = content.replace(
      /fill="#FFFFFF"|fill="#ffffff"|fill="white"/gi,
      `fill="${tincture}"`
    );
    
    // Remove clip-path references that would clip the transformed content
    content = content.replace(/clip-path="url\(#[^"]+\)"/gi, '');
    
    // Calculate positioning to preserve aspect ratio
    const maxDim = Math.max(width, height);
    const targetSize = 80 * scale;
    const chargeScale = targetSize / maxDim;
    
    // Calculate the actual rendered dimensions after scaling
    const scaledWidth = width * chargeScale;
    const scaledHeight = height * chargeScale;
    
    // Calculate offset to center the charge at (x, y)
    // Apply aspect correction to Y position to account for shield stretching
    const offsetX = x - scaledWidth / 2;
    const offsetY = y - (scaledHeight * aspectCorrection) / 2;
    
    // Return with aspect correction to compensate for shield scaling
    return `
      <g transform="translate(${offsetX}, ${offsetY}) scale(${chargeScale}, ${chargeScale * aspectCorrection})">
        <g transform="translate(${-minX}, ${-minY})">
          ${content}
        </g>
      </g>
    `;
  }, [svgData]);
  
  return { ready: !!svgData, generateSVG };
}

export default ExternalChargeRenderer;
