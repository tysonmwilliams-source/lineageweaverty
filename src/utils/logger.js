/**
 * logger — the single place console output is gated.
 *
 * The codebase had 1,155 bare `console.*` calls against 25 `import.meta.env.DEV`
 * guards, so essentially all of it shipped to production: sync payloads, entity
 * names, user IDs and world data, all readable in a production browser console.
 * Guarding each call site inline would mean 1,155 conditionals to keep correct.
 *
 * Instead every call site routes through here:
 *
 *   - `log`/`info`/`debug`/`warn`/`group`/`groupEnd`/`table` are DEV-only. In a
 *     production build they are a shared no-op, so the call costs one property
 *     lookup and the arguments are still evaluated (see the caveat below).
 *   - `error` always reports. This app has a built-in bug tracker and no server
 *     to collect telemetry, so a user hitting a real failure needs the error
 *     visible in their console to paste into a report.
 *
 * Two caveats, both verified against a production build:
 *
 *   1. Arguments are still evaluated even when the sink is a no-op. Nothing
 *      currently does expensive work to build a log line, but if you add a call
 *      whose arguments are costly, guard that call site with
 *      `import.meta.env.DEV` explicitly rather than relying on this.
 *   2. The message *strings* still ship in the bundle — they are arguments to a
 *      no-op, not dead code, so the minifier keeps them. No runtime data is
 *      exposed (nothing is printed), but don't treat a log message itself as
 *      private. Stripping the literals too would mean an inline
 *      `if (import.meta.env.DEV)` at all 1,151 call sites.
 *
 * The `bind` calls preserve the real call site in devtools — wrapping in an
 * arrow function would make every log appear to come from this file.
 */

const isDev = import.meta.env.DEV;

const noop = () => {};

export const logger = {
  log: isDev ? console.log.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  debug: isDev ? console.debug.bind(console) : noop,
  warn: isDev ? console.warn.bind(console) : noop,
  group: isDev ? console.group.bind(console) : noop,
  groupEnd: isDev ? console.groupEnd.bind(console) : noop,
  table: isDev ? console.table.bind(console) : noop,

  // Always reported — see the note above.
  error: console.error.bind(console),
};

export default logger;
