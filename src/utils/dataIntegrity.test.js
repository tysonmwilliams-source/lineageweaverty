/**
 * dataIntegrity Tests
 *
 * Tests for data validation and integrity utilities including:
 * - Circular ancestry detection
 * - Parent-child relationship validation
 * - Orphaned record detection
 * - Bidirectional relationship validation
 * - Full integrity checks
 */

import { describe, it, expect } from 'vitest';
import {
  detectCircularAncestry,
  validateParentChildRelationship,
  findOrphanedRecords,
  validateBidirectionalRelationships,
  runIntegrityCheck
} from './dataIntegrity';

describe('dataIntegrity', () => {
  describe('detectCircularAncestry', () => {
    it('should detect direct self-reference', () => {
      const relationships = [];
      const result = detectCircularAncestry(1, 1, relationships);

      expect(result.isCircular).toBe(true);
      expect(result.path).toContain(1);
    });

    it('should detect simple circular reference (A -> B -> A)', () => {
      // Person 2 is parent of Person 1
      const relationships = [
        { id: 1, person1Id: 2, person2Id: 1, relationshipType: 'parent' }
      ];

      // Now trying to make Person 1 a parent of Person 2 (circular!)
      const result = detectCircularAncestry(2, 1, relationships);

      expect(result.isCircular).toBe(true);
    });

    it('should detect multi-generation circular reference', () => {
      // Grandparent (1) -> Parent (2) -> Child (3)
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' },
        { id: 2, person1Id: 2, person2Id: 3, relationshipType: 'parent' }
      ];

      // Trying to make Child (3) a parent of Grandparent (1) = circular!
      const result = detectCircularAncestry(1, 3, relationships);

      expect(result.isCircular).toBe(true);
      expect(result.path).toBeDefined();
    });

    it('should allow valid non-circular relationships', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
      ];

      // Person 3 can be parent of Person 2 (no circular reference)
      const result = detectCircularAncestry(2, 3, relationships);

      expect(result.isCircular).toBe(false);
    });

    it('should handle empty relationships array', () => {
      const result = detectCircularAncestry(1, 2, []);

      expect(result.isCircular).toBe(false);
    });

    it('should ignore non-parent-child relationships', () => {
      // Marriage relationship should not affect ancestry check
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' }
      ];

      const result = detectCircularAncestry(1, 2, relationships);

      expect(result.isCircular).toBe(false);
    });

    it('should detect circular reference in complex family tree', () => {
      // Complex tree: 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 5, 4 -> 6
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' },
        { id: 2, person1Id: 1, person2Id: 3, relationshipType: 'parent' },
        { id: 3, person1Id: 2, person2Id: 4, relationshipType: 'parent' },
        { id: 4, person1Id: 3, person2Id: 5, relationshipType: 'parent' },
        { id: 5, person1Id: 4, person2Id: 6, relationshipType: 'parent' }
      ];

      // Trying to make 6 parent of 1 (would create 6 -> 1 -> 2 -> 4 -> 6 loop)
      const result = detectCircularAncestry(1, 6, relationships);

      expect(result.isCircular).toBe(true);
    });

    it('should handle multiple parents correctly', () => {
      // Two parents (1, 2) -> Child (3)
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 3, relationshipType: 'parent' },
        { id: 2, person1Id: 2, person2Id: 3, relationshipType: 'parent' }
      ];

      // Person 4 can be parent of Person 3 (no circular reference)
      const result = detectCircularAncestry(3, 4, relationships);

      expect(result.isCircular).toBe(false);
    });
  });

  describe('validateParentChildRelationship', () => {
    it('should reject self-parenting', () => {
      const relationships = [];
      const result = validateParentChildRelationship(1, 1, relationships);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be their own parent');
    });

    it('should reject duplicate relationships', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
      ];

      const result = validateParentChildRelationship(1, 2, relationships);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('should reject circular ancestry', () => {
      // Person 2 is already parent of Person 1
      const relationships = [
        { id: 1, person1Id: 2, person2Id: 1, relationshipType: 'parent' }
      ];

      // Cannot make Person 1 parent of Person 2
      const result = validateParentChildRelationship(1, 2, relationships);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('circular ancestry');
    });

    it('should accept valid new relationship', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
      ];

      // Person 3 can be parent of Person 2
      const result = validateParentChildRelationship(3, 2, relationships);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept relationship with empty relationships array', () => {
      const result = validateParentChildRelationship(1, 2, []);

      expect(result.valid).toBe(true);
    });

    it('should not flag non-parent-child relationships as duplicates', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse' }
      ];

      // Parent-child relationship can be added even though marriage exists
      const result = validateParentChildRelationship(1, 2, relationships);

      expect(result.valid).toBe(true);
    });
  });

  describe('findOrphanedRecords', () => {
    it('should find orphaned relationships with missing person1', () => {
      const data = {
        people: [{ id: 2, firstName: 'Test', lastName: 'Person' }],
        houses: [],
        relationships: [
          { id: 1, person1Id: 999, person2Id: 2, relationshipType: 'parent' }
        ]
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.relationships).toHaveLength(1);
      expect(orphans.relationships[0].missingPerson1).toBe(999);
      expect(orphans.relationships[0].missingPerson2).toBeNull();
    });

    it('should find orphaned relationships with missing person2', () => {
      const data = {
        people: [{ id: 1, firstName: 'Test', lastName: 'Person' }],
        houses: [],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 888, relationshipType: 'parent' }
        ]
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.relationships).toHaveLength(1);
      expect(orphans.relationships[0].missingPerson1).toBeNull();
      expect(orphans.relationships[0].missingPerson2).toBe(888);
    });

    it('should find orphaned relationships with both people missing', () => {
      const data = {
        people: [],
        houses: [],
        relationships: [
          { id: 1, person1Id: 999, person2Id: 888, relationshipType: 'parent' }
        ]
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.relationships).toHaveLength(1);
      expect(orphans.relationships[0].missingPerson1).toBe(999);
      expect(orphans.relationships[0].missingPerson2).toBe(888);
    });

    it('should find people with missing house references', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Test', lastName: 'Person', houseId: 999 }
        ],
        houses: [],
        relationships: []
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.peopleWithMissingHouse).toHaveLength(1);
      expect(orphans.peopleWithMissingHouse[0].personId).toBe(1);
      expect(orphans.peopleWithMissingHouse[0].missingHouseId).toBe(999);
    });

    it('should not flag people with null houseId', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Test', lastName: 'Person', houseId: null }
        ],
        houses: [],
        relationships: []
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.peopleWithMissingHouse).toHaveLength(0);
    });

    it('should find orphaned codex links', () => {
      const data = {
        people: [],
        houses: [],
        relationships: [],
        codexEntries: [{ id: 1, name: 'Test Entry' }],
        codexLinks: [
          { id: 1, sourceId: 1, targetId: 999 }
        ]
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.codexLinks).toHaveLength(1);
      expect(orphans.codexLinks[0].missingSource).toBeNull();
      expect(orphans.codexLinks[0].missingTarget).toBe(999);
    });

    it('should return empty arrays when no orphans exist', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Parent', lastName: 'One', houseId: 1 },
          { id: 2, firstName: 'Child', lastName: 'One', houseId: 1 }
        ],
        houses: [{ id: 1, houseName: 'Test House' }],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
        ],
        codexEntries: [
          { id: 1, name: 'Entry 1' },
          { id: 2, name: 'Entry 2' }
        ],
        codexLinks: [
          { id: 1, sourceId: 1, targetId: 2 }
        ]
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.relationships).toHaveLength(0);
      expect(orphans.peopleWithMissingHouse).toHaveLength(0);
      expect(orphans.codexLinks).toHaveLength(0);
    });

    it('should handle empty data gracefully', () => {
      const orphans = findOrphanedRecords({});

      expect(orphans.relationships).toHaveLength(0);
      expect(orphans.peopleWithMissingHouse).toHaveLength(0);
      expect(orphans.codexLinks).toHaveLength(0);
    });

    it('should handle undefined data fields', () => {
      const data = {
        people: undefined,
        houses: undefined
      };

      const orphans = findOrphanedRecords(data);

      expect(orphans.relationships).toHaveLength(0);
      expect(orphans.peopleWithMissingHouse).toHaveLength(0);
      expect(orphans.codexLinks).toHaveLength(0);
    });
  });

  describe('validateBidirectionalRelationships', () => {
    it('should return empty array when no marriages exist', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
      ];

      const inconsistencies = validateBidirectionalRelationships(relationships);

      expect(inconsistencies).toHaveLength(0);
    });

    it('should return empty array for single marriage relationship', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1000' }
      ];

      const inconsistencies = validateBidirectionalRelationships(relationships);

      expect(inconsistencies).toHaveLength(0);
    });

    it('should detect mismatched marriage dates in bidirectional marriages', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1000' },
        { id: 2, person1Id: 2, person2Id: 1, relationshipType: 'spouse', marriageDate: '1001' }
      ];

      const inconsistencies = validateBidirectionalRelationships(relationships);

      expect(inconsistencies).toHaveLength(1);
      expect(inconsistencies[0].type).toBe('marriage-date-mismatch');
    });

    it('should not flag consistent bidirectional marriages', () => {
      const relationships = [
        { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1000' },
        { id: 2, person1Id: 2, person2Id: 1, relationshipType: 'spouse', marriageDate: '1000' }
      ];

      const inconsistencies = validateBidirectionalRelationships(relationships);

      expect(inconsistencies).toHaveLength(0);
    });

    it('should handle empty relationships array', () => {
      const inconsistencies = validateBidirectionalRelationships([]);

      expect(inconsistencies).toHaveLength(0);
    });
  });

  describe('runIntegrityCheck', () => {
    it('should return healthy status for valid data', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Parent', lastName: 'One', houseId: 1 },
          { id: 2, firstName: 'Child', lastName: 'One', houseId: 1 }
        ],
        houses: [{ id: 1, houseName: 'Test House' }],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'parent' }
        ],
        codexEntries: [],
        codexLinks: []
      };

      const result = runIntegrityCheck(data);

      expect(result.healthy).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.summary.totalOrphanedRelationships).toBe(0);
      expect(result.summary.totalCircularIssues).toBe(0);
    });

    it('should detect orphaned relationships', () => {
      const data = {
        people: [{ id: 1, firstName: 'Test', lastName: 'Person' }],
        houses: [],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 999, relationshipType: 'parent' }
        ]
      };

      const result = runIntegrityCheck(data);

      expect(result.healthy).toBe(false);
      expect(result.summary.totalOrphanedRelationships).toBe(1);
      expect(result.issues.orphanedRelationships).toHaveLength(1);
    });

    it('should detect orphaned house references', () => {
      const data = {
        people: [{ id: 1, firstName: 'Test', lastName: 'Person', houseId: 999 }],
        houses: [],
        relationships: []
      };

      const result = runIntegrityCheck(data);

      expect(result.healthy).toBe(false);
      expect(result.summary.totalOrphanedPeopleHouses).toBe(1);
    });

    it('should detect bidirectional inconsistencies', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Person', lastName: 'One' },
          { id: 2, firstName: 'Person', lastName: 'Two' }
        ],
        houses: [],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 2, relationshipType: 'spouse', marriageDate: '1000' },
          { id: 2, person1Id: 2, person2Id: 1, relationshipType: 'spouse', marriageDate: '1001' }
        ]
      };

      const result = runIntegrityCheck(data);

      expect(result.healthy).toBe(false);
      expect(result.summary.totalBidirectionalIssues).toBe(1);
    });

    it('should include timestamp in result', () => {
      const data = {
        people: [],
        houses: [],
        relationships: []
      };

      const result = runIntegrityCheck(data);

      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp)).toBeInstanceOf(Date);
    });

    it('should handle empty data', () => {
      const result = runIntegrityCheck({});

      expect(result.healthy).toBe(true);
      expect(result.summary.totalOrphanedRelationships).toBe(0);
      expect(result.summary.totalOrphanedPeopleHouses).toBe(0);
      expect(result.summary.totalOrphanedCodexLinks).toBe(0);
      expect(result.summary.totalBidirectionalIssues).toBe(0);
      expect(result.summary.totalCircularIssues).toBe(0);
    });

    it('should aggregate multiple issue types', () => {
      const data = {
        people: [
          { id: 1, firstName: 'Test', lastName: 'Person', houseId: 999 }
        ],
        houses: [],
        relationships: [
          { id: 1, person1Id: 1, person2Id: 888, relationshipType: 'parent' }
        ],
        codexEntries: [],
        codexLinks: [
          { id: 1, sourceId: 777, targetId: 666 }
        ]
      };

      const result = runIntegrityCheck(data);

      expect(result.healthy).toBe(false);
      expect(result.summary.totalOrphanedRelationships).toBe(1);
      expect(result.summary.totalOrphanedPeopleHouses).toBe(1);
      expect(result.summary.totalOrphanedCodexLinks).toBe(1);
    });
  });
});
