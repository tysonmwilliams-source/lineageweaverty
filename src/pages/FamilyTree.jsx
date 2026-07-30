import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import * as d3 from 'd3';
import { useGenealogy } from '../contexts/GenealogyContext';
import Navigation from '../components/Navigation';
import TreeControls from '../components/TreeControls';
import TreeSettingsPanel from '../components/TreeSettingsPanel';
import FragmentNavigator from '../components/FragmentNavigator';
import QuickEditPanel from '../components/QuickEditPanel';
import BranchView from '../components/BranchView';
import TreeLandingView from '../components/TreeLandingView';
import Icon from '../components/icons';
import { calculateAllRelationships } from '../utils/RelationshipCalculator';
import { buildRelationshipMaps as buildRelationshipMapsUtil } from '../utils/treeRelationshipMaps';
import { useTheme } from '../components/ThemeContext';
import { getAllThemeColors, getHouseColor } from '../utils/themeColors';
import { getPrimaryEpithet } from '../utils/epithetUtils';
import { getAllDignities, getDignityIcon } from '../services/dignityService';
import { calculateBlockBasedLayout } from '../utils/familyBlockLayout';
import {
  estimateTextWidth,
  truncateText,
  truncateName,
  harmonizeColor as harmonizeColorUtil,
  isBastardCadet,
  getHouseIdsInScope,
  getHouseScopedPeopleIds,
  findRootPersonForHouse,
  detectFragments,
  getLineageGapConnections,
  detectGenerations
} from '../utils/treeHelpers';
import { logger } from '../utils/logger';

