/**
 * Household Role Service - Lineageweaver
 *
 * CRUD operations for household roles (non-hereditary service positions).
 * These are service roles tied to a house like Master-at-Arms, Steward, etc.
 *
 * Every function takes an optional `datasetId`. Previously this module imported
 * the default-dataset `db` singleton directly, so roles created in one world
 * were written into another. Mutations also take an optional `userId`; when
 * present the change is mirrored to the cloud via dataSyncService.
 *
 * @module householdRoleService
 */

import { getDatabase } from './database';
import { HOUSEHOLD_ROLE_TYPES, getRoleType } from '../data/householdRoleTypes';
import {
  syncAddHouseholdRole,
  syncUpdateHouseholdRole,
  syncDeleteHouseholdRole
} from './dataSyncService';
import { logger } from '../utils/logger';

// ==================== CRUD OPERATIONS ====================

/**
 * Create a new household role
 *
 * @param {Object} roleData - Role data
 * @param {number} roleData.houseId - House this role belongs to
 * @param {string} roleData.roleType - Role type from HOUSEHOLD_ROLE_TYPES
 * @param {string} [roleData.customRoleName] - Custom name if roleType is 'custom'
 * @param {number} [roleData.currentHolderId] - Person currently in role
 * @param {string} [roleData.startDate] - When current holder started
 * @param {string} [roleData.notes] - Additional notes
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} New role ID
 */
export async function createHouseholdRole(roleData, userId = null, datasetId = null) {
  const db = getDatabase(datasetId);
  const now = new Date().toISOString();

  const role = {
    houseId: roleData.houseId,
    roleType: roleData.roleType,
    customRoleName: roleData.customRoleName || null,
    currentHolderId: roleData.currentHolderId || null,
    startDate: roleData.startDate || null,
    notes: roleData.notes || null,
    created: now,
    updated: now
  };

  try {
    const id = await db.householdRoles.add(role);
    if (import.meta.env.DEV) {
      logger.log('Household role created:', id);
    }

    if (userId) {
      await syncAddHouseholdRole(userId, datasetId, id, { ...role, id });
    }

    return id;
  } catch (error) {
    logger.error('Error creating household role:', error);
    throw error;
  }
}

/**
 * Get a household role by ID
 *
 * @param {number} id - Role ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object|undefined>} Role object or undefined
 */
export async function getHouseholdRole(id, datasetId = null) {
  try {
    return await getDatabase(datasetId).householdRoles.get(id);
  } catch (error) {
    logger.error('Error getting household role:', error);
    throw error;
  }
}

/**
 * Get all household roles
 *
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object[]>} Array of all roles
 */
export async function getAllHouseholdRoles(datasetId = null) {
  try {
    return await getDatabase(datasetId).householdRoles.toArray();
  } catch (error) {
    logger.error('Error getting all household roles:', error);
    throw error;
  }
}

/**
 * Get all roles for a specific house
 *
 * @param {number} houseId - House ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object[]>} Array of roles for the house
 */
export async function getRolesForHouse(houseId, datasetId = null) {
  try {
    const roles = await getDatabase(datasetId).householdRoles
      .where('houseId')
      .equals(houseId)
      .toArray();

    // Sort by role type order
    return roles.sort((a, b) => {
      const typeA = getRoleType(a.roleType);
      const typeB = getRoleType(b.roleType);
      return (typeA?.order || 99) - (typeB?.order || 99);
    });
  } catch (error) {
    logger.error('Error getting roles for house:', error);
    throw error;
  }
}

/**
 * Get all roles held by a specific person
 *
 * @param {number} personId - Person ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object[]>} Array of roles held by the person
 */
export async function getRolesForPerson(personId, datasetId = null) {
  try {
    return await getDatabase(datasetId).householdRoles
      .where('currentHolderId')
      .equals(personId)
      .toArray();
  } catch (error) {
    logger.error('Error getting roles for person:', error);
    throw error;
  }
}

/**
 * Update a household role
 *
 * @param {number} id - Role ID
 * @param {Object} updates - Fields to update
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of records updated (1 if successful)
 */
export async function updateHouseholdRole(id, updates, userId = null, datasetId = null) {
  try {
    const updateData = {
      ...updates,
      updated: new Date().toISOString()
    };

    const count = await getDatabase(datasetId).householdRoles.update(id, updateData);
    if (import.meta.env.DEV) {
      logger.log('Household role updated:', id);
    }

    if (userId) {
      await syncUpdateHouseholdRole(userId, datasetId, id, updateData);
    }

    return count;
  } catch (error) {
    logger.error('Error updating household role:', error);
    throw error;
  }
}

/**
 * Delete a household role
 *
 * @param {number} id - Role ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<void>}
 */
