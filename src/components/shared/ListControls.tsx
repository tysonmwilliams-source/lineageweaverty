/**
 * ListControls.jsx - List Filter/Sort/Search Controls Container
 *
 * PURPOSE:
 * Container component that wraps search, sort, and filter controls
 * for list views. Provides consistent styling and layout.
 *
 * Props:
 * - children: Control components to render
 * - resultCount: Number of filtered results
 * - totalCount: Total number of items
 * - onClearFilters: Callback to clear all filters (shows button if provided)
 * - hasActiveFilters: Boolean to show clear button
 */

import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Icon from '../icons';
import './ListControls.css';

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2 }
  }
} satisfies Variants;

import type { ReactNode } from 'react';

export interface ListControlsProps {
  children?: ReactNode;
  /** Rows after filtering. */
  resultCount?: number;
  /** Rows before filtering. Shown as "n of m". */
  totalCount?: number;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}

function ListControls({
  children,
  resultCount,
  totalCount,
  onClearFilters,
  hasActiveFilters = false
}: ListControlsProps) {
  const showResultCount = resultCount !== undefined && totalCount !== undefined;
  const isFiltered = showResultCount && resultCount !== totalCount;

  return (
    <motion.div
      className="list-controls"
      variants={CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
    >
      <div className="list-controls__row">
        {children}
      </div>

      {(showResultCount || hasActiveFilters) && (
        <div className="list-controls__info">
          {showResultCount && (
            <span className="list-controls__count">
              <Icon name="filter" size={14} />
              <span>
                Showing <strong>{resultCount}</strong>
                {isFiltered && <> of {totalCount}</>}
                {' '}{resultCount === 1 ? 'result' : 'results'}
              </span>
            </span>
          )}

          {hasActiveFilters && onClearFilters && (
            <button
              className="list-controls__clear"
              onClick={onClearFilters}
              type="button"
            >
              <Icon name="x-circle" size={14} />
              <span>Clear Filters</span>
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default ListControls;
