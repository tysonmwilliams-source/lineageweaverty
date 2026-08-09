/**
 * EmptyState.jsx - Consistent Empty State Component
 *
 * PURPOSE:
 * Provides a friendly, encouraging empty state display when
 * there's no data to show. Guides users toward taking action.
 *
 * USAGE:
 * <EmptyState
 *   icon="book-open"
 *   title="No Entries Yet"
 *   description="Start building your codex by creating your first entry."
 *   action={{ label: "Create Entry", onClick: handleCreate }}
 * />
 */

import { forwardRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Icon from '../icons';
import ActionButton from './ActionButton';
import './EmptyState.css';

// Animation variants defined outside component
const EMPTY_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
      staggerChildren: 0.1
    }
  }
} satisfies Variants;

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' }
  }
} satisfies Variants;

/**
 * EmptyState Component
 *
 * @param {Object} props
 * @param {string} props.icon - Lucide icon name
 * @param {string} props.title - Main message title
 * @param {string} props.description - Supporting description text
 * @param {Object} props.action - Primary action { label, onClick, icon }
 * @param {Object} props.secondaryAction - Secondary action { label, onClick, icon }
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {boolean} props.animate - Enable entrance animation (default: true)
 * @param {string} props.className - Additional CSS classes
 */
import type { ReactNode } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

/** A button offered alongside an empty state. */
export interface EmptyStateAction {
  label: string;
  /** Receives the click event — the wrapper forwards it. */
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  icon?: string;
}

export interface EmptyStateProps {
  /** A lucide icon name. */
  icon?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
  [key: string]: unknown;
}

const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    icon = 'info',
    title,
    description,
    action,
    secondaryAction,
    size = 'md',
    animate = true,
    className = '',
    ...props
  }: EmptyStateProps,
  ref
) {
  // Build class names
  const emptyClass = useMemo(() => {
    return `empty-state empty-state--${size} ${className}`.trim();
  }, [size, className]);

  // Get icon size based on component size
  const iconSize = useMemo(() => {
    switch (size) {
      case 'sm': return 32;
      case 'lg': return 56;
      default: return 44;
    }
  }, [size]);

  // Build animation props
  const animationProps = useMemo(() => {
    if (!animate) return {};
    return {
      variants: EMPTY_VARIANTS,
      initial: 'hidden',
      animate: 'visible'
    };
  }, [animate]);

  // Memoize action handler
  const handleAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (action?.onClick) action.onClick(e);
  }, [action]);

  const handleSecondaryAction = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (secondaryAction?.onClick) secondaryAction.onClick(e);
  }, [secondaryAction]);

  return (
    <motion.div
      ref={ref}
      className={emptyClass}
      {...animationProps}
      {...props}
    >
      <motion.div
        className="empty-state__icon"
        variants={animate ? ITEM_VARIANTS : {}}
      >
        <Icon name={icon} size={iconSize} strokeWidth={1.25} />
      </motion.div>

      {title && (
        <motion.h3
          className="empty-state__title"
          variants={animate ? ITEM_VARIANTS : {}}
        >
          {title}
        </motion.h3>
      )}

      {description && (
        <motion.p
          className="empty-state__description"
          variants={animate ? ITEM_VARIANTS : {}}
        >
          {description}
        </motion.p>
      )}

      {(action || secondaryAction) && (
        <motion.div
          className="empty-state__actions"
          variants={animate ? ITEM_VARIANTS : {}}
        >
          {action && (
            <ActionButton
              icon={action.icon}
              variant="primary"
              onClick={handleAction}
            >
              {action.label}
            </ActionButton>
          )}
          {secondaryAction && (
            <ActionButton
              icon={secondaryAction.icon}
              variant="secondary"
              onClick={handleSecondaryAction}
            >
              {secondaryAction.label}
            </ActionButton>
          )}
        </motion.div>
      )}
    </motion.div>
  );
});

export default EmptyState;
