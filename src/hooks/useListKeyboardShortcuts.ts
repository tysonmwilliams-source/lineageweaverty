/**
 * useListKeyboardShortcuts.js - List Keyboard Shortcuts Hook
 *
 * PURPOSE:
 * Custom hook for keyboard navigation in list components.
 * Supports: `/` to focus search, `Escape` to clear.
 *
 * Props:
 * - searchInputRef: Ref to the search input element
 * - onClearSearch: Callback to clear search
 */

import { useEffect, useCallback } from 'react';
import type { RefObject } from 'react';

interface ListKeyboardShortcuts {
  /** The search box to focus on `/`. */
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onClearSearch?: () => void;
}

function useListKeyboardShortcuts({
  searchInputRef,
  onClearSearch
}: ListKeyboardShortcuts): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input or textarea
    const activeElement = document.activeElement;
    const isInputFocused = activeElement?.tagName === 'INPUT' ||
                          activeElement?.tagName === 'TEXTAREA' ||
                          activeElement?.tagName === 'SELECT';

    // `/` to focus search (only when not in an input)
    if (e.key === '/' && !isInputFocused) {
      e.preventDefault();
      searchInputRef?.current?.focus();
    }

    // `Escape` to clear search and blur
    if (e.key === 'Escape' && isInputFocused) {
      if (onClearSearch) {
        onClearSearch();
      }
      // `document.activeElement` is an `Element`, which has no `blur` — only
      // `HTMLElement` does. The tag check above already established it is one
      // of three form controls, but that does not narrow the type.
      if (activeElement instanceof HTMLElement) activeElement.blur();
    }
  }, [searchInputRef, onClearSearch]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export default useListKeyboardShortcuts;
