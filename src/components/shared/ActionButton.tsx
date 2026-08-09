/**
 * ActionButton.jsx - Animated Action Button Component
 *
 * PURPOSE:
 * Provides consistent, animated buttons for actions throughout the app.
 * Supports icons, different variants, and hover animations.
 *
 * USAGE:
 * <ActionButton onClick={handleClick}>Save Changes</ActionButton>
 * <ActionButton icon="plus" variant="primary" onClick={handleAdd}>Add Item</ActionButton>
 * <ActionButton icon="trash" variant="danger" size="sm">Delete</ActionButton>
 */

import { forwardRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps, MotionProps } from 'framer-motion';
import Icon from '../icons';
import './ActionButton.css';

// Hover configuration
const HOVER_CONFIG = {
  y: -2,
  scale: 1.02,
  transition: { duration: 0.15, ease: 'easeOut' }
} as const;

const TAP_CONFIG = { scale: 0.98 };

/**
 * ActionButton Component
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Button text/content
 * @param {string} props.icon - Lucide icon name (displayed before text)
 * @param {string} props.iconRight - Lucide icon name (displayed after text)
 * @param {string} props.variant - 'primary' | 'secondary' | 'ghost' | 'danger' (default: 'secondary')
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {boolean} props.disabled - Disable the button
 * @param {boolean} props.loading - Show loading state
 * @param {boolean} props.fullWidth - Take full container width
 * @param {Function} props.onClick - Click handler
 * @param {string} props.type - Button type ('button', 'submit', 'reset')
 * @param {string} props.className - Additional CSS classes
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  children?: ReactNode;
  /** A lucide icon name, before the text. */
  icon?: string;
  /** A lucide icon name, after the text. */
  iconRight?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  {
    children,
    icon,
    iconRight,
    variant = 'secondary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    onClick,
    type = 'button',
    className = '',
    ...props
  }: ActionButtonProps,
  ref
) {
  // Build class names
  const buttonClass = useMemo(() => {
    const classes = [
      'action-btn',
      `action-btn--${variant}`,
      `action-btn--${size}`
    ];
    if (fullWidth) classes.push('action-btn--full');
    if (loading) classes.push('action-btn--loading');
    if (disabled) classes.push('action-btn--disabled');
    if (!children) classes.push('action-btn--icon-only');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [variant, size, fullWidth, loading, disabled, children, className]);

  // Get icon size based on button size
  const iconSize = useMemo(() => {
    switch (size) {
      case 'sm': return 16;
      case 'lg': return 22;
      default: return 18;
    }
  }, [size]);

  // Memoize click handler
  const handleClick = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
  }, [disabled, loading, onClick]);

  // Animation props (disabled when button is disabled/loading)
  const animationProps = useMemo((): MotionProps => {
    if (disabled || loading) return {};
    return {
      whileHover: HOVER_CONFIG,
      whileTap: TAP_CONFIG
    };
  }, [disabled, loading]);

  return (
    <motion.button
      // `ActionButtonProps` extends `ButtonHTMLAttributes`, but `motion.button`
      // takes `HTMLMotionProps`, which *replaces* several DOM handlers
      // (onAnimationStart, onDrag…) with Framer's own. The rest props are
      // narrowed here rather than the public prop type being written against
      // Framer's, which would leak the animation library into every caller.
      ref={ref}
      type={type}
      className={buttonClass}
      onClick={handleClick}
      disabled={disabled || loading}
      {...animationProps}
      {...(props as HTMLMotionProps<'button'>)}
    >
      {loading ? (
        <span className="action-btn__spinner" />
      ) : (
        <>
          {icon && (
            <span className="action-btn__icon">
              <Icon name={icon} size={iconSize} strokeWidth={1.75} />
            </span>
          )}
          {children && (
            <span className="action-btn__text">{children}</span>
          )}
          {iconRight && (
            <span className="action-btn__icon action-btn__icon--right">
              <Icon name={iconRight} size={iconSize} strokeWidth={1.75} />
            </span>
          )}
        </>
      )}
    </motion.button>
  );
});

export default ActionButton;
