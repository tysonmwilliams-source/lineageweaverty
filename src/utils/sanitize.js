/**
 * sanitize.js - Content Sanitization Utilities
 *
 * PURPOSE:
 * Provides sanitization functions to prevent XSS attacks when rendering
 * user-provided content like SVG heraldry or Markdown content.
 *
 * SECURITY NOTE:
 * All content rendered via dangerouslySetInnerHTML MUST be sanitized first.
 * SVG files can contain malicious scripts that execute in the browser context.
 */

import DOMPurify from 'dompurify';

// ==================== SANITIZE CACHE ====================
//
// DOMPurify parses the whole string on every call, and sanitizeSVG is called
// directly in render bodies all over the app — the Armory gallery re-sanitised
// all 33 of its inline SVGs on every keystroke in the search box.
//
// Keys are the input strings themselves. That costs nothing extra: a given
// record hands us the same string reference each render, so the Map holds a
// reference, not a copy. The sanitized output IS new memory, so the cache is
// bounded by total output size rather than entry count — composite shields can
// run to megabytes.
const SVG_CACHE_MAX_CHARS = 8_000_000; // ~16MB of UTF-16
const svgCache = new Map();
let svgCacheChars = 0;

function cacheGet(input) {
  const hit = svgCache.get(input);
  if (hit === undefined) return undefined;
  // Refresh recency: delete + re-set moves it to the end of the Map's order.
  svgCache.delete(input);
  svgCache.set(input, hit);
  return hit;
}

function cacheSet(input, output) {
  svgCache.set(input, output);
  svgCacheChars += output.length;

  // Evict least-recently-used until back under budget.
  while (svgCacheChars > SVG_CACHE_MAX_CHARS && svgCache.size > 1) {
    const oldestKey = svgCache.keys().next().value;
    const oldest = svgCache.get(oldestKey);
    svgCache.delete(oldestKey);
    svgCacheChars -= oldest.length;
  }
}

/** Exposed for tests and for callers that mutate SVGs in place. */
export function clearSanitizeCache() {
  svgCache.clear();
  svgCacheChars = 0;
}

/**
 * Sanitize SVG content for safe rendering
 *
 * Removes potentially dangerous elements like:
 * - <script> tags
 * - Event handlers (onclick, onerror, etc.)
 * - External references that could leak data
 * - Embedded JavaScript in href/xlink:href
 *
 * @param {string} svgContent - Raw SVG string
 * @returns {string} Sanitized SVG string safe for dangerouslySetInnerHTML
 *
 * @example
 * <div dangerouslySetInnerHTML={{ __html: sanitizeSVG(heraldry.heraldrySVG) }} />
 */
export function sanitizeSVG(svgContent) {
  if (!svgContent) return '';

  const cached = cacheGet(svgContent);
  if (cached !== undefined) return cached;

  const sanitized = DOMPurify.sanitize(svgContent, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Allow common SVG elements
    ADD_TAGS: ['use', 'symbol', 'defs', 'clipPath', 'mask', 'pattern'],
    // Allow xlink:href for internal references but sanitize external ones
    ADD_ATTR: ['xlink:href', 'href', 'viewBox', 'preserveAspectRatio'],
    // Remove dangerous attributes
    FORBID_ATTR: ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus'],
    // Remove script tags and similar
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
  });

  cacheSet(svgContent, sanitized);
  return sanitized;
}

/**
 * Sanitize HTML content (e.g., rendered Markdown)
 *
 * More permissive than SVG sanitization but still removes dangerous elements.
 *
 * @param {string} htmlContent - Raw HTML string
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHTML(htmlContent) {
  if (!htmlContent) return '';

  // First pass: sanitize with DOMPurify
  let sanitized = DOMPurify.sanitize(htmlContent, {
    // Allow common HTML elements for rich text
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'strike',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr', 'div', 'span',
      'sup', 'sub', 'mark'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'id',
      'target', 'rel', 'width', 'height', 'data-entry-id'
    ],
    // Open links in new tab safely
    ADD_ATTR: ['target'],
    // Ensure links have rel="noopener"
    ALLOW_DATA_ATTR: false,
  });

  // Second pass: strip all class attributes EXCEPT our wiki-link classes
  // This removes any pasted CSS classes that could affect styling
  sanitized = sanitized.replace(/\sclass="(?!wiki-link)[^"]*"/g, '');

  return sanitized;
}

/**
 * Create a safe innerHTML object for React
 *
 * @param {string} content - Content to sanitize
 * @param {'svg' | 'html'} type - Type of content
 * @returns {{ __html: string }} Object for dangerouslySetInnerHTML
 */
export function createSafeHTML(content, type = 'html') {
  const sanitized = type === 'svg' ? sanitizeSVG(content) : sanitizeHTML(content);
  return { __html: sanitized };
}

export default {
  sanitizeSVG,
  sanitizeHTML,
  createSafeHTML
};
