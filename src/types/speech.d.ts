/**
 * Web Speech API — the recognition half.
 *
 * TypeScript's `lib.dom.d.ts` ships `SpeechRecognitionAlternative`,
 * `SpeechRecognitionResult` and `SpeechRecognitionResultList`, but **not**
 * `SpeechRecognition` itself, its two event types, or the constructors on
 * `window`. Speech recognition is not in any W3C Recommendation — it is a
 * WICG draft that Chromium shipped and other engines did not — so the DOM lib
 * declares the pieces the spec settled and leaves out the ones it did not.
 *
 * Declared here rather than pulled from `@types/dom-speech-recognition`: this
 * is the only consumer, it uses six members, and a dependency whose whole
 * content is thirty lines of ambient declarations is a supply-chain surface for
 * no benefit.
 *
 * Deliberately minimal — only what `useDictation` touches. Anything added to
 * this file should be because a caller needs it, not for completeness; the
 * value of a hand-written ambient declaration is that it stays small enough to
 * check against the browser's real behaviour.
 */

interface SpeechRecognitionEvent extends Event {
  /** Index of the first result that changed in this event. */
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  /** 'not-allowed' | 'audio-capture' | 'network' | 'no-speech' | … */
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  /** Keep listening past the first phrase. Chromium still times out near 60s. */
  continuous: boolean;
  /** Emit provisional results, which drive the interim preview. */
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;

  start(): void;
  stop(): void;
  abort(): void;

  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  /** Unprefixed. Absent in every engine that has not shipped the API. */
  SpeechRecognition?: typeof SpeechRecognition;
  /** The prefixed name Chromium, Edge and Brave actually expose. */
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
