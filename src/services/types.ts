/**
 * Narrow record shapes shared across the service layer (decision F4).
 *
 * The rule from the beachhead applies here more than anywhere: **these are not
 * the Dexie schema.** A type that tried to mirror `database.js` would be a
 * second copy of a 26-table schema, maintained by hand, and the first thing to
 * drift. Each interface below lists only the fields the services that import it
 * actually read. Add a field when a converted file reads it, not in advance.
 *
 * `Person`, `House` and `Relationship` come from `utils/succession/types` so
 * there is one definition rather than two. Where a service needs a field the
 * succession rules do not care about, it is added by extension here — that
 * keeps the succession types honest about what succession reads.
 */
import type { Dexie, Table } from 'dexie';
import type {
  Person as SuccessionPerson,
  House as SuccessionHouse,
  Relationship,
  SuccessionRules
} from '../utils/succession/types';
import type { StoredComposition } from '../utils/heraldry/types';

export type { Relationship, SuccessionRules };

/**
 * A person, plus the fields the services read that succession does not.
 *
 * The extra fields live here rather than in `utils/succession/types` on
 * purpose: that module's types are meant to say what the *succession rules*
 * read, and adding a Codex link or a rename timestamp to them would make them
 * lie about that.
 */
export interface Person extends SuccessionPerson {
  maidenName?: string | null;
  /** The Codex article about this person, if one exists. */
  codexEntryId?: number | null;
  /** Personal allegiance, used by bastard-elevation cadet branches. */
  swornToHouseId?: number | null;
  created?: string;
  updated?: string;
}

export type PersonInput = Omit<Person, 'id'> & { id?: number };

/** A house, plus the fields the services read that succession does not. */
export interface House extends SuccessionHouse {
  /** The coat of arms borne by this house, if one has been drawn. */
  heraldryId?: number | null;
  sigil?: string | null;
  motto?: string | null;
  foundedDate?: string | number | null;
  colorCode?: string | null;
  notes?: string | null;
  /** 'main' | 'cadet' */
  houseType?: string;
  /** 1 for a noble cadet branch, 2 for a bastard elevation. */
  cadetTier?: number;
  /** 'noble' | 'bastard-elevation' */
  foundingType?: string;
  foundedBy?: number | null;
  /** The house this one is sworn to. Distinct from `parentHouseId`, which is descent. */
  swornTo?: number | null;
  /** Name stem a cadet branch inherits, e.g. "Dun-". */
  namePrefix?: string | null;
  codexEntryId?: number | null;
  created?: string;
  updated?: string;
}

export type HouseInput = Omit<House, 'id'> & { id?: number };

export type RelationshipInput = Omit<Relationship, 'id'> & { id?: number };

/** A stored coat of arms. */
export interface HeraldryRecord {
  id: number;
  name?: string;
  /**
   * Versioned — v1/v2 flat, v3 recursive. Absent on uploaded and generated
   * arms, which carry imagery and were never built in the creator.
   */
  composition?: StoredComposition | null;
}

/**
 * A Codex entry.
 *
 * `id` is required here and absent from `CodexEntryInput` below, which is the
 * distinction Dexie's third type parameter exists for: a row that came *out* of
 * the database always has a key, and a row going *in* usually must not. Getting
 * this wrong is what forces `link.id!` on every `bulkDelete`.
 */
export interface CodexEntry {
  id: number;
  /** 'personage' | 'house' | 'location' | 'event' | 'mysteria' | 'heraldry' | 'custom' — stored free-form. */
  type: string;
  title: string;
  subtitle?: string | null;
  /** Markdown, with `[[wiki-links]]`. */
  content: string;
  sections?: unknown[];
  category?: string | null;
  tags?: string[];
  era?: string | null;
  /** Links out to the other subsystems. Null when this entry stands alone. */
  personId?: number | null;
  houseId?: number | null;
  heraldryId?: number | null;
  dignityId?: number | null;
  created?: string;
  updated?: string;
  wordCount?: number;
  version?: number;
  changelog?: unknown[];
  /** Set by the mysteria migration tool to take an entry out of its list. */
  skipMigration?: boolean;
}

