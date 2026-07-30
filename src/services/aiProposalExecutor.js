/**
 * AI Proposal Executor - Execute Approved Proposals
 *
 * This service executes AI-generated proposals that have been approved by the user.
 * It routes operations to the appropriate CRUD services based on entity type.
 *
 * SAFETY FEATURES:
 * - All proposals require explicit user approval before execution
 * - Validation is performed before execution
 * - Rollback data is stored for potential undo
 * - Detailed execution logging
 */

import {
  addPerson as dbAddPerson,
  updatePerson as dbUpdatePerson,
  deletePerson as dbDeletePerson,
  addHouse as dbAddHouse,
  updateHouse as dbUpdateHouse,
  deleteHouse as dbDeleteHouse,
  addRelationship as dbAddRelationship,
  updateRelationship as dbUpdateRelationship,
  deleteRelationship as dbDeleteRelationship
} from './database';

import {
  createEntry as createCodexEntry,
  updateEntry as updateCodexEntry,
  deleteEntry as deleteCodexEntry
} from './codexService';

import {
  createHeraldry,
  updateHeraldry,
  deleteHeraldry,
  linkHeraldryToEntity
} from './heraldryService';

import {
  createDignity,
  updateDignity,
  deleteDignity,
  createDignityTenure
} from './dignityService';

import { validateProposal } from './aiProposalService';
import { collectFullDataContext } from './aiDataService';
import { logger } from '../utils/logger';

// ==================== EXECUTION CONTEXT ====================

/**
 * Create execution context with all needed services and data
 *
 * @param {Object} options - Execution options
 * @returns {Object} Execution context
 */
export async function createExecutionContext(options = {}) {
  const {
    datasetId = 'default',
    userId = null,
    genealogyContext = null // For using GenealogyContext's methods when available
  } = options;

  // Collect current data for validation
  const currentData = await collectFullDataContext(datasetId);

  return {
    datasetId,
    userId,
    genealogyContext,
    currentData,
    rollbackStack: []
  };
}

// ==================== MAIN EXECUTOR ====================

/**
 * Execute a single approved proposal
 *
 * @param {Object} proposal - The approved proposal to execute
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
export async function executeProposal(proposal, context) {
  const { type, entityType, entityId, data } = proposal;

  logger.log(`🤖 Executing proposal: ${type} ${entityType}`, { entityId, data });

  // Callers must pass a context built by createExecutionContext(). A bare
  // object used to slip through: validateProposal then read `.lookupMaps` off
  // an undefined currentData and threw *outside* the try below, so update and
  // delete proposals never executed at all — while create proposals wrote to
  // the database and only then threw on the missing rollbackStack, reporting
  // failure for a change that had already landed. Approving again duplicated it.
  if (!context || !context.currentData) {
    return {
      success: false,
      proposal,
      error: 'Execution context missing. Build one with createExecutionContext() before calling executeProposal().'
    };
  }
  if (!Array.isArray(context.rollbackStack)) {
    context.rollbackStack = [];
  }

  let rollbackData;
  // `validation` is declared out here because the success and failure returns
  // below both read `validation.warnings`. Declaring it with `const` inside the
  // try block made both of those a ReferenceError — including the success path.
  let validation;
  try {
    // Validation and rollback capture belong inside the try — a throw from
    // either used to escape to the caller instead of being reported.
    validation = validateProposal(proposal, context.currentData);
    if (!validation.valid) {
      return {
        success: false,
        proposal,
        error: `Validation failed: ${validation.errors.join(', ')}`,
        warnings: validation.warnings
      };
    }

    rollbackData = await captureRollbackData(proposal, context);
  } catch (error) {
    logger.error('❌ Proposal validation failed:', error);
    return {
      success: false,
      proposal,
      error: `Validation error: ${error.message}`
    };
  }

  try {
    let result;

    switch (entityType) {
      case 'person':
        result = await executePersonProposal(proposal, context);
        break;

      case 'house':
        result = await executeHouseProposal(proposal, context);
        break;

      case 'relationship':
        result = await executeRelationshipProposal(proposal, context);
        break;

      case 'dignity':
        result = await executeDignityProposal(proposal, context);
        break;

      case 'heraldry':
        result = await executeHeraldryProposal(proposal, context);
        break;

      case 'codex':
        result = await executeCodexProposal(proposal, context);
        break;

      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    // Store rollback data on success
    context.rollbackStack.push(rollbackData);

    logger.log(`✅ Proposal executed successfully:`, result);

    return {
      success: true,
      proposal: { ...proposal, status: 'executed', executedAt: new Date().toISOString() },
      result,
      warnings: validation.warnings,
      rollbackData
    };

  } catch (error) {
    logger.error(`❌ Proposal execution failed:`, error);

    return {
      success: false,
      proposal: { ...proposal, status: 'failed', error: error.message },
      error: error.message,
      warnings: validation.warnings
    };
  }
}

/**
 * Execute multiple proposals in order
 *
 * @param {Array} proposals - Array of approved proposals
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Batch execution result
 */
