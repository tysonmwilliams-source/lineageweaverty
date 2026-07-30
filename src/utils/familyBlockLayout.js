/**
 * Family Block Layout Utility
 *
 * Implements a two-tier spacing system for family tree visualization:
 *
 * 1. BRANCH SPACING - Large gaps between sibling family blocks
 *    (each sibling with descendants gets their own horizontal "block")
 *
 * 2. SIBLING SPACING - Tighter gaps between children of the same parents
 *
 * Block width is determined by the WIDEST descendant generation within
 * that sibling's entire descendant tree.
 */

/**
 * Calculate the family block structure for a set of siblings
 *
 * @param {Array} siblingIds - IDs of siblings to analyze
 * @param {Map} childrenMap - Map of personId -> [childIds]
 * @param {Map} spouseMap - Map of personId -> spouseId
 * @param {Map} peopleById - Map of personId -> person object
 * @param {Object} config - Layout configuration
 * @returns {Object} Block structure with widths and positions
 */
export function calculateFamilyBlocks(siblingIds, childrenMap, spouseMap, peopleById, config = {}) {
  const {
    cardWidth = 150,
    siblingSpacing = 35,      // Tight spacing within family
    branchSpacing = 80,       // Larger spacing between family blocks
    spouseSpacing = 35        // Space between person and spouse
  } = config;

  const blocks = [];

  siblingIds.forEach(siblingId => {
    const person = peopleById.get(siblingId);
    if (!person) return;

    const hasDescendants = hasAnyDescendants(siblingId, childrenMap);
    const hasSpouse = spouseMap.has(siblingId) && peopleById.has(spouseMap.get(siblingId));

    if (hasDescendants) {
      // This sibling gets a BLOCK
      const blockWidth = calculateBlockWidth(siblingId, childrenMap, spouseMap, peopleById, config);

      blocks.push({
        type: 'block',
        rootId: siblingId,
        rootPerson: person,
        hasSpouse,
        spouseId: hasSpouse ? spouseMap.get(siblingId) : null,
        width: blockWidth,
        descendantGenerations: getDescendantGenerations(siblingId, childrenMap, spouseMap, peopleById)
      });
    } else {
      // No descendants - just the person (+ spouse if any)
      const personWidth = hasSpouse
        ? (cardWidth * 2) + spouseSpacing
        : cardWidth;

      blocks.push({
        type: 'leaf',
        rootId: siblingId,
        rootPerson: person,
        hasSpouse,
        spouseId: hasSpouse ? spouseMap.get(siblingId) : null,
        width: personWidth,
        descendantGenerations: []
      });
    }
  });

  return blocks;
}

/**
 * Check if a person has any descendants (children, grandchildren, etc.)
 */
export function hasAnyDescendants(personId, childrenMap) {
  const children = childrenMap.get(personId) || [];
  return children.length > 0;
}

/**
 * Get all descendant generations for a person
 * Returns array of generations, each containing person IDs at that level
 */
export function getDescendantGenerations(personId, childrenMap, spouseMap, peopleById) {
  const generations = [];
  let currentGen = [personId];

  // Include spouse in gen 0 tracking for children lookup
  const spouseId = spouseMap.get(personId);

  // Guards against cyclic ancestry. A single bad parent edge — from a bulk
  // import, the AI proposal executor, or a restored backup, all of which write
  // relationships directly — used to make this loop run forever and freeze the
  // tab with no error.
  const seen = new Set([personId]);

  while (currentGen.length > 0) {
    const nextGen = new Set();

    currentGen.forEach(pid => {
      const children = childrenMap.get(pid) || [];
      children.forEach(childId => {
        if (!seen.has(childId)) nextGen.add(childId);
      });

      // Also check spouse's children
      const pSpouse = spouseMap.get(pid);
      if (pSpouse) {
        const spouseChildren = childrenMap.get(pSpouse) || [];
        spouseChildren.forEach(childId => {
          if (!seen.has(childId)) nextGen.add(childId);
        });
      }
    });

    nextGen.forEach(id => seen.add(id));

    if (nextGen.size > 0) {
      generations.push(Array.from(nextGen));
      currentGen = Array.from(nextGen);
    } else {
      break;
    }
  }

  return generations;
}

