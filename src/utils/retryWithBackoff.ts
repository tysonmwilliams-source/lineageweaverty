/**
 * retryWithBackoff.js - Exponential Backoff Retry Utility
 *
 * PURPOSE:
 * Provides reliable retry logic for async operations (especially cloud sync)
 * using exponential backoff to avoid overwhelming servers when they're stressed.
 *
 * EXPONENTIAL BACKOFF:
 * Each retry waits longer: 1s → 2s → 4s → 8s → 16s (capped at maxDelay)
 * This prevents "thundering herd" problems when services recover.
 *
 * USAGE:
 * const result = await retryWithBackoff(
 *   () => uploadToCloud(data),
 *   { maxRetries: 3, initialDelay: 1000 }
 * );
 */

/**
 * How hard to try, and when to give up.
 *
 * Every field is optional; `DEFAULT_CONFIG` supplies the rest. `retryOn` and
 * `onRetry` are the two hooks callers actually use — the sync layer passes
 * `onRetry` to log each attempt.
 */
/**
 * The error thrown once every attempt has failed.
 *
 * Carries the last underlying error and the attempt count as extra properties,
 * which is what the sync layer's logs read.
 */
export interface RetriedError extends Error {
  originalError?: unknown;
  attempts?: number;
}

export interface RetryConfig {
  maxRetries?: number;
  /** Milliseconds before the first retry. Doubles from there. */
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  /** Spread retries by ±25% so simultaneous failures do not resynchronise. */
  jitter?: boolean;
  /** Return false to give up on this error rather than retrying. */
  retryOn?: ((error: unknown) => boolean) | null;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}


/**
 * Default configuration for retry behavior
 */
import { logger } from './logger';
import { errorMessage } from './errorMessage';

const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000,    // 30 seconds max
  backoffFactor: 2,   // Double each time
  jitter: true,       // Add randomness to prevent synchronized retries
  retryOn: null,      // Custom function to decide if we should retry
};

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a given attempt with optional jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} config - Retry configuration
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt: number, config: Required<Pick<RetryConfig, 'initialDelay' | 'maxDelay' | 'backoffFactor' | 'jitter'>>): number {
  const { initialDelay, maxDelay, backoffFactor, jitter } = config;

  // Exponential backoff: delay = initialDelay * (backoffFactor ^ attempt)
  let delay = initialDelay * Math.pow(backoffFactor, attempt);

  // Cap at maxDelay
  delay = Math.min(delay, maxDelay);

  // Add jitter (±25%) to prevent synchronized retries
  if (jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + (Math.random() * jitterRange * 2);
  }

  return Math.floor(delay);
}

/**
 * Check if an error is retryable
 * Network errors and 5xx server errors are typically retryable.
 * 4xx client errors (except 429 rate limit) are usually not.
 *
 * @param {Error} error - The error to check
 * @returns {boolean} Whether to retry
 */
function isRetryableError(error: unknown): boolean {
  // Errors reach here from three sources with three different discriminators:
  // `fetch` throws a TypeError, the Firebase SDK sets `code`, and HTTP layers
  // set `status`. Narrowed once rather than at each check below.
  const err = error as { name?: string; message?: string; code?: string; status?: number };

  // Network errors are retryable
  if (err.name === 'TypeError' && err.message?.includes('fetch')) {
    return true;
  }

  // Firebase/Firestore specific errors
  if (err.code) {
    const retryableCodes = [
      'unavailable',
      'deadline-exceeded',
      'resource-exhausted',
      'aborted',
      'internal',
      'unknown',
    ];
    return retryableCodes.includes(err.code);
  }

  // HTTP status codes (if error has status)
  if (err.status) {
    // 429 = Too Many Requests (rate limited) - retry with backoff
    // 5xx = Server errors - retry
    return err.status === 429 || (err.status >= 500 && err.status < 600);
  }

  // Default: retry network-like errors. `?? false` because an error with no
  // message yields undefined here, and this function promises a boolean.
  const message = err.message?.toLowerCase();
  return (message?.includes('network')
       || message?.includes('timeout')
       || message?.includes('connection')) ?? false;
}

/**
 * Execute an async function with exponential backoff retry
 *
 * @template T
 * @param {() => Promise<T>} fn - Async function to execute
 * @param {Object} [options] - Retry configuration
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.maxDelay=30000] - Maximum delay in ms
 * @param {number} [options.backoffFactor=2] - Multiplier for each retry
 * @param {boolean} [options.jitter=true] - Add randomness to delays
 * @param {(error: Error) => boolean} [options.retryOn] - Custom retry condition
 * @param {(attempt: number, error: Error, delay: number) => void} [options.onRetry] - Callback on retry
 * @returns {Promise<T>} Result of the function
 * @throws {Error} Last error if all retries fail
 *
 * @example
 * const data = await retryWithBackoff(
 *   () => fetch('/api/data').then(r => r.json()),
 *   {
 *     maxRetries: 3,
 *     onRetry: (attempt: number, error: unknown, delay: number) => {
 *       console.log(`Retry ${attempt}, waiting ${delay}ms: ${error.message}`);
 *     }
 *   }
 * );
 */
export async function retryWithBackoff<T>(fn: () => Promise<T> | T, options: RetryConfig = {}): Promise<T> {
  const config = { ...DEFAULT_CONFIG, ...options };
  const { maxRetries, retryOn, onRetry } = config;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute the function
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt >= maxRetries) {
        break;
      }

      // Check if this error is retryable
      const shouldRetry = retryOn
        ? retryOn(error)
        : isRetryableError(error);

      if (!shouldRetry) {
        // Not a retryable error, throw immediately
        throw error;
      }

      // Calculate delay for this attempt
      const delay = calculateDelay(attempt, config);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, error, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  const retriedError: RetriedError = new Error(
    `Operation failed after ${maxRetries + 1} attempts: ${errorMessage(lastError)}`
  );
  retriedError.originalError = lastError;
  retriedError.attempts = maxRetries + 1;
  throw retriedError;
}

/**
 * Create a retry wrapper for a specific function
 * Useful for wrapping multiple sync operations with the same config.
 *
 * @template T
 * @param {Object} options - Retry configuration
 * @returns {(fn: () => Promise<T>) => Promise<T>} Wrapped retry function
 *
 * @example
 * const syncWithRetry = createRetryWrapper({ maxRetries: 3 });
 * await syncWithRetry(() => uploadPerson(data));
 * await syncWithRetry(() => uploadHouse(data));
 */
export function createRetryWrapper(options: RetryConfig = {}) {
  return <T>(fn: () => Promise<T> | T) => retryWithBackoff(fn, options);
}

/**
 * Sync-specific retry configuration
 * More aggressive retries for cloud sync operations
 */
export const SYNC_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 15000,
  backoffFactor: 2,
  jitter: true,
  onRetry: (attempt: number, error: unknown, delay: number) => {
    logger.log(`☁️ Sync retry ${attempt}, waiting ${delay}ms: ${errorMessage(error)}`);
  }
} satisfies RetryConfig;

export default {
  retryWithBackoff,
  createRetryWrapper,
  isRetryableError,
  SYNC_RETRY_CONFIG
};