export async function deleteHouseholdRole(id, userId = null, datasetId = null) {
  try {
    await getDatabase(datasetId).householdRoles.delete(id);
    if (import.meta.env.DEV) {
      logger.log('Household role deleted:', id);
    }

    if (userId) {
      await syncDeleteHouseholdRole(userId, datasetId, id);
    }
  } catch (error) {
    logger.error('Error deleting household role:', error);
    throw error;
  }
}

/**
 * Assign a person to a household role
 *
 * @param {number} roleId - Role ID
 * @param {number} personId - Person to assign
 * @param {string} [startDate] - When they started (defaults to now)
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of records updated
 */
export async function assignRoleHolder(roleId, personId, startDate = null, userId = null, datasetId = null) {
  return updateHouseholdRole(roleId, {
    currentHolderId: personId,
    startDate: startDate || new Date().toISOString().split('T')[0]
  }, userId, datasetId);
}

/**
 * Remove the current holder from a role (make it vacant)
 *
 * @param {number} roleId - Role ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of records updated
 */
export async function vacateRole(roleId, userId = null, datasetId = null) {
  return updateHouseholdRole(roleId, {
    currentHolderId: null,
    startDate: null
  }, userId, datasetId);
}

// ==================== QUERY HELPERS ====================

/**
 * Get filled roles for a house (roles with current holders)
 *
 * @param {number} houseId - House ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object[]>} Array of filled roles
 */
export async function getFilledRolesForHouse(houseId, datasetId = null) {
  const roles = await getRolesForHouse(houseId, datasetId);
  return roles.filter(r => r.currentHolderId !== null);
}

/**
 * Get vacant roles for a house (roles without current holders)
 *
 * @param {number} houseId - House ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object[]>} Array of vacant roles
 */
export async function getVacantRolesForHouse(houseId, datasetId = null) {
  const roles = await getRolesForHouse(houseId, datasetId);
  return roles.filter(r => r.currentHolderId === null);
}

/**
 * Check if a house has a specific role type
 *
 * @param {number} houseId - House ID
 * @param {string} roleType - Role type ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<boolean>} True if house has this role type
 */
export async function houseHasRoleType(houseId, roleType, datasetId = null) {
  const roles = await getRolesForHouse(houseId, datasetId);
  return roles.some(r => r.roleType === roleType);
}

/**
 * Get role statistics for a house
 *
 * @param {number} houseId - House ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Statistics object
 */
export async function getRoleStatsForHouse(houseId, datasetId = null) {
  const roles = await getRolesForHouse(houseId, datasetId);

  const filled = roles.filter(r => r.currentHolderId !== null);
  const vacant = roles.filter(r => r.currentHolderId === null);

  // Group by category
  const byCategory = {};
  for (const role of roles) {
    const roleType = getRoleType(role.roleType);
    const category = roleType?.category || 'other';
    if (!byCategory[category]) {
      byCategory[category] = { total: 0, filled: 0 };
    }
    byCategory[category].total++;
    if (role.currentHolderId !== null) {
      byCategory[category].filled++;
    }
  }

  return {
    total: roles.length,
    filled: filled.length,
    vacant: vacant.length,
    byCategory
  };
}

// ==================== BULK OPERATIONS ====================

/**
 * Delete all roles for a house
 *
 * @param {number} houseId - House ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of roles deleted
 */
export async function deleteRolesForHouse(houseId, userId = null, datasetId = null) {
  try {
    const roles = await getRolesForHouse(houseId, datasetId);
    for (const role of roles) {
      await deleteHouseholdRole(role.id, userId, datasetId);
    }
    if (import.meta.env.DEV) {
      logger.log(`Deleted ${roles.length} roles for house ${houseId}`);
    }
    return roles.length;
  } catch (error) {
    logger.error('Error deleting roles for house:', error);
    throw error;
  }
}

/**
 * Clear holder from all roles (when person is deleted)
 *
 * @param {number} personId - Person ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of roles updated
 */
export async function clearHolderFromAllRoles(personId, userId = null, datasetId = null) {
  try {
    const roles = await getRolesForPerson(personId, datasetId);
    let count = 0;

    for (const role of roles) {
      await vacateRole(role.id, userId, datasetId);
      count++;
    }

    if (import.meta.env.DEV) {
      logger.log(`Cleared ${count} roles for person ${personId}`);
    }
    return count;
  } catch (error) {
    logger.error('Error clearing holder from roles:', error);
    throw error;
  }
}

// ==================== EXPORTS ====================

export {
  HOUSEHOLD_ROLE_TYPES
};

export default {
  createHouseholdRole,
  getHouseholdRole,
  getAllHouseholdRoles,
  getRolesForHouse,
  getRolesForPerson,
  updateHouseholdRole,
  deleteHouseholdRole,
  assignRoleHolder,
  vacateRole,
  getFilledRolesForHouse,
  getVacantRolesForHouse,
  houseHasRoleType,
  getRoleStatsForHouse,
  deleteRolesForHouse,
  clearHolderFromAllRoles
};
