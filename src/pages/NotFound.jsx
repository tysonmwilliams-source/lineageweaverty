/**
 * NotFound.jsx - 404 page
 *
 * The router had 23 routes and no catch-all, so any unmatched URL rendered an
 * empty page: no message, no navigation, no indication anything had gone wrong.
 */

import { Link, useLocation } from 'react-router-dom';
import Navigation from '../components/Navigation';
import Icon from '../components/icons';
import './NotFound.css';

// ActionButton always renders a <button>, so these are real links styled with
// its classes — navigation should be navigable (middle-click, open in new tab).
function LinkButton({ to, variant = 'secondary', icon, children }) {
  return (
    <Link to={to} className={`action-btn action-btn--${variant} action-btn--md`}>
      {icon && <Icon name={icon} size={18} strokeWidth={2} />}
      <span>{children}</span>
    </Link>
  );
}

export default function NotFound() {
  const location = useLocation();

  return (
    <>
      <Navigation />
      <main className="not-found">
        <div className="not-found__content">
          <Icon name="scroll-text" size={48} className="not-found__icon" />
          <h1 className="not-found__title">This page is not in the record</h1>
          <p className="not-found__message">
            Nothing is bound at <code className="not-found__path">{location.pathname}</code>.
          </p>

          <div className="not-found__actions">
            <LinkButton to="/" variant="primary" icon="home">Return to the Hall</LinkButton>
            <LinkButton to="/tree" icon="git-branch">Family Tree</LinkButton>
            <LinkButton to="/codex" icon="book-open">The Codex</LinkButton>
          </div>
        </div>
      </main>
    </>
  );
}
