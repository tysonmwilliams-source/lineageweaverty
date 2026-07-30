/**
 * wikiLinkParser tests
 *
 * Covers the caret-span detection that drives `[[` autocomplete in the Codex
 * entry form. The failure modes here are all silent-and-annoying rather than
 * loud: a dropdown that opens on a closed link, or one that never opens at all.
 */

import { describe, it, expect } from 'vitest';
import { findLinkSpanAtCaret, extractWikiLinks } from './wikiLinkParser';

describe('findLinkSpanAtCaret', () => {
  it('finds the partial name when the caret is inside an open link', () => {
    const text = 'The lord of [[Riverh';
    const span = findLinkSpanAtCaret(text, text.length);

    expect(span).not.toBeNull();
    expect(span.query).toBe('Riverh');
    expect(span.start).toBe(14);
    expect(span.end).toBe(text.length);
  });

  it('returns an empty query immediately after the opening brackets', () => {
    const text = 'See [[';
    const span = findLinkSpanAtCaret(text, text.length);

    expect(span).not.toBeNull();
    expect(span.query).toBe('');
  });

  it('returns null when the link is already closed', () => {
    const text = 'The seat of [[Riverhead]] stands empty.';
    expect(findLinkSpanAtCaret(text, text.length)).toBeNull();
  });

  it('returns null when the caret is past a closed link but a later [[ is absent', () => {
    const text = '[[House Wilfson]] and then some prose';
    expect(findLinkSpanAtCaret(text, text.length)).toBeNull();
  });

  it('does not reach back across a newline', () => {
    const text = 'An opening [[\nnew paragraph';
    expect(findLinkSpanAtCaret(text, text.length)).toBeNull();
  });

  it('returns null when there is no [[ at all', () => {
    expect(findLinkSpanAtCaret('just prose', 10)).toBeNull();
  });

  it('uses the nearest [[ when several are open', () => {
    const text = '[[first]] then [[secon';
    const span = findLinkSpanAtCaret(text, text.length);

    expect(span.query).toBe('secon');
  });

  it('reads the caret position, not the end of the string', () => {
    const text = 'a [[Mirel]] b';
    // caret placed just after "Mirel", before the closing brackets
    const span = findLinkSpanAtCaret(text, 9);

    expect(span).not.toBeNull();
    expect(span.query).toBe('Mirel');
  });

  it('handles a caret at position 0 without throwing', () => {
    expect(findLinkSpanAtCaret('[[x', 0)).toBeNull();
  });

  it('rejects malformed arguments rather than throwing', () => {
    expect(findLinkSpanAtCaret(null, 3)).toBeNull();
    expect(findLinkSpanAtCaret('text', -1)).toBeNull();
    expect(findLinkSpanAtCaret('text', undefined)).toBeNull();
  });
});

describe('extractWikiLinks', () => {
  it('extracts every link target from markdown', () => {
    const links = extractWikiLinks('See [[Riverhead]] and [[House Wilfson]].');
    const targets = links.map(l => l.search);

    expect(targets).toContain('Riverhead');
    expect(targets).toContain('House Wilfson');
  });

  it('returns an empty array for prose with no links', () => {
    expect(extractWikiLinks('no links here')).toEqual([]);
  });
});
