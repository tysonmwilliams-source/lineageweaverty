/**
 * Card.jsx - Base Animated Card Component
 *
 * PURPOSE:
 * Provides a consistent card container with animation support.
 * Used as a building block for content cards throughout the app.
 *
 * USAGE:
 * <Card>Content here</Card>
 * <Card variant="elevated" onClick={handleClick}>Clickable card</Card>
 * <Card accent="success" hover>Success card with hover effect</Card>
 */

import { forwardRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import './Card.css';

// Animation variants defined outside component
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94]
    }
  }
};

// Hover animation configuration
const HOVER_CONFIG = {
  y: -4,
  transition: { duration: 0.2, ease: 'easeOut' }
};

const TAP_CONFIG = { scale: 0.98 };

/**
 * Card Component
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.variant - 'default' | 'elevated' | 'outlined' (default: 'default')
 * @param {string} props.accent - 'primary' | 'success' | 'warning' | 'error' | 'info' | null
 * @param {string} props.padding - 'none' | 'sm' | 'md' | 'lg' (default: 'md')
 * @param {boolean} props.hover - Enable hover lift effect (default: false)
 * @param {boolean} props.animate - Enable entrance animation (default: false)
 * @param {number} props.delay - Animation delay in seconds
 * @param {Function} props.onClick - Click handler (makes card interactive)
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.style - Additional inline styles
 */
const Card = forwardRef(function Card(
  {
    children,
    variant = 'default',
    accent = null,
    padding = 'md',
    hover = false,
    animate = false,
    delay = 0,
    onClick,
    className = '',
    style = {},
    as = 'div',
    ...props
  },
  ref
) {
  // Build class names
  const cardClass = useMemo(() => {
    const classes = [
      'card',
      `card--${variant}`,
      `card--padding-${padding}`
    ];
    if (accent) classes.push(`card--accent-${accent}`);
    if (onClick) classes.push('card--clickable');
    if (hover || onClick) classes.push('card--hoverable');
    if (className) classes.push(className);
    return classes.join(' ');
  }, [variant, padding, accent, onClick, hover, className]);

  // Memoize click handler
  const handleClick = useCallback((e) => {
    if (onClick) onClick(e);
  }, [onClick]);

  // Build animation props
  const animationProps = useMemo(() => {
    const result = {};

    if (animate) {
      result.variants = CARD_VARIANTS;
      result.initial = 'hidden';
      result.animate = 'visible';
      if (delay > 0) {
        result.transition = {
          ...CARD_VARIANTS.visible.transition,
          delay
        };
      }
    }

    if (hover || onClick) {
      result.whileHover = HOVER_CONFIG;
      result.whileTap = TAP_CONFIG;
    }

    return result;
  }, [animate, delay, hover, onClick]);

  const Component = motion[as] || motion.div;

  // Setting role="button" and tabIndex={0} without a key handler is worse than
  // leaving it a plain div: it announces itself as a button to assistive tech
  // and then does nothing when activated. Space is preventDefault'd so the
  // page doesn't scroll, matching native button behaviour.
  const handleKeyDown = onClick
    ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick(event);
        }
      }
    : undefined;

  return (
    <Component
      ref={ref}
      className={cardClass}
      style={style}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={handleKeyDown}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...animationProps}
      {...props}
    >
      {children}
    </Component>
  );
});

export default Card;
