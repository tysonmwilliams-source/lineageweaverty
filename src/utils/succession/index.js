/**
 * Succession rules (decisions D1, D2, D3).
 *
 * Pure and dependency-free. Nothing here reads a database or a dignity record;
 * callers assemble the maps and pass them in. That is what makes rules this
 * fiddly testable — the implementation this replaces was async, coupled to
 * Dexie, and had no tests at all.
 */
export { buildSuccessionLine } from './successionRules';
export { buildAgnaticSeniorityLine, collectDynastyHouses } from './dynasty';
