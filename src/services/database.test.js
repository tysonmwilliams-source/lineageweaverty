/**
 * Database Service Tests
 *
 * Tests for IndexedDB CRUD operations including:
 * - People operations (add, get, update, delete)
 * - House operations (add, get, update, delete)
 * - Relationship operations (add, get, update, delete)
 * - Utility functions (age calculation, ceremony eligibility)
 * - Cascade delete behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getDatabase,
  closeDatabaseInstance,
  deleteDatabaseForDataset,
  addPerson,
  getPerson,
  getAllPeople,
  getPeopleCount,
  getPeopleByHouse,
  updatePerson,
  deletePerson,
  addHouse,
  getHouse,
  getAllHouses,
  getHousesCount,
  getCadetHouses,
  updateHouse,
  deleteHouse,
  addRelationship,
  getRelationshipsForPerson,
  getAllRelationships,
  getRelationshipsCount,
  updateRelationship,
  deleteRelationship,
  calculateAge,
  isEligibleForCeremony,
  canFoundCadetHouse,
  exportFullDatabase,
  importFullDatabase,
  FULL_BACKUP_FORMAT
} from './database';

// Use a unique dataset ID for each test to ensure isolation
const TEST_DATASET_ID = 'test-dataset';

describe('Database Service', () => {
  beforeEach(async () => {
    // Start with a fresh database for each test
    await deleteDatabaseForDataset(TEST_DATASET_ID);
  });

  afterEach(async () => {
    // Clean up after each test
    await closeDatabaseInstance(TEST_DATASET_ID);
  });

  describe('Database Instance Management', () => {
    it('should create and return a database instance', () => {
      const db = getDatabase(TEST_DATASET_ID);
      expect(db).toBeDefined();
      expect(db.name).toContain('LineageweaverDB');
    });

    it('should return the same instance for same dataset', () => {
      const db1 = getDatabase(TEST_DATASET_ID);
      const db2 = getDatabase(TEST_DATASET_ID);
      expect(db1).toBe(db2);
    });

    it('should return different instances for different datasets', () => {
      const db1 = getDatabase('dataset-1');
      const db2 = getDatabase('dataset-2');
      expect(db1).not.toBe(db2);

      // Clean up extra instances
      closeDatabaseInstance('dataset-1');
      closeDatabaseInstance('dataset-2');
    });
  });

  describe('People Operations', () => {
    it('should add a person and return ID', async () => {
      const personData = {
        firstName: 'John',
        lastName: 'Doe',
        gender: 'male'
      };

      const id = await addPerson(personData, TEST_DATASET_ID);

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
    });

    it('should get a person by ID', async () => {
      const personData = {
        firstName: 'Jane',
        lastName: 'Smith',
        gender: 'female',
        dateOfBirth: '1990-01-15'
      };

      const id = await addPerson(personData, TEST_DATASET_ID);
      const person = await getPerson(id, TEST_DATASET_ID);

      expect(person).toBeDefined();
      expect(person.firstName).toBe('Jane');
      expect(person.lastName).toBe('Smith');
      expect(person.gender).toBe('female');
    });

    it('should return undefined for non-existent person', async () => {
      const person = await getPerson(99999, TEST_DATASET_ID);
      expect(person).toBeUndefined();
    });

    it('should get all people', async () => {
      await addPerson({ firstName: 'Person', lastName: 'One' }, TEST_DATASET_ID);
      await addPerson({ firstName: 'Person', lastName: 'Two' }, TEST_DATASET_ID);
      await addPerson({ firstName: 'Person', lastName: 'Three' }, TEST_DATASET_ID);

      const people = await getAllPeople(TEST_DATASET_ID);

      expect(people).toHaveLength(3);
    });

    it('should get people count', async () => {
      await addPerson({ firstName: 'Person', lastName: 'One' }, TEST_DATASET_ID);
      await addPerson({ firstName: 'Person', lastName: 'Two' }, TEST_DATASET_ID);

      const count = await getPeopleCount(TEST_DATASET_ID);

      expect(count).toBe(2);
    });

    it('should get people by house', async () => {
      await addPerson({ firstName: 'Member', lastName: 'One', houseId: 1 }, TEST_DATASET_ID);
      await addPerson({ firstName: 'Member', lastName: 'Two', houseId: 1 }, TEST_DATASET_ID);
      await addPerson({ firstName: 'Other', lastName: 'Person', houseId: 2 }, TEST_DATASET_ID);

      const houseMembers = await getPeopleByHouse(1, TEST_DATASET_ID);

      expect(houseMembers).toHaveLength(2);
      expect(houseMembers.every(p => p.houseId === 1)).toBe(true);
    });

    it('should update a person', async () => {
      const id = await addPerson({ firstName: 'Original', lastName: 'Name' }, TEST_DATASET_ID);

      await updatePerson(id, { firstName: 'Updated' }, TEST_DATASET_ID);
      const person = await getPerson(id, TEST_DATASET_ID);

      expect(person.firstName).toBe('Updated');
      expect(person.lastName).toBe('Name');
    });

    it('should delete a person', async () => {
      const id = await addPerson({ firstName: 'To', lastName: 'Delete' }, TEST_DATASET_ID);

      await deletePerson(id, TEST_DATASET_ID);
      const person = await getPerson(id, TEST_DATASET_ID);

      expect(person).toBeUndefined();
    });

    it('should cascade delete relationships when deleting a person', async () => {
      const person1Id = await addPerson({ firstName: 'Person', lastName: 'One' }, TEST_DATASET_ID);
      const person2Id = await addPerson({ firstName: 'Person', lastName: 'Two' }, TEST_DATASET_ID);

      // Add a relationship
      await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse'
      }, TEST_DATASET_ID);

      // Verify relationship exists
      const relsBefore = await getAllRelationships(TEST_DATASET_ID);
      expect(relsBefore).toHaveLength(1);

      // Delete person1
      const result = await deletePerson(person1Id, TEST_DATASET_ID);

      // Verify cascade delete
      expect(result.deletedRelationships).toBe(1);
      const relsAfter = await getAllRelationships(TEST_DATASET_ID);
      expect(relsAfter).toHaveLength(0);
    });
  });

  describe('House Operations', () => {
    it('should add a house and return ID', async () => {
      const houseData = {
        houseName: 'Stark',
        houseType: 'main'
      };

      const id = await addHouse(houseData, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
    });

    it('should get a house by ID', async () => {
      const houseData = {
        houseName: 'Lannister',
        houseType: 'main',
        colorCode: '#FFD700'
      };

      const id = await addHouse(houseData, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });
      const house = await getHouse(id, TEST_DATASET_ID);

      expect(house).toBeDefined();
      expect(house.houseName).toBe('Lannister');
      expect(house.colorCode).toBe('#FFD700');
    });

    it('should get all houses', async () => {
      await addHouse({ houseName: 'House One' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });
      await addHouse({ houseName: 'House Two' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      const houses = await getAllHouses(TEST_DATASET_ID);

      expect(houses).toHaveLength(2);
    });

    it('should get houses count', async () => {
      await addHouse({ houseName: 'House One' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });
      await addHouse({ houseName: 'House Two' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });
      await addHouse({ houseName: 'House Three' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      const count = await getHousesCount(TEST_DATASET_ID);

      expect(count).toBe(3);
    });

    it('should get cadet houses by parent house ID', async () => {
      const mainHouseId = await addHouse({
        houseName: 'Main House',
        houseType: 'main'
      }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      await addHouse({
        houseName: 'Cadet One',
        houseType: 'cadet',
        parentHouseId: mainHouseId
      }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      await addHouse({
        houseName: 'Cadet Two',
        houseType: 'cadet',
        parentHouseId: mainHouseId
      }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      const cadetHouses = await getCadetHouses(mainHouseId, TEST_DATASET_ID);

      expect(cadetHouses).toHaveLength(2);
      expect(cadetHouses.every(h => h.parentHouseId === mainHouseId)).toBe(true);
    });

    it('should update a house', async () => {
      const id = await addHouse({ houseName: 'Original' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      await updateHouse(id, { houseName: 'Updated House' }, TEST_DATASET_ID);
      const house = await getHouse(id, TEST_DATASET_ID);

      expect(house.houseName).toBe('Updated House');
    });

    it('should delete a house and clear people references', async () => {
      const houseId = await addHouse({ houseName: 'To Delete' }, { datasetId: TEST_DATASET_ID, skipCodexCreation: true });

      // Add people to the house
      const person1Id = await addPerson({ firstName: 'Member', lastName: 'One', houseId }, TEST_DATASET_ID);
      const person2Id = await addPerson({ firstName: 'Member', lastName: 'Two', houseId }, TEST_DATASET_ID);

      // Delete the house
      const result = await deleteHouse(houseId, { datasetId: TEST_DATASET_ID, skipCodexDeletion: true });

      // Verify house deleted
      const house = await getHouse(houseId, TEST_DATASET_ID);
      expect(house).toBeUndefined();

      // Verify people still exist but houseId cleared
      expect(result.clearedPeopleCount).toBe(2);
      const person1 = await getPerson(person1Id, TEST_DATASET_ID);
      const person2 = await getPerson(person2Id, TEST_DATASET_ID);
      expect(person1.houseId).toBeNull();
      expect(person2.houseId).toBeNull();
    });
  });

  describe('Relationship Operations', () => {
    let person1Id, person2Id, person3Id;

    beforeEach(async () => {
      person1Id = await addPerson({ firstName: 'Person', lastName: 'One' }, TEST_DATASET_ID);
      person2Id = await addPerson({ firstName: 'Person', lastName: 'Two' }, TEST_DATASET_ID);
      person3Id = await addPerson({ firstName: 'Person', lastName: 'Three' }, TEST_DATASET_ID);
    });

    it('should add a relationship', async () => {
      const id = await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse'
      }, TEST_DATASET_ID);

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
    });

    it('should get relationships for a person', async () => {
      await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse'
      }, TEST_DATASET_ID);

      await addRelationship({
        person1Id: person1Id,
        person2Id: person3Id,
        relationshipType: 'parent-child'
      }, TEST_DATASET_ID);

      const relationships = await getRelationshipsForPerson(person1Id, TEST_DATASET_ID);

      expect(relationships).toHaveLength(2);
    });

    it('should get all relationships', async () => {
      await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse'
      }, TEST_DATASET_ID);

      await addRelationship({
        person1Id: person2Id,
        person2Id: person3Id,
        relationshipType: 'sibling'
      }, TEST_DATASET_ID);

      const relationships = await getAllRelationships(TEST_DATASET_ID);

      expect(relationships).toHaveLength(2);
    });

    it('should get relationships count', async () => {
      await addRelationship({ person1Id, person2Id, relationshipType: 'spouse' }, TEST_DATASET_ID);

      const count = await getRelationshipsCount(TEST_DATASET_ID);

      expect(count).toBe(1);
    });

    it('should update a relationship', async () => {
      const id = await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse',
        marriageDate: '1000'
      }, TEST_DATASET_ID);

      await updateRelationship(id, { marriageDate: '1001' }, TEST_DATASET_ID);

      const relationships = await getRelationshipsForPerson(person1Id, TEST_DATASET_ID);
      expect(relationships[0].marriageDate).toBe('1001');
    });

    it('should delete a relationship', async () => {
      const id = await addRelationship({
        person1Id,
        person2Id,
        relationshipType: 'spouse'
      }, TEST_DATASET_ID);

      await deleteRelationship(id, TEST_DATASET_ID);

      const relationships = await getAllRelationships(TEST_DATASET_ID);
      expect(relationships).toHaveLength(0);
    });

    it('should prevent self-referential parent relationships', async () => {
      await expect(
        addRelationship({
          person1Id: person1Id,
          person2Id: person1Id,
          relationshipType: 'parent'
        }, TEST_DATASET_ID)
      ).rejects.toThrow('cannot be their own parent');
    });

    it('should prevent self-reference for adopted and foster parents too', async () => {
      for (const relationshipType of ['adopted-parent', 'foster-parent']) {
        await expect(
          addRelationship({
            person1Id: person1Id,
            person2Id: person1Id,
            relationshipType
          }, TEST_DATASET_ID)
        ).rejects.toThrow('cannot be their own parent');
      }
    });

    it('should prevent circular ancestry (a person becoming their own grandparent)', async () => {
      // A is parent of B
      await addRelationship({
        person1Id: person1Id,
        person2Id: person2Id,
        relationshipType: 'parent'
      }, TEST_DATASET_ID);

      // Now try to make B the parent of A
      await expect(
        addRelationship({
          person1Id: person2Id,
          person2Id: person1Id,
          relationshipType: 'parent'
        }, TEST_DATASET_ID)
      ).rejects.toThrow(/circular ancestry/i);
    });
  });

  describe('Utility Functions', () => {
    describe('calculateAge', () => {
      it('should calculate age correctly', () => {
        // Use a date that will give a consistent age
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - 25);
        birthDate.setMonth(birthDate.getMonth() - 1); // Ensure birthday has passed

        const age = calculateAge(birthDate.toISOString().split('T')[0]);

        expect(age).toBe(25);
      });

      it('should return null for no birth date', () => {
        expect(calculateAge(null)).toBeNull();
        expect(calculateAge(undefined)).toBeNull();
      });

      it('should handle birthday not yet passed this year', () => {
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - 25);
        birthDate.setMonth(birthDate.getMonth() + 2); // Birthday is 2 months away

        const age = calculateAge(birthDate.toISOString().split('T')[0]);

        expect(age).toBe(24);
      });
    });

    describe('isEligibleForCeremony', () => {
      it('should be eligible for legitimate noble with house', () => {
        const person = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'legitimate',
          houseId: 1
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(true);
        expect(result.tier).toBe(1);
      });

      it('should be eligible for bastard', () => {
        const person = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'bastard',
          bastardStatus: 'active'
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(true);
        expect(result.tier).toBe(2);
      });

      it('should not be eligible if no birth date', () => {
        const person = {
          legitimacyStatus: 'legitimate',
          houseId: 1
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('birth date');
      });

      it('should not be eligible if under 18', () => {
        const recentDate = new Date();
        recentDate.setFullYear(recentDate.getFullYear() - 10);

        const person = {
          dateOfBirth: recentDate.toISOString().split('T')[0],
          legitimacyStatus: 'legitimate',
          houseId: 1
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('18');
      });

      it('should not be eligible if bastard already founded house', () => {
        const person = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'bastard',
          bastardStatus: 'founded'
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('founded');
      });

      it('should not be eligible if bastard has been legitimized', () => {
        const person = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'bastard',
          bastardStatus: 'legitimized'
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('legitimized');
      });

      it('should not be eligible if legitimate but no house', () => {
        const person = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'legitimate',
          houseId: null
        };

        const result = isEligibleForCeremony(person);

        expect(result.eligible).toBe(false);
        expect(result.reason).toContain('noble house');
      });
    });

    describe('canFoundCadetHouse (legacy)', () => {
      it('should return boolean for backward compatibility', () => {
        const eligiblePerson = {
          dateOfBirth: '1000-01-01',
          legitimacyStatus: 'legitimate',
          houseId: 1
        };

        expect(canFoundCadetHouse(eligiblePerson)).toBe(true);
      });
    });
  });

  describe('Dataset Isolation', () => {
    it('should keep data isolated between datasets', async () => {
      const dataset1 = 'test-dataset-1';
      const dataset2 = 'test-dataset-2';

      try {
        // Add person to dataset 1
        await addPerson({ firstName: 'Dataset1', lastName: 'Person' }, dataset1);

        // Add person to dataset 2
        await addPerson({ firstName: 'Dataset2', lastName: 'Person' }, dataset2);

        // Verify isolation
        const people1 = await getAllPeople(dataset1);
        const people2 = await getAllPeople(dataset2);

        expect(people1).toHaveLength(1);
        expect(people1[0].firstName).toBe('Dataset1');

        expect(people2).toHaveLength(1);
        expect(people2[0].firstName).toBe('Dataset2');
      } finally {
        // Clean up
        await deleteDatabaseForDataset(dataset1);
        await deleteDatabaseForDataset(dataset2);
      }
    });
  });

  describe('Codex Entry Indexes (schema v18)', () => {
    it('should look up entries by back-reference without a full scan', async () => {
      const { createEntry, getEntryByPersonId, getEntryByHouseId } =
        await import('./codexService.js');

      const personEntryId = await createEntry(
        { type: 'personage', title: 'Aldric', personId: 42 }, TEST_DATASET_ID
      );
      const houseEntryId = await createEntry(
        { type: 'house', title: 'House Test', houseId: 7 }, TEST_DATASET_ID
      );
      await createEntry({ type: 'event', title: 'Unlinked' }, TEST_DATASET_ID);

      const byPerson = await getEntryByPersonId(42, TEST_DATASET_ID);
      expect(byPerson?.id).toBe(personEntryId);

      const byHouse = await getEntryByHouseId(7, TEST_DATASET_ID);
      expect(byHouse?.id).toBe(houseEntryId);

      expect(await getEntryByPersonId(999, TEST_DATASET_ID)).toBeNull();
    });

    it('should return null rather than throwing on a null id', async () => {
      const { getEntryByPersonId, getEntryByHeraldryId } =
        await import('./codexService.js');
      // Dexie throws on .equals(null); these must be guarded.
      expect(await getEntryByPersonId(null, TEST_DATASET_ID)).toBeNull();
      expect(await getEntryByHeraldryId(undefined, TEST_DATASET_ID)).toBeNull();
    });
  });

  describe('Full Backup', () => {
    it('should export every table, not just the core four', async () => {
      const db = getDatabase(TEST_DATASET_ID);
      await addPerson({ firstName: 'Aldric', lastName: 'Wilfrey' }, TEST_DATASET_ID);
      await db.heraldry.add({ name: 'Arms of Test', blazon: 'Or, a lion gules' });
      await db.dignities.add({ name: 'Duke of Test', dignityClass: 'ducal' });

      const backup = await exportFullDatabase(TEST_DATASET_ID);

      expect(backup.format).toBe(FULL_BACKUP_FORMAT);
      expect(backup.tables.people).toHaveLength(1);
      // These were silently dropped by the previous export.
      expect(backup.tables.heraldry).toHaveLength(1);
      expect(backup.tables.dignities).toHaveLength(1);
      // syncQueue is transient and must not be captured.
      expect(backup.tables.syncQueue).toBeUndefined();
    });

    it('should preserve parentHouseId so cadet branches survive a round trip', async () => {
      const opts = { datasetId: TEST_DATASET_ID, skipCodexCreation: true };
      const parentId = await addHouse({ houseName: 'House Wilfrey' }, opts);
      await addHouse(
        { houseName: 'House Wilfrey of Bramblehall', parentHouseId: parentId },
        opts
      );

      const backup = await exportFullDatabase(TEST_DATASET_ID);
      await deleteDatabaseForDataset(TEST_DATASET_ID);
      await importFullDatabase(backup, TEST_DATASET_ID);

      const houses = await getAllHouses(TEST_DATASET_ID);
      const cadet = houses.find(h => h.houseName === 'House Wilfrey of Bramblehall');
      expect(cadet).toBeDefined();
      expect(cadet.parentHouseId).toBe(parentId);
    });

    it('should round-trip people, houses and relationships with ids intact', async () => {
      const houseId = await addHouse(
        { houseName: 'House Test' },
        { datasetId: TEST_DATASET_ID, skipCodexCreation: true }
      );
      const p1 = await addPerson({ firstName: 'Parent', lastName: 'Test', houseId }, TEST_DATASET_ID);
      const p2 = await addPerson({ firstName: 'Child', lastName: 'Test', houseId }, TEST_DATASET_ID);
      await addRelationship(
        { person1Id: p1, person2Id: p2, relationshipType: 'parent' },
        TEST_DATASET_ID
      );

      const backup = await exportFullDatabase(TEST_DATASET_ID);
      await deleteDatabaseForDataset(TEST_DATASET_ID);
      const { restored } = await importFullDatabase(backup, TEST_DATASET_ID);

      expect(restored.people).toBe(2);
      const people = await getAllPeople(TEST_DATASET_ID);
      expect(people.map(p => p.id).sort()).toEqual([p1, p2].sort());
      expect(people.every(p => p.houseId === houseId)).toBe(true);

      const rels = await getAllRelationships(TEST_DATASET_ID);
      expect(rels).toHaveLength(1);
      expect(rels[0].person1Id).toBe(p1);
      expect(rels[0].person2Id).toBe(p2);
    });

    it('should reject a file that is not a full backup', async () => {
      await expect(
        importFullDatabase({ people: [], houses: [] }, TEST_DATASET_ID)
      ).rejects.toThrow(/not a lineageweaver full backup/i);
    });
  });
});
