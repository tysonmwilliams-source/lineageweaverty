/**
 * AI Proposal Service - Proposal Parsing, Validation, and Diff Generation
 *
 * This service handles AI-generated proposals for data modifications:
 * - Parses proposal JSON blocks from AI responses
 * - Validates proposals against current data
 * - Generates before/after diffs for user review
 * - Manages proposal state (pending, approved, rejected, executed)
 *
 * ALL proposals require explicit user approval before execution.
 */

import { collectFullDataContext } from './aiDataService';
import { logger } from '../utils/logger';

// ==================== PROPOSAL STRUCTURE ====================

/**
 * Proposal types
 * - create: Create a new entity
 * - update: Modify an existing entity
 * - delete: Remove an entity
 * - link: Create a relationship between entities
 */
export const PROPOSAL_TYPES = {
  create: {
    id: 'create',
    name: 'Create',
    description: 'Create a new entity',
    icon: '+',
    color: 'green'
  },
  update: {
    id: 'update',
    name: 'Update',
    description: 'Modify an existing entity',
    icon: '~',
    color: 'blue'
  },
  delete: {
    id: 'delete',
    name: 'Delete',
    description: 'Remove an entity',
    icon: '-',
    color: 'red'
  },
  link: {
    id: 'link',
    name: 'Link',
    description: 'Create a relationship',
    icon: '↔',
    color: 'purple'
  }
};

/**
 * Entity types that can be modified
 */
export const ENTITY_TYPES = {
  person: {
    id: 'person',
    name: 'Person',
    requiredFields: ['firstName', 'lastName'],
    icon: '👤'
  },
  house: {
    id: 'house',
    name: 'House',
    requiredFields: ['houseName'],
    icon: '🏠'
  },
  relationship: {
    id: 'relationship',
    name: 'Relationship',
    requiredFields: ['person1Id', 'person2Id', 'relationshipType'],
    icon: '🔗'
  },
  dignity: {
    id: 'dignity',
    name: 'Dignity',
    requiredFields: ['name'],
    icon: '👑'
  },
  heraldry: {
    id: 'heraldry',
    name: 'Heraldry',
    requiredFields: ['name'],
    icon: '🛡️'
  },
  codex: {
    id: 'codex',
    name: 'Codex Entry',
    requiredFields: ['title', 'type'],
    icon: '📚'
  }
};

/**
 * Proposal status values
 */
export const PROPOSAL_STATUS = {
  pending: { id: 'pending', name: 'Pending Review', color: 'orange' },
  approved: { id: 'approved', name: 'Approved', color: 'green' },
  rejected: { id: 'rejected', name: 'Rejected', color: 'gray' },
  executed: { id: 'executed', name: 'Executed', color: 'blue' },
  failed: { id: 'failed', name: 'Failed', color: 'red' }
};

/**
 * Severity levels for proposals
 */
export const SEVERITY_LEVELS = {
  info: { id: 'info', name: 'Info', color: 'blue', icon: 'ℹ️' },
  warning: { id: 'warning', name: 'Warning', color: 'orange', icon: '⚠️' },
  critical: { id: 'critical', name: 'Critical', color: 'red', icon: '🔴' }
};

// ==================== PROPOSAL PARSING ====================

/**
 * Parse proposals from AI response text
 *
 * @param {string} responseText - Raw AI response
 * @returns {Array} Array of parsed proposal objects
 */
export function parseProposalsFromResponse(responseText) {
  const proposals = [];
  const proposalRegex = /```proposal\n?([\s\S]*?)```/g;
  let match;

  while ((match = proposalRegex.exec(responseText)) !== null) {
    try {
      const proposalJson = match[1].trim();
      const proposal = JSON.parse(proposalJson);

      // Validate and enrich proposal
      const enrichedProposal = enrichProposal(proposal);

      if (enrichedProposal) {
        proposals.push(enrichedProposal);
      }
    } catch (err) {
      logger.warn('Failed to parse proposal block:', err.message);
    }
  }

  return proposals;
}

/**
 * Enrich a proposal with metadata and defaults
 *
 * @param {Object} rawProposal - Parsed proposal JSON
 * @returns {Object|null} Enriched proposal or null if invalid
 */
