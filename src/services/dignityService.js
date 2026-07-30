/**
 * Dignity Service - Titles & Dignities System
 * 
 * CRUD operations for the Dignities system, Lineageweaver's fifth major system.
 * Based on "The Codified Charter of Driht, Ward, and Service" - the foundational
 * legal document of Estargenn.
 * 
 * WHAT IS A DIGNITY?
 * A dignity represents a title, office, rank, or honour that can be held by a person
 * or associated with a house. It encompasses:
 * - Driht authority (lordship by right): Drihten, Drithen, Drith, Drithling, Drithman
 * - Ward authority (custodial trust): Wardyn, Landward, Holdward, Marchward
 * - Sir honour (knightly service without inherent land)
 * - Crown dignities (sovereign/royal titles)
 * 
 * DATABASE TABLES USED:
 * - dignities: The titles/offices/honours themselves
 * - dignityTenures: Historical record of who held what, when
 * - dignityLinks: Junction table for complex entity relationships
 */

import { getDatabase } from './database';
import {
  syncAddDignity,
  syncUpdateDignity,
  syncDeleteDignity,
  syncAddDignityTenure,
  syncUpdateDignityTenure,
  syncDeleteDignityTenure,
  syncAddDignityLink,
  syncDeleteDignityLink
} from './dataSyncService';
import { logger } from '../utils/logger';

// ==================== REFERENCE DATA ====================

/**
 * Dignity Classes - The major categories of authority
 * Based on the Charter's seven articles
 */
export const DIGNITY_CLASSES = {
  driht: {
    id: 'driht',
    name: 'Driht',
    description: 'Lordship by right - Article I of the Charter',
    icon: '👑',
    iconName: 'castle'
  },
  ward: {
    id: 'ward',
    name: 'Ward',
    description: 'Custodial authority in trust - Article II of the Charter',
    icon: '🏰',
    iconName: 'shield-check'
  },
  sir: {
    id: 'sir',
    name: 'Sir',
    description: 'Knightly honour of service - Article III of the Charter',
    icon: '⚔️',
    iconName: 'sword'
  },
  crown: {
    id: 'crown',
    name: 'Crown',
    description: 'Sovereign authority',
    icon: '♛',
    iconName: 'crown'
  },
  other: {
    id: 'other',
    name: 'Other',
    description: 'Non-Charter dignities (religious, guild, foreign)',
    icon: '📜',
    iconName: 'scroll-text'
  }
};

/**
 * Lucide icon name per dignity class, for the shared <Icon> component.
 * DignitiesLanding, DignityCrisisDashboard and DignityView each carried an
 * identical private copy of this map.
 */
export const CLASS_ICONS = Object.fromEntries(
  Object.entries(DIGNITY_CLASSES).map(([key, meta]) => [key, meta.iconName])
);

/**
 * Dignity Ranks by Class
 * These define the hierarchical position within each class
 */
export const DIGNITY_RANKS = {
  // Article I - Driht Authority (Lordship by Right)
  driht: {
    drihten: { id: 'drihten', name: 'Drihten', description: 'Paramount lord of a house or region', order: 1 },
    drithen: { id: 'drithen', name: 'Drithen', description: 'Great lord by inheritance or grant', order: 2 },
    drith: { id: 'drith', name: 'Drith', description: 'Full lord over persons and lands', order: 3 },
    drithling: { id: 'drithling', name: 'Drithling', description: 'Cadet lord of the blood', order: 4 },
    drithman: { id: 'drithman', name: 'Drithman', description: 'Lord-in-service', order: 5 }
  },
  // Article II - Ward Authority (Custodial Trust)
  ward: {
    wardyn: { id: 'wardyn', name: 'Wardyn', description: 'Senior custodian of land', order: 1 },
    landward: { id: 'landward', name: 'Landward', description: 'Custodial landholder', order: 2 },
    holdward: { id: 'holdward', name: 'Holdward', description: 'Minor estate custodian', order: 3 },
    marchward: { id: 'marchward', name: 'Marchward', description: 'Custodian of borderlands', order: 4 }
  },
  // Article III - Sir (Knightly Honour)
  sir: {
    sir: { id: 'sir', name: 'Sir', description: 'Knightly honour without inherent land', order: 1 }
  },
  // Crown Authority
  crown: {
    sovereign: { id: 'sovereign', name: 'Sovereign', description: 'The Crown itself', order: 1 },
    heir: { id: 'heir', name: 'Heir', description: 'Heir to the Crown', order: 2 },
    prince: { id: 'prince', name: 'Prince', description: 'Royal blood', order: 3 }
  },
  // Other/Extensible
  other: {
    custom: { id: 'custom', name: 'Custom', description: 'User-defined rank', order: 1 }
  }
};

/**
 * Tenure Types - Article IV styling conventions
 * Defines the relationship between a dignity and its place/house
 */
export const TENURE_TYPES = {
  of: { id: 'of', name: 'of [Place]', description: 'Lawful holding and governance', style: 'of' },
  in: { id: 'in', name: 'in [Place]', description: 'Residence without rule', style: 'in' },
  at: { id: 'at', name: 'at [Place]', description: 'Household seat or lodging only', style: 'at' },
  'of-house': { id: 'of-house', name: 'of the House of [Name]', description: 'Blood descent without land', style: 'of the House of' },
  'of-name': { id: 'of-name', name: 'of the Name of [Name]', description: 'A cadet line', style: 'of the Name of' },
  'in-fee': { id: 'in-fee', name: 'in Fee of', description: 'Land bound in service to another house', style: 'in Fee of' },
  'in-wardship': { id: 'in-wardship', name: 'in Wardship under', description: 'Land held in trust', style: 'in Wardship under' }
};

/**
 * Fealty Types - Article V bonds
 * Different strengths of feudal relationship
 */
export const FEALTY_TYPES = {
  'sworn-to': { id: 'sworn-to', name: 'Sworn To', description: 'Direct oath of fealty' },
  'liege-to': { id: 'liege-to', name: 'Liege To', description: 'Primary lord relationship' },
  'under-banner': { id: 'under-banner', name: 'Under Banner', description: 'Military allegiance' }
};

/**
 * Acquisition Types - How a dignity was obtained
 */
export const ACQUISITION_TYPES = {
  inheritance: { id: 'inheritance', name: 'Inheritance', description: 'Passed by right of blood' },
  grant: { id: 'grant', name: 'Grant', description: 'Bestowed by higher authority' },
  conquest: { id: 'conquest', name: 'Conquest', description: 'Won by force of arms' },
  marriage: { id: 'marriage', name: 'Marriage', description: 'Acquired through matrimony' },
  elevation: { id: 'elevation', name: 'Elevation', description: 'Raised from lower rank' },
  election: { id: 'election', name: 'Election', description: 'Chosen by council or body' },
  usurpation: { id: 'usurpation', name: 'Usurpation', description: 'Seized unlawfully' },
  restoration: { id: 'restoration', name: 'Restoration', description: 'Returned after loss' }
};

/**
 * End Types - How a tenure ended
 */
export const END_TYPES = {
  death: { id: 'death', name: 'Death', description: 'Holder died' },
  abdication: { id: 'abdication', name: 'Abdication', description: 'Voluntarily relinquished' },
  forfeiture: { id: 'forfeiture', name: 'Forfeiture', description: 'Lost through legal process' },
  attainder: { id: 'attainder', name: 'Attainder', description: 'Stripped for broken fealty (Article V)' },
  deposition: { id: 'deposition', name: 'Deposition', description: 'Forcibly removed' },
  succession: { id: 'succession', name: 'Succession', description: 'Passed to heir' },
  transfer: { id: 'transfer', name: 'Transfer', description: 'Transferred to another' }
};

// ==================== SUCCESSION SYSTEM ====================

/**
 * Succession Types - How a dignity passes to the next holder
 * These define the rules for calculating the line of succession
 */
