/**
 * BranchView.jsx - Split-screen Branch View Component
 *
 * PURPOSE:
 * Displays multiple family tree fragments in a split-screen layout,
 * allowing users to view lesser branches of a noble house simultaneously.
 *
 * FEATURES:
 * - Supports 2-4 panels in a responsive grid
 * - Each panel has independent zoom/pan
 * - Panel headers show the prominent person of each branch
 * - Exit button to return to normal tree view
 */

import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { useTheme } from './ThemeContext';
import { getAllThemeColors } from '../utils/themeColors';
import { calculateBlockBasedLayout } from '../utils/familyBlockLayout';
// Shared with FamilyTree.jsx. BranchView used to carry its own copy, commented
// "matching FamilyTree.jsx" — but its light-theme branch lightened toward white
// where this one darkens, so the same house rendered a different shade in the
// two views side by side.
import { harmonizeColor } from '../utils/treeHelpers';
import Icon from './icons';
import './BranchView.css';

// Card and layout constants (matching FamilyTree.jsx)
const CARD_WIDTH = 150;
const CARD_HEIGHT = 70;
const SPACING = 35;
const ANCHOR_X = 400;
const START_Y = 80;
const VERTICAL_SPACING = 75;
const GENERATION_SPACING = VERTICAL_SPACING + CARD_HEIGHT;
const BRANCH_SPACING = 40;

/**
 * Individual Branch Panel Component
 */
