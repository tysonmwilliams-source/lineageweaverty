/**
 * Renders the dry-run panel (decision C3, step 1).
 *
 * The panel's job is to tell the owner, before anything is written, which of
 * their hand-drawn coats would visibly change. Getting that wrong in the
 * reassuring direction — showing a clean report when shields would change — is
 * the failure that matters, so that is what is asserted here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockMigrate = vi.fn();
vi.mock('../../services/heraldryCompositionMigration', () => ({
  migrateHeraldryCompositions: (...args) => mockMigrate(...args)
}));

vi.mock('../../contexts/DatasetContext', () => ({
  useDataset: () => ({ activeDataset: { id: 'test-world' } })
}));

const { default: CompositionMigrationPanel } = await import('./CompositionMigrationPanel');

const emptyReport = {
  apply: false,
  total: 0,
  migrated: 0,
  alreadyCurrent: 0,
  noComposition: 0,
  failed: 0,
  recoveredOrdinaries: [],
  withUnmigratedKeys: [],
  errors: []
};

beforeEach(() => {
  mockMigrate.mockReset();
  mockMigrate.mockResolvedValue(emptyReport);
});

describe('CompositionMigrationPanel', () => {
  it('runs a dry run scoped to the active dataset, and never applies', async () => {
    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1));

    // `apply` must be absent, not merely false — the service defaults to a dry
    // run, and this panel must never be the thing that writes.
    const [options] = mockMigrate.mock.calls[0];
    expect(options).toEqual({ datasetId: 'test-world' });
    expect(options).not.toHaveProperty('apply');
  });

  it('does not read the database until asked', () => {
    render(<CompositionMigrationPanel />);
    expect(mockMigrate).not.toHaveBeenCalled();
  });

  it('names the coats that would visibly change', async () => {
    mockMigrate.mockResolvedValue({
      ...emptyReport,
      total: 33,
      migrated: 2,
      alreadyCurrent: 30,
      noComposition: 1,
      recoveredOrdinaries: [
        { heraldryId: 4, name: 'Arms of House Wilfrey', ordinary: 'chief' },
        { heraldryId: 9, name: 'Arms of House Shadash', ordinary: 'fess' }
      ]
    });

    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/2 coat\(s\) would visibly change/i)).toBeInTheDocument());
    expect(screen.getByText('Arms of House Wilfrey')).toBeInTheDocument();
    expect(screen.getByText('Arms of House Shadash')).toBeInTheDocument();
    expect(screen.getByText('chief')).toBeInTheDocument();
  });

  it('reports records left untouched for review', async () => {
    mockMigrate.mockResolvedValue({
      ...emptyReport,
      total: 1,
      failed: 1,
      errors: [{ heraldryId: 7, name: 'Broken arms', error: 'composition is string, not an object' }]
    });

    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/left untouched for review/i)).toBeInTheDocument());
    expect(screen.getByText('Broken arms')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing to do', async () => {
    mockMigrate.mockResolvedValue({ ...emptyReport, total: 33, alreadyCurrent: 33 });

    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/nothing to migrate/i)).toBeInTheDocument());
    expect(screen.queryByText(/would visibly change/i)).not.toBeInTheDocument();
  });

  it('surfaces a failure instead of showing an empty report', async () => {
    mockMigrate.mockRejectedValue(new Error('IndexedDB unavailable'));

    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/IndexedDB unavailable/i)).toBeInTheDocument());
    // A silent empty report here would read as "your data is fine".
    expect(screen.queryByText(/nothing to migrate/i)).not.toBeInTheDocument();
  });

  it('always states that nothing was written', async () => {
    mockMigrate.mockResolvedValue({ ...emptyReport, total: 5, migrated: 5 });

    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/nothing was written/i)).toBeInTheDocument());
  });
});
