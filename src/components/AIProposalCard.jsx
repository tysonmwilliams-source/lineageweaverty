/**
 * AIProposalCard Component
 *
 * Displays an individual AI-generated proposal for user approval.
 * Features:
 * - Before/after diff display
 * - Affected entities list
 * - Severity indicator
 * - Approve/Reject buttons
 * - Expandable details
 */

import { useState } from 'react';
import {
  PROPOSAL_TYPES,
  ENTITY_TYPES,
  SEVERITY_LEVELS
} from '../services/aiProposalService';
import './AIProposalCard.css';
import Icon from './icons';

export default function AIProposalCard({
  proposal,
  onApprove,
  onReject,
  isExecuting = false,
  showDetails = false
}) {
  const [expanded, setExpanded] = useState(showDetails);

  if (!proposal) return null;

  const {
    id,
    type,
    entityType,
    entityId,
    data,
    reason,
    preview,
    status,
    severity = 'info'
  } = proposal;

  const proposalType = PROPOSAL_TYPES[type] || PROPOSAL_TYPES.update;
  const entityConfig = ENTITY_TYPES[entityType] || ENTITY_TYPES.person;
  const severityConfig = SEVERITY_LEVELS[severity] || SEVERITY_LEVELS.info;

  const isActionable = status === 'pending';
  const isCompleted = status === 'executed' || status === 'approved';
  const isFailed = status === 'failed';
  const isRejected = status === 'rejected';

  // Format field values for display
  const formatValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Get status indicator
  const getStatusBadge = () => {
    if (isExecuting) {
      return <span className="proposal-status executing">Executing...</span>;
    }
    if (isCompleted) {
      return <span className="proposal-status completed">Executed</span>;
    }
    if (isFailed) {
      return <span className="proposal-status failed">Failed</span>;
    }
    if (isRejected) {
      return <span className="proposal-status rejected">Rejected</span>;
    }
    return null;
  };

  return (
    <div
      className={`ai-proposal-card severity-${severity} status-${status}`}
      data-proposal-id={id}
    >
      {/* Header */}
      <div className="proposal-header" onClick={() => setExpanded(!expanded)}>
        <div className="proposal-type-badge" style={{ backgroundColor: proposalType.color }}>
          <span className="proposal-type-icon">{proposalType.icon}</span>
          <span className="proposal-type-name">{proposalType.name}</span>
        </div>

        <div className="proposal-title">
          <span className="entity-icon">{entityConfig.icon}</span>
          <span className="proposal-action">
            {preview?.title || `${proposalType.name} ${entityConfig.name}`}
          </span>
          {entityId && (
            <span className="entity-id">#{entityId}</span>
          )}
        </div>

        <div className="proposal-meta">
          <span className={`severity-badge ${severity}`} title={severityConfig.name}>
            {severityConfig.icon}
          </span>
          {getStatusBadge()}
          <button
            className="expand-toggle"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <Icon name="chevron-up" size={14} /> : <Icon name="chevron-down" size={14} />}
          </button>
        </div>
      </div>

      {/* Reason */}
      <div className="proposal-reason">
        {reason}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="proposal-details">
          {/* Before/After Preview */}
          {preview && (
            <div className="proposal-preview">
              {type !== 'create' && preview.beforeSummary && (
                <div className="preview-before">
                  <span className="preview-label">Before:</span>
                  <span className="preview-value">{preview.beforeSummary}</span>
                </div>
              )}
              {type !== 'delete' && preview.afterSummary && (
                <div className="preview-after">
                  <span className="preview-label">After:</span>
                  <span className="preview-value">{preview.afterSummary}</span>
                </div>
              )}
            </div>
          )}

          {/* Data Changes */}
          {data && Object.keys(data).length > 0 && (
            <div className="proposal-data">
              <div className="data-label">Fields:</div>
              <div className="data-fields">
                {Object.entries(data).map(([field, value]) => (
                  <div key={field} className="data-field">
                    <span className="field-name">{field}:</span>
                    <span className="field-value">{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Delete Warning */}
          {type === 'delete' && (
            <div className="delete-warning">
              <span className="warning-icon"><Icon name="alert-triangle" /></span>
              <span className="warning-text">
                This action will permanently delete this {entityConfig.name.toLowerCase()}.
                Related data may also be affected.
              </span>
            </div>
          )}

          {/* Error Message */}
          {proposal.error && (
            <div className="proposal-error">
              <span className="error-icon"><Icon name="x-circle" /></span>
              <span className="error-text">{proposal.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {isActionable && (
        <div className="proposal-actions">
          <button
            className="proposal-btn approve"
            onClick={() => onApprove && onApprove(id)}
            disabled={isExecuting}
            title="Approve and execute this change"
          >
            <Icon name="check" size={14} /> Approve
          </button>
          <button
            className="proposal-btn reject"
            onClick={() => onReject && onReject(id)}
            disabled={isExecuting}
            title="Reject this change"
          >
            <Icon name="x" size={14} /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * AIProposalList Component
 *
 * Displays a list of proposals with batch actions
 */
export function AIProposalList({
  proposals = [],
  onApprove,
  onReject,
  onApproveAll,
  onRejectAll,
  executingIds = []
}) {
  if (!proposals || proposals.length === 0) {
    return null;
  }

  const pendingCount = proposals.filter(p => p.status === 'pending').length;
  const hasPending = pendingCount > 0;

  return (
    <div className="ai-proposal-list">
      {/* List Header */}
      <div className="proposal-list-header">
        <h3>
          Proposed Changes
          <span className="proposal-count">{proposals.length}</span>
        </h3>

        {hasPending && pendingCount > 1 && (
          <div className="batch-actions">
            <button
              className="batch-btn approve-all"
              onClick={onApproveAll}
              title="Approve all pending proposals"
            >
              <Icon name="check" size={14} /> Approve All ({pendingCount})
            </button>
            <button
              className="batch-btn reject-all"
              onClick={onRejectAll}
              title="Reject all pending proposals"
            >
              <Icon name="x" size={14} /> Reject All
            </button>
          </div>
        )}
      </div>

      {/* Proposals */}
      <div className="proposal-cards">
        {proposals.map(proposal => (
          <AIProposalCard
            key={proposal.id}
            proposal={proposal}
            onApprove={onApprove}
            onReject={onReject}
            isExecuting={executingIds.includes(proposal.id)}
          />
        ))}
      </div>
    </div>
  );
}
