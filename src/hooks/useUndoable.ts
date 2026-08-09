/**
 * State with an undo history.
 *
 * Added for the Armory (decision C3): dividing a shield, mashing another
 * house's arms into a quarter and collapsing a division are all destructive
 * enough that trying them without a way back is uncomfortable — and the whole
 * point of a marshalling editor is trying things.
 *
 * It is deliberately a single history over one value rather than a per-field
 * undo. Every edit in the creator — every tincture, every charge, every
 * division — produces a new composition tree through one setter, so one
 * history covers all of them and the ordering is always what the user did.
 *
 * Depends on edits being immutable, which the composition helpers guarantee:
 * `setNodeAtPath` returns the *identical* root when nothing changed, so a
 * no-op edit is skipped here rather than filling the stack with entries that
 * undo to the same thing.
 */
import { useState, useCallback, useMemo } from 'react';

const DEFAULT_LIMIT = 50;

/** What the hook hands back. Generic in the value it holds a history of. */
export interface Undoable<T> {
  value: T;
  /** Set a new value, or derive one from the current. Records history. */
  set: (next: T | ((current: T) => T)) => void;
  /** Replace the value *without* recording history. */
  reset: (value: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export default function useUndoable<T>(
  initial: T | (() => T),
  { limit = DEFAULT_LIMIT }: { limit?: number } = {}
): Undoable<T> {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    // The lazy-initialiser ambiguity React's own `useState` has: if `T` is
    // itself a function type there is no way to tell "the value" from "a
    // producer of the value". Same assertion React's types make, for the same
    // reason, and no caller here holds a function.
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: []
  }));

  const set = useCallback((next: T | ((current: T) => T)) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? (next as (current: T) => T)(h.present) : next;

      // Identity, not deep equality: the helpers already return the same object
      // for an edit that changed nothing, and a deep compare on every keystroke
      // would be the expensive way to learn the same fact.
      if (Object.is(value, h.present)) return h;

      return {
        // Oldest entries fall off the end rather than growing without bound.
        past: [...h.past, h.present].slice(-limit),
        present: value,
        // A new edit after undoing abandons the redo branch, which is what
        // every editor does and what users expect.
        future: []
      };
    });
  }, [limit]);

  /**
   * Replace the value without recording history.
   *
   * For loading a record: the state before a load is a blank default the user
   * never drew, so undoing back into it would be meaningless.
   */
  const reset = useCallback((value: T) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      // Read before testing: `noUncheckedIndexedAccess` does not narrow an
      // index from a length check, and a bare non-null assertion here would be
      // the one place a real empty-history bug could hide.
      const previous = h.past[h.past.length - 1];
      if (previous === undefined) return h;
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      const next = h.future[0];
      if (next === undefined) return h;
      return {
        past: [...h.past, h.present],
        present: next,
        future: h.future.slice(1)
      };
    });
  }, []);

  return useMemo(() => ({
    value: history.present,
    set,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  }), [history, set, reset, undo, redo]);
}
