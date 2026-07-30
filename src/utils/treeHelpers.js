/**
 * Tree Helper Utilities
 *
 * Pure utility functions extracted from FamilyTree.jsx for:
 * - Text measurement and truncation
 * - Color harmonization for themes
 * - House scoping (determining which people to show)
 * - Fragment detection (disconnected family branches)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT MEASUREMENT AND TRUNCATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate the pixel width of text based on character count and font size
 * Uses average character width ratios for proportional fonts
 */
import { logger } from './logger';

export function estimateTextWidth(text, fontSize, isBold = false) {
  const avgCharRatio = isBold ? 0.58 : 0.52;
  return text.length * fontSize * avgCharRatio;
}

/**
 * Truncate text to fit within a max width, adding ellipsis if needed
 * Returns an object with truncated text and full text for tooltips
 */
export function truncateText(text, maxWidth, fontSize, isBold = false) {
  if (!text) return { text: '', truncated: false, fullText: '' };

  const fullText = text;
  const estimatedWidth = estimateTextWidth(text, fontSize, isBold);

  if (estimatedWidth <= maxWidth) {
    return { text, truncated: false, fullText };
  }

  const ellipsis = '…';
  const ellipsisWidth = estimateTextWidth(ellipsis, fontSize, isBold);
  const availableWidth = maxWidth - ellipsisWidth;
  const avgCharWidth = fontSize * (isBold ? 0.58 : 0.52);
  const maxChars = Math.floor(availableWidth / avgCharWidth);

  const truncated = text.slice(0, Math.max(maxChars, 3)) + ellipsis;
  return { text: truncated, truncated: true, fullText };
}

/**
 * Truncate a person's name intelligently:
 * - Try full name first
 * - Then "FirstName L…" (abbreviated last name)
 * - Finally, truncate the whole thing
 */
