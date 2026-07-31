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

export default function useUndoable(initial, { limit = DEFAULT_LIMIT } = {}) {
  const [history, setHistory] = useState(() => ({
    past: [],
    present: typeof initial === 'function' ? initial() : initial,
    future: []
  }));

  const set = useCallback((next) => {
    setHistory((h) => {
      const value = typeof next === 'function' ? next(h.present) : next;

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
  const reset = useCallback((value) => {
    setHistory({ past: [], present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present],
        present: h.future[0],
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