export const SUCCESSION_TYPES = {
  'male-primogeniture': {
    id: 'male-primogeniture',
    name: 'Male Primogeniture',
    description: 'Eldest son inherits, then his sons. Daughters only if no males exist.',
    icon: '♂',
    autoCalculate: true
  },
  'absolute-primogeniture': {
    id: 'absolute-primogeniture',
    name: 'Absolute Primogeniture',
    description: 'Eldest child inherits regardless of gender.',
    icon: '👑',
    autoCalculate: true
  },
  'agnatic-seniority': {
    id: 'agnatic-seniority',
    name: 'Agnatic Seniority',
    description: 'Oldest male of the dynasty inherits (uncle before nephew).',
    icon: '👴',
    autoCalculate: true
  },
  'elective': {
    id: 'elective',
    name: 'Elective',
    description: 'Chosen by council or vote. No automatic heir calculation.',
    icon: '🗳️',
    autoCalculate: false
  },
  'appointment': {
    id: 'appointment',
    name: 'Appointment',
    description: 'Current holder names their successor.',
    icon: '📜',
    autoCalculate: false
  },
  'conquest': {
    id: 'conquest',
    name: 'Conquest',
    description: 'Held by force. No legitimate succession.',
    icon: '⚔️',
    autoCalculate: false
  },
  'custom': {
    id: 'custom',
    name: 'Custom',
    description: 'User-defined succession rules.',
    icon: '✏️',
    autoCalculate: false
  }
};

/**
 * Succession Status - Current state of the succession
 */
export const SUCCESSION_STATUS = {
  stable: {
    id: 'stable',
    name: 'Stable',
    description: 'Clear succession with no disputes.',
    icon: '✅',
    color: 'green'
  },
  disputed: {
    id: 'disputed',
    name: 'Disputed',
    description: 'Multiple claimants contest the succession.',
    icon: '⚔️',
    color: 'orange'
  },
  crisis: {
    id: 'crisis',
    name: 'Crisis',
    description: 'Active succession crisis - no clear resolution.',
    icon: '🔥',
    color: 'red'
  },
  vacant: {
    id: 'vacant',
    name: 'Vacant',
    description: 'No current holder, awaiting succession.',
    icon: '⬜',
    color: 'gray'
  },
  interregnum: {
    id: 'interregnum',
    name: 'Interregnum',
    description: 'Between rulers, possibly under regency.',
    icon: '⏳',
    color: 'purple'
  }
};

/**
 * Claim Types - Basis for a disputed claim
 */
export const CLAIM_TYPES = {
  hereditary: {
    id: 'hereditary',
    name: 'Hereditary',
    description: 'Claim based on blood descent.',
    icon: '🩸'
  },
  conquest: {
    id: 'conquest',
    name: 'Conquest',
    description: 'Claim by right of arms.',
    icon: '⚔️'
  },
  marriage: {
    id: 'marriage',
    name: 'Marriage',
    description: 'Claim through marriage alliance.',
    icon: '💍'
  },
  divine: {
    id: 'divine',
    name: 'Divine Right',
    description: 'Claim by religious or prophetic mandate.',
    icon: '✨'
  },
  election: {
    id: 'election',
    name: 'Election',
    description: 'Claim by electoral selection.',
    icon: '🗳️'
  },
  restoration: {
    id: 'restoration',
    name: 'Restoration',
    description: 'Claim to restore previous ruling line.',
    icon: '🔄'
  },
  other: {
    id: 'other',
    name: 'Other',
    description: 'Custom or unusual claim basis.',
    icon: '📜'
  }
};

/**
 * Claim Strengths - How strong is the claim
 */
export const CLAIM_STRENGTHS = {
  strong: {
    id: 'strong',
    name: 'Strong',
    description: 'Widely recognized, legally sound claim.',
    color: 'green',
    order: 1
  },
  moderate: {
    id: 'moderate',
    name: 'Moderate',
    description: 'Legitimate but contested claim.',
    color: 'orange',
    order: 2
  },
  weak: {
    id: 'weak',
    name: 'Weak',
    description: 'Tenuous claim with limited support.',
    color: 'red',
    order: 3
  },
  pretender: {
    id: 'pretender',
    name: 'Pretender',
    description: 'No legal basis, purely political claim.',
    color: 'gray',
    order: 4
  }
};

/**
 * Dispute Resolutions - How a claim was resolved
 */
export const DISPUTE_RESOLUTIONS = {
  successful: {
    id: 'successful',
    name: 'Successful',
    description: 'Claimant gained the dignity.'
  },
  failed: {
    id: 'failed',
    name: 'Failed',
    description: 'Claim was rejected or defeated.'
  },
  compromised: {
    id: 'compromised',
    name: 'Compromised',
    description: 'Settlement reached (e.g., partition, compensation).'
  },
  withdrawn: {
    id: 'withdrawn',
    name: 'Withdrawn',
    description: 'Claimant voluntarily dropped the claim.'
  },
  ongoing: {
    id: 'ongoing',
    name: 'Ongoing',
    description: 'Dispute still active.'
  }
};

/**
 * Interregnum/Regency Reasons
 */
export const INTERREGNUM_REASONS = {
  minority: {
    id: 'minority',
    name: 'Minority',
    description: 'Heir is too young to rule.'
  },
  incapacity: {
    id: 'incapacity',
    name: 'Incapacity',
    description: 'Holder is unable to fulfill duties.'
  },
  vacancy: {
    id: 'vacancy',
    name: 'Vacancy',
    description: 'No holder, awaiting succession.'
  },
  crisis: {
    id: 'crisis',
    name: 'Crisis',
    description: 'Succession crisis prevents normal rule.'
  },
  absence: {
    id: 'absence',
    name: 'Absence',
    description: 'Holder is absent (e.g., crusade, exile).'
  }
};

/**
 * Dignity Natures - Fundamental categorization of how a dignity works
 * This determines succession behavior, grant tracking, and UI display
 */
export const DIGNITY_NATURES = {
  territorial: {
    id: 'territorial',
    name: 'Territorial',
    description: 'Attached to land/domain, hereditary. Passes to heirs.',
    icon: 'castle',
    hasSuccession: true,
    hasTenureHistory: true,
    hasGrantTracking: false, // Optional for original grant
    examples: 'Lord of Breakmount, Warden of the North'
  },
  office: {
    id: 'office',
    name: 'Office',
    description: 'Appointed/elected position, non-hereditary. Tracks who served.',
    icon: 'briefcase',
    hasSuccession: false,
    hasTenureHistory: true,
    hasGrantTracking: true, // Who appointed them
    examples: 'Master of Coin, High Septon, Castellan'
  },
  'personal-honour': {
    id: 'personal-honour',
    name: 'Personal Honour',
    description: 'Recognition given to an individual. Dies with them.',
    icon: 'medal',
    hasSuccession: false,
    hasTenureHistory: false, // Just grant date
    hasGrantTracking: true, // Who granted the honour
    examples: 'Knighthood, "Defender of the Realm", "Hero of Breakmount"'
  },
  courtesy: {
    id: 'courtesy',
    name: 'Courtesy',
    description: 'Derived from relationship to a title holder. Not independently held.',
    icon: 'heart-handshake',
    hasSuccession: false,
    hasTenureHistory: false,
    hasGrantTracking: false, // Derived, not granted
    examples: 'Dowager Lady, Prince Consort, Lady Mother'
  }
};

/**
 * Display Icons by rank
 * For visual indicators on tree cards
 */
