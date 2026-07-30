import { 
  addHouse, 
  addPerson, 
  addRelationship,
  getAllHouses,
  getAllPeople 
} from './database';
import { logger } from '../utils/logger';

/**
 * Sample Data Initialization
 * 
 * This file creates sample data for testing the application.
 * It creates two noble houses with a few family members and relationships.
 */

export async function initializeSampleData() {
  try {
    // Check if we already have data
    const existingHouses = await getAllHouses();
    if (existingHouses.length > 0) {
      logger.log('Sample data already exists, skipping initialization');
      return;
    }

    logger.log('Creating sample data...');

    // ==================== CREATE HOUSES ====================
    
    const houseValorianId = await addHouse({
      houseName: 'House Valorian',
      sigil: 'A golden lion on crimson field',
      motto: 'Strength Through Unity',
      foundedDate: '1120',
      colorCode: '#dc2626',
      notes: 'Ancient noble house with strong military tradition'
    });

    const houseSilverwindId = await addHouse({
      houseName: 'House Silverwind',
      sigil: 'A white owl on blue field',
      motto: 'Knowledge is Power',
      foundedDate: '1089',
      colorCode: '#2563eb',
      notes: 'Known for producing great scholars and court advisors'
    });

    // ==================== CREATE PEOPLE ====================

    const aldricId = await addPerson({
      firstName: 'Aldric',
      lastName: 'Valorian',
      maidenName: null,
      dateOfBirth: '1245-03-15',
      dateOfDeath: null,
      gender: 'male',
      houseId: houseValorianId,
      legitimacyStatus: 'legitimate',
      species: null,
      magicalBloodline: null,
      titles: ['Lord of Valorian Keep', 'Marshal of the Eastern Reach'],
      notes: 'Current head of House Valorian, respected military commander',
      portraitUrl: null
    });

    const elaraId = await addPerson({
      firstName: 'Elara',
      lastName: 'Valorian',
      maidenName: 'Silverwind',
      dateOfBirth: '1247-07-22',
      dateOfDeath: null,
      gender: 'female',
      houseId: houseValorianId,
      legitimacyStatus: 'legitimate',
      species: null,
      magicalBloodline: null,
      titles: ['Lady of Valorian Keep'],
      notes: 'Originally from House Silverwind, known for her wisdom',
      portraitUrl: null
    });

    const marcusId = await addPerson({
      firstName: 'Marcus',
      lastName: 'Valorian',
      maidenName: null,
      dateOfBirth: '1268-11-03',
      dateOfDeath: null,
      gender: 'male',
      houseId: houseValorianId,
      legitimacyStatus: 'legitimate',
      species: null,
      magicalBloodline: null,
      titles: ['Heir to Valorian Keep', 'Knight Commander'],
      notes: 'Eldest son and heir, follows in his father\'s military footsteps',
      portraitUrl: null
    });

    const lyannaId = await addPerson({
      firstName: 'Lyanna',
      lastName: 'Valorian',
      maidenName: null,
      dateOfBirth: '1270-05-18',
      dateOfDeath: null,
      gender: 'female',
      houseId: houseValorianId,
      legitimacyStatus: 'legitimate',
      species: null,
      magicalBloodline: null,
      titles: [],
      notes: 'Second child, skilled diplomat',
      portraitUrl: null
    });

    const theronId = await addPerson({
      firstName: 'Theron',
      lastName: 'Silverwind',
      maidenName: null,
      dateOfBirth: '1220-02-10',
      dateOfDeath: '1295-09-30',
      gender: 'male',
      houseId: houseSilverwindId,
      legitimacyStatus: 'legitimate',
      species: null,
      magicalBloodline: null,
      titles: ['Lord of Silverwind Hall', 'Royal Advisor'],
      notes: 'Former head of House Silverwind, served as royal advisor',
      portraitUrl: null
    });

    // ==================== CREATE RELATIONSHIPS ====================

    await addRelationship({
      person1Id: aldricId,
      person2Id: elaraId,
      relationshipType: 'spouse',
      biologicalParent: null,
      marriageDate: '1267-06-21',
      divorceDate: null,
      marriageStatus: 'married'
    });

    await addRelationship({
      person1Id: aldricId,
      person2Id: marcusId,
      relationshipType: 'parent',
      biologicalParent: true,
      marriageDate: null,
      divorceDate: null,
      marriageStatus: null
    });

    await addRelationship({
      person1Id: elaraId,
      person2Id: marcusId,
      relationshipType: 'parent',
      biologicalParent: true,
      marriageDate: null,
      divorceDate: null,
      marriageStatus: null
    });

    await addRelationship({
      person1Id: aldricId,
      person2Id: lyannaId,
      relationshipType: 'parent',
      biologicalParent: true,
      marriageDate: null,
      divorceDate: null,
      marriageStatus: null
    });

    await addRelationship({
      person1Id: elaraId,
      person2Id: lyannaId,
      relationshipType: 'parent',
      biologicalParent: true,
      marriageDate: null,
      divorceDate: null,
      marriageStatus: null
    });

    await addRelationship({
      person1Id: theronId,
      person2Id: elaraId,
      relationshipType: 'parent',
      biologicalParent: true,
      marriageDate: null,
      divorceDate: null,
      marriageStatus: null
    });

    logger.log('Sample data created successfully!');
    logger.log('Created 2 houses and 5 people with relationships');
    
    return {
      houses: 2,
      people: 5,
      relationships: 6
    };

  } catch (error) {
    logger.error('Error initializing sample data:', error);
    throw error;
  }
}

export async function clearAllData() {
  try {
    const { db } = await import('./database');
    await db.people.clear();
    await db.houses.clear();
    await db.relationships.clear();
    logger.log('All data cleared from database');
  } catch (error) {
    logger.error('Error clearing data:', error);
    throw error;
  }
}
