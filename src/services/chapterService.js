/**
 * chapterService.js - Chapter CRUD Operations
 *
 * Handles all operations for chapters within writings.
 * Chapters store TipTap JSON content and track word counts.
 */

import { getDatabase } from './database';
import { updateWritingWordCount } from './writingService';
import { logger } from '../utils/logger';

// ==================== CONSTANTS ====================

export const CHAPTER_STATUSES = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in-progress',
  COMPLETE: 'complete',
  NEEDS_REVISION: 'needs-revision'
};

export const CHAPTER_STATUS_LABELS = {
  [CHAPTER_STATUSES.DRAFT]: 'Draft',
  [CHAPTER_STATUSES.IN_PROGRESS]: 'In Progress',
  [CHAPTER_STATUSES.COMPLETE]: 'Complete',
  [CHAPTER_STATUSES.NEEDS_REVISION]: 'Needs Revision'
};

// ==================== CRUD OPERATIONS ====================

/**
 * Create a new chapter
 * @param {Object} data - Chapter data
 * @param {number} data.writingId - Parent writing ID
 * @param {string} [data.title] - Chapter title
 * @param {number} [data.order] - Order in writing (auto-calculated if not provided)
 * @param {Object} [data.content] - TipTap JSON content
 * @param {string} [data.notes] - Author notes
 * @param {number} [data.povCharacter] - POV character ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<number>} New chapter ID
 */
export async function createChapter(data, datasetId) {
  const db = getDatabase(datasetId);

  // Auto-calculate order if not provided
  let order = data.order;
  if (order === undefined) {
    const existing = await db.chapters
      .where('writingId')
      .equals(data.writingId)
      .toArray();
    order = existing.length + 1;
  }

  const now = new Date().toISOString();
  const chapter = {
    writingId: data.writingId,
    title: data.title || `Chapter ${order}`,
    order,
    content: data.content || null,
    contentHtml: data.contentHtml || '',
    contentPlainText: data.contentPlainText || '',
    wordCount: data.wordCount || 0,
    status: data.status || CHAPTER_STATUSES.DRAFT,
    notes: data.notes || '',
    povCharacter: data.povCharacter || null,
    createdAt: now,
    updatedAt: now
  };

  const chapterId = await db.chapters.add(chapter);
  logger.log('Chapter created:', chapterId);
  return chapterId;
}

/**
 * Get a chapter by ID
 * @param {number} id - Chapter ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<Object|undefined>} Chapter data
 */
export async function getChapter(id, datasetId) {
  const db = getDatabase(datasetId);
  return await db.chapters.get(id);
}

/**
 * Get all chapters for a writing
 * @param {number} writingId - Writing ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of chapters sorted by order
 */
export async function getChaptersByWriting(writingId, datasetId) {
  const db = getDatabase(datasetId);
  return await db.chapters
    .where('writingId')
    .equals(writingId)
    .sortBy('order');
}

/**
 * Get all chapters
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of chapters
 */
export async function getAllChapters(datasetId) {
  const db = getDatabase(datasetId);
  return await db.chapters.toArray();
}

/**
 * Update a chapter
 * @param {number} id - Chapter ID
 * @param {Object} updates - Fields to update
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number of records updated
 */
export async function updateChapter(id, updates, datasetId) {
  const db = getDatabase(datasetId);

  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  const result = await db.chapters.update(id, updateData);

  // Update writing word count if content changed
  if (updates.wordCount !== undefined || updates.content !== undefined) {
    const chapter = await db.chapters.get(id);
    if (chapter) {
      await updateWritingWordCount(chapter.writingId, datasetId);
    }
  }

  logger.log('Chapter updated:', id);
  return result;
}

/**
 * Update chapter content (convenience function)
 * Extracts plain text and calculates word count
 *
 * @param {number} id - Chapter ID
 * @param {Object} content - TipTap JSON content
 * @param {string} contentHtml - HTML version
 * @param {string} contentPlainText - Plain text version
 * @param {string|null} [datasetId] - Dataset ID
 */
export async function updateChapterContent(id, content, contentHtml, contentPlainText, datasetId) {
  const wordCount = countWords(contentPlainText);

  await updateChapter(id, {
    content,
    contentHtml,
    contentPlainText,
    wordCount
  }, datasetId);
}

/**
 * Delete a chapter and reorder remaining chapters
 * @param {number} id - Chapter ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Deletion info
 */
export async function deleteChapter(id, datasetId) {
  const db = getDatabase(datasetId);

  // Get the chapter to find its writing and order
  const chapter = await db.chapters.get(id);
  if (!chapter) return { deleted: false };

  const writingId = chapter.writingId;
  const deletedOrder = chapter.order;

  // Collect ids before deleting: the caller needs them to remove the cloud
  // copies, which otherwise survive and come back on the next download.
  const links = await db.writingLinks.where('chapterId').equals(id).toArray();
  const linkIds = links.map(l => l.id);

  // Delete writing links for this chapter
  const linksDeleted = await db.writingLinks.where('chapterId').equals(id).delete();

  // Delete the chapter
  await db.chapters.delete(id);

  // Reorder remaining chapters
  const remaining = await db.chapters
    .where('writingId')
    .equals(writingId)
    .and(c => c.order > deletedOrder)
    .toArray();

  for (const c of remaining) {
    await db.chapters.update(c.id, { order: c.order - 1 });
  }

  // Update writing word count
  await updateWritingWordCount(writingId, datasetId);

  logger.log('Chapter deleted:', id, { linksDeleted });
  // `reorderedChapterIds` are the surviving chapters whose `order` shifted down.
  // They are updates, not cascade deletes, and the caller must sync them or the
  // cloud keeps the old ordering and restores it on the next download.
  return { deleted: true, linksDeleted, linkIds, reorderedChapterIds: remaining.map(c => c.id) };
}