export const DISPLAY_ICONS = {
  crown: { id: 'crown', icon: '♛', name: 'Crown' },
  coronet: { id: 'coronet', icon: '♕', name: 'Coronet' },
  helm: { id: 'helm', icon: '🛡️', name: 'Helm' },
  sword: { id: 'sword', icon: '⚔️', name: 'Crossed Swords' },
  star: { id: 'star', icon: '★', name: 'Star' },
  shield: { id: 'shield', icon: '🔰', name: 'Shield' }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Infer dignity nature from other fields when not explicitly set
 * Used during creation and migration
 *
 * @param {Object} dignityData - The dignity data
 * @returns {string} The inferred nature
 */
function inferDignityNature(dignityData) {
  // If nature is explicitly set, use it
  if (dignityData.dignityNature) {
    return dignityData.dignityNature;
  }

  // Infer from class and isHereditary
  const dignityClass = dignityData.dignityClass || 'driht';

  // Knights are typically personal honours
  if (dignityClass === 'sir') {
    return 'personal-honour';
  }

  // If explicitly marked non-hereditary, it's likely an office
  if (dignityData.isHereditary === false) {
    return 'office';
  }

  // Default: territorial for driht, ward, crown
  // These are typically hereditary land-based titles
  return 'territorial';
}

/**
 * Check if a dignity nature supports succession
 *
 * @param {string} nature - The dignity nature
 * @returns {boolean} Whether succession applies
 */
export function natureHasSuccession(nature) {
  return DIGNITY_NATURES[nature]?.hasSuccession ?? false;
}

/**
 * Check if a dignity nature supports grant tracking
 *
 * @param {string} nature - The dignity nature
 * @returns {boolean} Whether grant tracking applies
 */
export function natureHasGrantTracking(nature) {
  return DIGNITY_NATURES[nature]?.hasGrantTracking ?? false;
}

/**
 * Check if a dignity nature supports tenure history
 *
 * @param {string} nature - The dignity nature
 * @returns {boolean} Whether tenure history applies
 */
export function natureHasTenureHistory(nature) {
  return DIGNITY_NATURES[nature]?.hasTenureHistory ?? false;
}

// ==================== DIGNITY CRUD OPERATIONS ====================

/**
 * Create a new dignity record
 * 
 * @param {Object} dignityData - The dignity data to save
 * @returns {Promise<number>} The ID of the newly created record
 * 
 * REQUIRED FIELDS:
 * - name: Full formal title (e.g., "Lord of Breakmount")
 * 
 * OPTIONAL FIELDS:
 * - shortName: Compact display name (e.g., "Breakmount")
 * - dignityClass: 'driht' | 'ward' | 'sir' | 'crown' | 'other'
 * - dignityRank: Class-specific rank (e.g., 'drihten', 'drithen', 'drith')
 * - tenureType: Article IV styling ('of', 'in', 'at', etc.)
 * - placeName: The place this dignity governs
 * - seatName: Primary residence/seat
 * - swornToId: Reference to superior dignity
 * - fealtyType: Type of feudal bond
 * - currentHolderId: Person currently holding
 * - currentHouseId: House currently holding (if hereditary)
 * - isVacant: Boolean - no current holder
 * - isHereditary: Boolean - passes by blood
 * - codexEntryId: Link to Codex article
 * - codexLocationId: 🪝 Link to Codex location (future)
 * - displayIcon: Visual indicator for tree
 * - displayPriority: Ordering when person holds multiple
 * - notes: Free-form notes
 * @param {string} [userId] - Optional user ID for cloud sync
 */
export async function createDignity(dignityData, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const now = new Date().toISOString();

    const record = {
      // Identity
      name: dignityData.name || 'Untitled Dignity',
      shortName: dignityData.shortName || null,
      
      // Classification (Charter-based)
      dignityClass: dignityData.dignityClass || 'driht',
      dignityRank: dignityData.dignityRank || null,
      
      // Tenure (Article IV)
      tenureType: dignityData.tenureType || 'of',
      
      // Geographic Binding
      placeName: dignityData.placeName || null,
      seatName: dignityData.seatName || null,
      codexLocationId: dignityData.codexLocationId || null, // 🪝 Future expansion
      
      // Feudal Hierarchy (Article V)
      swornToId: dignityData.swornToId || null,
      fealtyType: dignityData.fealtyType || 'sworn-to',
      
      // Current State
      currentHolderId: dignityData.currentHolderId || null,
      currentHouseId: dignityData.currentHouseId || null,
      isVacant: dignityData.isVacant || false,

      // === DIGNITY NATURE ===
      // Determines behavior: succession, tenure tracking, grant tracking
      dignityNature: dignityData.dignityNature || inferDignityNature(dignityData),

      // Backward compatibility: derive isHereditary from nature
      isHereditary: dignityData.dignityNature
        ? dignityData.dignityNature === 'territorial'
        : (dignityData.isHereditary !== undefined ? dignityData.isHereditary : true),

      // === GRANT TRACKING ===
      // For office/personal-honour: who granted this and when
      grantedById: dignityData.grantedById || null,           // Person ID who granted
      grantedByDignityId: dignityData.grantedByDignityId || null, // Dignity they acted under (optional)
      grantDate: dignityData.grantDate || null,               // When granted (ISO date or year string)

      // === SUCCESSION SYSTEM ===
      successionType: dignityData.successionType || 'male-primogeniture',
      successionRules: dignityData.successionRules || {
        excludeBastards: true,
        legitimizedBastardsEligible: true,
        excludeWomen: false,  // Only applies to male-primogeniture
        requiresConfirmation: false,
        customNotes: null
      },
      designatedHeirId: dignityData.designatedHeirId || null,
      
      // === SUCCESSION STATUS ===
      successionStatus: dignityData.successionStatus || 'stable',
      disputes: dignityData.disputes || [],  // Array of dispute objects
      
      // === INTERREGNUM/REGENCY ===
      interregnum: dignityData.interregnum || null,  // { startDate, regentId, regentTitle, reason, notes }
      
      // Integration
      codexEntryId: dignityData.codexEntryId || null,
      
      // Display
      displayIcon: dignityData.displayIcon || null,
      displayPriority: dignityData.displayPriority || 0,
      
      // Metadata
      notes: dignityData.notes || null,
      created: now,
      updated: now
    };
    
    const id = await db.dignities.add(record);
    logger.log('📜 Dignity created with ID:', id, '-', record.name);

    // Auto-create Codex entry for the dignity (unless explicitly skipped)
    if (!record.codexEntryId) {
      try {
        // Use dynamic import to avoid circular dependency
        const { createEntry } = await import('./codexService.js');

        // Create a Codex entry for this dignity
        const codexEntryId = await createEntry({
          type: 'mysteria', // Dignities go under mysteria (world-building)
          title: record.name,
          subtitle: record.dignityRank ? `${DIGNITY_CLASSES[record.dignityClass]?.name || record.dignityClass} Dignity` : 'Dignity',
          content: record.notes || '',
          category: record.dignityClass || 'driht',
          tags: ['dignity', record.dignityClass, record.dignityRank].filter(Boolean),
          dignityId: id
        }, datasetId);

        // Update the dignity with the codexEntryId
        await db.dignities.update(id, { codexEntryId });
        logger.log('📚 Auto-created Codex entry for dignity:', codexEntryId);
      } catch (codexError) {
        // Log but don't fail the dignity creation if Codex creation fails
        logger.warn('⚠️ Could not auto-create Codex entry for dignity:', codexError);
      }
    }

    // Sync to cloud if userId provided
    if (userId) {
      syncAddDignity(userId, datasetId, id, record);
    }

    return id;
  } catch (error) {
    logger.error('❌ Error creating dignity:', error);
    throw error;
  }
}

/**
 * Get a single dignity record by ID
 * 
 * @param {number} id - The dignity ID
 * @returns {Promise<Object|undefined>} The dignity record or undefined
 */
export async function getDignity(id, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const dignity = await db.dignities.get(id);
    return dignity;
  } catch (error) {
    logger.error('❌ Error getting dignity:', error);
    throw error;
  }
}

/**
 * Get all dignity records
 * 
 * @returns {Promise<Array>} Array of all dignity records
 */
export async function getAllDignities(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const dignities = await db.dignities.toArray();
    return dignities;
  } catch (error) {
    logger.error('❌ Error getting all dignities:', error);
    throw error;
  }
}

/**
 * Update an existing dignity record
 * 
 * @param {number} id - The dignity ID to update
 * @param {Object} updates - The fields to update
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} Number of records updated (1 or 0)
 */