/** A Codex entry on its way in, before Dexie assigns a key. */
export type CodexEntryInput = Omit<CodexEntry, 'id'> & { id?: number };

/** A link between two Codex entries. */
export interface CodexLink {
  id: number;
  sourceId: number;
  targetId: number;
  /** 'wiki-reference' is derived from prose and is the only type reconciliation prunes. */
  type: string;
  label?: string | null;
  bidirectional?: boolean;
}

export type CodexLinkInput = Omit<CodexLink, 'id'> & { id?: number };

/**
 * The dignity reference-data maps.
 *
 * Only the maps that get indexed by a *runtime* string are typed as `Record`s.
 * The rest keep their inferred literal keys, which is strictly more useful to a
 * consumer — widening a constant that is only ever read by a known key would
 * throw away type information for nothing.
 */
export interface DignityClassDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconName: string;
}

export interface DignityRankDefinition {
  id: string;
  name: string;
  description: string;
  order: number;
}

export interface DignityNatureDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  hasSuccession: boolean;
  hasTenureHistory: boolean;
  hasGrantTracking: boolean;
  examples: string;
}

export interface DisplayIconDefinition {
  id: string;
  icon: string;
  name: string;
}

/** One entry of `SUCCESSION_TYPES` — how a dignity passes to the next holder. */
export interface SuccessionTypeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** False for elective, appointment, conquest and custom: no line to compute. */
  autoCalculate: boolean;
}

/**
 * `SUCCESSION_TYPES`, keyed by stored succession type.
 *
 * Deliberately a `Record<string, …>` rather than the seven literal keys,
 * because the key comes off a stored dignity record and can be anything —
 * including **absent**, which is what the Crown turned out to be (decision D4).
 * With `noUncheckedIndexedAccess` on, a lookup is therefore
 * `SuccessionTypeDefinition | undefined`, which is exactly what every caller's
 * `type?.autoCalculate` already assumes.
 */
export type SuccessionTypeMap = Record<string, SuccessionTypeDefinition>;

/**
 * A contested claim on a dignity, stored inline on the dignity record.
 *
 * The id is a generated string, not a database key — disputes live in an array
 * on their dignity rather than in a table of their own.
 */
export interface Dispute {
  id: string;
  claimantId?: number | null;
  claimType?: string;
  claimStrength?: string;
  claimBasis?: string;
  supportingFactions?: string[];
  startDate?: string | null;
  resolvedDate?: string | null;
  /** 'ongoing' until resolved; anything else is a value from DISPUTE_RESOLUTIONS. */
  resolution?: string;
  notes?: string | null;
  created?: string;
}

/** A period between holders, stored inline on the dignity record. */
export interface Interregnum {
  startDate?: string | null;
  regentId?: number | null;
  regentTitle?: string;
  /** A key of INTERREGNUM_REASONS. */
  reason?: string;
  notes?: string | null;
}

/**
 * A dignity — a title, office, rank or honour.
 *
 * Wider than the other records in this file, and deliberately so: unlike
 * `Person` or `House`, whose types describe only what one caller reads, this is
 * the entity `dignityService` itself owns, and that service reads and writes
 * essentially every field. Narrowing it here would just mean writing it out
 * again inside the service.
 */
