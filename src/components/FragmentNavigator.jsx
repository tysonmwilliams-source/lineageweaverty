/**
 * FragmentNavigator Component
 *
 * A hover-expandable pill that shows available family tree fragments (disconnected branches).
 * Allows quick navigation between different branches in the tree view.
 */

import { useState } from 'react';
import Icon from './icons';
import './FragmentNavigator.css';

function FragmentNavigator({ fragments, onNavigateToFragment }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!fragments || fragments.length === 0) {
    return null;
  }

  return (
    <div
      className="fragment-nav"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Collapsed pill */}
      <div className="fragment-nav__pill">
        <Icon name="git-branch" size={16} className="fragment-nav__pill-icon" />
        <span className="fragment-nav__pill-label">
          {fragments.length} Branches
        </span>
      </div>

      {/* Expanded dropdown */}
      {isExpanded && (
        <div className="fragment-nav__list">
          {fragments.map((fragment, index) => (
            <button
              key={index}
              type="button"
              className="fragment-nav__item"
              onClick={() => onNavigateToFragment(index)}
            >
              <Icon name="user" size={14} className="fragment-nav__item-icon" />
              <span>
                {fragment.rootPerson.firstName} {fragment.rootPerson.lastName}
              </span>
              <span className="fragment-nav__item-count">
                {fragment.memberCount}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default FragmentNavigator;