function BranchPanel({
  fragment,
  fragmentIndex,
  peopleById,
  parentMap,
  childrenMap,
  spouseMap,
  spouseRelationshipMap,
  detectGenerations,
  housesById,
  themeColors,
  isDarkTheme
}) {
  const svgRef = useRef(null);
  const zoomRef = useRef(null);

  const rootPerson = fragment.rootPerson;
  const memberCount = fragment.memberCount || fragment.peopleIds?.size || 0;

  useEffect(() => {
    if (!svgRef.current || !fragment) return;

    // Marriage line color (matching FamilyTree.jsx)
    const marriageColor = isDarkTheme ? '#c08a7a' : '#b87a8a';
    const childLineColor = themeColors.lines?.legitimate || '#8b7355';

    // Clear and setup SVG
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', '100%').attr('height', '100%');

    const g = svg.append('g').attr('class', 'zoom-group');

    // Define text shadow filter for better readability
    const defs = svg.append('defs');
    const filter = defs.append('filter')
      .attr('id', `text-shadow-${fragmentIndex}`)
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    filter.append('feDropShadow')
      .attr('dx', '0')
      .attr('dy', '1')
      .attr('stdDeviation', '1')
      .attr('flood-color', 'rgba(0,0,0,0.4)');

    // Setup zoom
    const zoom = d3.zoom()
      .scaleExtent([0.2, 2])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Build fragment-scoped people map
    const fragmentPeopleById = new Map();
    fragment.peopleIds.forEach(id => {
      if (peopleById.has(id)) {
        fragmentPeopleById.set(id, peopleById.get(id));
      }
    });

    // Add spouses
    fragment.peopleIds.forEach(id => {
      const spouseId = spouseMap.get(id);
      if (spouseId && peopleById.has(spouseId)) {
        fragmentPeopleById.set(spouseId, peopleById.get(spouseId));
      }
    });

    if (fragmentPeopleById.size === 0) {
      g.append('text')
        .attr('x', ANCHOR_X)
        .attr('y', 100)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e9dcc9')
        .text('No members in this branch');
      return;
    }

    // Get generations for this fragment
    const fragmentRootId = rootPerson?.id;
    const generations = detectGenerations(fragmentPeopleById, parentMap, childrenMap, spouseMap, fragmentRootId);

    if (generations.length === 0) {
      g.append('text')
        .attr('x', ANCHOR_X)
        .attr('y', 100)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e9dcc9')
        .text('Unable to determine generations');
      return;
    }

    // Calculate block layout
    const blockPositions = calculateBlockBasedLayout(
      generations,
      childrenMap,
      spouseMap,
      fragmentPeopleById,
      parentMap,
      {
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        siblingSpacing: SPACING,
        spouseSpacing: SPACING,
        branchSpacing: BRANCH_SPACING,
        anchorX: ANCHOR_X,
        startY: START_Y,
        generationSpacing: GENERATION_SPACING
      }
    );

    // Position map stores {x, y, width, height} like the main tree
    const positionMap = new Map();
    const marriageCenters = new Map();
    const processedSpouses = new Set();
    const marriageLinesToDraw = [];
    const drawnPeople = new Set();

    // Helper function to draw a person card
    const drawPersonCard = (personId) => {
      if (drawnPeople.has(personId)) return;

      const person = fragmentPeopleById.get(personId);
      if (!person) return;

      const pos = blockPositions.get(personId);
      if (!pos) return;

      const { x, y } = pos;
      drawnPeople.add(personId);

      // Store position with width/height (matching main tree format)
      positionMap.set(personId, {
        x,
        y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        personId
      });

      // Draw person card
      const birthHouse = housesById.get(person.houseId);
      const originalColor = birthHouse?.colorCode || '#666666';
      const cardColor = harmonizeColor(originalColor, isDarkTheme);

      // Border color based on legitimacy
      let borderColor = themeColors.lines?.legitimate || '#8b7355';
      if (person.legitimacyStatus === 'bastard') borderColor = themeColors.lines?.bastard || '#a04040';
      if (person.legitimacyStatus === 'adopted') borderColor = themeColors.lines?.adopted || '#4070a0';

      const cardGroup = g.append('g')
        .attr('class', 'person-card')
        .attr('transform', `translate(${x}, ${y})`);

      // Background rect with proper border
      cardGroup.append('rect')
        .attr('width', CARD_WIDTH)
        .attr('height', CARD_HEIGHT)
        .attr('rx', 6)
        .attr('fill', cardColor)
        .attr('stroke', borderColor)
        .attr('stroke-width', 2.5);

      // Inner glow effect
      const glowColor = isDarkTheme ? 'rgba(233, 220, 201, 0.1)' : 'rgba(255, 255, 255, 0.3)';
      cardGroup.append('rect')
        .attr('x', 1)
        .attr('y', 1)
        .attr('width', CARD_WIDTH - 2)
        .attr('height', CARD_HEIGHT - 2)
        .attr('rx', 5)
        .attr('fill', 'none')
        .attr('stroke', glowColor)
        .attr('stroke-width', 1);

      // Name text (lighter color + shadow for better visibility on colored cards)
      const nameText = `${person.firstName || ''} ${person.lastName || ''}`.trim();
      const displayName = nameText.length > 18 ? nameText.slice(0, 16) + '...' : nameText;
      cardGroup.append('text')
        .attr('class', 'person-name')
        .attr('x', CARD_WIDTH / 2)
        .attr('y', 25)
        .attr('text-anchor', 'middle')
        .attr('fill', '#f5ede3')
        .attr('font-weight', 'bold')
        .attr('font-size', '13px')
        .attr('filter', `url(#text-shadow-${fragmentIndex})`)
        .text(displayName);

      // Dates text (lighter color + shadow for better visibility)
      const birthYear = person.dateOfBirth ? person.dateOfBirth.split('-')[0] : '?';
      const deathYear = person.dateOfDeath ? person.dateOfDeath.split('-')[0] : '';
      const datesText = deathYear ? `${birthYear} - ${deathYear}` : `b. ${birthYear}`;
      cardGroup.append('text')
        .attr('class', 'person-dates')
        .attr('x', CARD_WIDTH / 2)
        .attr('y', 45)
        .attr('text-anchor', 'middle')
        .attr('fill', '#e5dbc9')
        .attr('font-size', '10px')
        .attr('filter', `url(#text-shadow-${fragmentIndex})`)
        .text(datesText);
    };

    // First pass: Draw all person cards and their spouses
    generations.forEach((genIds, genIndex) => {
      genIds.forEach(personId => {
        // Draw this person
        drawPersonCard(personId);

        // Also draw their spouse if they have one
        const spouseId = spouseMap.get(personId);
        if (spouseId && fragmentPeopleById.has(spouseId)) {
          drawPersonCard(spouseId);
        }
      });
    });

    // Second pass: Calculate marriage centers and collect marriage lines
    generations.forEach((genIds) => {
      genIds.forEach(personId => {
        if (processedSpouses.has(personId)) return;

        const spouseId = spouseMap.get(personId);
        if (!spouseId || !fragmentPeopleById.has(spouseId)) return;

        const pos1 = positionMap.get(personId);
        const pos2 = positionMap.get(spouseId);
        if (!pos1 || !pos2) return;

        // Mark both as processed
        processedSpouses.add(personId);
        processedSpouses.add(spouseId);

        // Determine left/right spouse by x position
        const [leftPos, rightPos] = pos1.x < pos2.x ? [pos1, pos2] : [pos2, pos1];

        // Marriage line coordinates
        const x1 = leftPos.x + leftPos.width;
        const y1 = leftPos.y + leftPos.height / 2;
        const x2 = rightPos.x;
        const y2 = rightPos.y + rightPos.height / 2;

        // Marriage center
        const marriageCenter = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
        marriageCenters.set(personId, marriageCenter);
        marriageCenters.set(spouseId, marriageCenter);

        // Store marriage line to draw
        marriageLinesToDraw.push({ x1, y1, x2, y2 });
      });
    });

    // Draw marriage lines
    marriageLinesToDraw.forEach(line => {
      g.append('line')
        .attr('class', 'marriage-line')
        .attr('x1', line.x1)
        .attr('y1', line.y1)
        .attr('x2', line.x2)
        .attr('y2', line.y2)
        .attr('stroke', marriageColor)
        .attr('stroke-width', 2.5)
        .attr('opacity', 0.8);
    });

    // Third pass: Draw child lines grouped by parent couple
    // Group children by their parent couple
    const childrenByParentCouple = new Map();

    generations.forEach((genIds, genIndex) => {
      if (genIndex === 0) return;

      genIds.forEach(personId => {
        const childPos = positionMap.get(personId);
        if (!childPos) return;

        const parentIds = parentMap.get(personId) || [];
        if (parentIds.length === 0) return;

        // Get the first parent in the fragment
        const parentId = parentIds.find(pid => fragmentPeopleById.has(pid));
        if (!parentId) return;

        const parentPos = positionMap.get(parentId);
        if (!parentPos) return;

        // Use marriage center if available, otherwise parent center
        const marriageCenter = marriageCenters.get(parentId);

        // For married couples, line starts from marriage center (middle of card)
        // For single parents, line starts from bottom of card
        const startPoint = marriageCenter
          ? { x: marriageCenter.x, y: marriageCenter.y }
          : { x: parentPos.x + CARD_WIDTH / 2, y: parentPos.y + CARD_HEIGHT };

        // Group key based on parent or marriage center
        const groupKey = marriageCenter ? `${startPoint.x}-${startPoint.y}` : `parent-${parentId}`;

        if (!childrenByParentCouple.has(groupKey)) {
          childrenByParentCouple.set(groupKey, {
            startPoint,
            children: [],
            parentY: parentPos.y + CARD_HEIGHT
          });
        }

        childrenByParentCouple.get(groupKey).children.push(childPos);
      });
    });

    // Draw child line systems
    childrenByParentCouple.forEach(({ startPoint, children, parentY }) => {
      if (children.length === 0) return;

      // Sort children by x position
      const sortedChildren = [...children].sort((a, b) => a.x - b.x);

      const firstChildX = sortedChildren[0].x + CARD_WIDTH / 2;
      const lastChildX = sortedChildren[sortedChildren.length - 1].x + CARD_WIDTH / 2;
      const childY = sortedChildren[0].y;

      // Calculate midY for horizontal bar
      const midY = parentY + (childY - parentY) / 2;

      // Vertical line from marriage center/parent down to horizontal bar
      g.append('line')
        .attr('class', 'child-line-legit')
        .attr('x1', startPoint.x)
        .attr('y1', startPoint.y)
        .attr('x2', startPoint.x)
        .attr('y2', midY)
        .attr('stroke', childLineColor)
        .attr('stroke-width', 2);

      // Horizontal bar spanning all children
      const horizLeftX = Math.min(firstChildX, startPoint.x);
      const horizRightX = Math.max(lastChildX, startPoint.x);

      g.append('line')
        .attr('class', 'child-line-legit')
        .attr('x1', horizLeftX)
        .attr('y1', midY)
        .attr('x2', horizRightX)
        .attr('y2', midY)
        .attr('stroke', childLineColor)
        .attr('stroke-width', 2);

      // Vertical lines down to each child
      sortedChildren.forEach(childPos => {
        g.append('line')
          .attr('class', 'child-line-legit')
          .attr('x1', childPos.x + CARD_WIDTH / 2)
          .attr('y1', midY)
          .attr('x2', childPos.x + CARD_WIDTH / 2)
          .attr('y2', childPos.y)
          .attr('stroke', childLineColor)
          .attr('stroke-width', 2);
      });
    });

    // Initial zoom to fit content
    const bounds = g.node().getBBox();
    const containerWidth = svgRef.current.clientWidth || 400;
    const containerHeight = svgRef.current.clientHeight || 300;

    const scale = Math.min(
      containerWidth / (bounds.width + 100),
      containerHeight / (bounds.height + 100),
      1
    );

    const translateX = (containerWidth - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY = 20;

    svg.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale * 0.9));

  }, [fragment, peopleById, parentMap, childrenMap, spouseMap, themeColors, isDarkTheme, housesById, detectGenerations, rootPerson]);

  const handleZoomIn = () => {
    if (zoomRef.current && svgRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomRef.current.scaleBy, 1.3);
    }
  };

  const handleZoomOut = () => {
    if (zoomRef.current && svgRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomRef.current.scaleBy, 0.7);
    }
  };

  return (
    <div className={`branch-panel branch-panel--fragment-${fragmentIndex + 1}`}>
      <div className="branch-panel__header">
        <div className="branch-panel__info">
          <h3 className="branch-panel__title">
            {rootPerson ? `${rootPerson.firstName} ${rootPerson.lastName}` : `Branch ${fragmentIndex + 1}`}
          </h3>
          <p className="branch-panel__subtitle">
            {rootPerson?.dateOfBirth ? `Founded ${rootPerson.dateOfBirth.split('-')[0]}` : ''}
          </p>
        </div>
        <div className="branch-panel__badge">
          <Icon name="users" size={12} />
          <span>{memberCount} members</span>
        </div>
      </div>
      <div className="branch-panel__content">
        <svg ref={svgRef} className="branch-panel__svg"></svg>
        <div className="branch-panel__controls">
          <button className="branch-panel__btn" onClick={handleZoomIn} title="Zoom In">
            <Icon name="plus" size={14} />
          </button>
          <button className="branch-panel__btn" onClick={handleZoomOut} title="Zoom Out">
            <Icon name="minus" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Main Branch View Component
 */
export default function BranchView({
  fragments,
  peopleById,
  parentMap,
  childrenMap,
  spouseMap,
  spouseRelationshipMap,
  detectGenerations,
  housesById,
  dignitiesByPerson,
  getDignityIcon,
  getPrimaryEpithet,
  onExit
}) {
  const { isDarkTheme } = useTheme();
  const themeColors = getAllThemeColors();

  // Limit to 4 panels max
  const panelsToShow = fragments.slice(0, 4);
  const panelCount = panelsToShow.length;

  return (
    <div className="branch-view-container">
      <div className={`branch-view branch-view--panels-${panelCount}`}>
        {panelsToShow.map((fragment, index) => (
          <BranchPanel
            key={index}
            fragment={fragment}
            fragmentIndex={index}
            peopleById={peopleById}
            parentMap={parentMap}
            childrenMap={childrenMap}
            spouseMap={spouseMap}
            spouseRelationshipMap={spouseRelationshipMap}
            detectGenerations={detectGenerations}
            housesById={housesById}
            themeColors={themeColors}
            isDarkTheme={isDarkTheme()}
          />
        ))}
      </div>
      <button className="branch-view__exit" onClick={onExit}>
        <Icon name="x" size={16} />
        <span>Exit Branch View</span>
      </button>
    </div>
  );
}