function enrichProposal(rawProposal) {
  // Validate required fields
  if (!rawProposal.type || !rawProposal.entityType) {
    logger.warn('Proposal missing required fields:', rawProposal);
    return null;
  }

  // Validate type
  if (!PROPOSAL_TYPES[rawProposal.type]) {
    logger.warn('Unknown proposal type:', rawProposal.type);
    return null;
  }

  // Validate entity type
  if (!ENTITY_TYPES[rawProposal.entityType]) {
    logger.warn('Unknown entity type:', rawProposal.entityType);
    return null;
  }

  // For update/delete, entityId is required
  if ((rawProposal.type === 'update' || rawProposal.type === 'delete') && !rawProposal.entityId) {
    logger.warn('Update/delete proposal missing entityId');
    return null;
  }

  // Determine severity
  let severity = 'info';
  if (rawProposal.type === 'delete') {
    severity = 'critical';
  } else if (rawProposal.type === 'update') {
    severity = 'warning';
  }

  return {
    // Core fields
    id: `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: rawProposal.type,
    entityType: rawProposal.entityType,
    entityId: rawProposal.entityId || null,
    data: rawProposal.data || {},

    // Explanation
    reason: rawProposal.reason || 'No reason provided',

    // Preview info
    preview: rawProposal.preview || {
      title: `${PROPOSAL_TYPES[rawProposal.type].name} ${ENTITY_TYPES[rawProposal.entityType].name}`,
      beforeSummary: 'N/A',
      afterSummary: JSON.stringify(rawProposal.data || {}).substring(0, 100)
    },

    // Status
    status: 'pending',
    severity,

    // Metadata
    createdAt: new Date().toISOString(),
    executedAt: null,
    error: null
  };
}

// ==================== PROPOSAL VALIDATION ====================

/**
 * Validate a proposal against current data
 *
 * @param {Object} proposal - The proposal to validate
 * @param {Object} currentData - Current data context
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateProposal(proposal, currentData) {
  const errors = [];
  const warnings = [];

  const { type, entityType, entityId, data } = proposal;

  // Validate based on proposal type
  switch (type) {
    case 'create':
      validateCreateProposal(proposal, currentData, errors, warnings);
      break;

    case 'update':
      validateUpdateProposal(proposal, currentData, errors, warnings);
      break;

    case 'delete':
      validateDeleteProposal(proposal, currentData, errors, warnings);
      break;

    case 'link':
      validateLinkProposal(proposal, currentData, errors, warnings);
      break;

    default:
      errors.push(`Unknown proposal type: ${type}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate a create proposal
 */
function validateCreateProposal(proposal, currentData, errors, warnings) {
  const { entityType, data } = proposal;
  const entityConfig = ENTITY_TYPES[entityType];

  if (!entityConfig) {
    errors.push(`Unknown entity type: ${entityType}`);
    return;
  }

  // Check required fields
  entityConfig.requiredFields.forEach(field => {
    if (!data[field]) {
      errors.push(`Missing required field for ${entityType}: ${field}`);
    }
  });

  // Entity-specific validation
  if (entityType === 'person') {
    // Check if house exists
    if (data.houseId) {
      const house = currentData.lookupMaps?.housesById?.get(data.houseId);
      if (!house) {
        errors.push(`House with ID ${data.houseId} does not exist`);
      }
    }
  }

  if (entityType === 'relationship') {
    // Check if both people exist
    const person1 = currentData.lookupMaps?.peopleById?.get(data.person1Id);
    const person2 = currentData.lookupMaps?.peopleById?.get(data.person2Id);

    if (!person1) {
      errors.push(`Person 1 with ID ${data.person1Id} does not exist`);
    }
    if (!person2) {
      errors.push(`Person 2 with ID ${data.person2Id} does not exist`);
    }

    // Check for duplicate relationship
    const existing = currentData.relationships?.find(r =>
      (r.person1Id === data.person1Id && r.person2Id === data.person2Id && r.relationshipType === data.relationshipType) ||
      (r.person1Id === data.person2Id && r.person2Id === data.person1Id && r.relationshipType === data.relationshipType)
    );

    if (existing) {
      warnings.push('A similar relationship may already exist between these people');
    }
  }
}

/**
 * Validate an update proposal
 */
function validateUpdateProposal(proposal, currentData, errors, warnings) {
  const { entityType, entityId, data } = proposal;

  // Check entity exists
  let entity = null;
  switch (entityType) {
    case 'person':
      entity = currentData.lookupMaps?.peopleById?.get(entityId);
      break;
    case 'house':
      entity = currentData.lookupMaps?.housesById?.get(entityId);
      break;
    case 'dignity':
      entity = currentData.lookupMaps?.dignitiesById?.get(entityId);
      break;
    case 'heraldry':
      entity = currentData.lookupMaps?.heraldryById?.get(entityId);
      break;
    default:
      entity = currentData[entityType + 's']?.find(e => e.id === entityId);
  }

  if (!entity) {
    errors.push(`${entityType} with ID ${entityId} not found`);
    return;
  }

  // Check for empty update
  if (!data || Object.keys(data).length === 0) {
    warnings.push('Update proposal has no changes specified');
  }

  // Entity-specific validation
  if (entityType === 'person' && data.houseId) {
    const house = currentData.lookupMaps?.housesById?.get(data.houseId);
    if (!house) {
      errors.push(`House with ID ${data.houseId} does not exist`);
    }
  }
}

/**
 * Validate a delete proposal
 */
function validateDeleteProposal(proposal, currentData, errors, warnings) {
  const { entityType, entityId } = proposal;

  // Check entity exists
  let entity = null;
  switch (entityType) {
    case 'person':
      entity = currentData.lookupMaps?.peopleById?.get(entityId);
      break;
    case 'house':
      entity = currentData.lookupMaps?.housesById?.get(entityId);
      break;
    default:
      entity = currentData[entityType + 's']?.find(e => e.id === entityId);
  }

  if (!entity) {
    errors.push(`${entityType} with ID ${entityId} not found - may already be deleted`);
    return;
  }

  // Check for cascade impacts
  if (entityType === 'person') {
    // Check for relationships that will be deleted
    const relationships = currentData.relationships?.filter(r =>
      r.person1Id === entityId || r.person2Id === entityId
    );

    if (relationships?.length > 0) {
      warnings.push(`Deleting this person will also delete ${relationships.length} relationship(s)`);
    }

    // Check for codex entry
    if (entity.codexEntryId) {
      warnings.push('This person has a linked Codex entry that may be affected');
    }

    // Check for dignities
    const dignities = currentData.dignities?.filter(d => d.currentHolderId === entityId);
    if (dignities?.length > 0) {
      warnings.push(`This person holds ${dignities.length} dignity/dignities that will become vacant`);
    }
  }

  if (entityType === 'house') {
    // Check for members
    const members = currentData.people?.filter(p => p.houseId === entityId);
    if (members?.length > 0) {
      warnings.push(`This house has ${members.length} member(s) who will become unaffiliated`);
    }

    // Check for cadet branches
    const cadetBranches = currentData.houses?.filter(h => h.parentHouseId === entityId);
    if (cadetBranches?.length > 0) {
      warnings.push(`This house has ${cadetBranches.length} cadet branch(es)`);
    }
  }
}

/**
 * Validate a link proposal
 */
function validateLinkProposal(proposal, currentData, errors, warnings) {
  const { data } = proposal;

  // Links usually create relationships
  if (data.person1Id && data.person2Id) {
    const person1 = currentData.lookupMaps?.peopleById?.get(data.person1Id);
    const person2 = currentData.lookupMaps?.peopleById?.get(data.person2Id);

    if (!person1) {
      errors.push(`Person 1 with ID ${data.person1Id} does not exist`);
    }
    if (!person2) {
      errors.push(`Person 2 with ID ${data.person2Id} does not exist`);
    }

    // Check for circular reference
    if (data.person1Id === data.person2Id) {
      errors.push('Cannot create a relationship between a person and themselves');
    }
  }

  // House-heraldry link
  if (data.houseId && data.heraldryId) {
    const house = currentData.lookupMaps?.housesById?.get(data.houseId);
    const heraldry = currentData.lookupMaps?.heraldryById?.get(data.heraldryId);

    if (!house) {
      errors.push(`House with ID ${data.houseId} does not exist`);
    }
    if (!heraldry) {
      errors.push(`Heraldry with ID ${data.heraldryId} does not exist`);
    }
  }
}

// ==================== DIFF GENERATION ====================

/**
 * Generate a diff showing before/after state for a proposal
 *
 * @param {Object} proposal - The proposal
 * @param {Object} currentData - Current data context
 * @returns {Object} { before, after, changes }
 */
export function generateProposalDiff(proposal, currentData) {
  const { type, entityType, entityId, data } = proposal;

  let before = null;
  let after = null;
  const changes = [];

  switch (type) {
    case 'create':
      before = null;
      after = { ...data, id: '(new)' };
      changes.push({
        field: 'entity',
        action: 'create',
        oldValue: null,
        newValue: formatEntitySummary(entityType, after)
      });
      break;

    case 'update':
      before = getEntityById(entityType, entityId, currentData);
      after = before ? { ...before, ...data } : data;

      if (before) {
        Object.keys(data).forEach(field => {
          if (JSON.stringify(before[field]) !== JSON.stringify(data[field])) {
            changes.push({
              field,
              action: 'update',
              oldValue: before[field],
              newValue: data[field]
            });
          }
        });
      }
      break;

    case 'delete':
      before = getEntityById(entityType, entityId, currentData);
      after = null;
      if (before) {
        changes.push({
          field: 'entity',
          action: 'delete',
          oldValue: formatEntitySummary(entityType, before),
          newValue: null
        });
      }
      break;

    case 'link':
      before = null;
      after = data;
      changes.push({
        field: 'relationship',
        action: 'link',
        oldValue: null,
        newValue: formatLinkSummary(data, currentData)
      });
      break;
  }

  return { before, after, changes };
}

/**
 * Get an entity by type and ID from current data
 */
function getEntityById(entityType, entityId, currentData) {
  switch (entityType) {
    case 'person':
      return currentData.lookupMaps?.peopleById?.get(entityId) || null;
    case 'house':
      return currentData.lookupMaps?.housesById?.get(entityId) || null;
    case 'dignity':
      return currentData.lookupMaps?.dignitiesById?.get(entityId) || null;
    case 'heraldry':
      return currentData.lookupMaps?.heraldryById?.get(entityId) || null;
    case 'codex':
      return currentData.codexEntries?.find(e => e.id === entityId) || null;
    case 'relationship':
      return currentData.relationships?.find(r => r.id === entityId) || null;
    default:
      return null;
  }
}

/**
 * Format a summary of an entity for display
 */
function formatEntitySummary(entityType, entity) {
  if (!entity) return 'N/A';

  switch (entityType) {
    case 'person':
      return `${entity.firstName} ${entity.lastName}`;
    case 'house':
      return `House ${entity.houseName}`;
    case 'dignity':
      return entity.name;
    case 'heraldry':
      return entity.name;
    case 'codex':
      return entity.title;
    case 'relationship':
      return `${entity.relationshipType} between #${entity.person1Id} and #${entity.person2Id}`;
    default:
      return JSON.stringify(entity).substring(0, 50);
  }
}

/**
 * Format a link summary for display
 */
function formatLinkSummary(data, currentData) {
  if (data.person1Id && data.person2Id) {
    const person1 = currentData.lookupMaps?.peopleById?.get(data.person1Id);
    const person2 = currentData.lookupMaps?.peopleById?.get(data.person2Id);
    const name1 = person1 ? `${person1.firstName} ${person1.lastName}` : `#${data.person1Id}`;
    const name2 = person2 ? `${person2.firstName} ${person2.lastName}` : `#${data.person2Id}`;
    return `${data.relationshipType}: ${name1} ↔ ${name2}`;
  }

  if (data.houseId && data.heraldryId) {
    const house = currentData.lookupMaps?.housesById?.get(data.houseId);
    const houseName = house ? house.houseName : `#${data.houseId}`;
    return `Link heraldry #${data.heraldryId} to House ${houseName}`;
  }

  return JSON.stringify(data);
}

// ==================== BATCH OPERATIONS ====================

/**
 * Validate multiple proposals at once
 *
 * @param {Array} proposals - Array of proposals
 * @param {Object} currentData - Current data context
 * @returns {Object} { allValid, results }
 */
export async function validateProposals(proposals, currentData) {
  const results = [];

  for (const proposal of proposals) {
    const result = validateProposal(proposal, currentData);
    results.push({
      proposalId: proposal.id,
      ...result
    });
  }

  return {
    allValid: results.every(r => r.valid),
    results
  };
}

/**
 * Group proposals by entity type for organized display
 *
 * @param {Array} proposals - Array of proposals
 * @returns {Object} Grouped proposals
 */
export function groupProposalsByEntity(proposals) {
  const grouped = {};

  proposals.forEach(proposal => {
    const key = proposal.entityType;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(proposal);
  });

  return grouped;
}

/**
 * Sort proposals by priority (deletes last, creates first)
 *
 * @param {Array} proposals - Array of proposals
 * @returns {Array} Sorted proposals
 */
export function sortProposalsByPriority(proposals) {
  const priorityOrder = { create: 1, link: 2, update: 3, delete: 4 };

  return [...proposals].sort((a, b) => {
    return (priorityOrder[a.type] || 99) - (priorityOrder[b.type] || 99);
  });
}

// ==================== EXPORTS ====================

export default {
  // Constants
  PROPOSAL_TYPES,
  ENTITY_TYPES,
  PROPOSAL_STATUS,
  SEVERITY_LEVELS,

  // Parsing
  parseProposalsFromResponse,

  // Validation
  validateProposal,
  validateProposals,

  // Diff
  generateProposalDiff,

  // Utilities
  groupProposalsByEntity,
  sortProposalsByPriority
};
