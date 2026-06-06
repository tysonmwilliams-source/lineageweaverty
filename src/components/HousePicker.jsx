/**
 * HousePicker Component
 *
 * Searchable combobox replacing the raw <select> for house selection.
 * Groups houses by type (Great > Cadet > Minor > Vassal > Extinct),
 * shows color swatches, type badges, and member counts.
 *
 * Props:
 * - houses: Array of house objects
 * - people: Array of people (for member counts)
 * - selectedHouseId: Currently selected house ID
 * - onHouseChange: Callback when house is selected
 * - compact: Boolean for narrow mode (settings panel)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { getHouseColor } from '../utils/themeColors';
import { isBastardCadet } from '../utils/treeHelpers';
import Icon from './icons';
import './HousePicker.css';

const HOUSE_TYPE_ORDER = ['great', 'cadet', 'minor', 'vassal', 'extinct'];

const HOUSE_TYPE_LABELS = {
  great: 'Great Houses',
  cadet: 'Cadet Branches',
  minor: 'Minor Houses',
  vassal: 'Vassal Houses',
  extinct: 'Extinct Houses'
};

const HOUSE_TYPE_BADGES = {
  great: 'Great',
  cadet: 'Cadet',
  minor: 'Minor',
  vassal: 'Vassal',
  extinct: 'Extinct'
};

function HousePicker({ houses, people, selectedHouseId, onHouseChange, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build member count map in O(n)
  const memberCountMap = useMemo(() => {
    const map = new Map();
    if (!people) return map;
    people.forEach(p => {
      map.set(p.houseId, (map.get(p.houseId) || 0) + 1);
    });
    return map;
  }, [people]);

  // Build parent house lookup for hierarchy display
  const housesById = useMemo(() => {
    const map = new Map();
    houses.forEach(h => map.set(h.id, h));
    return map;
  }, [houses]);

  // Group and filter houses, with cadets sorted under their parents
  const groupedHouses = useMemo(() => {
    const filtered = houses.filter(h =>
      h.houseName.toLowerCase().includes(search.toLowerCase())
    );

    const groups = [];
    HOUSE_TYPE_ORDER.forEach(type => {
      const typeItems = filtered.filter(h => h.houseType === type);
      if (typeItems.length === 0) return;

      if (type === 'cadet') {
        // Sort cadets by parent house name first, then by their own name
        typeItems.sort((a, b) => {
          const parentA = a.parentHouseId ? (housesById.get(a.parentHouseId)?.houseName || '') : '';
          const parentB = b.parentHouseId ? (housesById.get(b.parentHouseId)?.houseName || '') : '';
          if (parentA !== parentB) return parentA.localeCompare(parentB);
          return a.houseName.localeCompare(b.houseName);
        });
      } else {
        typeItems.sort((a, b) => a.houseName.localeCompare(b.houseName));
      }

      groups.push({ type, label: HOUSE_TYPE_LABELS[type], items: typeItems });
    });

    // Catch any houses with unrecognized types
    const knownTypes = new Set(HOUSE_TYPE_ORDER);
    const other = filtered.filter(h => !knownTypes.has(h.houseType));
    if (other.length > 0) {
      other.sort((a, b) => a.houseName.localeCompare(b.houseName));
      groups.push({ type: 'other', label: 'Other', items: other });
    }

    return groups;
  }, [houses, search, housesById]);

  // Flat list of selectable items for keyboard navigation
  const flatItems = useMemo(() => {
    return groupedHouses.flatMap(g => g.items);
  }, [groupedHouses]);

  const selectedHouse = useMemo(() => {
    return houses.find(h => h.id === selectedHouseId) || null;
  }, [houses, selectedHouseId]);

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

  const handleSelect = useCallback((house) => {
    onHouseChange(house.id);
    setIsOpen(false);
    setSearch('');
    setActiveIndex(-1);
  }, [onHouseChange]);

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
        setActiveIndex(prev => Math.min(prev + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < flatItems.length) {
          handleSelect(flatItems[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearch('');
        setActiveIndex(-1);
        break;
    }
  }, [isOpen, flatItems, activeIndex, handleSelect]);

  const handleToggle = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) {
      setSearch('');
      setActiveIndex(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const rootClass = compact ? 'house-picker house-picker--compact' : 'house-picker';

  return (
    <div className={rootClass} ref={containerRef}>
      {/* Trigger button */}
      <button
        className="house-picker__trigger"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select house"
        type="button"
      >
        {selectedHouse ? (
          <span className="house-picker__selected">
            <span
              className="house-picker__swatch"
              style={{ backgroundColor: getHouseColor(selectedHouse.id) }}
            />
            <span className="house-picker__name">{selectedHouse.houseName}</span>
          </span>
        ) : (
          <span className="house-picker__placeholder">Select a house...</span>
        )}
        <Icon name="chevron-down" size={16} className="house-picker__chevron" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="house-picker__dropdown">
          {/* Search input */}
          <div className="house-picker__search">
            <Icon name="search" size={14} className="house-picker__search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="house-picker__search-input"
              placeholder="Search houses..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              aria-label="Search houses"
            />
          </div>

          {/* Options list */}
          <div className="house-picker__list" ref={listRef} role="listbox">
            {groupedHouses.length === 0 ? (
              <div className="house-picker__empty">No houses found</div>
            ) : (
              groupedHouses.map(group => (
                <div key={group.type} className="house-picker__group">
                  <div className="house-picker__group-label">{group.label}</div>
                  {group.items.map(house => {
                    const idx = flatItems.indexOf(house);
                    const isActive = idx === activeIndex;
                    const isSelected = house.id === selectedHouseId;
                    const count = memberCountMap.get(house.id) || 0;

                    const isCadetChild = house.houseType === 'cadet' && house.parentHouseId;
                    const parentHouse = isCadetChild ? housesById.get(house.parentHouseId) : null;
                    const isBastard = isBastardCadet(house);

                    return (
                      <div
                        key={house.id}
                        className={
                          'house-picker__option' +
                          (isActive ? ' house-picker__option--active' : '') +
                          (isSelected ? ' house-picker__option--selected' : '') +
                          (isCadetChild ? ' house-picker__option--cadet-child' : '')
                        }
                        role="option"
                        aria-selected={isSelected}
                        data-index={idx}
                        onClick={() => handleSelect(house)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <span
                          className="house-picker__swatch"
                          style={{ backgroundColor: getHouseColor(house.id) }}
                        />
                        <span className="house-picker__option-name">
                          {house.houseName}
                          {isCadetChild && parentHouse && !compact && (
                            <span className="house-picker__parent-label">
                              of {parentHouse.houseName}
                            </span>
                          )}
                        </span>
                        {!compact && (
                          <span className={`house-picker__badge house-picker__badge--${isBastard ? 'bastard' : house.houseType}`}>
                            {isBastard ? 'Bastard' : (HOUSE_TYPE_BADGES[house.houseType] || house.houseType)}
                          </span>
                        )}
                        <span className="house-picker__count">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HousePicker;
