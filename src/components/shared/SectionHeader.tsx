/**
 * SectionHeader.jsx - Reusable Section Title Component
 *
 * PURPOSE:
 * Provides a consistent section title pattern with optional icon,
 * used across all pages for visual consistency.
 *
 * USAGE:
 * <SectionHeader icon="chart" title="Your World at a Glance" />
 * <SectionHeader icon="crown" title="Dignities" subtitle="Manage titles and holdings" />
 */

import { forwardRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { HTMLMotionProps, Variants } from 'framer-motion';
import Icon from '../icons';
import './SectionHeader.css';

// Animation variants defined outside component
const HEADER_VARIANTS = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut'
    }
  }
} satisfies Variants;

/**
 * SectionHeader Component
 *
 * @param {Object} props
 * @param {string} props.icon - Lucide icon name
 * @param {string} props.title - Section title text
 * @param {string} props.subtitle - Optional subtitle text
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {string} props.align - 'left' | 'center' | 'right' (default: 'center')
 * @param {boolean} props.animate - Whether to animate entrance (default: true)
 * @param {number} props.delay - Animation delay in seconds
 * @param {string} props.className - Additional CSS classes
 */
import type { HTMLAttributes, ReactNode } from 'react';

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** A lucide icon name. */
  icon?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  align?: 'left' | 'center' | 'right';
  animate?: boolean;
  /** Entrance delay, in seconds. */
  delay?: number;
  className?: string;
}

const SectionHeader = forwardRef<HTMLElement, SectionHeaderProps>(function SectionHeader(
  {
    icon,
    title,
    subtitle,
    size = 'md',
    align = 'center',
    animate = true,
    delay = 0,
    className = '',
    ...props
  }: SectionHeaderProps,
  ref
) {
  // Build class names
  const headerClass = useMemo(() => {
    return `section-header section-header--${size} section-header--${align} ${className}`.trim();
  }, [size, align, className]);

  // Get icon size based on header size
  const iconSize = useMemo(() => {
    switch (size) {
      case 'sm': return 18;
      case 'lg': return 26;
      default: return 22;
    }
  }, [size]);

  // Build animation props
  const animationProps = useMemo(() => {
    if (!animate) return {};
    return {
      variants: HEADER_VARIANTS,
      initial: 'hidden',
      animate: 'visible',
      transition: { ...HEADER_VARIANTS.visible.transition, delay }
    };
  }, [animate, delay]);

  return (
    <motion.header
      ref={ref}
      className={headerClass}
      {...animationProps}
      {...(props as HTMLMotionProps<'header'>)}
    >
      <h2 className="section-header__title">
        {icon && (
          <Icon
            name={icon}
            size={iconSize}
            className="section-header__icon"
            strokeWidth={1.5}
          />
        )}
        <span>{title}</span>
      </h2>

      {subtitle && (
        <p className="section-header__subtitle">{subtitle}</p>
      )}
    </motion.header>
  );
});

export default SectionHeader;
