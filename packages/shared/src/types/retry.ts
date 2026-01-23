/**
 * Retry and Circuit Breaker Types
 *
 * For resilient LLM API calls with exponential backoff and jitter
 */

/**
 * Retry configuration for LLM calls
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxAttempts: number;

  /** Initial delay in ms before first retry (default: 500) */
  initialDelayMs: number;

  /** Multiplier for exponential backoff (default: 2) */
  backoffFactor: number;

  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs: number;

  /** Whether to add jitter to delays (default: true) */
  jitter: boolean;

  /** HTTP status codes that trigger retry (default: [429, 500, 502, 503, 504]) */
  retryableStatusCodes: number[];

  /** Per-attempt timeout in ms (default: 60000) */
  attemptTimeoutMs: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;

  /** Time to wait before testing circuit in ms (default: 30000) */
  resetTimeoutMs: number;

  /** Number of successful calls to close circuit (default: 2) */
  successThreshold: number;
}

/**
 * Circuit breaker state
 */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Retry event for observability (emitted by TaskLoop)
 */
export interface RetryEvent {
  type: "retry";
  /** Current attempt number (1-indexed) */
  attempt: number;
  /** Maximum attempts configured */
  maxAttempts: number;
  /** Delay before this retry in ms */
  delayMs: number;
  /** The error that triggered the retry */
  error: Error;
  /** HTTP status code if available */
  statusCode?: number;
}

/**
 * Circuit breaker state change event
 */
export interface CircuitBreakerEvent {
  type: "circuit_state_change";
  /** Previous circuit state */
  previousState: CircuitState;
  /** New circuit state */
  newState: CircuitState;
  /** Current failure count */
  failureCount: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 30000,
  jitter: true,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  attemptTimeoutMs: 60000,
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
};
