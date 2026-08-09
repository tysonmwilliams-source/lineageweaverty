/**
 * ListSearchBar.jsx - Inline Search Bar for Lists
 *
 * PURPOSE:
 * Simple search input with debouncing for filtering lists.
 * Different from the main SearchBar which has dropdown results.
 * Uses Framer Motion for animations and BEM CSS.
 *
 * Props:
 * - value: Current search term (controlled)
 * - onChange: Callback when search changes (already debounced internally if using onChangeDebounced)
 * - onChangeDebounced: Callback with debounced search value
 * - placeholder: Input placeholder text
 * - debounceMs: Debounce delay in ms (default 300)
 * - autoFocus: Whether to focus on mount
 * - inputRef: Optional ref to forward to the input element
 */

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import type { ChangeEvent as ReactChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../icons';
import './ListSearchBar.css';

export interface ListSearchBarProps {
  value: string;
  /** Fires on every keystroke, for the controlled input. */
  onChange: (value: string) => void;
  /** Fires once typing pauses. Use this for the expensive filter. */
  onChangeDebounced?: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  autoFocus?: boolean;
}

const ListSearchBar = forwardRef(function ListSearchBar({
  value,
  onChange,
  onChangeDebounced,
  placeholder = 'Search...',
  debounceMs = 300,
  autoFocus = false
}: ListSearchBarProps, ref) {
  const [localValue, setLocalValue] = useState(value || '');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Forward the ref to allow parent to focus the input
  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur()
  }));

  // Sync local value with prop value
  useEffect(() => {
    if (value !== undefined && value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);

  // Handle input change with optional debouncing
  const handleChange = (e: ReactChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Immediate callback
    if (onChange) {
      onChange(newValue);
    }

    // Debounced callback
    if (onChangeDebounced) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onChangeDebounced(newValue);
      }, debounceMs);
    }
  };

  // Clear search
  const handleClear = () => {
    setLocalValue('');
    if (onChange) onChange('');
    if (onChangeDebounced) onChangeDebounced('');
    inputRef.current?.focus();
  };

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Auto focus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className="list-search">
      <Icon name="search" size={18} className="list-search__icon" />

      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="list-search__input"
        autoComplete="off"
        aria-label={placeholder}
      />

      <AnimatePresence>
        {localValue && (
          <motion.button
            className="list-search__clear"
            onClick={handleClear}
            title="Clear search"
            aria-label="Clear search"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
          >
            <Icon name="x" size={16} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ListSearchBar;
