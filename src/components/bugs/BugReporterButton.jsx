/**
 * BugReporterButton.jsx - Floating Bug Report Button
 * 
 * PURPOSE:
 * A floating button that appears on every page, allowing quick bug reports
 * from anywhere in the application. Clicking it opens a modal with a form
 * to describe the bug.
 * 
 * FEATURES:
 * - Fixed position (always visible, bottom-right corner)
 * - Auto-captures context (current page, browser, theme)
 * - Optional screenshot attachment
 * - System categorization (Tree, Codex, Armory, Dignities, General)
 * - Quick submission with minimal required fields
 * 
 * USAGE:
 * Just add <BugReporterButton /> anywhere in your app - it will float
 * and be accessible from any page. Best placed at App level.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useBugTracker } from '../../contexts/BugContext';
import { useTheme } from '../ThemeContext';
import './BugReporterButton.css';
import { logger } from '../../utils/logger';
import Icon from '../icons';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get browser info string
 * Captures browser name and version for debugging context
 */
function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  
  if (ua.includes('Firefox/')) {
    browser = 'Firefox ' + ua.split('Firefox/')[1].split(' ')[0];
  } else if (ua.includes('Chrome/')) {
    browser = 'Chrome ' + ua.split('Chrome/')[1].split(' ')[0];
  } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
    browser = 'Safari ' + ua.split('Version/')[1]?.split(' ')[0] || '';
  } else if (ua.includes('Edge/')) {
    browser = 'Edge ' + ua.split('Edge/')[1].split(' ')[0];
  }
  
  return browser;
}

/**
 * Get viewport size string
 */
