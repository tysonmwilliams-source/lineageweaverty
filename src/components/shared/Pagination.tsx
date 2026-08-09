/**
 * Pagination.jsx - Pagination Controls Component
 *
 * PURPOSE:
 * Page navigation controls for paginated lists.
 * Uses Framer Motion for animations and BEM CSS.
 *
 * Props:
 * - currentPage: Current page number (1-indexed)
 * - totalPages: Total number of pages
 * - onPageChange: Callback with new page number
 * - showInfo: Boolean to show "Page X of Y" text (default: true)
 */

import { motion } from 'framer-motion';
import Icon from '../icons';
import './Pagination.css';

export interface PaginationProps {
  /** 1-based. */
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showInfo?: boolean;
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showInfo = true
}: PaginationProps) {
  // Don't render if only one page or no pages
  if (totalPages <= 1) {
    return null;
  }

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const handlePrevious = () => {
    if (canGoPrevious) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (canGoNext) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <motion.div
      className="pagination"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        className="pagination__button"
        onClick={handlePrevious}
        disabled={!canGoPrevious}
        aria-label="Previous page"
      >
        <Icon name="chevron-left" size={16} />
        <span>Previous</span>
      </button>

      {showInfo && (
        <div className="pagination__info">
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      )}

      <button
        className="pagination__button"
        onClick={handleNext}
        disabled={!canGoNext}
        aria-label="Next page"
      >
        <span>Next</span>
        <Icon name="chevron-right" size={16} />
      </button>
    </motion.div>
  );
}

export default Pagination;