/**
 * Calculate the width of a family block
 * Width = widest generation within the descendant tree
 */
export function calculateBlockWidth(personId, childrenMap, spouseMap, peopleById, config = {}) {
  const {
    cardWidth = 150,
    siblingSpacing = 35,
    spouseSpacing = 35
  } = config;

  // Start with the root person + spouse width
  const hasSpouse = spouseMap.has(personId) && peopleById.has(spouseMap.get(personId));
  let maxWidth = hasSpouse ? (cardWidth * 2) + spouseSpacing : cardWidth;

  // Get all descendant generations
  const generations = getDescendantGenerations(personId, childrenMap, spouseMap, peopleById);

  // Calculate width of each generation
  generations.forEach(genIds => {
    let genWidth = 0;
    let cardCount = 0;

    genIds.forEach(id => {
      cardCount++;
      const hasChildSpouse = spouseMap.has(id) && peopleById.has(spouseMap.get(id));
      if (hasChildSpouse) {
        cardCount++; // Spouse adds another card
      }
    });

    if (cardCount > 0) {
      genWidth = (cardCount * cardWidth) + ((cardCount - 1) * siblingSpacing);
      maxWidth = Math.max(maxWidth, genWidth);
    }
  });

  return maxWidth;
}

/**
 * Position family blocks left-to-right
 *
 * @param {Array} blocks - Array of block objects from calculateFamilyBlocks
 * @param {number} startX - Starting X position
 * @param {Object} config - Layout configuration
 * @returns {Array} Blocks with x positions assigned
 */
export function positionBlocks(blocks, startX, config = {}) {
  const {
    branchSpacing = 80,
    siblingSpacing = 35
  } = config;

  let currentX = startX;
  const positionedBlocks = [];

  blocks.forEach((block, index) => {
    const positionedBlock = {
      ...block,
      x: currentX,
      centerX: currentX + (block.width / 2)
    };

    positionedBlocks.push(positionedBlock);

    // Calculate next position
    currentX += block.width;

    // Add spacing before next block
    if (index < blocks.length - 1) {
      // Only use branch spacing if the CURRENT block has descendants
      // (because it needs room for its descendant tree)
      // Childless siblings (even if married) get normal sibling spacing
      if (block.type === 'block') {
        currentX += branchSpacing;
      } else {
        currentX += siblingSpacing;
      }
    }
  });

  return positionedBlocks;
}

/**
 * Calculate positions for all people in a generation using block layout
 *
 * @param {Array} genIds - Person IDs in this generation
 * @param {number} genIndex - Generation index (0 = root)
 * @param {Array} prevGenBlocks - Positioned blocks from previous generation
 * @param {Map} childrenMap - Map of personId -> [childIds]
 * @param {Map} spouseMap - Map of personId -> spouseId
 * @param {Map} peopleById - Map of personId -> person object
 * @param {Map} parentMap - Map of personId -> [parentIds]
 * @param {Object} config - Layout configuration
 * @returns {Map} personId -> { x, y, width, height }
 */
