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
import type { MotionProps, Variants } from 'framer-motion';
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
} satisfies Variants;

// Hover animation configuration
const HOVER_CONFIG = {
  y: -4,
  transition: { duration: 0.2, ease: 'easeOut' }
} as const;

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
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
// Aliased: the bare names resolve to the DOM globals, which are not generic.
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

export interface CardProps {
  children?: ReactNode;
  variant?: 'default' | 'elevated' | 'outlined';
  accent?: 'primary' | 'success' | 'warning' | 'error' | null;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  animate?: boolean;
  /** Entrance delay, in seconds. */
  delay?: number;
  /** Supplying this makes the card interactive. */
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  style?: CSSProperties;
  /** The element to render as. */
  as?: string;
  [key: string]: unknown;
}

const Card = forwardRef<HTMLElement, CardProps>(function Card(
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
  }: CardProps,
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
  // Accepts a keyboard event too: `handleKeyDown` below forwards Enter and
  // Space here so an interactive card behaves like a button. `onClick` is
  // declared as a mouse handler because that is what every caller passes, so
  // the forward is narrowed at the call rather than the prop being widened for
  // all consumers.
  const handleClick = useCallback((e: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>) => {
    if (onClick) onClick(e as ReactMouseEvent<HTMLElement>);
  }, [onClick]);

  // Build animation props
  const animationProps = useMemo(() => {
    // Typed up front rather than accumulated onto `{}`: an empty object literal
    // has no properties, so every assignment below would be an error on a type
    // that grows by mutation. `MotionProps` is the union the element accepts.
    const result: MotionProps = {};

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

  // `as` is a free-form tag name from props, and `motion` is a callable proxy
  // whose index signature TypeScript cannot express — so the lookup is narrowed
  // here rather than at each use. An unknown tag falls back to a div, which is
  // the pre-existing behaviour.
  const Component = (motion as unknown as Record<string, typeof motion.div>)[as] || motion.div;

  // Setting role="button" and tabIndex={0} without a key handler is worse than
  // leaving it a plain div: it announces itself as a button to assistive tech
  // and then does nothing when activated. Space is preventDefault'd so the
  // page doesn't scroll, matching native button behaviour.
  const handleKeyDown = onClick
    ? (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleClick(event);
        }
      }
    : undefined;

  return (
    <Component
      // `as` picks the element, so the ref's type is only known at runtime.
      ref={ref as never}
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
