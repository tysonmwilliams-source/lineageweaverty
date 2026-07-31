/**
 * The shapes succession works with (decision F4, beachhead).
 *
 * These are deliberately narrow: they describe the fields the succession rules
 * actually read, not everything a person or a house record carries. A type that
 * claims to describe the whole Person record would be a second, drifting copy
 * of the Dexie schema — and the first thing to go stale.
 */

/** Year strings, because worldbuilding years are not Dates (see formatLongDate). */
export type WorldYear = string | number | null | undefined;

export interface Person {
  id: number;
  firstName?: string;
  lastName?: string;
  gender?: string;
  houseId?: number | null;
  dateOfBirth?: WorldYear;
  dateOfDeath?: WorldYear;
  legitimacyStatus?: 'legitimate' | 'bastard' | 'adopted' | 'unknown' | string;
  bastardStatus?: string | null;
}

export interface House {
  id: number;
  houseName?: string;
  /** Set when this house is a cadet branch of another (decision D2). */
  parentHouseId?: number | null;
}

/** Per-dignity succession settings, as stored on the dignity record. */
export interface SuccessionRules {
  excludeBastards?: boolean;
  legitimizedBastardsEligible?: boolean;
}

/** One entry in a line of succession. */
export interface SuccessionEntry {
  personId: number;
  person: Person;
  position: number;
  excluded: boolean;
  exclusionReason: string | null;
  /**
   * The predeceased ancestor whose place this person takes, or null.
   * Representation is the reason a line can skip a generation (decision D1).
   */
  representing: number | null;
  /** Agnatic seniority only: true when they come from a cadet branch. */
  cadet?: boolean;
}

/** Adjacency maps built from raw relationship rows. */
export interface RelationshipMaps {
  childrenOf: Map<number, number[]>;
  parentsOf: Map<number, number[]>;
  spouseMap: Map<number, number>;
  adoptedChildrenOf: Map<number, number[]>;
  adoptedIds: Set<number>;
}

/** A raw relationship row, as stored. */
export interface Relationship {
  id?: number;
  person1Id: number;
  person2Id: number;
  relationshipType: string;
}
