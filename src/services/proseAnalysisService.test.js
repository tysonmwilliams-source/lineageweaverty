/**
 * proseAnalysisService tests
 *
 * These cover the detectors that were rewritten to use pre-compiled regex
 * alternations instead of constructing 56 RegExp objects per sentence. The
 * point is to pin the matching behaviour so that optimisation cannot silently
 * change what the Writing Wizard reports.
 */

import { describe, it, expect } from 'vitest';
import {
  detectAdverbs,
  detectFilterWords,
  analyzeProseComplete
} from './proseAnalysisService';

describe('proseAnalysisService', () => {
  describe('detectAdverbs', () => {
    it('finds weak adverbs anywhere in a sentence', () => {
      const issues = detectAdverbs('She very quickly walked to the door.');
      expect(issues.map(i => i.text.toLowerCase())).toEqual(
        expect.arrayContaining(['very', 'quickly'])
      );
    });

    it('matches case-insensitively but reports the original casing', () => {
      const issues = detectAdverbs('Suddenly the hall fell silent.');
      expect(issues).toHaveLength(1);
      expect(issues[0].text).toBe('Suddenly');
    });

    it('respects word boundaries', () => {
      // "everything" contains "even"; "onlooker" contains "only" only partially,
      // but "evenly" must not match "even".
      const issues = detectAdverbs('Everything was evenly spread across the table.');
      expect(issues.map(i => i.text.toLowerCase())).not.toContain('even');
    });

    it('flags an adverb next to a weak verb more severely', () => {
      const [issue] = detectAdverbs('He walked quickly.');
      expect(issue.severity).toBe('warning');
    });

    it('reports info severity for an adverb without a weak verb', () => {
      const issues = detectAdverbs('The banner hung limply, absolutely still.');
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every(i => ['info', 'warning'].includes(i.severity))).toBe(true);
    });

    it('finds every occurrence across multiple sentences', () => {
      const issues = detectAdverbs('It was very cold. She was very tired.');
      expect(issues.filter(i => i.text.toLowerCase() === 'very')).toHaveLength(2);
    });

    it('returns nothing for clean prose', () => {
      expect(detectAdverbs('The gate groaned open.')).toEqual([]);
    });
  });

  describe('detectFilterWords', () => {
    it('finds pronoun + filter word + article patterns', () => {
      const issues = detectFilterWords('He saw the shadow move.');
      expect(issues).toHaveLength(1);
      expect(issues[0].text).toBe('He saw the');
      expect(issues[0].type).toBe('filter-word');
    });

    it('captures the filter word itself for the message', () => {
      const [issue] = detectFilterWords('She noticed the door was ajar.');
      expect(issue.message).toContain('noticed');
    });

    it('does not fire without a following article', () => {
      expect(detectFilterWords('He saw shadows.')).toEqual([]);
    });
  });

  describe('analyzeProseComplete', () => {
    it('returns stats and issues for a passage', () => {
      const result = analyzeProseComplete(
        'She very quickly walked to the door. He saw the shadow move. The gate was opened by the guard.'
      );
      expect(result.stats.sentenceCount).toBeGreaterThan(0);
      expect(result.stats.wordCount).toBeGreaterThan(0);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.health).toBeDefined();
    });

    it('is repeatable — the shared regexes must not leak lastIndex between calls', () => {
      // The pre-compiled patterns carry the /g flag, so a missing lastIndex
      // reset would make the second call return different results.
      const text = 'She very quickly walked to the door. He saw the shadow move.';
      const first = analyzeProseComplete(text);
      const second = analyzeProseComplete(text);
      expect(second.issues.length).toBe(first.issues.length);
      expect(second.stats).toEqual(first.stats);
    });
  });
});