export interface DignityRecord {
  id: number;
  name?: string;
  shortName?: string | null;
  /** 'driht' | 'ward' | 'sir' | 'crown' | 'other' */
  dignityClass?: string;
  /** Class-specific — see DIGNITY_RANKS. */
  dignityRank?: string | null;
  /** Article IV styling: 'of', 'in', 'at'… */
  tenureType?: string;
  placeName?: string | null;
  /** The seat lives on the dignity, not on the house. */
  seatName?: string | null;
  codexLocationId?: number | null;
  /** The superior dignity this one is sworn to (Article V). */
  swornToId?: number | null;
  fealtyType?: string;
  currentHolderId?: number | null;
  currentHouseId?: number | null;
  isVacant?: boolean;
  /** 'territorial' | 'office' | 'personal-honour' | 'courtesy' — governs which features apply. */
  dignityNature?: string;
  isHereditary?: boolean;
  grantedById?: number | null;
  grantedByDignityId?: number | null;
  grantDate?: string | null;
  /** A key into `SUCCESSION_TYPES`. Absent on records that predate the field. */
  successionType?: string;
  successionRules?: SuccessionRules;
  /** Used only by succession types that do not auto-calculate. */
  designatedHeirId?: number | null;
  successionStatus?: string;
  disputes?: Dispute[];
  interregnum?: Interregnum | null;
  codexEntryId?: number | null;
  displayIcon?: string | null;
  displayPriority?: number;
  notes?: string | null;
  created?: string;
  updated?: string;
}

export type DignityInput = Omit<DignityRecord, 'id'> & { id?: number };

/** One period in which a person held a dignity. */
export interface DignityTenure {
  id: number;
  dignityId: number;
  personId: number;
  dateStarted?: string | null;
  /** Null means this is the tenure still running. */
  dateEnded?: string | null;
  acquisitionType?: string;
  endType?: string | null;
  grantedById?: number | null;
  witnessedByIds?: number[] | null;
  recordReference?: string | null;
  notes?: string | null;
  created?: string;
}

export type DignityTenureInput = Omit<DignityTenure, 'id'> & { id?: number };

/** Junction row tying a dignity to a house, location, event or faction. */
export interface DignityLink {
  id: number;
  dignityId: number;
  /** 'house' | 'location' | 'event' | 'faction' */
  entityType: string;
  entityId: number;
  /** 'primary' | 'secondary' | 'historical' | 'claimant' | 'pretender' */
  linkType?: string;
  notes?: string | null;
  created?: string;
}

export type DignityLinkInput = Omit<DignityLink, 'id'> & { id?: number };

/**
 * One pending change in the local sync queue.
 *
 * `entityId` is a **string** even for numeric ids — `addToSyncQueue` calls
 * `String()` on the way in, and `markEntitySynced` compares with `String()` on
 * the way out. Typing it as a number would compile and never match.
 */
export interface SyncQueueEntry {
  id: number;
  entityType: string;
  entityId: string;
  /** 'add' | 'update' | 'delete' */
  operation: string;
  data?: unknown;
  timestamp: number;
  /** 0 = pending, 1 = synced. Not a boolean: Dexie cannot index booleans. */
  synced: 0 | 1;
}

export type SyncQueueEntryInput = Omit<SyncQueueEntry, 'id'> & { id?: number };

/**
 * A report from the built-in bug tracker.
 *
 * Local-only and **not dataset-scoped** — the `bugs` table has no `datasetId`,
 * so reports are per-browser and shared across every world. `syncManifest`
 * declares it local-only for that reason. `BugContext` mirrors each row into
 * Firestore under `users/{uid}/bugs` by hand, on its own path.
 */
export interface Bug {
  id: number;
  title: string;
  description?: string | null;
  stepsToReproduce?: string | null;
  /** 'critical' | 'high' | 'medium' | 'low' */
  priority: string;
  /** 'open' | 'in-progress' | 'resolved' */
  status: string;
  /** Which subsystem, e.g. 'heraldry'. Defaults to 'general'. */
  system: string;
  /** Auto-captured at report time. */
  page?: string | null;
  browser?: string | null;
  viewport?: string | null;
  theme?: string | null;
  /** A data: URI. The only field that makes a report large. */
  screenshot?: string | null;
  notes?: string | null;
  created: string;
  updated: string;
  /** ISO timestamp, set when status becomes 'resolved'. */
  resolved?: string | null;
}

export type BugInput = Omit<Bug, 'id'> & { id?: number };

/** Counts for the bug tracker's summary bar. */
export interface BugStatistics {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  /** Keyed by subsystem, built at runtime, so any key is possible. */
  bySystem: Record<string, number>;
  withScreenshot: number;
  unresolvedCritical: number;
}

