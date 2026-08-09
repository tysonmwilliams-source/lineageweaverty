/**
 * Debounced auto-save for the Writing Studio.
 *
 * Saves `data` after it has been still for `delay` ms, and once more on unmount
 * if anything is outstanding. Change detection is `JSON.stringify` equality
 * against the last saved snapshot — coarse, but the data here is chapter prose
 * and metadata, and it is what makes a no-op re-render cheap.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';

export interface AutoSaveOptions<T> {
  /** The value to watch. Falsy values are never saved. */
  data: T;
  onSave: (data: T) => void | Promise<void>;
  /** Quiet period before saving, in ms. */
  delay?: number;
  enabled?: boolean;
}

export interface AutoSave {
  isSaving: boolean;
  lastSaved: Date | null;
  /** Save immediately, cancelling any pending debounce. */
  saveNow: () => Promise<void>;
  hasUnsavedChanges: boolean;
}

export default function useAutoSave<T>({
  data,
  onSave,
  delay = 1000,
  enabled = true
}: AutoSaveOptions<T>): AutoSave {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedDataRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  const dataRef = useRef(data);

  // Keep onSave ref up to date
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Keep the latest data in a ref so the unmount handler can read it
  // without needing `data` in its dependency array (see below).
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Perform save
  const performSave = useCallback(async (dataToSave: T) => {
    if (!onSaveRef.current) return;

    setIsSaving(true);
    try {
      await onSaveRef.current(dataToSave);
      lastSavedDataRef.current = JSON.stringify(dataToSave);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      logger.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Save now (manual trigger)
  const saveNow = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await performSave(data);
  }, [data, performSave]);

  // Debounced auto-save on data change
  useEffect(() => {
    if (!enabled || !data) return;

    // Check if data has actually changed
    const dataStr = JSON.stringify(data);
    if (dataStr === lastSavedDataRef.current) {
      return;
    }

    setHasUnsavedChanges(true);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      performSave(data);
    }, delay);

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, delay, enabled, performSave]);

  // Save on unmount if there are unsaved changes.
  //
  // The dependency array MUST stay empty. With `[data]` here React runs this
  // cleanup before every re-run — i.e. on every keystroke — which fired an
  // immediate save alongside the debounced one and defeated the debounce
  // entirely. Reading the latest value from dataRef keeps this a true
  // unmount-only handler.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const latest = dataRef.current;
      if (!latest) return;
      const dataStr = JSON.stringify(latest);
      if (dataStr !== lastSavedDataRef.current && onSaveRef.current) {
        onSaveRef.current(latest);
      }
    };
  }, []);

  return {
    isSaving,
    lastSaved,
    saveNow,
    hasUnsavedChanges
  };
}
