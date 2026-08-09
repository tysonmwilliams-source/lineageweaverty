/**
 * useDebouncedValue.js
 *
 * Returns a copy of `value` that only updates once it has been stable for
 * `delay` ms.
 *
 * Use this to keep a controlled input feeling instant while the expensive work
 * downstream — filtering hundreds of records, re-running a memo chain,
 * rebuilding a D3 canvas — runs at most once per pause in typing.
 *
 * Prefer this over debouncing the input itself when the input is already
 * controlled: the caret and value stay immediate, only the derived work waits.
 */

import { useState, useEffect } from 'react';

export default function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    // Skip the timer when nothing changed, so the initial render and any
    // no-op re-render don't schedule work.
    if (value === debounced) return undefined;

    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay, debounced]);

  return debounced;
}
