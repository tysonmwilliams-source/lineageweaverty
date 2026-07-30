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

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } })
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
    expect(options).toEqual({ datasetId: 'test-world', userId: 'user-1' });
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

describe('CompositionMigrationPanel — applying (decision C3, step 3)', () => {
  const pending = { ...emptyReport, total: 33, migrated: 33 };

  async function dryRunFirst() {
    mockMigrate.mockResolvedValue(pending);
    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));
    await waitFor(() => expect(screen.getByText(/nothing was written/i)).toBeInTheDocument());
  }

  it('offers no way to apply before a dry run has been read', () => {
    render(<CompositionMigrationPanel />);
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('offers no way to apply when nothing would change', async () => {
    mockMigrate.mockResolvedValue({ ...emptyReport, total: 33, alreadyCurrent: 33 });
    render(<CompositionMigrationPanel />);
    await userEvent.click(screen.getByRole('button', { name: /run dry run/i }));

    await waitFor(() => expect(screen.getByText(/nothing to migrate/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument();
  });

  it('does not write on the first click — it asks first', async () => {
    await dryRunFirst();
    mockMigrate.mockClear();

    await userEvent.click(screen.getByRole('button', { name: /apply migration/i }));

    // This is the only control in the app that rewrites saved coats of arms.
    // One click next to "Run dry run" is too easy to hit by accident.
    expect(mockMigrate).not.toHaveBeenCalled();
    expect(screen.getByText(/rewrite 33 saved record\(s\)\?/i)).toBeInTheDocument();
  });

  it('writes only after the confirmation', async () => {
    await dryRunFirst();
    mockMigrate.mockClear();
    mockMigrate.mockResolvedValue({ ...pending, apply: true });

    await userEvent.click(screen.getByRole('button', { name: /apply migration/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, apply/i }));

    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1));
    // userId must be present, or updateHeraldry writes locally without syncing
    // and the next cloud download reverts the migration.
    expect(mockMigrate.mock.calls[0][0]).toEqual({
      datasetId: 'test-world',
      userId: 'user-1',
      apply: true
    });
  });

  it('backs out cleanly on cancel', async () => {
    await dryRunFirst();
    mockMigrate.mockClear();

    await userEvent.click(screen.getByRole('button', { name: /apply migration/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockMigrate).not.toHaveBeenCalled();
    expect(screen.queryByText(/rewrite 33 saved record\(s\)\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply migration/i })).toBeInTheDocument();
  });

  it('reports that records were written, and stops offering to apply again', async () => {
    await dryRunFirst();
    mockMigrate.mockResolvedValue({ ...pending, apply: true });

    await userEvent.click(screen.getByRole('button', { name: /apply migration/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, apply/i }));

    await waitFor(() => expect(screen.getByText(/33 record\(s\) rewritten/i)).toBeInTheDocument());
    // Claiming "nothing was written" after writing is the dangerous direction.
    expect(screen.queryByText(/^nothing was written\.$/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply migration/i })).not.toBeInTheDocument();
  });

  it('surfaces a failed apply instead of claiming success', async () => {
    await dryRunFirst();
    mockMigrate.mockRejectedValue(new Error('write failed mid-run'));

    await userEvent.click(screen.getByRole('button', { name: /apply migration/i }));
    await userEvent.click(screen.getByRole('button', { name: /yes, apply/i }));

    await waitFor(() => expect(screen.getByText(/write failed mid-run/i)).toBeInTheDocument());
    expect(screen.queryByText(/rewritten/i)).not.toBeInTheDocument();
  });
});
