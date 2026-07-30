/**
 * Guards the grouped-Codex subsection header.
 *
 * `SubsectionHeader` was built with `useCallback(fn, [])` and rendered as
 * `<SubsectionHeader />` — a component whose identity comes from a hook. Empty
 * deps meant it happened to be stable, so this was never the live state-reset
 * the audit described, but nothing enforced that: one added dep, or React
 * discarding the hook cache, remounts the whole subsection.
 *
 * Recurrence is caught by `react-hooks/static-components`, which is now an
 * error in eslint.config.js. This file covers the other half — that hoisting it
 * to module scope did not change what it renders. CodexBrowse had no coverage
 * at all before this.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubsectionHeader } from './CodexBrowse';

describe('SubsectionHeader', () => {
  it('renders its label, count and named icon', () => {
    render(
      <SubsectionHeader
        label="Dignities & Titles"
        icon="crown"
        count={12}
        collapsed={false}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText('Dignities & Titles')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();

    // The chevron plus the section's own icon. Icon renders null for a name
    // missing from the map, so asserting on the count catches an unmapped name
    // here the same way icon-map.test.jsx does globally.
    const button = screen.getByRole('button');
    expect(button.querySelectorAll('svg')).toHaveLength(2);
  });

  it('reports a count of zero rather than hiding it', () => {
    render(
      <SubsectionHeader
        label="Laws"
        icon="scale"
        count={0}
        collapsed
        onToggle={() => {}}
      />
    );

    // An empty subsection still renders its header — that is what makes the
    // "No law entries yet" placeholder reachable.
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('calls onToggle when clicked', () => {
    const onToggle = vi.fn();
    render(
      <SubsectionHeader
        label="Heraldry"
        icon="shield"
        count={3}
        collapsed={false}
        onToggle={onToggle}
      />
    );

    screen.getByRole('button').click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
