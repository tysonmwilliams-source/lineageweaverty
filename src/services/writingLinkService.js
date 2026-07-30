/**
 * writingLinkService.js - Writing Link CRUD Operations
 *
 * Handles wiki-link references from writings to entities (People, Houses, Dignities, etc.)
 * These links are created when authors use [[wiki-links]] in their writing.
 */

import { getDatabase } from './database';
import { syncAddWritingLink, syncDeleteWritingLink } from './dataSyncService';
import { logger } from '../utils/logger';

// ==================== CONSTANTS ====================

export const LINK_TARGET_TYPES = {
  PERSON: 'person',
  HOUSE: 'house',
  CODEX_ENTRY: 'codexEntry',
  DIGNITY: 'dignity',
  HERALDRY: 'heraldry'
};

// ==================== CRUD OPERATIONS ====================

/**
 * Create a new writing link
 * @param {Object} data - Link data
 * @param {number} data.writingId - Writing ID
 * @param {number} data.chapterId - Chapter ID
 * @param {string} data.targetType - Type of linked entity
 * @param {number} data.targetId - ID of linked entity
 * @param {string} [data.displayText] - Display text used in [[wiki-link]]
 * @param {string} [data.context] - Surrounding text for context
 * @param {Object} [data.position] - Position in document { from, to }
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} New link ID
 */
export async function createWritingLink(data, datasetId) {
  const db = getDatabase(datasetId);

  const link = {
    writingId: data.writingId,
    chapterId: data.chapterId,
    targetType: data.targetType,
    targetId: data.targetId,
    displayText: data.displayText || '',
    context: data.context || '',
    position: data.position || null,
    createdAt: new Date().toISOString()
  };

  const linkId = await db.writingLinks.add(link);
  logger.log('Writing link created:', linkId);
  return linkId;
}

/**
 * Get a link by ID
 * @param {number} id - Link ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object|undefined>} Link data
 */
export async function getWritingLink(id, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writingLinks.get(id);
}

/**
 * Get all links for a writing
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of links
 */
export async function getLinksByWriting(writingId, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writingLinks.where('writingId').equals(writingId).toArray();
}

/**
 * Get all links for a chapter
 * @param {number} chapterId - Chapter ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of links
 */
export async function getLinksByChapter(chapterId, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writingLinks.where('chapterId').equals(chapterId).toArray();
}

/**
 * Get all links to a specific entity
 * (backlinks - find writings that reference an entity)
 * @param {string} targetType - Entity type
 * @param {number} targetId - Entity ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of links
 */
export async function getLinksByTarget(targetType, targetId, datasetId) {
  const db = getDatabase(datasetId);
  return await db.writingLinks
    .where('targetType')
    .equals(targetType)
    .and(link => link.targetId === targetId)
    .toArray();
}

/**
 * Get all links
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Array>} Array of links
 */
export async function getAllWritingLinks(datasetId) {
  const db = getDatabase(datasetId);
  return await db.writingLinks.toArray();
}

/**
 * Delete a link
 * @param {number} id - Link ID
 * @param {string} [datasetId] - Dataset ID
 */
export async function deleteWritingLink(id, datasetId) {
  const db = getDatabase(datasetId);
  await db.writingLinks.delete(id);
  logger.log('Writing link deleted:', id);
}

/**
 * Delete all links for a chapter
 * @param {number} chapterId - Chapter ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number deleted
 */
export async function deleteLinksByChapter(chapterId, datasetId) {
  const db = getDatabase(datasetId);
  const deleted = await db.writingLinks.where('chapterId').equals(chapterId).delete();
  logger.log('Deleted', deleted, 'links for chapter', chapterId);
  return deleted;
}

/**
 * Delete all links for a writing
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Number deleted
 */
export async function deleteLinksByWriting(writingId, datasetId) {
  const db = getDatabase(datasetId);
  const deleted = await db.writingLinks.where('writingId').equals(writingId).delete();
  logger.log('Deleted', deleted, 'links for writing', writingId);
  return deleted;
}

/**
 * Restore a link (for cloud sync)
 * @param {Object} data - Full link data including id
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<number>} Link ID
 */
export async function restoreWritingLink(data, datasetId) {
  const db = getDatabase(datasetId);
  const id = await db.writingLinks.put({
    ...data,
    id: parseInt(data.id) || data.id
  });
  logger.log('Writing link restored:', id);
  return id;
}

/**
 * Identity of a wiki-link within a chapter, ignoring volatile fields
 * (`context` and `position` shift whenever surrounding prose is edited).
 */
