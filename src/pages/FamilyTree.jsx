import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { useGenealogy } from '../contexts/GenealogyContext';
import Navigation from '../components/Navigation';
import TreeControls from '../components/TreeControls';
import QuickEditPanel from '../components/QuickEditPanel';
import { calculateAllRelationships } from '../utils/RelationshipCalculator';
import { useTheme } from '../components/ThemeContext';
import { getAllThemeColors, getHouseColor } from '../utils/themeColors';
import { getPrimaryEpithet } from '../utils/epithetUtils';
import { getAllDignities, getDignityIcon } from '../services/dignityService';

function FamilyTree() {
  // Use the global theme system
  const { theme, isDarkTheme } = useTheme();
  
  // ==================== SHARED STATE FROM CONTEXT ====================
  // This is the key change: FamilyTree now shares data with ManageData!
  // Any changes in ManageData will automatically update the tree.
  const {
    people,
    houses,
    relationships,
    loading,
    dataVersion  // Used to detect when to redraw
  } = useGenealogy();

  // ==================== LOCAL UI STATE ====================
  const [selectedHouseId, setSelectedHouseId] = useState(null);
  const [showCadetHouses, setShowCadetHouses] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const svgRef = useRef(null);
  const zoomBehaviorRef = useRef(null);

  // BATCH 1: Search functionality
  const [searchResults, setSearchResults] = useState([]);
  
  // BATCH 1: Quick edit panel
  const [selectedPerson, setSelectedPerson] = useState(null);
  
  // BATCH 1: Relationship calculator
  const [showRelationships, setShowRelationships] = useState(false);
  const [referencePerson, setReferencePerson] = useState(null);
  const [relationshipMap, setRelationshipMap] = useState(new Map());
  const showRelationshipsRef = useRef(false);
  
  // Controls panel collapse state
  const [controlsPanelExpanded, setControlsPanelExpanded] = useState(false);
  
  // Vertical spacing control for testing
  const [verticalSpacing, setVerticalSpacing] = useState(50);
  
  // 👑 DIGNITIES: Store dignities for displaying icons on person cards
  const [dignities, setDignities] = useState([]);
  const [dignitiesByPerson, setDignitiesByPerson] = useState(new Map());



  // ==================== HOUSE VIEW CONTROLS ====================
  // Centre On: which person to use as the tree root
  // 'auto' = oldest member of selected house (default)
  // or a specific person ID
  const [centreOnPersonId, setCentreOnPersonId] = useState('auto');

  // Card dimensions
  const CARD_WIDTH = 150;
  const CARD_HEIGHT = 70;
  const SPACING = 35;
  const GROUP_SPACING = 50;
  
  // Anchor and start positions
  const ANCHOR_X = 1500;  // X position for centering tree
  const START_Y = 100;    // Y position for first generation
  
  // Generation spacing - controls vertical distance between generations
  const GENERATION_SPACING = verticalSpacing + CARD_HEIGHT;
  
  // Fragment gap - extra space between disconnected fragments
  // This creates visual breathing room between unconnected family trees
  const FRAGMENT_GAP = 200;

  // Helper function to harmonize house colors with current theme
  const harmonizeColor = (hexColor) => {
    const hex = hexColor.replace('#', '');
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    if (isDarkTheme()) {
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
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // HOUSE SCOPE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  // These functions determine which people to include when viewing a specific house.
  // The goal is to show:
  // 1. All members of the selected house (by houseId)
  // 2. Their spouses (even if from other houses)
  // 3. Immediate children of house members (even if children belong to another house)
  // 4. BUT NOT grandchildren/further descendants unless they're also house members
  // 5. 🪝 Future: Cadet branches when showCadetHouses is true
  //
  // This "one generation buffer" ensures you see who house members married and
  // their children, but don't follow external family lines indefinitely.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all house IDs that should be included in the current view.
   * This includes the selected house and optionally its cadet branches.
   */
  const getHouseIdsInScope = (targetHouseId, allHouses, includeCadets) => {
    const houseIds = new Set([targetHouseId]);
    
    // 🪝 CADET BRANCH EXTENSION POINT
    // When includeCadets is true, find all houses where parentHouseId = targetHouseId
    if (includeCadets) {
      allHouses.forEach(house => {
        if (house.parentHouseId === targetHouseId) {
          houseIds.add(house.id);
          // Note: This doesn't recursively find cadet branches of cadet branches
          // That would be a future enhancement if needed
        }
      });
    }
    
    return houseIds;
  };

  /**
   * Build a set of all person IDs that are connected to the selected house.
   * 
   * TRAVERSAL RULES:
   * - House members: Always included, always traverse their descendants
   * - Non-house-members: Only included if they're a spouse or immediate child of a house member
   * - We DON'T continue traversing through non-house-members (one generation limit)
   * 
   * Example for House Salomon:
   * - Lady Salomon (house member) ✓ - included, traverse her children
   * - Her husband Lord Wilfrey (non-member spouse) ✓ - included
   * - Their child Wenton Wilfrey (non-member) ✓ - included as immediate child
   * - Wenton's children (non-members) ✗ - NOT included (would require traversing through Wenton)
   * - BUT if Wenton married a Salomon, their kids would be included via that Salomon
   */
  const getHouseScopedPeopleIds = (
    targetHouseId,
    allPeople,
    allHouses,
    spouseMap,
    childrenMap,
    parentMap,
    includeCadets
  ) => {
    const scopedIds = new Set();
    const houseIds = getHouseIdsInScope(targetHouseId, allHouses, includeCadets);
    
    // Create a lookup for checking house membership
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    const isHouseMember = (personId) => {
      const person = peopleById.get(personId);
      return person && houseIds.has(person.houseId);
    };
    
    // Step 1: Find all direct members of the house(s) in scope
    const directMembers = allPeople.filter(p => houseIds.has(p.houseId));
    directMembers.forEach(p => scopedIds.add(p.id));
    
    // Step 2: Add spouses of direct members
    directMembers.forEach(p => {
      const spouseId = spouseMap.get(p.id);
      if (spouseId) {
        scopedIds.add(spouseId);
      }
    });
    
    // Step 3: Traverse UP to find ancestors of house members
    // We need ancestors to find the proper root, but we apply the same rule:
    // only continue traversing through house members
    const findAncestors = (personId, visited = new Set()) => {
      if (visited.has(personId)) return;
      visited.add(personId);
      
      const person = peopleById.get(personId);
      if (!person) return;
      
      const parents = parentMap.get(personId) || [];
      parents.forEach(parentId => {
        scopedIds.add(parentId);
        // Also add parent's spouse
        const parentSpouseId = spouseMap.get(parentId);
        if (parentSpouseId) {
          scopedIds.add(parentSpouseId);
        }
        // Only continue traversing UP if this parent is a house member
        // (otherwise we'd pull in the spouse's entire family tree)
        if (isHouseMember(parentId)) {
          findAncestors(parentId, visited);
        }
      });
    };
    
    // Find ancestors of all direct house members
    directMembers.forEach(p => findAncestors(p.id));
    
    // Step 4: Traverse DOWN to find descendants
    // KEY RULE: Only continue traversing through house members!
    // Non-house-members get added (as immediate children) but we don't traverse their children
    const findDescendants = (personId, visited = new Set()) => {
      if (visited.has(personId)) return;
      visited.add(personId);
      
      const person = peopleById.get(personId);
      if (!person) return;
      
      // Only traverse children if THIS person is a house member
      // This is the key change that limits to "one generation of non-members"
      if (!isHouseMember(personId)) {
        return; // Don't traverse children of non-house-members
      }
      
      const children = childrenMap.get(personId) || [];
      children.forEach(childId => {
        scopedIds.add(childId);
        // Also add child's spouse (they're connected to a house member's child)
        const childSpouseId = spouseMap.get(childId);
        if (childSpouseId) {
          scopedIds.add(childSpouseId);
        }
        // Recursively process this child
        // If child is a house member, we'll traverse their children
        // If child is NOT a house member, findDescendants will return early
        findDescendants(childId, visited);
      });
    };
    
    // Find descendants starting from all house members
    // (not all scoped people - we only want to start from house members)
    directMembers.forEach(p => findDescendants(p.id));
    
    // Also traverse from spouses who are house members (married into the house)
    // This handles cases where someone married INTO the house
    Array.from(scopedIds).forEach(id => {
      if (isHouseMember(id)) {
        findDescendants(id);
      }
    });
    
    return scopedIds;
  };

  /**
   * Find the best root person for the selected house.
   * Priority:
   * 1. If centreOnPersonId is set to a specific person, use them
   * 2. Otherwise, find the oldest person in the house scope who has no parents
   * 3. If everyone has parents, use the oldest person in the house scope
   */
  const findRootPersonForHouse = (
    scopedPeopleIds,
    peopleById,
    parentMap,
    centreOn
  ) => {
    // If a specific person is selected, use them (if they're in scope)
    if (centreOn !== 'auto' && scopedPeopleIds.has(centreOn)) {
      return centreOn;
    }
    
    // Get all scoped people as objects
    const scopedPeople = Array.from(scopedPeopleIds)
      .map(id => peopleById.get(id))
      .filter(p => p);
    
    // Find people with no parents (potential roots)
    const rootCandidates = scopedPeople.filter(p => !parentMap.has(p.id));
    
    if (rootCandidates.length > 0) {
      // Sort by birth date, return oldest
      rootCandidates.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
      return rootCandidates[0].id;
    }
    
    // Fallback: everyone has parents, use oldest person in scope
    scopedPeople.sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
    return scopedPeople[0]?.id || null;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAGMENT DETECTION
  // ═══════════════════════════════════════════════════════════════════════════
  // Identifies disconnected sub-trees within a house's members.
  // A "fragment" is a group of people connected by parent/spouse relationships
  // but not connected to the main tree.
  //
  // Example: If you add Lord Aldric Salomon (b. 1050) without connecting him
  // to the existing Salomon tree, he becomes a separate fragment.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect all connected fragments within a set of house members.
   * Returns an array of fragments, each containing:
   * - peopleIds: Set of person IDs in this fragment
   * - rootPerson: The oldest person with no parents (or oldest overall)
   * - memberCount: Number of people in this fragment
   * 
   * Uses Union-Find algorithm for efficient connected component detection.
   */
  const detectFragments = (
    houseMembers,      // Array of people who are direct house members
    spouseMap,         // Map of person -> spouse
    parentMap,         // Map of child -> [parents]
    childrenMap        // Map of parent -> [children]
  ) => {
    if (houseMembers.length === 0) return [];
    
    // Build adjacency: two people are "connected" if they share a parent/child/spouse relationship
    const connections = new Map(); // personId -> Set of connected personIds
    
    houseMembers.forEach(person => {
      if (!connections.has(person.id)) {
        connections.set(person.id, new Set());
      }
      
      // Connect to spouse
      const spouseId = spouseMap.get(person.id);
      if (spouseId) {
        connections.get(person.id).add(spouseId);
        if (!connections.has(spouseId)) connections.set(spouseId, new Set());
        connections.get(spouseId).add(person.id);
      }
      
      // Connect to parents
      const parents = parentMap.get(person.id) || [];
      parents.forEach(parentId => {
        connections.get(person.id).add(parentId);
        if (!connections.has(parentId)) connections.set(parentId, new Set());
        connections.get(parentId).add(person.id);
      });
      
      // Connect to children
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
      
      // BFS to find all connected people
      const fragment = new Set();
      const queue = [person.id];
      
      while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        
        visited.add(currentId);
        fragment.add(currentId);
        
        // Add all connected people to queue
        const connected = connections.get(currentId) || new Set();
        connected.forEach(connectedId => {
          if (!visited.has(connectedId)) {
            queue.push(connectedId);
          }
        });
      }
      
      // Find the root person for this fragment (oldest with no parents, or just oldest)
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
        // Include only house members in the fragment for display
        houseMembers: fragmentPeople
      });
    });
    
    // Sort fragments by root person's birth date (oldest first = main tree)
    fragments.sort((a, b) => parseInt(a.rootPerson.dateOfBirth) - parseInt(b.rootPerson.dateOfBirth));
    
    return fragments;
  };

  /**
   * Get lineage-gap relationships that could connect fragments.
   * These are relationships where person1 (descendant) and person2 (ancestor)
   * are in different fragments.
   */
  const getLineageGapConnections = (fragments, allRelationships, peopleById) => {
    const lineageGaps = allRelationships.filter(r => r.relationshipType === 'lineage-gap');
    const connections = [];
    
    lineageGaps.forEach(gap => {
      const descendant = peopleById.get(gap.person1Id);
      const ancestor = peopleById.get(gap.person2Id);
      if (!descendant || !ancestor) return;
      
      // Find which fragments these people belong to
      let descendantFragment = null;
      let ancestorFragment = null;
      
      fragments.forEach((frag, index) => {
        if (frag.peopleIds.has(gap.person1Id)) descendantFragment = index;
        if (frag.peopleIds.has(gap.person2Id)) ancestorFragment = index;
      });
      
      // Only include if they're in different fragments
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
  };

  /**
   * Get list of notable people in the selected house for the "Centre On" dropdown.
   * Returns people sorted by birth date with the house members first.
   */
  const getHouseNotablePeople = useMemo(() => {
    if (!selectedHouseId || people.length === 0) return [];
    
    const houseIds = getHouseIdsInScope(selectedHouseId, houses, showCadetHouses);
    
    // Get direct house members
    const houseMembers = people
      .filter(p => houseIds.has(p.houseId))
      .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
    
    return houseMembers;
  }, [selectedHouseId, people, houses, showCadetHouses]);

  // ==================== RELATIONSHIP MAP BUILDER ====================
  // This needs to be defined BEFORE fragmentInfo since fragmentInfo uses it.
  // Builds lookup maps for parent/child/spouse relationships from the relationships array.
  const buildRelationshipMaps = () => {
    const peopleById = new Map(people.map(p => [p.id, p]));
    const housesById = new Map(houses.map(h => [h.id, h]));
    const parentMap = new Map();
    const childrenMap = new Map();
    const spouseMap = new Map();

    relationships.forEach(rel => {
      if (rel.relationshipType === 'spouse') {
        if (peopleById.has(rel.person1Id) && peopleById.has(rel.person2Id)) {
          spouseMap.set(rel.person1Id, rel.person2Id);
          spouseMap.set(rel.person2Id, rel.person1Id);
        }
      } else if (rel.relationshipType === 'parent' || rel.relationshipType === 'adopted-parent') {
        const parentId = rel.person1Id;
        const childId = rel.person2Id;
        if (!parentMap.has(childId)) parentMap.set(childId, []);
        parentMap.get(childId).push(parentId);
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId).push(childId);
      }
    });

    return { peopleById, housesById, parentMap, childrenMap, spouseMap };
  };

  /**
   * Detect fragments (disconnected sub-trees) within the selected house.
   * Returns { fragments, lineageGaps, hasMultipleFragments }
   */
  const fragmentInfo = useMemo(() => {
    if (!selectedHouseId || people.length === 0) {
      return { fragments: [], lineageGaps: [], hasMultipleFragments: false };
    }
    
    const { parentMap, childrenMap, spouseMap, peopleById } = buildRelationshipMaps();
    const houseIds = getHouseIdsInScope(selectedHouseId, houses, showCadetHouses);
    
    // Get direct house members only
    const houseMembers = people.filter(p => houseIds.has(p.houseId));
    
    // Detect fragments
    const fragments = detectFragments(houseMembers, spouseMap, parentMap, childrenMap);
    
    // Find lineage-gap connections between fragments
    const lineageGaps = getLineageGapConnections(fragments, relationships, peopleById);
    
    // Log fragment info for debugging
    if (fragments.length > 1) {
      console.log(`🧩 Detected ${fragments.length} fragments in ${houses.find(h => h.id === selectedHouseId)?.houseName}:`);
      fragments.forEach((frag, i) => {
        console.log(`   Fragment ${i + 1}: ${frag.memberCount} members, root: ${frag.rootPerson.firstName} ${frag.rootPerson.lastName} (b. ${frag.rootPerson.dateOfBirth})`);
      });
      if (lineageGaps.length > 0) {
        console.log(`   🔗 ${lineageGaps.length} lineage-gap connection(s) found`);
      }
    }
    
    return {
      fragments,
      lineageGaps,
      hasMultipleFragments: fragments.length > 1
    };
  }, [selectedHouseId, people, houses, relationships, showCadetHouses]);

  // State for fragment panel visibility
  const [showFragmentPanel, setShowFragmentPanel] = useState(true);

  // ==================== FRAGMENT SEPARATOR STYLE ====================
  // Controls how disconnected fragments are visually delineated
  // Options: 'none', 'background', 'separator', 'headers', 'combined'
  const [fragmentSeparatorStyle, setFragmentSeparatorStyle] = useState(() => {
    const saved = localStorage.getItem('lineageweaver-fragment-style');
    return saved || 'separator';
  });

  // Persist fragment style preference
  const handleFragmentStyleChange = (style) => {
    setFragmentSeparatorStyle(style);
    localStorage.setItem('lineageweaver-fragment-style', style);
  };

  // ==================== EFFECTS ====================
  
  // Select first house when houses become available
  useEffect(() => {
    if (houses.length > 0 && !selectedHouseId) {
      setSelectedHouseId(houses[0].id);
    }
  }, [houses, selectedHouseId]);

  // Reset centreOnPersonId when house changes
  useEffect(() => {
    setCentreOnPersonId('auto');
  }, [selectedHouseId]);
  
  // 👑 Load dignities and build person lookup map
  useEffect(() => {
    async function loadDignities() {
      try {
        const allDignities = await getAllDignities();
        setDignities(allDignities);
        
        // Build a map: personId -> array of dignities they hold
        const byPerson = new Map();
        allDignities.forEach(dignity => {
          if (dignity.currentHolderId) {
            if (!byPerson.has(dignity.currentHolderId)) {
              byPerson.set(dignity.currentHolderId, []);
            }
            byPerson.get(dignity.currentHolderId).push(dignity);
          }
        });
        
        // Sort each person's dignities by displayPriority (higher first)
        byPerson.forEach((personDignities, personId) => {
          personDignities.sort((a, b) => (b.displayPriority || 0) - (a.displayPriority || 0));
        });
        
        setDignitiesByPerson(byPerson);
        console.log(`👑 Loaded ${allDignities.length} dignities, ${byPerson.size} people have titles`);
      } catch (error) {
        console.error('Error loading dignities:', error);
      }
    }
    
    loadDignities();
  }, [dataVersion]); // Reload when data changes

  // Redraw tree when data changes
  // Note: dataVersion increments whenever context data changes,
  // which triggers this effect and redraws the tree
  useEffect(() => {
    if (selectedHouseId && people.length > 0) drawTree();
  }, [selectedHouseId, people, houses, relationships, showCadetHouses, theme, searchResults, relationshipMap, verticalSpacing, dataVersion, centreOnPersonId, fragmentSeparatorStyle, dignitiesByPerson]);

  const handleSearchResults = (results) => {
    setSearchResults(results);
  };

  const handlePersonClick = (person) => {
    setSelectedPerson(person);
    
    if (showRelationshipsRef.current) {
      setReferencePerson(person);
      const { parentMap, childrenMap, spouseMap } = buildRelationshipMaps();
      const relationships = calculateAllRelationships(person.id, people, parentMap, childrenMap, spouseMap);
      setRelationshipMap(relationships);
    }
  };

  /**
   * SIMPLIFIED: Detect generations
   * - Gen 0 = ALL people with no parents (sorted by birth date)
   * - Gen 1 = Their children
   * - Gen 2 = Their grandchildren
   * - etc.
   * 
   * NEW: Accepts optional overrideRootId to start from a specific person
   */
  const detectGenerations = (peopleById, parentMap, childrenMap, spouseMap, overrideRootId = null) => {
    let rootPerson;
    
    if (overrideRootId && peopleById.has(overrideRootId)) {
      // Use the specified root person
      rootPerson = peopleById.get(overrideRootId);
      console.log(`Using override root: ${rootPerson.firstName} ${rootPerson.lastName}`);
    } else {
      // Find ALL people with no parents - they are ALL Gen 0
      const gen0People = Array.from(peopleById.values())
        .filter(p => !parentMap.has(p.id))
        .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
      
      if (gen0People.length === 0) {
        console.warn('No root people found (everyone has parents)');
        return [];
      }
      
      console.log('Root candidates (no parents):', gen0People.map(p => `${p.firstName} ${p.lastName} (b.${p.dateOfBirth})`));
      
      // Use ONLY the oldest person as Gen 0
      rootPerson = gen0People[0];
    }
    
    console.log(`Root (Gen 0): ${rootPerson.firstName} ${rootPerson.lastName}`);
    
    const generations = [];
    const processedIds = new Set();
    
    // Gen 0: Just the root person (not all people with no parents)
    generations.push([rootPerson.id]);
    processedIds.add(rootPerson.id);
    
    // Mark spouse as processed (if they have one)
    const rootSpouseId = spouseMap.get(rootPerson.id);
    if (rootSpouseId) {
      processedIds.add(rootSpouseId);
    }
    
    // Build subsequent generations
    let currentGenIndex = 0;
    while (currentGenIndex < generations.length) {
      const currentGen = generations[currentGenIndex];
      const nextGenIds = new Set();
      
      // For each person in current gen, get their children
      currentGen.forEach(personId => {
        const children = childrenMap.get(personId) || [];
        children.forEach(childId => {
          if (!processedIds.has(childId)) {
            nextGenIds.add(childId);
            processedIds.add(childId);
          }
        });
        
        // Also check spouse's children
        const spouseId = spouseMap.get(personId);
        if (spouseId && peopleById.has(spouseId)) {
          const spouseChildren = childrenMap.get(spouseId) || [];
          spouseChildren.forEach(childId => {
            if (!processedIds.has(childId)) {
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
    
    console.log('Generations detected:', generations.map((g, i) => `Gen ${i}: ${g.length} people`));
    return generations;
  };

  const drawPersonCard = (g, person, x, y, housesById, themeColors) => {
    const birthHouse = housesById.get(person.houseId);
    const originalColor = birthHouse ? birthHouse.colorCode : '#666666';
    const harmonizedBg = harmonizeColor(originalColor);
    
    let borderColor = themeColors.statusBorders.legitimate;
    if (person.legitimacyStatus === 'bastard') borderColor = themeColors.statusBorders.bastard;
    if (person.legitimacyStatus === 'adopted') borderColor = themeColors.statusBorders.adopted;
    if (person.legitimacyStatus === 'commoner') borderColor = themeColors.statusBorders.commoner;
    if (person.legitimacyStatus === 'unknown') borderColor = themeColors.statusBorders.unknown;

    const card = g.append('g')
      .attr('class', 'person-card')
      .attr('transform', `translate(${x}, ${y})`)
      .style('cursor', 'pointer')
      .on('click', () => handlePersonClick(person));
    
    card.append('rect')
      .attr('width', CARD_WIDTH)
      .attr('height', CARD_HEIGHT)
      .attr('fill', harmonizedBg)
      .attr('stroke', borderColor)
      .attr('stroke-width', 2.5)
      .attr('rx', 6);
    
    const glowColor = isDarkTheme() ? 'rgba(233, 220, 201, 0.1)' : 'rgba(255, 255, 255, 0.3)';
    card.append('rect')
      .attr('x', 1).attr('y', 1)
      .attr('width', CARD_WIDTH - 2).attr('height', CARD_HEIGHT - 2)
      .attr('fill', 'none').attr('stroke', glowColor).attr('stroke-width', 1).attr('rx', 5);
    
    card.append('text')
      .attr('x', CARD_WIDTH / 2).attr('y', 22)
      .attr('text-anchor', 'middle').attr('class', 'person-name')
      .attr('fill', '#e9dcc9')
      .text(`${person.firstName} ${person.lastName}`);
    
    let currentY = 22;
    
    // ✨ EPITHETS: Show primary epithet below name
    const primaryEpithet = getPrimaryEpithet(person.epithets);
    if (primaryEpithet) {
      currentY += 13;
      card.append('text')
        .attr('x', CARD_WIDTH / 2).attr('y', currentY)
        .attr('text-anchor', 'middle').attr('class', 'person-epithet')
        .attr('fill', '#d4a574')  // Accent color for epithets
        .attr('font-style', 'italic')
        .attr('font-size', '10px')
        .text(primaryEpithet.text);
    }
    
    if (person.maidenName) {
      currentY += 13;
      card.append('text')
        .attr('x', CARD_WIDTH / 2).attr('y', currentY)
        .attr('text-anchor', 'middle').attr('class', 'person-maiden')
        .attr('fill', '#b8a891')
        .text(`(née ${person.maidenName})`);
    }
    currentY += 16;
    const dates = `b. ${person.dateOfBirth}${person.dateOfDeath ? ` - d. ${person.dateOfDeath}` : ''}`;
    card.append('text')
      .attr('x', CARD_WIDTH / 2).attr('y', currentY)
      .attr('text-anchor', 'middle').attr('class', 'person-dates')
      .attr('fill', '#b8a891')
      .text(dates);

    const isHighlighted = searchResults.some(p => p.id === person.id);
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
    
    // 👑 DIGNITY ICON: Show highest-priority dignity icon in top-right corner
    const personDignities = dignitiesByPerson.get(person.id);
    if (personDignities && personDignities.length > 0) {
      // Get the highest-priority dignity (already sorted by displayPriority)
      const topDignity = personDignities[0];
      const icon = getDignityIcon(topDignity);
      
      // Draw icon with subtle background
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
      
      // Add tooltip with title name (SVG title element)
      card.append('title')
        .text(`${topDignity.title}${personDignities.length > 1 ? ` (+${personDignities.length - 1} more)` : ''}`);
    }
    
    return { x, y, width: CARD_WIDTH, height: CARD_HEIGHT, personId: person.id };
  };

  const drawMarriageLine = (g, pos1, pos2, themeColors) => {
    const marriageColor = isDarkTheme() ? '#c08a7a' : '#b87a8a';
    
    // Vertical layout: spouses are side by side, line goes right
    const x1 = pos1.x + pos1.width;
    const y1 = pos1.y + pos1.height / 2;
    const x2 = pos2.x;
    const y2 = pos2.y + pos2.height / 2;
    
    g.append('line').attr('class', 'marriage-line')
      .attr('x1', x1).attr('y1', y1).attr('x2', x2).attr('y2', y2)
      .attr('stroke', marriageColor);
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
      const legitFirstX = legitimateChildren[0].x + CARD_WIDTH / 2;
      const legitLastX = legitimateChildren[legitimateChildren.length - 1].x + CARD_WIDTH / 2;
      const legitCenterX = (legitFirstX + legitLastX) / 2;
      const legitMarriageX = marriageCenter.x + legitOffset;
      const legitY = midY + yOffset;

      g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', legitMarriageX).attr('y1', marriageCenter.y).attr('x2', legitMarriageX).attr('y2', legitY);
      g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', legitMarriageX).attr('y1', legitY).attr('x2', legitCenterX).attr('y2', legitY);
      g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', legitFirstX).attr('y1', legitY).attr('x2', legitLastX).attr('y2', legitY);
      legitimateChildren.forEach(pos => {
        g.append('line').attr('class', 'child-line-legit').attr('stroke', themeColors.lines.legitimate).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', legitY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }

    if (bastardChildren.length > 0) {
      const bastardFirstX = bastardChildren[0].x + CARD_WIDTH / 2;
      const bastardLastX = bastardChildren[bastardChildren.length - 1].x + CARD_WIDTH / 2;
      const bastardCenterX = (bastardFirstX + bastardLastX) / 2;
      const bastardY = midY - 5 + yOffset;
      
      let bastardMarriageX = marriageCenter.x + bastardOffset;
      let bastardStartY = marriageCenter.y;
      
      // CRITICAL: Check if bastards have BOTH parents or just ONE
      // If a bastard has only ONE parent in this couple, line comes from that parent's card
      // If a bastard has BOTH parents (pre-marital), line comes from marriage center
      const firstBastard = peopleById.get(bastardChildren[0].personId);
      if (firstBastard) {
        const bastardParents = parentMap.get(firstBastard.id) || [];
        const hasBothParents = spouseId && bastardParents.includes(parentId) && bastardParents.includes(spouseId);
        
        if (!hasBothParents) {
          // Only ONE parent - line comes from parent's card center (no offset)
          const parentPos = positionMap.get(parentId);
          if (parentPos) {
            bastardMarriageX = parentPos.x + CARD_WIDTH / 2;
            bastardStartY = parentY;
          }
        }
      }

      g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', bastardMarriageX).attr('y1', bastardStartY).attr('x2', bastardMarriageX).attr('y2', bastardY);
      g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', bastardMarriageX).attr('y1', bastardY).attr('x2', bastardCenterX).attr('y2', bastardY);
      g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', bastardFirstX).attr('y1', bastardY).attr('x2', bastardLastX).attr('y2', bastardY);
      bastardChildren.forEach(pos => {
        g.append('line').attr('class', 'child-line-bastard').attr('stroke', themeColors.lines.bastard).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', bastardY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }

    if (adoptedChildren.length > 0) {
      const adoptedFirstX = adoptedChildren[0].x + CARD_WIDTH / 2;
      const adoptedLastX = adoptedChildren[adoptedChildren.length - 1].x + CARD_WIDTH / 2;
      const adoptedCenterX = (adoptedFirstX + adoptedLastX) / 2;
      const adoptedMarriageX = marriageCenter.x + adoptedOffset;
      const adoptedY = midY + 5 + yOffset;

      g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', adoptedMarriageX).attr('y1', marriageCenter.y).attr('x2', adoptedMarriageX).attr('y2', adoptedY);
      g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', adoptedMarriageX).attr('y1', adoptedY).attr('x2', adoptedCenterX).attr('y2', adoptedY);
      g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', adoptedFirstX).attr('y1', adoptedY).attr('x2', adoptedLastX).attr('y2', adoptedY);
      adoptedChildren.forEach(pos => {
        g.append('line').attr('class', 'child-line-adopted').attr('stroke', themeColors.lines.adopted).attr('stroke-width', 2).attr('x1', pos.x + CARD_WIDTH / 2).attr('y1', adoptedY).attr('x2', pos.x + CARD_WIDTH / 2).attr('y2', pos.y);
      });
    }
  };

  const drawTree = () => {
    const themeColors = getAllThemeColors();
    
    // Check if we have a saved transform from before redraw
    let savedTransform = null;
    const existingGroup = d3.select(svgRef.current).select('.zoom-group');
    if (!existingGroup.empty()) {
      const transformStr = existingGroup.attr('transform');
      if (transformStr) {
        savedTransform = d3.zoomTransform(existingGroup.node());
      }
    }

    d3.select(svgRef.current).selectAll('*').remove();
    const { peopleById, housesById, parentMap, childrenMap, spouseMap } = buildRelationshipMaps();
    
    const svg = d3.select(svgRef.current).attr('width', '100%').attr('height', '100%');
    const g = svg.append('g').attr('class', 'zoom-group');

    const zoom = d3.zoom().scaleExtent([0.1, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform); setZoomLevel(event.transform.k); });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;
    
    // NOTE: We'll set the transform AFTER drawing so we can center on content

    // Draw anchor line (vertical line at center X)
    g.append('line').attr('class', 'anchor-line')
      .attr('x1', ANCHOR_X).attr('y1', 0).attr('x2', ANCHOR_X).attr('y2', 5000)
      .attr('stroke', themeColors.lines.anchor);

    if (people.length === 0) {
      g.append('text').attr('x', ANCHOR_X).attr('y', 200).attr('text-anchor', 'middle').attr('font-size', '20px').attr('fill', '#e9dcc9').text('No data available.');
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // HOUSE SCOPE FILTERING
    // ════════════════════════════════════════════════════════════════════════
    // Filter people to only those connected to the selected house.
    // This happens BEFORE detectGenerations so the existing algorithm
    // works on the filtered dataset unchanged.
    // ════════════════════════════════════════════════════════════════════════
    
    let scopedPeopleById = peopleById;
    let overrideRootId = null;
    
    if (selectedHouseId) {
      // Get the set of person IDs in scope for this house
      const scopedIds = getHouseScopedPeopleIds(
        selectedHouseId,
        people,
        houses,
        spouseMap,
        childrenMap,
        parentMap,
        showCadetHouses
      );
      
      // Create a filtered Map of only scoped people
      scopedPeopleById = new Map();
      scopedIds.forEach(id => {
        if (peopleById.has(id)) {
          scopedPeopleById.set(id, peopleById.get(id));
        }
      });
      
      // Find the root person for this house view
      overrideRootId = findRootPersonForHouse(
        scopedIds,
        peopleById,
        parentMap,
        centreOnPersonId
      );
      
      console.log(`🏠 House filter: ${houses.find(h => h.id === selectedHouseId)?.houseName}`);
      console.log(`   Scoped people: ${scopedPeopleById.size} of ${peopleById.size}`);
      console.log(`   Root person ID: ${overrideRootId}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // MULTI-FRAGMENT DRAWING
    // ════════════════════════════════════════════════════════════════════════
    // If there are multiple disconnected fragments, we draw each one sequentially
    // with FRAGMENT_GAP (200px) spacing between them. This ensures all fragments
    // are visible and properly separated.
    // ════════════════════════════════════════════════════════════════════════
    
    const positionMap = new Map();
    const marriageCenters = new Map();
    const marriageLinesToDraw = [];
    
    // Determine which fragments to draw
    const fragmentsToDraw = fragmentInfo.hasMultipleFragments 
      ? fragmentInfo.fragments 
      : [{ rootPerson: scopedPeopleById.get(overrideRootId), peopleIds: new Set(scopedPeopleById.keys()) }];
    
    if (fragmentsToDraw.length === 0 || !fragmentsToDraw[0].rootPerson) {
      g.append('text').attr('x', ANCHOR_X).attr('y', 200).attr('text-anchor', 'middle').attr('font-size', '20px').attr('fill', '#e9dcc9').text('No root couple found.');
      return;
    }
    
    // Positioning variables for vertical layout
    let currentGenPos = START_Y;  // Position along generation axis (Y)
    const anchorSibPos = ANCHOR_X;  // Anchor along sibling axis (X)
    
    // Helper to convert layout positions to X,Y (vertical layout)
    const layoutToXY = (sibPos, genPos) => {
      return { x: sibPos, y: genPos };
    };
    
    // Get the "sibling size" (width in vertical layout)
    const siblingSize = CARD_WIDTH;
    const genSize = CARD_HEIGHT;
    const genSpacing = verticalSpacing;
    
    // ════════════════════════════════════════════════════════════════════════
    // FRAGMENT LOOP: Draw each disconnected fragment sequentially
    // ════════════════════════════════════════════════════════════════════════
    // Each fragment gets its own call to detectGenerations() and is drawn
    // with FRAGMENT_GAP (200px) spacing between fragments.
    // ════════════════════════════════════════════════════════════════════════
    
    fragmentsToDraw.forEach((fragment, fragmentIndex) => {
      // Add FRAGMENT_GAP before drawing subsequent fragments
      if (fragmentIndex > 0) {
        currentGenPos += FRAGMENT_GAP;
        console.log(`📏 Added ${FRAGMENT_GAP}px gap before fragment ${fragmentIndex + 1}`);
      }
      
      // Build a scoped peopleById for this fragment
      // For multi-fragment mode, we need to include spouses who may not be in the fragment
      const fragmentPeopleById = new Map();
      fragment.peopleIds.forEach(id => {
        if (scopedPeopleById.has(id)) {
          fragmentPeopleById.set(id, scopedPeopleById.get(id));
        }
      });
      
      // Also include spouses of fragment members (they may be from other houses)
      fragment.peopleIds.forEach(id => {
        const spouseId = spouseMap.get(id);
        if (spouseId && scopedPeopleById.has(spouseId)) {
          fragmentPeopleById.set(spouseId, scopedPeopleById.get(spouseId));
        }
      });
      
      // Detect generations for THIS fragment starting from its root person
      const fragmentRootId = fragment.rootPerson?.id;
      const generations = detectGenerations(fragmentPeopleById, parentMap, childrenMap, spouseMap, fragmentRootId);
      
      if (generations.length === 0) {
        console.warn(`Fragment ${fragmentIndex + 1} has no generations`);
        return;
      }
      
      console.log(`🌳 Drawing fragment ${fragmentIndex + 1}/${fragmentsToDraw.length}: ${fragment.rootPerson?.firstName} ${fragment.rootPerson?.lastName} (${generations.length} generations)`);
    
    generations.forEach((genIds, genIndex) => {
      console.log(`Drawing generation ${genIndex} with ${genIds.length} people`);
      
      // Special handling for Gen 0 (single root person + spouse if exists)
      if (genIndex === 0) {
        const rootPerson = fragmentPeopleById.get(genIds[0]);
        if (!rootPerson) {
          console.error('Root person not found');
          return;
        }
        
        const rootSpouseId = spouseMap.get(rootPerson.id);
        const rootSpouse = rootSpouseId ? fragmentPeopleById.get(rootSpouseId) : null;
        
        // Calculate width along sibling axis (person + spouse if exists)
        const gen0Cards = rootSpouse ? 2 : 1;
        const gen0SibWidth = gen0Cards * siblingSize + (gen0Cards - 1) * SPACING;
        let gen0SibPos = anchorSibPos - (gen0SibWidth / 2);
        
        // Draw root person
        const coords = layoutToXY(gen0SibPos, currentGenPos);
        const rootPos = drawPersonCard(g, rootPerson, coords.x, coords.y, housesById, themeColors);
        positionMap.set(rootPerson.id, rootPos);
        gen0SibPos += siblingSize + SPACING;
        
        // Draw spouse if exists
        if (rootSpouse) {
          const spouseCoords = layoutToXY(gen0SibPos, currentGenPos);
          const spousePos = drawPersonCard(g, rootSpouse, spouseCoords.x, spouseCoords.y, housesById, themeColors);
          positionMap.set(rootSpouse.id, spousePos);
          
          // Store marriage center (vertical layout: spouses side by side)
          const mc = {
            x: (rootPos.x + rootPos.width + spousePos.x) / 2,
            y: (rootPos.y + rootPos.height/2 + spousePos.y + spousePos.height/2) / 2
          };
          marriageCenters.set([rootPerson.id, rootSpouse.id].sort().join('-'), mc);
          marriageLinesToDraw.push([rootPos, spousePos]);
        }
        
        currentGenPos += genSize + genSpacing;
        return; // Skip to next generation
      }
      
      // For all other generations, build groups by parent
      const prevGenIds = generations[genIndex - 1];
      const groups = [];
      const processedChildren = new Set();
      
      // Get ALL people from previous generation including spouses
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
        
        // Add spouse's children
        if (spouseId) {
          const spouseChildren = childrenMap.get(spouseId) || [];
          spouseChildren.forEach(c => childSet.add(c));
        }
        
        // Filter to only children in THIS generation who haven't been processed
        const genChildren = Array.from(childSet)
          .filter(id => genIds.includes(id) && !processedChildren.has(id))
          .map(id => fragmentPeopleById.get(id))
          .filter(p => p)
          .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
        
        if (genChildren.length === 0) return;
        
        // Mark as processed
        genChildren.forEach(child => processedChildren.add(child.id));
        
        const groupKey = spouseId ? [parentId, spouseId].sort().join('-') : parentId.toString();
        
        // Skip if this couple already has a group
        if (groups.find(g => g.key === groupKey)) return;
        
        groups.push({
          key: groupKey,
          parentId: parentId,
          spouseId: spouseId,
          children: genChildren
        });
      });
      
      // ════════════════════════════════════════════════════════════════════════
      // PRIMOGENITURE ORDERING: Sort groups by inherited ancestral position
      // ════════════════════════════════════════════════════════════════════════
      // The key insight: A person's position in the tree is determined by their
      // ANCESTRY, not their individual birth date. Wenton's entire line (children,
      // grandchildren, etc.) comes before Steffan's entire line because Wenton
      // is the elder sibling - regardless of when individual descendants were born.
      //
      // We build an "ancestral order key" for each parent by tracing back to find
      // their position within each generation of ancestors.
      // ════════════════════════════════════════════════════════════════════════
      
      // ════════════════════════════════════════════════════════════════════════
      // HELPER: Check if a person can be traced back to the tree root
      // This determines if they're a "blood relative" vs "married in"
      // 
      // MEMOIZED: Results are cached so we only calculate once per person,
      // making this performant even with 10+ generations and hundreds of people.
      // ════════════════════════════════════════════════════════════════════════
      const traceableCache = new Map();
      
      const canTraceToRoot = (personId, visited = new Set()) => {
        // Return cached result if we've already calculated this person
        if (traceableCache.has(personId)) return traceableCache.get(personId);
        
        if (visited.has(personId)) return false; // Prevent infinite loops
        visited.add(personId);
        
        const person = fragmentPeopleById.get(personId);
        if (!person) {
          traceableCache.set(personId, false);
          return false;
        }
        
        // Check if this person is the root (first person in Gen 0)
        const rootPersonId = generations[0]?.[0];
        if (personId === rootPersonId) {
          traceableCache.set(personId, true);
          return true;
        }
        
        // Check if spouse of root
        const rootSpouseId = spouseMap.get(rootPersonId);
        if (personId === rootSpouseId) {
          traceableCache.set(personId, true);
          return true;
        }
        
        // Try to trace through parents
        const parents = parentMap.get(personId);
        if (!parents || parents.length === 0) {
          traceableCache.set(personId, false);
          return false;
        }
        
        // If ANY parent can trace to root, this person can too
        const result = parents.some(pid => canTraceToRoot(pid, new Set(visited)));
        traceableCache.set(personId, result);
        return result;
      };
      
      const getAncestralOrderKey = (personId) => {
        // Build a chain of birth order positions from root to this person
        // e.g., [0, 1, 0] means: root's 1st child → their 2nd child → their 1st child
        const orderChain = [];
        let currentId = personId;
        
        while (currentId) {
          const person = scopedPeopleById.get(currentId);
          if (!person) break;
          
          // Find this person's parents
          const parents = parentMap.get(currentId);
          if (!parents || parents.length === 0) {
            // This is a root person - they get position 0
            orderChain.unshift(0);
            break;
          }
          
          // ════════════════════════════════════════════════════════════════════
          // CRITICAL FIX: Pick the parent who can trace back to the tree root
          // This ensures we follow the BLOODLINE, not spouses who married in
          // ════════════════════════════════════════════════════════════════════
          let parentId = parents[0]; // Default to first
          if (parents.length > 1) {
            // Find the parent who is a blood relative (can trace to root)
            const bloodParent = parents.find(pid => canTraceToRoot(pid));
            if (bloodParent) {
              parentId = bloodParent;
            }
          }
          
          const parent = scopedPeopleById.get(parentId);
          if (!parent) break;
          
          // Get all siblings (children of the same parent)
          const siblingIds = childrenMap.get(parentId) || [];
          const siblings = siblingIds
            .map(id => scopedPeopleById.get(id))
            .filter(p => p)
            .sort((a, b) => parseInt(a.dateOfBirth) - parseInt(b.dateOfBirth));
          
          // Find this person's position among siblings (birth order)
          const birthPosition = siblings.findIndex(s => s.id === currentId);
          orderChain.unshift(birthPosition >= 0 ? birthPosition : 999);
          
          // Move up to parent
          currentId = parentId;
        }
        
        return orderChain;
      };
      
      // Compare two ancestral order keys
      // [0, 1] < [0, 2] (same grandparent, but 2nd vs 3rd child)
      // [0] < [1] (1st vs 2nd child of root)
      // [0, 0] < [1, 0] (grandchild of 1st child vs grandchild of 2nd child)
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
      
      // Calculate generation width along sibling axis
      let totalCards = 0;
      groups.forEach(group => {
        // CRITICAL FIX: Count children in BIRTH ORDER, not by legitimacy type
        totalCards += group.children.length;
        
        group.children.forEach(child => {
          const childSpouseId = spouseMap.get(child.id);
          if (childSpouseId && scopedPeopleById.has(childSpouseId)) {
            totalCards++;
          }
        });
      });
      
      // Calculate sibling axis width and starting position
      const genSibWidth = totalCards * siblingSize + (totalCards - 1) * SPACING + (groups.length - 1) * GROUP_SPACING;
      let currentSibPos = anchorSibPos - (genSibWidth / 2);
      
      // Draw each group
      groups.forEach((group, groupIdx) => {
        const groupPositions = [];
        
        // CRITICAL FIX: Draw children in BIRTH ORDER (already sorted)
        group.children.forEach(child => {
          const coords = layoutToXY(currentSibPos, currentGenPos);
          const childPos = drawPersonCard(g, child, coords.x, coords.y, housesById, themeColors);
          positionMap.set(child.id, childPos);
          groupPositions.push(childPos);
          currentSibPos += siblingSize + SPACING;
          
          // Draw spouse ALWAYS (not just if in same generation)
          const childSpouseId = spouseMap.get(child.id);
          if (childSpouseId && fragmentPeopleById.has(childSpouseId)) {
            const spouse = fragmentPeopleById.get(childSpouseId);
            const spouseCoords = layoutToXY(currentSibPos, currentGenPos);
            const spousePos = drawPersonCard(g, spouse, spouseCoords.x, spouseCoords.y, housesById, themeColors);
            positionMap.set(childSpouseId, spousePos);
            
            // Marriage center (vertical layout: spouses side by side)
            const mc = {
              x: (childPos.x + childPos.width + spousePos.x) / 2,
              y: (childPos.y + childPos.height/2 + spousePos.y + spousePos.height/2) / 2
            };
            marriageCenters.set([child.id, childSpouseId].sort().join('-'), mc);
            marriageLinesToDraw.push([childPos, spousePos]);
            
            currentSibPos += siblingSize + SPACING;
          }
        });
        
        // Draw child lines
          const mcKey = group.spouseId ? [group.parentId, group.spouseId].sort().join('-') : group.parentId.toString();
          const parentPos = positionMap.get(group.parentId);
          
          // Skip if parent position not found (shouldn't happen but safety check)
          if (!parentPos) {
            console.warn(`Parent position not found for parentId: ${group.parentId}`);
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
          
          // Preserve Lochlann special case
          const isLochlann = group.parentId === 18;
          const yOffset = isLochlann ? -5 : 0;
          
          // Draw child lines using the classic triple-offset system
          drawChildLines(g, parentMC, groupPositions, prevGenY + CARD_HEIGHT, currentGenPos, fragmentPeopleById, parentMap, positionMap, themeColors, yOffset, group.parentId, group.spouseId);
        
        if (groupIdx < groups.length - 1) {
          currentSibPos += GROUP_SPACING;
        }
      });
      
      currentGenPos += genSize + genSpacing;
    });
    
    }); // End of fragment loop
    
    // Draw all marriage lines
    marriageLinesToDraw.forEach(([pos1, pos2]) => drawMarriageLine(g, pos1, pos2, themeColors));

    // ════════════════════════════════════════════════════════════════════════
    // FRAGMENT VISUALIZATION
    // ════════════════════════════════════════════════════════════════════════
    // Draw visual separators between disconnected fragments based on user preference.
    // This runs AFTER all cards are drawn so we can calculate bounding boxes.
    // ════════════════════════════════════════════════════════════════════════
    
    if (fragmentInfo.hasMultipleFragments && fragmentSeparatorStyle !== 'none') {
      // Build a lookup: personId -> fragmentIndex
      const personToFragment = new Map();
      fragmentInfo.fragments.forEach((frag, index) => {
        frag.peopleIds.forEach(pid => personToFragment.set(pid, index));
        // Also include spouses who might not be house members
        frag.houseMembers.forEach(member => {
          const spouseId = spouseMap.get(member.id);
          if (spouseId && !personToFragment.has(spouseId)) {
            personToFragment.set(spouseId, index);
          }
        });
      });
      
      // Calculate bounding box for each fragment
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
      
      // Sort fragments by their vertical position (top to bottom)
      fragmentBounds.sort((a, b) => a.minY - b.minY);
      
      // Fragment colors - subtle, theme-aware
      const fragmentColors = isDarkTheme() 
        ? ['rgba(139, 90, 43, 0.08)', 'rgba(70, 90, 110, 0.08)', 'rgba(90, 70, 90, 0.08)', 'rgba(60, 90, 60, 0.08)']
        : ['rgba(210, 180, 140, 0.12)', 'rgba(180, 200, 220, 0.12)', 'rgba(220, 200, 220, 0.12)', 'rgba(200, 220, 200, 0.12)'];
      
      const separatorColor = isDarkTheme() ? 'rgba(184, 168, 145, 0.4)' : 'rgba(139, 90, 43, 0.3)';
      const headerBgColor = isDarkTheme() ? 'rgba(45, 35, 28, 0.9)' : 'rgba(250, 245, 235, 0.9)';
      const headerTextColor = isDarkTheme() ? '#e9dcc9' : '#5c4a3d';
      
      // Create a group for fragment decorations (behind cards)
      const fragmentGroup = g.insert('g', '.person-card').attr('class', 'fragment-decorations');
      
      // Draw based on selected style
      fragmentBounds.forEach((bounds, i) => {
        const fragment = fragmentInfo.fragments[bounds.index];
        const colorIndex = bounds.index % fragmentColors.length;
        
        // BACKGROUND SHADING
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
      
      // SEPARATOR LINES between fragments
      if (fragmentSeparatorStyle === 'separator' || fragmentSeparatorStyle === 'combined') {
        for (let i = 0; i < fragmentBounds.length - 1; i++) {
          const upperBounds = fragmentBounds[i];
          const lowerBounds = fragmentBounds[i + 1];
          
          // Calculate the gap between fragments
          const gapY = (upperBounds.maxY + lowerBounds.minY) / 2;
          const lineMinX = Math.min(upperBounds.minX, lowerBounds.minX) - 50;
          const lineMaxX = Math.max(upperBounds.maxX, lowerBounds.maxX) + 50;
          
          // Calculate time gap for label
          const upperFragment = fragmentInfo.fragments[upperBounds.index];
          const lowerFragment = fragmentInfo.fragments[lowerBounds.index];
          const latestUpperBirth = Math.max(...upperFragment.houseMembers.map(p => parseInt(p.dateOfBirth) || 0));
          const earliestLowerBirth = Math.min(...lowerFragment.houseMembers.map(p => parseInt(p.dateOfBirth) || 9999));
          const yearGap = earliestLowerBirth - latestUpperBirth;
          
          // Draw dashed separator line
          g.append('line')
            .attr('class', 'fragment-separator')
            .attr('x1', lineMinX)
            .attr('y1', gapY)
            .attr('x2', lineMaxX)
            .attr('y2', gapY)
            .attr('stroke', separatorColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,6');
          
          // Decorative elements on the line
          const centerX = (lineMinX + lineMaxX) / 2;
          
          // Center label background
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
      
      console.log('🎨 Fragment visualization drawn:', fragmentSeparatorStyle);
    }
    
    // ==================== CENTER VIEW ON CONTENT ====================
    // Calculate bounding box of all drawn cards to center the view
    if (positionMap.size > 0) {
      const positions = Array.from(positionMap.values());
      
      // Find bounding box of all cards
      const minX = Math.min(...positions.map(p => p.x));
      const maxX = Math.max(...positions.map(p => p.x + p.width));
      const minY = Math.min(...positions.map(p => p.y));
      const maxY = Math.max(...positions.map(p => p.y + p.height));
      
      // Calculate center of content
      const contentCenterX = (minX + maxX) / 2;
      const contentCenterY = (minY + maxY) / 2;
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      
      // Get viewport dimensions
      const svgElement = svgRef.current;
      const viewportWidth = svgElement?.clientWidth || window.innerWidth;
      const viewportHeight = svgElement?.clientHeight || window.innerHeight;
      
      if (savedTransform) {
        // If we have a saved transform (from redraw), use it
        svg.call(zoom.transform, savedTransform);
      } else {
        // Calculate ideal scale to fit content with some padding
        const padding = 100;
        const scaleX = (viewportWidth - padding * 2) / contentWidth;
        const scaleY = (viewportHeight - padding * 2) / contentHeight;
        const idealScale = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 1x
        const finalScale = Math.max(idealScale, 0.3); // Don't zoom out too far
        
        // Calculate translation to center content in viewport
        const translateX = (viewportWidth / 2) - (contentCenterX * finalScale);
        const translateY = (viewportHeight / 2) - (contentCenterY * finalScale);
        
        // Apply the calculated transform
        const initialTransform = d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(finalScale);
        
        svg.call(zoom.transform, initialTransform);
        setZoomLevel(finalScale);
        
        console.log('🎯 Tree centered:', {
          contentCenter: { x: contentCenterX, y: contentCenterY },
          contentSize: { width: contentWidth, height: contentHeight },
          viewport: { width: viewportWidth, height: viewportHeight },
          scale: finalScale
        });
      }
    } else {
      // Fallback if no positions (empty tree)
      const fallbackTransform = savedTransform || d3.zoomIdentity.translate(200, 100).scale(0.8);
      svg.call(zoom.transform, fallbackTransform);
    }
  };

  // Handle house change - clear saved transform to re-center on new house
  const handleHouseChange = (newHouseId) => {
    // Clear the saved transform by removing it from the SVG
    if (svgRef.current) {
      const svg = d3.select(svgRef.current);
      const g = svg.select('.zoom-group');
      if (!g.empty()) {
        // Reset to trigger re-centering
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

      <div className="fixed top-20 right-6 z-10">
        <div
          className="rounded-lg shadow-lg transition-all duration-300 ease-in-out overflow-hidden"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderWidth: '1px',
            borderColor: 'var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            maxHeight: controlsPanelExpanded ? '600px' : '0',
            opacity: controlsPanelExpanded ? '1' : '0',
            padding: controlsPanelExpanded ? '1rem' : '0 1rem'
          }}
        >
          {/* View House Dropdown */}
          <label className="block mb-2 font-medium" style={{ color: 'var(--text-primary)' }}>View House:</label>
          <select 
            value={selectedHouseId || ''} 
            onChange={(e) => handleHouseChange(Number(e.target.value))}
            className="w-48 p-2 rounded transition"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              borderWidth: '1px',
              borderColor: 'var(--border-primary)',
              borderRadius: 'var(--radius-md)'
            }}
          >
            {houses.map(house => (
              <option key={house.id} value={house.id}>
                {house.houseName}
                {house.houseType === 'cadet' ? ' (Cadet)' : ''}
              </option>
            ))}
          </select>

          {/* Centre On Dropdown */}
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="block mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Centre On:</label>
            <select 
              value={centreOnPersonId} 
              onChange={(e) => setCentreOnPersonId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              className="w-48 p-2 rounded transition"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderWidth: '1px',
                borderColor: 'var(--border-primary)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <option value="auto">Oldest Member</option>
              {getHouseNotablePeople.map(person => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName} (b. {person.dateOfBirth})
                </option>
              ))}
            </select>
          </div>

          {/* 🪝 Cadet Houses Toggle - Extension Point */}
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="flex items-center cursor-pointer transition-opacity hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={showCadetHouses}
                onChange={(e) => setShowCadetHouses(e.target.checked)}
                className="mr-2 w-4 h-4"
              />
              <span className="text-sm">Include Cadet Branches</span>
            </label>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Show members of cadet houses descended from this house
            </p>
          </div>

          {/* Generation Spacing */}
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="block mb-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Generation Spacing:</label>
            <select 
              value={verticalSpacing} 
              onChange={(e) => setVerticalSpacing(Number(e.target.value))}
              className="w-48 p-2 rounded transition"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderWidth: '1px',
                borderColor: 'var(--border-primary)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <option value={100}>100px (Spacious)</option>
              <option value={80}>80px</option>
              <option value={60}>60px</option>
              <option value={50}>50px (Default)</option>
              <option value={40}>40px</option>
              <option value={30}>30px (Compact)</option>
            </select>
          </div>

          {/* Show Relationships Toggle */}
          <div className="mt-4 pt-4" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="flex items-center cursor-pointer transition-opacity hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={showRelationships}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowRelationships(checked);
                  showRelationshipsRef.current = checked;
                  if (!checked) {
                    setReferencePerson(null);
                    setRelationshipMap(new Map());
                  }
                }}
                className="mr-2 w-4 h-4"
              />
              <span className="text-sm">Show Relationships</span>
            </label>
            {showRelationships && referencePerson && (
              <div className="mt-2 text-xs p-2 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
                Reference: {referencePerson.firstName} {referencePerson.lastName}
              </div>
            )}
          </div>
        </div>
      </div>

      <TreeControls 
        svgRef={svgRef} 
        zoomBehaviorRef={zoomBehaviorRef} 
        showCadetHouses={showCadetHouses}
        onToggleCadetHouses={(checked) => setShowCadetHouses(checked)} 
        zoomLevel={zoomLevel}
        onZoomChange={(level) => setZoomLevel(level)} 
        isDarkTheme={isDarkTheme()}
      />

      {/* ════════════════════════════════════════════════════════════════════════
          FRAGMENT PANEL
          Shows when there are disconnected sub-trees in the current house view.
          Allows users to see which fragments exist and navigate between them.
          ════════════════════════════════════════════════════════════════════════ */}
      {fragmentInfo.hasMultipleFragments && showFragmentPanel && (
        <div 
          className="fixed bottom-6 left-6 z-10 max-w-sm"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderWidth: '2px',
            borderColor: 'var(--accent-primary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '1rem'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧩</span>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                Disconnected Fragments
              </h3>
            </div>
            <button
              onClick={() => setShowFragmentPanel(false)}
              className="p-1 rounded hover:opacity-70 transition"
              style={{ color: 'var(--text-secondary)' }}
              title="Hide panel"
            >
              ✕
            </button>
          </div>
          
          {/* Description */}
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            This house has {fragmentInfo.fragments.length} separate family trees that aren't connected.
            Use "Lineage Gap" relationships to link distant ancestors.
          </p>
          
          {/* Fragment List */}
          <div className="space-y-2">
            {fragmentInfo.fragments.map((fragment, index) => (
              <div 
                key={index}
                className="p-2 rounded cursor-pointer transition hover:opacity-80"
                style={{
                  backgroundColor: index === 0 ? 'var(--accent-primary-transparent)' : 'var(--bg-tertiary)',
                  borderWidth: '1px',
                  borderColor: index === 0 ? 'var(--accent-primary)' : 'var(--border-primary)'
                }}
                onClick={() => setCentreOnPersonId(fragment.rootPerson.id)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span 
                      className="text-xs font-medium px-1.5 py-0.5 rounded mr-2"
                      style={{
                        backgroundColor: index === 0 ? 'var(--accent-primary)' : 'var(--bg-primary)',
                        color: index === 0 ? 'white' : 'var(--text-secondary)'
                      }}
                    >
                      {index === 0 ? 'Main' : `#${index + 1}`}
                    </span>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {fragment.rootPerson.firstName} {fragment.rootPerson.lastName}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {fragment.memberCount} {fragment.memberCount === 1 ? 'person' : 'people'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  b. {fragment.rootPerson.dateOfBirth}
                  {fragment.rootPerson.dateOfDeath && ` - d. ${fragment.rootPerson.dateOfDeath}`}
                </div>
              </div>
            ))}
          </div>
          
          {/* Lineage Gap Connections */}
          {fragmentInfo.lineageGaps.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span>🔗</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  Lineage Gap Connections
                </span>
              </div>
              {fragmentInfo.lineageGaps.map((gap, index) => (
                <div 
                  key={index}
                  className="text-xs p-2 rounded mb-1"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>
                    {gap.descendant.firstName} {gap.descendant.lastName}
                  </span>
                  {' → '}
                  <span style={{ color: 'var(--text-primary)' }}>
                    {gap.ancestor.firstName} {gap.ancestor.lastName}
                  </span>
                  {gap.estimatedGenerations && (
                    <span className="ml-1">(~{gap.estimatedGenerations} gen)</span>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Separator Style Selector */}
          <div className="mt-3 pt-3" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)' }}>
            <label className="block mb-2 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Visual Style:
            </label>
            <select
              value={fragmentSeparatorStyle}
              onChange={(e) => handleFragmentStyleChange(e.target.value)}
              className="w-full p-1.5 text-xs rounded transition"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderWidth: '1px',
                borderColor: 'var(--border-primary)',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <option value="none">None</option>
              <option value="separator">Separator Lines</option>
              <option value="background">Background Shading</option>
              <option value="combined">Lines + Shading</option>
            </select>
          </div>
          
          {/* Help text */}
          <div className="mt-3 pt-3 text-xs" style={{ borderTopWidth: '1px', borderColor: 'var(--border-primary)', color: 'var(--text-secondary)' }}>
            <strong>Tip:</strong> Click a fragment to centre the tree on it. 
            Go to Manage Data → Relationships to create Lineage Gap connections.
          </div>
        </div>
      )}
      
      {/* Show/hide fragment panel button when fragments exist but panel is hidden */}
      {fragmentInfo.hasMultipleFragments && !showFragmentPanel && (
        <button
          onClick={() => setShowFragmentPanel(true)}
          className="fixed bottom-6 left-6 z-10 flex items-center gap-2 px-3 py-2 rounded-lg transition hover:opacity-80"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'white',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <span>🧩</span>
          <span className="text-sm font-medium">
            {fragmentInfo.fragments.length} Fragments
          </span>
        </button>
      )}

      <div className="relative w-full h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <svg ref={svgRef} className="tree-svg"></svg>
      </div>

      {selectedPerson && (
        <QuickEditPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onPersonSelect={(newPerson) => {
            // Navigate to the clicked related person
            setSelectedPerson(newPerson);
            // Also update relationship calculator if active
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
        .person-card { cursor: pointer; transition: all 0.2s ease; }
        .person-card:hover { filter: brightness(${isDarkTheme() ? '1.15' : '0.95'}); }
        .person-name { 
          font-weight: bold; 
          font-size: 13px; 
          font-family: var(--font-display), 'Georgia', serif; 
          text-shadow: 0 1px 2px rgba(0, 0, 0, ${isDarkTheme() ? '0.3' : '0.1'}); 
        }
        .person-dates { 
          font-size: 10px; 
          font-family: var(--font-body), 'Georgia', serif;
          text-shadow: 0 1px 1px rgba(0, 0, 0, ${isDarkTheme() ? '0.2' : '0.1'}); 
        }
        .person-maiden { 
          font-size: 10px; 
          font-style: italic; 
          font-family: var(--font-body), 'Georgia', serif;
          text-shadow: 0 1px 1px rgba(0, 0, 0, ${isDarkTheme() ? '0.2' : '0.1'}); 
        }
        .person-epithet {
          font-size: 10px;
          font-style: italic;
          font-family: var(--font-body), 'Georgia', serif;
          text-shadow: 0 1px 1px rgba(0, 0, 0, ${isDarkTheme() ? '0.2' : '0.1'});
        }
        .dignity-icon {
          filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3));
        }
        .marriage-line { stroke-width: 2.5; fill: none; opacity: 0.8; }
        .child-line-legit { fill: none; opacity: 0.8; }
        .child-line-bastard { fill: none; opacity: 0.8; }
        .child-line-adopted { fill: none; opacity: 0.8; }
        .anchor-line { stroke-width: 1; stroke-dasharray: 5,5; opacity: 0.15; }
        .search-highlight {
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default FamilyTree;
