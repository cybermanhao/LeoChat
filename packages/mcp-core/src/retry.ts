/**
 * Retry Utility with Exponential Backoff and Circuit Breaker
 *
 * Implements resilient LLM API call patterns following 2025 best practices:
 * - Exponential backoff with full jitter
 * - Per-attempt timeouts
 * - Circuit breaker for cascading failure prevention
 */

import type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitState,
} from "@ai-chatbox/shared";
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "@ai-chatbox/shared";

export interface RetryEventCallback {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  error: Error;
  statusCode?: number;
}

export interface CircuitStateChangeCallback {
  previousState: CircuitState;
  newState: CircuitState;
  failureCount: number;
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
 * Circuit Breaker Implementation
 *
 * State Machine:
 * - closed: Normal operation, requests pass through
 * - open: Failing, all requests rejected immediately
 * - half-open: Testing recovery, limited requests allowed
 *
 * Transitions:
 * - closed -> open: When failureCount >= failureThreshold
 * - open -> half-open: After resetTimeoutMs elapses
 * - half-open -> closed: After successThreshold successes
 * - half-open -> open: On any failure
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;
  private onStateChange?: (event: CircuitStateChangeCallback) => void;

  constructor(
    config: Partial<CircuitBreakerConfig> = {},
    onStateChange?: (event: CircuitStateChangeCallback) => void
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.onStateChange = onStateChange;
  }

  /**
   * Check if a request can be attempted
   */
  canAttempt(): boolean {
    if (this.state === "closed") {
      return true;
    }

    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.transitionTo("half-open");
        return true;
      }
      return false;
    }

    // half-open: allow one attempt to test recovery
    return true;
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    if (this.state === "half-open") {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo("closed");
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === "closed") {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // Any failure in half-open immediately opens the circuit
      this.transitionTo("open");
      this.successCount = 0;
    } else if (
      this.state === "closed" &&
      this.failureCount >= this.config.failureThreshold
    ) {
      this.transitionTo("open");
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Reset the circuit breaker to initial state
   */
  reset(): void {
    const previousState = this.state;
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;

    if (previousState !== "closed") {
      this.onStateChange?.({
        previousState,
        newState: "closed",
        failureCount: 0,
      });
    }
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    this.onStateChange?.({
      previousState,
      newState,
      failureCount: this.failureCount,
    });
  }
}

/**
 * Retry wrapper for async operations with exponential backoff
 *
 * @param operation - The async operation to retry. Receives an AbortSignal for per-attempt timeout.
 * @param config - Partial retry configuration (merged with defaults)
 * @param circuitBreaker - Optional circuit breaker instance
 * @param onRetry - Callback invoked before each retry
 * @param parentSignal - Parent abort signal (e.g., from TaskLoop's AbortController)
 * @returns The operation result
 * @throws The last error if all retries fail, or immediately on non-retryable errors
 */
export async function withRetry<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  config: Partial<RetryConfig> = {},
  circuitBreaker?: CircuitBreaker,
  onRetry?: (event: RetryEventCallback) => void,
  parentSignal?: AbortSignal
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    // Check circuit breaker before attempting
    if (circuitBreaker && !circuitBreaker.canAttempt()) {
      throw new Error(
        `Circuit breaker is open - service unavailable (failures: ${circuitBreaker.getFailureCount()})`
      );
    }

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
      circuitBreaker?.recordSuccess();

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

      // Record failure in circuit breaker
      circuitBreaker?.recordFailure();

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
export { DEFAULT_RETRY_CONFIG, DEFAULT_CIRCUIT_BREAKER_CONFIG };
