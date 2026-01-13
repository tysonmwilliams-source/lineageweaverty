/**
 * SmartDataValidator.js - Intelligent Data Validation for Lineageweaver
 * 
 * VERSION 2.1 - Enhanced with:
 * - Full database health scanning
 * - Additional validation rules
 * - Sibling validation
 * - Cross-house relationship checks
 * - Missing data detection
 * - SMART NAMESAKE DETECTION - understands genealogical naming patterns
 * 
 * PHILOSOPHY:
 * - Hard blocks for truly impossible scenarios (circular ancestry, etc.)
 * - Soft warnings for unlikely but possible scenarios (unusual age gaps)
 * - Fantasy-friendly - configurable for magical worlds where normal rules bend
 * - Namesake-aware - understands that families often reuse names across generations
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const VALIDATION_CONFIG = {
  // Parent-child age rules
  MIN_PARENT_AGE_DIFFERENCE: 12,
  MAX_PARENT_AGE_DIFFERENCE: 80,
  
  // Marriage rules
  MIN_MARRIAGE_AGE: 14,
  MAX_SPOUSE_AGE_GAP_WARNING: 50,
  
  // Sibling rules
  MAX_SIBLING_AGE_GAP: 40,
  
  // Namesake detection
  MIN_GENERATION_GAP_YEARS: 15,  // Years apart to be considered different generations
  
  // General rules
  ALLOW_SAME_SEX_MARRIAGE: true,
  ENFORCE_BIOLOGICAL_RULES: true,
  MAX_CHILDREN_WARNING: 20,
  ENFORCE_SPECIES_MATCHING: false,
  
  // Data completeness
  WARN_MISSING_BIRTH_DATE: true,
  WARN_MISSING_HOUSE: true,
  WARN_MISSING_GENDER: true,
  
  // Lifespan
  MAX_REASONABLE_LIFESPAN: 120,
  EXTREME_LIFESPAN_THRESHOLD: 200
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

function createResult() {
  return {
    isValid: true,
    hasErrors: false,
    hasWarnings: false,
    errors: [],
    warnings: []
  };
}

function addError(result, code, message, details = {}) {
  result.isValid = false;
  result.hasErrors = true;
  result.errors.push({ code, message, details, severity: 'error' });
}

function addWarning(result, code, message, details = {}) {
  result.hasWarnings = true;
  result.warnings.push({ code, message, details, severity: 'warning' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parts[1] ? parseInt(parts[1], 10) : 1;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;
  if (isNaN(year)) return null;
  return year * 10000 + month * 100 + day;
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const year = parseInt(dateStr.split('-')[0], 10);
  return isNaN(year) ? null : year;
}

function getPersonById(personId, people) {
  return people.find(p => p.id === personId || p.id === parseInt(personId, 10));
}

function getParentRelationships(personId, relationships) {
  return relationships.filter(r => 
    r.person2Id === personId && 
    (r.relationshipType === 'parent' || r.relationshipType === 'adopted-parent')
  );
}

function getChildrenRelationships(personId, relationships) {
  return relationships.filter(r => 
    r.person1Id === personId && 
    (r.relationshipType === 'parent' || r.relationshipType === 'adopted-parent')
  );
}

function getSpouseRelationships(personId, relationships) {
  return relationships.filter(r => 
    r.relationshipType === 'spouse' &&
    (r.person1Id === personId || r.person2Id === personId)
  );
}

function getSiblingIds(personId, relationships) {
  const parentRels = getParentRelationships(personId, relationships);
  const parentIds = parentRels.map(r => r.person1Id);
  
  if (parentIds.length === 0) return [];
  
  const siblingIds = new Set();
  for (const parentId of parentIds) {
    const parentChildren = getChildrenRelationships(parentId, relationships);
    for (const rel of parentChildren) {
      if (rel.person2Id !== personId) {
        siblingIds.add(rel.person2Id);
      }
    }
  }
  
  return Array.from(siblingIds);
}

function isAncestorOf(personAId, personBId, relationships, visited = new Set()) {
  if (visited.has(personBId)) return false;
  visited.add(personBId);
  
  const parentRels = getParentRelationships(personBId, relationships);
  
  for (const rel of parentRels) {
    const parentId = rel.person1Id;
    if (parentId === personAId) return true;
    if (isAncestorOf(personAId, parentId, relationships, visited)) return true;
  }
  
  return false;
}

function calculateNameSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);
  
  if (maxLen === 0) return 1;
  
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  const distance = matrix[len1][len2];
  return 1 - (distance / maxLen);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NAMESAKE / DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if two people are clearly different generations based on birth years
 */
