/**
 * useMediaQuery.js
 *
 * Subscribe to a CSS media query from JS.
 *
 * Needed because some responsive decisions can't be made in CSS. The family tree
 * is the case in point: below the phone breakpoint it doesn't get a *restyled*
 * D3 canvas, it gets an entirely different component. Hiding the canvas with CSS
 * would still mount D3, run the layout, and build the SVG — work that is pointless
 * and slow on the device least able to afford it.
 *
 * Uses `useSyncExternalStore`, which is the correct primitive for subscribing to
 * a browser API: it reads the value during render rather than in an effect, so
 * there is no first-paint flash of the wrong branch, and React handles tearing.
 * The older useState + useEffect pattern renders once with a wrong value.
 *
 * @param {string} query - A media query string, e.g. '(max-width: 768px)'
 * @returns {boolean} Whether the query currently matches
 */

import { useCallback, useSyncExternalStore } from 'react';

export default function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};

    const list = window.matchMedia(query);

    // Safari before 14 only has addListener/removeListener. Cheap to support and
    // silently broken without it.
    if (list.addEventListener) {
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    }
    list.addListener(onChange);
    return () => list.removeListener(onChange);
  }, [query]);

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  // Server snapshot: assume no match, so the desktop branch renders and is
  // corrected on hydration. This app is client-only, but getServerSnapshot is
  // required by the hook's contract.
  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
