/**
 * The message out of an unknown thrown value (decision F4).
 *
 * `strict` turns on `useUnknownInCatchVariables`, so `catch (error)` gives an
 * `unknown` and `error.message` no longer compiles. Every service converted in
 * F4 hits this in its first try/catch, so it is worth one shared helper rather
 * than a cast per site — a cast would say "this is an Error" in the exact place
 * the code cannot know that.
 *
 * It is also slightly more truthful than what it replaces: `throw 'nope'` used
 * to reach a report as `undefined`, which read as "an error with no message"
 * rather than as the message it actually was.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}