export async function updateDignity(id, updates, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const result = await db.dignities.update(id, {
      ...updates,
      updated: new Date().toISOString()
    });
    logger.log('📜 Dignity updated:', id);

    // Keep the linked Codex entry's title in step with the dignity's name — the
    // title is denormalized, so a rename otherwise left the Codex showing the old
    // one and broke [[New Name]] wiki-links (which resolve on title).
    if (updates.name !== undefined) {
      const dignity = await db.dignities.get(id);
      if (dignity?.codexEntryId && dignity.name?.trim()) {
        try {
          const entry = await db.codexEntries.get(dignity.codexEntryId);
          if (entry && entry.title !== dignity.name) {
            await db.codexEntries.update(dignity.codexEntryId, {
              title: dignity.name,
              updated: new Date().toISOString()
            });
            logger.log(`📚 Codex title follows dignity rename: "${entry.title}" → "${dignity.name}"`);

            if (userId) {
              const { syncUpdateCodexEntry } = await import('./dataSyncService.js');
              syncUpdateCodexEntry(userId, datasetId, dignity.codexEntryId, { title: dignity.name });
            }
          }
        } catch (codexError) {
          // Codex bookkeeping must never block a dignity edit.
          logger.error('Error propagating dignity rename to Codex:', codexError);
        }
      }
    }

    // Sync to cloud if userId provided
    if (userId) {
      syncUpdateDignity(userId, datasetId, id, updates);
    }

    return result;
  } catch (error) {
    logger.error('❌ Error updating dignity:', error);
    throw error;
  }
}

/**
 * Delete a dignity record
 * Also removes associated tenures and links
 * 
 * @param {number} id - The dignity ID to delete
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<void>}
 */
export async function deleteDignity(id, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    // Cascade delete Codex entry if it exists
    try {
      // Use dynamic import to avoid circular dependency
      const { getEntryByDignityId, deleteEntry } = await import('./codexService.js');

      // Find and delete the associated Codex entry
      const codexEntry = await getEntryByDignityId(id, datasetId);
      if (codexEntry) {
        await deleteEntry(codexEntry.id, datasetId);
        logger.log('📚 Cascade deleted Codex entry for dignity:', codexEntry.id);
      }
    } catch (codexError) {
      // Log but don't fail the dignity deletion if Codex deletion fails
      logger.warn('⚠️ Could not cascade delete Codex entry for dignity:', codexError);
    }

    // Remove all tenure records for this dignity
    const tenures = await db.dignityTenures.where('dignityId').equals(id).toArray();
    for (const tenure of tenures) {
      await db.dignityTenures.delete(tenure.id);
      if (userId) {
        syncDeleteDignityTenure(userId, datasetId, tenure.id);
      }
    }

    // Remove all links to this dignity
    const links = await db.dignityLinks.where('dignityId').equals(id).toArray();
    for (const link of links) {
      await db.dignityLinks.delete(link.id);
      if (userId) {
        syncDeleteDignityLink(userId, datasetId, link.id);
      }
    }

    // Delete the dignity itself
    await db.dignities.delete(id);
    logger.log('📜 Dignity deleted:', id);

    // Sync to cloud if userId provided
    if (userId) {
      syncDeleteDignity(userId, datasetId, id);
    }
  } catch (error) {
    logger.error('❌ Error deleting dignity:', error);
    throw error;
  }
}

// ==================== DIGNITY TENURE OPERATIONS ====================

/**
 * Create a new tenure record (who held a dignity, when)
 * 
 * @param {Object} tenureData - The tenure data
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} The tenure ID
 */
export async function createDignityTenure(tenureData, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const now = new Date().toISOString();

    const record = {
      dignityId: tenureData.dignityId,
      personId: tenureData.personId,
      
      // Temporal
      dateStarted: tenureData.dateStarted || null,
      dateEnded: tenureData.dateEnded || null,
      
      // Circumstances
      acquisitionType: tenureData.acquisitionType || 'inheritance',
      endType: tenureData.endType || null,
      
      // Context
      grantedById: tenureData.grantedById || null,
      witnessedByIds: tenureData.witnessedByIds || null, // 🪝 Article VII
      recordReference: tenureData.recordReference || null, // 🪝 "Rolls of the realm"
      
      notes: tenureData.notes || null,
      created: now
    };
    
    const id = await db.dignityTenures.add(record);
    logger.log('📜 Dignity tenure created:', id);

    // Sync to cloud if userId provided
    if (userId) {
      syncAddDignityTenure(userId, datasetId, id, record);
    }

    return id;
  } catch (error) {
    logger.error('❌ Error creating dignity tenure:', error);
    throw error;
  }
}

/**
 * Get all tenures for a specific dignity
 * Returns in chronological order (oldest first)
 * 
 * @param {number} dignityId - The dignity ID
 * @returns {Promise<Array>} Array of tenure records
 */
export async function getTenuresForDignity(dignityId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const tenures = await db.dignityTenures
      .where('dignityId')
      .equals(dignityId)
      .toArray();
    
    // Sort by dateStarted (oldest first), null dates at end
    return tenures.sort((a, b) => {
      if (!a.dateStarted && !b.dateStarted) return 0;
      if (!a.dateStarted) return 1;
      if (!b.dateStarted) return -1;
      return new Date(a.dateStarted) - new Date(b.dateStarted);
    });
  } catch (error) {
    logger.error('❌ Error getting tenures for dignity:', error);
    throw error;
  }
}

/**
 * Get all dignities held by a specific person (current and past)
 * 
 * @param {number} personId - The person ID
 * @returns {Promise<Array>} Array of tenure records with dignity data
 */
export async function getTenuresForPerson(personId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const tenures = await db.dignityTenures
      .where('personId')
      .equals(personId)
      .toArray();

    // Enrich with dignity data
    const enrichedTenures = await Promise.all(
      tenures.map(async (tenure) => {
        const dignity = await getDignity(tenure.dignityId, datasetId);
        return {
          ...tenure,
          dignity
        };
      })
    );
    
    return enrichedTenures;
  } catch (error) {
    logger.error('❌ Error getting tenures for person:', error);
    throw error;
  }
}

/**
 * Get the current tenure for a dignity (where dateEnded is null)
 * 
 * @param {number} dignityId - The dignity ID
 * @returns {Promise<Object|null>} The current tenure or null
 */
export async function getCurrentTenure(dignityId, datasetId = null) {
  try {
    const tenures = await getTenuresForDignity(dignityId, datasetId);
    return tenures.find(t => !t.dateEnded) || null;
  } catch (error) {
    logger.error('❌ Error getting current tenure:', error);
    throw error;
  }
}

/**
 * Update a tenure record
 * 
 * @param {number} id - The tenure ID
 * @param {Object} updates - The fields to update
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} Number of records updated
 */
export async function updateDignityTenure(id, updates, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const result = await db.dignityTenures.update(id, updates);
    logger.log('📜 Dignity tenure updated:', id);

    // Sync to cloud if userId provided
    if (userId) {
      syncUpdateDignityTenure(userId, datasetId, id, updates);
    }

    return result;
  } catch (error) {
    logger.error('❌ Error updating dignity tenure:', error);
    throw error;
  }
}

/**
 * Delete a tenure record
 *
 * @param {number} id - The tenure ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<void>}
 */
export async function deleteDignityTenure(id, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    await db.dignityTenures.delete(id);
    logger.log('📜 Dignity tenure deleted:', id);

    // Sync to cloud if userId provided
    if (userId) {
      syncDeleteDignityTenure(userId, datasetId, id);
    }
  } catch (error) {
    logger.error('❌ Error deleting dignity tenure:', error);
    throw error;
  }
}

// ==================== DIGNITY LINKS ====================

/**
 * Link a dignity to an entity (house, location, event, faction)
 * 
 * @param {Object} linkData - The link data
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<number>} The link ID
 */
export async function linkDignityToEntity(linkData, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const link = {
      dignityId: linkData.dignityId,
      entityType: linkData.entityType, // 'house' | 'location' | 'event' | 'faction'
      entityId: linkData.entityId,
      linkType: linkData.linkType || 'primary', // 'primary' | 'secondary' | 'historical' | 'claimant' | 'pretender'
      notes: linkData.notes || null,
      created: new Date().toISOString()
    };

    const id = await db.dignityLinks.add(link);
    logger.log('🔗 Dignity linked to', linkData.entityType, linkData.entityId);

    // Sync to cloud if userId provided
    if (userId) {
      syncAddDignityLink(userId, datasetId, id, link);
    }

    return id;
  } catch (error) {
    logger.error('❌ Error linking dignity:', error);
    throw error;
  }
}

