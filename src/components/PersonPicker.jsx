/**
 * PersonPicker Component
 *
 * Searchable combobox replacing the raw <select> for "Centre On" person selection.
 * Filters by firstName, lastName, dateOfBirth. Always shows "Oldest Member" auto option.
 *
 * Props:
 * - people: Array of person objects (already filtered to current house)
 * - value: Current value ('auto' or person ID)
 * - onChange: Callback when person is selected
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Icon from './icons';
import './PersonPicker.css';

function PersonPicker({ people, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter people by search term
  const filteredPeople = useMemo(() => {
    if (!search) return people;
    const term = search.toLowerCase();
    return people.filter(p =>
      p.firstName.toLowerCase().includes(term) ||
      p.lastName.toLowerCase().includes(term) ||
      (p.dateOfBirth && p.dateOfBirth.includes(term))
    );
  }, [people, search]);

  // Selected display label
  const selectedLabel = useMemo(() => {
    if (value === 'auto') return 'Oldest Member';
    const person = people.find(p => p.id === value);
    if (!person) return 'Oldest Member';
    return `${person.firstName} ${person.lastName} (b. ${person.dateOfBirth})`;
  }, [value, people]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelect = useCallback((val) => {
    onChange(val);
    setIsOpen(false);
    setSearch('');
    setActiveIndex(-1);
  }, [onChange]);

  // Total selectable count: "auto" option + filtered people
  const totalItems = filteredPeople.length + 1;

  const handleKeyDown = useCallback((e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, totalItems - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex === 0) {
          handleSelect('auto');
        } else if (activeIndex > 0 && activeIndex <= filteredPeople.length) {
          handleSelect(filteredPeople[activeIndex - 1].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        setActiveIndex(-1);
        break;
    }
  }, [isOpen, totalItems, activeIndex, filteredPeople, handleSelect]);

  const handleToggle = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) {
      setSearch('');
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="person-picker" ref={containerRef}>
      {/* Trigger button */}
      <button
        className="person-picker__trigger"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Centre on person"
        type="button"
      >
        <span className="person-picker__value">{selectedLabel}</span>
        <Icon name="chevron-down" size={16} className="person-picker__chevron" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="person-picker__dropdown">
          {/* Search input */}
          <div className="person-picker__search">
            <Icon name="search" size={14} className="person-picker__search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="person-picker__search-input"
              placeholder="Search people..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              aria-label="Search people"
            />
          </div>

          {/* Options list */}
          <div className="person-picker__list" ref={listRef} role="listbox">
            {/* Auto option always pinned at top */}
            <div
              className={
                'person-picker__option person-picker__option--auto' +
                (activeIndex === 0 ? ' person-picker__option--active' : '') +
                (value === 'auto' ? ' person-picker__option--selected' : '')
              }
              role="option"
              aria-selected={value === 'auto'}
              data-index={0}
              onClick={() => handleSelect('auto')}
              onMouseEnter={() => setActiveIndex(0)}
            >
              <Icon name="clock" size={14} className="person-picker__auto-icon" />
              <span>Oldest Member</span>
            </div>

            {filteredPeople.length === 0 && search ? (
              <div className="person-picker__empty">No people found</div>
            ) : (
              filteredPeople.map((person, i) => {
                const idx = i + 1; // offset by 1 for the "auto" option
                const isActive = idx === activeIndex;
                const isSelected = person.id === value;

                return (
                  <div
                    key={person.id}
                    className={
                      'person-picker__option' +
                      (isActive ? ' person-picker__option--active' : '') +
                      (isSelected ? ' person-picker__option--selected' : '')
                    }
                    role="option"
                    aria-selected={isSelected}
                    data-index={idx}
                    onClick={() => handleSelect(person.id)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className="person-picker__person-name">
                      {person.firstName} {person.lastName}
                    </span>
                    <span className="person-picker__birth">
                      b. {person.dateOfBirth}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PersonPicker;
