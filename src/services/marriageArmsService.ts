/**
 * Marriage arms (decision C3, step 6).
 *
 * The payoff of the whole recursive-composition rebuild, and the case that made
 * it worth doing for a genealogy app specifically: when two houses marry, the
 * arms are borne impaled — one house's coat beside the other's. Everything
 * needed to do that automatically is already in the data, four hops apart:
 *
 *     person → spouse → spouse's house → that house's arms
 *
 * Until now the user had to walk that chain in their head and redraw the second
 * coat by hand. This resolves it for them.
 *
 * Deliberately read-only. It reports what a marriage coat *would* be; building
 * one is the caller's business, so nothing here can alter a record.
 */
import { getDatabase } from './database';
import { getSpouses } from '../utils/personRelations';
import { readComposition } from '../utils/heraldry';
import { logger } from '../utils/logger';
import type { StoredComposition } from '../utils/heraldry/types';
import type {
  DatasetId,
  HeraldryRecord,
  House,
  Person,
  Relationship
} from './types';

/**
 * One marriage, and whether it can be borne as impaled arms.
 *
 * `usable` and `reason` are a pair on purpose: every unusable option carries
 * the reason it is unusable, because "no marriage arms available" with no
 * explanation is the kind of dead end that reads as a bug.
 */
export interface MarriageArmsOption {
  spouse: Person;
  relationship: Relationship;
  house: House | null;
  heraldry: HeraldryRecord | null;
  /** Normalised to version 3 in memory. Only set when `usable`. */
  composition: StoredComposition | null;
  usable: boolean;
  reason: string | null;
}

/**
 * Every marriage of a person that could be borne as impaled arms.
 */
export async function getMarriageArmsOptions(
  personId: number | null | undefined,
  datasetId: DatasetId = null
): Promise<MarriageArmsOption[]> {
  if (!personId) return [];

  try {
    const db = getDatabase(datasetId);

    const [people, relationships] = await Promise.all([
      db.people.toArray(),
      db.relationships.toArray()
    ]);

    const peopleById = new Map(people.map((p) => [p.id, p]));
    const spouses = getSpouses(personId, relationships, peopleById);
    if (spouses.length === 0) return [];

    const options: MarriageArmsOption[] = [];

    for (const { id: spouseId, relationship } of spouses) {
      const spouse = peopleById.get(spouseId);
      if (!spouse) continue;

      const option: MarriageArmsOption = {
        spouse,
        relationship,
        house: null,
        heraldry: null,
        composition: null,
        usable: false,
        reason: null
      };

      if (!spouse.houseId) {
        option.reason = 'belongs to no house';
        options.push(option);
        continue;
      }

      const house = await db.houses.get(spouse.houseId);
      option.house = house ?? null;

      if (!house) {
        option.reason = 'their house record is missing';
        options.push(option);
        continue;
      }

      if (!house.heraldryId) {
        option.reason = `House ${house.houseName} has no arms yet`;
        options.push(option);
        continue;
      }

      const heraldry = await db.heraldry.get(house.heraldryId);
      option.heraldry = heraldry ?? null;

      if (!heraldry) {
        option.reason = 'their house arms record is missing';
        options.push(option);
        continue;
      }

      // Uploaded and generated arms are an image and nothing more. There is no
      // composition to marshal, and inventing one would fabricate a coat.
      const composition: StoredComposition | null = readComposition(heraldry.composition);
      if (!composition?.root) {
        option.reason = `"${heraldry.name}" was uploaded rather than drawn, so it cannot be combined`;
        options.push(option);
        continue;
      }

      option.composition = composition;
      option.usable = true;
      options.push(option);
    }

    return options;
  } catch (error) {
    logger.error('Could not resolve marriage arms options:', error);
    return [];
  }
}

/** Just the spouse's name. */
export function describeSpouse(option: MarriageArmsOption): string {
  return [option.spouse?.firstName, option.spouse?.lastName].filter(Boolean).join(' ') || 'their spouse';
}

/**
 * A label for a marriage arms option, for a button.
 *
 * Names the spouse *and* their house, because "Impale with their arms" is
 * ambiguous the moment a person has been married twice — and because the house
 * is what is actually being marshalled in.
 *
 * Use `describeSpouse` instead wherever the house is already named nearby: the
 * unusable-option lines end in a reason that often names the house itself, and
 * pairing them produced "Mirelle Riverhead — House Riverhead — House Riverhead
 * has no arms yet".
 */
export function describeMarriageOption(option: MarriageArmsOption): string {
  const name = describeSpouse(option);
  return option.house?.houseName ? `${name} — ${option.house.houseName}` : name;
}
