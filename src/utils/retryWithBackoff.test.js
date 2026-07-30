/**
 * retryWithBackoff Tests
 *
 * Tests for exponential backoff retry utility including:
 * - Successful execution without retries
 * - Retry behavior on failures
 * - Exponential delay calculation
 * - Error classification (retryable vs non-retryable)
 * - Maximum retry limits
 * - Callback invocation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  retryWithBackoff,
  createRetryWrapper,
  SYNC_RETRY_CONFIG
} from './retryWithBackoff';

// Import the internal function for testing
import retryModule from './retryWithBackoff';
const { isRetryableError } = retryModule;

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Successful Execution', () => {
    it('should return result on first try success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const resultPromise = retryWithBackoff(fn);
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should return result after successful retry', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success after retry');

      const resultPromise = retryWithBackoff(fn, { jitter: false });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success after retry');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Retry Behavior', () => {
    it('should retry on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockRejectedValueOnce({ code: 'internal' })
        .mockResolvedValue('success');

      const resultPromise = retryWithBackoff(fn, { jitter: false });
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue({ code: 'permission-denied' });

      const promise = retryWithBackoff(fn);

      await expect(promise).rejects.toEqual({ code: 'permission-denied' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted', async () => {
      const originalError = { code: 'unavailable', message: 'Service unavailable' };
      const fn = vi.fn().mockRejectedValue(originalError);

      // The rejection handler MUST be attached before runAllTimersAsync flushes
      // the retry delays — otherwise the promise rejects while nothing is
      // listening and Node reports an unhandled rejection (which fails the run
      // even though every assertion passes).
      const settled = retryWithBackoff(fn, { maxRetries: 2, jitter: false })
        .catch(e => e);
      await vi.runAllTimersAsync();

      const thrownError = await settled;

      expect(thrownError.message).toContain('3 attempts');
      expect(thrownError.originalError).toEqual(originalError);
      expect(thrownError.attempts).toBe(3);
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Delay Calculation', () => {
    it('should use exponential backoff', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success');

      const delays = [];
      const promise = retryWithBackoff(fn, {
        initialDelay: 100,
        backoffFactor: 2,
        jitter: false,
        onRetry: (attempt, error, delay) => {
          delays.push(delay);
        }
      });

      await vi.runAllTimersAsync();
      await promise;

      // First retry: 100ms, Second retry: 200ms
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
    });

    it('should cap delay at maxDelay', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success');

      const delays = [];
      const promise = retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 150,
        backoffFactor: 2,
        jitter: false,
        onRetry: (attempt, error, delay) => {
          delays.push(delay);
        }
      });

      await vi.runAllTimersAsync();
      await promise;

      // Delays: 100, 200 (capped to 150), 400 (capped to 150)
      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(150);
      expect(delays[2]).toBe(150);
    });

    it('should add jitter when enabled', async () => {
      vi.useRealTimers(); // Need real timers for random jitter

      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable' })
        .mockResolvedValue('success');

      const delays = [];
      await retryWithBackoff(fn, {
        initialDelay: 100,
        jitter: true,
        onRetry: (attempt, error, delay) => {
          delays.push(delay);
        }
      });

      // With 25% jitter on 100ms base, delay should be between 75-125ms
      expect(delays[0]).toBeGreaterThanOrEqual(75);
      expect(delays[0]).toBeLessThanOrEqual(125);

      vi.useFakeTimers(); // Restore for other tests
    });
  });

  describe('Custom Retry Condition', () => {
    it('should use custom retryOn function', async () => {
      const customRetryOn = vi.fn()
        .mockReturnValueOnce(true)   // Retry first error
        .mockReturnValueOnce(false); // Don't retry second error

      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockRejectedValueOnce(new Error('Second error'));

      // Attach the handler before flushing timers (see note above), and assert
      // on the captured error rather than inside a catch block — a catch-block
      // assertion silently passes if the promise never rejects at all.
      const settled = retryWithBackoff(fn, {
        retryOn: customRetryOn,
        jitter: false
      }).catch(e => e);

      await vi.runAllTimersAsync();

      const error = await settled;
      expect(error.message).toBe('Second error');
      expect(customRetryOn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Callbacks', () => {
    it('should call onRetry callback on each retry', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'unavailable', message: 'fail1' })
        .mockRejectedValueOnce({ code: 'unavailable', message: 'fail2' })
        .mockResolvedValue('success');

      const promise = retryWithBackoff(fn, {
        onRetry,
        jitter: false,
        initialDelay: 100
      });

      await vi.runAllTimersAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Object), 100);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Object), 200);
    });
  });
});

describe('isRetryableError', () => {
  it('should identify network fetch errors as retryable', () => {
    const error = new TypeError('Failed to fetch');
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify Firebase unavailable error as retryable', () => {
    const error = { code: 'unavailable', message: 'Service unavailable' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify Firebase deadline-exceeded error as retryable', () => {
    const error = { code: 'deadline-exceeded', message: 'Deadline exceeded' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify Firebase resource-exhausted error as retryable', () => {
    const error = { code: 'resource-exhausted', message: 'Quota exceeded' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify Firebase internal error as retryable', () => {
    const error = { code: 'internal', message: 'Internal error' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify HTTP 429 (rate limit) as retryable', () => {
    const error = { status: 429, message: 'Too many requests' };
    expect(isRetryableError(error)).toBe(true);
  });

  it('should identify HTTP 5xx errors as retryable', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 502 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 504 })).toBe(true);
  });

  it('should identify network-related messages as retryable', () => {
    expect(isRetryableError({ message: 'Network error occurred' })).toBe(true);
    expect(isRetryableError({ message: 'Connection timeout' })).toBe(true);
    expect(isRetryableError({ message: 'Connection refused' })).toBe(true);
  });

  it('should NOT identify permission-denied as retryable', () => {
    const error = { code: 'permission-denied', message: 'No access' };
    expect(isRetryableError(error)).toBe(false);
  });

  it('should NOT identify HTTP 4xx errors (except 429) as retryable', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 404 })).toBe(false);
  });

  it('should NOT identify generic errors as retryable', () => {
    const error = new Error('Something went wrong');
    expect(isRetryableError(error)).toBe(false);
  });
});

describe('createRetryWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a reusable retry wrapper', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 1, jitter: false });

    const fn = vi.fn()
      .mockRejectedValueOnce({ code: 'unavailable' })
      .mockResolvedValue('success');

    const promise = wrapper(fn);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should apply same config to multiple functions', async () => {
    const wrapper = createRetryWrapper({ maxRetries: 0, jitter: false });

    const fn1 = vi.fn().mockRejectedValue({ code: 'unavailable' });
    const fn2 = vi.fn().mockRejectedValue({ code: 'unavailable' });

    // Both handlers attached at creation, before timers are flushed (see note
    // in 'should throw after max retries exhausted').
    const settled1 = wrapper(fn1).catch(e => e);
    const settled2 = wrapper(fn2).catch(e => e);

    await vi.runAllTimersAsync();

    const error1 = await settled1;
    const error2 = await settled2;

    expect(error1.attempts).toBe(1);
    expect(error2.attempts).toBe(1);
  });
});

describe('SYNC_RETRY_CONFIG', () => {
  it('should have expected configuration values', () => {
    expect(SYNC_RETRY_CONFIG.maxRetries).toBe(3);
    expect(SYNC_RETRY_CONFIG.initialDelay).toBe(1000);
    expect(SYNC_RETRY_CONFIG.maxDelay).toBe(15000);
    expect(SYNC_RETRY_CONFIG.backoffFactor).toBe(2);
    expect(SYNC_RETRY_CONFIG.jitter).toBe(true);
    expect(SYNC_RETRY_CONFIG.onRetry).toBeInstanceOf(Function);
  });
});