export async function executeProposals(proposals, options = {}) {
  const context = await createExecutionContext(options);
  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const proposal of proposals) {
    const result = await executeProposal(proposal, context);
    results.push(result);

    if (result.success) {
      successCount++;
      // Refresh data context for next proposal
      context.currentData = await collectFullDataContext(context.datasetId);
    } else {
      failCount++;
      // Optionally stop on first failure
      if (options.stopOnError) {
        break;
      }
    }
  }

  return {
    success: failCount === 0,
    results,
    summary: {
      total: proposals.length,
      succeeded: successCount,
      failed: failCount
    },
    rollbackStack: context.rollbackStack
  };
}

// ==================== ENTITY-SPECIFIC EXECUTORS ====================

/**
 * Execute a person-related proposal
 */
async function executePersonProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId, genealogyContext } = context;

  switch (type) {
    case 'create':
      if (genealogyContext?.addPerson) {
        return await genealogyContext.addPerson(data);
      }
      return await dbAddPerson(data, datasetId);

    case 'update':
      if (genealogyContext?.updatePerson) {
        await genealogyContext.updatePerson(entityId, data);
        return entityId;
      }
      await dbUpdatePerson(entityId, data, datasetId);
      return entityId;

    case 'delete':
      if (genealogyContext?.deletePerson) {
        await genealogyContext.deletePerson(entityId);
        return entityId;
      }
      await dbDeletePerson(entityId, datasetId);
      return entityId;

    default:
      throw new Error(`Unknown operation type for person: ${type}`);
  }
}

/**
 * Execute a house-related proposal
 */
async function executeHouseProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId, genealogyContext } = context;

  switch (type) {
    case 'create':
      if (genealogyContext?.addHouse) {
        return await genealogyContext.addHouse(data);
      }
      return await dbAddHouse(data, { datasetId });

    case 'update':
      if (genealogyContext?.updateHouse) {
        await genealogyContext.updateHouse(entityId, data);
        return entityId;
      }
      await dbUpdateHouse(entityId, data, datasetId);
      return entityId;

    case 'delete':
      if (genealogyContext?.deleteHouse) {
        await genealogyContext.deleteHouse(entityId);
        return entityId;
      }
      await dbDeleteHouse(entityId, { datasetId });
      return entityId;

    default:
      throw new Error(`Unknown operation type for house: ${type}`);
  }
}

/**
 * Execute a relationship-related proposal
 */
async function executeRelationshipProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId, genealogyContext } = context;

  switch (type) {
    case 'create':
    case 'link':
      if (genealogyContext?.addRelationship) {
        return await genealogyContext.addRelationship(data);
      }
      return await dbAddRelationship(data, datasetId);

    case 'update':
      if (genealogyContext?.updateRelationship) {
        await genealogyContext.updateRelationship(entityId, data);
        return entityId;
      }
      await dbUpdateRelationship(entityId, data, datasetId);
      return entityId;

    case 'delete':
      if (genealogyContext?.deleteRelationship) {
        await genealogyContext.deleteRelationship(entityId);
        return entityId;
      }
      await dbDeleteRelationship(entityId, datasetId);
      return entityId;

    default:
      throw new Error(`Unknown operation type for relationship: ${type}`);
  }
}

/**
 * Execute a dignity-related proposal
 */
async function executeDignityProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId, userId } = context;

  switch (type) {
    case 'create':
      return await createDignity(data, userId, datasetId);

    case 'update':
      await updateDignity(entityId, data, userId, datasetId);
      return entityId;

    case 'delete':
      await deleteDignity(entityId, userId, datasetId);
      return entityId;

    case 'link':
      // Link typically assigns a dignity to a person
      if (data.personId && data.dignityId) {
        // Update the dignity's currentHolderId
        await updateDignity(data.dignityId, {
          currentHolderId: data.personId,
          isVacant: false
        }, userId, datasetId);

        // Create a tenure record
        if (data.createTenure !== false) {
          await createDignityTenure({
            dignityId: data.dignityId,
            personId: data.personId,
            dateStarted: data.dateStarted || null,
            acquisitionType: data.acquisitionType || 'grant'
          }, userId, datasetId);
        }

        return data.dignityId;
      }
      throw new Error('Link proposal for dignity requires personId and dignityId');

    default:
      throw new Error(`Unknown operation type for dignity: ${type}`);
  }
}