/**
 * Restore a chapter (for cloud sync)
 * @param {Object} data - Full chapter data including id
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<number>} Chapter ID
 */
export async function restoreChapter(data, datasetId) {
  const db = getDatabase(datasetId);
  const id = await db.chapters.put({
    ...data,
    id: parseInt(data.id) || data.id
  });
  logger.log('Chapter restored:', id);
  return id;
}

/**
 * Reorder chapters
 *
 * Takes a trailing userId and syncs. These functions had no callers, so the
 * missing sync was never hit — but wiring them to the UI without it would mean
 * every reorder silently reverted on the next cloud download.
 *
 * @param {number} writingId - Writing ID
 * @param {number[]} chapterIds - Array of chapter IDs in new order
 * @param {string|null} [datasetId] - Dataset ID
 * @param {string} [userId] - For cloud sync
 */
export async function reorderChapters(writingId, chapterIds, datasetId, userId = null) {
  const db = getDatabase(datasetId);

  for (let i = 0; i < chapterIds.length; i++) {
    await db.chapters.update(chapterIds[i], { order: i + 1 });
  }

  await syncChapterOrders(chapterIds.map((id, i) => ({ id, order: i + 1 })), datasetId, userId);

  logger.log('Chapters reordered for writing:', writingId);
}

/**
 * Push a batch of {id, order} changes to the cloud.
 *
 * Sync failures are logged, never thrown — a reorder that saved locally must not
 * report failure to the user because the network was down.
 */
async function syncChapterOrders(changes, datasetId, userId) {
  if (!userId || changes.length === 0) return;

  const { syncUpdateChapter } = await import('./dataSyncService.js');
  for (const { id, order } of changes) {
    try {
      await syncUpdateChapter(userId, datasetId, id, { order });
    } catch (syncError) {
      logger.error('☁️ Failed to sync chapter order:', syncError);
    }
  }
}

/**
 * Move a chapter to a new position
 * @param {number} chapterId - Chapter ID
 * @param {number} newOrder - New position (1-based)
 * @param {string|null} [datasetId] - Dataset ID
 * @param {string} [userId] - For cloud sync
 */
export async function moveChapter(chapterId, newOrder, datasetId, userId = null) {
  const db = getDatabase(datasetId);

  const chapter = await db.chapters.get(chapterId);
  if (!chapter) return;

  const oldOrder = chapter.order;
  if (oldOrder === newOrder) return;

  const writingId = chapter.writingId;

  // Get all chapters for this writing
  const chapters = await db.chapters
    .where('writingId')
    .equals(writingId)
    .sortBy('order');

  // Track what actually changed so only those rows are synced.
  const changed = [];

  // Update orders
  if (newOrder > oldOrder) {
    // Moving down: decrement orders of chapters between old and new
    for (const c of chapters) {
      if (c.order > oldOrder && c.order <= newOrder) {
        await db.chapters.update(c.id, { order: c.order - 1 });
        changed.push({ id: c.id, order: c.order - 1 });
      }
    }
  } else {
    // Moving up: increment orders of chapters between new and old
    for (const c of chapters) {
      if (c.order >= newOrder && c.order < oldOrder) {
        await db.chapters.update(c.id, { order: c.order + 1 });
        changed.push({ id: c.id, order: c.order + 1 });
      }
    }
  }

  // Set the moved chapter's order
  await db.chapters.update(chapterId, { order: newOrder });
  changed.push({ id: chapterId, order: newOrder });

  await syncChapterOrders(changed, datasetId, userId);

  logger.log('Chapter moved:', chapterId, 'to position', newOrder);
}

/**
 * Get chapter count for a writing
 * @param {number} writingId - Writing ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<number>} Count
 */
export async function getChapterCount(writingId, datasetId) {
  const db = getDatabase(datasetId);
  return await db.chapters.where('writingId').equals(writingId).count();
}

/**
 * Count words in text
 * @param {string} text - Plain text
 * @returns {number} Word count
 */
export function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0).length;
}

/**
 * Get first chapter for a writing
 * @param {number} writingId - Writing ID
 * @param {string|null} [datasetId] - Dataset ID
 * @returns {Promise<Object|undefined>} First chapter
 */
export async function getFirstChapter(writingId, datasetId) {
  const db = getDatabase(datasetId);
  const chapters = await db.chapters
    .where('writingId')
    .equals(writingId)
    .sortBy('order');
  return chapters[0];
}

export default {
  CHAPTER_STATUSES,
  CHAPTER_STATUS_LABELS,
  createChapter,
  getChapter,
  getChaptersByWriting,
  getAllChapters,
  updateChapter,
  updateChapterContent,
  deleteChapter,
  restoreChapter,
  reorderChapters,
  moveChapter,
  getChapterCount,
  countWords,
  getFirstChapter
};
