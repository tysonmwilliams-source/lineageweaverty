/**
 * TipTapEditor.jsx - Rich Text Editor Component
 *
 * A TipTap (ProseMirror-based) editor for the Writing Studio.
 * Supports rich text formatting, wiki-links, and word counting.
 */

import { useEffect, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import WikiLink from './WikiLinkExtension';
import { WikiLinkSuggestionList } from './WikiLinkSuggestion';
import { searchEntities, getRecentEntities } from '../../../services/entitySearchService';
import './TipTapEditor.css';
import './WikiLinkSuggestion.css';

/**
 * Create suggestion configuration for WikiLink
 */
function createSuggestion(datasetId) {
  return {
    items: async ({ query }) => {
      if (query.length === 0) {
        // Show recent entities when no query
        return await getRecentEntities(datasetId, 3);
      }
      return await searchEntities(query, datasetId, { limit: 8 });
    },

    render: () => {
      let component;
      let popup;

      return {
        onStart: (props) => {
          component = new ReactRenderer(WikiLinkSuggestionList, {
            props,
            editor: props.editor
          });

          if (!props.clientRect) {
            return;
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            offset: [0, 8]
          });
        },

        onUpdate: (props) => {
          component?.updateProps(props);

          if (!props.clientRect) {
            return;
          }

          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect
          });
        },

        onKeyDown: (props) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }

          return component?.ref?.onKeyDown(props);
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        }
      };
    }
  };
}

/**
 * TipTapEditor Component
 *
 * @param {Object} props
 * @param {Object} props.content - TipTap JSON content
 * @param {Function} props.onUpdate - Called on content change with { editor }
 * @param {Function} props.onEditorReady - Called when editor is ready with editor instance
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.editable - Whether the editor is editable
 * @param {string} props.datasetId - Dataset ID for entity search
 * @param {Function} props.onWikiLinkClick - Callback when a wiki-link is clicked
 */
const TipTapEditor = forwardRef(function TipTapEditor({
  content,
  onUpdate,
  onEditorReady,
  placeholder = 'Start writing your story...',
  editable = true,
  datasetId = null,
  onWikiLinkClick
}, ref) {
  // Use refs for callbacks to prevent infinite loops
  const onUpdateRef = useRef(onUpdate);
  const onEditorReadyRef = useRef(onEditorReady);
  const onWikiLinkClickRef = useRef(onWikiLinkClick);
  const initialContentRef = useRef(content);
  const hasInitialized = useRef(false);

  // Keep refs up to date
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onEditorReadyRef.current = onEditorReady;
    onWikiLinkClickRef.current = onWikiLinkClick;
  });

  // Memoize the suggestion config to prevent recreation
  const suggestionConfig = useMemo(
    () => createSuggestion(datasetId),
    [datasetId]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure heading levels
        heading: {
          levels: [1, 2, 3]
        },
        // TipTap 3 renamed the history extension to undoRedo; the old key was
        // silently ignored, so depth/newGroupDelay never applied.
        undoRedo: {
          depth: 100,
          newGroupDelay: 500
        }
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      }),
      CharacterCount.configure({
        wordCounter: (text) => {
          // Split on whitespace and filter empty strings
          return text.trim().split(/\s+/).filter(word => word.length > 0).length;
        }
      }),
      WikiLink.configure({
        suggestion: suggestionConfig
      })
    ],
    content: initialContentRef.current || '',
    editable,
    onUpdate: ({ editor }) => {
      if (onUpdateRef.current) {
        onUpdateRef.current({ editor });
      }
    },
    onCreate: ({ editor }) => {
      hasInitialized.current = true;
      if (onEditorReadyRef.current) {
        onEditorReadyRef.current(editor);
      }
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor__content',
        spellcheck: 'true'
      },
      handleClick: (view, pos, event) => {
        // Handle wiki-link clicks
        const target = event.target;
        if (target.classList.contains('wiki-link') && onWikiLinkClickRef.current) {
          const id = target.getAttribute('data-id');
          const type = target.getAttribute('data-type');
          const label = target.getAttribute('data-label');
          if (id && type) {
            onWikiLinkClickRef.current({ id: parseInt(id), type, label });
            return true;
          }
        }
        return false;
      }
    }
  });

  // Expose editor methods via ref
  useImperativeHandle(ref, () => ({
    getEditor: () => editor,
    getContent: () => editor?.getJSON(),
    getHTML: () => editor?.getHTML(),
    getText: () => editor?.getText(),
    getWordCount: () => editor?.storage.characterCount.words() || 0,
    focus: () => editor?.commands.focus(),
    clear: () => editor?.commands.clearContent(),
    setContent: (content) => editor?.commands.setContent(content)
  }), [editor]);

  // Update content when prop changes (for chapter switching only)
  // Track what content we've set to avoid loops
  const lastSetContentRef = useRef(null);

  useEffect(() => {
    if (!editor || !hasInitialized.current) return;

    // Stringify for comparison
    const contentStr = JSON.stringify(content);

    // Only update if this is new content from props (chapter switch)
    // and not content we just set ourselves
    if (contentStr !== lastSetContentRef.current) {
      const currentStr = JSON.stringify(editor.getJSON());

      // Only set if different from what's in the editor
      if (contentStr !== currentStr) {
        // emitUpdate: false prevents an infinite loop where
        // save -> setActiveChapter -> content prop change -> setContent -> onUpdate -> save.
        //
        // TipTap 3's signature is setContent(content, options). Passing a bare
        // `false` as the second argument meant options.emitUpdate destructured
        // to undefined and defaulted to TRUE — so every chapter switch fired
        // onUpdate and saved content the editor had only just loaded.
        editor.commands.setContent(content || '', { emitUpdate: false });
      }

      // Always update the ref to prevent repeated comparisons
      lastSetContentRef.current = contentStr;
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  if (!editor) {
    return (
      <div className="tiptap-editor tiptap-editor--loading">
        <div className="tiptap-editor__loading-text">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="tiptap-editor">
      <EditorContent editor={editor} />
    </div>
  );
});

export default TipTapEditor;
