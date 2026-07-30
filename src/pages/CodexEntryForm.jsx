/**
 * CodexEntryForm.jsx - Codex Entry Creation/Editing Form
 *
 * Handles creation and editing of codex entries.
 * Supports all 6 entry types with custom templates.
 * Features medieval manuscript aesthetic with animations.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createEntry,
  updateEntry,
  getEntry
} from '../services/codexService';
import { updateHeraldry } from '../services/heraldryService';
import { syncAddCodexEntry, syncUpdateCodexEntry, syncUpdateHeraldry } from '../services/dataSyncService';
import { useDataset } from '../contexts/DatasetContext';
import { useAuth } from '../contexts/AuthContext';
import Navigation from '../components/Navigation';
import Icon from '../components/icons/Icon';
import ActionButton from '../components/shared/ActionButton';
import LoadingState from '../components/shared/LoadingState';
import './CodexEntryForm.css';
import { logger } from '../utils/logger';
import { validateWikiLinks, getSuggestedEntries, findLinkSpanAtCaret } from '../utils/wikiLinkParser';
import useDebouncedValue from '../hooks/useDebouncedValue';

const CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1
    }
  }
};

const ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 }
  }
};

const TYPE_ICONS = {
  personage: 'users',
  house: 'castle',
  location: 'map',
  event: 'book-open',
  mysteria: 'sparkles',
  concept: 'scroll-text',
  heraldry: 'shield',
  custom: 'file-text'
};

function CodexEntryForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const { activeDataset } = useDataset();
  const { user } = useAuth();

  const isEditing = Boolean(id);
  const initialType = searchParams.get('type') || 'personage';

  // Get heraldryId and title from URL params (for Armory integration)
  const heraldryIdParam = searchParams.get('heraldryId');
  const titleParam = searchParams.get('title');

  // Form state
  const [formData, setFormData] = useState({
    type: initialType,
    title: titleParam || '',
    subtitle: '',
    content: '',
    tags: [],
    era: '',
    category: '',
    heraldryId: heraldryIdParam ? parseInt(heraldryIdParam) : null
  });

  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Wiki-link tooling ──────────────────────────────────────────────────────
  //
  // The form told you to write [[Entry Name]] and then gave you no way to know
  // whether the name was right. 219 of 1,787 links in the real world data point
  // at nothing, and a typo is indistinguishable from a deliberate
  // forward-reference until you go looking. Both of these are now surfaced while
  // you type: suggestions so the name comes out right, and a report so a link
  // that resolves to nothing says so.
  const contentRef = useRef(null);
  const [brokenLinks, setBrokenLinks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  // The [[ ... span under the caret, if any: { start, end, query }
  const [activeLinkSpan, setActiveLinkSpan] = useState(null);

  const debouncedContent = useDebouncedValue(formData.content, 500);

  // Load existing entry if editing
  useEffect(() => {
    if (isEditing) {
      loadEntry();
    } else {
      applyTemplate(initialType);
    }
  }, [id, isEditing, activeDataset]);

  async function loadEntry() {
    try {
      setLoading(true);
      const datasetId = activeDataset?.id;
      const entry = await getEntry(parseInt(id), datasetId);
      if (entry) {
        setFormData({
          type: entry.type,
          title: entry.title,
          subtitle: entry.subtitle || '',
          content: entry.content,
          tags: entry.tags || [],
          era: entry.era || '',
          category: entry.category || '',
          heraldryId: entry.heraldryId || null
        });
      } else {
        setError('Entry not found');
      }
      setLoading(false);
    } catch (err) {
      logger.error('Error loading entry:', err);
      setError('Failed to load entry');
      setLoading(false);
    }
  }

  function applyTemplate(type) {
    const template = ENTRY_TEMPLATES[type];
    if (template) {
      setFormData(prev => ({
        ...prev,
        type,
        content: template.content,
        category: template.defaultCategory || ''
      }));
    }
  }

  function handleTypeChange(newType) {
    setFormData(prev => ({
      ...prev,
      type: newType
    }));
    if (!isEditing) {
      applyTemplate(newType);
    }
  }

  function handleInputChange(field, value) {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }

  // ── Wiki-link validation ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    if (!debouncedContent?.trim()) {
      setBrokenLinks([]);
      return undefined;
    }

    validateWikiLinks(debouncedContent, activeDataset?.id)
      .then(broken => {
        if (!cancelled) setBrokenLinks(broken);
      })
      .catch(err => {
        // A validation failure must never block writing.
        logger.error('Wiki-link validation failed:', err);
        if (!cancelled) setBrokenLinks([]);
      });

    return () => { cancelled = true; };
  }, [debouncedContent, activeDataset]);

  // ── [[ autocomplete ────────────────────────────────────────────────────────

  const handleContentChange = useCallback((e) => {
    const { value, selectionStart } = e.target;
    handleInputChange('content', value);
    setActiveLinkSpan(findLinkSpanAtCaret(value, selectionStart));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const query = activeLinkSpan?.query?.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      return undefined;
    }

    getSuggestedEntries(query, 8, activeDataset?.id)
      .then(results => {
        if (cancelled) return;
        setSuggestions(results);
        setSuggestionIndex(0);
      })
      .catch(err => {
        logger.error('Wiki-link suggestions failed:', err);
        if (!cancelled) setSuggestions([]);
      });

    return () => { cancelled = true; };
  }, [activeLinkSpan, activeDataset]);

  /** Replace the partial name under the caret with a chosen entry title. */
  const applySuggestion = useCallback((entry) => {
    if (!activeLinkSpan) return;

    const { start, end } = activeLinkSpan;
    const text = formData.content;
    // Swallow a `]]` that is already there so selecting doesn't produce `]]]]`.
    const alreadyClosed = text.slice(end, end + 2) === ']]';
    const after = alreadyClosed ? text.slice(end + 2) : text.slice(end);

    const next = `${text.slice(0, start)}${entry.title}]]${after}`;
    handleInputChange('content', next);
    setActiveLinkSpan(null);
    setSuggestions([]);

    // Put the caret after the closing brackets.
    const caret = start + entry.title.length + 2;
    requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }, [activeLinkSpan, formData.content]);

  const handleContentKeyDown = useCallback((e) => {
    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSuggestionIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      applySuggestion(suggestions[suggestionIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestions([]);
      setActiveLinkSpan(null);
    }
  }, [suggestions, suggestionIndex, applySuggestion]);

  // Strip formatting on paste - always use plain text, remove code fences and leading indentation
  function handlePlainTextPaste(e, field) {
    e.preventDefault();
    let plainText = e.clipboardData.getData('text/plain');

    // Remove markdown code fences (``` at start/end)
    plainText = plainText
      .replace(/^```[\w]*\n?/gm, '')    // Remove opening code fences
      .replace(/\n?```$/gm, '')          // Remove closing code fences
      .replace(/^```$/gm, '');           // Remove standalone code fences

    // Remove leading spaces/tabs from each line to prevent markdown code blocks
    plainText = plainText
      .split('\n')
      .map(line => line.replace(/^[ \t]+/, ''))  // Strip leading whitespace
      .join('\n');

    // For input fields, just set the value directly
    if (field) {
      handleInputChange(field, plainText);
    } else {
      // For textareas, insert at cursor position
      const textarea = e.target;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const currentValue = textarea.value;
      const newValue = currentValue.substring(0, start) + plainText + currentValue.substring(end);

      // Update the field based on the textarea's id
      const fieldName = textarea.id;
      handleInputChange(fieldName, newValue);

      // Restore cursor position after React re-render
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + plainText.length;
      }, 0);
    }
  }

  function handleAddTag(e) {
    e.preventDefault();
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
      setTagInput('');
    }
  }

  function handleRemoveTag(tagToRemove) {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  }

  // Strip all HTML tags, code fences, and normalize formatting
  function handleCleanFormatting() {
    if (!formData.content) return;

    // Create a temporary DOM element to parse HTML and extract text
    const temp = document.createElement('div');
    temp.innerHTML = formData.content;

    // Get text content (strips all HTML tags)
    let cleanText = temp.textContent || temp.innerText || '';

    // Remove markdown code fences (``` at start/end)
    cleanText = cleanText
      .replace(/^```[\w]*\n?/gm, '')    // Remove opening code fences (```js, ```markdown, etc.)
      .replace(/\n?```$/gm, '')          // Remove closing code fences
      .replace(/^```$/gm, '');           // Remove standalone code fences

    // Normalize whitespace and fix code-block-causing indentation
    cleanText = cleanText
      .replace(/\r\n/g, '\n')           // Normalize line endings
      .replace(/\r/g, '\n')
      .split('\n')                       // Process line by line
      .map(line => line.replace(/^[ \t]+/, ''))  // Remove leading spaces/tabs from each line (prevents code blocks)
      .join('\n')
      .replace(/[ \t]+/g, ' ')          // Collapse multiple inline spaces/tabs to single space
      .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive newlines
      .trim();

    handleInputChange('content', cleanText);
  }

  async function handleSave() {
    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.content.trim()) {
      setError('Content is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const datasetId = activeDataset?.id;

      const entryData = {
        type: formData.type,
        title: formData.title.trim(),
        subtitle: formData.subtitle.trim() || null,
        content: formData.content.trim(),
        tags: formData.tags,
        era: formData.era.trim() || null,
        category: formData.category.trim() || null,
        heraldryId: formData.heraldryId || null
      };

      let codexEntryId;

      if (isEditing) {
        await updateEntry(parseInt(id), entryData, datasetId, user?.uid || null);
        codexEntryId = parseInt(id);

        // ☁️ Sync update to cloud
        if (user && activeDataset) {
          syncUpdateCodexEntry(user.uid, activeDataset.id, codexEntryId, entryData);
        }
      } else {
        codexEntryId = await createEntry(entryData, datasetId);

        // ☁️ Sync new entry to cloud
        if (user && activeDataset) {
          syncAddCodexEntry(user.uid, activeDataset.id, codexEntryId, { ...entryData, id: codexEntryId });
        }
      }

      // Bidirectional linking - update heraldry record with codexEntryId
      if (entryData.heraldryId && codexEntryId) {
        try {
          await updateHeraldry(entryData.heraldryId, { codexEntryId }, null, datasetId);

          // ☁️ Sync heraldry update to cloud
          if (user && activeDataset) {
            syncUpdateHeraldry(user.uid, activeDataset.id, entryData.heraldryId, { codexEntryId });
          }
        } catch (linkError) {
          logger.error('Warning: Failed to create bidirectional link:', linkError);
        }
      }

      navigate('/codex');
    } catch (err) {
      logger.error('Error saving entry:', err);
      setError('Failed to save entry');
      setSaving(false);
    }
  }

  function handleCancel() {
    if (window.confirm('Discard changes and return to Codex?')) {
      navigate('/codex');
    }
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="codex-entry-form codex-entry-form--loading">
          <LoadingState message="Loading entry..." icon="scroll" />
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <motion.div
        className="codex-entry-form"
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.header className="codex-entry-form__header" variants={ITEM_VARIANTS}>
          <h1 className="codex-entry-form__title">
            <Icon name={isEditing ? 'pencil' : 'plus'} size={32} />
            <span>{isEditing ? 'Edit Entry' : 'Create New Entry'}</span>
          </h1>
          <p className="codex-entry-form__subtitle">
            Document the lore and history of your world
          </p>
        </motion.header>

        {/* Error Alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              className="codex-entry-form__error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Icon name="alert-circle" size={20} />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="codex-entry-form__error-close"
              >
                <Icon name="x" size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="codex-entry-form__content">
          {/* Entry Type Selector */}
          <motion.section className="codex-entry-form__section" variants={ITEM_VARIANTS}>
            <label className="codex-entry-form__label">
              <Icon name="layout-grid" size={16} />
              <span>Entry Type</span>
            </label>
            <div className="codex-entry-form__type-grid">
              {ENTRY_TYPES.map(type => (
                <motion.button
                  key={type.value}
                  type="button"
                  className={`codex-entry-form__type-option ${formData.type === type.value ? 'codex-entry-form__type-option--selected' : ''}`}
                  onClick={() => handleTypeChange(type.value)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon name={TYPE_ICONS[type.value] || 'file'} size={24} />
                  <span className="codex-entry-form__type-label">{type.label}</span>
                </motion.button>
              ))}
            </div>
          </motion.section>

          {/* Title */}
          <motion.section className="codex-entry-form__section" variants={ITEM_VARIANTS}>
            <label className="codex-entry-form__label" htmlFor="title">
              <Icon name="type" size={16} />
              <span>Title</span>
              <span className="codex-entry-form__required">*</span>
            </label>
            <input
              id="title"
              type="text"
              className="codex-entry-form__input"
              placeholder="Enter the entry title..."
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              onPaste={(e) => handlePlainTextPaste(e, 'title')}
            />
          </motion.section>

          {/* Subtitle */}
          <motion.section className="codex-entry-form__section" variants={ITEM_VARIANTS}>
            <label className="codex-entry-form__label" htmlFor="subtitle">
              <Icon name="minus" size={16} />
              <span>Subtitle</span>
            </label>
            <input
              id="subtitle"
              type="text"
              className="codex-entry-form__input"
              placeholder="Optional subtitle or tagline..."
              value={formData.subtitle}
              onChange={(e) => handleInputChange('subtitle', e.target.value)}
              onPaste={(e) => handlePlainTextPaste(e, 'subtitle')}
            />
          </motion.section>

          {/* Era and Category */}
          <motion.div className="codex-entry-form__row" variants={ITEM_VARIANTS}>
            <section className="codex-entry-form__section">
              <label className="codex-entry-form__label" htmlFor="era">
                <Icon name="calendar" size={16} />
                <span>Era / Time Period</span>
              </label>
              <input
                id="era"
                type="text"
                className="codex-entry-form__input"
                placeholder="e.g., Second Age, Pre-War..."
                value={formData.era}
                onChange={(e) => handleInputChange('era', e.target.value)}
              />
            </section>

            <section className="codex-entry-form__section">
              <label className="codex-entry-form__label" htmlFor="category">
                <Icon name="folder" size={16} />
                <span>{(formData.type === 'heraldry' || formData.type === 'concept') ? 'Subsection' : 'Category'}</span>
              </label>
              {formData.type === 'heraldry' ? (
                <select
                  id="category"
                  className="codex-entry-form__select"
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                >
                  <option value="">Heraldry</option>
                  <option value="titles">Dignities & Titles</option>
                </select>
              ) : formData.type === 'concept' ? (
                <select
                  id="category"
                  className="codex-entry-form__select"
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                >
                  <option value="">Concepts</option>
                  <option value="laws">Laws</option>
                </select>
              ) : (
                <input
                  id="category"
                  type="text"
                  className="codex-entry-form__input"
                  placeholder="e.g., Nobility, Religion..."
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                />
              )}
            </section>
          </motion.div>

          {/* Tags */}
          <motion.section className="codex-entry-form__section" variants={ITEM_VARIANTS}>
            <label className="codex-entry-form__label">
              <Icon name="tags" size={16} />
              <span>Tags</span>
            </label>
            <div className="codex-entry-form__tags">
              <div className="codex-entry-form__tags-display">
                <AnimatePresence>
                  {formData.tags.map(tag => (
                    <motion.span
                      key={tag}
                      className="codex-entry-form__tag"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      {tag}
                      <button
                        type="button"
                        className="codex-entry-form__tag-remove"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                {formData.tags.length === 0 && (
                  <span className="codex-entry-form__tags-empty">No tags added</span>
                )}
              </div>
              <form onSubmit={handleAddTag} className="codex-entry-form__tag-form">
                <input
                  type="text"
                  className="codex-entry-form__input"
                  placeholder="Add a tag..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
                <ActionButton
                  type="submit"
                  icon="plus"
                  disabled={!tagInput.trim()}
                  variant="secondary"
                  size="sm"
                >
                  Add
                </ActionButton>
              </form>
            </div>
          </motion.section>

          {/* Content */}
          <motion.section className="codex-entry-form__section" variants={ITEM_VARIANTS}>
            <div className="codex-entry-form__label-row">
              <label className="codex-entry-form__label" htmlFor="content">
                <Icon name="file-text" size={16} />
                <span>Content</span>
                <span className="codex-entry-form__required">*</span>
              </label>
              <ActionButton
                type="button"
                icon="refresh"
                onClick={handleCleanFormatting}
                variant="ghost"
                size="sm"
                disabled={!formData.content}
                title="Strip all formatting and normalize text"
              >
                Clean Formatting
              </ActionButton>
            </div>
            <p className="codex-entry-form__hint">
              Use <code>[[Entry Name]]</code> to link to other entries — start typing
              inside the brackets for suggestions
            </p>
            <div className="codex-entry-form__editor">
              <textarea
                id="content"
                ref={contentRef}
                className="codex-entry-form__textarea"
                placeholder="Write your entry content here..."
                value={formData.content}
                onChange={handleContentChange}
                onKeyDown={handleContentKeyDown}
                onPaste={(e) => handlePlainTextPaste(e)}
                onBlur={() => {
                  // Delay so a click on a suggestion still registers.
                  setTimeout(() => setSuggestions([]), 150);
                }}
                rows={20}
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
              />

              {suggestions.length > 0 && (
                <ul className="codex-entry-form__suggestions" role="listbox">
                  {suggestions.map((entry, i) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === suggestionIndex}
                        className={`codex-entry-form__suggestion ${
                          i === suggestionIndex ? 'codex-entry-form__suggestion--active' : ''
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(entry)}
                      >
                        <span className="codex-entry-form__suggestion-title">{entry.title}</span>
                        {entry.type && (
                          <span className="codex-entry-form__suggestion-type">{entry.type}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {brokenLinks.length > 0 && (
              <div className="codex-entry-form__broken-links" role="status">
                <div className="codex-entry-form__broken-links-head">
                  <Icon name="alert-triangle" size={16} />
                  <span>
                    {brokenLinks.length} link{brokenLinks.length === 1 ? '' : 's'} point
                    {brokenLinks.length === 1 ? 's' : ''} to an entry that doesn’t exist yet
                  </span>
                </div>
                <ul className="codex-entry-form__broken-links-list">
                  {[...new Set(brokenLinks)].map(name => (
                    <li key={name}><code>[[{name}]]</code></li>
                  ))}
                </ul>
                <p className="codex-entry-form__hint">
                  This isn’t an error — a link can legitimately run ahead of the entry
                  it points at. It’s here so a typo doesn’t look like a plan.
                </p>
              </div>
            )}
          </motion.section>
        </div>

        {/* Footer Actions */}
        <motion.footer className="codex-entry-form__footer" variants={ITEM_VARIANTS}>
          <ActionButton
            type="button"
            onClick={handleCancel}
            disabled={saving}
            variant="ghost"
          >
            Cancel
          </ActionButton>
          <ActionButton
            type="button"
            icon={isEditing ? 'save' : 'plus'}
            onClick={handleSave}
            disabled={saving}
            variant="primary"
          >
            {saving ? 'Saving...' : (isEditing ? 'Update Entry' : 'Create Entry')}
          </ActionButton>
        </motion.footer>
      </motion.div>
    </>
  );
}

// ============================================
// ENTRY TYPES CONFIGURATION
// ============================================

const ENTRY_TYPES = [
  { value: 'personage', label: 'Personage' },
  { value: 'house', label: 'House' },
  { value: 'location', label: 'Location' },
  { value: 'event', label: 'Event' },
  { value: 'mysteria', label: 'Mysteria' },
  { value: 'concept', label: 'Concept' },
  { value: 'heraldry', label: 'Heraldry' },
  { value: 'custom', label: 'Custom' }
];

// ============================================
// ENTRY TEMPLATES
// ============================================

const ENTRY_TEMPLATES = {
  personage: {
    content: `## Overview

[Brief description of who this person is]

## Background

**Born:** [Date/Era]
**Died:** [Date/Era, or "Living"]
**House:** [[House Name]]
**Titles:** [Any titles held]

## Life and Deeds

[Major events, accomplishments, or notable actions]

## Family

**Parents:** [[Parent 1]], [[Parent 2]]
**Spouse:** [[Spouse Name]]
**Children:** [[Child 1]], [[Child 2]]

## Legacy

[How this person is remembered or their impact on the world]`,
    defaultCategory: 'Historical Figures'
  },

  house: {
    content: `## Overview

[Brief description of this noble house/family]

## History

**Founded:** [Date/Era]
**Seat:** [[Location Name]]
**Sigil:** [Description of heraldic symbol]
**Words:** "[House motto/saying]"

## Notable Members

- [[Founder Name]] - [Brief note]
- [[Current Leader]] - [Brief note]

## Holdings and Influence

[Territories, resources, political power]

## Relations

**Allies:** [[House 1]], [[House 2]]
**Rivals:** [[House 3]]

## Current Status

[Present-day situation of the house]`,
    defaultCategory: 'Noble Houses'
  },

  location: {
    content: `## Overview

[Brief description of this place]

## Geography

**Region:** [Broader area it's part of]
**Type:** [City, fortress, forest, etc.]
**Climate:** [Weather and seasons]

## History

[How this place came to be, major events that occurred here]

## Notable Features

- [Feature 1]
- [Feature 2]
- [Feature 3]

## Inhabitants

[Who lives here, population, culture]

## Significance

[Why this place matters to your world]`,
    defaultCategory: 'Geography'
  },

  event: {
    content: `## Overview

[Brief description of what happened]

## When

**Date:** [Specific date or era]
**Duration:** [How long the event lasted]

## Where

**Location:** [[Location Name]]
**Scope:** [Local, regional, world-wide]

## Key Participants

- [[Person 1]] - [Their role]
- [[Person 2]] - [Their role]
- [[House/Faction]] - [Their involvement]

## What Happened

[Detailed account of the event]

## Consequences

[Immediate and long-term effects]

## Legacy

[How this event is remembered or changed the world]`,
    defaultCategory: 'Historical Events'
  },

  mysteria: {
    content: `## Overview

[Brief description of this magical/mysterious element]

## Nature

**Type:** [Magic system, artifact, prophecy, etc.]
**Origin:** [Where/how it came to be]

## Properties

[What it does, how it works, limitations]

## History

[First appearance, major uses, important events]

## Known Wielders/Keepers

- [[Person 1]] - [Their connection]
- [[Person 2]] - [Their connection]

## Current Status

[Where it is now, who has it, is it lost?]

## Significance

[Impact on your world and story]`,
    defaultCategory: 'Magic & Mystery'
  },

  heraldry: {
    content: `## Overview

[Brief description of this heraldic device and its significance]

## Blazon

**Technical Description:** [Formal heraldic blazon, e.g., "Argent, a lion rampant gules"]

## Symbolism

[Meaning behind the colors, charges, and design choices]

## History

**Created:** [Date/Era]
**Original Bearer:** [[Person or House Name]]
**Current Bearer:** [[Current holder]]

[History of this coat of arms - when it was granted, any modifications over time]

## Associated Houses & Bearers

- [[House Name]] - [Primary/Cadet branch]
- [[Person Name]] - [Relationship to arms]

## Heraldic Elements

**Field:** [Base color/pattern]
**Charges:** [Main symbols]
**Motto:** "[Associated motto if any]"

## Notable Appearances

[Where these arms have appeared in significant events, battles, ceremonies]

## Related Arms

- [[Related Heraldry 1]] - [Relationship, e.g., parent arms, cadet difference]
- [[Related Heraldry 2]] - [Relationship]`,
    defaultCategory: 'Heraldry'
  },

  custom: {
    content: `## Overview

[Brief description]

## Details

[Your custom content here]

## Significance

[Why this matters to your world]`,
    defaultCategory: 'Miscellaneous'
  }
};

export default CodexEntryForm;
