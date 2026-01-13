/**
 * SuggestionsBadge.jsx - Compact suggestion indicator
 *
 * PURPOSE:
 * Shows a small badge with suggestion count, colored by
 * highest severity. Perfect for navigation items or headers.
 *
 * USAGE:
 * <SuggestionsBadge count={5} severity="critical" />
 * <SuggestionsBadge count={3} severity="warning" pulse />
 */

import { useMemo, memo, forwardRef } from 'react';
import { motion } from 'framer-motion';
import Icon from '../icons/Icon';
import './SuggestionsBadge.css';

/**
 * SuggestionsBadge Component
 *
 * @param {Object} props
 * @param {number} props.count - Number to display
 * @param {string} props.severity - 'critical' | 'warning' | 'info' (determines color)
 * @param {boolean} props.pulse - Enable pulse animation for critical items
 * @param {boolean} props.showIcon - Show severity icon (default: false)
 * @param {string} props.size - 'sm' | 'md' | 'lg' (default: 'md')
 * @param {Function} props.onClick - Click handler
 * @param {string} props.title - Tooltip text
 */
const SuggestionsBadge = forwardRef(function SuggestionsBadge(
  {
    count = 0,
    severity = 'info',
    pulse = false,
    showIcon = false,
    size = 'md',
    onClick,
    title,
    className = ''
  },
  ref
) {
  // Build class names
  const badgeClass = useMemo(() => {
    const classes = [
      'suggestions-badge',
      `suggestions-badge--${severity}`,
      `suggestions-badge--${size}`
    ];
    if (pulse && severity === 'critical') {
      classes.push('suggestions-badge--pulse');
    }
    if (onClick) {
      classes.push('suggestions-badge--clickable');
    }
    if (className) {
      classes.push(className);
    }
    return classes.join(' ');
  }, [severity, size, pulse, onClick, className]);

  // Get icon name
  const iconName = useMemo(() => {
    switch (severity) {
      case 'critical': return 'alert';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }, [severity]);

  // Icon size based on badge size
  const iconSize = useMemo(() => {
    switch (size) {
      case 'sm': return 10;
      case 'lg': return 14;
      default: return 12;
    }
  }, [size]);

  // Don't render if count is 0
  if (count === 0) return null;

  const BadgeWrapper = onClick ? motion.button : motion.span;
  const badgeProps = onClick ? { onClick, type: 'button' } : {};

  return (
    <BadgeWrapper
      ref={ref}
      className={badgeClass}
      title={title || `${count} ${severity} suggestion${count !== 1 ? 's' : ''}`}
      whileHover={onClick ? { scale: 1.05 } : undefined}
      whileTap={onClick ? { scale: 0.95 } : undefined}
      {...badgeProps}
    >
      {showIcon && (
        <span className="suggestions-badge__icon">
          <Icon name={iconName} size={iconSize} />
        </span>
      )}
      <span className="suggestions-badge__count">{count > 99 ? '99+' : count}</span>
    </BadgeWrapper>
  );
});

export default memo(SuggestionsBadge);
