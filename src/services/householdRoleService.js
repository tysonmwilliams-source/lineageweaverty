/**
 * Household Role Service - Lineageweaver
 *
 * CRUD operations for household roles (non-hereditary service positions).
 * These are service roles tied to a house like Master-at-Arms, Steward, etc.
 *
 * @module householdRoleService
 */

import { db } from './database';
import { HOUSEHOLD_ROLE_TYPES, getRoleType } from '../data/householdRoleTypes';

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
 * @returns {Promise<number>} New role ID
 */
export async function createHouseholdRole(roleData) {
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
      console.log('Household role created:', id);
    }
    return id;
  } catch (error) {
    console.error('Error creating household role:', error);
    throw error;
  }
}

/**
 * Get a household role by ID
 *
 * @param {number} id - Role ID
 * @returns {Promise<Object|undefined>} Role object or undefined
 */
export async function getHouseholdRole(id) {
  try {
    return await db.householdRoles.get(id);
  } catch (error) {
    console.error('Error getting household role:', error);
    throw error;
  }
}

/**
 * Get all household roles
 *
 * @returns {Promise<Object[]>} Array of all roles
 */
export async function getAllHouseholdRoles() {
  try {
    return await db.householdRoles.toArray();
  } catch (error) {
    console.error('Error getting all household roles:', error);
    throw error;
  }
}

/**
 * Get all roles for a specific house
 *
 * @param {number} houseId - House ID
 * @returns {Promise<Object[]>} Array of roles for the house
 */
export async function getRolesForHouse(houseId) {
  try {
    const roles = await db.householdRoles
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
    console.error('Error getting roles for house:', error);
    throw error;
  }
}

/**
 * Get all roles held by a specific person
 *
 * @param {number} personId - Person ID
 * @returns {Promise<Object[]>} Array of roles held by the person
 */
export async function getRolesForPerson(personId) {
  try {
    return await db.householdRoles
      .where('currentHolderId')
      .equals(personId)
      .toArray();
  } catch (error) {
    console.error('Error getting roles for person:', error);
    throw error;
  }
}

/**
 * Update a household role
 *
 * @param {number} id - Role ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<number>} Number of records updated (1 if successful)
 */
export async function updateHouseholdRole(id, updates) {
  try {
    const updateData = {
      ...updates,
      updated: new Date().toISOString()
    };

    const count = await db.householdRoles.update(id, updateData);
    if (import.meta.env.DEV) {
      console.log('Household role updated:', id);
    }
    return count;
  } catch (error) {
    console.error('Error updating household role:', error);
    throw error;
  }
}

/**
 * Delete a household role
 *
 * @param {number} id - Role ID
 * @returns {Promise<void>}
 */
export async function deleteHouseholdRole(id) {
  try {
    await db.householdRoles.delete(id);
    if (import.meta.env.DEV) {
      console.log('Household role deleted:', id);
    }
  } catch (error) {
    console.error('Error deleting household role:', error);
    throw error;
  }
}

/**
 * Assign a person to a household role
 *
 * @param {number} roleId - Role ID
 * @param {number} personId - Person to assign
 * @param {string} [startDate] - When they started (defaults to now)
 * @returns {Promise<number>} Number of records updated
 */
export async function assignRoleHolder(roleId, personId, startDate = null) {
  return updateHouseholdRole(roleId, {
    currentHolderId: personId,
    startDate: startDate || new Date().toISOString().split('T')[0]
  });
}

/**
 * Remove the current holder from a role (make it vacant)
 *
 * @param {number} roleId - Role ID
 * @returns {Promise<number>} Number of records updated
 */
export async function vacateRole(roleId) {
  return updateHouseholdRole(roleId, {
    currentHolderId: null,
    startDate: null
  });
}

// ==================== QUERY HELPERS ====================

/**
 * Get filled roles for a house (roles with current holders)
 *
 * @param {number} houseId - House ID
 * @returns {Promise<Object[]>} Array of filled roles
 */
export async function getFilledRolesForHouse(houseId) {
  const roles = await getRolesForHouse(houseId);
  return roles.filter(r => r.currentHolderId !== null);
}

/**
 * Get vacant roles for a house (roles without current holders)
 *
 * @param {number} houseId - House ID
 * @returns {Promise<Object[]>} Array of vacant roles
 */
export async function getVacantRolesForHouse(houseId) {
  const roles = await getRolesForHouse(houseId);
  return roles.filter(r => r.currentHolderId === null);
}

/**
 * Check if a house has a specific role type
 *
 * @param {number} houseId - House ID
 * @param {string} roleType - Role type ID
 * @returns {Promise<boolean>} True if house has this role type
 */
export async function houseHasRoleType(houseId, roleType) {
  const roles = await getRolesForHouse(houseId);
  return roles.some(r => r.roleType === roleType);
}

/**
 * Get role statistics for a house
 *
 * @param {number} houseId - House ID
 * @returns {Promise<Object>} Statistics object
 */
export async function getRoleStatsForHouse(houseId) {
  const roles = await getRolesForHouse(houseId);

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
 * @returns {Promise<number>} Number of roles deleted
 */
export async function deleteRolesForHouse(houseId) {
  try {
    const count = await db.householdRoles
      .where('houseId')
      .equals(houseId)
      .delete();
    if (import.meta.env.DEV) {
      console.log(`Deleted ${count} roles for house ${houseId}`);
    }
    return count;
  } catch (error) {
    console.error('Error deleting roles for house:', error);
    throw error;
  }
}

/**
 * Clear holder from all roles (when person is deleted)
 *
 * @param {number} personId - Person ID
 * @returns {Promise<number>} Number of roles updated
 */
export async function clearHolderFromAllRoles(personId) {
  try {
    const roles = await getRolesForPerson(personId);
    let count = 0;

    for (const role of roles) {
      await vacateRole(role.id);
      count++;
    }

    if (import.meta.env.DEV) {
      console.log(`Cleared ${count} roles for person ${personId}`);
    }
    return count;
  } catch (error) {
    console.error('Error clearing holder from roles:', error);
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
