/**
 * The sync manifest — one declaration of what syncs, and where.
 *
 * Step 1 of the sync-layer refactor designed in
 * `docs/audits/2026-07-30-full-audit/sections/02-data-sync.md`. **This step
 * lands the manifest and changes nothing else.** Nothing imports it yet except
 * its test. That is deliberate: it makes step 1 revertable by deletion, and it
 * means the assertions below start guarding the schema before any behaviour
 * depends on them.
 *
 * ## Why this file exists
 *
 * The same list of entities is currently written out by hand in four places —
 * `firestoreService.js`, `datasetService.js`, `migrationService.js` and
 * `database.ts` — and **the four lists disagree**, holding 23, 23, 13 and 20
 * entries. That divergence is not a tidiness problem, it is the direct cause of
 * three live bugs: `acknowledgedDuplicates` and `bugs` are cleared on download
 * but never restored, and `dignityTenures`, `dignityLinks` and `heraldryLinks`
 * are queued for replay by a path that cannot replay them.
 *
 * A list that exists once cannot disagree with itself.
 *
 * ## What is deliberately *not* here yet
 *
 * The design also calls for `localGetAll`, `restore` and executable cascade
 * handlers on each entry. Those are function references, and adding them now
 * would make this module import most of the service layer — a dependency hub
 * with no consumer, and a circular-import risk, in a step whose whole value is
 * that it changes nothing. They arrive in steps 3–5, where something actually
 * calls them. What is here is the part that is pure data.
 */

/** The operations an entity supports. Four link types are add/delete only. */
export type SyncOperation = 'add' | 'update' | 'delete';

export interface SyncEntity {
  /**
   * The key written into `syncQueue.entityType`, and the key this map is
   * keyed by. **Singular**, and not derivable from the table name: `person` →
   * `people`, `dignity` → `dignities`, and `heraldry` → `heraldry`. Every
   * mapping below is spelled out rather than pluralised by rule, because a
   * pluralisation helper that is right nineteen times and wrong once produces
   * a silent write to the wrong collection.
   */
  entityType: string;
  /** The Dexie table. Asserted to exist by `syncManifest.test.js`. */
  table: string;
  /**
   * The Firestore subcollection under
   * `users/{userId}/datasets/{datasetId}/`. Asserted to have a matching
   * `match` block in `firestore.rules`.
   *
   * Currently always equal to `table`. Kept as a separate field because they
   * are separate things — one is a local store, one is a remote path — and
   * collapsing them would make a future rename of either look safe.
   */
  collection: string;
  /** Which operations have a sync wrapper today. */
  ops: readonly SyncOperation[];
}

/**
 * Every entity that syncs to the cloud, keyed by `entityType`.
 *
 * Twenty entries, matching the twenty `entityType` values that
 * `dataSyncService.js` writes into the sync queue and the twenty collections
 * `firestoreService.js` reads and writes.
 */
