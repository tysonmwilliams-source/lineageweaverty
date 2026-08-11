/**
 * Date formatting helpers.
 *
 * These were previously ten local definitions across nine files. Four of them
 * (CodexLanding, DignitiesLanding, HeraldryLanding, CodexBrowse) were the same
 * relative-time formatter, three of them byte-identical; the CodexBrowse copy
 * had drifted so that its fallback dropped the year entirely, meaning an entry
 * edited last year showed as a bare "Mar 4".
 *
 * Note the distinction the app relies on:
 *   - `isoString` values are real timestamps (createdAt / updatedAt).
 *   - `dateStr` values are worldbuilding dates, often a bare 4-digit year
 *     ("1683"), which must pass through untouched — `new Date('1683')` parses as
 *     a UTC instant and renders as the wrong year in western timezones.
 */

/**
 * Relative time for recent edits, falling back to a short date.
 * The year is shown only when it differs from the current year.
 *
 * @param {string} isoString - ISO timestamp
 * @returns {string}
 */
export function formatRelativeDate(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown';

  const date = new Date(isoString);
  const now = new Date();
  // `.getTime()` because subtracting Dates relies on an implicit valueOf that
  // TypeScript will not infer. Identical at runtime.
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) return 'Just now';
  if (diffInHours < 24) return `${Math.floor(diffInHours)}h ago`;
  if (diffInHours < 48) return 'Yesterday';
  if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

/**
 * Full written date. Accepts worldbuilding dates as well as timestamps: a bare
 * 4-digit year and anything unparseable are returned as-is rather than mangled.
 *
 * @param {string} dateStr - ISO timestamp, or a worldbuilding date string
 * @returns {string}
 */
export function formatLongDate(dateStr: string | number | null | undefined): string {
  if (!dateStr) return 'Unknown';
  if (String(dateStr).length === 4) return String(dateStr);

  const date = new Date(dateStr);
  // `isNaN(date)` coerced the Date via valueOf; `getTime()` says so.
  if (isNaN(date.getTime())) return String(dateStr);

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Short date, always with the year.
 *
 * @param {string} isoString - ISO timestamp
 * @returns {string}
 */
export function formatShortDate(isoString: string | null | undefined): string {
  if (!isoString) return '';

  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Short date with time — for audit trails where the hour matters.
 *
 * @param {string} isoString - ISO timestamp
 * @returns {string}
 */
export function formatShortDateTime(isoString: string | null | undefined): string {
  if (!isoString) return 'Unknown';

  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