export function truncateName(firstName, lastName, maxWidth, fontSize) {
  const fullName = `${firstName} ${lastName}`;
  const fullWidth = estimateTextWidth(fullName, fontSize, true);

  if (fullWidth <= maxWidth) {
    return { text: fullName, truncated: false, fullText: fullName };
  }

  const abbreviated = `${firstName} ${lastName.charAt(0)}…`;
  const abbrevWidth = estimateTextWidth(abbreviated, fontSize, true);

  if (abbrevWidth <= maxWidth) {
    return { text: abbreviated, truncated: true, fullText: fullName };
  }

  return truncateText(fullName, maxWidth, fontSize, true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLOR HARMONIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Harmonize a house color with the current theme
 * - Dark theme: desaturate and blend with warm brown
 * - Light theme: desaturate and blend with warm cream
 *
 * @param {string} hexColor - The hex color to harmonize (e.g., "#ff5500")
 * @param {boolean} isDark - Whether dark theme is active
 * @returns {string} Harmonized hex color
 */
export function harmonizeColor(hexColor, isDark) {
  const hex = hexColor.replace('#', '');
  let r = parseInt(hex.substr(0, 2), 16);
  let g = parseInt(hex.substr(2, 2), 16);
  let b = parseInt(hex.substr(4, 2), 16);

  if (isDark) {
    const warmBrown = { r: 120, g: 100, b: 80 };
    const desaturationAmount = 0.5;
    r = Math.round(r * (1 - desaturationAmount) + warmBrown.r * desaturationAmount);
    g = Math.round(g * (1 - desaturationAmount) + warmBrown.g * desaturationAmount);
    b = Math.round(b * (1 - desaturationAmount) + warmBrown.b * desaturationAmount);
    const darkenAmount = 0.7;
    r = Math.round(r * darkenAmount);
    g = Math.round(g * darkenAmount);
    b = Math.round(b * darkenAmount);
  } else {
    const warmCream = { r: 180, g: 160, b: 140 };
    const desaturationAmount = 0.4;
    r = Math.round(r * (1 - desaturationAmount) + warmCream.r * desaturationAmount);
    g = Math.round(g * (1 - desaturationAmount) + warmCream.g * desaturationAmount);
    b = Math.round(b * (1 - desaturationAmount) + warmCream.b * desaturationAmount);
    const adjustAmount = 0.8;
    r = Math.round(r * adjustAmount);
    g = Math.round(g * adjustAmount);
    b = Math.round(b * adjustAmount);
  }

  const toHex = (n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOUSE SCOPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Determine if a house is a bastard-elevation cadet branch.
 * Uses cadetTier/foundingType as primary, falls back to Dum/Dun name prefix for legacy data.
 */
export function isBastardCadet(house) {
  if (!house) return false;
  if (house.cadetTier === 2 || house.foundingType === 'bastard-elevation') return true;
  if (house.cadetTier === 1) return false;
  return /^(Dum|Dun)/i.test(house.houseName);
}

/**
 * Get the set of house IDs that are "in scope" for a target house
 * Includes noble cadets (tier 1) when includeCadets is true.
 * Bastard-elevation cadets (tier 2 / Dum/Dun prefix) are always excluded —
 * they get their own separate tree views.
 */
export function getHouseIdsInScope(targetHouseId, allHouses, includeCadets) {
  const houseIds = new Set([targetHouseId]);

  if (includeCadets) {
    allHouses.forEach(house => {
      if (house.parentHouseId === targetHouseId && !isBastardCadet(house)) {
        houseIds.add(house.id);
      }
    });
  }

  return houseIds;
}

/**
 * Get all people IDs that should be visible when viewing a specific house
 * Includes:
 * - Direct house members
 * - Spouses of house members
 * - Ancestors of house members (following lineage up)
 * - Descendants of house members (following lineage down)
 */
export function getHouseScopedPeopleIds(
  targetHouseId,
  allPeople,
  allHouses,
  spouseMap,
  childrenMap,
  parentMap,
  includeCadets,
  personallySwornPeople = []
) {
  const scopedIds = new Set();
  const houseIds = getHouseIdsInScope(targetHouseId, allHouses, includeCadets);

  const peopleById = new Map(allPeople.map(p => [p.id, p]));
  const isHouseMember = (personId) => {
    const person = peopleById.get(personId);
    return person && houseIds.has(person.houseId);
  };

  // Start with direct house members
  const directMembers = allPeople.filter(p => houseIds.has(p.houseId));
  directMembers.forEach(p => scopedIds.add(p.id));

  // Add spouses of direct members
  directMembers.forEach(p => {
    const spouseId = spouseMap.get(p.id);
    if (spouseId) {
      scopedIds.add(spouseId);
    }
  });

  // One visited set shared across every walk below.
  //
  // These defaulted to `new Set()` per call, so each of the N seed calls
  // re-walked ground the previous ones had already covered — O(n²) on every
  // redraw. Sharing the set makes the whole scoping pass linear, and is
  // correct here because all we ever do is accumulate into scopedIds.
  const ancestorsVisited = new Set();
  const descendantsVisited = new Set();

  // Recursively find ancestors
  const findAncestors = (personId, visited = ancestorsVisited) => {
    if (visited.has(personId)) return;
    visited.add(personId);

    const person = peopleById.get(personId);
    if (!person) return;

    const parents = parentMap.get(personId) || [];
    parents.forEach(parentId => {
      scopedIds.add(parentId);
      const parentSpouseId = spouseMap.get(parentId);
      if (parentSpouseId) {
        scopedIds.add(parentSpouseId);
      }
      if (isHouseMember(parentId)) {
        findAncestors(parentId, visited);
      }
    });
  };

  directMembers.forEach(p => findAncestors(p.id));

  // Recursively find descendants
  const findDescendants = (personId, visited = descendantsVisited) => {
    if (visited.has(personId)) return;
    visited.add(personId);

    const person = peopleById.get(personId);
    if (!person) return;

    if (!isHouseMember(personId)) {
      return;
    }

    const children = childrenMap.get(personId) || [];
    children.forEach(childId => {
      scopedIds.add(childId);
      const childSpouseId = spouseMap.get(childId);
      if (childSpouseId) {
        scopedIds.add(childSpouseId);
      }
      findDescendants(childId, visited);
    });
  };

  directMembers.forEach(p => findDescendants(p.id));

  // Also find descendants for any house members we picked up along the way
  Array.from(scopedIds).forEach(id => {
    if (isHouseMember(id)) {
      findDescendants(id);
    }
  });

  // Add people personally sworn to this house (from bastard-elevation cadets)
  personallySwornPeople.forEach(p => {
    scopedIds.add(p.id);
    // Include their spouses too
    const spouseId = spouseMap.get(p.id);
    if (spouseId) scopedIds.add(spouseId);
  });

  return scopedIds;
}

/**
 * Find the root person for a house view
 * Prefers the oldest person without parents in the scope
 */
export function findRootPersonForHouse(
  scopedPeopleIds,
  peopleById,
  parentMap,
  centreOn
) {
  // If a specific person is requested and in scope, use them
  if (centreOn !== 'auto' && scopedPeopleIds.has(centreOn)) {
    return centreOn;
  }

  const scopedPeople = Array.from(scopedPeopleIds)
    .map(id => peopleById.get(id))
    .filter(p => p);

  // Find people without parents (root candidates)
  const rootCandidates = scopedPeople.filter(p => !parentMap.has(p.id));

  if (rootCandidates.length > 0) {
    rootCandidates.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
    return rootCandidates[0].id;
  }

  // Fallback: oldest person in scope
  scopedPeople.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
  return scopedPeople[0]?.id || null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAGMENT DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect disconnected fragments (separate family branches) within a house
 * Uses union-find style connected component detection
 *
 * Returns an array of fragment objects, each containing:
 * - peopleIds: Set of person IDs in this fragment
 * - rootPerson: The oldest person without parents
 * - memberCount: Number of people in the fragment
 * - houseMembers: Array of person objects in this fragment
 */
export function detectFragments(
  houseMembers,
  spouseMap,
  parentMap,
  childrenMap
) {
  if (houseMembers.length === 0) return [];

  // Build connection graph
  const connections = new Map();

  houseMembers.forEach(person => {
    if (!connections.has(person.id)) {
      connections.set(person.id, new Set());
    }

    // Spouse connection
    const spouseId = spouseMap.get(person.id);
    if (spouseId) {
      connections.get(person.id).add(spouseId);
      if (!connections.has(spouseId)) connections.set(spouseId, new Set());
      connections.get(spouseId).add(person.id);
    }

    // Parent connections
    const parents = parentMap.get(person.id) || [];
    parents.forEach(parentId => {
      connections.get(person.id).add(parentId);
      if (!connections.has(parentId)) connections.set(parentId, new Set());
      connections.get(parentId).add(person.id);
    });

    // Children connections
    const children = childrenMap.get(person.id) || [];
    children.forEach(childId => {
      connections.get(person.id).add(childId);
      if (!connections.has(childId)) connections.set(childId, new Set());
      connections.get(childId).add(person.id);
    });
  });

  // Find connected components using BFS
  const visited = new Set();
  const fragments = [];

  houseMembers.forEach(person => {
    if (visited.has(person.id)) return;

    const fragment = new Set();
    const queue = [person.id];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (visited.has(currentId)) continue;

      visited.add(currentId);
      fragment.add(currentId);

      const connected = connections.get(currentId) || new Set();
      connected.forEach(connectedId => {
        if (!visited.has(connectedId)) {
          queue.push(connectedId);
        }
      });
    }

    // Find root person for this fragment
    const fragmentPeople = houseMembers.filter(p => fragment.has(p.id));
    const rootCandidates = fragmentPeople.filter(p => !parentMap.has(p.id));

    let rootPerson;
    if (rootCandidates.length > 0) {
      rootCandidates.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
      rootPerson = rootCandidates[0];
    } else {
      fragmentPeople.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
      rootPerson = fragmentPeople[0];
    }

    fragments.push({
      peopleIds: fragment,
      rootPerson: rootPerson,
      memberCount: fragment.size,
      houseMembers: fragmentPeople
    });
  });

  // Sort fragments by root person's birth date
  fragments.sort((a, b) => parseInt(a.rootPerson.dateOfBirth) - parseInt(b.rootPerson.dateOfBirth));

  return fragments;
}

/**
 * Find lineage gap connections between fragments
 * Lineage gaps are special relationships that connect fragments that
 * would otherwise be disconnected (e.g., distant cousins)
 */
export function getLineageGapConnections(fragments, allRelationships, peopleById) {
  const lineageGaps = allRelationships.filter(r => r.relationshipType === 'lineage-gap');
  const connections = [];

  lineageGaps.forEach(gap => {
    const descendant = peopleById.get(gap.person1Id);
    const ancestor = peopleById.get(gap.person2Id);
    if (!descendant || !ancestor) return;

    let descendantFragment = null;
    let ancestorFragment = null;

    fragments.forEach((frag, index) => {
      if (frag.peopleIds.has(gap.person1Id)) descendantFragment = index;
      if (frag.peopleIds.has(gap.person2Id)) ancestorFragment = index;
    });

    if (descendantFragment !== null && ancestorFragment !== null && descendantFragment !== ancestorFragment) {
      connections.push({
        ...gap,
        descendant,
        ancestor,
        descendantFragmentIndex: descendantFragment,
        ancestorFragmentIndex: ancestorFragment
      });
    }
  });

  return connections;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect generations using BFS from a root person.
 * Returns an array of arrays, where each inner array contains person IDs in that generation.
 *
 * @param {Map} peopleById - Map of personId -> person object (scoped to fragment)
 * @param {Map} parentMap - Map of childId -> [parentIds]
 * @param {Map} childrenMap - Map of parentId -> [childIds]
 * @param {Map} spouseMap - Map of personId -> spouseId
 * @param {number|null} overrideRootId - Optional person ID to use as root
 * @returns {Array<Array<number>>} Array of generation arrays
 */
export function detectGenerations(peopleById, parentMap, childrenMap, spouseMap, overrideRootId = null) {
  let rootPerson;

  if (overrideRootId && peopleById.has(overrideRootId)) {
    rootPerson = peopleById.get(overrideRootId);
    logger.log(`Using override root: ${rootPerson.firstName} ${rootPerson.lastName}`);
  } else {
    const gen0People = Array.from(peopleById.values())
      .filter(p => !parentMap.has(p.id))
      .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));

    if (gen0People.length === 0) {
      logger.warn('No root people found (everyone has parents)');
      return [];
    }

    logger.log('Root candidates (no parents):', gen0People.map(p => `${p.firstName} ${p.lastName} (b.${p.dateOfBirth})`));

    rootPerson = gen0People[0];
  }

  logger.log(`Root (Gen 0): ${rootPerson.firstName} ${rootPerson.lastName}`);

  const generations = [];
  const processedIds = new Set();

  generations.push([rootPerson.id]);
  processedIds.add(rootPerson.id);

  const rootSpouseId = spouseMap.get(rootPerson.id);
  if (rootSpouseId) {
    processedIds.add(rootSpouseId);
  }

  let currentGenIndex = 0;
  while (currentGenIndex < generations.length) {
    const currentGen = generations[currentGenIndex];
    const nextGenIds = new Set();

    currentGen.forEach(personId => {
      const children = childrenMap.get(personId) || [];
      children.forEach(childId => {
        // CRITICAL: Only include children that are IN this fragment (peopleById)
        // This prevents generation detection from following relationships outside the fragment
        if (!processedIds.has(childId) && peopleById.has(childId)) {
          nextGenIds.add(childId);
          processedIds.add(childId);
        }
      });

      const spouseId = spouseMap.get(personId);
      if (spouseId && peopleById.has(spouseId)) {
        const spouseChildren = childrenMap.get(spouseId) || [];
        spouseChildren.forEach(childId => {
          // CRITICAL: Only include children that are IN this fragment (peopleById)
          if (!processedIds.has(childId) && peopleById.has(childId)) {
            nextGenIds.add(childId);
            processedIds.add(childId);
          }
        });
      }
    });

    if (nextGenIds.size > 0) {
      generations.push(Array.from(nextGenIds));
    }

    currentGenIndex++;
  }

  logger.log('Generations detected:', generations.map((g, i) => `Gen ${i}: ${g.length} people`));
  return generations;
}
