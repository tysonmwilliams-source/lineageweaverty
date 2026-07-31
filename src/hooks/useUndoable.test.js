/**
 * Tests for undoable state (decision C3, Armory undo).
 *
 * The failure modes here are all quiet: a history that records no-ops so undo
 * appears to do nothing, a redo branch that survives a new edit and jumps the
 * user forward into work they abandoned, or an unbounded stack that holds every
 * intermediate value of a dragged slider forever.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUndoable from './useUndoable';

describe('useUndoable', () => {
  it('starts with the initial value and nothing to undo', () => {
    const { result } = renderHook(() => useUndoable('a'));
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('accepts a lazy initial value', () => {
    const { result } = renderHook(() => useUndoable(() => 'computed'));
    expect(result.current.value).toBe('computed');
  });

  it('steps back through edits in the order they were made', () => {
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.set('b'));
    act(() => result.current.set('c'));
    expect(result.current.value).toBe('c');

    act(() => result.current.undo());
    expect(result.current.value).toBe('b');

    act(() => result.current.undo());
    expect(result.current.value).toBe('a');
    expect(result.current.canUndo).toBe(false);
  });

  it('redoes what was undone', () => {
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.set('b'));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.value).toBe('b');
    expect(result.current.canRedo).toBe(false);
  });

  it('abandons the redo branch when a new edit follows an undo', () => {
    // Otherwise redo would jump the user forward into work they deliberately
    // backed out of, which no editor does.
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.set('b'));
    act(() => result.current.undo());
    act(() => result.current.set('c'));

    expect(result.current.canRedo).toBe(false);
    expect(result.current.value).toBe('c');
  });

  it('accepts an updater function, like setState', () => {
    const { result } = renderHook(() => useUndoable(1));
    act(() => result.current.set((n) => n + 1));
    expect(result.current.value).toBe(2);

    act(() => result.current.undo());
    expect(result.current.value).toBe(1);
  });

  it('records nothing when an edit returns the identical value', () => {
    // The composition helpers return the same object when nothing changed, so
    // a no-op edit must not become a history entry that undoes to itself.
    const same = { coat: 'azure' };
    const { result } = renderHook(() => useUndoable(same));

    act(() => result.current.set(same));
    expect(result.current.canUndo).toBe(false);
  });

  it('does treat an equal-but-distinct object as a real edit', () => {
    // Identity, not deep equality — a rebuilt tree with the same contents is
    // still a change as far as React is concerned.
    const { result } = renderHook(() => useUndoable({ coat: 'azure' }));
    act(() => result.current.set({ coat: 'azure' }));
    expect(result.current.canUndo).toBe(true);
  });

  it('caps the stack, dropping the oldest entries', () => {
    // A dragged slider fires on every step; without a cap the history would
    // hold every intermediate value for the life of the page.
    const { result } = renderHook(() => useUndoable(0, { limit: 3 }));

    for (let i = 1; i <= 6; i++) act(() => result.current.set(i));

    let steps = 0;
    while (result.current.canUndo) {
      act(() => result.current.undo());
      steps++;
      if (steps > 10) break;
    }
    expect(steps).toBe(3);
    // Having fallen off the end, the earliest reachable value is not the
    // original — which is the honest consequence of a cap, not a bug.
    expect(result.current.value).toBe(3);
  });

  it('reset clears the history rather than recording a step', () => {
    // Loading a record: the blank default before it is not something the user
    // drew, so undoing back into it would be meaningless.
    const { result } = renderHook(() => useUndoable('a'));

    act(() => result.current.set('b'));
    act(() => result.current.reset('loaded'));

    expect(result.current.value).toBe('loaded');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('ignores undo and redo when there is nowhere to go', () => {
    const { result } = renderHook(() => useUndoable('a'));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.value).toBe('a');
  });
});
