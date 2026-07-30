/**
 * Export a coat of arms to a file.
 *
 * The Armory could compose arms but never let you get one out of the browser —
 * a design tool that can't export isn't finished. (The audit described a dead
 * `downloadHeraldry()` that already existed; it does not, so this is new.)
 *
 * SVG is the primary format: the shields are vector all the way through, so an
 * SVG download is lossless and prints at any size. PNG is offered because most
 * places you'd actually paste a sigil — a manuscript document, a wiki, a chat —
 * want a raster.
 */

import { downloadFile } from '../services/exportService';
import { convertSVGtoPNG } from './armoriaIntegration';

/**
 * Turn a heraldry name into a safe, readable filename stem.
 * "Arms of House Wilfrey of Riverhead" -> "arms-of-house-wilfrey-of-riverhead"
 */
export function heraldryFilenameStem(name) {
  const stem = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return stem || 'coat-of-arms';
}

/**
 * Download the arms as an SVG file.
 *
 * @param {string} svg - The composed SVG markup
 * @param {string} name - Heraldry name, used for the filename
 */
export function downloadHeraldrySVG(svg, name) {
  if (!svg) throw new Error('Nothing to export — the design has no preview yet.');

  downloadFile(svg, `${heraldryFilenameStem(name)}.svg`, 'image/svg+xml;charset=utf-8');
}

/**
 * Download the arms as a PNG.
 *
 * Reuses convertSVGtoPNG, which rasterises at 40/200/400px; `highRes` (400px)
 * is the one worth saving. It returns a base64 data URL, so it is converted to
 * a real Blob here rather than handed to an <a download> as a data: href —
 * Safari silently ignores large data URLs on download links.
 *
 * @param {string} svg - The composed SVG markup
 * @param {string} name - Heraldry name, used for the filename
 */
export async function downloadHeraldryPNG(svg, name) {
  if (!svg) throw new Error('Nothing to export — the design has no preview yet.');

  const versions = await convertSVGtoPNG(svg);
  const dataUrl = versions.highRes;

  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  downloadFile(bytes, `${heraldryFilenameStem(name)}.png`, 'image/png');
}

export default { downloadHeraldrySVG, downloadHeraldryPNG, heraldryFilenameStem };
