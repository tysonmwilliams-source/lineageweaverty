/**
 * FilterDropdown.jsx - Filter Dropdown Component
 *
 * PURPOSE:
 * Dropdown for filtering lists by specific attributes.
 * Similar to SortDropdown but semantically for filtering.
 * Uses BEM CSS and theme variables.
 *
 * Props:
 * - value: Current filter value
 * - onChange: Callback when filter changes
 * - options: Array of { value, label }
 * - label: Optional label text (e.g., "House:")
 * - allLabel: Label for the "All" option (default: "All")
 * - icon: Optional icon name for the label
 */

import type { ChangeEvent as ReactChangeEvent } from 'react';
import Icon from '../icons';
import './FilterDropdown.css';

/** One selectable filter value. */
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  label?: string;
  /** Text for the "no filter" entry. */
  allLabel?: string;
  /** A lucide icon name. */
  icon?: string;
}

function FilterDropdown({
  value,
  onChange,
  options,
  label,
  allLabel = 'All',
  icon
}: FilterDropdownProps) {
  const handleChange = (e: ReactChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="filter-dropdown">
      {label && (
        <label className="filter-dropdown__label">
          {icon && <Icon name={icon} size={14} />}
          <span>{label}</span>
        </label>
      )}

      <select
        className="filter-dropdown__select"
        value={value}
        onChange={handleChange}
        aria-label={label || 'Filter by'}
      >
        <option value="">{allLabel}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default FilterDropdown;