/** A pair of people the user has confirmed are not duplicates of each other. */
export interface AcknowledgedDuplicate {
  id: number;
  person1Id: number;
  person2Id: number;
  acknowledgedAt: string;
}

export type AcknowledgedDuplicateInput = Omit<AcknowledgedDuplicate, 'id'> & { id?: number };

/**
 * A table this file only clears, counts or copies wholesale.
 *
 * `deleteAllData`, `deleteGenealogyData` and the full backup touch nearly every
 * store in the schema without ever reading a field. Giving those tables real
 * row types would mean writing out the writing-studio and story-planner
 * entities here, in a file that has no other reason to know them — a second
 * copy of the schema, which is the drift the narrow-types rule exists to stop.
 * Each of these gets a real type when the service that owns it is converted.
 */
export type OpaqueTable = Table<Record<string, unknown>, number>;

/**
 * The Dexie instance, with the tables converted code reads.
 *
 * `database.js` builds a **bare `new Dexie(name)`** and adds its ~26 stores
 * dynamically through `applySchema`, so `db.people` does not exist on the
 * `Dexie` type and no converted service can read a table without this. It is
 * declared here rather than in a throwaway shim because item 7 of the F4 order
 * converts `database.js` itself, and this is the declaration that file will
 * use — typed once, early, in the place it permanently lives.
 *
 * **Only tables that converted code actually reads are listed.** Add one when a
 * conversion needs it. Listing all 26 up front would recreate the schema by
 * hand in a second file, which is the drift the beachhead's narrow-types rule
 * exists to prevent.
 */
export type AppDatabase = Dexie & {
  people: Table<Person, number, PersonInput>;
  houses: Table<House, number, HouseInput>;
  relationships: Table<Relationship, number, RelationshipInput>;
  heraldry: Table<HeraldryRecord, number>;
  codexEntries: Table<CodexEntry, number, CodexEntryInput>;
  codexLinks: Table<CodexLink, number, CodexLinkInput>;
  dignities: Table<DignityRecord, number, DignityInput>;
  dignityTenures: Table<DignityTenure, number, DignityTenureInput>;
  dignityLinks: Table<DignityLink, number, DignityLinkInput>;
  syncQueue: Table<SyncQueueEntry, number, SyncQueueEntryInput>;
  acknowledgedDuplicates: Table<AcknowledgedDuplicate, number, AcknowledgedDuplicateInput>;

  // Cleared and backed up here, never read field-by-field. See OpaqueTable.
  bugs: OpaqueTable;
  heraldryLinks: OpaqueTable;
  householdRoles: OpaqueTable;
  writings: OpaqueTable;
  chapters: OpaqueTable;
  writingLinks: OpaqueTable;
  storyPlans: OpaqueTable;
  storyArcs: OpaqueTable;
  storyBeats: OpaqueTable;
  scenePlans: OpaqueTable;
  characterArcs: OpaqueTable;
  plotThreads: OpaqueTable;
};

/** An identifier for the dataset (world) an operation runs against. */
export type DatasetId = string | null;

/**
 * A world: one dataset's metadata.
 *
 * Each has its own IndexedDB database (`LineageweaverDB_{id}`) and its own
 * Firestore subtree (`users/{uid}/datasets/{id}/…`), which is why `id` is
 * threaded through every data call rather than read from context at the point
 * of use — a component that reads the active dataset at render time and a write
 * that lands after a switch would disagree about where the row belongs.
 *
 * `createdAt`/`updatedAt` exist in Firestore but are `serverTimestamp()`
 * sentinels on write and `Timestamp` on read, and nothing in the app reads
 * them, so they are not named here.
 */
export interface Dataset {
  id: string;
  name: string;
  /** The dataset every account starts with. Cannot be deleted. */
  isDefault?: boolean;
}

/** A Firebase user id, or null when signed out — the guard on every cloud sync. */
export type UserId = string | null;
