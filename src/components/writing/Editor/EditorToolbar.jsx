/**
 * EditorToolbar.jsx - Rich Text Formatting Toolbar
 *
 * Provides formatting controls for the TipTap editor.
 */

import { useCallback } from 'react';
import Icon from '../../icons';
import useDictation from '../../../hooks/useDictation';
import './EditorToolbar.css';

/**
 * ToolbarButton Component
 */
function ToolbarButton({ icon, label, isActive, onClick, disabled }) {
  return (
    <button
      className={`toolbar-btn ${isActive ? 'toolbar-btn--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      type="button"
    >
      <Icon name={icon} size={18} strokeWidth={2} />
    </button>
  );
}

/**
 * ToolbarDivider Component
 */
function ToolbarDivider() {
  return <div className="toolbar-divider" />;
}

/**
 * EditorToolbar Component
 *
 * @param {Object} props
 * @param {Object} props.editor - TipTap editor instance
 * @param {Function} props.onInsertWikiLink - Callback to insert wiki-link
 */
export default function EditorToolbar({ editor, onInsertWikiLink }) {
  // Helper to check if editor is ready for commands
  // Must be defined before any conditional returns (rules of hooks)
  const isEditorReady = useCallback(() => {
    return editor && editor.view && !editor.isDestroyed;
  }, [editor]);

  // Dictation
  const {
    isListening,
    isSupported: isDictationSupported,
    interimText,
    error: dictationError,
    toggleDictation,
  } = useDictation({ editor, enabled: !!editor });

  // Text formatting - all hooks must be before conditional returns
  const toggleBold = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleBold().run();
  }, [editor]);

  const toggleItalic = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleItalic().run();
  }, [editor]);

  const toggleStrike = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleStrike().run();
  }, [editor]);

  // Headings
  const toggleHeading = useCallback((level) => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  // Paragraph
  const setParagraph = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().setParagraph().run();
  }, [editor]);

  // Lists
  const toggleBulletList = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleBulletList().run();
  }, [editor]);

  const toggleOrderedList = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  // Block elements
  const toggleBlockquote = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().toggleBlockquote().run();
  }, [editor]);

  const setHorizontalRule = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().setHorizontalRule().run();
  }, [editor]);

  // History
  const undo = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().undo().run();
  }, [editor]);

  const redo = useCallback(() => {
    if (!editor || !editor.view || editor.isDestroyed) return;
    editor.chain().focus().redo().run();
  }, [editor]);

  // Now we can do conditional returns after all hooks
  if (!editor || typeof editor.chain !== 'function' || !editor.view) {
    return <div className="editor-toolbar editor-toolbar--disabled" />;
  }

  return (
    <div className="editor-toolbar">
      {/* History */}
      <div className="toolbar-group">
        <ToolbarButton
          icon="undo"
          label="Undo (Ctrl+Z)"
          onClick={undo}
          disabled={!isEditorReady() || !editor.can().undo()}
        />
        <ToolbarButton
          icon="redo"
          label="Redo (Ctrl+Y)"
          onClick={redo}
          disabled={!isEditorReady() || !editor.can().redo()}
        />
      </div>

      <ToolbarDivider />

      {/* Text formatting */}
      <div className="toolbar-group">
        <ToolbarButton
          icon="bold"
          label="Bold (Ctrl+B)"
          isActive={isEditorReady() && editor.isActive('bold')}
          onClick={toggleBold}
        />
        <ToolbarButton
          icon="italic"
          label="Italic (Ctrl+I)"
          isActive={isEditorReady() && editor.isActive('italic')}
          onClick={toggleItalic}
        />
        <ToolbarButton
          icon="strikethrough"
          label="Strikethrough"
          isActive={isEditorReady() && editor.isActive('strike')}
          onClick={toggleStrike}
        />
      </div>

      <ToolbarDivider />

      {/* Headings */}
      <div className="toolbar-group">
        <ToolbarButton
          icon="pilcrow"
          label="Paragraph"
          isActive={isEditorReady() && editor.isActive('paragraph') && !editor.isActive('heading')}
          onClick={setParagraph}
        />
        <ToolbarButton
          icon="heading-1"
          label="Heading 1"
          isActive={isEditorReady() && editor.isActive('heading', { level: 1 })}
          onClick={() => toggleHeading(1)}
        />
        <ToolbarButton
          icon="heading-2"
          label="Heading 2"
          isActive={isEditorReady() && editor.isActive('heading', { level: 2 })}
          onClick={() => toggleHeading(2)}
        />
        <ToolbarButton
          icon="heading-3"
          label="Heading 3"
          isActive={isEditorReady() && editor.isActive('heading', { level: 3 })}
          onClick={() => toggleHeading(3)}
        />
      </div>

      <ToolbarDivider />

      {/* Lists */}
      <div className="toolbar-group">
        <ToolbarButton
          icon="list"
          label="Bullet List"
          isActive={isEditorReady() && editor.isActive('bulletList')}
          onClick={toggleBulletList}
        />
        <ToolbarButton
          icon="list-ordered"
          label="Numbered List"
          isActive={isEditorReady() && editor.isActive('orderedList')}
          onClick={toggleOrderedList}
        />
      </div>

      <ToolbarDivider />

      {/* Block elements */}
      <div className="toolbar-group">
        <ToolbarButton
          icon="quote"
          label="Blockquote"
          isActive={isEditorReady() && editor.isActive('blockquote')}
          onClick={toggleBlockquote}
        />
        <ToolbarButton
          icon="minus"
          label="Horizontal Rule"
          onClick={setHorizontalRule}
        />
      </div>

      <ToolbarDivider />

      {/* Wiki-Link (Phase 3) */}
      <div className="toolbar-group">
        <button
          className="toolbar-btn toolbar-btn--wiki"
          onClick={onInsertWikiLink}
          title="Insert Wiki Link (type [[)"
          type="button"
        >
          <Icon name="link" size={18} strokeWidth={2} />
          <span className="toolbar-btn__label">[[Link]]</span>
        </button>
      </div>

      {/* Dictation */}
      {isDictationSupported && (
        <>
          <ToolbarDivider />
          <div className="toolbar-group toolbar-group--dictation">
            <button
              className={`toolbar-btn toolbar-btn--dictation ${isListening ? 'toolbar-btn--recording' : ''}`}
              onClick={toggleDictation}
              title={isListening ? 'Stop Dictation (Ctrl+Shift+D)' : 'Start Dictation (Ctrl+Shift+D)'}
              type="button"
            >
              <Icon name="mic" size={18} strokeWidth={2} />
              {isListening && <span className="toolbar-btn__recording-dot" />}
            </button>
            {interimText && (
              <span className="toolbar-dictation-preview" title={interimText}>
                {interimText.length > 40 ? '...' + interimText.slice(-40) : interimText}
              </span>
            )}
            {dictationError && (
              <span className="toolbar-dictation-error" title={dictationError}>
                <Icon name="alert-circle" size={14} strokeWidth={2} />
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
