/**
 * WritingWizard.jsx - AI-Powered Writing Assistant Panel
 *
 * Provides real-time prose analysis and AI-powered craft coaching.
 * Based on principles from Stephen King, Donald Maass, Ursula K. Le Guin,
 * and other master teachers of fiction craft.
 *
 * Modes:
 * - Prose Polish: Real-time detection of passive voice, adverbs, filter words, etc.
 * - Craft Coach: AI-powered deeper analysis for show/tell, tension, pacing
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import Icon from '../../icons';
import { analyzeProseComplete } from '../../../services/proseAnalysisService';
import './WritingWizard.css';

/**
 * Health indicator badge
 */
function HealthBadge({ health }) {
  const healthConfig = {
    'excellent': { label: 'Excellent', color: 'success' },
    'good': { label: 'Good', color: 'info' },
    'fair': { label: 'Fair', color: 'warning' },
    'needs-work': { label: 'Needs Work', color: 'error' },
    'insufficient': { label: 'Keep Writing', color: 'muted' },
    'none': { label: '-', color: 'muted' }
  };

  const config = healthConfig[health] || healthConfig['none'];

  return (
    <span className={`wizard-health wizard-health--${config.color}`}>
      {config.label}
    </span>
  );
}

/**
 * Stat item display
 */
function StatItem({ label, value, suffix = '', highlight = false }) {
  return (
    <div className={`wizard-stat ${highlight ? 'wizard-stat--highlight' : ''}`}>
      <span className="wizard-stat__value">{value}{suffix}</span>
      <span className="wizard-stat__label">{label}</span>
    </div>
  );
}

/**
 * Issue card component
 */
