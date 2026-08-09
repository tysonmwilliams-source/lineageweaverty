/**
 * LoadingState.jsx - Consistent Loading State Component
 *
 * PURPOSE:
 * Provides a themed loading spinner with optional message.
 * Used when data is being fetched or processed.
 *
 * USAGE:
 * <LoadingState />
 * <LoadingState message="Loading your chronicles..." />
 * <LoadingState size="sm" inline />
 */

import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import './LoadingState.css';

// Spinner animation variants
const SPINNER_VARIANTS = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear'
    }
  }
} satisfies Variants;

// Pulse animation for dots
const DOT_VARIANTS = {
  animate: {
    scale: [1, 1.2, 1],
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
} satisfies Variants;

/**
 * LoadingState Component
 *
 * @param {Object} props
 * @param {string} props.message - Optional loading message
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} props.variant - 'spinner' | 'dots' | 'pulse' (default: 'spinner')
 * @param {boolean} props.inline - Display inline vs full container (default: false)
 * @param {string} props.className - Additional CSS classes
 */
export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'pulse';
  /** Render inline rather than filling its container. */
  inline?: boolean;
  className?: string;
  [key: string]: unknown;
}

const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(function LoadingState(
  {
    message,
    size = 'md',
    variant = 'spinner',
    inline = false,
    className = '',
    ...props
  }: LoadingStateProps,
  ref
) {
  // Build class names
  const loadingClass = useMemo(() => {
    const classes = [
      'loading-state',
      `loading-state--${size}`,
      `loading-state--${variant}`
    ];
    if (inline) classes.push('loading-state--inline');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [size, variant, inline, className]);

  // Render the appropriate indicator
  const renderIndicator = () => {
    switch (variant) {
      case 'dots':
        return (
          <div className="loading-dots">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="loading-dot"
                variants={DOT_VARIANTS}
                animate="animate"
                transition={{ delay: i * 0.2 }}
              />
            ))}
          </div>
        );
      case 'pulse':
        return (
          <motion.div
            className="loading-pulse"
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      case 'spinner':
      default:
        return (
          <motion.div
            className="loading-spinner"
            variants={SPINNER_VARIANTS}
            animate="animate"
          />
        );
    }
  };

  return (
    <div
      ref={ref}
      className={loadingClass}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      {renderIndicator()}
      {message && (
        <p className="loading-message">{message}</p>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );
});

export default LoadingState;