function FamilyTree() {
  // ==================== URL PARAMETERS ====================
  const { personId: urlPersonId } = useParams();
  const location = useLocation(); // Track navigation for effect triggering
  
  // Use the global theme system
  const { theme, isDarkTheme } = useTheme();
  
  // ==================== SHARED STATE FROM CONTEXT ====================
  const {
    people,
    houses,
    relationships,
    loading,
    dataVersion
  } = useGenealogy();

  // ==================== LOCAL UI STATE ====================
  const [selectedHouseId, setSelectedHouseId] = useState(null);
  // Cadet houses are always included (child houses with parentHouseId)
  const showCadetHouses = true;
  const [zoomLevel, setZoomLevel] = useState(1);
  const svgRef = useRef(null);
  const zoomBehaviorRef = useRef(null);

  // Search functionality
  const [searchResults, setSearchResults] = useState([]);
  
  // Quick edit panel
  const [selectedPerson, setSelectedPerson] = useState(null);
  
  // Relationship calculator
  const [showRelationships, setShowRelationships] = useState(false);
  const [referencePerson, setReferencePerson] = useState(null);
  const [relationshipMap, setRelationshipMap] = useState(new Map());
  const showRelationshipsRef = useRef(false);
  
  // Controls panel collapse state
  const [controlsPanelExpanded, setControlsPanelExpanded] = useState(false);

  // Branch View - split screen mode for viewing lesser branches
  const [showBranchView, setShowBranchView] = useState(false);

  // Vertical spacing - fixed at 75px for consistent layouts
  const verticalSpacing = 75;

  // 🧱 FAMILY BLOCK LAYOUT - experimental spacing based on descendant tree width
  // Block layout is now always enabled with fixed spacing
  const useBlockLayout = true;
  const branchSpacing = 40;

  // 👑 DIGNITIES
  const [dignities, setDignities] = useState([]);
  const [dignitiesByPerson, setDignitiesByPerson] = useState(new Map());

  // 🎯 HIGHLIGHTED PERSON
  const [highlightedPersonId, setHighlightedPersonId] = useState(null);
  const isUrlNavigationRef = useRef(false); // Track URL-based navigation to prevent centreOnPersonId reset
  const pendingNavigationRef = useRef(null); // Store { personId, houseId } when navigating via URL

  // 🧩 FRAGMENT NAVIGATION
  const fragmentBoundsRef = useRef([]);

  // ==================== HOUSE VIEW CONTROLS ====================
  const [centreOnPersonId, setCentreOnPersonId] = useState('auto');

  // Card dimensions
  const CARD_WIDTH = 150;
  const CARD_HEIGHT = 70;
  const SPACING = 35;
  const GROUP_SPACING = 50;

  // Fragment gap - FIXED 60px visible gap between disconnected fragments
  // The actual value is CARD_HEIGHT + VISIBLE_GAP because the last generation
  // doesn't include card height in currentGenPos calculation
  const FRAGMENT_VISIBLE_GAP = 60;
  const fragmentGap = CARD_HEIGHT + FRAGMENT_VISIBLE_GAP; // 70 + 60 = 130px total offset
  
  // Anchor and start positions
  const ANCHOR_X = 1500;
  const START_Y = 100;
  
  // Generation spacing
  const GENERATION_SPACING = verticalSpacing + CARD_HEIGHT;

  // Dev layout stubs (dev tools removed — stubs kept for drawTree compatibility)
  const isManualMode = false;
  const effectivePositions = useMemo(() => ({}), []);
  const auraPersonId = null;
  const setDevSelectedPersonId = useCallback(() => {}, []);
  const setDraggingPersonId = useCallback(() => {}, []);
  const setPosition = useCallback(() => {}, []);

  // Wrapper for harmonizeColor that uses the current theme
  const harmonizeColor = useCallback((hexColor) => {
    return harmonizeColorUtil(hexColor, isDarkTheme());
  }, [isDarkTheme]);

  const getHouseNotablePeople = useMemo(() => {
    if (!selectedHouseId || people.length === 0) return [];
    
    const houseIds = getHouseIdsInScope(selectedHouseId, houses, showCadetHouses);
    
    const houseMembers = people
      .filter(p => houseIds.has(p.houseId))
      .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
    
    return houseMembers;
  }, [selectedHouseId, people, houses, showCadetHouses]);

  // RELATIONSHIP MAP BUILDER (delegates to extracted utility)
  //
  // Memoized on the source data. This used to be a plain arrow re-created every
  // render and called from six places, each rebuilding six Maps over the entire
  // dataset — so a single render did six full passes over people, houses and
  // relationships before any drawing happened.
  const relationshipMaps = useMemo(
    () => buildRelationshipMapsUtil(people, houses, relationships),
    [people, houses, relationships]
  );
  const buildRelationshipMaps = useCallback(() => relationshipMaps, [relationshipMaps]);

  const fragmentInfo = useMemo(() => {
    if (!selectedHouseId || people.length === 0) {
      return { fragments: [], lineageGaps: [], hasMultipleFragments: false };
    }
    
    const { parentMap, childrenMap, spouseMap, peopleById } = buildRelationshipMaps();
    const houseIds = getHouseIdsInScope(selectedHouseId, houses, showCadetHouses);
    
    const houseMembers = people.filter(p => houseIds.has(p.houseId));
    
    const fragments = detectFragments(houseMembers, spouseMap, parentMap, childrenMap);
    
    const lineageGaps = getLineageGapConnections(fragments, relationships, peopleById);
    
    if (fragments.length > 1) {
      logger.log(`🧩 Detected ${fragments.length} fragments in ${houses.find(h => h.id === selectedHouseId)?.houseName}:`);
      fragments.forEach((frag, i) => {
        logger.log(`   Fragment ${i + 1}: ${frag.memberCount} members, root: ${frag.rootPerson.firstName} ${frag.rootPerson.lastName} (b. ${frag.rootPerson.dateOfBirth})`);
      });
      if (lineageGaps.length > 0) {
        logger.log(`   🔗 ${lineageGaps.length} lineage-gap connection(s) found`);
      }
    }
    
    return {
      fragments,
      lineageGaps,
      hasMultipleFragments: fragments.length > 1
    };
  }, [selectedHouseId, people, houses, relationships, showCadetHouses]);

  // People personally sworn to the currently selected house (from bastard-elevation cadets)
  const personallySwornToHouse = useMemo(() => {
    if (!selectedHouseId) return [];
    return people.filter(p => p.swornToHouseId === selectedHouseId);
  }, [people, selectedHouseId]);

  // Bastard-elevation cadet houses of the selected house (for navigation)
  const bastardCadetsOfSelected = useMemo(() => {
    if (!selectedHouseId) return [];
    return houses.filter(h => h.parentHouseId === selectedHouseId && isBastardCadet(h));
  }, [houses, selectedHouseId]);

  // Noble cadet houses of the selected house (for info display — they're already merged in the tree)
  const nobleCadetsOfSelected = useMemo(() => {
    if (!selectedHouseId) return [];
    return houses.filter(h => h.parentHouseId === selectedHouseId && !isBastardCadet(h));
  }, [houses, selectedHouseId]);

  // Parent house if the selected house is a cadet branch
  const parentHouseOfSelected = useMemo(() => {
    if (!selectedHouseId) return null;
    const selected = houses.find(h => h.id === selectedHouseId);
    return selected?.parentHouseId
      ? houses.find(h => h.id === selected.parentHouseId)
      : null;
  }, [houses, selectedHouseId]);

  const [fragmentSeparatorStyle, setFragmentSeparatorStyle] = useState(() => {
    const saved = localStorage.getItem('lineageweaver-fragment-style');
    return saved || 'separator';
  });

  const handleFragmentStyleChange = (style) => {
    setFragmentSeparatorStyle(style);
    localStorage.setItem('lineageweaver-fragment-style', style);
  };

  // Navigate to a specific fragment by zooming/panning to its bounds
  const navigateToFragment = (fragmentIndex) => {
    const bounds = fragmentBoundsRef.current.find(b => b.index === fragmentIndex);
    if (!bounds || !zoomBehaviorRef.current || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const containerWidth = svgRef.current.clientWidth || 800;
    const containerHeight = svgRef.current.clientHeight || 600;

    // Calculate center of the fragment
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    // Calculate scale to fit fragment with padding
    const scaleX = containerWidth / (bounds.width + 200);
    const scaleY = containerHeight / (bounds.height + 200);
    const scale = Math.min(scaleX, scaleY, 1.2); // Max scale 1.2

    // Calculate translation to center the fragment
    const translateX = containerWidth / 2 - centerX * scale;
    const translateY = containerHeight / 2 - centerY * scale;

    // Apply the transform with animation
    svg.transition()
      .duration(500)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity.translate(translateX, translateY).scale(scale));

    // FragmentNavigator owns its own expanded state and closes on mouse-leave,
    // so there is nothing to close from here. The setter this used to call had
    // been deleted, making every fragment navigation throw a ReferenceError.
  };

  // EFFECTS

  useEffect(() => {
    if (!urlPersonId || people.length === 0 || houses.length === 0) {
      logger.log(`🎯 URL nav effect skipped: urlPersonId=${urlPersonId}, people=${people.length}, houses=${houses.length}`);
      return;
    }

    const personId = parseInt(urlPersonId);
    const person = people.find(p => p.id === personId);

    if (!person) {
      logger.warn(`🎯 Person with ID ${personId} not found`);
      return;
    }

    logger.log(`🎯 Navigating to ${person.firstName} ${person.lastName} (ID: ${personId}, houseId: ${person.houseId})`);

    // Mark that we're doing URL navigation so the reset effect doesn't clear centreOnPersonId
    isUrlNavigationRef.current = true;

    // Store the pending navigation target - this is checked by drawTree to prevent rendering wrong house
    pendingNavigationRef.current = { personId, houseId: person.houseId };

    // Always set the house to ensure correct tree is shown
    if (person.houseId) {
      logger.log(`🎯 Setting house to ${person.houseId}`);
      setSelectedHouseId(person.houseId);
    }

    // Set centreOnPersonId to this person so the tree roots on them
    logger.log(`🎯 Setting centreOnPersonId to ${personId}`);
    setCentreOnPersonId(personId);
    setHighlightedPersonId(personId);

    const timer = setTimeout(() => {
      setHighlightedPersonId(null);
      // Clear the URL navigation flags after highlighting ends
      isUrlNavigationRef.current = false;
      pendingNavigationRef.current = null; // Failsafe: clear in case it wasn't cleared on draw
    }, 8000);

    return () => clearTimeout(timer);
  }, [urlPersonId, people, houses, location.key]); // location.key forces re-run on navigation

  // Auto-select removed — landing view shown when selectedHouseId is null

  useEffect(() => {
    // Don't reset centreOnPersonId if we're navigating via URL - we want to keep the target person
    if (isUrlNavigationRef.current) {
      return;
    }
    setCentreOnPersonId('auto');
  }, [selectedHouseId]);
  
  useEffect(() => {
    async function loadDignities() {
      try {
        const allDignities = await getAllDignities();
        setDignities(allDignities);
        
        const byPerson = new Map();
        allDignities.forEach(dignity => {
          if (dignity.currentHolderId) {
            if (!byPerson.has(dignity.currentHolderId)) {
              byPerson.set(dignity.currentHolderId, []);
            }
            byPerson.get(dignity.currentHolderId).push(dignity);
          }
        });
        
        byPerson.forEach((personDignities, personId) => {
          personDignities.sort((a, b) => (b.displayPriority || 0) - (a.displayPriority || 0));
        });
        
        setDignitiesByPerson(byPerson);
        logger.log(`👑 Loaded ${allDignities.length} dignities, ${byPerson.size} people have titles`);
      } catch (error) {
        logger.error('Error loading dignities:', error);
      }
    }
    
    loadDignities();
  }, [dataVersion]);

  // Redraw tree when data changes
  useEffect(() => {
    // Only draw tree when not in branch view
    if (!selectedHouseId || people.length === 0 || showBranchView) return;

    // If navigating via URL, ensure we're drawing the correct house
    // This check is independent of the ref to avoid any race conditions
    if (urlPersonId) {
      const targetPerson = people.find(p => p.id === parseInt(urlPersonId));
      if (targetPerson && targetPerson.houseId !== selectedHouseId) {
        logger.log(`🎯 Waiting for house update: URL person ${targetPerson.firstName} (house ${targetPerson.houseId}) !== current ${selectedHouseId}`);
        return; // Skip this render, wait for selectedHouseId to update
      }
      if (targetPerson && targetPerson.houseId === selectedHouseId) {
        logger.log(`🎯 House matched for URL navigation, proceeding to draw ${targetPerson.firstName} in house ${selectedHouseId}`);
        // Clear pending navigation ref now that we're drawing correctly
        pendingNavigationRef.current = null;
      }
    }

    drawTree();
  }, [selectedHouseId, people, houses, relationships, showCadetHouses, personallySwornToHouse, theme, searchResults, relationshipMap, verticalSpacing, dataVersion, centreOnPersonId, fragmentSeparatorStyle, dignitiesByPerson, highlightedPersonId, isManualMode, effectivePositions, useBlockLayout, branchSpacing, showBranchView, urlPersonId]);

  const handleSearchResults = (results) => {
    setSearchResults(results);
  };

  const handlePersonClick = (person) => {
    setSelectedPerson(person);
    
    // 🛠️ DEV LAYOUT: Also select for dev mode
    if (isManualMode) {
      setDevSelectedPersonId(person.id);
    }
    
    if (showRelationshipsRef.current) {
      setReferencePerson(person);
      const { parentMap, childrenMap, spouseMap } = buildRelationshipMaps();
      const relationships = calculateAllRelationships(person.id, people, parentMap, childrenMap, spouseMap);
      setRelationshipMap(relationships);
    }
  };

  // 🛠️ DEV LAYOUT: Draw person card - modified to support dragging
  const drawPersonCard = (g, person, x, y, housesById, themeColors, spouseMap = null, childrenMap = null) => {
    const birthHouse = housesById.get(person.houseId);
    const originalColor = birthHouse ? birthHouse.colorCode : '#666666';
    const harmonizedBg = harmonizeColor(originalColor);
    
    let borderColor = themeColors.statusBorders.legitimate;
    if (person.legitimacyStatus === 'bastard') borderColor = themeColors.statusBorders.bastard;
    if (person.legitimacyStatus === 'adopted') borderColor = themeColors.statusBorders.adopted;
    if (person.legitimacyStatus === 'commoner') borderColor = themeColors.statusBorders.commoner;
    if (person.legitimacyStatus === 'unknown') borderColor = themeColors.statusBorders.unknown;

    // 🛠️ DEV LAYOUT: Use effective position if in manual mode
    let finalX = x;
    let finalY = y;
    
    if (isManualMode && effectivePositions[person.id]) {
      finalX = effectivePositions[person.id].x;
      finalY = effectivePositions[person.id].y;
    }

    const card = g.append('g')
      .attr('class', 'person-card')
      .attr('data-person-id', person.id)
      .attr('transform', `translate(${finalX}, ${finalY})`)
      .style('cursor', isManualMode ? 'grab' : 'pointer')
      .on('click', () => handlePersonClick(person));
    
    // 🛠️ DEV LAYOUT: Add drag behavior if in manual mode
    if (isManualMode) {
      const dragStartRef = { x: 0, y: 0, spouseStartX: 0, spouseStartY: 0, offsetX: 0, offsetY: 0 };
      
      const drag = d3.drag()
        .on('start', function(event) {
          setDraggingPersonId(person.id);
          setDevSelectedPersonId(person.id);
          d3.select(this).raise().style('cursor', 'grabbing');
          
          // Get mouse position in the zoom group's coordinate system
          const zoomGroup = d3.select(svgRef.current).select('.zoom-group').node();
          const [mouseX, mouseY] = d3.pointer(event, zoomGroup);
          
          // Store the offset from mouse to card origin
          dragStartRef.offsetX = mouseX - finalX;
          dragStartRef.offsetY = mouseY - finalY;
          
          // Store starting position
          dragStartRef.x = finalX;
          dragStartRef.y = finalY;
          
          // Store spouse starting position for coupled dragging
          if (spouseMap) {
            const spouseId = spouseMap.get(person.id);
            if (spouseId && effectivePositions[spouseId]) {
              dragStartRef.spouseId = spouseId;
              dragStartRef.spouseStartX = effectivePositions[spouseId].x;
              dragStartRef.spouseStartY = effectivePositions[spouseId].y;
            }
          }
        })
        .on('drag', function(event) {
          // Get mouse position in the zoom group's coordinate system
          const zoomGroup = d3.select(svgRef.current).select('.zoom-group').node();
          const [mouseX, mouseY] = d3.pointer(event, zoomGroup);
          
          // Calculate new position accounting for the initial offset
          const newX = mouseX - dragStartRef.offsetX;
          const newY = mouseY - dragStartRef.offsetY;
          
          // Move this card
          d3.select(this).attr('transform', `translate(${newX}, ${newY})`);
          setPosition(person.id, newX, newY);
          
          // Move spouse together (same delta)
          if (dragStartRef.spouseId) {
            const deltaX = newX - dragStartRef.x;
            const deltaY = newY - dragStartRef.y;
            const newSpouseX = dragStartRef.spouseStartX + deltaX;
            const newSpouseY = dragStartRef.spouseStartY + deltaY;
            
            // Find and move spouse card
            g.selectAll('.person-card')
              .filter(function() {
                return d3.select(this).attr('data-person-id') == dragStartRef.spouseId;
              })
              .attr('transform', `translate(${newSpouseX}, ${newSpouseY})`);
            
            setPosition(dragStartRef.spouseId, newSpouseX, newSpouseY);
          }
        })
        .on('end', function() {
          setDraggingPersonId(null);
          d3.select(this).style('cursor', 'grab');
        });
      
      card.call(drag);
    }
    
    card.append('rect')
      .attr('width', CARD_WIDTH)
      .attr('height', CARD_HEIGHT)
      .attr('fill', harmonizedBg)
      .attr('stroke', borderColor)
      .attr('stroke-width', 2.5)
      .attr('rx', 6)
      .attr('filter', 'url(#card-shadow)');
    
    const glowColor = isDarkTheme() ? 'rgba(233, 220, 201, 0.1)' : 'rgba(255, 255, 255, 0.3)';
    card.append('rect')
      .attr('x', 1).attr('y', 1)
      .attr('width', CARD_WIDTH - 2).attr('height', CARD_HEIGHT - 2)
      .attr('fill', 'none').attr('stroke', glowColor).attr('stroke-width', 1).attr('rx', 5);
    
    const textMaxWidth = CARD_WIDTH - 16;
    const nameFontSize = 13;
    const secondaryFontSize = 10;

    const nameResult = truncateName(person.firstName, person.lastName, textMaxWidth, nameFontSize);

    card.append('text')
      .attr('x', CARD_WIDTH / 2).attr('y', 22)
      .attr('text-anchor', 'middle').attr('class', 'person-name')
      .attr('fill', '#e9dcc9')
      .attr('filter', 'url(#text-shadow)')
      .text(nameResult.text);

    let currentY = 22;

    const primaryEpithet = getPrimaryEpithet(person.epithets);
    let epithetResult = null;
    if (primaryEpithet) {
      currentY += 13;
      epithetResult = truncateText(primaryEpithet.text, textMaxWidth, secondaryFontSize);
      card.append('text')
        .attr('x', CARD_WIDTH / 2).attr('y', currentY)
        .attr('text-anchor', 'middle').attr('class', 'person-epithet')
        .attr('fill', '#d4a574')
        .attr('font-style', 'italic')
        .attr('font-size', '10px')
        .attr('filter', 'url(#text-shadow)')
        .text(epithetResult.text);
    }

    let maidenResult = null;
    if (person.maidenName) {
      currentY += 13;
      const maidenText = `(née ${person.maidenName})`;
      maidenResult = truncateText(maidenText, textMaxWidth, secondaryFontSize);
      card.append('text')
        .attr('x', CARD_WIDTH / 2).attr('y', currentY)
        .attr('text-anchor', 'middle').attr('class', 'person-maiden')
        .attr('fill', '#b8a891')
        .attr('filter', 'url(#text-shadow)')
        .text(maidenResult.text);
    }
    currentY += 16;
    const dates = `b. ${person.dateOfBirth}${person.dateOfDeath ? ` - d. ${person.dateOfDeath}` : ''}`;
    const datesResult = truncateText(dates, textMaxWidth, secondaryFontSize);
    card.append('text')
      .attr('x', CARD_WIDTH / 2).attr('y', currentY)
      .attr('text-anchor', 'middle').attr('class', 'person-dates')
      .attr('fill', '#b8a891')
      .attr('filter', 'url(#text-shadow)')
      .text(datesResult.text);

    const anyTruncated = nameResult.truncated ||
                         epithetResult?.truncated ||
                         maidenResult?.truncated ||
                         datesResult.truncated;
    if (anyTruncated) {
      let tooltipParts = [nameResult.fullText];
      if (epithetResult?.fullText) tooltipParts.push(epithetResult.fullText);
      if (maidenResult?.fullText) tooltipParts.push(maidenResult.fullText);
      if (datesResult.truncated) tooltipParts.push(datesResult.fullText);

      card.append('title').text(tooltipParts.join('\n'));
    }

    const isHighlighted = searchResults.some(p => p.id === person.id);
    const isUrlHighlighted = highlightedPersonId === person.id;
    const isDevSelected = isManualMode && auraPersonId === person.id;
    
    if (isHighlighted) {
      card.append('rect')
        .attr('width', CARD_WIDTH)
        .attr('height', CARD_HEIGHT)
        .attr('fill', 'none')
        .attr('stroke', '#ffff00')
        .attr('stroke-width', 3)
        .attr('rx', 6)
        .attr('class', 'search-highlight');
    }
    
    if (isUrlHighlighted) {
      card.append('rect')
        .attr('width', CARD_WIDTH + 16)
        .attr('height', CARD_HEIGHT + 16)
        .attr('x', -8)
        .attr('y', -8)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(212, 175, 55, 0.4)')
        .attr('stroke-width', 8)
        .attr('rx', 14)
        .attr('class', 'url-highlight-glow');
      
      card.append('rect')
        .attr('width', CARD_WIDTH + 6)
        .attr('height', CARD_HEIGHT + 6)
        .attr('x', -3)
        .attr('y', -3)
        .attr('fill', 'none')
        .attr('stroke', '#d4af37')
        .attr('stroke-width', 3)
        .attr('rx', 9)
        .attr('class', 'url-highlight');
    }
    
    // 🛠️ DEV LAYOUT: Selection ring for dev mode
    if (isDevSelected) {
      card.append('rect')
        .attr('width', CARD_WIDTH + 8)
        .attr('height', CARD_HEIGHT + 8)
        .attr('x', -4)
        .attr('y', -4)
        .attr('fill', 'none')
        .attr('stroke', '#00ff88')
        .attr('stroke-width', 3)
        .attr('stroke-dasharray', '6,3')
        .attr('rx', 10)
        .attr('class', 'dev-selection-ring');
    }
    
    if (showRelationships && relationshipMap.has(person.id)) {
      const relationship = relationshipMap.get(person.id);
      card.append('rect')
        .attr('x', 5)
        .attr('y', CARD_HEIGHT - 20)
        .attr('width', CARD_WIDTH - 10)
        .attr('height', 16)
        .attr('fill', 'rgba(0, 0, 0, 0.7)')
        .attr('rx', 3);
      
      card.append('text')
        .attr('x', CARD_WIDTH / 2)
        .attr('y', CARD_HEIGHT - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ffffff')
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .text(relationship);
    }
    
    const personDignities = dignitiesByPerson.get(person.id);
    if (personDignities && personDignities.length > 0) {
      const topDignity = personDignities[0];
      const icon = getDignityIcon(topDignity);
      
      card.append('circle')
        .attr('cx', CARD_WIDTH - 12)
        .attr('cy', 12)
        .attr('r', 10)
        .attr('fill', isDarkTheme() ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.7)')
        .attr('stroke', isDarkTheme() ? 'rgba(212, 165, 116, 0.5)' : 'rgba(139, 90, 43, 0.5)')
        .attr('stroke-width', 1);
      
      card.append('text')
        .attr('x', CARD_WIDTH - 12)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('class', 'dignity-icon')
        .text(icon);
      
      card.append('title')
        .text(`${topDignity.title}${personDignities.length > 1 ? ` (+${personDignities.length - 1} more)` : ''}`);
    }
    
    return { x: finalX, y: finalY, width: CARD_WIDTH, height: CARD_HEIGHT, personId: person.id };
  };

  const drawMarriageLine = (g, pos1, pos2, themeColors, relationship = null) => {
    const isBetrothed = relationship?.marriageStatus === 'betrothed';

    const marriageColor = isDarkTheme() ? '#c08a7a' : '#b87a8a';
    const betrothalColor = isDarkTheme() ? '#8a7ac0' : '#9a8ab8';
    const lineColor = isBetrothed ? betrothalColor : marriageColor;

    const x1 = pos1.x + pos1.width;
    const y1 = pos1.y + pos1.height / 2;
    const x2 = pos2.x;
    const y2 = pos2.y + pos2.height / 2;

    const line = g.append('line').attr('class', isBetrothed ? 'betrothal-line' : 'marriage-line')
      .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
      .attr('stroke', lineColor)
      .attr('stroke-width', 2.5)
      .attr('opacity', 0.8);

    if (isBetrothed) {
      line.attr('stroke-dasharray', '8,4');
    }

    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  };

  const drawChildLines = (g, marriageCenter, positions, parentY, childY, peopleById, parentMap, positionMap, themeColors, yOffset = 0, parentId = null, spouseId = null) => {
    if (positions.length === 0) return;
    const midY = parentY + (childY - parentY) / 2;
    
    const legitimateChildren = [];
    const bastardChildren = [];
    const adoptedChildren = [];
    
    positions.forEach(pos => {
      const person = peopleById.get(pos.personId);
      if (person) {
        if (person.legitimacyStatus === 'bastard') {
          bastardChildren.push(pos);
        } else if (person.legitimacyStatus === 'adopted') {
          adoptedChildren.push(pos);
        } else {
          legitimateChildren.push(pos);
        }
      }
    });

    const lineSystemsCount = [legitimateChildren.length > 0, bastardChildren.length > 0, adoptedChildren.length > 0].filter(Boolean).length;
    
    let legitOffset = 0;
    let bastardOffset = 0;
    let adoptedOffset = 0;
    
    if (lineSystemsCount === 1) {
      legitOffset = bastardOffset = adoptedOffset = 0;
    } else if (lineSystemsCount === 2) {
      if (legitimateChildren.length > 0 && bastardChildren.length > 0) {
        legitOffset = 2.5;
        bastardOffset = -2.5;
      } else if (legitimateChildren.length > 0 && adoptedChildren.length > 0) {
        legitOffset = -2.5;
        adoptedOffset = 2.5;
      } else if (bastardChildren.length > 0 && adoptedChildren.length > 0) {
        bastardOffset = -2.5;
        adoptedOffset = 2.5;
      }
    } else if (lineSystemsCount === 3) {
      bastardOffset = -5;
      legitOffset = 0;
      adoptedOffset = 5;
    }

    if (legitimateChildren.length > 0) {
      // Sort children by X position to ensure correct line drawing
      const sortedLegit = [...legitimateChildren].sort((a, b) => a.x - b.x);
      const legitFirstX = sortedLegit[0].x + CARD_WIDTH / 2;
      const legitLastX = sortedLegit[sortedLegit.length - 1].x + CARD_WIDTH / 2;
      const legitMarriageX = marriageCenter.x + legitOffset;
      const legitY = midY + yOffset;

      // Vertical line from parent down to horizontal bar level
      g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', legitMarriageX).attr('y1', marriageCenter.y).attr('x2', legitMarriageX).attr('y2', legitY);
      // Horizontal line spanning from leftmost to rightmost child (or from parent to nearest edge if parent is outside)
      const horizLeftX = Math.min(legitFirstX, legitMarriageX);
      const horizRightX = Math.max(legitLastX, legitMarriageX);
      g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', horizLeftX).attr('y1', legitY).attr('x2', horizRightX).attr('y2', legitY);
      // Vertical lines down to each child
      sortedLegit.forEach(pos => {
        g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', legitY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }

    if (bastardChildren.length > 0) {
      // Sort bastard children by X position
      const sortedBastards = [...bastardChildren].sort((a, b) => a.x - b.x);
      const bastardFirstX = sortedBastards[0].x + CARD_WIDTH / 2;
      const bastardLastX = sortedBastards[sortedBastards.length - 1].x + CARD_WIDTH / 2;
      const bastardY = midY - 5 + yOffset;

      let bastardMarriageX = marriageCenter.x + bastardOffset;
      let bastardStartY = marriageCenter.y;

      const firstBastard = peopleById.get(sortedBastards[0].personId);
      if (firstBastard) {
        const bastardParents = parentMap.get(firstBastard.id) || [];
        const hasBothParents = spouseId && bastardParents.includes(parentId) && bastardParents.includes(spouseId);

        if (!hasBothParents) {
          const parentPos = positionMap.get(parentId);
          if (parentPos) {
            bastardMarriageX = parentPos.x + CARD_WIDTH / 2;
            bastardStartY = parentY;
          }
        }
      }

      // Vertical line from parent down to horizontal bar level
      g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', bastardMarriageX).attr('y1', bastardStartY).attr('x2', bastardMarriageX).attr('y2', bastardY);
      // Horizontal line spanning from leftmost to rightmost child (or from parent to nearest edge)
      const horizLeftX = Math.min(bastardFirstX, bastardMarriageX);
      const horizRightX = Math.max(bastardLastX, bastardMarriageX);
      g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', horizLeftX).attr('y1', bastardY).attr('x2', horizRightX).attr('y2', bastardY);
      // Vertical lines down to each child
      sortedBastards.forEach(pos => {
        g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', bastardY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }

    if (adoptedChildren.length > 0) {
      // Sort adopted children by X position
      const sortedAdopted = [...adoptedChildren].sort((a, b) => a.x - b.x);
      const adoptedFirstX = sortedAdopted[0].x + CARD_WIDTH / 2;
      const adoptedLastX = sortedAdopted[sortedAdopted.length - 1].x + CARD_WIDTH / 2;
      const adoptedMarriageX = marriageCenter.x + adoptedOffset;
      const adoptedY = midY + 5 + yOffset;

      // Vertical line from parent down to horizontal bar level
      g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', adoptedMarriageX).attr('y1', marriageCenter.y).attr('x2', adoptedMarriageX).attr('y2', adoptedY);
      // Horizontal line spanning from leftmost to rightmost child (or from parent to nearest edge)
      const horizLeftX = Math.min(adoptedFirstX, adoptedMarriageX);
      const horizRightX = Math.max(adoptedLastX, adoptedMarriageX);
      g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', horizLeftX).attr('y1', adoptedY).attr('x2', horizRightX).attr('y2', adoptedY);
      // Vertical lines down to each child
      sortedAdopted.forEach(pos => {
        g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', adoptedY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }
  };

  /* Dev aura overlay removed — was used for layout measurement
  const drawDevAuraOverlay = (g, selectedPersonId, positionMap, themeColors) => {
    if (!selectedPersonId || !positionMap.has(selectedPersonId)) return;

    const { parentMap, childrenMap, spouseMap } = buildRelationshipMaps();
    const family = getImmediateFamily(selectedPersonId, relationships);
    const selectedPos = positionMap.get(selectedPersonId);

    const auraGroup = g.append('g').attr('class', 'dev-aura-overlay');

    // Draw measurement lines to parents (green vertical)
    family.parents.forEach(parentId => {
      const parentPos = positionMap.get(parentId);
      if (parentPos) {
        const dist = Math.round(Math.abs(selectedPos.y - parentPos.y));
        auraGroup.append('line')
          .attr('x1', selectedPos.x + CARD_WIDTH/2)
          .attr('y1', selectedPos.y)
          .attr('x2', selectedPos.x + CARD_WIDTH/2)
          .attr('y2', parentPos.y + CARD_HEIGHT)
          .attr('stroke', 'var(--color-success, #4ade80)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6,4')
          .attr('opacity', 0.8);

        auraGroup.append('text')
          .attr('x', selectedPos.x + CARD_WIDTH/2 + 20)
          .attr('y', (selectedPos.y + parentPos.y + CARD_HEIGHT) / 2)
          .attr('fill', 'var(--color-success, #4ade80)')
          .attr('font-size', '11px')
          .attr('font-family', 'monospace')
          .text(`↕ ${dist}px`);
      }
    });

    // Draw measurement lines to children (green vertical)
    family.children.forEach(childId => {
      const childPos = positionMap.get(childId);
      if (childPos) {
        const dist = Math.round(Math.abs(childPos.y - selectedPos.y));
        auraGroup.append('line')
          .attr('x1', selectedPos.x + CARD_WIDTH/2)
          .attr('y1', selectedPos.y + CARD_HEIGHT)
          .attr('x2', selectedPos.x + CARD_WIDTH/2)
          .attr('y2', childPos.y)
          .attr('stroke', 'var(--color-success, #4ade80)')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6,4')
          .attr('opacity', 0.8);

        auraGroup.append('text')
          .attr('x', selectedPos.x + CARD_WIDTH/2 + 20)
          .attr('y', (selectedPos.y + CARD_HEIGHT + childPos.y) / 2)
          .attr('fill', 'var(--color-success, #4ade80)')
          .attr('font-size', '11px')
          .attr('font-family', 'monospace')
          .text(`↕ ${dist}px`);
      }
    });

    // Draw measurement line to spouse (gold horizontal)
    family.spouses.forEach(spouseId => {
      const spousePos = positionMap.get(spouseId);
      if (spousePos) {
        const dist = Math.round(Math.abs(spousePos.x - selectedPos.x - CARD_WIDTH));
        const y = selectedPos.y + CARD_HEIGHT/2;

        auraGroup.append('line')
          .attr('x1', selectedPos.x + CARD_WIDTH)
          .attr('y1', y)
          .attr('x2', spousePos.x)
          .attr('y2', y)
          .attr('stroke', '#d4a574')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '6,4')
          .attr('opacity', 0.8);

        auraGroup.append('text')
          .attr('x', (selectedPos.x + CARD_WIDTH + spousePos.x) / 2)
          .attr('y', y - 8)
          .attr('fill', '#d4a574')
          .attr('font-size', '11px')
          .attr('font-family', 'monospace')
          .attr('text-anchor', 'middle')
          .text(`↔ ${dist}px`);
      }
    });

    // Draw measurement lines to siblings (blue horizontal)
    family.siblings.forEach(siblingId => {
      const siblingPos = positionMap.get(siblingId);
      if (siblingPos && siblingId !== selectedPersonId) {
        const dist = Math.round(Math.abs(siblingPos.x - selectedPos.x));
        const y = selectedPos.y + CARD_HEIGHT + 15;

        auraGroup.append('line')
          .attr('x1', selectedPos.x + CARD_WIDTH/2)
          .attr('y1', y)
          .attr('x2', siblingPos.x + CARD_WIDTH/2)
          .attr('y2', y)
          .attr('stroke', '#60a5fa')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,4')
          .attr('opacity', 0.6);

        auraGroup.append('text')
          .attr('x', (selectedPos.x + siblingPos.x + CARD_WIDTH) / 2)
          .attr('y', y - 5)
          .attr('fill', '#60a5fa')
          .attr('font-size', '10px')
          .attr('font-family', 'monospace')
          .attr('text-anchor', 'middle')
          .text(`${dist}px`);
      }
    });

    // Coordinate display under selected card
    auraGroup.append('rect')
      .attr('x', selectedPos.x + CARD_WIDTH/2 - 50)
      .attr('y', selectedPos.y + CARD_HEIGHT + 8)
      .attr('width', 100)
      .attr('height', 22)
      .attr('fill', 'var(--bg-primary, #1a1a2e)')
      .attr('stroke', 'var(--accent-primary, #d4a574)')
      .attr('stroke-width', 2)
      .attr('rx', 4);

    auraGroup.append('text')
      .attr('x', selectedPos.x + CARD_WIDTH/2)
      .attr('y', selectedPos.y + CARD_HEIGHT + 23)
      .attr('fill', 'var(--accent-primary, #d4a574)')
      .attr('font-size', '11px')
      .attr('font-family', 'monospace')
      .attr('font-weight', 'bold')
      .attr('text-anchor', 'middle')
      .text(`${Math.round(selectedPos.x)}, ${Math.round(selectedPos.y)}`);
  };
  */

  const drawTree = () => {
    const themeColors = getAllThemeColors();
    
    let savedTransform = null;
    const existingGroup = d3.select(svgRef.current).select('.zoom-group');
    if (!existingGroup.empty()) {
      const transformStr = existingGroup.attr('transform');
      if (transformStr) {
        savedTransform = d3.zoomTransform(existingGroup.node());
      }
    }

    d3.select(svgRef.current).selectAll('*').remove();
    const { peopleById, housesById, parentMap, childrenMap, spouseMap, spouseRelationshipMap } = buildRelationshipMaps();
    
    const svg = d3.select(svgRef.current).attr('width', '100%').attr('height', '100%');

    // Add filter definitions for drop shadows
    const defs = svg.append('defs');
    const dropShadowFilter = defs.append('filter')
      .attr('id', 'card-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '140%');
    dropShadowFilter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 2)
      .attr('stdDeviation', 4)
      .attr('flood-color', 'rgba(0, 0, 0, 0.35)')
      .attr('flood-opacity', 1);

    // Text shadow filter for better readability
    const textShadowFilter = defs.append('filter')
      .attr('id', 'text-shadow')
      .attr('x', '-10%')
      .attr('y', '-10%')
      .attr('width', '120%')
      .attr('height', '120%');
    textShadowFilter.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 1)
      .attr('stdDeviation', 1.5)
      .attr('flood-color', 'rgba(0, 0, 0, 0.7)')
      .attr('flood-opacity', 1);

    const g = svg.append('g').attr('class', 'zoom-group');

    const zoom = d3.zoom().scaleExtent([0.1, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform); setZoomLevel(event.transform.k); });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    g.append('line').attr('class', 'anchor-line')
      .attr('x1', ANCHOR_X).attr('y1', 0).attr('x2', ANCHOR_X).attr('y2', 5000)
      .attr('stroke', themeColors.lines.anchor);

    if (people.length === 0) {
      g.append('text').attr('x', ANCHOR_X).attr('y', 200).attr('text-anchor', 'middle').attr('font-size', '20px').attr('fill', '#e9dcc9').text('No data available.');
      return;
    }

    let scopedPeopleById = peopleById;
    let overrideRootId = null;
    
    if (selectedHouseId) {
      const scopedIds = getHouseScopedPeopleIds(
        selectedHouseId,
        people,
        houses,
        spouseMap,
        childrenMap,
        parentMap,
        showCadetHouses,
        personallySwornToHouse
      );
      
      scopedPeopleById = new Map();
      scopedIds.forEach(id => {
        if (peopleById.has(id)) {
          scopedPeopleById.set(id, peopleById.get(id));
        }
      });
      
      overrideRootId = findRootPersonForHouse(
        scopedIds,
        peopleById,
        parentMap,
        centreOnPersonId
      );
      
      logger.log(`🏠 House filter: ${houses.find(h => h.id === selectedHouseId)?.houseName}`);
      logger.log(`   Scoped people: ${scopedPeopleById.size} of ${peopleById.size}`);
      logger.log(`   Root person ID: ${overrideRootId}`);
    }

    const positionMap = new Map();
    const marriageCenters = new Map();
    const marriageLinesToDraw = [];
    
    const fragmentsToDraw = fragmentInfo.hasMultipleFragments 
      ? fragmentInfo.fragments 
      : [{ rootPerson: scopedPeopleById.get(overrideRootId), peopleIds: new Set(scopedPeopleById.keys()) }];
    
    if (fragmentsToDraw.length === 0 || !fragmentsToDraw[0].rootPerson) {
      g.append('text').attr('x', ANCHOR_X).attr('y', 200).attr('text-anchor', 'middle').attr('font-size', '20px').attr('fill', '#e9dcc9').text('No root couple found.');
      return;
    }
    
    let currentGenPos = START_Y;
    const anchorSibPos = ANCHOR_X;
    
    const layoutToXY = (sibPos, genPos) => {
      return { x: sibPos, y: genPos };
    };
    
    const siblingSize = CARD_WIDTH;
    const genSize = CARD_HEIGHT;
    const genSpacing = verticalSpacing;
    
    fragmentsToDraw.forEach((fragment, fragmentIndex) => {
      if (fragmentIndex > 0) {
        // Add consistent 60px visible gap between fragments
        // (fragmentGap = CARD_HEIGHT + 60px to account for last gen not updating currentGenPos)
        currentGenPos += fragmentGap;
        logger.log(`📏 Fragment ${fragmentIndex + 1}: Added ${FRAGMENT_VISIBLE_GAP}px gap (offset: ${fragmentGap}px)`);
      }
      
      const fragmentPeopleById = new Map();
      fragment.peopleIds.forEach(id => {
        if (scopedPeopleById.has(id)) {
          fragmentPeopleById.set(id, scopedPeopleById.get(id));
        }
      });
      
      fragment.peopleIds.forEach(id => {
        const spouseId = spouseMap.get(id);
        if (spouseId && scopedPeopleById.has(spouseId)) {
          fragmentPeopleById.set(spouseId, scopedPeopleById.get(spouseId));
        }
      });
      
      const fragmentRootId = fragment.rootPerson?.id;
      const generations = detectGenerations(fragmentPeopleById, parentMap, childrenMap, spouseMap, fragmentRootId);
      
      if (generations.length === 0) {
        logger.warn(`Fragment ${fragmentIndex + 1} has no generations`);
        return;
      }
      
      logger.log(`🌳 Drawing fragment ${fragmentIndex + 1}/${fragmentsToDraw.length}: ${fragment.rootPerson?.firstName} ${fragment.rootPerson?.lastName} (${generations.length} generations)`);

      // 🧱 BLOCK LAYOUT: Pre-calculate positions if enabled
      let blockPositions = null;
      if (useBlockLayout) {
        logger.log('🧱 Using BLOCK LAYOUT mode');
        blockPositions = calculateBlockBasedLayout(
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
            branchSpacing: branchSpacing,
            anchorX: ANCHOR_X,
            startY: currentGenPos,
            generationSpacing: GENERATION_SPACING
          }
        );
        logger.log('🧱 Block positions calculated for', blockPositions.size, 'people');
      }

    generations.forEach((genIds, genIndex) => {
      // Set lookup — genIds.includes() inside the per-child loops below was
      // O(n^2) across a wide generation.
      const genIdSet = new Set(genIds);
      const isLastGeneration = genIndex === generations.length - 1;
      logger.log(`Drawing generation ${genIndex} with ${genIds.length} people`);
      
      if (genIndex === 0) {
        const rootPerson = fragmentPeopleById.get(genIds[0]);
        if (!rootPerson) {
          logger.error('Root person not found');
          return;
        }

        const rootSpouseId = spouseMap.get(rootPerson.id);
        const rootSpouse = rootSpouseId ? fragmentPeopleById.get(rootSpouseId) : null;

        // 🧱 BLOCK LAYOUT: Use pre-calculated positions if available
        if (useBlockLayout && blockPositions) {
          const rootBlockPos = blockPositions.get(rootPerson.id);
          if (rootBlockPos) {
            const rootPos = drawPersonCard(g, rootPerson, rootBlockPos.x, rootBlockPos.y, housesById, themeColors, spouseMap, childrenMap);
            positionMap.set(rootPerson.id, rootPos);

            if (rootSpouse) {
              const spouseBlockPos = blockPositions.get(rootSpouse.id);
              if (spouseBlockPos) {
                const spousePos = drawPersonCard(g, rootSpouse, spouseBlockPos.x, spouseBlockPos.y, housesById, themeColors, spouseMap, childrenMap);
                positionMap.set(rootSpouse.id, spousePos);

                const mc = {
                  x: (rootPos.x + rootPos.width + spousePos.x) / 2,
                  y: (rootPos.y + rootPos.height/2 + spousePos.y + spousePos.height/2) / 2
                };
                marriageCenters.set([rootPerson.id, rootSpouse.id].sort().join('-'), mc);
                const relKey = [rootPerson.id, rootSpouse.id].sort((a, b) => a - b).join('-');
                const spouseRel = spouseRelationshipMap.get(relKey);
                marriageLinesToDraw.push([rootPos, spousePos, spouseRel]);
              }
            }

            if (!isLastGeneration) {
              currentGenPos += genSize + genSpacing;
            }
            return; // Skip standard layout for gen 0
          }
        }

        // Standard layout (non-block mode)
        const gen0Cards = rootSpouse ? 2 : 1;
        const gen0SibWidth = gen0Cards * siblingSize + (gen0Cards - 1) * SPACING;
        let gen0SibPos = anchorSibPos - (gen0SibWidth / 2);

        const coords = layoutToXY(gen0SibPos, currentGenPos);
        const rootPos = drawPersonCard(g, rootPerson, coords.x, coords.y, housesById, themeColors, spouseMap, childrenMap);
        positionMap.set(rootPerson.id, rootPos);
        gen0SibPos += siblingSize + SPACING;

        if (rootSpouse) {
          const spouseCoords = layoutToXY(gen0SibPos, currentGenPos);
          const spousePos = drawPersonCard(g, rootSpouse, spouseCoords.x, spouseCoords.y, housesById, themeColors, spouseMap, childrenMap);
          positionMap.set(rootSpouse.id, spousePos);

          const mc = {
            x: (rootPos.x + rootPos.width + spousePos.x) / 2,
            y: (rootPos.y + rootPos.height/2 + spousePos.y + spousePos.height/2) / 2
          };
          marriageCenters.set([rootPerson.id, rootSpouse.id].sort().join('-'), mc);
          const relKey = [rootPerson.id, rootSpouse.id].sort((a, b) => a - b).join('-');
          const spouseRel = spouseRelationshipMap.get(relKey);
          marriageLinesToDraw.push([rootPos, spousePos, spouseRel]);
        }
        
        if (!isLastGeneration) {
          currentGenPos += genSize + genSpacing;
        }
        return;
      }

      // 🧱 BLOCK LAYOUT: For subsequent generations, use pre-calculated positions
      if (useBlockLayout && blockPositions) {
        // Draw all people in this generation using block positions
        genIds.forEach(childId => {
          const childBlockPos = blockPositions.get(childId);
          const child = fragmentPeopleById.get(childId);
          if (!childBlockPos || !child) return;

          const childPos = drawPersonCard(g, child, childBlockPos.x, childBlockPos.y, housesById, themeColors, spouseMap, childrenMap);
          positionMap.set(childId, childPos);

          // Draw spouse if has one
          const childSpouseId = spouseMap.get(childId);
          if (childSpouseId && fragmentPeopleById.has(childSpouseId)) {
            const spouse = fragmentPeopleById.get(childSpouseId);
            const spouseBlockPos = blockPositions.get(childSpouseId);
            if (spouseBlockPos) {
              const spousePos = drawPersonCard(g, spouse, spouseBlockPos.x, spouseBlockPos.y, housesById, themeColors, spouseMap, childrenMap);
              positionMap.set(childSpouseId, spousePos);

              const mc = {
                x: (childPos.x + childPos.width + spousePos.x) / 2,
                y: (childPos.y + childPos.height/2 + spousePos.y + spousePos.height/2) / 2
              };
              marriageCenters.set([childId, childSpouseId].sort().join('-'), mc);
              const relKey = [childId, childSpouseId].sort((a, b) => a - b).join('-');
              const spouseRel = spouseRelationshipMap.get(relKey);
              marriageLinesToDraw.push([childPos, spousePos, spouseRel]);
            }
          }
        });

        // Draw parent-child lines - separate children by parentage
        const prevGenIds = generations[genIndex - 1];
        const processedChildIds = new Set();

        prevGenIds.forEach(parentId => {
          const parentPos = positionMap.get(parentId);
          if (!parentPos) return;

          const spouseId = spouseMap.get(parentId);
          const spousePos = spouseId ? positionMap.get(spouseId) : null;

          // Get this parent's children
          const parentChildren = childrenMap.get(parentId) || [];
          const spouseChildren = spouseId ? (childrenMap.get(spouseId) || []) : [];

          // Separate children into: both parents vs single parent (bastards)
          const jointChildren = []; // Children of both parents
          const singleParentChildren = []; // Children of only this parent (bastards)

          parentChildren.forEach(childId => {
            if (!genIdSet.has(childId) || processedChildIds.has(childId)) return;

            const childParents = parentMap.get(childId) || [];
            const hasBothParents = spouseId && childParents.includes(parentId) && childParents.includes(spouseId);

            if (hasBothParents) {
              jointChildren.push(childId);
            } else if (childParents.includes(parentId) && !childParents.includes(spouseId)) {
              singleParentChildren.push(childId);
            }
            processedChildIds.add(childId);
          });

          // Also check spouse's children (in case they have children from another relationship)
          if (spouseId) {
            spouseChildren.forEach(childId => {
              if (!genIdSet.has(childId) || processedChildIds.has(childId)) return;

              const childParents = parentMap.get(childId) || [];
              // Already handled if both parents, so this would be spouse-only child
              if (!childParents.includes(parentId) && childParents.includes(spouseId)) {
                // This child belongs to spouse only - will be drawn when we process spouse
              }
            });
          }

          const prevGenY = currentGenPos - genSpacing - CARD_HEIGHT;

          // Draw lines for joint children (from marriage center)
          if (jointChildren.length > 0) {
            const jointChildPositions = jointChildren
              .map(id => positionMap.get(id))
              .filter(pos => pos);

            if (jointChildPositions.length > 0) {
              const mcKey = spouseId ? [parentId, spouseId].sort().join('-') : parentId.toString();
              const parentMC = marriageCenters.get(mcKey) || {
                x: parentPos.x + CARD_WIDTH/2,
                y: parentPos.y + CARD_HEIGHT
              };
              drawChildLines(g, parentMC, jointChildPositions, prevGenY + CARD_HEIGHT, currentGenPos, fragmentPeopleById, parentMap, positionMap, themeColors, 0, parentId, spouseId);
            }
          }

          // Draw lines for single-parent children (bastards) - from this parent only
          if (singleParentChildren.length > 0) {
            const singleChildPositions = singleParentChildren
              .map(id => positionMap.get(id))
              .filter(pos => pos);

            if (singleChildPositions.length > 0) {
              const singleParentMC = {
                x: parentPos.x + CARD_WIDTH/2,
                y: parentPos.y + CARD_HEIGHT
              };
              drawChildLines(g, singleParentMC, singleChildPositions, prevGenY + CARD_HEIGHT, currentGenPos, fragmentPeopleById, parentMap, positionMap, themeColors, 0, parentId, null);
            }
          }
        });

        if (!isLastGeneration) {
          currentGenPos += genSize + genSpacing;
        }
        return; // Skip standard layout for this generation
      }

      // Standard layout (non-block mode)
      const prevGenIds = generations[genIndex - 1];
      const groups = [];
      const processedChildren = new Set();
      
      const prevGenPeople = new Set(prevGenIds);
      prevGenIds.forEach(pid => {
        const spouse = spouseMap.get(pid);
        if (spouse) prevGenPeople.add(spouse);
      });
      
      prevGenPeople.forEach(parentId => {
        const parent = fragmentPeopleById.get(parentId);
        if (!parent) return;
        
        const spouseId = spouseMap.get(parentId);
        const children = childrenMap.get(parentId) || [];
        const childSet = new Set(children);
        
        if (spouseId) {
          const spouseChildren = childrenMap.get(spouseId) || [];
          spouseChildren.forEach(c => childSet.add(c));
        }
        
        const genChildren = Array.from(childSet)
          .filter(id => genIdSet.has(id) && !processedChildren.has(id))
          .map(id => fragmentPeopleById.get(id))
          .filter(p => p)
          .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
        
        if (genChildren.length === 0) return;
        
        genChildren.forEach(child => processedChildren.add(child.id));
        
        const groupKey = spouseId ? [parentId, spouseId].sort().join('-') : parentId.toString();
        
        if (groups.find(g => g.key === groupKey)) return;
        
        groups.push({
          key: groupKey,
          parentId: parentId,
          spouseId: spouseId,
          children: genChildren
        });
      });
      
      const traceableCache = new Map();
      
      const canTraceToRoot = (personId, visited = new Set()) => {
        if (traceableCache.has(personId)) return traceableCache.get(personId);
        
        if (visited.has(personId)) return false;
        visited.add(personId);
        
        const person = fragmentPeopleById.get(personId);
        if (!person) {
          traceableCache.set(personId, false);
          return false;
        }
        
        const rootPersonId = generations[0]?.[0];
        if (personId === rootPersonId) {
          traceableCache.set(personId, true);
          return true;
        }
        
        const rootSpouseId = spouseMap.get(rootPersonId);
        if (personId === rootSpouseId) {
          traceableCache.set(personId, true);
          return true;
        }
        
        const parents = parentMap.get(personId);
        if (!parents || parents.length === 0) {
          traceableCache.set(personId, false);
          return false;
        }
        
        const result = parents.some(pid => canTraceToRoot(pid, new Set(visited)));
        traceableCache.set(personId, result);
        return result;
      };
      
      const getAncestralOrderKey = (personId) => {
        const orderChain = [];
        let currentId = personId;
        
        while (currentId) {
          const person = scopedPeopleById.get(currentId);
          if (!person) break;
          
          const parents = parentMap.get(currentId);
          if (!parents || parents.length === 0) {
            orderChain.unshift(0);
            break;
          }
          
          let parentId = parents[0];
          if (parents.length > 1) {
            const bloodParent = parents.find(pid => canTraceToRoot(pid));
            if (bloodParent) {
              parentId = bloodParent;
            }
          }
          
          const parent = scopedPeopleById.get(parentId);
          if (!parent) break;
          
          const siblingIds = childrenMap.get(parentId) || [];
          const siblings = siblingIds
            .map(id => scopedPeopleById.get(id))
            .filter(p => p)
            .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
          
          const birthPosition = siblings.findIndex(s => s.id === currentId);
          orderChain.unshift(birthPosition >= 0 ? birthPosition : 999);
          
          currentId = parentId;
        }
        
        return orderChain;
      };
      
      const compareOrderKeys = (keyA, keyB) => {
        const maxLen = Math.max(keyA.length, keyB.length);
        for (let i = 0; i < maxLen; i++) {
          const a = keyA[i] ?? 0;
          const b = keyB[i] ?? 0;
          if (a !== b) return a - b;
        }
        return 0;
      };
      
      groups.sort((a, b) => {
        const keyA = getAncestralOrderKey(a.parentId);
        const keyB = getAncestralOrderKey(b.parentId);
        return compareOrderKeys(keyA, keyB);
      });
      
      let totalCards = 0;
      groups.forEach(group => {
        totalCards += group.children.length;
        
        group.children.forEach(child => {
          const childSpouseId = spouseMap.get(child.id);
          if (childSpouseId && scopedPeopleById.has(childSpouseId)) {
            totalCards++;
          }
        });
      });
      
      const genSibWidth = totalCards * siblingSize + (totalCards - 1) * SPACING + (groups.length - 1) * GROUP_SPACING;
      let currentSibPos = anchorSibPos - (genSibWidth / 2);
      
      groups.forEach((group, groupIdx) => {
        const groupPositions = [];
        
        group.children.forEach(child => {
          const coords = layoutToXY(currentSibPos, currentGenPos);
          const childPos = drawPersonCard(g, child, coords.x, coords.y, housesById, themeColors, spouseMap, childrenMap);
          positionMap.set(child.id, childPos);
          groupPositions.push(childPos);
          currentSibPos += siblingSize + SPACING;
          
          const childSpouseId = spouseMap.get(child.id);
          if (childSpouseId && fragmentPeopleById.has(childSpouseId)) {
            const spouse = fragmentPeopleById.get(childSpouseId);
            const spouseCoords = layoutToXY(currentSibPos, currentGenPos);
            const spousePos = drawPersonCard(g, spouse, spouseCoords.x, spouseCoords.y, housesById, themeColors, spouseMap, childrenMap);
            positionMap.set(childSpouseId, spousePos);

            const mc = {
              x: (childPos.x + childPos.width + spousePos.x) / 2,
              y: (childPos.y + childPos.height/2 + spousePos.y + spousePos.height/2) / 2
            };
            marriageCenters.set([child.id, childSpouseId].sort().join('-'), mc);
            const relKey = [child.id, childSpouseId].sort((a, b) => a - b).join('-');
            const spouseRel = spouseRelationshipMap.get(relKey);
            marriageLinesToDraw.push([childPos, spousePos, spouseRel]);

            currentSibPos += siblingSize + SPACING;
          }
        });
        
          const mcKey = group.spouseId ? [group.parentId, group.spouseId].sort().join('-') : group.parentId.toString();
          const parentPos = positionMap.get(group.parentId);
          
          if (!parentPos) {
            logger.warn(`Parent position not found for parentId: ${group.parentId}`);
            if (groupIdx < groups.length - 1) {
              currentSibPos += GROUP_SPACING;
            }
            return;
          }
          
          const parentMC = marriageCenters.get(mcKey) || {
            x: parentPos.x + CARD_WIDTH/2,
            y: parentPos.y + CARD_HEIGHT
          };
          
          const prevGenY = currentGenPos - genSpacing - CARD_HEIGHT;
          
          const isLochlann = group.parentId === 18;
          const yOffset = isLochlann ? -5 : 0;
          
          drawChildLines(g, parentMC, groupPositions, prevGenY + CARD_HEIGHT, currentGenPos, fragmentPeopleById, parentMap, positionMap, themeColors, yOffset, group.parentId, group.spouseId);
        
        if (groupIdx < groups.length - 1) {
          currentSibPos += GROUP_SPACING;
        }
      });
      
      if (!isLastGeneration) {
        currentGenPos += genSize + genSpacing;
      }
    });
    
    });
    
    marriageLinesToDraw.forEach(([pos1, pos2, relationship]) => drawMarriageLine(g, pos1, pos2, themeColors, relationship));

    // 🛠️ DEV LAYOUT: Store algorithm positions for the hook
    const algorithmPositions = {};
    // 🛠️ DEV LAYOUT - PARKED
    // positionMap.forEach((pos, personId) => {
    //   algorithmPositions[personId] = { x: pos.x, y: pos.y };
    // });
    // algorithmPositionsRef.current = algorithmPositions;
    // if (isManualMode && auraPersonId) {
    //   drawDevAuraOverlay(g, auraPersonId, positionMap, themeColors);
    // }

    // Fragment visualization code...
    if (fragmentInfo.hasMultipleFragments && fragmentSeparatorStyle !== 'none') {
      const personToFragment = new Map();
      fragmentInfo.fragments.forEach((frag, index) => {
        frag.peopleIds.forEach(pid => personToFragment.set(pid, index));
        frag.houseMembers.forEach(member => {
          const spouseId = spouseMap.get(member.id);
          if (spouseId && !personToFragment.has(spouseId)) {
            personToFragment.set(spouseId, index);
          }
        });
      });
      
      const fragmentBounds = fragmentInfo.fragments.map((frag, index) => {
        const positions = Array.from(positionMap.entries())
          .filter(([pid, pos]) => personToFragment.get(pid) === index)
          .map(([pid, pos]) => pos);
        
        if (positions.length === 0) return null;
        
        const minX = Math.min(...positions.map(p => p.x)) - 20;
        const maxX = Math.max(...positions.map(p => p.x + p.width)) + 20;
        const minY = Math.min(...positions.map(p => p.y)) - 20;
        const maxY = Math.max(...positions.map(p => p.y + p.height)) + 20;
        
        return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, index };
      }).filter(b => b !== null);
      
      fragmentBounds.sort((a, b) => a.minY - b.minY);

      // Store fragment bounds for navigation
      fragmentBoundsRef.current = fragmentBounds;

      const fragmentColors = isDarkTheme() 
        ? ['rgba(139, 90, 43, 0.08)', 'rgba(70, 90, 110, 0.08)', 'rgba(90, 70, 90, 0.08)', 'rgba(60, 90, 60, 0.08)']
        : ['rgba(210, 180, 140, 0.12)', 'rgba(180, 200, 220, 0.12)', 'rgba(220, 200, 220, 0.12)', 'rgba(200, 220, 200, 0.12)'];
      
      const separatorColor = isDarkTheme() ? 'rgba(184, 168, 145, 0.4)' : 'rgba(139, 90, 43, 0.3)';
      const headerBgColor = isDarkTheme() ? 'rgba(45, 35, 28, 0.9)' : 'rgba(250, 245, 235, 0.9)';
      const headerTextColor = isDarkTheme() ? '#e9dcc9' : '#5c4a3d';
      
      const fragmentGroup = g.insert('g', '.person-card').attr('class', 'fragment-decorations');
      
      fragmentBounds.forEach((bounds, i) => {
        const fragment = fragmentInfo.fragments[bounds.index];
        const colorIndex = bounds.index % fragmentColors.length;
        
        if (fragmentSeparatorStyle === 'background' || fragmentSeparatorStyle === 'combined') {
          fragmentGroup.append('rect')
            .attr('class', 'fragment-bg')
            .attr('x', bounds.minX)
            .attr('y', bounds.minY)
            .attr('width', bounds.width)
            .attr('height', bounds.height)
            .attr('fill', fragmentColors[colorIndex])
            .attr('rx', 12)
            .attr('stroke', isDarkTheme() ? 'rgba(184, 168, 145, 0.15)' : 'rgba(139, 90, 43, 0.1)')
            .attr('stroke-width', 1);
        }
      });
      
      if (fragmentSeparatorStyle === 'separator' || fragmentSeparatorStyle === 'combined') {
        for (let i = 0; i < fragmentBounds.length - 1; i++) {
          const upperBounds = fragmentBounds[i];
          const lowerBounds = fragmentBounds[i + 1];
          
          const gapY = (upperBounds.maxY + lowerBounds.minY) / 2;
          const lineMinX = Math.min(upperBounds.minX, lowerBounds.minX) - 50;
          const lineMaxX = Math.max(upperBounds.maxX, lowerBounds.maxX) + 50;
          
          const upperFragment = fragmentInfo.fragments[upperBounds.index];
          const lowerFragment = fragmentInfo.fragments[lowerBounds.index];
          const latestUpperBirth = Math.max(...upperFragment.houseMembers.map(p => parseInt(p.dateOfBirth) || 0));
          const earliestLowerBirth = Math.min(...lowerFragment.houseMembers.map(p => parseInt(p.dateOfBirth) || 9999));
          const yearGap = earliestLowerBirth - latestUpperBirth;
          
          g.append('line')
            .attr('class', 'fragment-separator')
            .attr('x1', lineMinX)
            .attr('y1', gapY)
            .attr('x2', lineMaxX)
            .attr('y2', gapY)
            .attr('stroke', separatorColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,6');
          
          const centerX = (lineMinX + lineMaxX) / 2;
          
          const labelText = yearGap > 0 ? `～ ~${yearGap} years ～` : '～ Lineage Gap ～';
          const labelWidth = labelText.length * 6.5 + 20;
          
          g.append('rect')
            .attr('class', 'fragment-separator-label-bg')
            .attr('x', centerX - labelWidth / 2)
            .attr('y', gapY - 10)
            .attr('width', labelWidth)
            .attr('height', 20)
            .attr('fill', headerBgColor)
            .attr('rx', 10);
          
          g.append('text')
            .attr('class', 'fragment-separator-label')
            .attr('x', centerX)
            .attr('y', gapY + 4)
            .attr('text-anchor', 'middle')
            .attr('fill', headerTextColor)
            .attr('font-size', '11px')
            .attr('font-family', 'Georgia, serif')
            .attr('font-style', 'italic')
            .text(labelText);
        }
      }
      
      logger.log('🎨 Fragment visualization drawn:', fragmentSeparatorStyle);
    }
    
    // Center view on content
    if (positionMap.size > 0) {
      const positions = Array.from(positionMap.values());
      
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x + p.width));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y + p.height));
      
      const contentCenterX = (minX + maxX) / 2;
      const contentCenterY = (minY + maxY) / 2;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      
      const svgElement = svgRef.current;
      const viewportWidth = svgElement?.clientWidth || window.innerWidth;
      const viewportHeight = svgElement?.clientHeight || window.innerHeight;
      
      if (highlightedPersonId && positionMap.has(highlightedPersonId)) {
        const highlightedPos = positionMap.get(highlightedPersonId);
        const personCenterX = highlightedPos.x + highlightedPos.width / 2;
        const personCenterY = highlightedPos.y + highlightedPos.height / 2;
        const targetScale = 1.5;
        
        const translateX = (viewportWidth / 2) - (personCenterX * targetScale);
        const translateY = (viewportHeight / 2) - (personCenterY * targetScale);
        
        const highlightTransform = d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(targetScale);
        
        svg.call(zoom.transform, highlightTransform);
        setZoomLevel(targetScale);
        
        logger.log('🎯 Centered on highlighted person:', {
          personId: highlightedPersonId,
          position: { x: personCenterX, y: personCenterY },
          scale: targetScale
        });
      } else if (savedTransform) {
        svg.call(zoom.transform, savedTransform);
      } else {
        const padding = 100;
        const scaleX = (viewportWidth - padding * 2) / contentWidth;
        const scaleY = (viewportHeight - padding * 2) / contentHeight;
        const idealScale = Math.min(scaleX, scaleY, 1);
        const finalScale = Math.max(idealScale, 0.3);
        
        const translateX = (viewportWidth / 2) - (contentCenterX * finalScale);
        const translateY = (viewportHeight / 2) - (contentCenterY * finalScale);
        
        const initialTransform = d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(finalScale);
        
        svg.call(zoom.transform, initialTransform);
        setZoomLevel(finalScale);
        
        logger.log('🎯 Tree centered:', {
          contentCenter: { x: contentCenterX, y: contentCenterY },
          contentSize: { width: contentWidth, height: contentHeight },
          viewport: { width: viewportWidth, height: viewportHeight },
          scale: finalScale
        });
      }
    } else {
      const fallbackTransform = savedTransform || d3.zoomIdentity.translate(200, 100).scale(0.8);
      svg.call(zoom.transform, fallbackTransform);
    }
  };

  const handleHouseChange = (newHouseId) => {
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const g = svg.select('.zoom-group');
      if (!g.empty()) {
        g.attr('transform', null);
      }
    }
    setSelectedHouseId(newHouseId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Loading Family Tree...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Fetching your genealogy data</p>
        </div>
      </div>
    );
  }

  // Show landing view when no house is selected and no URL navigation is pending
  if (!selectedHouseId && !urlPersonId) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Navigation
          people={people}
          onSearchResults={handleSearchResults}
          showSearch={false}
          compactMode={false}
        />
        <TreeLandingView
          houses={houses}
          people={people}
          onSelectHouse={handleHouseChange}
        />
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Navigation
        people={people}
        onSearchResults={handleSearchResults}
        showSearch={true}
        showControlsToggle={true}
        controlsExpanded={controlsPanelExpanded}
        onToggleControls={() => setControlsPanelExpanded(!controlsPanelExpanded)}
        compactMode={true}
      />

      {/* Back to Houses button */}
      <button
        className="tree-back-btn"
        onClick={() => setSelectedHouseId(null)}
        title="Back to house selection"
      >
        <Icon name="arrow-left" size={16} />
        <span>All Houses</span>
      </button>

      <TreeSettingsPanel
        isExpanded={controlsPanelExpanded}
        houses={houses}
        people={people}
        selectedHouseId={selectedHouseId}
        onHouseChange={handleHouseChange}
        centreOnPersonId={centreOnPersonId}
        onCentreOnChange={setCentreOnPersonId}
        notablePeople={getHouseNotablePeople}
        showRelationships={showRelationships}
        onShowRelationshipsChange={(checked) => {
          setShowRelationships(checked);
          showRelationshipsRef.current = checked;
          if (!checked) {
            setReferencePerson(null);
            setRelationshipMap(new Map());
          }
        }}
        showBranchView={showBranchView}
        onShowBranchViewChange={setShowBranchView}
        hasMultipleFragments={fragmentInfo.hasMultipleFragments}
        bastardCadets={bastardCadetsOfSelected}
        nobleCadets={nobleCadetsOfSelected}
        parentHouse={parentHouseOfSelected}
      />

      <TreeControls
        svgRef={svgRef}
        zoomBehaviorRef={zoomBehaviorRef}
        zoomLevel={zoomLevel}
        onZoomChange={(level) => setZoomLevel(level)}
        isDarkTheme={isDarkTheme()}
      />

      {/* Fragment Navigator - Minimal pill in top-left */}
      {fragmentInfo.hasMultipleFragments && !showBranchView && (
        <FragmentNavigator
          fragments={fragmentInfo.fragments}
          onNavigateToFragment={navigateToFragment}
        />
      )}

      {/* Main Tree View or Branch View */}
      {showBranchView && fragmentInfo.hasMultipleFragments ? (
        (() => {
          const maps = buildRelationshipMaps();
          return (
            <BranchView
              fragments={fragmentInfo.fragments}
              peopleById={maps.peopleById}
              parentMap={maps.parentMap}
              childrenMap={maps.childrenMap}
              spouseMap={maps.spouseMap}
              spouseRelationshipMap={maps.spouseRelationshipMap}
              housesById={maps.housesById}
              detectGenerations={detectGenerations}
              dignitiesByPerson={dignitiesByPerson}
              getDignityIcon={getDignityIcon}
              getPrimaryEpithet={getPrimaryEpithet}
              onExit={() => setShowBranchView(false)}
            />
          );
        })()
      ) : (
        <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <svg
            ref={svgRef}
            className="tree-svg"
            role="img"
            aria-label="Family tree visualization showing genealogical relationships"
          ></svg>
        </div>
      )}

      {selectedPerson && (
        <QuickEditPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onPersonSelect={(newPerson) => {
            setSelectedPerson(newPerson);
            if (showRelationshipsRef.current) {
              setReferencePerson(newPerson);
              const { parentMap, childrenMap, spouseMap } = buildRelationshipMaps();
              const newRelationships = calculateAllRelationships(newPerson.id, people, parentMap, childrenMap, spouseMap);
              setRelationshipMap(newRelationships);
            }
          }}
          isDarkTheme={isDarkTheme()}
        />
      )}

      <style>{`
        .tree-back-btn {
          position: fixed;
          bottom: 6rem;
          left: 1.5rem;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-primary);
          border-radius: var(--radius-lg, 8px);
          box-shadow: var(--shadow-lg);
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 0.875rem;
          font-weight: 500;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .tree-back-btn:hover {
          border-color: var(--accent-primary);
          box-shadow: var(--shadow-lg), 0 0 0 1px var(--accent-primary);
        }
        .person-card { cursor: pointer; transition: all 0.2s ease; }
        .person-card:hover { filter: brightness(${isDarkTheme() ? '1.15' : '0.95'}); }
        .person-name { 
          font-weight: bold; 
          font-size: 13px; 
          font-family: var(--font-display), 'Georgia', serif; 
        }
        .person-dates { 
          font-size: 10px; 
          font-family: var(--font-body), 'Georgia', serif;
        }
        .marriage-line { stroke-width: 2.5; fill: none; opacity: 0.8; }
        .child-line-legit { fill: none; opacity: 0.8; }
        .child-line-bastard { fill: none; opacity: 0.8; }
        .child-line-adopted { fill: none; opacity: 0.8; }
        .anchor-line { stroke-width: 1; stroke-dasharray: 5,5; opacity: 0.15; }
        .search-highlight { animation: pulse 1.5s infinite; }
        .dev-selection-ring { animation: devSelectionPulse 2s ease-in-out infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes devSelectionPulse {
          0%, 100% { stroke: #00ff88; stroke-width: 3; }
          50% { stroke: #00cc66; stroke-width: 4; }
        }
      `}</style>
    </div>
  );
}

export default FamilyTree;