function IssueCard({ issue, isExpanded, onToggle }) {
  const severityIcons = {
    'warning': 'alert-circle',
    'info': 'info',
    'error': 'x-circle'
  };

  return (
    <div className={`wizard-issue wizard-issue--${issue.severity}`}>
      <button
        className="wizard-issue__header"
        onClick={onToggle}
        type="button"
      >
        <Icon
          name={severityIcons[issue.severity] || 'info'}
          size={16}
          className="wizard-issue__icon"
        />
        <div className="wizard-issue__content">
          <span className="wizard-issue__type">{formatIssueType(issue.type)}</span>
          <span className="wizard-issue__text">"{issue.text}"</span>
        </div>
        <Icon
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          className="wizard-issue__chevron"
        />
      </button>

      {isExpanded && (
        <div className="wizard-issue__details">
          <p className="wizard-issue__message">{issue.message}</p>
          {issue.suggestion && (
            <div className="wizard-issue__suggestion">
              <Icon name="lightbulb" size={14} />
              <span>{issue.suggestion}</span>
            </div>
          )}
          {issue.sentence && (
            <div className="wizard-issue__context">
              <span className="wizard-issue__context-label">Context:</span>
              <span className="wizard-issue__context-text">
                {truncateSentence(issue.sentence, 150)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Issue type filter buttons
 */
function IssueFilters({ filters, activeFilter, onFilterChange, counts }) {
  return (
    <div className="wizard-filters">
      {filters.map(filter => (
        <button
          key={filter.key}
          className={`wizard-filter ${activeFilter === filter.key ? 'wizard-filter--active' : ''}`}
          onClick={() => onFilterChange(filter.key)}
          type="button"
        >
          <span className="wizard-filter__label">{filter.label}</span>
          {counts[filter.key] > 0 && (
            <span className="wizard-filter__count">{counts[filter.key]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Main WritingWizard Component
 */
export default function WritingWizard({
  plainText = '',
  isOpen = true,
  onClose,
  onRunAIAnalysis,
  isAIAnalyzing = false,
  aiAnalysisResult = null
}) {
  const [activeTab, setActiveTab] = useState('polish'); // 'polish' or 'coach'
  const [activeFilter, setActiveFilter] = useState('all');
  const [expandedIssues, setExpandedIssues] = useState(new Set());
  const [lastAnalysis, setLastAnalysis] = useState(null);

  // Run prose analysis
  const analysis = useMemo(() => {
    if (!plainText || plainText.trim().length < 20) {
      return {
        issues: [],
        stats: {
          wordCount: plainText?.split(/\s+/).filter(w => w).length || 0,
          sentenceCount: 0,
          avgSentenceLength: 0,
          passiveVoicePercent: 0,
          adverbDensity: 0,
          issuesByType: {}
        },
        health: 'insufficient'
      };
    }
    return analyzeProseComplete(plainText);
  }, [plainText]);

  // Stamping the analysis time inside the useMemo above was a setState during
  // render — it forced an extra render on every analysis.
  useEffect(() => {
    if (analysis && analysis.health !== 'insufficient') {
      setLastAnalysis(new Date());
    }
  }, [analysis]);

  // Filter definitions
  const filters = [
    { key: 'all', label: 'All' },
    { key: 'passive-voice', label: 'Passive' },
    { key: 'adverb', label: 'Adverbs' },
    { key: 'show-dont-tell', label: 'Show/Tell' },
    { key: 'filter-word', label: 'Filters' },
    { key: 'other', label: 'Other' }
  ];

  // Calculate counts for filters
  const filterCounts = useMemo(() => {
    const counts = { all: analysis.issues.length };
    filters.forEach(f => {
      if (f.key === 'all') return;
      if (f.key === 'other') {
        counts.other = analysis.issues.filter(i =>
          !['passive-voice', 'adverb', 'show-dont-tell', 'filter-word'].includes(i.type)
        ).length;
      } else {
        counts[f.key] = analysis.issues.filter(i => i.type === f.key).length;
      }
    });
    return counts;
  }, [analysis.issues]);

  // Filter issues
  const filteredIssues = useMemo(() => {
    if (activeFilter === 'all') return analysis.issues;
    if (activeFilter === 'other') {
      return analysis.issues.filter(i =>
        !['passive-voice', 'adverb', 'show-dont-tell', 'filter-word'].includes(i.type)
      );
    }
    return analysis.issues.filter(i => i.type === activeFilter);
  }, [analysis.issues, activeFilter]);

  // Toggle issue expansion
  const toggleIssue = useCallback((index) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  if (!isOpen) return null;

  return (
    <div className="writing-wizard">
      {/* Header */}
      <div className="wizard-header">
        <div className="wizard-header__title">
          <Icon name="sparkles" size={18} />
          <h3>Writing Wizard</h3>
        </div>
        <button
          className="wizard-header__close"
          onClick={onClose}
          type="button"
          title="Close"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="wizard-tabs">
        <button
          className={`wizard-tab ${activeTab === 'polish' ? 'wizard-tab--active' : ''}`}
          onClick={() => setActiveTab('polish')}
          type="button"
        >
          <Icon name="feather" size={16} />
          Prose Polish
        </button>
        <button
          className={`wizard-tab ${activeTab === 'coach' ? 'wizard-tab--active' : ''}`}
          onClick={() => setActiveTab('coach')}
          type="button"
        >
          <Icon name="lightbulb" size={16} />
          Craft Coach
        </button>
      </div>

      {/* Content */}
      <div className="wizard-content">
        {activeTab === 'polish' ? (
          <>
            {/* Stats Overview */}
            <div className="wizard-stats">
              <div className="wizard-stats__row">
                <span className="wizard-stats__label">Prose Health:</span>
                <HealthBadge health={analysis.health} />
              </div>
              <div className="wizard-stats__grid">
                <StatItem
                  label="Words"
                  value={analysis.stats.wordCount}
                />
                <StatItem
                  label="Sentences"
                  value={analysis.stats.sentenceCount}
                />
                <StatItem
                  label="Avg Length"
                  value={analysis.stats.avgSentenceLength}
                  suffix=" words"
                />
                <StatItem
                  label="Passive"
                  value={analysis.stats.passiveVoicePercent}
                  suffix="%"
                  highlight={analysis.stats.passiveVoicePercent > 10}
                />
              </div>
            </div>

            {/* Issues */}
            <div className="wizard-issues">
              <div className="wizard-issues__header">
                <span className="wizard-issues__title">
                  Issues ({analysis.issues.length})
                </span>
                {lastAnalysis && (
                  <span className="wizard-issues__time">
                    Updated {formatTime(lastAnalysis)}
                  </span>
                )}
              </div>

              {analysis.issues.length > 0 ? (
                <>
                  <IssueFilters
                    filters={filters}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    counts={filterCounts}
                  />

                  <div className="wizard-issues__list">
                    {filteredIssues.slice(0, 20).map((issue, index) => (
                      <IssueCard
                        key={`${issue.type}-${index}`}
                        issue={issue}
                        isExpanded={expandedIssues.has(index)}
                        onToggle={() => toggleIssue(index)}
                      />
                    ))}
                    {filteredIssues.length > 20 && (
                      <div className="wizard-issues__more">
                        +{filteredIssues.length - 20} more issues
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="wizard-issues__empty">
                  {analysis.health === 'insufficient' ? (
                    <>
                      <Icon name="feather" size={32} />
                      <p>Keep writing!</p>
                      <span>Analysis will appear once you have more text.</span>
                    </>
                  ) : (
                    <>
                      <Icon name="check-circle" size={32} />
                      <p>Looking good!</p>
                      <span>No prose issues detected.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Craft Coach Tab */
          <div className="wizard-coach">
            {aiAnalysisResult ? (
              /* Show AI Analysis Results */
              <div className="wizard-coach__results">
                <div className="wizard-coach__results-header">
                  <h4>
                    <Icon name="sparkles" size={18} />
                    Craft Analysis
                  </h4>
                  <button
                    className="wizard-coach__rerun"
                    onClick={onRunAIAnalysis}
                    disabled={isAIAnalyzing}
                    type="button"
                  >
                    <Icon name="refresh" size={14} />
                    Re-analyze
                  </button>
                </div>
                <div className="wizard-coach__results-content">
                  {aiAnalysisResult.split('\n').map((paragraph, i) => {
                    // Handle markdown-style headers
                    if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                      return (
                        <h5 key={i} className="wizard-coach__section-title">
                          {paragraph.replace(/\*\*/g, '')}
                        </h5>
                      );
                    }
                    if (paragraph.match(/^\d+\.\s+\*\*/)) {
                      const title = paragraph.match(/\*\*([^*]+)\*\*/)?.[1];
                      const content = paragraph.replace(/^\d+\.\s+\*\*[^*]+\*\*:?\s*/, '');
                      return (
                        <div key={i} className="wizard-coach__section">
                          <h5 className="wizard-coach__section-title">{title}</h5>
                          {content && <p>{content}</p>}
                        </div>
                      );
                    }
                    if (paragraph.trim()) {
                      return <p key={i}>{paragraph}</p>;
                    }
                    return null;
                  })}
                </div>
              </div>
            ) : (
              /* Show Intro/Actions */
              <>
                <div className="wizard-coach__intro">
                  <Icon name="sparkles" size={24} />
                  <h4>AI Craft Analysis</h4>
                  <p>
                    Get deeper feedback on your writing craft, including emotional
                    resonance, tension, pacing, and narrative voice.
                  </p>
                </div>

                <div className="wizard-coach__actions">
                  <button
                    className="wizard-coach__btn wizard-coach__btn--primary"
                    onClick={onRunAIAnalysis}
                    disabled={isAIAnalyzing || analysis.stats.wordCount < 50}
                    type="button"
                  >
                    {isAIAnalyzing ? (
                      <>
                        <div className="loader-spinner loader-spinner--small" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Icon name="zap" size={18} />
                        Analyze with AI
                      </>
                    )}
                  </button>

                  {analysis.stats.wordCount < 50 && (
                    <p className="wizard-coach__note">
                      Write at least 50 words for AI analysis.
                    </p>
                  )}
                </div>

                <div className="wizard-coach__features">
                  <h5>What the AI analyzes:</h5>
                  <ul>
                    <li>
                      <Icon name="heart" size={14} />
                      <span>Emotional resonance and reader engagement</span>
                    </li>
                    <li>
                      <Icon name="zap" size={14} />
                      <span>Tension and conflict in scenes</span>
                    </li>
                    <li>
                      <Icon name="clock" size={14} />
                      <span>Pacing and narrative flow</span>
                    </li>
                    <li>
                      <Icon name="user" size={14} />
                      <span>Character voice and authenticity</span>
                    </li>
                    <li>
                      <Icon name="eye" size={14} />
                      <span>Show vs. tell balance</span>
                    </li>
                    <li>
                      <Icon name="book" size={14} />
                      <span>Genre-appropriate style</span>
                    </li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer with attribution */}
      <div className="wizard-footer">
        <span>
          Based on principles from Stephen King, Donald Maass, and Ursula K. Le Guin
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatIssueType(type) {
  const labels = {
    'passive-voice': 'Passive Voice',
    'adverb': 'Adverb',
    'filter-word': 'Filter Word',
    'show-dont-tell': 'Show Don\'t Tell',
    'repetition': 'Repetition',
    'sentence-starts': 'Sentence Starts',
    'sentence-variation': 'Sentence Variation',
    'long-sentence': 'Long Sentence'
  };
  return labels[type] || type;
}

function truncateSentence(sentence, maxLength) {
  if (sentence.length <= maxLength) return sentence;
  return sentence.slice(0, maxLength - 3) + '...';
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;

  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