/**
 * Get all links for a dignity
 * 
 * @param {number} dignityId - The dignity ID
 * @returns {Promise<Array>} Array of link records
 */
export async function getDignityLinks(dignityId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const links = await db.dignityLinks
      .where('dignityId')
      .equals(dignityId)
      .toArray();
    return links;
  } catch (error) {
    logger.error('❌ Error getting dignity links:', error);
    throw error;
  }
}

/**
 * Get dignities linked to an entity
 * 
 * @param {string} entityType - 'house' | 'location' | 'event' | 'faction'
 * @param {number} entityId - The entity's ID
 * @returns {Promise<Array>} Array of dignity records
 */
export async function getDignitiesForEntity(entityType, entityId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const links = await db.dignityLinks
      .where('entityType')
      .equals(entityType)
      .and(link => link.entityId === entityId)
      .toArray();

    const dignityIds = links.map(link => link.dignityId);
    const dignities = await db.dignities
      .where('id')
      .anyOf(dignityIds)
      .toArray();
    
    // Combine with link info
    return dignities.map(d => {
      const link = links.find(l => l.dignityId === d.id);
      return {
        ...d,
        linkType: link?.linkType
      };
    });
  } catch (error) {
    logger.error('❌ Error getting dignities for entity:', error);
    throw error;
  }
}

/**
 * Remove a dignity link
 * 
 * @param {number} linkId - The link ID
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<void>}
 */
export async function unlinkDignity(linkId, userId = null, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    await db.dignityLinks.delete(linkId);
    logger.log('🔗 Dignity link removed:', linkId);

    // Sync to cloud if userId provided
    if (userId) {
      syncDeleteDignityLink(userId, datasetId, linkId);
    }
  } catch (error) {
    logger.error('❌ Error unlinking dignity:', error);
    throw error;
  }
}

// ==================== QUERY HELPERS ====================

/**
 * Get dignities by class
 * 
 * @param {string} dignityClass - 'driht' | 'ward' | 'sir' | 'crown' | 'other'
 * @returns {Promise<Array>} Matching dignities
 */
export async function getDignitiesByClass(dignityClass, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all.filter(d => d.dignityClass === dignityClass);
  } catch (error) {
    logger.error('❌ Error getting dignities by class:', error);
    throw error;
  }
}

/**
 * Get dignities by rank
 * 
 * @param {string} dignityRank - e.g., 'drihten', 'drithen', 'wardyn'
 * @returns {Promise<Array>} Matching dignities
 */
export async function getDignitiesByRank(dignityRank, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all.filter(d => d.dignityRank === dignityRank);
  } catch (error) {
    logger.error('❌ Error getting dignities by rank:', error);
    throw error;
  }
}

/**
 * Get all dignities held by a house (current)
 * 
 * @param {number} houseId - The house ID
 * @returns {Promise<Array>} Dignities where currentHouseId matches
 */
export async function getDignitiesForHouse(houseId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all.filter(d => d.currentHouseId === houseId);
  } catch (error) {
    logger.error('❌ Error getting dignities for house:', error);
    throw error;
  }
}

/**
 * Get all dignities held by a person (current)
 * 
 * @param {number} personId - The person ID
 * @returns {Promise<Array>} Dignities where currentHolderId matches
 */
export async function getDignitiesForPerson(personId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all.filter(d => d.currentHolderId === personId);
  } catch (error) {
    logger.error('❌ Error getting dignities for person:', error);
    throw error;
  }
}

/**
 * Get subordinate dignities (sworn to a given dignity)
 * 
 * @param {number} dignityId - The superior dignity ID
 * @returns {Promise<Array>} Dignities sworn to this one
 */
export async function getSubordinateDignities(dignityId, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all.filter(d => d.swornToId === dignityId);
  } catch (error) {
    logger.error('❌ Error getting subordinate dignities:', error);
    throw error;
  }
}

/**
 * Get the full feudal chain up to the Crown
 * Returns array from given dignity up to the apex
 * 
 * @param {number} dignityId - Starting dignity
 * @returns {Promise<Array>} Chain of dignities [given, superior, superior's superior, ...]
 */
export async function getFeudalChain(dignityId, datasetId = null) {
  try {
    const chain = [];
    let currentId = dignityId;
    const visited = new Set(); // Prevent infinite loops

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const dignity = await getDignity(currentId, datasetId);
      if (dignity) {
        chain.push(dignity);
        currentId = dignity.swornToId;
      } else {
        break;
      }
    }
    
    return chain;
  } catch (error) {
    logger.error('❌ Error getting feudal chain:', error);
    throw error;
  }
}

/**
 * Search dignities by name or place
 * 
 * @param {string} searchTerm - The search term
 * @returns {Promise<Array>} Matching dignities
 */
export async function searchDignities(searchTerm, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const term = searchTerm.toLowerCase();
    const all = await db.dignities.toArray();
    
    return all.filter(d => {
      if (d.name?.toLowerCase().includes(term)) return true;
      if (d.shortName?.toLowerCase().includes(term)) return true;
      if (d.placeName?.toLowerCase().includes(term)) return true;
      if (d.seatName?.toLowerCase().includes(term)) return true;
      if (d.notes?.toLowerCase().includes(term)) return true;
      return false;
    });
  } catch (error) {
    logger.error('❌ Error searching dignities:', error);
    throw error;
  }
}

/**
 * Get statistics about dignities
 * 
 * @returns {Promise<Object>} Statistics object
 */
export async function getDignityStatistics(datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    const tenures = await db.dignityTenures.toArray();

    // Count by class
    const byClass = {};
    all.forEach(d => {
      const cls = d.dignityClass || 'other';
      byClass[cls] = (byClass[cls] || 0) + 1;
    });

    // Count by rank
    const byRank = {};
    all.forEach(d => {
      if (d.dignityRank) {
        byRank[d.dignityRank] = (byRank[d.dignityRank] || 0) + 1;
      }
    });

    // Count by nature
    const byNature = {};
    all.forEach(d => {
      // Use stored nature, or infer from isHereditary for legacy data
      const nature = d.dignityNature || (d.isHereditary === false ? 'office' : 'territorial');
      byNature[nature] = (byNature[nature] || 0) + 1;
    });

    // Count vacant
    const vacant = all.filter(d => d.isVacant || !d.currentHolderId).length;

    // Count hereditary vs personal (legacy, derived from nature now)
    const hereditary = all.filter(d =>
      d.dignityNature === 'territorial' ||
      (d.dignityNature === undefined && d.isHereditary !== false)
    ).length;

    // Count with grant tracking
    const withGrantor = all.filter(d => d.grantedById).length;

    return {
      total: all.length,
      byClass,
      byRank,
      byNature,
      vacant,
      hereditary,
      personal: all.length - hereditary,
      withGrantor,
      totalTenures: tenures.length,
      withCodexEntry: all.filter(d => d.codexEntryId).length
    };
  } catch (error) {
    logger.error('❌ Error getting dignity statistics:', error);
    throw error;
  }
}

/**
 * Get recently updated dignities
 * 
 * @param {number} limit - Maximum number to return
 * @returns {Promise<Array>} Recent dignities
 */
