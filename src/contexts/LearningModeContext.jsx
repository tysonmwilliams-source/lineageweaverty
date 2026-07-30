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

// Storage key
const STORAGE_KEY = 'lineageweaver-learning-mode';

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
};

// Default mode
const DEFAULT_MODE = 'learning';

// Create context
const LearningModeContext = createContext(null);

/**
 * Load saved mode from localStorage
 */
function loadSavedMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LEARNING_MODES[saved]) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_MODE;
}

/**
 * Save mode to localStorage
 */
function saveMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Learning Mode Provider
 */
export function LearningModeProvider({ children }) {
  const [mode, setModeState] = useState(loadSavedMode);

  // Set mode and persist
  const setMode = useCallback((newMode) => {
    if (LEARNING_MODES[newMode]) {
      setModeState(newMode);
      saveMode(newMode);
    }
  }, []);

  // Cycle through modes
  const cycleMode = useCallback(() => {
    const modes = Object.keys(LEARNING_MODES);
    const currentIndex = modes.indexOf(mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setMode(modes[nextIndex]);
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
export function useLearningMode() {
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
export function useFormattedTerm(original, modern) {
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
