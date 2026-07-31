/**
 * The succession algorithm as it stood before decision D1.
 *
 * Preserved deliberately, and used by exactly one thing: the change report,
 * which has to show the owner what the corrected rules move. Once
 * calculateSuccessionLine was swapped over, comparing it against the new rules
 * compared the new rules with themselves — a report that could only ever say
 * "nothing changed". Three tests caught that immediately, which is the argument
 * for having written them.
 *
 * **Do not use this for anything else.** It is wrong in three known ways, all
 * of them confirmed against the code and all of them the reason D1 exists:
 *
 *   1. It walks the descent tree depth-first and then sorts by generation,
 *      discarding the walk. A grandson through the eldest son ranks behind the
 *      second son.
 *   2. A predeceased heir is flagged excluded and sorted to the end, taking his
 *      line's position with him — so representation is impossible.
 *   3. Women are demoted below every man anywhere in the tree, not merely
 *      within a sibling set.
 *
 * Kept verbatim apart from taking a dignity object instead of fetching one, so
 * that what it reproduces is genuinely the old behaviour and not an
 * approximation of it.
 */
import { SUCCESSION_TYPES } from './dignityService';
import { logger } from '../utils/logger';

export function legacySuccessionLine(
  dignity,
  allPeople,
  parentMap,
  childrenMap,
  spouseMap,
  maxDepth = 10
) {
  try {
    if (!dignity) return [];
    
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
      // `const parents = parentMap.get(person.id)` sat here unused in the
      // original. Dropped rather than preserved — an unused local is not
      // behaviour, and the lint gate should stay at zero.
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
