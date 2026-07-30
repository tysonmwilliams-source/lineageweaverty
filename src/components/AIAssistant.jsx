// src/components/AIAssistant.jsx

/**
 * AI Assistant Component
 *
 * Enhanced chat-style UI for interacting with the Gemini AI counselor.
 *
 * NEW FEATURES:
 * - Full data context awareness
 * - Analysis quick actions (issues, relationships, heraldry, dates)
 * - Proposal generation and approval UI
 * - Permission-gated editing with user approval
 *
 * Styled with medieval manuscript theming.
 */

import { useState, useRef, useEffect, useContext } from 'react';
import {
  askGemini,
  askGeminiWithFullContext,
  requestAnalysis,
  getDataSummary
} from '../services/aiAssistantService';
import { executeProposal, createExecutionContext } from '../services/aiProposalExecutor';
import { useAuth } from '../contexts/AuthContext';
import { useDataset } from '../contexts/DatasetContext';
import { AIProposalList } from './AIProposalCard';
import GenealogyContext from '../contexts/GenealogyContext';
import './AIAssistant.css';
import { logger } from '../utils/logger';

export default function AIAssistant({ context = {}, onClose }) {
  const genealogyContext = useContext(GenealogyContext);
  const { user } = useAuth();
  const { activeDataset } = useDataset();
  // AIAssistant is mounted globally from Navigation, so without this it read
  // and wrote the default world regardless of which one was open.
  const datasetId = activeDataset?.id || 'default';

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Greetings! I am your AI counselor for matters of lineage and lore. I have full access to your LineageWeaver data and can analyze it for issues or suggest improvements. How may I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Enhanced state for proposals and analysis
  const [proposals, setProposals] = useState([]);
  const [executingIds, setExecutingIds] = useState([]);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [useFullContext, setUseFullContext] = useState(true);
  const [dataSummary, setDataSummary] = useState(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, proposals]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load data summary on mount
  useEffect(() => {
    loadDataSummary();
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const loadDataSummary = async () => {
    try {
      const summary = await getDataSummary(datasetId);
      setDataSummary(summary);
    } catch (err) {
      logger.warn('Could not load data summary:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      let response;

      if (useFullContext) {
        // Use enhanced AI with full data context
        response = await askGeminiWithFullContext(currentInput, {
          includeAnalysis: analysisMode,
          enableProposals: true,
          additionalContext: context,
          datasetId
        });

        // Handle text response
        const assistantMessage = {
          role: 'assistant',
          content: response.text,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Handle proposals if any
        if (response.proposals && response.proposals.length > 0) {
          setProposals(prev => [...prev, ...response.proposals]);
        }
      } else {
        // Use basic AI without full context
        const text = await askGemini(currentInput, context);
        const assistantMessage = {
          role: 'assistant',
          content: text,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }

    } catch (err) {
      setError(err.message);

      const errorMessage = {
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${err.message}. Please try again.`,
        timestamp: new Date(),
        isError: true
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickAction = (prompt) => {
    setInput(prompt);
    inputRef.current?.focus();
  };

  // Analysis quick actions
  const handleAnalysis = async (analysisType) => {
    setIsLoading(true);
    setError(null);
    setAnalysisMode(true);

    const analysisMessages = {
      full: 'Analyze my entire dataset for issues',
      relationships: 'Find missing family relationships',
      heraldry: 'Audit heraldry assignments',
      titles: 'Check dignities and titles',
      dates: 'Find date inconsistencies'
    };

    const userMessage = {
      role: 'user',
      content: analysisMessages[analysisType] || 'Analyze my data',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await requestAnalysis(analysisType, null, {
        additionalContext: context
      });

      const assistantMessage = {
        role: 'assistant',
        content: response.text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Handle proposals
      if (response.proposals && response.proposals.length > 0) {
        setProposals(prev => [...prev, ...response.proposals]);
      }

    } catch (err) {
      setError(err.message);
      const errorMessage = {
        role: 'assistant',
        content: `Analysis failed: ${err.message}`,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setAnalysisMode(false);
    }
  };

  // Proposal handling
  const handleApproveProposal = async (proposalId) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal || proposal.status !== 'pending') return;

    setExecutingIds(prev => [...prev, proposalId]);

    try {
      // Must be a real execution context — see executeProposal(). Also note the
      // datasetId: this was hardcoded to 'default', so approving a proposal in
      // any other world wrote to the wrong database.
      const ctx = await createExecutionContext({
        genealogyContext,
        datasetId,
        userId: user?.uid
      });
      const result = await executeProposal(proposal, ctx);

      // Update proposal status
      setProposals(prev => prev.map(p =>
        p.id === proposalId
          ? { ...p, status: result.success ? 'executed' : 'failed', error: result.error }
          : p
      ));

      // Add execution message
      const message = {
        role: 'assistant',
        content: result.success
          ? `Successfully executed: ${proposal.preview?.title || 'Change'}`
          : `Failed to execute: ${result.error}`,
        timestamp: new Date(),
        isError: !result.success
      };
      setMessages(prev => [...prev, message]);

      // Refresh data after successful execution
      if (result.success) {
        await loadDataSummary();
        if (genealogyContext?.refreshData) {
          genealogyContext.refreshData();
        }
      }

    } catch (err) {
      setProposals(prev => prev.map(p =>
        p.id === proposalId
          ? { ...p, status: 'failed', error: err.message }
          : p
      ));
    } finally {
      setExecutingIds(prev => prev.filter(id => id !== proposalId));
    }
  };

  const handleRejectProposal = (proposalId) => {
    setProposals(prev => prev.map(p =>
      p.id === proposalId
        ? { ...p, status: 'rejected' }
        : p
    ));
  };

  const handleApproveAll = async () => {
    const pendingProposals = proposals.filter(p => p.status === 'pending');
    for (const proposal of pendingProposals) {
      await handleApproveProposal(proposal.id);
    }
  };

  const handleRejectAll = () => {
    setProposals(prev => prev.map(p =>
      p.status === 'pending' ? { ...p, status: 'rejected' } : p
    ));
  };

  const clearProposals = () => {
    setProposals([]);
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const pendingProposals = proposals.filter(p => p.status === 'pending');

  return (
    <div className="ai-assistant-overlay" onClick={handleOverlayClick}>
      <div className="ai-assistant-panel enhanced">
        {/* Header */}
        <div className="ai-assistant-header">
          <h2>AI Counselor</h2>
          <div className="ai-header-actions">
            {dataSummary && (
              <span className="data-indicator" title="Full data context enabled">
                {dataSummary.statistics?.people?.total || 0} people |{' '}
                {dataSummary.statistics?.houses?.total || 0} houses
              </span>
            )}
            <button
              onClick={onClose}
              className="ai-assistant-close"
              aria-label="Close AI Assistant"
            >
              ×
            </button>
          </div>
        </div>

        {/* Analysis Quick Actions */}
        <div className="ai-assistant-quick-actions analysis-actions">
          <span className="action-label">Analyze:</span>
          <button
            onClick={() => handleAnalysis('full')}
            disabled={isLoading}
            title="Full data analysis"
          >
            All Issues
          </button>
          <button
            onClick={() => handleAnalysis('relationships')}
            disabled={isLoading}
            title="Find missing relationships"
          >
            Relationships
          </button>
          <button
            onClick={() => handleAnalysis('heraldry')}
            disabled={isLoading}
            title="Audit heraldry"
          >
            Heraldry
          </button>
          <button
            onClick={() => handleAnalysis('titles')}
            disabled={isLoading}
            title="Check titles"
          >
            Titles
          </button>
          <button
            onClick={() => handleAnalysis('dates')}
            disabled={isLoading}
            title="Find date inconsistencies"
          >
            Dates
          </button>
        </div>

        {/* Creative Quick Actions */}
        <div className="ai-assistant-quick-actions creative-actions">
          <span className="action-label">Create:</span>
          <button onClick={() => handleQuickAction('Suggest a motto for this house')}>
            Motto
          </button>
          <button onClick={() => handleQuickAction('Generate a backstory for this character')}>
            Backstory
          </button>
          <button onClick={() => handleQuickAction('Describe this heraldry in proper blazon')}>
            Blazon
          </button>
          <button onClick={() => handleQuickAction('Suggest plot complications')}>
            Plot Ideas
          </button>
        </div>

        {/* Messages */}
        <div className="ai-assistant-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`ai-message ai-message-${message.role} ${message.isError ? 'ai-message-error' : ''}`}
            >
              <div className="ai-message-content">
                {message.content}
              </div>
              <div className="ai-message-timestamp">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="ai-message ai-message-assistant ai-message-loading">
              <div className="ai-message-content">
                <span className="ai-loading-dots">
                  {analysisMode ? 'Analyzing data' : 'Contemplating'}
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Proposals Section */}
        {proposals.length > 0 && (
          <div className="ai-proposals-section">
            <div className="proposals-header">
              <span>Proposed Changes</span>
              {pendingProposals.length === 0 && (
                <button
                  className="clear-proposals-btn"
                  onClick={clearProposals}
                  title="Clear all proposals"
                >
                  Clear
                </button>
              )}
            </div>
            <AIProposalList
              proposals={proposals}
              onApprove={handleApproveProposal}
              onReject={handleRejectProposal}
              onApproveAll={handleApproveAll}
              onRejectAll={handleRejectAll}
              executingIds={executingIds}
            />
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="ai-assistant-form">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data, request analysis, or get creative suggestions..."
              disabled={isLoading}
              className="ai-assistant-input"
            />
            <label className="context-toggle" title="Use full data context">
              <input
                type="checkbox"
                checked={useFullContext}
                onChange={(e) => setUseFullContext(e.target.checked)}
              />
              <span className="toggle-label">Full Context</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="ai-assistant-send"
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>

        {/* Error Display */}
        {error && (
          <div className="ai-assistant-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
