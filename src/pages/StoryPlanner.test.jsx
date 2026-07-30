/**
 * Covers the planner route (decision C4).
 *
 * The planner's view and plan used to be component state in a modal, so there
 * was nothing to get wrong about a URL. Moving them into the path introduces
 * three states the modal could not reach, all of which fail silently — a blank
 * pane, not an error:
 *
 *   - a writing id that no longer exists
 *   - a `:view` segment that isn't one of the seven
 *   - the right view mounted with the wrong plan id
 *
 * The last one is the dangerous one: every planner view is a mutation surface,
 * so a view rendered against the wrong storyPlanId edits the wrong plan. That
 * is why the id is asserted here and not just the heading.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockGetWriting = vi.fn();
vi.mock('../services/writingService', () => ({
  getWriting: (...args) => mockGetWriting(...args)
}));

vi.mock('../contexts/DatasetContext', () => ({
  useDataset: () => ({ activeDataset: { id: 'test-world' } })
}));

vi.mock('../components/Navigation', () => ({
  default: () => <nav data-testid="nav" />
}));

// The seven planner surfaces are heavy (Dexie, auth, framer-motion) and are not
// what this file is testing. Each stub reports the props the route handed it,
// which is exactly the contract that can silently break.
vi.mock('../components/writing/Planner', () => {
  const stub = (name) => ({ storyPlanId, writingId, datasetId }) => (
    <div
      data-testid={name}
      data-story-plan-id={String(storyPlanId)}
      data-writing-id={String(writingId)}
      data-dataset-id={String(datasetId)}
    />
  );
  return {
    StoryPlannerDashboard: stub('dashboard'),
    OutlineView: stub('outline'),
    TimelineView: stub('timeline'),
    BeatSheetView: stub('beats'),
    CharacterArcsView: stub('characters'),
    PlotThreadsView: stub('threads'),
    StoryArcsView: stub('arcs')
  };
});

const { default: StoryPlanner } = await import('./StoryPlanner');

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/writing/:id/plan" element={<StoryPlanner />} />
        <Route path="/writing/:id/plan/:planId/:view" element={<StoryPlanner />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockGetWriting.mockReset();
  mockGetWriting.mockResolvedValue({ id: 7, title: 'The Wilfrey Succession' });
});

describe('StoryPlanner route', () => {
  it('renders the dashboard at /writing/:id/plan', async () => {
    renderAt('/writing/7/plan');

    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());
    expect(screen.getByText('Story Planner')).toBeInTheDocument();
    expect(screen.getByText('The Wilfrey Succession')).toBeInTheDocument();
  });

  it('loads the writing scoped to the active dataset', async () => {
    renderAt('/writing/7/plan');

    // A planner reading the default database from a non-default world is the
    // phantom-database bug this codebase has hit repeatedly.
    await waitFor(() => expect(mockGetWriting).toHaveBeenCalledWith(7, 'test-world'));
  });

  it.each([
    ['outline', 'Story Outline'],
    ['beats', 'Beat Sheet'],
    ['timeline', 'Timeline'],
    ['characters', 'Character Arcs'],
    ['threads', 'Plot Threads'],
    ['arcs', 'Story Arcs']
  ])('mounts the %s view with the plan id from the URL', async (view, heading) => {
    renderAt(`/writing/7/plan/42/${view}`);

    await waitFor(() => expect(screen.getByTestId(view)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();

    // Numbers, not strings — every view queries Dexie by this id.
    const mounted = screen.getByTestId(view);
    expect(mounted).toHaveAttribute('data-story-plan-id', '42');
    expect(mounted).toHaveAttribute('data-dataset-id', 'test-world');
  });

  it('explains an unknown view instead of rendering nothing', async () => {
    renderAt('/writing/7/plan/42/nonsense');

    await waitFor(() => expect(screen.getByText('Unknown Planner View')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('explains a missing writing instead of rendering nothing', async () => {
    mockGetWriting.mockResolvedValue(undefined);
    renderAt('/writing/999/plan');

    await waitFor(() => expect(screen.getByText('Writing Not Found')).toBeInTheDocument());
  });

  it('survives a failed load rather than crashing the route', async () => {
    mockGetWriting.mockRejectedValue(new Error('dexie exploded'));
    renderAt('/writing/7/plan');

    await waitFor(() => expect(screen.getByText('Writing Not Found')).toBeInTheDocument());
  });
});
