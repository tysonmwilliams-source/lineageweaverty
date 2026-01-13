/**
 * TreeControls.jsx - Tree View Control Panel
 *
 * PURPOSE:
 * Provides interactive controls for the family tree visualization:
 * - Zoom in/out/reset buttons
 * - Current zoom level display
 * - Keyboard shortcuts
 *
 * Uses Framer Motion for animations and BEM CSS.
 */

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import * as d3 from 'd3';
import Icon from './icons';
import './TreeControls.css';

// ==================== ANIMATION VARIANTS ====================
const PANEL_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 300
    }
  }
};

const HINT_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 0.6,
    y: 0,
    transition: { delay: 0.5, duration: 0.3 }
  }
};

function TreeControls({
  svgRef,
  zoomBehaviorRef,
  showCadetHouses,
  onToggleCadetHouses,
  zoomLevel,
  onZoomChange
}) {
  // ==================== ZOOM HANDLERS ====================
  const handleZoomIn = () => {
    if (zoomBehaviorRef.current && svgRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomBehaviorRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (zoomBehaviorRef.current && svgRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomBehaviorRef.current.scaleBy, 0.7);
    }
  };

  const handleResetView = () => {
    if (zoomBehaviorRef.current && svgRef.current) {
      const initialTransform = d3.zoomIdentity.translate(200, 100).scale(0.8);
      d3.select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomBehaviorRef.current.transform, initialTransform);
    }
  };

  // ==================== KEYBOARD SHORTCUTS ====================
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      switch (e.key) {
        case '+':
        case '=':
          handleZoomIn();
          break;
        case '-':
        case '_':
          handleZoomOut();
          break;
        case '0':
          handleResetView();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      {/* Zoom Controls - Bottom Right */}
      <motion.div
        className="tree-controls tree-controls--zoom"
        variants={PANEL_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <button
          className="tree-controls__zoom-btn tree-controls__zoom-btn--primary"
          onClick={handleZoomIn}
          title="Zoom In (+)"
        >
          <Icon name="plus" size={20} />
        </button>

        <button
          className="tree-controls__zoom-btn tree-controls__zoom-btn--primary"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
        >
          <Icon name="minus" size={20} />
        </button>

        <button
          className="tree-controls__zoom-btn tree-controls__zoom-btn--secondary"
          onClick={handleResetView}
          title="Reset View (0)"
        >
          <Icon name="rotate-ccw" size={18} />
        </button>

        <span className="tree-controls__zoom-level">
          {Math.round(zoomLevel * 100)}%
        </span>
      </motion.div>

      {/* Keyboard Shortcuts Hint */}
      <motion.div
        className="tree-controls__shortcuts"
        variants={HINT_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <span className="tree-controls__shortcuts-label">Shortcuts:</span>
        <kbd className="tree-controls__kbd">+</kbd>/<kbd className="tree-controls__kbd">-</kbd> zoom
        <span className="tree-controls__shortcuts-divider">•</span>
        <kbd className="tree-controls__kbd">0</kbd> reset
      </motion.div>
    </>
  );
}

export default TreeControls;
