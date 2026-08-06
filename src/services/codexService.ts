/**
 * Codex Service
 *
 * Handles all database operations for The Codex encyclopedia system.
 * Manages codex entries (character bios, locations, events, etc.) and their links.
 *
 * Converted under decision F4 (item 5 of the order in HANDOFF.md). Two notes on
 * how, because they are the conventions the rest of the service layer follows:
 *
 *   - `datasetId` is optional everywhere here rather than defaulted, because
 *     that is how the JavaScript behaved — every one of these functions took it
 *     as a bare positional and callers routinely omit it.
 *   - `parseInt` on a value that is sometimes already a number is typed with a
 *     cast rather than wrapped in `String(...)`. A cast has no runtime
 *     existence, so a conversion commit cannot change behaviour by accident.
 *     The one exception is called out where it happens.
 */

import { getDatabase } from './database';
import { logger } from '../utils/logger';
import { errorMessage } from '../utils/errorMessage';
import type {
  CodexEntry,
  CodexEntryInput,
  CodexLink,
  DatasetId,
  UserId
} from './types';

/** A new entry, before the database gives it an id. Type and title are required. */
export interface NewCodexEntry {
  /** 'personage', 'house', 'location', 'event', 'mysteria', 'custom' */
  type: string;
  title: string;
  subtitle?: string | null;
  /** Markdown text with [[wiki-links]] */
  content?: string;
  sections?: unknown[];
  category?: string | null;
  tags?: string[];
  era?: string | null;
  personId?: number | null;
  houseId?: number | null;
  heraldryId?: number | null;
  dignityId?: number | null;
}

/** An entry being restored from the cloud, which already knows its own id. */
export type RestoredCodexEntry = Partial<CodexEntry> & { id: number | string };

/** A link decorated with which way it points, for the backlinks panel. */
export interface DirectedCodexLink extends CodexLink {
  direction: 'incoming' | 'outgoing-bidirectional';
  /** The entry at the other end — whichever end that is for this direction. */
  referringEntryId: number;
}

export interface CodexStatistics {
  total: number;
  byType: Record<string, number>;
  totalWords: number;
  recentlyUpdated: Array<{ id: number; title: string; updated: string | undefined }>;
}

export interface MigrationOutcome {
  success: boolean;
  total: number;
  errors: Array<{ id: number; title?: string; error: string }>;
}

export interface MysteriaMigrationResult extends MigrationOutcome {
  migrated: number;
}

export interface SkipMigrationResult extends MigrationOutcome {
  marked: number;
}

type ContextNotifier = (
  entityType: string,
  operation: string,
  entity: unknown,
  datasetId?: DatasetId
) => void;

// Context notification - lazy loaded to avoid circular deps
let contextNotify: ContextNotifier | null = null;
async function notifyContextChange(
  entityType: string,
  operation: string,
  entity: unknown,
  datasetId?: DatasetId
): Promise<void> {
  try {
    if (!contextNotify) {
      const { notifyChange } = await import('./contextService.js');
      contextNotify = notifyChange;
    }
    contextNotify(entityType, operation, entity, datasetId);
  } catch {
    // Context service not available - silently skip
  }
}

// ==================== CODEX ENTRY OPERATIONS ====================

/**
 * Create a new codex entry
 * @returns ID of created entry
 */
