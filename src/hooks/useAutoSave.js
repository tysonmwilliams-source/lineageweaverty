/**
 * useAutoSave.js - Auto-save Hook
 *
 * Provides debounced auto-save functionality for the Writing Studio.
 * Saves content after a period of inactivity.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * useAutoSave Hook
 *
 * @param {Object} options
 * @param {any} options.data - The data to save
 * @param {Function} options.onSave - Callback function to save data
 * @param {number} options.delay - Debounce delay in ms (default: 1000)
 * @param {boolean} options.enabled - Whether auto-save is enabled (default: true)
 * @returns {Object} { isSaving, lastSaved, saveNow, hasUnsavedChanges }
 */
export default function useAutoSave({
  data,
  onSave,
  delay = 1000,
  enabled = true
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const timeoutRef = useRef(null);
  const lastSavedDataRef = useRef(null);
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
  const performSave = useCallback(async (dataToSave) => {
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
