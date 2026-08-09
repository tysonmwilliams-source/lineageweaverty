/**
 * writingService.js - Writing Studio CRUD Operations
 *
 * Handles all operations for writing projects (novels, novellas, short stories, notes).
 * Integrates with the chapter and writing links systems.
 */

import { getDatabase } from './database';
import { logger } from '../utils/logger';

// ==================== CONSTANTS ====================

export const WRITING_TYPES = {
  NOVEL: 'novel',
  NOVELLA: 'novella',
  SHORT_STORY: 'short-story',
  NOTES: 'notes'
};

export const WRITING_STATUSES = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in-progress',
  EDITING: 'editing',
  COMPLETE: 'complete',
  ARCHIVED: 'archived'
};

export const WRITING_TYPE_LABELS = {
  [WRITING_TYPES.NOVEL]: 'Novel',
  [WRITING_TYPES.NOVELLA]: 'Novella',
  [WRITING_TYPES.SHORT_STORY]: 'Short Story',
  [WRITING_TYPES.NOTES]: 'Notes'
};

export const WRITING_STATUS_LABELS = {
  [WRITING_STATUSES.DRAFT]: 'Draft',
  [WRITING_STATUSES.IN_PROGRESS]: 'In Progress',
  [WRITING_STATUSES.EDITING]: 'Editing',
  [WRITING_STATUSES.COMPLETE]: 'Complete',
  [WRITING_STATUSES.ARCHIVED]: 'Archived'
};

// ==================== CRUD OPERATIONS ====================

/**
 * Create a new writing project
 * Automatically creates a first chapter
 *
 * @param {Object} data - Writing data
 * @param {string} data.title - Title of the writing
 * @param {string} [data.type='short-story'] - Type of writing
 * @param {string} [data.synopsis] - Brief synopsis
 * @param {string[]} [data.tags] - Tags for organization
 * @param {number} [data.targetWordCount] - Target word count
 * @param {Object} [data.metadata] - Additional metadata (genre, timeline, etc.)
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} New writing ID
 */
export async function createWriting(data, datasetId) {
  const db = getDatabase(datasetId);

  const now = new Date().toISOString();
  const writing = {
    title: data.title || 'Untitled',
    type: data.type || WRITING_TYPES.SHORT_STORY,
    status: data.status || WRITING_STATUSES.DRAFT,
    synopsis: data.synopsis || '',
    tags: data.tags || [],
    targetWordCount: data.targetWordCount || 0,
    currentWordCount: 0,
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now
  };

  const writingId = await db.writings.add(writing);

  // Auto-create first chapter
  await db.chapters.add({
    writingId,
    title: 'Chapter 1',
    order: 1,
    content: null, // TipTap JSON
    contentHtml: '',
    contentPlainText: '',
    wordCount: 0,
    status: WRITING_STATUSES.DRAFT,
    notes: '',
    povCharacter: null,
    createdAt: now,
    updatedAt: now
  });

  logger.log('Writing created with ID:', writingId);
  return writingId;
}

/**
 * Get a writing by ID
 * @param {number} id - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object|undefined>} Writing data
 */
export async function getWriting(id, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writings.get(id);
}

/**
 * Get all writings
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of writings
 */
export async function getAllWritings(datasetId) {
  const db = getDatabase(datasetId);
  return await db.writings.toArray();
}

/**
 * Get writings by type
 * @param {string} type - Writing type
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of writings
 */
export async function getWritingsByType(type, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writings.where('type').equals(type).toArray();
}

/**
 * Get writings by status
 * @param {string} status - Writing status
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of writings
 */
export async function getWritingsByStatus(status, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writings.where('status').equals(status).toArray();
}

/**
 * Update a writing
 * @param {number} id - Writing ID
 * @param {Object} updates - Fields to update
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of records updated
 */
export async function updateWriting(id, updates, datasetId) {
  const db = getDatabase(datasetId);

  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  const result = await db.writings.update(id, updateData);
  logger.log('Writing updated:', id);
  return result;
}

/**
 * Delete a writing and all its chapters and links
 * @param {number} id - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Deletion info
 */
export async function deleteWriting(id, datasetId) {
  const db = getDatabase(datasetId);

  // Collect the ids before deleting, not just the counts. The caller needs
  // them to propagate the cascade to the cloud: deleting the writing alone
  // left every chapter and link in Firestore, and the next download restored
  // them as rows pointing at a writing that no longer exists.
  const chapters = await db.chapters.where('writingId').equals(id).toArray();
  const chapterIds = chapters.map(c => c.id);

  const links = await db.writingLinks.where('writingId').equals(id).toArray();
  const linkIds = links.map(l => l.id);

  // Delete writing links
  const linksDeleted = await db.writingLinks.where('writingId').equals(id).delete();

  // Delete chapters
  const chaptersDeleted = await db.chapters.where('writingId').equals(id).delete();

  // Delete writing
  await db.writings.delete(id);

  logger.log('Writing deleted:', id, {
    chaptersDeleted,
    linksDeleted
  });

  return { chaptersDeleted, linksDeleted, chapterIds, linkIds };
}

/**
 * Restore a writing (for cloud sync)
 * Preserves original ID
 * @param {Object} data - Full writing data including id
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Writing ID
 */
export async function restoreWriting(data, datasetId) {
  const db = getDatabase(datasetId);
  const id = await db.writings.put({
    ...data,
    id: parseInt(data.id) || data.id
  });
  logger.log('Writing restored:', id);
  return id;
}

/**
 * Get total word count across all chapters
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Total word count
 */
export async function getWritingWordCount(writingId, datasetId) {
  const db = getDatabase(datasetId);
  const chapters = await db.chapters.where('writingId').equals(writingId).toArray();
  return chapters.reduce((total, ch) => total + (ch.wordCount || 0), 0);
}

/**
 * Update word count on writing based on chapters
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 */
export async function updateWritingWordCount(writingId, datasetId) {
  const wordCount = await getWritingWordCount(writingId, datasetId);
  await updateWriting(writingId, { currentWordCount: wordCount }, datasetId);
}

/**
 * Get writings count
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Count
 */
export async function getWritingsCount(datasetId) {
  const db = getDatabase(datasetId);
  return await db.writings.count();
}

/**
 * Search writings by title
 * @param {string} query - Search query
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Matching writings
 */
export async function searchWritings(query, datasetId) {
  const db = getDatabase(datasetId);
  const lowerQuery = query.toLowerCase();
  const all = await db.writings.toArray();
  return all.filter(w =>
    w.title.toLowerCase().includes(lowerQuery) ||
    w.synopsis?.toLowerCase().includes(lowerQuery) ||
    w.tags?.some(t => t.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get writing with all its chapters
 * @param {number} id - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Writing with chapters
 */
export async function getWritingWithChapters(id, datasetId) {
  const db = getDatabase(datasetId);
  const writing = await db.writings.get(id);
  if (!writing) return null;

  const chapters = await db.chapters
    .where('writingId')
    .equals(id)
    .sortBy('order');

  return { ...writing, chapters };
}

export default {
  WRITING_TYPES,
  WRITING_STATUSES,
  WRITING_TYPE_LABELS,
  WRITING_STATUS_LABELS,
  createWriting,
  getWriting,
  getAllWritings,
  getWritingsByType,
  getWritingsByStatus,
  updateWriting,
  deleteWriting,
  restoreWriting,
  getWritingWordCount,
  updateWritingWordCount,
  getWritingsCount,
  searchWritings,
  getWritingWithChapters
};
