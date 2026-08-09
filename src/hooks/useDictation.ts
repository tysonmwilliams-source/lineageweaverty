/**
 * Web Speech API dictation for the TipTap editor.
 *
 * Provides speech-to-text dictation for the TipTap editor using the
 * native Web Speech API (built into Chromium/Brave/Chrome/Edge).
 *
 * Features:
 * - Real-time interim preview without polluting editor undo history
 * - Auto-restart on browser ~60s timeout for continuous dictation
 * - Keyboard shortcut: Ctrl+Shift+D / Cmd+Shift+D
 * - Graceful error handling for mic permission, network, etc.
 * - Lazy recognition instance creation (no mic prompt until user clicks)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/react';

const SpeechRecognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : null;

export interface DictationOptions {
  /** The editor to insert into. Null while it is still mounting. */
  editor: Editor | null;
  enabled?: boolean;
}

export interface Dictation {
  isListening: boolean;
  /** Provisional text, shown as a preview and never written to the document. */
  interimText: string;
  error: string | null;
  isSupported: boolean;
  toggleDictation: () => void;
  startDictation: () => void;
  stopDictation: () => void;
}

export default function useDictation({ editor, enabled = true }: DictationOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isSupported = !!SpeechRecognition;

  // Refs for stable access in event handlers (avoids stale closures)
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const intentionalStopRef = useRef(false);
  const editorRef = useRef(editor);

  // Keep editor ref current
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Mirror isListening state to ref
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const createRecognition = useCallback(() => {
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setError(null);
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const currentEditor = editorRef.current;
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // `results` is a live list indexed from `resultIndex`, so a gap is not
        // reachable — but `noUncheckedIndexedAccess` cannot know that, and an
        // assertion here would be the one place a real gap could hide.
        const alternative = result?.[0];
        if (!alternative) continue;

        if (result.isFinal) {
          finalTranscript += alternative.transcript;
        } else {
          interim += alternative.transcript;
        }
      }

      // Insert final results into the editor
      if (finalTranscript && currentEditor && !currentEditor.isDestroyed) {
        currentEditor.chain().focus().insertContent(finalTranscript + ' ').run();
        setInterimText('');
      }

      // Update interim preview
      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'not-allowed':
          setError('Microphone access denied. Check browser permissions.');
          intentionalStopRef.current = true;
          setIsListening(false);
          break;
        case 'audio-capture':
          setError('No microphone found.');
          intentionalStopRef.current = true;
          setIsListening(false);
          break;
        case 'network':
          setError('Network error. Speech recognition requires an internet connection.');
          intentionalStopRef.current = true;
          setIsListening(false);
          break;
        case 'no-speech':
          // Normal during pauses — onend will auto-restart
          break;
        default:
          setError(`Speech recognition error: ${event.error}`);
          break;
      }
    };

    recognition.onend = () => {
      if (isListeningRef.current && !intentionalStopRef.current) {
        // Auto-restart after browser timeout
        try {
          recognition.start();
        } catch (e) {
          // Already started or other error — stop gracefully
          setIsListening(false);
          setInterimText('');
        }
      } else {
        setIsListening(false);
        setInterimText('');
      }
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const toggleDictation = useCallback(() => {
    if (!isSupported) return;

    if (isListeningRef.current) {
      // Stop dictation
      intentionalStopRef.current = true;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      // Start dictation
      const currentEditor = editorRef.current;
      if (currentEditor && !currentEditor.isDestroyed) {
        currentEditor.commands.focus();
      }

      intentionalStopRef.current = false;
      setError(null);

      // Create instance lazily
      if (!recognitionRef.current) {
        createRecognition();
      }

      try {
        // `createRecognition` returns null when the API is missing, leaving the
        // ref null — and calling through a null ref threw a TypeError that this
        // same catch reported. Throwing explicitly keeps that outcome identical
        // rather than becoming a silent `?.` no-op.
        if (!recognitionRef.current) throw new Error('Speech recognition is unavailable');
        recognitionRef.current.start();
      } catch (e) {
        // Handle InvalidStateError if already started
        setError('Could not start speech recognition. Please try again.');
      }
    }
  }, [isSupported, createRecognition]);

  // Keyboard shortcut: Ctrl+Shift+D / Cmd+Shift+D
  useEffect(() => {
    if (!enabled || !isSupported) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        toggleDictation();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isSupported, toggleDictation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        intentionalStopRef.current = true;
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    interimText,
    error,
    toggleDictation
  };
}