export async function getRecentDignities(limit = 5, datasetId = null) {
  try {
    const db = getDatabase(datasetId);
    const all = await db.dignities.toArray();
    return all
      .sort((a, b) => new Date(b.updated) - new Date(a.updated))
      .slice(0, limit);
  } catch (error) {
    logger.error('❌ Error getting recent dignities:', error);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Format a dignity's full title with tenure styling
 * e.g., "Lord of Breakmount" or "Sir Edmund, Drithman of House Wilfrey"
 * 
 * @param {Object} dignity - The dignity record
 * @param {string} holderName - Optional name to include
 * @returns {string} Formatted title
 */
export function formatDignityTitle(dignity, holderName = null) {
  if (!dignity) return '';
  
  const parts = [];
  
  // If holder name provided and dignity is Sir, prefix with Sir
  if (holderName && dignity.dignityClass === 'sir') {
    parts.push(`Sir ${holderName}`);
  } else if (holderName) {
    parts.push(holderName);
  }
  
  // Add the dignity name
  if (dignity.name) {
    if (parts.length > 0) {
      parts.push(',');
    }
    parts.push(dignity.name);
  }
  
  return parts.join(' ').trim();
}

/**
 * Get the display icon for a dignity based on its rank
 * 
 * @param {Object} dignity - The dignity record
 * @returns {string} Icon character
 */
export function getDignityIcon(dignity) {
  if (!dignity) return '';
  
  // Use explicitly set icon first
  if (dignity.displayIcon && DISPLAY_ICONS[dignity.displayIcon]) {
    return DISPLAY_ICONS[dignity.displayIcon].icon;
  }
  
  // Otherwise derive from class/rank
  if (dignity.dignityClass === 'crown') return '♛';
  if (dignity.dignityRank === 'drihten') return '♛';
  if (dignity.dignityRank === 'drithen') return '♕';
  if (dignity.dignityClass === 'sir') return '⚔️';
  if (dignity.dignityClass === 'ward') return '🏰';
  if (dignity.dignityRank === 'drith' || dignity.dignityRank === 'drithling') return '★';
  
  return '';
}

/**
 * Get rank info for display
 * 
 * @param {string} dignityClass - The dignity class
 * @param {string} dignityRank - The dignity rank
 * @returns {Object|null} Rank information
 */
export function getRankInfo(dignityClass, dignityRank) {
  if (!dignityClass || !dignityRank) return null;
  const classRanks = DIGNITY_RANKS[dignityClass];
  if (!classRanks) return null;
  return classRanks[dignityRank] || null;
}

// ==================== SUCCESSION CALCULATION ====================

/**
 * Calculate the line of succession for a dignity
 * 
 * This is the core algorithm that determines who inherits based on:
 * - The dignity's succession type (male-primogeniture, absolute-primogeniture, etc.)
 * - The dignity's succession rules (exclude bastards, etc.)
 * - The family tree relationships
 * 
 * @param {number} dignityId - The dignity to calculate succession for
 * @param {Array} allPeople - All people in the database
 * @param {Map} parentMap - Map of childId -> [parentIds]
 * @param {Map} childrenMap - Map of parentId -> [childIds]
 * @param {Map} spouseMap - Map of personId -> spouseId
 * @param {number} maxDepth - Maximum generations to traverse (default 10)
 * @returns {Promise<Array>} Ordered array of succession candidates
 * 
 * Each candidate object:
 * {
 *   personId: number,
 *   position: number (1 = first in line),
 *   person: Object (full person record),
 *   relationship: string ("Son", "Grandson", "Brother", etc.),
 *   branch: string ("direct" | "collateral"),
 *   excluded: boolean (true if would be excluded by rules),
 *   exclusionReason: string | null
 * }
 */
export async function calculateSuccessionLine(
  dignityId,
  allPeople,
  parentMap,
  childrenMap,
  spouseMap,
  maxDepth = 10,
  datasetId = null
) {
  try {
    const dignity = await getDignity(dignityId, datasetId);
    if (!dignity) {
      logger.warn('Dignity not found for succession calculation');
      return [];
    }
    
    // If succession type doesn't support auto-calculation, return empty
    const successionType = SUCCESSION_TYPES[dignity.successionType];
    if (!successionType?.autoCalculate) {
      logger.log(`👑 Succession type '${dignity.successionType}' does not support auto-calculation`);
      
      // If there's a designated heir, return just them
      if (dignity.designatedHeirId) {
        const heir = allPeople.find(p => p.id === dignity.designatedHeirId);
        if (heir) {
          return [{
            personId: heir.id,
            position: 1,
            person: heir,
            relationship: 'Designated Heir',
            branch: 'designated',
            excluded: false,
            exclusionReason: null
          }];
        }
      }
      return [];
    }
    
    // Get current holder
    const currentHolderId = dignity.currentHolderId;
    if (!currentHolderId) {
      logger.log('👑 No current holder - cannot calculate succession');
      return [];
    }
    
    const currentHolder = allPeople.find(p => p.id === currentHolderId);
    if (!currentHolder) {
      logger.warn('Current holder not found in people list');
      return [];
    }
    
    const rules = dignity.successionRules || {};
    const candidates = [];
    const visited = new Set();
    
    // Build a lookup for people by ID
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    
    /**
     * Check if a person is eligible based on succession rules
     */
    const checkEligibility = (person) => {
      // Can't succeed if they're dead (unless we're doing historical "what if")
      if (person.dateOfDeath) {
        return { eligible: false, reason: 'Deceased' };
      }
      
      // Check gender for male-primogeniture
      if (dignity.successionType === 'male-primogeniture' && person.gender === 'female') {
        // Women can inherit if no males available - we'll handle this in ordering
        return { eligible: true, reason: null, lowerPriority: true };
      }
      
      // Check bastard status
      if (person.legitimacyStatus === 'bastard') {
        if (rules.excludeBastards) {
          // Check if legitimized
          if (person.bastardStatus === 'legitimized' && rules.legitimizedBastardsEligible) {
            return { eligible: true, reason: null, lowerPriority: true };
          }
          return { eligible: false, reason: 'Illegitimate birth' };
        }
      }
      
      return { eligible: true, reason: null };
    };
    
    /**
     * Get relationship description between two people
     */
    const getRelationshipDescription = (person, toHolder) => {
      // This is simplified - could be enhanced with RelationshipCalculator
      const parents = parentMap.get(person.id) || [];
      const holderChildren = childrenMap.get(toHolder.id) || [];
      
      if (holderChildren.includes(person.id)) {
        return person.gender === 'female' ? 'Daughter' : 'Son';
      }
      
      // Check if grandchild
      for (const childId of holderChildren) {
        const grandchildren = childrenMap.get(childId) || [];
        if (grandchildren.includes(person.id)) {
          return person.gender === 'female' ? 'Granddaughter' : 'Grandson';
        }
      }
      
      // Check if sibling
      const holderParents = parentMap.get(toHolder.id) || [];
      for (const parentId of holderParents) {
        const siblings = childrenMap.get(parentId) || [];
        if (siblings.includes(person.id)) {
          return person.gender === 'female' ? 'Sister' : 'Brother';
        }
      }
      
      // Check if niece/nephew
      for (const parentId of holderParents) {
        const siblings = childrenMap.get(parentId) || [];
        for (const siblingId of siblings) {
          if (siblingId === toHolder.id) continue;
          const niblings = childrenMap.get(siblingId) || [];
          if (niblings.includes(person.id)) {
            return person.gender === 'female' ? 'Niece' : 'Nephew';
          }
        }
      }
      
      // Check if uncle/aunt
      for (const parentId of holderParents) {
        const grandparents = parentMap.get(parentId) || [];
        for (const gpId of grandparents) {
          const unclesAunts = childrenMap.get(gpId) || [];
          if (unclesAunts.includes(person.id)) {
            return person.gender === 'female' ? 'Aunt' : 'Uncle';
          }
        }
      }
      
      // Check if cousin
      for (const parentId of holderParents) {
        const grandparents = parentMap.get(parentId) || [];
        for (const gpId of grandparents) {
          const unclesAunts = childrenMap.get(gpId) || [];
          for (const uaId of unclesAunts) {
            if (uaId === parentId) continue;
            const cousins = childrenMap.get(uaId) || [];
            if (cousins.includes(person.id)) {
              return 'Cousin';
            }
          }
        }
      }
      
      return 'Relative';
    };
    
    /**
     * Recursive traversal for primogeniture systems
     * Traverses depth-first through descendants, then collaterally
     */
    const traversePrimogeniture = (personId, depth, branch) => {
      if (depth > maxDepth || visited.has(personId)) return;
      visited.add(personId);
      
      const person = peopleById.get(personId);
      if (!person) return;
      
      // Skip the current holder themselves
      if (personId !== currentHolderId) {
        const eligibility = checkEligibility(person);
        candidates.push({
          personId: person.id,
          position: 0, // Will be assigned after sorting
          person,
          relationship: getRelationshipDescription(person, currentHolder),
          branch,
          excluded: !eligibility.eligible,
          exclusionReason: eligibility.reason,
          lowerPriority: eligibility.lowerPriority || false,
          birthDate: person.dateOfBirth,
          depth
        });
      }
      
      // Get children and sort by birth date
      const children = childrenMap.get(personId) || [];
      const sortedChildren = children
        .map(id => peopleById.get(id))
        .filter(p => p)
        .sort((a, b) => {
          // For male-primogeniture, males come before females
          if (dignity.successionType === 'male-primogeniture') {
            if (a.gender === 'male' && b.gender === 'female') return -1;
            if (a.gender === 'female' && b.gender === 'male') return 1;
          }
          // Then sort by birth date
          return (parseInt(a.dateOfBirth) || 9999) - (parseInt(b.dateOfBirth) || 9999);
        });
      
      // Traverse children depth-first
      for (const child of sortedChildren) {
        traversePrimogeniture(child.id, depth + 1, 'direct');
      }
    };
    
    /**
     * Traverse for agnatic seniority (oldest male first)
     * Need to gather all males in the dynasty and sort by age
     */
    const traverseAgnaticSeniority = () => {
      // Find all people in the same house/dynasty
      const houseId = currentHolder.houseId;
      const dynastyMembers = allPeople.filter(p => 
        p.houseId === houseId && 
        p.id !== currentHolderId &&
        p.gender === 'male' &&
        !p.dateOfDeath
      );
      
      // Sort by birth date (oldest first)
      dynastyMembers.sort((a, b) => 
        (parseInt(a.dateOfBirth) || 9999) - (parseInt(b.dateOfBirth) || 9999)
      );
      
      for (const person of dynastyMembers) {
        const eligibility = checkEligibility(person);
        candidates.push({
          personId: person.id,
          position: 0,
          person,
          relationship: getRelationshipDescription(person, currentHolder),
          branch: 'dynasty',
          excluded: !eligibility.eligible,
          exclusionReason: eligibility.reason,
          lowerPriority: false,
          birthDate: person.dateOfBirth,
          depth: 0
        });
      }
    };
    
    // Execute the appropriate traversal
    if (dignity.successionType === 'agnatic-seniority') {
      traverseAgnaticSeniority();
    } else {
      // Start with current holder's children
      traversePrimogeniture(currentHolderId, 0, 'direct');
      
      // Then traverse collateral lines (siblings and their descendants)
      const holderParents = parentMap.get(currentHolderId) || [];
      for (const parentId of holderParents) {
        const siblings = (childrenMap.get(parentId) || [])
          .filter(id => id !== currentHolderId);
        
        for (const siblingId of siblings) {
          traversePrimogeniture(siblingId, 1, 'collateral');
        }
        
        // Also check aunts/uncles
        const grandparents = parentMap.get(parentId) || [];
        for (const gpId of grandparents) {
          const unclesAunts = (childrenMap.get(gpId) || [])
            .filter(id => id !== parentId);
          
          for (const uaId of unclesAunts) {
            traversePrimogeniture(uaId, 2, 'collateral');
          }
        }
      }
    }
    
    // Sort candidates by succession order
    candidates.sort((a, b) => {
      // Excluded candidates go to the end
      if (a.excluded && !b.excluded) return 1;
      if (!a.excluded && b.excluded) return -1;
      
      // Lower priority (e.g., women in male-primogeniture) go after higher
      if (a.lowerPriority && !b.lowerPriority) return 1;
      if (!a.lowerPriority && b.lowerPriority) return -1;
      
      // Direct line before collateral
      if (a.branch === 'direct' && b.branch !== 'direct') return -1;
      if (a.branch !== 'direct' && b.branch === 'direct') return 1;
      
      // For agnatic seniority, sort purely by age
      if (dignity.successionType === 'agnatic-seniority') {
        return (parseInt(a.birthDate) || 9999) - (parseInt(b.birthDate) || 9999);
      }
      
      // For primogeniture, lower depth (closer generation) comes first
      if (a.depth !== b.depth) return a.depth - b.depth;
      
      // Within same generation, sort by birth date
      return (parseInt(a.birthDate) || 9999) - (parseInt(b.birthDate) || 9999);
    });
    
    // Assign positions
    let position = 1;
    for (const candidate of candidates) {
      candidate.position = position++;
      // Clean up internal sorting fields
      delete candidate.depth;
      delete candidate.birthDate;
      delete candidate.lowerPriority;
    }
    
    logger.log(`👑 Calculated succession for ${dignity.name}: ${candidates.length} candidates`);
    return candidates;
    
  } catch (error) {
    logger.error('❌ Error calculating succession line:', error);
    throw error;
  }
}

/**
 * Get the heir (first in line) for a dignity
 * 
 * @param {number} dignityId - The dignity ID
 * @param {Array} allPeople - All people
 * @param {Map} parentMap - Parent relationships
 * @param {Map} childrenMap - Children relationships  
 * @param {Map} spouseMap - Spouse relationships
 * @returns {Promise<Object|null>} The heir or null
 */
export async function getHeir(dignityId, allPeople, parentMap, childrenMap, spouseMap, datasetId = null) {
  const line = await calculateSuccessionLine(dignityId, allPeople, parentMap, childrenMap, spouseMap, 5, datasetId);
  const eligibleHeir = line.find(c => !c.excluded);
  return eligibleHeir || null;
}

// ==================== DISPUTE MANAGEMENT ====================

/**
 * Add a disputed claim to a dignity
 * 
 * @param {number} dignityId - The dignity being disputed
 * @param {Object} disputeData - The dispute details
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 * 
 * disputeData: {
 *   claimantId: number (person making the claim),
 *   claimType: string (from CLAIM_TYPES),
 *   claimStrength: string (from CLAIM_STRENGTHS),
 *   claimBasis: string (explanation of the claim),
 *   supportingFactions: string[] (who supports this claim),
 *   startDate: string (when claim was made),
 *   notes: string
 * }
 */
export async function addDispute(dignityId, disputeData, userId = null, datasetId = null) {
  try {
    const dignity = await getDignity(dignityId, datasetId);
    if (!dignity) throw new Error('Dignity not found');
    
    const dispute = {
      id: `dispute-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      claimantId: disputeData.claimantId,
      claimType: disputeData.claimType || 'hereditary',
      claimStrength: disputeData.claimStrength || 'moderate',
      claimBasis: disputeData.claimBasis || '',
      supportingFactions: disputeData.supportingFactions || [],
      startDate: disputeData.startDate || null,
      resolvedDate: null,
      resolution: 'ongoing',
      notes: disputeData.notes || null,
      created: new Date().toISOString()
    };
    
    const disputes = [...(dignity.disputes || []), dispute];
    
    // Update succession status if there are active disputes
    const activeDisputes = disputes.filter(d => d.resolution === 'ongoing');
    let successionStatus = dignity.successionStatus;
    if (activeDisputes.length > 0) {
      successionStatus = activeDisputes.length >= 2 ? 'crisis' : 'disputed';
    }
    
    await updateDignity(dignityId, { disputes, successionStatus }, userId, datasetId);

    logger.log(`⚔️ Dispute added to ${dignity.name}:`, dispute.id);
    return { ...dignity, disputes, successionStatus };
    
  } catch (error) {
    logger.error('❌ Error adding dispute:', error);
    throw error;
  }
}

/**
 * Update an existing dispute
 * 
 * @param {number} dignityId - The dignity ID
 * @param {string} disputeId - The dispute ID to update
 * @param {Object} updates - Fields to update
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 */
export async function updateDispute(dignityId, disputeId, updates, userId = null, datasetId = null) {
  try {
    const dignity = await getDignity(dignityId, datasetId);
    if (!dignity) throw new Error('Dignity not found');
    
    const disputes = (dignity.disputes || []).map(d => {
      if (d.id === disputeId) {
        return { ...d, ...updates };
      }
      return d;
    });
    
    // Recalculate succession status
    const activeDisputes = disputes.filter(d => d.resolution === 'ongoing');
    let successionStatus = 'stable';
    if (activeDisputes.length >= 2) {
      successionStatus = 'crisis';
    } else if (activeDisputes.length === 1) {
      successionStatus = 'disputed';
    }
    
    await updateDignity(dignityId, { disputes, successionStatus }, userId, datasetId);

    logger.log(`⚔️ Dispute updated: ${disputeId}`);
    return { ...dignity, disputes, successionStatus };
    
  } catch (error) {
    logger.error('❌ Error updating dispute:', error);
    throw error;
  }
}

/**
 * Resolve a dispute
 * 
 * @param {number} dignityId - The dignity ID
 * @param {string} disputeId - The dispute ID
 * @param {string} resolution - Resolution type (from DISPUTE_RESOLUTIONS)
 * @param {string} resolvedDate - When it was resolved
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 */
export async function resolveDispute(dignityId, disputeId, resolution, resolvedDate, userId = null, datasetId = null) {
  return updateDispute(dignityId, disputeId, {
    resolution,
    resolvedDate
  }, userId, datasetId);
}

/**
 * Remove a dispute entirely
 * 
 * @param {number} dignityId - The dignity ID
 * @param {string} disputeId - The dispute ID to remove
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 */
export async function removeDispute(dignityId, disputeId, userId = null, datasetId = null) {
  try {
    const dignity = await getDignity(dignityId, datasetId);
    if (!dignity) throw new Error('Dignity not found');
    
    const disputes = (dignity.disputes || []).filter(d => d.id !== disputeId);
    
    // Recalculate succession status
    const activeDisputes = disputes.filter(d => d.resolution === 'ongoing');
    let successionStatus = 'stable';
    if (activeDisputes.length >= 2) {
      successionStatus = 'crisis';
    } else if (activeDisputes.length === 1) {
      successionStatus = 'disputed';
    }
    
    await updateDignity(dignityId, { disputes, successionStatus }, userId, datasetId);

    logger.log(`⚔️ Dispute removed: ${disputeId}`);
    return { ...dignity, disputes, successionStatus };
    
  } catch (error) {
    logger.error('❌ Error removing dispute:', error);
    throw error;
  }
}

/**
 * Get all active disputes for a dignity
 * 
 * @param {number} dignityId - The dignity ID
 * @returns {Promise<Array>} Active disputes
 */
export async function getActiveDisputes(dignityId, datasetId = null) {
  try {
    const dignity = await getDignity(dignityId, datasetId);
    if (!dignity) return [];
    
    return (dignity.disputes || []).filter(d => d.resolution === 'ongoing');
  } catch (error) {
    logger.error('❌ Error getting active disputes:', error);
    return [];
  }
}

/**
 * Get all disputes across all dignities (for dashboard/overview)
 * 
 * @returns {Promise<Array>} All disputes with dignity info
 */
export async function getAllDisputes(datasetId = null) {
  try {
    const allDignities = await getAllDignities(datasetId);
    const allDisputes = [];
    
    for (const dignity of allDignities) {
      if (dignity.disputes && dignity.disputes.length > 0) {
        for (const dispute of dignity.disputes) {
          allDisputes.push({
            ...dispute,
            dignityId: dignity.id,
            dignityName: dignity.name
          });
        }
      }
    }
    
    return allDisputes;
  } catch (error) {
    logger.error('❌ Error getting all disputes:', error);
    return [];
  }
}

// ==================== INTERREGNUM/REGENCY ====================

/**
 * Set a dignity into interregnum (between rulers)
 * 
 * @param {number} dignityId - The dignity ID
 * @param {Object} interregnumData - Interregnum details
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 * 
 * interregnumData: {
 *   startDate: string,
 *   regentId: number | null (person acting as regent),
 *   regentTitle: string ("Lord Protector", "Queen Regent", etc.),
 *   reason: string (from INTERREGNUM_REASONS),
 *   notes: string
 * }
 */
export async function setInterregnum(dignityId, interregnumData, userId = null, datasetId = null) {
  try {
    const interregnum = {
      startDate: interregnumData.startDate || null,
      regentId: interregnumData.regentId || null,
      regentTitle: interregnumData.regentTitle || 'Regent',
      reason: interregnumData.reason || 'vacancy',
      notes: interregnumData.notes || null
    };

    await updateDignity(dignityId, {
      interregnum,
      successionStatus: 'interregnum'
    }, userId, datasetId);

    logger.log(`⏳ Interregnum set for dignity ${dignityId}`);
    return await getDignity(dignityId, datasetId);
    
  } catch (error) {
    logger.error('❌ Error setting interregnum:', error);
    throw error;
  }
}

/**
 * End an interregnum (new ruler takes over)
 * 
 * @param {number} dignityId - The dignity ID
 * @param {number} newHolderId - The new holder taking over
 * @param {string} [userId] - Optional user ID for cloud sync
 * @returns {Promise<Object>} The updated dignity
 */
export async function endInterregnum(dignityId, newHolderId, userId = null, datasetId = null) {
  try {
    await updateDignity(dignityId, {
      interregnum: null,
      currentHolderId: newHolderId,
      successionStatus: 'stable',
      isVacant: false
    }, userId, datasetId);

    logger.log(`⏳ Interregnum ended for dignity ${dignityId}, new holder: ${newHolderId}`);
    return await getDignity(dignityId, datasetId);
    
  } catch (error) {
    logger.error('❌ Error ending interregnum:', error);
    throw error;
  }
}

/**
 * Get dignities currently in interregnum
 * 
 * @returns {Promise<Array>} Dignities in interregnum
 */
export async function getDignitiesInInterregnum(datasetId = null) {
  try {
    const all = await getAllDignities(datasetId);
    return all.filter(d => d.successionStatus === 'interregnum' || d.interregnum);
  } catch (error) {
    logger.error('❌ Error getting dignities in interregnum:', error);
    return [];
  }
}

/**
 * Get dignities in crisis (succession disputed)
 * 
 * @returns {Promise<Array>} Dignities with succession issues
 */
export async function getDignitiesInCrisis(datasetId = null) {
  try {
    const all = await getAllDignities(datasetId);
    return all.filter(d => 
      d.successionStatus === 'crisis' || 
      d.successionStatus === 'disputed' ||
      (d.disputes && d.disputes.some(dispute => dispute.resolution === 'ongoing'))
    );
  } catch (error) {
    logger.error('❌ Error getting dignities in crisis:', error);
    return [];
  }
}

// ==================== EXPORTS ====================

export default {
  // Reference Data
  DIGNITY_CLASSES,
  DIGNITY_RANKS,
  DIGNITY_NATURES,
  TENURE_TYPES,
  FEALTY_TYPES,
  ACQUISITION_TYPES,
  END_TYPES,
  DISPLAY_ICONS,

  // Succession Reference Data
  SUCCESSION_TYPES,
  SUCCESSION_STATUS,
  CLAIM_TYPES,
  CLAIM_STRENGTHS,
  DISPUTE_RESOLUTIONS,
  INTERREGNUM_REASONS,

  // Nature Helpers
  natureHasSuccession,
  natureHasGrantTracking,
  natureHasTenureHistory,
  
  // CRUD - Dignities
  createDignity,
  getDignity,
  getAllDignities,
  updateDignity,
  deleteDignity,
  
  // CRUD - Tenures
  createDignityTenure,
  getTenuresForDignity,
  getTenuresForPerson,
  getCurrentTenure,
  updateDignityTenure,
  deleteDignityTenure,
  
  // Links
  linkDignityToEntity,
  getDignityLinks,
  getDignitiesForEntity,
  unlinkDignity,
  
  // Queries
  getDignitiesByClass,
  getDignitiesByRank,
  getDignitiesForHouse,
  getDignitiesForPerson,
  getSubordinateDignities,
  getFeudalChain,
  searchDignities,
  getDignityStatistics,
  getRecentDignities,
  
  // Succession
  calculateSuccessionLine,
  getHeir,
  
  // Disputes
  addDispute,
  updateDispute,
  resolveDispute,
  removeDispute,
  getActiveDisputes,
  getAllDisputes,
  
  // Interregnum/Regency
  setInterregnum,
  endInterregnum,
  getDignitiesInInterregnum,
  getDignitiesInCrisis,
  
  // Helpers
  formatDignityTitle,
  getDignityIcon,
  getRankInfo
};
