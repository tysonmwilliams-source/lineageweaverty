/**
 * GroupToggle.jsx - Group Toggle Button Component
 *
 * PURPOSE:
 * Toggle button for enabling/disabling grouping in lists.
 * Uses BEM CSS and theme variables.
 *
 * Props:
 * - enabled: Whether grouping is enabled
 * - onChange: Callback when toggled
 * - label: Label text (default: "Group by House")
 */

import Icon from '../icons';
import './GroupToggle.css';

export interface GroupToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label?: string;
}

function GroupToggle({
  enabled,
  onChange,
  label = 'Group by House'
}: GroupToggleProps) {
  return (
    <button
      className={`group-toggle ${enabled ? 'group-toggle--active' : ''}`}
      onClick={() => onChange(!enabled)}
      type="button"
      aria-pressed={enabled}
    >
      <Icon name={enabled ? 'check-square' : 'square'} size={16} />
      <span>{label}</span>
    </button>
  );
}

export default GroupToggle;
