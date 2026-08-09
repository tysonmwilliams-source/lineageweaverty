/**
 * AnimatedList.jsx - Staggered List Animation Wrapper
 *
 * PURPOSE:
 * Wraps a list of children to provide staggered entrance animations.
 * Creates a polished, professional feel when lists appear.
 *
 * USAGE:
 * <AnimatedList>
 *   {items.map(item => <Card key={item.id}>{item.name}</Card>)}
 * </AnimatedList>
 *
 * <AnimatedList stagger={0.05} direction="horizontal">
 *   {buttons.map(btn => <ActionButton key={btn.id}>{btn.label}</ActionButton>)}
 * </AnimatedList>
 */

import { Children, forwardRef, useMemo, cloneElement, isValidElement } from 'react';
import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import './AnimatedList.css';

// Animation variants for different directions
const createContainerVariants = (stagger: number): Variants => ({
  hidden: {},
  visible: {
    transition: {
      staggerChildren: stagger
    }
  }
});

const createItemVariants = (direction: string): Variants => {
  const baseHidden = { opacity: 0 };
  const baseVisible = {
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut'
    }
  } as const;

  switch (direction) {
    case 'left':
      return {
        hidden: { ...baseHidden, x: -20 },
        visible: { ...baseVisible, x: 0 }
      };
    case 'right':
      return {
        hidden: { ...baseHidden, x: 20 },
        visible: { ...baseVisible, x: 0 }
      };
    case 'up':
      return {
        hidden: { ...baseHidden, y: -20 },
        visible: { ...baseVisible, y: 0 }
      };
    case 'scale':
      return {
        hidden: { ...baseHidden, scale: 0.9 },
        visible: { ...baseVisible, scale: 1 }
      };
    case 'down':
    default:
      return {
        hidden: { ...baseHidden, y: 20 },
        visible: { ...baseVisible, y: 0 }
      };
  }
};

/**
 * AnimatedList Component
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - List items to animate
 * @param {number} props.stagger - Delay between items in seconds (default: 0.1)
 * @param {string} props.direction - 'down' | 'up' | 'left' | 'right' | 'scale' (default: 'down')
 * @param {boolean} props.animate - Enable animations (default: true)
 * @param {string} props.layout - 'vertical' | 'horizontal' | 'grid' (default: 'vertical')
 * @param {string} props.gap - Gap between items (default: 'md')
 * @param {string} props.as - HTML element to render as (default: 'div')
 * @param {string} props.className - Additional CSS classes
 */
import type { ReactElement, ReactNode } from 'react';

export interface AnimatedListProps {
  children?: ReactNode;
  /** Seconds between each child's entrance. */
  stagger?: number;
  direction?: 'down' | 'up' | 'left' | 'right' | 'scale';
  animate?: boolean;
  layout?: 'vertical' | 'horizontal' | 'grid';
  gap?: string;
  /** The element to render as. */
  as?: string;
  className?: string;
  [key: string]: unknown;
}

const AnimatedList = forwardRef<HTMLElement, AnimatedListProps>(function AnimatedList(
  {
    children,
    stagger = 0.1,
    direction = 'down',
    animate = true,
    layout = 'vertical',
    gap = 'md',
    as = 'div',
    className = '',
    ...props
  }: AnimatedListProps,
  ref
) {
  // Build class names
  const listClass = useMemo(() => {
    const classes = [
      'animated-list',
      `animated-list--${layout}`,
      `animated-list--gap-${gap}`
    ];
    if (className) classes.push(className);
    return classes.join(' ');
  }, [layout, gap, className]);

  // Memoize variants
  const containerVariants = useMemo(
    () => createContainerVariants(stagger),
    [stagger]
  );

  const itemVariants = useMemo(
    () => createItemVariants(direction),
    [direction]
  );

  // Animation props
  const containerProps = useMemo(() => {
    if (!animate) return {};
    return {
      variants: containerVariants,
      initial: 'hidden',
      animate: 'visible'
    };
  }, [animate, containerVariants]);

  // Process children to wrap each in motion.div
  const animatedChildren = useMemo(() => {
    if (!animate) return children;

    return Children.map(children, (child, index) => {
      if (!isValidElement(child)) return child;

      // If child is already a motion component, just add variants
      // `type` is a string for host elements and a component otherwise; only
      // the component form carries `displayName`, so this narrows rather than
      // reaching through an optional chain the type does not allow.
      const childType = child.type;
      const displayName = typeof childType === 'string'
        ? undefined
        // `JSXElementConstructor` has no `displayName` in the type, but every
        // motion component sets one — which is exactly what this checks for.
        : (childType as { displayName?: string }).displayName;
      if (displayName?.startsWith('motion.')) {
        return cloneElement(child as ReactElement<{ variants?: Variants }>, {
          variants: itemVariants,
          key: child.key || index
        });
      }

      // Wrap in motion.div for animation
      return (
        <motion.div
          key={child.key || index}
          variants={itemVariants}
          className="animated-list__item"
        >
          {child}
        </motion.div>
      );
    });
  }, [children, animate, itemVariants]);

  // `as` is a free-form tag name from props; `motion` is a callable proxy whose
  // index signature TypeScript cannot express. Unknown tags fall back to a div,
  // which is the pre-existing behaviour.
  const Component = (motion as unknown as Record<string, typeof motion.div>)[as] || motion.div;

  return (
    <Component
      // `as` picks the element, so the ref's type is only known at runtime.
      ref={ref as never}
      className={listClass}
      {...containerProps}
      {...props}
    >
      {animatedChildren}
    </Component>
  );
});

export default AnimatedList;