export async function createEntry(
  entryData: NewCodexEntry,
  datasetId?: DatasetId
): Promise<number> {
  try {
    const db = getDatabase(datasetId);

    // Ensure required fields
    const entry: CodexEntryInput = {
      // Core identity
      type: entryData.type, // Required: 'personage', 'house', 'location', 'event', 'mysteria', 'custom'
      title: entryData.title, // Required
      subtitle: entryData.subtitle || null,

      // Content
      content: entryData.content || '', // Markdown text with [[wiki-links]]
      sections: entryData.sections || [], // Array of section objects

      // Organization
      category: entryData.category || null,
      tags: entryData.tags || [], // Array of strings
      era: entryData.era || null, // Time period

      // Links (for external references - personId, houseId, heraldryId, dignityId, etc.)
      personId: entryData.personId || null, // Link to Person entity
      houseId: entryData.houseId || null, // Link to House entity
      heraldryId: entryData.heraldryId || null, // Link to Heraldry entity (Phase 5)
      dignityId: entryData.dignityId || null, // Link to Dignity entity

      // Metadata
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      wordCount: calculateWordCount(entryData.content || ''),

      // Version control (future)
      version: 1,
      changelog: []
    };

    const id = await db.codexEntries.add(entry);
    logger.log('Codex entry created with ID:', id);

    // Notify context system of change
    notifyContextChange('codex', 'create', { ...entry, id }, datasetId);

    return id;
  } catch (error) {
    logger.error('Error creating codex entry:', error);
    throw error;
  }
}

/**
 * Restore a codex entry with a specific ID
 *
 * IMPORTANT: This is different from createEntry() because it uses .put()
 * which preserves the original ID instead of auto-generating a new one.
 *
 * Used during cloud sync to restore entries without creating duplicates.
 *
 * @returns The ID of the restored entry
 */
export async function restoreEntry(
  entryData: RestoredCodexEntry,
  datasetId?: DatasetId
): Promise<number> {
  try {
    const db = getDatabase(datasetId);

    // Build the entry object, preserving the original ID
    const entry: CodexEntryInput = {
      // CRITICAL: preserve original ID. The `|| entryData.id` fallback means a
      // non-numeric id stays exactly as it arrived rather than becoming NaN —
      // hence the cast on the result: the table is keyed by number, and this is
      // the one path that can put something else there. Typing it did not
      // create that hazard, only made it visible.
      //
      // `String(...)` rather than a cast because `entryData.id` is genuinely
      // `number | string` and TypeScript will not pretend otherwise. It is the
      // same call at runtime: `parseInt` stringifies its argument anyway.
      id: (parseInt(String(entryData.id)) || entryData.id) as number,

      // Core identity
      type: entryData.type as string,
      title: entryData.title as string,
      subtitle: entryData.subtitle || null,

      // Content
      content: entryData.content || '',
      sections: entryData.sections || [],

      // Organization
      category: entryData.category || null,
      tags: entryData.tags || [],
      era: entryData.era || null,

      // Links
      personId: entryData.personId || null,
      houseId: entryData.houseId || null,
      heraldryId: entryData.heraldryId || null,
      dignityId: entryData.dignityId || null,

      // Metadata - preserve original timestamps if available
      created: entryData.created || new Date().toISOString(),
      updated: entryData.updated || new Date().toISOString(),
      wordCount: entryData.wordCount || calculateWordCount(entryData.content || ''),

      // Version control
      version: entryData.version || 1,
      changelog: entryData.changelog || []
    };

    // Use .put() which creates OR updates based on the key
    // This prevents duplicates by using the original ID
    const id = await db.codexEntries.put(entry);
    logger.log('Codex entry restored with ID:', id);
    return id;
  } catch (error) {
    logger.error('Error restoring codex entry:', error);
    throw error;
  }
}

/**
 * Get a single codex entry by ID
 */
export async function getEntry(
  id: number,
  datasetId?: DatasetId
): Promise<CodexEntry | undefined> {
  try {
    const db = getDatabase(datasetId);
    const entry = await db.codexEntries.get(id);
    return entry;
  } catch (error) {
    logger.error('Error getting codex entry:', error);
    throw error;
  }
}

/**
 * Get a codex entry by personId
 *
 * TREE-CODEX INTEGRATION: Used to find the Codex entry for a person
 * when navigating from the Family Tree or Data Management.
 */