export function calculateGenerationPositions(
  genIds,
  genIndex,
  prevGenBlocks,
  childrenMap,
  spouseMap,
  peopleById,
  parentMap,
  config = {}
) {
  const {
    cardWidth = 150,
    cardHeight = 70,
    siblingSpacing = 35,
    spouseSpacing = 35,
    anchorX = 1500,
    startY = 100,
    generationSpacing = 120
  } = config;

  const positions = new Map();
  const y = startY + (genIndex * generationSpacing);

  if (genIndex === 0) {
    // Root generation - just center it
    let totalWidth = 0;
    genIds.forEach(id => {
      totalWidth += cardWidth;
      if (spouseMap.has(id) && peopleById.has(spouseMap.get(id))) {
        totalWidth += cardWidth + spouseSpacing;
      }
    });
    totalWidth += (genIds.length - 1) * siblingSpacing;

    let currentX = anchorX - (totalWidth / 2);

    genIds.forEach(id => {
      positions.set(id, { x: currentX, y, width: cardWidth, height: cardHeight });
      currentX += cardWidth + siblingSpacing;

      const spouseId = spouseMap.get(id);
      if (spouseId && peopleById.has(spouseId)) {
        positions.set(spouseId, { x: currentX - siblingSpacing + spouseSpacing, y, width: cardWidth, height: cardHeight });
        currentX += cardWidth + siblingSpacing;
      }
    });

    return positions;
  }

  // For subsequent generations, we need to position children under their parents
  // while respecting block boundaries

  // Group children by their parent block
  const childrenByParentBlock = new Map();

  // Set lookup instead of Array.includes inside a per-child loop.
  const genIdSet = new Set(genIds);

  prevGenBlocks.forEach(block => {
    const blockChildren = [];
    const blockChildSet = new Set();

    // Get children of the block root
    const rootChildren = childrenMap.get(block.rootId) || [];
    rootChildren.forEach(childId => {
      if (genIdSet.has(childId)) {
        blockChildren.push(childId);
        blockChildSet.add(childId);
      }
    });

    // Also get children of spouse
    if (block.spouseId) {
      const spouseChildren = childrenMap.get(block.spouseId) || [];
      spouseChildren.forEach(childId => {
        if (genIdSet.has(childId) && !blockChildSet.has(childId)) {
          blockChildren.push(childId);
          blockChildSet.add(childId);
        }
      });
    }

    // Sort by birth date
    blockChildren.sort((a, b) => {
      const personA = peopleById.get(a);
      const personB = peopleById.get(b);
      return parseInt(personA?.dateOfBirth || 0) - parseInt(personB?.dateOfBirth || 0);
    });

    if (blockChildren.length > 0) {
      childrenByParentBlock.set(block.rootId, {
        block,
        children: blockChildren
      });
    }
  });

  // Now calculate blocks for this generation's children
  childrenByParentBlock.forEach(({ block: parentBlock, children }) => {
    // Calculate sub-blocks for these children
    const childBlocks = calculateFamilyBlocks(children, childrenMap, spouseMap, peopleById, config);

    // Position them centered under the parent block
    const totalChildWidth = childBlocks.reduce((sum, b) => sum + b.width, 0) +
      (childBlocks.length - 1) * siblingSpacing;

    let childStartX = parentBlock.centerX - (totalChildWidth / 2);

    // Position each child block
    const positionedChildBlocks = positionBlocks(childBlocks, childStartX, config);

    positionedChildBlocks.forEach(childBlock => {
      positions.set(childBlock.rootId, {
        x: childBlock.centerX - (cardWidth / 2),
        y,
        width: cardWidth,
        height: cardHeight,
        blockX: childBlock.x,
        blockWidth: childBlock.width,
        blockCenterX: childBlock.centerX
      });

      // Position spouse
      if (childBlock.spouseId) {
        positions.set(childBlock.spouseId, {
          x: childBlock.centerX - (cardWidth / 2) + cardWidth + spouseSpacing,
          y,
          width: cardWidth,
          height: cardHeight
        });
      }
    });
  });

  return positions;
}

/**
 * Main function: Calculate all positions using family block layout
 *
 * This uses a BOTTOM-UP approach:
 * 1. First, calculate the width needed for each person's descendant tree
 * 2. Then position from root down, ensuring children don't overlap
 *
 * @param {Array} generations - Array of generation arrays (each containing person IDs)
 * @param {Map} childrenMap - Map of personId -> [childIds]
 * @param {Map} spouseMap - Map of personId -> spouseId
 * @param {Map} peopleById - Map of personId -> person object
 * @param {Map} parentMap - Map of personId -> [parentIds]
 * @param {Object} config - Layout configuration
 * @returns {Map} personId -> { x, y, width, height }
 */