export const ENTITIES = {
  // ---- Genealogy ----
  person: { entityType: 'person', table: 'people', collection: 'people', ops: ['add', 'update', 'delete'] },
  house: { entityType: 'house', table: 'houses', collection: 'houses', ops: ['add', 'update', 'delete'] },
  relationship: { entityType: 'relationship', table: 'relationships', collection: 'relationships', ops: ['add', 'update', 'delete'] },

  // ---- The Codex ----
  codexEntry: { entityType: 'codexEntry', table: 'codexEntries', collection: 'codexEntries', ops: ['add', 'update', 'delete'] },
  // No update: a link is created or removed, never edited in place.
  codexLink: { entityType: 'codexLink', table: 'codexLinks', collection: 'codexLinks', ops: ['add', 'delete'] },

  // ---- The Armory ----
  heraldry: { entityType: 'heraldry', table: 'heraldry', collection: 'heraldry', ops: ['add', 'update', 'delete'] },
  heraldryLink: { entityType: 'heraldryLink', table: 'heraldryLinks', collection: 'heraldryLinks', ops: ['add', 'delete'] },

  // ---- Dignities ----
  dignity: { entityType: 'dignity', table: 'dignities', collection: 'dignities', ops: ['add', 'update', 'delete'] },
  dignityTenure: { entityType: 'dignityTenure', table: 'dignityTenures', collection: 'dignityTenures', ops: ['add', 'update', 'delete'] },
  dignityLink: { entityType: 'dignityLink', table: 'dignityLinks', collection: 'dignityLinks', ops: ['add', 'delete'] },

  // ---- Households ----
  householdRole: { entityType: 'householdRole', table: 'householdRoles', collection: 'householdRoles', ops: ['add', 'update', 'delete'] },

  // ---- Writing Studio ----
  writing: { entityType: 'writing', table: 'writings', collection: 'writings', ops: ['add', 'update', 'delete'] },
  chapter: { entityType: 'chapter', table: 'chapters', collection: 'chapters', ops: ['add', 'update', 'delete'] },
  writingLink: { entityType: 'writingLink', table: 'writingLinks', collection: 'writingLinks', ops: ['add', 'delete'] },

  // ---- Story Planner ----
  storyPlan: { entityType: 'storyPlan', table: 'storyPlans', collection: 'storyPlans', ops: ['add', 'update', 'delete'] },
  storyArc: { entityType: 'storyArc', table: 'storyArcs', collection: 'storyArcs', ops: ['add', 'update', 'delete'] },
  storyBeat: { entityType: 'storyBeat', table: 'storyBeats', collection: 'storyBeats', ops: ['add', 'update', 'delete'] },
  scenePlan: { entityType: 'scenePlan', table: 'scenePlans', collection: 'scenePlans', ops: ['add', 'update', 'delete'] },
  characterArc: { entityType: 'characterArc', table: 'characterArcs', collection: 'characterArcs', ops: ['add', 'update', 'delete'] },
  plotThread: { entityType: 'plotThread', table: 'plotThreads', collection: 'plotThreads', ops: ['add', 'update', 'delete'] }
} as const satisfies Record<string, SyncEntity>;

export type EntityType = keyof typeof ENTITIES;

/**
 * Dexie tables that deliberately never reach the cloud, and why.
 *
 * This list is what makes the manifest's coverage assertion *total*: every
 * table in the schema is either a synced entity above or named here. Adding a
 * table to `database.ts` without deciding which it is now fails a test, rather
 * than quietly becoming a store whose contents vanish on the next download —
 * which is the shape of the `acknowledgedDuplicates` and `bugs` bug.
 */
export const LOCAL_ONLY_TABLES: Readonly<Record<string, string>> = {
  syncQueue: 'Transient bookkeeping. Syncing the record of what needs syncing would be circular.',
  acknowledgedDuplicates: "The user's own judgement that two people are not duplicates. Local-only today; a candidate for syncing, but that is a decision, not an oversight.",
  bugs: 'The built-in bug tracker. Local-only, and not dataset-scoped either.',
  contextRegistry: 'Derived. contextService regenerates all three of these from the primary data.',
  contextFiles: 'Derived — see contextRegistry.',
  contextLog: 'Derived — see contextRegistry.'
};

/**
 * Collections that `firestore.rules` grants access to but nothing syncs.
 *
 * Both have rules blocks left over from an intent to sync them that was never
 * implemented. Recorded rather than removed: deleting a rules block is a
 * security-surface change and belongs in its own commit, and the *reason* the
 * blocks look orphaned is exactly what `LOCAL_ONLY_TABLES` documents above.
 */
export const RULES_WITHOUT_SYNC: readonly string[] = ['acknowledgedDuplicates', 'bugs'];

/**
 * Firestore paths that are structure rather than entities.
 *
 * `users`, `datasets` and `databases` are containers; `datasetsMetadata` is the
 * dataset list itself, managed by `datasetService` rather than by entity sync.
 */
export const STRUCTURAL_RULES_PATHS: readonly string[] = [
  'users',
  'datasets',
  'databases',
  'datasetsMetadata'
];

/** Look up an entity by the `entityType` string stored in the sync queue. */
export function getEntity(entityType: string): SyncEntity | undefined {
  return (ENTITIES as Record<string, SyncEntity>)[entityType];
}

/** Every entity that syncs, as an array. */
export function allEntities(): SyncEntity[] {
  return Object.values(ENTITIES as Record<string, SyncEntity>);
}

/**
 * Every synced Firestore collection name.
 *
 * This is the derivation that replaces the four hand-written collection lists
 * in step 2. It is exported now so that step's diff is a deletion.
 */
export function syncedCollections(): string[] {
  return allEntities().map((entity) => entity.collection);
}

/** Every Dexie table that participates in cloud sync. */
export function syncedTables(): string[] {
  return allEntities().map((entity) => entity.table);
}