/**
 * Execute a heraldry-related proposal
 */
async function executeHeraldryProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId, userId } = context;

  switch (type) {
    case 'create':
      return await createHeraldry(data, userId, datasetId);

    case 'update':
      await updateHeraldry(entityId, data, userId, datasetId);
      return entityId;

    case 'delete':
      await deleteHeraldry(entityId, userId, datasetId);
      return entityId;

    case 'link':
      // Link heraldry to an entity
      if (data.heraldryId && data.entityType && data.entityId) {
        return await linkHeraldryToEntity({
          heraldryId: data.heraldryId,
          entityType: data.entityType,
          entityId: data.entityId,
          linkType: data.linkType || 'primary'
        }, userId, datasetId);
      }
      throw new Error('Link proposal for heraldry requires heraldryId, entityType, and entityId');

    default:
      throw new Error(`Unknown operation type for heraldry: ${type}`);
  }
}

/**
 * Execute a codex-related proposal
 */
async function executeCodexProposal(proposal, context) {
  const { type, entityId, data } = proposal;
  const { datasetId } = context;

  switch (type) {
    case 'create':
      return await createCodexEntry(data, datasetId);

    case 'update':
      await updateCodexEntry(entityId, data, datasetId);
      return entityId;

    case 'delete':
      await deleteCodexEntry(entityId, datasetId);
      return entityId;

    default:
      throw new Error(`Unknown operation type for codex: ${type}`);
  }
}

// ==================== ROLLBACK SUPPORT ====================

/**
 * Capture data needed for rollback before executing a proposal
 */
async function captureRollbackData(proposal, context) {
  const { type, entityType, entityId } = proposal;

  const rollback = {
    proposalId: proposal.id,
    type,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    originalData: null
  };

  // For updates and deletes, capture the original state
  if (type === 'update' || type === 'delete') {
    const { currentData } = context;

    switch (entityType) {
      case 'person':
        rollback.originalData = currentData.lookupMaps?.peopleById?.get(entityId);
        break;
      case 'house':
        rollback.originalData = currentData.lookupMaps?.housesById?.get(entityId);
        break;
      case 'dignity':
        rollback.originalData = currentData.lookupMaps?.dignitiesById?.get(entityId);
        break;
      case 'heraldry':
        rollback.originalData = currentData.lookupMaps?.heraldryById?.get(entityId);
        break;
      case 'codex':
        rollback.originalData = currentData.codexEntries?.find(e => e.id === entityId);
        break;
      case 'relationship':
        rollback.originalData = currentData.relationships?.find(r => r.id === entityId);
        break;
    }
  }

  return rollback;
}

/**
 * Execute a rollback (undo a previously executed proposal)
 *
 * @param {Object} rollbackData - Rollback data from execution
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Rollback result
 */
export async function executeRollback(rollbackData, options = {}) {
  const context = await createExecutionContext(options);
  const { type, entityType, entityId, originalData } = rollbackData;

  logger.log(`🔄 Rolling back: ${type} ${entityType}`, { entityId });

  try {
    switch (type) {
      case 'create':
        // Undo create = delete
        await executeProposal({
          type: 'delete',
          entityType,
          entityId: rollbackData.createdId || entityId,
          data: {}
        }, context);
        break;

      case 'update':
        // Undo update = restore original data
        if (originalData) {
          await executeProposal({
            type: 'update',
            entityType,
            entityId,
            data: originalData
          }, context);
        }
        break;

      case 'delete':
        // Undo delete = recreate with original data
        if (originalData) {
          await executeProposal({
            type: 'create',
            entityType,
            entityId: null,
            data: originalData
          }, context);
        }
        break;

      case 'link':
        // Undo link = unlink (delete relationship or remove reference)
        // This is more complex and depends on the link type
        logger.warn('Link rollback not fully implemented');
        break;
    }

    return { success: true, rollbackData };

  } catch (error) {
    logger.error('❌ Rollback failed:', error);
    return { success: false, error: error.message, rollbackData };
  }
}

// ==================== EXPORTS ====================

export default {
  executeProposal,
  executeProposals,
  executeRollback,
  createExecutionContext
};
