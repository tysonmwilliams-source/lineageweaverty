/**
 * Theme contrast tests
 *
 * Parses every theme stylesheet and asserts that the documented foreground /
 * background token pairs clear their WCAG 2.1 threshold.
 *
 * This exists because all seven themes shipped with `--border-primary` between
 * 1.44:1 and 1.74:1 — used 470 times, and below the threshold at which a human
 * can reliably see an edge. The whole structural grid of the UI was invisible,
 * and nothing would have told you.
 *
 * Adding a theme? It is picked up automatically.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const THEME_DIR = 'src/styles/themes';

// ---------------------------------------------------------------- colour maths

function hexToRgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(hexToRgb(a)), relativeLuminance(hexToRgb(b))]
    .sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ---------------------------------------------------------------- fixtures

function parseTokens(file) {
  const src = readFileSync(join(THEME_DIR, file), 'utf8');
  const tokens = {};
  for (const m of src.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gm)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

const themeFiles = readdirSync(THEME_DIR)
  .filter(f => f.startsWith('theme-') && f.endsWith('.css') && f !== 'theme-base.css');

/**
 * [foreground, background, minimum ratio, rationale]
 *
 * 4.5:1 is WCAG AA for body text; 3:1 is AA for UI components and focus
 * indicators (SC 1.4.11).
 */
const REQUIRED_PAIRS = [
  ['--text-primary', '--bg-primary', 4.5],
  ['--text-secondary', '--bg-primary', 4.5],
  ['--text-tertiary', '--bg-primary', 4.5],
  ['--text-disabled', '--bg-primary', 3],
  ['--accent-primary', '--bg-primary', 4.5],
  ['--focus-ring', '--bg-primary', 3],
  ['--color-warning', '--bg-primary', 4.5],
  ['--color-error', '--bg-primary', 4.5],
  ['--color-success', '--bg-primary', 4.5],
  ['--color-info', '--bg-primary', 4.5],
  ['--border-primary', '--bg-primary', 3],
  ['--border-secondary', '--bg-primary', 3],
];

// ---------------------------------------------------------------- tests

describe('theme contrast', () => {
  it('finds theme files to check', () => {
    expect(themeFiles.length).toBeGreaterThan(0);
  });

  describe.each(themeFiles)('%s', (file) => {
    const tokens = parseTokens(file);

    it.each(REQUIRED_PAIRS)('%s on %s clears %s:1', (fg, bg, min) => {
      // Skip pairs a theme genuinely doesn't define rather than failing on
      // absence — the point is to catch regressions in what IS defined.
      if (!tokens[fg] || !tokens[bg]) return;

      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      expect(
        ratio,
        `${file}: ${fg} (${tokens[fg]}) on ${bg} (${tokens[bg]}) is ${ratio.toFixed(2)}:1, needs ${min}:1`
      ).toBeGreaterThanOrEqual(min);
    });

    it('defines --border-subtle for decorative rules', () => {
      // The escape hatch for genuinely decorative dividers, so nobody is
      // tempted to weaken --border-primary back below threshold.
      expect(tokens['--border-subtle']).toBeDefined();
    });
  });
});