function getViewportInfo() {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/**
 * Detect which system based on current path
 * @param {string} pathname - Current URL path
 * @returns {string} System name
 */
function detectSystem(pathname) {
  if (pathname.startsWith('/tree')) return 'tree';
  if (pathname.startsWith('/codex')) return 'codex';
  if (pathname.startsWith('/heraldry')) return 'armory';
  if (pathname.startsWith('/dignities')) return 'dignities';
  if (pathname.startsWith('/manage')) return 'general';
  return 'general';
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BugReporterButton Component
 * 
 * Renders a floating button and modal for bug reporting.
 * Uses BugContext to submit reports.
 */
function BugReporterButton() {
  // ==================== HOOKS ====================
  const location = useLocation();
  const { addBug, statistics } = useBugTracker();
  const { theme } = useTheme();
  
  // ==================== STATE ====================
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    stepsToReproduce: '',
    priority: 'medium',
    system: 'general'
  });
  
  // Ref for file input
  const fileInputRef = useRef(null);

  // ==================== AUTO-DETECT SYSTEM ====================
  // Update system when page changes
  useEffect(() => {
    const detectedSystem = detectSystem(location.pathname);
    setFormData(prev => ({ ...prev, system: detectedSystem }));
  }, [location.pathname]);

  // ==================== HANDLERS ====================
  
  /**
   * Open the bug report modal
   */
  const handleOpen = useCallback(() => {
    setIsOpen(true);
    setShowSuccess(false);
    // Reset form
    setFormData({
      title: '',
      description: '',
      stepsToReproduce: '',
      priority: 'medium',
      system: detectSystem(location.pathname)
    });
    setScreenshot(null);
  }, [location.pathname]);

  /**
   * Close the modal
   */
  const handleClose = useCallback(() => {
    setIsOpen(false);
    setScreenshot(null);
  }, []);

  /**
   * Handle form field changes
   */
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  /**
   * Handle screenshot file selection
   * Converts the image to base64 for storage
   */
  const handleScreenshotChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Screenshot must be under 5MB');
      return;
    }
    
    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      setScreenshot(event.target.result);
    };
    reader.readAsDataURL(file);
  }, []);

  /**
   * Remove attached screenshot
   */
  const handleRemoveScreenshot = useCallback(() => {
    setScreenshot(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  /**
   * Submit the bug report
   */
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // Validate required field
    if (!formData.title.trim()) {
      alert('Please enter a bug title');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Gather context automatically
      const bugData = {
        ...formData,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        stepsToReproduce: formData.stepsToReproduce.trim() || null,
        
        // Auto-captured context
        page: location.pathname,
        browser: getBrowserInfo(),
        viewport: getViewportInfo(),
        theme: theme,
        
        // Screenshot if provided
        screenshot: screenshot
      };
      
      await addBug(bugData);
      
      // Show success message briefly
      setShowSuccess(true);
      
      // Close after delay
      setTimeout(() => {
        handleClose();
      }, 1500);
      
    } catch (err) {
      logger.error('Error submitting bug:', err);
      alert('Failed to submit bug report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, location.pathname, theme, screenshot, addBug, handleClose]);

  // ==================== RENDER ====================
  
  return (
    <>
      {/* Floating Button */}
      <button 
        className="bug-reporter-fab"
        onClick={handleOpen}
        title="Report a Bug"
        aria-label="Report a Bug"
      >
        <span className="bug-reporter-fab-icon"><Icon name="alert-circle" /></span>
        {/* Badge showing open bug count */}
        {statistics.open > 0 && (
          <span className="bug-reporter-fab-badge">
            {statistics.open > 99 ? '99+' : statistics.open}
          </span>
        )}
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="bug-reporter-overlay" onClick={handleClose}>
          <div 
            className="bug-reporter-modal" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bug-reporter-header">
              <h2 className="bug-reporter-title">🐛 Report a Bug</h2>
              <button 
                className="bug-reporter-close"
                onClick={handleClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Success Message */}
            {showSuccess ? (
              <div className="bug-reporter-success">
                <span className="bug-reporter-success-icon"><Icon name="check" /></span>
                <p>Bug reported successfully!</p>
              </div>
            ) : (
              /* Form */
              <form onSubmit={handleSubmit} className="bug-reporter-form">
                {/* Title (Required) */}
                <div className="bug-reporter-field">
                  <label htmlFor="bug-title" className="bug-reporter-label">
                    Title <span className="required">*</span>
                  </label>
                  <input
                    id="bug-title"
                    name="title"
                    type="text"
                    value={formData.title}
                    onChange={handleChange}
                    placeholder="Brief description of the issue"
                    className="bug-reporter-input"
                    autoFocus
                    required
                  />
                </div>

                {/* Two-column row for Priority and System */}
                <div className="bug-reporter-row">
                  {/* Priority */}
                  <div className="bug-reporter-field">
                    <label htmlFor="bug-priority" className="bug-reporter-label">
                      Priority
                    </label>
                    <select
                      id="bug-priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                      className="bug-reporter-select"
                    >
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🟠 High</option>
                      <option value="critical">🔴 Critical</option>
                    </select>
                  </div>

                  {/* System */}
                  <div className="bug-reporter-field">
                    <label htmlFor="bug-system" className="bug-reporter-label">
                      System
                    </label>
                    <select
                      id="bug-system"
                      name="system"
                      value={formData.system}
                      onChange={handleChange}
                      className="bug-reporter-select"
                    >
                      <option value="general">⚙️ General</option>
                      <option value="tree">🌳 Family Tree</option>
                      <option value="codex">📚 The Codex</option>
                      <option value="armory">🛡️ The Armory</option>
                      <option value="dignities">👑 Dignities</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div className="bug-reporter-field">
                  <label htmlFor="bug-description" className="bug-reporter-label">
                    Description
                  </label>
                  <textarea
                    id="bug-description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="What happened? What did you expect to happen?"
                    className="bug-reporter-textarea"
                    rows={3}
                  />
                </div>

                {/* Steps to Reproduce */}
                <div className="bug-reporter-field">
                  <label htmlFor="bug-steps" className="bug-reporter-label">
                    Steps to Reproduce
                  </label>
                  <textarea
                    id="bug-steps"
                    name="stepsToReproduce"
                    value={formData.stepsToReproduce}
                    onChange={handleChange}
                    placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                    className="bug-reporter-textarea"
                    rows={3}
                  />
                </div>

                {/* Screenshot */}
                <div className="bug-reporter-field">
                  <label className="bug-reporter-label">
                    Screenshot (optional)
                  </label>
                  
                  {screenshot ? (
                    <div className="bug-reporter-screenshot-preview">
                      <img 
                        src={screenshot} 
                        alt="Screenshot preview" 
                        className="bug-reporter-screenshot-img"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveScreenshot}
                        className="bug-reporter-screenshot-remove"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="bug-reporter-screenshot-upload">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotChange}
                        className="bug-reporter-file-input"
                        id="bug-screenshot"
                      />
                      <label 
                        htmlFor="bug-screenshot" 
                        className="bug-reporter-file-label"
                      >
                        📷 Click to attach screenshot
                      </label>
                    </div>
                  )}
                </div>

                {/* Context Info */}
                <div className="bug-reporter-context">
                  <span className="bug-reporter-context-item">
                    📍 {location.pathname}
                  </span>
                  <span className="bug-reporter-context-item">
                    🖥️ {getViewportInfo()}
                  </span>
                  <span className="bug-reporter-context-item">
                    🎨 {theme}
                  </span>
                </div>

                {/* Actions */}
                <div className="bug-reporter-actions">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="bug-reporter-btn bug-reporter-btn-cancel"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bug-reporter-btn bug-reporter-btn-submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit Bug'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default BugReporterButton;
