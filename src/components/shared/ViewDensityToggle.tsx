/**
 * ViewDensityToggle.jsx - View Density Selector Component
 *
 * PURPOSE:
 * Toggle between compact and comfortable view densities.
 * Uses BEM CSS and theme variables.
 *
 * Props:
 * - density: Current density ('compact' | 'comfortable')
 * - onChange: Callback when density changes
 */

import Icon from '../icons';
import './ViewDensityToggle.css';

export interface ViewDensityToggleProps {
  density: string;
  onChange: (density: string) => void;
}

function ViewDensityToggle({
  density,
  onChange
}: ViewDensityToggleProps) {
  return (
    <div className="view-density" role="group" aria-label="View density">
      <button
        className={`view-density__btn ${density === 'comfortable' ? 'view-density__btn--active' : ''}`}
        onClick={() => onChange('comfortable')}
        title="Comfortable view"
        aria-pressed={density === 'comfortable'}
      >
        <Icon name="layout-grid" size={16} />
      </button>
      <button
        className={`view-density__btn ${density === 'compact' ? 'view-density__btn--active' : ''}`}
        onClick={() => onChange('compact')}
        title="Compact view"
        aria-pressed={density === 'compact'}
      >
        <Icon name="layout-list" size={16} />
      </button>
    </div>
  );
}

export default ViewDensityToggle;