export async function getEntryByPersonId(
  personId: number | null | undefined,
  datasetId?: DatasetId
): Promise<CodexEntry | null> {
  try {
    if (personId === null || personId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // personId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('personId').equals(personId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by personId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by houseId
 *
 * HOUSE-CODEX INTEGRATION: Used to find the Codex entry for a house
 * when navigating from Data Management or for cascade delete.
 */
export async function getEntryByHouseId(
  houseId: number | null | undefined,
  datasetId?: DatasetId
): Promise<CodexEntry | null> {
  try {
    if (houseId === null || houseId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // houseId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('houseId').equals(houseId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by houseId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by dignityId
 *
 * DIGNITY-CODEX INTEGRATION: Used to find the Codex entry for a dignity
 * when navigating from the Dignities system or for cascade delete.
 */
export async function getEntryByDignityId(
  dignityId: number | null | undefined,
  datasetId?: DatasetId
): Promise<CodexEntry | null> {
  try {
    if (dignityId === null || dignityId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // dignityId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('dignityId').equals(dignityId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by dignityId:', error);
    throw error;
  }
}

/**
 * Get a codex entry by heraldryId
 *
 * PHASE 5 - CODEX-HERALDRY INTEGRATION: Used to find the Codex entry
 * for a heraldry record when navigating from The Armory.
 */
export async function getEntryByHeraldryId(
  heraldryId: number | null | undefined,
  datasetId?: DatasetId
): Promise<CodexEntry | null> {
  try {
    if (heraldryId === null || heraldryId === undefined) return null;
    const db = getDatabase(datasetId);
    // Indexed since schema v18 — this was a full-table .filter() scan.
    // Dexie throws on .equals(null), hence the guard above; rows with a null
    // heraldryId are simply absent from the index, which is what we want.
    const entry = await db.codexEntries.where('heraldryId').equals(heraldryId).first();
    return entry || null;
  } catch (error) {
    logger.error('Error getting codex entry by heraldryId:', error);
    throw error;
  }
}

/**
 * Get all codex entries
 */
export async function getAllEntries(datasetId?: DatasetId): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting all codex entries:', error);
    throw error;
  }
}

/**
 * Get count of codex entries without loading all data
 * More efficient than getAllEntries().length for stats
 */
export async function getEntriesCount(datasetId?: DatasetId): Promise<number> {
  try {
    const db = getDatabase(datasetId);
    return await db.codexEntries.count();
  } catch (error) {
    logger.error('Error getting codex entries count:', error);
    return 0;
  }
}

/**
 * Get entries by type
 * @param type - Entry type (personage, house, location, event, mysteria, custom, or 'all')
 */
export async function getEntriesByType(
  type: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    // Handle 'all' type to return all entries
    if (type === 'all') {
      return await db.codexEntries.toArray();
    }
    const entries = await db.codexEntries.where('type').equals(type).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by type:', error);
    throw error;
  }
}

/**
 * Get entries by category
 */
export async function getEntriesByCategory(
  category: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.where('category').equals(category).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by category:', error);
    throw error;
  }
}

/**
 * Get entries by era
 */
export async function getEntriesByEra(
  era: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries.where('era').equals(era).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by era:', error);
    throw error;
  }
}

/**
 * Get entries by tag
 */
export async function getEntriesByTag(
  tag: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    // Dexie's multi-entry index (the * prefix) allows this
    const entries = await db.codexEntries.where('tags').equals(tag).toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting entries by tag:', error);
    throw error;
  }
}

/**
 * Search entries by title (case-insensitive)
 */
export async function searchEntriesByTitle(
  searchTerm: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const allEntries = await db.codexEntries.toArray();
    const searchLower = searchTerm.toLowerCase();

    return allEntries.filter(entry =>
      entry.title.toLowerCase().includes(searchLower)
    );
  } catch (error) {
    logger.error('Error searching entries:', error);
    throw error;
  }
}

/**
 * Full-text search across all entry content
 */