function linkSignature(link) {
  return `${link.targetType}|${link.targetId}|${link.displayText || ''}`;
}

/**
 * Sync links for a chapter based on parsed content.
 *
 * Diffs against what is already stored rather than deleting and recreating
 * everything: on a typical edit nothing changes, so this writes nothing. The
 * previous delete-all-then-recreate ran on every save and, with the cloud
 * calls below, would have multiplied Firestore writes by the link count.
 *
 * @param {number} chapterId - Chapter ID
 * @param {number} writingId - Writing ID
 * @param {Array} parsedLinks - Array of { targetType, targetId, displayText, context, position }
 * @param {string} [datasetId] - Dataset ID
 * @param {string} [userId] - Firebase uid; when present, changes are synced to the cloud
 */
export async function syncChapterLinks(chapterId, writingId, parsedLinks, datasetId, userId = null) {
  const existing = await getLinksByChapter(chapterId, datasetId);

  // Bucket existing rows by signature so repeated links to the same entity
  // are matched one-for-one rather than collapsed.
  const existingBySignature = new Map();
  for (const row of existing) {
    const sig = linkSignature(row);
    if (!existingBySignature.has(sig)) existingBySignature.set(sig, []);
    existingBySignature.get(sig).push(row);
  }

  const toAdd = [];
  for (const link of parsedLinks) {
    const bucket = existingBySignature.get(linkSignature(link));
    if (bucket && bucket.length > 0) {
      // Retained. `context`/`position` may be marginally stale until the link
      // itself changes; that is invisible in the sidebar snippet and saves a
      // write on every save of every chapter.
      bucket.shift();
    } else {
      toAdd.push(link);
    }
  }

  // Whatever is left unmatched is no longer present in the prose.
  const toDelete = Array.from(existingBySignature.values()).flat();

  for (const row of toDelete) {
    await deleteWritingLink(row.id, datasetId);
    if (userId) await syncDeleteWritingLink(userId, datasetId, row.id);
  }

  for (const link of toAdd) {
    const linkData = { writingId, chapterId, ...link };
    const newId = await createWritingLink(linkData, datasetId);
    if (userId) await syncAddWritingLink(userId, datasetId, newId, { ...linkData, id: newId });
  }

  if (import.meta.env.DEV && (toAdd.length || toDelete.length)) {
    logger.log(`Chapter ${chapterId} links: +${toAdd.length} -${toDelete.length}`);
  }
}

/**
 * Get unique entities referenced in a writing
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Object grouped by entity type
 */
export async function getReferencedEntities(writingId, datasetId) {
  const links = await getLinksByWriting(writingId, datasetId);

  const entities = {};
  for (const link of links) {
    if (!entities[link.targetType]) {
      entities[link.targetType] = new Set();
    }
    entities[link.targetType].add(link.targetId);
  }

  // Convert Sets to Arrays
  for (const type in entities) {
    entities[type] = Array.from(entities[type]);
  }

  return entities;
}

/**
 * Get link count by entity type for a writing
 * @param {number} writingId - Writing ID
 * @param {string} [datasetId] - Dataset ID
 * @returns {Promise<Object>} Counts by type
 */
export async function getLinkCountsByType(writingId, datasetId) {
  const links = await getLinksByWriting(writingId, datasetId);

  const counts = {};
  for (const link of links) {
    counts[link.targetType] = (counts[link.targetType] || 0) + 1;
  }

  return counts;
}

/**
 * Extract wiki-links from TipTap JSON content
 * Recursively walks the document tree to find wikiLink nodes
 *
 * @param {Object} content - TipTap JSON content
 * @returns {Array} Array of { targetType, targetId, displayText }
 */
export function extractWikiLinksFromContent(content) {
  const links = [];

  function walkNode(node) {
    if (!node) return;

    // Check if this is a wikiLink node
    if (node.type === 'wikiLink' && node.attrs) {
      const { id, type, label } = node.attrs;
      if (id && type) {
        links.push({
          targetType: type,
          targetId: parseInt(id),
          displayText: label || ''
        });
      }
    }

    // Recursively walk children
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        walkNode(child);
      }
    }
  }

  walkNode(content);
  return links;
}

export default {
  LINK_TARGET_TYPES,
  createWritingLink,
  getWritingLink,
  getLinksByWriting,
  getLinksByChapter,
  getLinksByTarget,
  getAllWritingLinks,
  deleteWritingLink,
  deleteLinksByChapter,
  deleteLinksByWriting,
  restoreWritingLink,
  syncChapterLinks,
  getReferencedEntities,
  getLinkCountsByType,
  extractWikiLinksFromContent
};