function areDifferentGenerations(person1, person2, config = VALIDATION_CONFIG) {
  const year1 = extractYear(person1.dateOfBirth);
  const year2 = extractYear(person2.dateOfBirth);
  
  if (!year1 || !year2) return false;
  
  const ageDiff = Math.abs(year1 - year2);
  return ageDiff >= config.MIN_GENERATION_GAP_YEARS;
}

/**
 * Check if one person died before the other was born
 */
function oneDeadBeforeOtherBorn(person1, person2) {
  const death1 = extractYear(person1.dateOfDeath);
  const birth2 = extractYear(person2.dateOfBirth);
  const death2 = extractYear(person2.dateOfDeath);
  const birth1 = extractYear(person1.dateOfBirth);
  
  if (death1 && birth2 && death1 < birth2) return true;
  if (death2 && birth1 && death2 < birth1) return true;
  
  return false;
}

/**
 * Check if a name has a generational suffix (I, II, III, Jr, Sr, etc.)
 */
function hasGenerationalSuffix(firstName, lastName) {
  const fullName = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
  
  // Roman numerals at end
  if (/\s(i{1,3}|iv|v|vi{0,3}|ix|x)$/i.test(fullName)) return true;
  // Ordinals
  if (/\s(the\s+)?(first|second|third|fourth|fifth|elder|younger)$/i.test(fullName)) return true;
  // Jr/Sr
  if (/\s(jr\.?|sr\.?|junior|senior)$/i.test(fullName)) return true;
  
  return false;
}

/**
 * Check if two people have a "named-after" relationship
 */
function hasNamedAfterRelationship(person1Id, person2Id, relationships) {
  return relationships.some(r => 
    r.relationshipType === 'named-after' &&
    ((r.person1Id === person1Id && r.person2Id === person2Id) ||
     (r.person1Id === person2Id && r.person2Id === person1Id))
  );
}

/**
 * Smart duplicate/namesake analysis
 * Returns: { isLikelyDuplicate: boolean, reason: string, confidence: string }
 */