export function calculateBlockBasedLayout(
  generations,
  childrenMap,
  spouseMap,
  peopleById,
  parentMap,
  config = {}
) {
  const {
    cardWidth = 150,
    cardHeight = 70,
    siblingSpacing = 35,
    spouseSpacing = 35,
    branchSpacing = 80,
    anchorX = 1500,
    startY = 100,
    generationSpacing = 120
  } = config;

  const allPositions = new Map();

  // STEP 1: Calculate the full descendant tree width for each person (bottom-up)
  const descendantWidths = new Map();

  // Process generations from bottom to top
  for (let genIndex = generations.length - 1; genIndex >= 0; genIndex--) {
    const genIds = generations[genIndex];

    genIds.forEach(personId => {
      const hasSpouse = spouseMap.has(personId) && peopleById.has(spouseMap.get(personId));

      // Get this person's children (in next generation)
      const children = childrenMap.get(personId) || [];
      const spouseId = spouseMap.get(personId);
      const childSet = new Set(children);
      if (spouseId) {
        const spouseChildren = childrenMap.get(spouseId) || [];
        spouseChildren.forEach(c => childSet.add(c));
      }

      // Filter to children in next generation
      const nextGenIds = generations[genIndex + 1] || [];
      const nextGenIdSet = new Set(nextGenIds);
      const myChildren = Array.from(childSet).filter(id => nextGenIdSet.has(id));

      if (myChildren.length === 0) {
        // Leaf node - width is just person + spouse
        const width = hasSpouse ? (cardWidth * 2) + spouseSpacing : cardWidth;
        descendantWidths.set(personId, width);
      } else {
        // Has children - width is sum of children's widths + spacing
        let totalChildrenWidth = 0;
        myChildren.forEach((childId, idx) => {
          const childWidth = descendantWidths.get(childId) || cardWidth;
          totalChildrenWidth += childWidth;

          // Add spacing after each child (except last)
          if (idx < myChildren.length - 1) {
            // Use branch spacing if this child has descendants
            const childHasDescendants = (descendantWidths.get(childId) || cardWidth) > (cardWidth * 2 + spouseSpacing);
            if (childHasDescendants) {
              totalChildrenWidth += branchSpacing;
            } else {
              totalChildrenWidth += siblingSpacing;
            }
          }
        });

        // My width is the MAX of: my own card(s) OR my children's total width
        const myOwnWidth = hasSpouse ? (cardWidth * 2) + spouseSpacing : cardWidth;
        descendantWidths.set(personId, Math.max(myOwnWidth, totalChildrenWidth));
      }
    });
  }

  // STEP 2: Position from top down using calculated widths
  generations.forEach((genIds, genIndex) => {
    const y = startY + (genIndex * generationSpacing);

    if (genIndex === 0) {
      // Root generation - center the whole thing
      let totalWidth = 0;
      genIds.forEach((id, idx) => {
        totalWidth += descendantWidths.get(id) || cardWidth;
        if (idx < genIds.length - 1) {
          totalWidth += branchSpacing;
        }
      });

      let currentX = anchorX - (totalWidth / 2);

      genIds.forEach((personId, idx) => {
        const person = peopleById.get(personId);
        const myWidth = descendantWidths.get(personId) || cardWidth;
        const hasSpouse = spouseMap.has(personId) && peopleById.has(spouseMap.get(personId));

        // Center the person card(s) within their allocated width
        const personCenterX = currentX + (myWidth / 2);
        const personX = hasSpouse
          ? personCenterX - cardWidth - (spouseSpacing / 2)
          : personCenterX - (cardWidth / 2);

        allPositions.set(personId, {
          x: personX,
          y,
          width: cardWidth,
          height: cardHeight,
          blockX: currentX,
          blockWidth: myWidth,
          blockCenterX: personCenterX
        });

        if (hasSpouse) {
          const spouseId = spouseMap.get(personId);
          allPositions.set(spouseId, {
            x: personX + cardWidth + spouseSpacing,
            y,
            width: cardWidth,
            height: cardHeight
          });
        }

        currentX += myWidth;
        if (idx < genIds.length - 1) {
          currentX += branchSpacing;
        }
      });

    } else {
      // Subsequent generations - position within parent's allocated block
      const prevGenIds = generations[genIndex - 1];
      const prevGenIdSet = new Set(prevGenIds);

      // Group children by parent
      const childrenByParent = new Map();
      genIds.forEach(childId => {
        const parents = parentMap.get(childId) || [];
        // Find a parent that's in the previous generation
        let parentId = parents.find(pid => prevGenIdSet.has(pid));
        if (!parentId) {
          // Check if parent's spouse is in prev gen
          parents.forEach(pid => {
            const pSpouse = spouseMap.get(pid);
            if (pSpouse && prevGenIdSet.has(pSpouse)) {
              parentId = pSpouse;
            }
          });
        }

        if (parentId) {
          if (!childrenByParent.has(parentId)) {
            childrenByParent.set(parentId, []);
          }
          childrenByParent.get(parentId).push(childId);
        }
      });

      // Position children within each parent's block
      prevGenIds.forEach(parentId => {
        const parentPos = allPositions.get(parentId);
        if (!parentPos) return;

        // Get children (including spouse's children)
        let myChildren = childrenByParent.get(parentId) || [];
        const spouseId = spouseMap.get(parentId);
        if (spouseId) {
          const spouseChildren = childrenByParent.get(spouseId) || [];
          const mine = new Set(myChildren);
          spouseChildren.forEach(c => {
            if (!mine.has(c)) { myChildren.push(c); mine.add(c); }
          });
          childrenByParent.delete(spouseId); // Don't process again
        }

        if (myChildren.length === 0) return;

        // Sort by birth date
        myChildren.sort((a, b) => {
          const personA = peopleById.get(a);
          const personB = peopleById.get(b);
          return parseInt(personA?.dateOfBirth || 0) - parseInt(personB?.dateOfBirth || 0);
        });

        // Calculate total width needed for these children
        let totalChildrenWidth = 0;
        myChildren.forEach((childId, idx) => {
          totalChildrenWidth += descendantWidths.get(childId) || cardWidth;
          if (idx < myChildren.length - 1) {
            const childWidth = descendantWidths.get(childId) || cardWidth;
            const childHasDescendants = childWidth > (cardWidth * 2 + spouseSpacing);
            if (childHasDescendants) {
              totalChildrenWidth += branchSpacing;
            } else {
              totalChildrenWidth += siblingSpacing;
            }
          }
        });

        // Position children centered under parent's block center
        let currentX = parentPos.blockCenterX - (totalChildrenWidth / 2);

        myChildren.forEach((childId, idx) => {
          const child = peopleById.get(childId);
          const childWidth = descendantWidths.get(childId) || cardWidth;
          const hasSpouse = spouseMap.has(childId) && peopleById.has(spouseMap.get(childId));

          // Center the child card(s) within their allocated width
          const childCenterX = currentX + (childWidth / 2);
          const childX = hasSpouse
            ? childCenterX - cardWidth - (spouseSpacing / 2)
            : childCenterX - (cardWidth / 2);

          allPositions.set(childId, {
            x: childX,
            y,
            width: cardWidth,
            height: cardHeight,
            blockX: currentX,
            blockWidth: childWidth,
            blockCenterX: childCenterX
          });

          if (hasSpouse) {
            const childSpouseId = spouseMap.get(childId);
            allPositions.set(childSpouseId, {
              x: childX + cardWidth + spouseSpacing,
              y,
              width: cardWidth,
              height: cardHeight
            });
          }

          currentX += childWidth;
          if (idx < myChildren.length - 1) {
            const childHasDescendants = childWidth > (cardWidth * 2 + spouseSpacing);
            if (childHasDescendants) {
              currentX += branchSpacing;
            } else {
              currentX += siblingSpacing;
            }
          }
        });
      });
    }
  });

  return allPositions;
}

export default {
  calculateFamilyBlocks,
  calculateBlockWidth,
  positionBlocks,
  calculateBlockBasedLayout,
  hasAnyDescendants,
  getDescendantGenerations
};
