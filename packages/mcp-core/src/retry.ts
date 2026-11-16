/**
 * Retry Utility with Exponential Backoff
 *
 * - Exponential backoff with full jitter
 * - Per-attempt timeouts
 *
 * The circuit breaker was removed on 2026-11-16 (docs/research/feature-review-vs-dsh-2026-11.md):
 * dsh does not put one in front of LLM calls either, and for a single-user desktop app a clear
 * failure is easier to understand than an automatic open circuit.
 */

import type { RetryConfig } from "@ai-chatbox/shared";
import { DEFAULT_RETRY_CONFIG } from "@ai-chatbox/shared";

export interface RetryEventCallback {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: Error;
  statusCode?: number;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Full jitter: random value between 0 and calculated delay
    // Prevents thundering herd when multiple clients retry simultaneously
    return Math.random() * cappedDelay;
  }
  return cappedDelay;
}

/**
 * Extract HTTP status code from error
 */
function extractStatusCode(error: unknown): number | undefined {
  if (error instanceof Error) {
    // Check for status in error message (common pattern)
    const statusMatch = error.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (status >= 400 && status < 600) {
        return status;
      }
    }

    // Check for status property on error object
    const errorObj = error as Error & { status?: number; statusCode?: number };
    return errorObj.status || errorObj.statusCode;
  }
  return undefined;
}

/**
 * Check if an error is retryable based on status code
 */
function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof Error) {
    // AbortError - never retry (user cancelled)
    if (error.name === "AbortError") return false;

    // Check HTTP status
    const statusCode = extractStatusCode(error);
    if (statusCode && config.retryableStatusCodes.includes(statusCode)) {
      return true;
    }

    // Network errors are retryable
    const networkPatterns = [
      "network",
      "fetch",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "socket hang up",
      "connection refused",
    ];
    const errorMessage = error.message.toLowerCase();
    if (networkPatterns.some((pattern) => errorMessage.includes(pattern.toLowerCase()))) {
      return true;
    }
  }
  return false;
}

/**
 * Sleep helper with abort signal support
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Retry wrapper for async operations with exponential backoff
 *
 * @param operation - The async operation to retry. Receives an AbortSignal for per-attempt timeout.
 * @param config - Partial retry configuration (merged with defaults)
 * @param onRetry - Callback invoked before each retry
 * @param parentSignal - Parent abort signal (e.g., from TaskLoop's AbortController)
 * @returns The operation result
 * @throws The last error if all retries fail, or immediately on non-retryable errors
 */
export async function withRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (event: RetryEventCallback) => void,
  parentSignal?: AbortSignal
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    // Check parent abort signal
    if (parentSignal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // Create per-attempt timeout controller
    const attemptController = new AbortController();
    const timeoutId = setTimeout(
      () => attemptController.abort(),
      fullConfig.attemptTimeoutMs
    );

    // Link to parent signal if provided
    const abortHandler = () => attemptController.abort();
    parentSignal?.addEventListener("abort", abortHandler, { once: true });

    try {
      const result = await operation(attemptController.signal);

      // Success - cleanup and record
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortHandler);

      return result;
    } catch (error) {
      // Cleanup timeout
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortHandler);

      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry AbortError (user cancelled or parent signal)
      if (lastError.name === "AbortError") {
        throw lastError;
      }

      // Check if we should retry
      const isLastAttempt = attempt >= fullConfig.maxAttempts;
      const shouldRetry = !isLastAttempt && isRetryableError(error, fullConfig);


      if (shouldRetry) {
        const delayMs = calculateDelay(attempt, fullConfig);
        const statusCode = extractStatusCode(error);

        // Notify caller about retry
        onRetry?.({
          attempt,
          maxAttempts: fullConfig.maxAttempts,
          delayMs,
          error: lastError,
          statusCode,
        });

        // Wait before retry (respects parent abort signal)
        await sleep(delayMs, parentSignal);
      } else if (!isLastAttempt) {
        // Non-retryable error, throw immediately
        throw lastError;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error("All retry attempts failed");
}

// Re-export defaults for convenience
export { DEFAULT_RETRY_CONFIG };
