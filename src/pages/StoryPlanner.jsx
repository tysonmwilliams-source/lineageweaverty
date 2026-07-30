/**
 * StoryPlanner.jsx — the Story Planner as a page, not a modal (decision C4).
 *
 * The planner used to be StoryPlannerModal, which held `activeView` and
 * `currentPlanId` in local state and reset both to the dashboard every time it
 * closed. Nothing about a planning session was addressable: you could not
 * bookmark a beat sheet, a refresh dropped you back to the writing list, and
 * the browser's back button left the app entirely. The only way "back" was the
 * Escape key.
 *
 * Both of those pieces of state are now the URL:
 *
 *   /writing/:id/plan                    the dashboard for a writing
 *   /writing/:id/plan/:planId/:view      one view of one plan
 *
 * which makes them shareable, refresh-safe and navigable with the back button
 * for free, because the router is now the thing remembering them.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWriting } from '../services/writingService';
import { useDataset } from '../contexts/DatasetContext';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import EmptyState from '../components/shared/EmptyState';
import {
  StoryPlannerDashboard,
  OutlineView,
  TimelineView,
  BeatSheetView,
  CharacterArcsView,
  PlotThreadsView,
  StoryArcsView
} from '../components/writing/Planner';
import { logger } from '../utils/logger';
import './StoryPlanner.css';

// The seven planner surfaces, keyed by the `:view` URL segment.
//
// This map is also the route's validation: a `:view` that isn't a key here is a
// bad URL, which is a state the modal could never reach and so never handled.
const VIEWS = {
  outline: { title: 'Story Outline', Component: OutlineView },
  beats: { title: 'Beat Sheet', Component: BeatSheetView },
  timeline: { title: 'Timeline', Component: TimelineView },
  characters: { title: 'Character Arcs', Component: CharacterArcsView },
  threads: { title: 'Plot Threads', Component: PlotThreadsView },
  arcs: { title: 'Story Arcs', Component: StoryArcsView }
};

function StoryPlanner() {
  const { id, planId, view } = useParams();
  const navigate = useNavigate();
  const { activeDataset } = useDataset();

  const [writing, setWriting] = useState(null);
  const [loading, setLoading] = useState(true);

  const writingId = parseInt(id, 10);
  const datasetId = activeDataset?.id;

  useEffect(() => {
    let cancelled = false;

    async function loadWriting() {
      try {
        setLoading(true);
        const data = await getWriting(writingId, datasetId);
        if (!cancelled) setWriting(data ?? null);
      } catch (error) {
        logger.error('Failed to load writing for planner:', error);
        if (!cancelled) setWriting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadWriting();
    return () => { cancelled = true; };
  }, [writingId, datasetId]);

  // Navigating between views is now a route change, so each one is a history
  // entry and the back button walks them.
  const handleNavigateToView = useCallback((nextView, nextPlanId) => {
    if (!nextPlanId) {
      logger.warn(`Planner view "${nextView}" requested without a plan id`);
      return;
    }
    navigate(`/writing/${writingId}/plan/${nextPlanId}/${nextView}`);
  }, [navigate, writingId]);

  const handleBackToDashboard = useCallback(() => {
    navigate(`/writing/${writingId}/plan`);
  }, [navigate, writingId]);

  const handleBackToEditor = useCallback(() => {
    navigate(`/writing/${writingId}`);
  }, [navigate, writingId]);

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="story-planner__loading">
          <div className="loader-spinner" />
          <p>Loading planner…</p>
        </div>
      </>
    );
  }

  // A deleted writing, or a hand-edited id. The modal could not be opened
  // without a writing, so this case simply did not exist before.
  if (!writing) {
    return (
      <>
        <Navigation />
        <div className="story-planner__empty">
          <EmptyState
            icon="search-x"
            title="Writing Not Found"
            description="This writing may have been deleted, or it belongs to a different world."
            action={{
              label: 'Back to Writing Studio',
              onClick: () => navigate('/writing'),
              icon: 'arrow-left'
            }}
          />
        </div>
      </>
    );
  }

  const activeView = view ? VIEWS[view] : null;
  const isDashboard = !view;

  // A `:view` segment that isn't one of the seven. Reachable now that the view
  // is typed into the URL by hand, so it needs an answer other than a blank page.
  if (!isDashboard && !activeView) {
    return (
      <>
        <Navigation />
        <div className="story-planner__empty">
          <EmptyState
            icon="compass"
            title="Unknown Planner View"
            description={`"${view}" is not one of the planner's views.`}
            action={{
              label: 'Back to the Planner',
              onClick: handleBackToDashboard,
              icon: 'arrow-left'
            }}
          />
        </div>
      </>
    );
  }

  const ViewComponent = activeView?.Component;

  return (
    <>
      <Navigation />
      <div className="story-planner">
        <header className="story-planner__header">
          <div className="story-planner__header-content">
            <button
              className="story-planner__back-btn"
              onClick={isDashboard ? handleBackToEditor : handleBackToDashboard}
              aria-label={isDashboard ? 'Back to the editor' : 'Back to the planner dashboard'}
            >
              <Icon name="arrow-left" size={20} />
            </button>
            <Icon name="map" size={24} className="story-planner__icon" />
            <div className="story-planner__titles">
              <h1 className="story-planner__title">
                {activeView ? activeView.title : 'Story Planner'}
              </h1>
              <span className="story-planner__subtitle">{writing.title}</span>
            </div>
          </div>

          <button
            className="story-planner__editor-btn"
            onClick={handleBackToEditor}
          >
            <Icon name="feather" size={16} />
            <span>Back to Writing</span>
          </button>
        </header>

        <div className="story-planner__content">
          {isDashboard ? (
            <StoryPlannerDashboard
              writingId={writingId}
              writingTitle={writing.title}
              datasetId={datasetId}
              onNavigateToView={handleNavigateToView}
            />
          ) : (
            <ViewComponent
              storyPlanId={parseInt(planId, 10)}
              writingId={writingId}
              datasetId={datasetId}
              onClose={handleBackToDashboard}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default StoryPlanner;