function analyzeNamesakeStatus(newPerson, existingPerson, relationships = [], acknowledgedPairs = []) {
  // Check if already acknowledged as not-duplicate
  const isAcknowledged = acknowledgedPairs.some(pair => 
    (pair.person1Id === newPerson.id && pair.person2Id === existingPerson.id) ||
    (pair.person1Id === existingPerson.id && pair.person2Id === newPerson.id)
  );
  
  if (isAcknowledged) {
    return { isLikelyDuplicate: false, confidence: 'acknowledged', reason: 'Previously acknowledged as different people' };
  }
  
  // Check for "named-after" relationship
  if (newPerson.id && hasNamedAfterRelationship(newPerson.id, existingPerson.id, relationships)) {
    return { isLikelyDuplicate: false, confidence: 'named-after', reason: 'Has "named after" relationship' };
  }
  
  // Check if clearly different generations (15+ years apart)
  if (areDifferentGenerations(newPerson, existingPerson)) {
    return { isLikelyDuplicate: false, confidence: 'generation', reason: 'Different generations (15+ years apart)' };
  }
  
  // Check if one died before the other was born
  if (oneDeadBeforeOtherBorn(newPerson, existingPerson)) {
    return { isLikelyDuplicate: false, confidence: 'lifespan', reason: 'Non-overlapping lifespans' };
  }
  
  // Check if either has a generational suffix
  const newHasSuffix = hasGenerationalSuffix(newPerson.firstName, newPerson.lastName);
  const existingHasSuffix = hasGenerationalSuffix(existingPerson.firstName, existingPerson.lastName);
  
  if (newHasSuffix || existingHasSuffix) {
    return { isLikelyDuplicate: false, confidence: 'suffix', reason: 'Has generational suffix (I, II, Jr, etc.)' };
  }
  
  // If we get here, could be a genuine duplicate
  return { 
    isLikelyDuplicate: true, 
    confidence: 'medium', 
    reason: 'Same name, similar timeframe - may be duplicate or namesake'
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSON VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validate a person's data
 * @param {Object} person - The person to validate
 * @param {Array} existingPeople - All existing people
 * @param {Object} options - Validation options including:
 *   - relationships: Array of all relationships (for namesake detection)
 *   - acknowledgedDuplicates: Array of acknowledged duplicate pairs
 */
export function validatePerson(person, existingPeople = [], options = {}) {
  const result = createResult();
  const config = { ...VALIDATION_CONFIG, ...options };
  const relationships = options.relationships || [];
  const acknowledgedDuplicates = options.acknowledgedDuplicates || [];
  
  // ── Required Fields ──────────────────────────────────────────────────────
  if (!person.firstName?.trim()) {
    addError(result, 'MISSING_FIRST_NAME', 'First name is required');
  }
  
  if (!person.lastName?.trim()) {
    addError(result, 'MISSING_LAST_NAME', 'Last name is required');
  }
  
  // ── Date Consistency ─────────────────────────────────────────────────────
  const birthDate = parseDate(person.dateOfBirth);
  const deathDate = parseDate(person.dateOfDeath);
  
  if (birthDate && deathDate && deathDate < birthDate) {
    addError(result, 'DEATH_BEFORE_BIRTH', 
      'Death date cannot be before birth date',
      { birthDate: person.dateOfBirth, deathDate: person.dateOfDeath }
    );
  }
  
  // Lifespan checks
  if (birthDate && deathDate) {
    const lifespan = extractYear(person.dateOfDeath) - extractYear(person.dateOfBirth);
    if (lifespan > config.EXTREME_LIFESPAN_THRESHOLD) {
      addWarning(result, 'EXTREME_LIFESPAN',
        `Lifespan of ${lifespan} years is unusually long`,
        { lifespan, species: person.species }
      );
    } else if (lifespan > config.MAX_REASONABLE_LIFESPAN && !person.species) {
      addWarning(result, 'LONG_LIFESPAN',
        `Lifespan of ${lifespan} years exceeds typical human lifespan`,
        { lifespan }
      );
    }
    
    if (lifespan < 0) {
      addError(result, 'NEGATIVE_LIFESPAN', 'Person cannot die before being born', { lifespan });
    }
  }
  
  // ── Date Format Validation ───────────────────────────────────────────────
  const dateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;
  
  if (person.dateOfBirth && !dateRegex.test(person.dateOfBirth)) {
    addError(result, 'INVALID_BIRTH_DATE_FORMAT',
      'Birth date must be YYYY, YYYY-MM, or YYYY-MM-DD',
      { value: person.dateOfBirth }
    );
  }
  
  if (person.dateOfDeath && !dateRegex.test(person.dateOfDeath)) {
    addError(result, 'INVALID_DEATH_DATE_FORMAT',
      'Death date must be YYYY, YYYY-MM, or YYYY-MM-DD',
      { value: person.dateOfDeath }
    );
  }
  
  // ── Smart Duplicate/Namesake Detection ───────────────────────────────────
  if (existingPeople.length > 0 && person.firstName && person.lastName) {
    const potentialMatches = existingPeople.filter(existing => {
      if (existing.id === person.id) return false;
      
      // Check for exact name match
      const exactMatch = 
        existing.firstName?.toLowerCase() === person.firstName.toLowerCase() &&
        existing.lastName?.toLowerCase() === person.lastName.toLowerCase();
      
      if (exactMatch) return true;
      
      // Check for similar names (same last name, similar first name)
      if (existing.lastName?.toLowerCase() === person.lastName.toLowerCase()) {
        const similarity = calculateNameSimilarity(
          existing.firstName?.toLowerCase() || '',
          person.firstName.toLowerCase()
        );
        if (similarity > 0.8) return true;
      }
      
      return false;
    });
    
    // For each potential match, run smart namesake analysis
    const trueDuplicates = [];
    const namesakes = [];
    
    for (const match of potentialMatches) {
      const analysis = analyzeNamesakeStatus(person, match, relationships, acknowledgedDuplicates);
      
      if (analysis.isLikelyDuplicate) {
        trueDuplicates.push({ person: match, analysis });
      } else {
        namesakes.push({ person: match, analysis });
      }
    }
    
    // Only warn about likely true duplicates
    if (trueDuplicates.length > 0) {
      const names = trueDuplicates.map(d => `${d.person.firstName} ${d.person.lastName}`).join(', ');
      addWarning(result, 'POTENTIAL_DUPLICATE',
        `Similar person(s) already exist: ${names}. If this is a namesake (named after an ancestor), you can acknowledge or create a "named after" relationship.`,
        { 
          duplicates: trueDuplicates.map(d => ({
            id: d.person.id,
            name: `${d.person.firstName} ${d.person.lastName}`,
            reason: d.analysis.reason
          })),
          isNamesakeCandidate: true
        }
      );
    }
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONSHIP VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

export function validateRelationship(relationship, people, existingRelationships = [], options = {}) {
  const result = createResult();
  const config = { ...VALIDATION_CONFIG, ...options };
  
  const person1 = getPersonById(relationship.person1Id, people);
  const person2 = getPersonById(relationship.person2Id, people);
  
  // Basic checks
  if (!person1) {
    addError(result, 'INVALID_PERSON1', 'First person not found');
    return result;
  }
  
  if (!person2) {
    addError(result, 'INVALID_PERSON2', 'Second person not found');
    return result;
  }
  
  if (relationship.person1Id === relationship.person2Id) {
    addError(result, 'SELF_RELATIONSHIP', 'Cannot create a relationship with oneself');
    return result;
  }
  
  // Duplicate check
  const isDuplicate = existingRelationships.some(existing => {
    if (existing.id === relationship.id) return false;
    const sameType = existing.relationshipType === relationship.relationshipType;
    const samePair = 
      (existing.person1Id === relationship.person1Id && existing.person2Id === relationship.person2Id) ||
      (existing.person1Id === relationship.person2Id && existing.person2Id === relationship.person1Id);
    return sameType && samePair;
  });
  
  if (isDuplicate) {
    addError(result, 'DUPLICATE_RELATIONSHIP',
      `This ${relationship.relationshipType} relationship already exists`,
      { type: relationship.relationshipType }
    );
  }
  
  // Type-specific validation
  switch (relationship.relationshipType) {
    case 'parent':
    case 'adopted-parent':
    case 'foster-parent':
      validateParentChildRelationship(result, person1, person2, existingRelationships, config);
      break;
    case 'spouse':
      validateSpouseRelationship(result, person1, person2, relationship, existingRelationships, config);
      break;
    case 'twin':
      validateTwinRelationship(result, person1, person2, existingRelationships, config);
      break;
    case 'mentor':
      validateMentorRelationship(result, person1, person2, config);
      break;
    case 'named-after':
      validateNamedAfterRelationship(result, person1, person2, config);
      break;
  }
  
  return result;
}

/**
 * Validate "named-after" relationship
 * Person1 is named after Person2 (Person2 is typically older/ancestor)
 */
function validateNamedAfterRelationship(result, namedPerson, honoredPerson, config) {
  // The person being honored should typically be older or already deceased
  if (namedPerson.dateOfBirth && honoredPerson.dateOfBirth) {
    const namedYear = extractYear(namedPerson.dateOfBirth);
    const honoredYear = extractYear(honoredPerson.dateOfBirth);
    
    if (namedYear && honoredYear && namedYear < honoredYear) {
      addWarning(result, 'NAMED_AFTER_YOUNGER',
        `${namedPerson.firstName} was born before ${honoredPerson.firstName} - unusual for a "named after" relationship`,
        { namedBirth: namedYear, honoredBirth: honoredYear }
      );
    }
  }
  
  // Names should be similar
  const similarity = calculateNameSimilarity(
    namedPerson.firstName?.toLowerCase() || '',
    honoredPerson.firstName?.toLowerCase() || ''
  );
  
  if (similarity < 0.5) {
    addWarning(result, 'NAMES_NOT_SIMILAR',
      `${namedPerson.firstName} and ${honoredPerson.firstName} have different names - are you sure this is a "named after" relationship?`,
      { similarity }
    );
  }
}

function validateParentChildRelationship(result, parent, child, existingRelationships, config) {
  if (isAncestorOf(child.id, parent.id, existingRelationships)) {
    addError(result, 'CIRCULAR_ANCESTRY',
      `${child.firstName} ${child.lastName} is already an ancestor of ${parent.firstName} ${parent.lastName}. This would create a circular family tree.`,
      { parentId: parent.id, childId: child.id }
    );
  }
  
  if (parent.dateOfBirth && child.dateOfBirth) {
    const parentBirthYear = extractYear(parent.dateOfBirth);
    const childBirthYear = extractYear(child.dateOfBirth);
    
    if (parentBirthYear && childBirthYear) {
      const ageDifference = childBirthYear - parentBirthYear;
      
      if (ageDifference < 0) {
        addError(result, 'PARENT_BORN_AFTER_CHILD',
          `${parent.firstName} (b. ${parentBirthYear}) cannot be a parent of ${child.firstName} (b. ${childBirthYear})`,
          { parentBirth: parentBirthYear, childBirth: childBirthYear }
        );
      } else if (ageDifference === 0) {
        addError(result, 'PARENT_SAME_AGE',
          `${parent.firstName} and ${child.firstName} were born in the same year`,
          { parentBirth: parentBirthYear, childBirth: childBirthYear }
        );
      } else if (ageDifference < config.MIN_PARENT_AGE_DIFFERENCE && config.ENFORCE_BIOLOGICAL_RULES) {
        addWarning(result, 'PARENT_TOO_YOUNG',
          `${parent.firstName} would have been only ${ageDifference} years old when ${child.firstName} was born`,
          { ageDifference }
        );
      } else if (ageDifference > config.MAX_PARENT_AGE_DIFFERENCE) {
        addWarning(result, 'EXTREME_PARENT_AGE',
          `${parent.firstName} would have been ${ageDifference} years old when ${child.firstName} was born`,
          { ageDifference }
        );
      }
    }
  }
  
  if (parent.dateOfDeath && child.dateOfBirth) {
    const parentDeathYear = extractYear(parent.dateOfDeath);
    const childBirthYear = extractYear(child.dateOfBirth);
    
    if (parentDeathYear && childBirthYear && childBirthYear > parentDeathYear + 1) {
      addError(result, 'PARENT_DEAD_AT_BIRTH',
        `${parent.firstName} died in ${parentDeathYear}, but ${child.firstName} was born in ${childBirthYear}`,
        {}
      );
    } else if (parentDeathYear && childBirthYear && childBirthYear === parentDeathYear + 1) {
      addWarning(result, 'POSSIBLE_POSTHUMOUS_BIRTH',
        `${child.firstName} may have been born after ${parent.firstName}'s death`,
        {}
      );
    }
  }
  
  const existingParents = getParentRelationships(child.id, existingRelationships);
  // Only warn if MORE than 2 parents (2 is normal!)
  if (existingParents.length > 2) {
    addWarning(result, 'MULTIPLE_PARENTS', `${child.firstName} already has ${existingParents.length} parents (more than 2)`, {});
  }
  
  const existingChildren = getChildrenRelationships(parent.id, existingRelationships);
  if (existingChildren.length >= config.MAX_CHILDREN_WARNING) {
    addWarning(result, 'MANY_CHILDREN', `${parent.firstName} already has ${existingChildren.length} children`, {});
  }
  
  const parentSiblings = getSiblingIds(parent.id, existingRelationships);
  if (parentSiblings.includes(child.id)) {
    addError(result, 'SIBLING_AS_CHILD', `${child.firstName} is already a sibling of ${parent.firstName}`, {});
  }
}

function validateSpouseRelationship(result, person1, person2, relationship, existingRelationships, config) {
  const person1Parents = getParentRelationships(person1.id, existingRelationships).map(r => r.person1Id);
  const person2Parents = getParentRelationships(person2.id, existingRelationships).map(r => r.person1Id);
  
  if (person1Parents.includes(person2.id)) {
    addError(result, 'MARRYING_PARENT', `${person1.firstName} cannot marry their parent ${person2.firstName}`, {});
  }
  if (person2Parents.includes(person1.id)) {
    addError(result, 'MARRYING_PARENT', `${person2.firstName} cannot marry their parent ${person1.firstName}`, {});
  }
  
  const sharedParents = person1Parents.filter(p => person2Parents.includes(p));
  if (sharedParents.length > 0) {
    addError(result, 'MARRYING_SIBLING', `${person1.firstName} and ${person2.firstName} share a parent`, {});
  }
  
  if (relationship.marriageDate) {
    const marriageDate = parseDate(relationship.marriageDate);
    
    if (person1.dateOfDeath && marriageDate && marriageDate > parseDate(person1.dateOfDeath)) {
      addError(result, 'MARRIED_AFTER_DEATH', `Cannot marry ${person1.firstName} after their death`, {});
    }
    if (person2.dateOfDeath && marriageDate && marriageDate > parseDate(person2.dateOfDeath)) {
      addError(result, 'MARRIED_AFTER_DEATH', `Cannot marry ${person2.firstName} after their death`, {});
    }
    
    if (person1.dateOfBirth && marriageDate && marriageDate < parseDate(person1.dateOfBirth)) {
      addError(result, 'MARRIED_BEFORE_BIRTH', `Marriage date is before ${person1.firstName}'s birth`, {});
    }
    if (person2.dateOfBirth && marriageDate && marriageDate < parseDate(person2.dateOfBirth)) {
      addError(result, 'MARRIED_BEFORE_BIRTH', `Marriage date is before ${person2.firstName}'s birth`, {});
    }
    
    if (config.ENFORCE_BIOLOGICAL_RULES) {
      const marriageYear = extractYear(relationship.marriageDate);
      
      if (person1.dateOfBirth && marriageYear) {
        const age = marriageYear - extractYear(person1.dateOfBirth);
        if (age < config.MIN_MARRIAGE_AGE) {
          addWarning(result, 'MARRIED_TOO_YOUNG', `${person1.firstName} would have been ${age} years old at marriage`, {});
        }
      }
      if (person2.dateOfBirth && marriageYear) {
        const age = marriageYear - extractYear(person2.dateOfBirth);
        if (age < config.MIN_MARRIAGE_AGE) {
          addWarning(result, 'MARRIED_TOO_YOUNG', `${person2.firstName} would have been ${age} years old at marriage`, {});
        }
      }
    }
  }
  
  if (relationship.marriageDate && relationship.divorceDate) {
    if (parseDate(relationship.divorceDate) < parseDate(relationship.marriageDate)) {
      addError(result, 'DIVORCE_BEFORE_MARRIAGE', 'Divorce date cannot be before marriage date', {});
    }
  }
  
  if (person1.dateOfBirth && person2.dateOfBirth) {
    const ageGap = Math.abs(extractYear(person1.dateOfBirth) - extractYear(person2.dateOfBirth));
    if (ageGap > config.MAX_SPOUSE_AGE_GAP_WARNING) {
      addWarning(result, 'LARGE_SPOUSE_AGE_GAP', `Age difference of ${ageGap} years between spouses`, {});
    }
  }
  
  const person1Marriages = getSpouseRelationships(person1.id, existingRelationships);
  const person2Marriages = getSpouseRelationships(person2.id, existingRelationships);
  
  const activeMarriage1 = person1Marriages.find(m => m.id !== relationship.id && m.marriageStatus === 'married');
  const activeMarriage2 = person2Marriages.find(m => m.id !== relationship.id && m.marriageStatus === 'married');
  
  if (activeMarriage1 && relationship.marriageStatus === 'married') {
    addWarning(result, 'ALREADY_MARRIED', `${person1.firstName} is already in an active marriage`, {});
  }
  if (activeMarriage2 && relationship.marriageStatus === 'married') {
    addWarning(result, 'ALREADY_MARRIED', `${person2.firstName} is already in an active marriage`, {});
  }
}

function validateTwinRelationship(result, person1, person2, existingRelationships, config) {
  if (person1.dateOfBirth && person2.dateOfBirth) {
    const year1 = extractYear(person1.dateOfBirth);
    const year2 = extractYear(person2.dateOfBirth);
    if (year1 && year2 && year1 !== year2) {
      addWarning(result, 'TWIN_BIRTH_YEAR_MISMATCH', `Twins have different birth years (${year1} vs ${year2})`, {});
    }
  }
  
  const parents1 = getParentRelationships(person1.id, existingRelationships).map(r => r.person1Id);
  const parents2 = getParentRelationships(person2.id, existingRelationships).map(r => r.person1Id);
  
  if (parents1.length > 0 && parents2.length > 0) {
    const sharedParents = parents1.filter(p => parents2.includes(p));
    if (sharedParents.length === 0) {
      addWarning(result, 'TWINS_NO_SHARED_PARENT', `Twins don't share any parents`, {});
    }
  }
  
  if (person1.houseId && person2.houseId && person1.houseId !== person2.houseId) {
    addWarning(result, 'TWINS_DIFFERENT_HOUSES', `Twins belong to different houses`, {});
  }
}

function validateMentorRelationship(result, mentor, apprentice, config) {
  if (mentor.dateOfBirth && apprentice.dateOfBirth) {
    const ageDiff = extractYear(apprentice.dateOfBirth) - extractYear(mentor.dateOfBirth);
    if (ageDiff <= 0) {
      addWarning(result, 'MENTOR_YOUNGER', `Mentor is the same age or younger than apprentice`, {});
    }
  }
  
  if (mentor.dateOfDeath && apprentice.dateOfBirth) {
    if (extractYear(mentor.dateOfDeath) < extractYear(apprentice.dateOfBirth)) {
      addError(result, 'MENTOR_DEAD_BEFORE_APPRENTICE_BORN', `Mentor died before apprentice was born`, {});
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

export function runHealthCheck(data, options = {}) {
  const { people, relationships, houses, acknowledgedDuplicates = [] } = data;
  const config = { ...VALIDATION_CONFIG, ...options };
  
  const report = {
    summary: {
      totalPeople: people.length,
      totalRelationships: relationships.length,
      totalHouses: houses.length,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0
    },
    personIssues: [],
    relationshipIssues: [],
    structuralIssues: [],
    missingData: [],
    suggestions: []
  };
  
  // Check each person
  for (const person of people) {
    const personResult = validatePerson(person, people, { 
      ...config, 
      relationships, 
      acknowledgedDuplicates 
    });
    
    if (personResult.hasErrors || personResult.hasWarnings) {
      report.personIssues.push({
        personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        errors: personResult.errors,
        warnings: personResult.warnings
      });
      report.summary.errorCount += personResult.errors.length;
      report.summary.warningCount += personResult.warnings.length;
    }
    
    // Missing data checks
    if (config.WARN_MISSING_BIRTH_DATE && !person.dateOfBirth) {
      report.missingData.push({
        type: 'person', personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        field: 'dateOfBirth',
        message: `${person.firstName} ${person.lastName} has no birth date`
      });
    }
    if (config.WARN_MISSING_HOUSE && !person.houseId) {
      report.missingData.push({
        type: 'person', personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        field: 'houseId',
        message: `${person.firstName} ${person.lastName} is not assigned to a house`
      });
    }
    if (config.WARN_MISSING_GENDER && !person.gender) {
      report.missingData.push({
        type: 'person', personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        field: 'gender',
        message: `${person.firstName} ${person.lastName} has no gender specified`
      });
    }
  }
  
  // Check relationships
  for (const rel of relationships) {
    const relResult = validateRelationship(rel, people, relationships, config);
    
    if (relResult.hasErrors || relResult.hasWarnings) {
      const person1 = getPersonById(rel.person1Id, people);
      const person2 = getPersonById(rel.person2Id, people);
      
      report.relationshipIssues.push({
        relationshipId: rel.id,
        relationshipType: rel.relationshipType,
        person1: person1 ? `${person1.firstName} ${person1.lastName}` : `Unknown (${rel.person1Id})`,
        person2: person2 ? `${person2.firstName} ${person2.lastName}` : `Unknown (${rel.person2Id})`,
        errors: relResult.errors,
        warnings: relResult.warnings
      });
      report.summary.errorCount += relResult.errors.length;
      report.summary.warningCount += relResult.warnings.length;
    }
  }
  
  // Structural checks
  const personIds = new Set(people.map(p => p.id));
  for (const rel of relationships) {
    if (!personIds.has(rel.person1Id)) {
      report.structuralIssues.push({
        type: 'ORPHANED_RELATIONSHIP', severity: 'error',
        message: `Relationship ${rel.id} references non-existent person ${rel.person1Id}`,
        relationshipId: rel.id, missingPersonId: rel.person1Id
      });
      report.summary.errorCount++;
    }
    if (!personIds.has(rel.person2Id)) {
      report.structuralIssues.push({
        type: 'ORPHANED_RELATIONSHIP', severity: 'error',
        message: `Relationship ${rel.id} references non-existent person ${rel.person2Id}`,
        relationshipId: rel.id, missingPersonId: rel.person2Id
      });
      report.summary.errorCount++;
    }
  }
  
  const houseIds = new Set(houses.map(h => h.id));
  for (const person of people) {
    if (person.houseId && !houseIds.has(person.houseId)) {
      report.structuralIssues.push({
        type: 'ORPHANED_HOUSE_REFERENCE', severity: 'error',
        message: `${person.firstName} ${person.lastName} references non-existent house`,
        personId: person.id, missingHouseId: person.houseId
      });
      report.summary.errorCount++;
    }
  }
  
  for (const house of houses) {
    const membersCount = people.filter(p => p.houseId === house.id).length;
    if (membersCount === 0) {
      report.structuralIssues.push({
        type: 'EMPTY_HOUSE', severity: 'warning',
        message: `${house.houseName} has no members`,
        houseId: house.id
      });
      report.summary.warningCount++;
    }
  }
  
  // Suggestions
  for (const person of people) {
    const hasRelationships = relationships.some(r => 
      r.person1Id === person.id || r.person2Id === person.id
    );
    if (!hasRelationships) {
      report.suggestions.push({
        type: 'ISOLATED_PERSON', personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        message: `${person.firstName} ${person.lastName} has no relationships`
      });
      report.summary.infoCount++;
    }
    
    // Single parent check - but DON'T flag for bastards, commoners, adopted, or unknown
    // These statuses commonly have incomplete parental records and that's okay
    const parentRels = getParentRelationships(person.id, relationships);
    const status = person.legitimacyStatus?.toLowerCase();
    const skipSingleParentWarning = ['bastard', 'commoner', 'adopted', 'unknown'].includes(status);
    
    if (parentRels.length === 1 && !skipSingleParentWarning) {
      report.suggestions.push({
        type: 'SINGLE_PARENT', personId: person.id,
        personName: `${person.firstName} ${person.lastName}`,
        message: `${person.firstName} ${person.lastName} has only one parent recorded`
      });
      report.summary.infoCount++;
    }
  }
  
  return report;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASCADE SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function generateCascadeSuggestions(changeType, changeData, context) {
  const suggestions = [];
  const { people, relationships } = context;
  
  if (changeType === 'relationship_add') {
    if (changeData.relationshipType === 'parent') {
      const parentId = changeData.person1Id;
      const childId = changeData.person2Id;
      const parentSpouses = getSpouseRelationships(parentId, relationships);
      
      for (const spouseRel of parentSpouses) {
        const spouseId = spouseRel.person1Id === parentId ? spouseRel.person2Id : spouseRel.person1Id;
        const existingParentRel = relationships.find(r =>
          (r.relationshipType === 'parent' || r.relationshipType === 'adopted-parent') &&
          r.person1Id === spouseId && r.person2Id === childId
        );
        
        if (!existingParentRel) {
          const spouse = getPersonById(spouseId, people);
          const child = getPersonById(childId, people);
          if (spouse && child) {
            suggestions.push({
              type: 'ADD_SECOND_PARENT',
              message: `Add ${spouse.firstName} ${spouse.lastName} as ${child.firstName}'s other parent?`,
              action: { type: 'addRelationship', data: { person1Id: spouseId, person2Id: childId, relationshipType: 'parent' } }
            });
          }
        }
      }
    }
  }
  
  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  validatePerson,
  validateRelationship,
  generateCascadeSuggestions,
  runHealthCheck,
  analyzeNamesakeStatus,
  VALIDATION_CONFIG
};
