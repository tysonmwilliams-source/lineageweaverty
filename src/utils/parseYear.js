/**
 * parseYear.js - Year parsing and comparison
 *
 * Person dates are stored as years, but inconsistently: sometimes as numbers,
 * sometimes as strings ("1204"), sometimes as a fuller date string. Several
 * places compared them with `<` directly, which compares STRINGS — so a person
 * born in 999 who died in 1010 failed validation, because "1010" < "999" is
 * true. Lists sorted with localeCompare had the same defect: everyone born in
 * the 900s sorted after everyone born in the 1000s.
 *
 * Fantasy worlds routinely use 3-digit years, so this is not hypothetical.
 */

/**
 * Parse a stored year value into a number.
 *
 * @param {string|number|null|undefined} value
 * @returns {number|null} The year, or null if absent/unparseable
 */
export function parseYear(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  // Take the leading integer: handles "1204", "1204-03-11", "c. 1204".
  const match = String(value).match(/-?\d+/);
  if (!match) return null;

  const year = parseInt(match[0], 10);
  return Number.isNaN(year) ? null : year;
}

/**
 * Compare two year values numerically, for use as a sort comparator.
 * Absent years sort last.
 *
 * @param {string|number|null} a
 * @param {string|number|null} b
 * @returns {number}
 */
export function compareYears(a, b) {
  const ya = parseYear(a);
  const yb = parseYear(b);
  if (ya === null && yb === null) return 0;
  if (ya === null) return 1;
  if (yb === null) return -1;
  return ya - yb;
}

/**
 * True when both years are present and `earlier` is strictly after `later`.
 * Returns false when either is missing, so incomplete records don't fail
 * validation.
 *
 * @param {string|number|null} earlier - the value that should be the earlier one
 * @param {string|number|null} later - the value that should be the later one
 * @returns {boolean}
 */
export function isOutOfOrder(earlier, later) {
  const a = parseYear(earlier);
  const b = parseYear(later);
  if (a === null || b === null) return false;
  return a > b;
}
