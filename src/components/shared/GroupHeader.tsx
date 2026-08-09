/**
 * GroupHeader.jsx - Collapsible Group Header Component
 *
 * PURPOSE:
 * Section header for grouped lists with collapse/expand functionality.
 * Medieval manuscript style divider with icon, title, and member count.
 * Uses Framer Motion for animations and BEM CSS.
 *
 * Props:
 * - icon: Lucide icon name
 * - title: Group title (e.g., "House Wilfrey")
 * - count: Number of items in group
 * - color: Optional accent color (hex or CSS variable)
 * - collapsed: Boolean state
 * - onToggle: Callback to toggle collapsed state
 */

import { motion } from 'framer-motion';
import type { MotionStyle } from 'framer-motion';
import type { Variants } from 'framer-motion';
import Icon from '../icons';
import './GroupHeader.css';

const CHEVRON_VARIANTS = {
  collapsed: { rotate: -90 },
  expanded: { rotate: 0 }
} satisfies Variants;

export interface GroupHeaderProps {
  /** A lucide icon name. */
  icon?: string;
  title: string;
  count?: number;
  /** A CSS colour, usually a house's colourCode. */
  color?: string | null;
  collapsed?: boolean;
  onToggle?: () => void;
}

function GroupHeader({
  icon = 'castle',
  title,
  count = 0,
  color,
  collapsed = false,
  onToggle
}: GroupHeaderProps) {
  return (
    <motion.button
      className="group-header"
      onClick={onToggle}
      // A CSS custom property. `MotionStyle` has no index signature for them,
      // and React's own `CSSProperties` only tolerates them via this cast.
      style={color ? ({ '--group-accent': color } as MotionStyle) : undefined}
      whileHover={{ backgroundColor: 'var(--bg-elevated, var(--bg-tertiary))' }}
      whileTap={{ scale: 0.995 }}
    >
      <div className="group-header__left">
        {color && (
          <div
            className="group-header__color-dot"
            style={{ backgroundColor: color }}
          />
        )}
        <Icon name={icon} size={18} className="group-header__icon" />
        <h3 className="group-header__title">{title}</h3>
      </div>

      <div className="group-header__right">
        <span className="group-header__count">
          {count} {count === 1 ? 'member' : 'members'}
        </span>
        <motion.div
          className="group-header__chevron"
          variants={CHEVRON_VARIANTS}
          animate={collapsed ? 'collapsed' : 'expanded'}
          transition={{ duration: 0.2 }}
        >
          <Icon name="chevron-down" size={18} />
        </motion.div>
      </div>
    </motion.button>
  );
}

export default GroupHeader;
