/**
 * SearchBar.jsx - Enhanced Search Bar Component
 *
 * PURPOSE:
 * Search input with dropdown results for finding people in the tree.
 * Uses Framer Motion for animations, Lucide icons, and BEM CSS.
 *
 * Props:
 * - people: Array of people to search through
 * - onSearchResults: Callback with filtered results
 * - onPersonSelect: Callback when a person is selected
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './icons';
import './SearchBar.css';

// ==================== ANIMATION VARIANTS ====================
const DROPDOWN_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -10,
    scale: 0.98
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      damping: 25,
      stiffness: 300
    }
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.98,
    transition: { duration: 0.15 }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.15 }
  }
};

function SearchBar({ people, onSearchResults, onPersonSelect }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // onSearchResults feeds `searchResults` in FamilyTree, which is a dependency
  // of the drawTree effect — so every call tears down and rebuilds the entire
  // SVG. The dropdown below stays instant; only that callback is debounced.
  const emitTimerRef = useRef(null);

  const emitResults = (searchResults, { immediate = false } = {}) => {
    if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    if (immediate) {
      onSearchResults(searchResults);
      return;
    }
    emitTimerRef.current = setTimeout(() => onSearchResults(searchResults), 300);
  };

  useEffect(() => {
    return () => {
      if (emitTimerRef.current) clearTimeout(emitTimerRef.current);
    };
  }, []);

  const handleSearch = (query) => {
    setSearchQuery(query);
    setHighlightedIndex(-1);

    if (!query.trim()) {
      setResults([]);
      setShowDropdown(false);
      emitResults([], { immediate: true });
      return;
    }

    const lowerQuery = query.toLowerCase();
    const searchResults = people.filter(person => {
      const firstName = (person.firstName || '').toLowerCase();
      const lastName = (person.lastName || '').toLowerCase();
      const maidenName = (person.maidenName || '').toLowerCase();

      return firstName.includes(lowerQuery) ||
             lastName.includes(lowerQuery) ||
             maidenName.includes(lowerQuery);
    });

    setResults(searchResults);
    setShowDropdown(searchResults.length > 0);
    emitResults(searchResults);
  };

  const handleSelectPerson = (person) => {
    setSearchQuery(`${person.firstName} ${person.lastName}`);
    setShowDropdown(false);
    // Discrete action — emit now, and cancel any pending debounced emit so a
    // stale keystroke result can't land after the selection.
    emitResults([person], { immediate: true });
    if (onPersonSelect) {
      onPersonSelect(person);
    }
  };

  const handleClear = () => {
    setSearchQuery('');
    setResults([]);
    setShowDropdown(false);
    setHighlightedIndex(-1);
    emitResults([], { immediate: true });
    inputRef.current?.focus();
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!showDropdown || results.length === 0) return;

    const maxIndex = Math.min(results.length - 1, 9);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < maxIndex ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : maxIndex
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelectPerson(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
      default:
        break;
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayResults = results.slice(0, 10);

  return (
    <div className="search-bar">
      {/* Input wrapper */}
      <div className="search-bar__input-wrapper">
        <Icon name="search" size={18} className="search-bar__icon" />

        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search people..."
          className="search-bar__input"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-controls="search-results"
        />

        {/* Clear Button */}
        <AnimatePresence>
          {searchQuery && (
            <motion.button
              className="search-bar__clear"
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

      {/* Dropdown Results */}
      <AnimatePresence>
        {showDropdown && results.length > 0 && (
          <motion.div
            ref={dropdownRef}
            className="search-bar__dropdown"
            id="search-results"
            role="listbox"
            variants={DROPDOWN_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <div className="search-bar__results">
              {displayResults.map((person, index) => (
                <motion.button
                  key={person.id}
                  className={`search-bar__result ${
                    highlightedIndex === index ? 'search-bar__result--highlighted' : ''
                  }`}
                  role="option"
                  aria-selected={highlightedIndex === index}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectPerson(person);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  variants={ITEM_VARIANTS}
                >
                  <div className="search-bar__result-icon">
                    <Icon name="user" size={16} />
                  </div>
                  <div className="search-bar__result-info">
                    <div className="search-bar__result-name">
                      {person.firstName} {person.lastName}
                    </div>
                    {person.maidenName && (
                      <div className="search-bar__result-detail">
                        née {person.maidenName}
                      </div>
                    )}
                    <div className="search-bar__result-dates">
                      {person.dateOfBirth}
                      {person.dateOfDeath ? ` - ${person.dateOfDeath}` : ''}
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>

            {results.length > 10 && (
              <div className="search-bar__more">
                <Icon name="more" size={14} />
                <span>+{results.length - 10} more results</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SearchBar;
