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
export type Person = SuccessionPerson;

/** A house, plus the fields the services read that succession does not. */
export interface House extends SuccessionHouse {
  /** The coat of arms borne by this house, if one has been drawn. */
  heraldryId?: number | null;
}

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

/** A dignity, as the succession code reads it. */
export interface DignityRecord {
  id: number;
  name?: string;
  /** A key into `SUCCESSION_TYPES`. Absent on records that predate the field. */
  successionType?: string;
  currentHolderId?: number | null;
  /** Used only by succession types that do not auto-calculate. */
  designatedHeirId?: number | null;
  successionRules?: SuccessionRules;
}

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
  people: Table<Person, number>;
  houses: Table<House, number>;
  relationships: Table<Relationship, number>;
  heraldry: Table<HeraldryRecord, number>;
};

/** An identifier for the dataset (world) an operation runs against. */
export type DatasetId = string | null;

/** A Firebase user id, or null when signed out — the guard on every cloud sync. */
export type UserId = string | null;
