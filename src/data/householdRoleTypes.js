/**
 * Household Role Types - Lineageweaver
 * 
 * Defines household positions that can be tracked for noble houses.
 * These are non-hereditary service positions like Master-at-Arms,
 * Steward, Castellan, etc.
 * 
 * Distinct from Dignities (which are hereditary titles of nobility).
 * 
 * @module householdRoleTypes
 */

// ==================== ROLE TYPES ====================

/**
 * All available household role types
 */
export const HOUSEHOLD_ROLE_TYPES = {
  'master-at-arms': {
    id: 'master-at-arms',
    name: 'Master-at-Arms',
    icon: 'sword',
    description: 'Trains and commands household fighters',
    category: 'military',
    order: 1
  },
  'captain-of-guards': {
    id: 'captain-of-guards',
    name: 'Captain of Guards',
    icon: 'shield',
    description: 'Commands the household guard',
    category: 'military',
    order: 2
  },
  'castellan': {
    id: 'castellan',
    name: 'Castellan',
    icon: 'castle',
    description: 'Manages the castle or keep in lord\'s absence',
    category: 'administration',
    order: 3
  },
  'steward': {
    id: 'steward',
    name: 'Steward',
    icon: 'clipboard-list',
    description: 'Manages household affairs and finances',
    category: 'administration',
    order: 4
  },
  'chamberlain': {
    id: 'chamberlain',
    name: 'Chamberlain',
    icon: 'key',
    description: 'Oversees the lord\'s private chambers and affairs',
    category: 'administration',
    order: 5
  },
  'maester': {
    id: 'maester',
    name: 'Maester',
    icon: 'book-open',
    description: 'Scholar, healer, and advisor',
    category: 'learned',
    order: 6
  },
  'septon': {
    id: 'septon',
    name: 'Septon/Septa',
    icon: 'star',
    description: 'Religious guide and counselor',
    category: 'religious',
    order: 7
  },
  'kennelmaster': {
    id: 'kennelmaster',
    name: 'Kennelmaster',
    icon: 'paw-print',
    description: 'Manages hunting hounds',
    category: 'service',
    order: 8
  },
  'master-of-horse': {
    id: 'master-of-horse',
    name: 'Master of Horse',
    icon: 'horse',
    description: 'Manages stables and horses',
    category: 'service',
    order: 9
  },
  'master-of-hunt': {
    id: 'master-of-hunt',
    name: 'Master of Hunt',
    icon: 'target',
    description: 'Organizes and leads hunts',
    category: 'service',
    order: 10
  },
  'herald': {
    id: 'herald',
    name: 'Herald',
    icon: 'megaphone',
    description: 'Manages heraldry and announcements',
    category: 'ceremonial',
    order: 11
  },
  'master-of-ceremonies': {
    id: 'master-of-ceremonies',
    name: 'Master of Ceremonies',
    icon: 'crown',
    description: 'Organizes feasts and formal events',
    category: 'ceremonial',
    order: 12
  },
  'master-of-coin': {
    id: 'master-of-coin',
    name: 'Master of Coin',
    icon: 'coins',
    description: 'Manages treasury and accounts',
    category: 'administration',
    order: 13
  },
  'master-of-ships': {
    id: 'master-of-ships',
    name: 'Master of Ships',
    icon: 'anchor',
    description: 'Commands naval forces and manages fleet',
    category: 'military',
    order: 14
  },
  'master-of-laws': {
    id: 'master-of-laws',
    name: 'Master of Laws',
    icon: 'scale',
    description: 'Advises on legal matters and justice',
    category: 'learned',
    order: 15
  },
  'master-of-whisperers': {
    id: 'master-of-whisperers',
    name: 'Master of Whisperers',
    icon: 'eye',
    description: 'Manages intelligence and information',
    category: 'administration',
    order: 16
  },
  'nurse': {
    id: 'nurse',
    name: 'Nurse/Wet Nurse',
    icon: 'baby',
    description: 'Cares for young children of the house',
    category: 'service',
    order: 17
  },
  'tutor': {
    id: 'tutor',
    name: 'Tutor',
    icon: 'graduation-cap',
    description: 'Educates children of the house',
    category: 'learned',
    order: 18
  },
  'custom': {
    id: 'custom',
    name: 'Custom Role',
    icon: 'user-cog',
    description: 'User-defined household position',
    category: 'other',
    order: 99
  }
};

// ==================== ROLE CATEGORIES ====================

/**
 * Categories for grouping roles
 */
export const ROLE_CATEGORIES = {
  military: {
    id: 'military',
    name: 'Military',
    description: 'Defense and martial positions',
    icon: 'sword',
    order: 1
  },
  administration: {
    id: 'administration',
    name: 'Administration',
    description: 'Household management positions',
    icon: 'clipboard-list',
    order: 2
  },
  learned: {
    id: 'learned',
    name: 'Learned',
    description: 'Scholarly and advisory positions',
    icon: 'book-open',
    order: 3
  },
  religious: {
    id: 'religious',
    name: 'Religious',
    description: 'Spiritual and religious positions',
    icon: 'star',
    order: 4
  },
  service: {
    id: 'service',
    name: 'Service',
    description: 'Specialized service positions',
    icon: 'users',
    order: 5
  },
  ceremonial: {
    id: 'ceremonial',
    name: 'Ceremonial',
    description: 'Protocol and ceremony positions',
    icon: 'crown',
    order: 6
  },
  other: {
    id: 'other',
    name: 'Other',
    description: 'Custom and miscellaneous positions',
    icon: 'more-horizontal',
    order: 99
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get role type by ID
 * @param {string} roleId - Role ID
 * @returns {Object|null} Role type or null
 */
export function getRoleType(roleId) {
  return HOUSEHOLD_ROLE_TYPES[roleId] || null;
}

/**
 * Get all roles in a category
 * @param {string} categoryId - Category ID
 * @returns {Object[]} Array of role types
 */
export function getRolesByCategory(categoryId) {
  return Object.values(HOUSEHOLD_ROLE_TYPES)
    .filter(r => r.category === categoryId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get all role types sorted by order
 * @returns {Object[]} Sorted array of role types
 */
export function getAllRolesSorted() {
  return Object.values(HOUSEHOLD_ROLE_TYPES)
    .sort((a, b) => a.order - b.order);
}

/**
 * Get category info
 * @param {string} categoryId - Category ID
 * @returns {Object|null} Category or null
 */
export function getRoleCategory(categoryId) {
  return ROLE_CATEGORIES[categoryId] || null;
}

/**
 * Get roles grouped by category
 * @returns {Object} Object with category IDs as keys and role arrays as values
 */
export function getRolesGroupedByCategory() {
  const grouped = {};
  
  for (const category of Object.values(ROLE_CATEGORIES)) {
    grouped[category.id] = getRolesByCategory(category.id);
  }
  
  return grouped;
}

// ==================== EXPORTS ====================

export default {
  HOUSEHOLD_ROLE_TYPES,
  ROLE_CATEGORIES,
  getRoleType,
  getRolesByCategory,
  getAllRolesSorted,
  getRoleCategory,
  getRolesGroupedByCategory
};
