/**
 * Guards the Icon name map.
 *
 * Icon returns null for an unmapped name and only warns in DEV, so a typo or a
 * name added to a component but not to the map is invisible in production. 47
 * call sites were in exactly that state. This test fails if that recurs.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import Icon from '../components/icons/Icon';

const SRC = path.resolve(__dirname, '..');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx$/.test(e.name)) out.push(p);
  }
  return out;
}

// Every literal name used in JSX across the app.
const usedNames = new Set();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/<Icon\s+name="([a-z0-9-]+)"/g)) usedNames.add(m[1]);
}

// Names that reach <Icon> from a data map rather than from JSX.
//
// This scan was missing, and three names were missing with it: `briefcase`,
// `medal` and `heart-handshake` are read from data/dignityEducation.js and
// passed to <Icon name={...}>, so the literal scan above could never see them
// and all three rendered nothing. A dynamic name is exactly as invisible as a
// mistyped literal one, and rather more likely to survive.
const dataMapFiles = [
  path.join(SRC, 'data', 'dignityEducation.js'),
  path.join(SRC, 'services', 'dignityService.js')
];
for (const file of dataMapFiles) {
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bicon(?:Name)?:\s*'([a-z0-9-]+)'/g)) usedNames.add(m[1]);
}

describe('Icon name map', () => {
  it('finds icon usages to check', () => {
    expect(usedNames.size).toBeGreaterThan(50);
  });

  it.each([...usedNames].sort())('renders "%s" as an svg, not null', (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = container.querySelector('svg');
    expect(svg, `Icon name="${name}" rendered nothing — add it to LUCIDE_ICONS in Icon.jsx`).not.toBeNull();
  });
});