export async function searchEntriesFullText(
  searchTerm: string,
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const allEntries = await db.codexEntries.toArray();
    const searchLower = searchTerm.toLowerCase();

    return allEntries.filter(entry => {
      const titleMatch = entry.title.toLowerCase().includes(searchLower);
      const subtitleMatch = entry.subtitle?.toLowerCase().includes(searchLower);
      const contentMatch = entry.content.toLowerCase().includes(searchLower);

      return titleMatch || subtitleMatch || contentMatch;
    });
  } catch (error) {
    logger.error('Error in full-text search:', error);
    throw error;
  }
}

/**
 * Update an existing codex entry
 */
export async function updateEntry(
  id: number,
  updates: Partial<CodexEntry>,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<number> {
  try {
    const db = getDatabase(datasetId);
    // Always update the 'updated' timestamp and recalculate word count
    const modifiedUpdates: Partial<CodexEntry> = {
      ...updates,
      updated: new Date().toISOString()
    };

    if (updates.content !== undefined) {
      modifiedUpdates.wordCount = calculateWordCount(updates.content);
    }

    const result = await db.codexEntries.update(id, modifiedUpdates);
    logger.log('Codex entry updated:', result);

    // Drop links to targets the content no longer mentions. Content is
    // authoritative at save time; see reconcileWikiLinks.
    if (updates.content !== undefined) {
      await reconcileWikiLinks(id, updates.content, datasetId, userId);
    }

    // Notify context system of change
    const updatedEntry = await db.codexEntries.get(id);
    notifyContextChange('codex', 'update', updatedEntry, datasetId);

    return result;
  } catch (error) {
    logger.error('Error updating codex entry:', error);
    throw error;
  }
}

/**
 * Delete a codex entry
 */
export async function deleteEntry(
  id: number,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<void> {
  try {
    const db = getDatabase(datasetId);

    // Get entry before deleting for context notification
    const entry = await db.codexEntries.get(id);

    // Delete the entry
    await db.codexEntries.delete(id);

    // Delete all links associated with this entry
    await deleteLinksForEntry(id, datasetId, userId);

    logger.log('Codex entry deleted:', id);

    // Propagate to the cloud. Without this the entry was restored on the next
    // download — which made the Codex cleanup tool actively counter-productive,
    // since the duplicates it removed always came back.
    if (userId) {
      const { syncDeleteCodexEntry } = await import('./dataSyncService.js');
      try {
        await syncDeleteCodexEntry(userId, datasetId, id);
      } catch (syncError) {
        logger.error('☁️ Failed to sync codex entry delete:', syncError);
      }
    }

    // Notify context system of change
    if (entry) {
      notifyContextChange('codex', 'delete', entry, datasetId);
    }
  } catch (error) {
    logger.error('Error deleting codex entry:', error);
    throw error;
  }
}

// ==================== CODEX LINK OPERATIONS ====================

/**
 * Create a link between two entries
 */
export async function createLink(
  linkData: Partial<CodexLink> & { sourceId: number; targetId: number },
  datasetId?: DatasetId
): Promise<number> {
  try {
    const db = getDatabase(datasetId);
    const link = {
      sourceId: linkData.sourceId, // Entry ID that contains the link
      targetId: linkData.targetId, // Entry ID being linked to
      type: linkData.type || 'reference', // Type of relationship
      label: linkData.label || null, // Optional label for the link
      bidirectional: linkData.bidirectional !== undefined ? linkData.bidirectional : true
    };

    const id = await db.codexLinks.add(link);
    logger.log('Codex link created with ID:', id);
    return id;
  } catch (error) {
    logger.error('Error creating codex link:', error);
    throw error;
  }
}

/**
 * Reconcile an entry's outgoing wiki-links against what its content actually says.
 *
 * parseWikiLinks() creates links additively as a side effect of *rendering* an
 * entry, and nothing ever removed them. Delete a `[[Riverhead]]` from a paragraph
 * and the link row survives, so Riverhead keeps listing that entry as a backlink
 * forever — a reference to a sentence that no longer exists.
 *
 * Called on save, where the content is authoritative. Only 'wiki-reference'
 * links are touched: links created deliberately through the UI are not derived
 * from prose and must not be pruned by editing it.
 *
 * @param entryId - The entry whose content changed
 * @param content - The new content
 * @param userId - When present, deletions are propagated to the cloud
 * @returns How many stale links were removed
 */
export async function reconcileWikiLinks(
  entryId: number,
  content: string,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<number> {
  try {
    const db = getDatabase(datasetId);

    // Resolve the targets the content currently names, the same way the renderer
    // does: case-insensitive on title, honouring [[Display|Actual]] aliases.
    const targets = new Set<string>();
    for (const match of String(content || '').matchAll(/\[\[([^\]]+)\]\]/g)) {
      const text = match[1]?.trim();
      // `[^\]]+` guarantees a group, so this only skips `[[ ]]` — which
      // resolved to nothing before and resolves to nothing now.
      if (!text) continue;
      targets.add((text.includes('|') ? text.split('|')[1] ?? text : text).trim().toLowerCase());
    }

    const allEntries = await db.codexEntries.toArray();
    const idsByTitle = new Map(allEntries.map(e => [String(e.title).toLowerCase(), e.id]));
    const liveTargetIds = new Set(
      [...targets].map(t => idsByTitle.get(t)).filter(id => id !== undefined)
    );

    const outgoing = await db.codexLinks.where('sourceId').equals(entryId).toArray();
    const stale = outgoing.filter(
      link => link.type === 'wiki-reference' && !liveTargetIds.has(link.targetId)
    );

    if (stale.length === 0) return 0;

    await db.codexLinks.bulkDelete(stale.map(l => l.id));
    logger.log(`Pruned ${stale.length} stale wiki-link(s) from entry ${entryId}`);

    // A pruned link that never syncs comes back on the next cloud download.
    if (userId) {
      const { syncDeleteCodexLink } = await import('./dataSyncService.js');
      for (const link of stale) {
        try {
          await syncDeleteCodexLink(userId, datasetId, link.id);
        } catch (syncError) {
          logger.error('☁️ Failed to sync codex link delete:', syncError);
        }
      }
    }

    return stale.length;
  } catch (error) {
    // Never let link bookkeeping fail a save.
    logger.error('Error reconciling wiki-links:', error);
    return 0;
  }
}

/**
 * Get all outgoing links from an entry (links this entry makes to others)
 */
export async function getOutgoingLinks(
  entryId: number,
  datasetId?: DatasetId
): Promise<CodexLink[]> {
  try {
    const db = getDatabase(datasetId);
    const links = await db.codexLinks.where('sourceId').equals(entryId).toArray();
    return links;
  } catch (error) {
    logger.error('Error getting outgoing links:', error);
    throw error;
  }
}

/**
 * Get all incoming links to an entry (backlinks - other entries that mention this one)
 *
 * BIDIRECTIONAL SUPPORT: This function now returns both:
 * 1. Links where this entry is the TARGET (traditional backlinks)
 * 2. Links where this entry is the SOURCE AND the link is marked bidirectional
 *
 * This ensures that if Entry A links to Entry B with bidirectional=true,
 * BOTH entries will show each other in their backlinks panel.
 *
 * @returns Array of link objects with added `direction` property
 */
export async function getIncomingLinks(
  entryId: number,
  datasetId?: DatasetId
): Promise<DirectedCodexLink[]> {
  try {
    const db = getDatabase(datasetId);

    // 1. Traditional backlinks: links pointing TO this entry
    const incomingLinks = await db.codexLinks
      .where('targetId')
      .equals(entryId)
      .toArray();

    // Mark these as 'incoming' direction for context snippet handling
    const markedIncoming: DirectedCodexLink[] = incomingLinks.map(link => ({
      ...link,
      direction: 'incoming',
      // For incoming links, sourceId is the entry that references us
      referringEntryId: link.sourceId
    }));

    // 2. Bidirectional reverse links: links FROM this entry that are bidirectional
    const outgoingBidirectional = await db.codexLinks
      .where('sourceId')
      .equals(entryId)
      .filter(link => link.bidirectional === true)
      .toArray();

    // Mark these as 'outgoing-bidirectional' and swap the reference
    const markedOutgoing: DirectedCodexLink[] = outgoingBidirectional.map(link => ({
      ...link,
      direction: 'outgoing-bidirectional',
      // For bidirectional outgoing links, targetId is the entry we link to
      // but we want to show IT in OUR backlinks, so referringEntryId = targetId
      referringEntryId: link.targetId
    }));

    // 3. Combine and deduplicate (in case of circular references)
    const allLinks = [...markedIncoming, ...markedOutgoing];

    // Deduplicate by referringEntryId to avoid showing same entry twice
    const seen = new Set<number>();
    const deduplicated = allLinks.filter(link => {
      if (seen.has(link.referringEntryId)) {
        return false;
      }
      seen.add(link.referringEntryId);
      return true;
    });

    return deduplicated;
  } catch (error) {
    logger.error('Error getting incoming links:', error);
    throw error;
  }
}

/**
 * Get every codex link in the dataset.
 *
 * Every other table had a bulk reader; codexLinks only had the per-entry
 * getAllLinksForEntry, which is why the integrity check could not see dangling
 * links without N queries.
 */
export async function getAllLinks(datasetId?: DatasetId): Promise<CodexLink[]> {
  try {
    const db = getDatabase(datasetId);
    return await db.codexLinks.toArray();
  } catch (error) {
    logger.error('Error getting all codex links:', error);
    throw error;
  }
}

/**
 * Get all links for an entry (both incoming and outgoing)
 */
export async function getAllLinksForEntry(
  entryId: number,
  datasetId?: DatasetId
): Promise<{ outgoing: CodexLink[]; incoming: DirectedCodexLink[] }> {
  try {
    const [outgoing, incoming] = await Promise.all([
      getOutgoingLinks(entryId, datasetId),
      getIncomingLinks(entryId, datasetId)
    ]);

    return {
      outgoing,
      incoming
    };
  } catch (error) {
    logger.error('Error getting all links for entry:', error);
    throw error;
  }
}

/**
 * Delete all links associated with an entry
 */
export async function deleteLinksForEntry(
  entryId: number,
  datasetId?: DatasetId,
  userId: UserId = null
): Promise<void> {
  try {
    const db = getDatabase(datasetId);

    // Collect ids first so the cloud copies can be removed too — a bulk
    // .delete() drops them locally and leaves Firestore to restore them.
    const doomed = userId
      ? [
          ...await db.codexLinks.where('sourceId').equals(entryId).toArray(),
          ...await db.codexLinks.where('targetId').equals(entryId).toArray()
        ]
      : [];

    // Delete where this entry is the source
    await db.codexLinks.where('sourceId').equals(entryId).delete();

    // Delete where this entry is the target
    await db.codexLinks.where('targetId').equals(entryId).delete();

    if (userId && doomed.length > 0) {
      const { syncDeleteCodexLink } = await import('./dataSyncService.js');
      const seen = new Set<number>();
      for (const link of doomed) {
        if (seen.has(link.id)) continue;
        seen.add(link.id);
        try {
          await syncDeleteCodexLink(userId, datasetId, link.id);
        } catch (syncError) {
          logger.error('☁️ Failed to sync codex link delete:', syncError);
        }
      }
    }

    logger.log('All links deleted for entry:', entryId);
  } catch (error) {
    logger.error('Error deleting links for entry:', error);
    throw error;
  }
}

/**
 * Delete a specific link
 */
export async function deleteLink(linkId: number, datasetId?: DatasetId): Promise<void> {
  try {
    const db = getDatabase(datasetId);
    await db.codexLinks.delete(linkId);
    logger.log('Codex link deleted:', linkId);
  } catch (error) {
    logger.error('Error deleting codex link:', error);
    throw error;
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate word count from markdown content
 */
function calculateWordCount(content: string): number {
  if (!content) return 0;

  // Remove markdown syntax for more accurate count
  const cleanText = content
    .replace(/\[\[.*?\]\]/g, '') // Remove wiki links
    .replace(/[#*_`]/g, '') // Remove markdown formatting
    .trim();

  const words = cleanText.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Get entry statistics
 */
export async function getCodexStatistics(datasetId?: DatasetId): Promise<CodexStatistics> {
  try {
    const allEntries = await getAllEntries(datasetId);

    const stats: CodexStatistics = {
      total: allEntries.length,
      byType: {},
      totalWords: 0,
      recentlyUpdated: []
    };

    // Count by type
    allEntries.forEach(entry => {
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;
      stats.totalWords += entry.wordCount || 0;
    });

    // Get 5 most recently updated.
    //
    // `.getTime()` is the one place this conversion changed an expression:
    // `new Date(b.updated) - new Date(a.updated)` does not type-check, because
    // subtracting Dates only works through an implicit valueOf(). The result is
    // identical for every input, including the invalid dates an entry with no
    // `updated` produces — both spellings give NaN there.
    stats.recentlyUpdated = allEntries
      .sort((a, b) => new Date(b.updated ?? '').getTime() - new Date(a.updated ?? '').getTime())
      .slice(0, 5)
      .map(e => ({ id: e.id, title: e.title, updated: e.updated }));

    return stats;
  } catch (error) {
    logger.error('Error getting codex statistics:', error);
    throw error;
  }
}

/**
 * Migrate mysteria entries to the Heraldry & Titles section
 *
 * This moves all entries with type 'mysteria' to type 'heraldry'
 * with category 'titles', placing them in the Dignities & Titles subsection.
 */
export async function migrateMysteriaToDignities(
  datasetId?: DatasetId
): Promise<MysteriaMigrationResult> {
  try {
    const db = getDatabase(datasetId);

    // Get all mysteria entries
    const mysteriaEntries = await db.codexEntries
      .filter(entry => entry.type === 'mysteria')
      .toArray();

    let migratedCount = 0;
    const errors: MigrationOutcome['errors'] = [];

    for (const entry of mysteriaEntries) {
      try {
        // Update entry to be heraldry type with titles category
        await db.codexEntries.update(entry.id, {
          type: 'heraldry',
          category: 'titles',
          updated: new Date().toISOString()
        });
        migratedCount++;
      } catch (err) {
        errors.push({ id: entry.id, title: entry.title, error: errorMessage(err) });
      }
    }

    logger.log(`Migrated ${migratedCount} mysteria entries to Dignities & Titles`);

    return {
      success: errors.length === 0,
      total: mysteriaEntries.length,
      migrated: migratedCount,
      errors
    };
  } catch (error) {
    logger.error('Error migrating mysteria entries:', error);
    throw error;
  }
}

/**
 * Get count of mysteria entries that can be migrated
 * Excludes entries marked with skipMigration flag
 */
export async function getMysteriaMigrationCount(datasetId?: DatasetId): Promise<number> {
  try {
    const db = getDatabase(datasetId);
    const count = await db.codexEntries
      .filter(entry => entry.type === 'mysteria' && !entry.skipMigration)
      .count();
    return count;
  } catch (error) {
    logger.error('Error getting mysteria count:', error);
    return 0;
  }
}

/**
 * Get all mysteria entries that can be migrated
 * Excludes entries marked with skipMigration flag
 */
export async function getMysteriaMigrationEntries(
  datasetId?: DatasetId
): Promise<CodexEntry[]> {
  try {
    const db = getDatabase(datasetId);
    const entries = await db.codexEntries
      .filter(entry => entry.type === 'mysteria' && !entry.skipMigration)
      .toArray();
    return entries;
  } catch (error) {
    logger.error('Error getting mysteria entries:', error);
    return [];
  }
}

/**
 * Migrate selected mysteria entries to Dignities & Titles
 */
export async function migrateSelectedMysteria(
  entryIds: number[],
  datasetId?: DatasetId
): Promise<MysteriaMigrationResult> {
  try {
    const db = getDatabase(datasetId);

    let migratedCount = 0;
    const errors: MigrationOutcome['errors'] = [];

    for (const id of entryIds) {
      try {
        // Get entry to verify it exists and is mysteria type
        const entry = await db.codexEntries.get(id);
        if (!entry || entry.type !== 'mysteria') {
          errors.push({ id, title: entry?.title || 'Unknown', error: 'Entry not found or not mysteria type' });
          continue;
        }

        // Update entry to be heraldry type with titles category
        await db.codexEntries.update(id, {
          type: 'heraldry',
          category: 'titles',
          updated: new Date().toISOString()
        });
        migratedCount++;
      } catch (err) {
        errors.push({ id, title: 'Unknown', error: errorMessage(err) });
      }
    }

    logger.log(`Migrated ${migratedCount} selected mysteria entries to Dignities & Titles`);

    return {
      success: errors.length === 0,
      total: entryIds.length,
      migrated: migratedCount,
      errors
    };
  } catch (error) {
    logger.error('Error migrating selected mysteria entries:', error);
    throw error;
  }
}

/**
 * Mark mysteria entries to skip migration
 * These entries will no longer appear in the migration list
 */
export async function markMysteriaSkipMigration(
  entryIds: number[],
  datasetId?: DatasetId
): Promise<SkipMigrationResult> {
  try {
    const db = getDatabase(datasetId);

    let markedCount = 0;
    const errors: MigrationOutcome['errors'] = [];

    for (const id of entryIds) {
      try {
        await db.codexEntries.update(id, {
          skipMigration: true,
          updated: new Date().toISOString()
        });
        markedCount++;
      } catch (err) {
        errors.push({ id, error: errorMessage(err) });
      }
    }

    logger.log(`Marked ${markedCount} entries to skip migration`);

    return {
      success: errors.length === 0,
      total: entryIds.length,
      marked: markedCount,
      errors
    };
  } catch (error) {
    logger.error('Error marking entries to skip migration:', error);
    throw error;
  }
}

export default {
  // Entry operations
  createEntry,
  restoreEntry, // Used for cloud sync - preserves original IDs
  getEntry,
  getEntryByPersonId, // TREE-CODEX INTEGRATION
  getEntryByHouseId, // HOUSE-CODEX INTEGRATION
  getEntryByDignityId, // DIGNITY-CODEX INTEGRATION
  getEntryByHeraldryId, // PHASE 5 - CODEX-HERALDRY INTEGRATION
  getAllEntries,
  getEntriesByType,
  getEntriesByCategory,
  getEntriesByEra,
  getEntriesByTag,
  searchEntriesByTitle,
  searchEntriesFullText,
  updateEntry,
  deleteEntry,

  // Link operations
  createLink,
  getOutgoingLinks,
  getIncomingLinks,
  reconcileWikiLinks,
  getAllLinks,
  getAllLinksForEntry,
  deleteLinksForEntry,
  deleteLink,

  // Statistics
  getCodexStatistics,

  // Migration utilities
  migrateMysteriaToDignities,
  getMysteriaMigrationCount,
  getMysteriaMigrationEntries,
  migrateSelectedMysteria,
  markMysteriaSkipMigration
};
