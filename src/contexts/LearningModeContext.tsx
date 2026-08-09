/**
 * LearningModeContext.jsx - Learning Mode for Dignity Terms
 *
 * PURPOSE:
 * Provides app-wide learning mode for dignity terminology.
 * Allows users to toggle between display modes for unfamiliar terms.
 *
 * MODES:
 * - 'scholar': Original terms only (Drihten, Driht, Wardyn)
 * - 'learning': Both terms (Drihten (High Lord))
 * - 'modern': Modern equivalents only (High Lord, Lord, Warden)
 */

import { createContext, useContext, useState, useCallback, useEffect , useMemo} from 'react';
import type { ReactNode } from 'react';

// Storage key
const STORAGE_KEY = 'lineageweaver-learning-mode';

/** One selectable mode, as the mode picker renders it. */
export interface LearningModeInfo {
  /**
   * Duplicates this entry's key in `LEARNING_MODES`. Typed `string` rather than
   * `LearningMode` because `LearningMode` is derived from the table's keys, and
   * annotating the table with a type that reads its own keys is circular.
   */
  id: string;
  name: string;
  description: string;
  /** A lucide icon name. */
  icon: string;
}

// Available modes
export const LEARNING_MODES = {
  scholar: {
    id: 'scholar',
    name: 'Scholar',
    description: 'Original terms only',
    icon: 'scroll-text'
  },
  learning: {
    id: 'learning',
    name: 'Learning',
    description: 'Both original and modern terms',
    icon: 'graduation-cap'
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Modern equivalents only',
    icon: 'languages'
  }
} as const satisfies Record<string, LearningModeInfo>;

/**
 * The three modes, derived from the table rather than restated.
 *
 * `cycleMode` walks `Object.keys(LEARNING_MODES)`, so a fourth mode added above
 * joins the cycle and the union at once — restating the union here is how the
 * two would drift.
 */
export type LearningMode = keyof typeof LEARNING_MODES;

// Default mode
const DEFAULT_MODE: LearningMode = 'learning';

export interface LearningModeContextValue {
  mode: LearningMode;
  setMode: (mode: LearningMode) => void;
  /** Advance to the next mode, wrapping. Drives the single-button toggle. */
  cycleMode: () => void;
  /** True in 'scholar' and 'learning' — show the original term. */
  showOriginal: boolean;
  /** True in 'modern' and 'learning' — show the modern equivalent. */
  showModern: boolean;
  modeInfo: LearningModeInfo;
}

const LearningModeContext = createContext<LearningModeContextValue | null>(null);

/**
 * Load saved mode from localStorage
 */
function loadSavedMode(): LearningMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // The stored string is untrusted — it is whatever is in localStorage — so
    // membership in the table is what makes it a LearningMode.
    if (saved && saved in LEARNING_MODES) {
      return saved as LearningMode;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_MODE;
}

/**
 * Save mode to localStorage
 */
function saveMode(mode: LearningMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Learning Mode Provider
 */
export function LearningModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState(loadSavedMode);

  // Set mode and persist
  const setMode = useCallback((newMode: LearningMode) => {
    if (LEARNING_MODES[newMode]) {
      setModeState(newMode);
      saveMode(newMode);
    }
  }, []);

  // Cycle through modes
  const cycleMode = useCallback(() => {
    const modes = Object.keys(LEARNING_MODES) as LearningMode[];
    const currentIndex = modes.indexOf(mode);
    const next = modes[(currentIndex + 1) % modes.length];
    if (next) setMode(next);
  }, [mode, setMode]);

  // Check if showing original terms
  const showOriginal = mode === 'scholar' || mode === 'learning';

  // Check if showing modern terms
  const showModern = mode === 'modern' || mode === 'learning';

  // Memoized so consumers do not re-render on every provider render.
  const value = useMemo(() => ({
    mode,
    setMode,
    cycleMode,
    showOriginal,
    showModern,
    modeInfo: LEARNING_MODES[mode]
  }), [mode, setMode, cycleMode, showOriginal, showModern]);

  return (
    <LearningModeContext.Provider value={value}>
      {children}
    </LearningModeContext.Provider>
  );
}

/**
 * Hook to use learning mode
 */
export function useLearningMode(): LearningModeContextValue {
  const context = useContext(LearningModeContext);
  if (!context) {
    throw new Error('useLearningMode must be used within a LearningModeProvider');
  }
  return context;
}

/**
 * Hook that returns formatted term based on current mode
 * Can be used outside of React components
 */
export function useFormattedTerm(original: string, modern?: string | null): string {
  const { mode } = useLearningMode();

  switch (mode) {
    case 'scholar':
      return original;
    case 'modern':
      return modern || original;
    case 'learning':
    default:
      return modern ? `${original} (${modern})` : original;
  }
}

export default LearningModeContext;
