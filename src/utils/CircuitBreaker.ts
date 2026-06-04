import { logger } from './logger.js';

/**
 * Error thrown when the circuit breaker is open and calls are rejected.
 */
export class CircuitOpenError extends Error {
  constructor(message = 'Circuit breaker is OPEN — calls are temporarily blocked') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker states per Spec §15.3.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Listener callback for state change events.
 */
export type CircuitBreakerListener = (
  newState: CircuitState,
  oldState: CircuitState,
  failureCount: number
) => void;

interface CircuitBreakerOptions {
  /** Number of consecutive failures to trigger open state. Default: 5 */
  threshold: number;
  /** Time in ms before transitioning from OPEN → HALF_OPEN. Default: 300000 (5 min) */
  resetTimeoutMs: number;
  /** Time window in ms for error rate calculation. Default: 3600000 (1 hour) */
  errorRateWindowMs: number;
  /** Error rate threshold (0.0 – 1.0) to trigger open. Default: 0.5 */
  errorRateThreshold: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  threshold: 5,
  resetTimeoutMs: 300_000,
  errorRateWindowMs: 3_600_000,
  errorRateThreshold: 0.5,
};

/**
 * Circuit breaker implementation per Spec §15.3.
 *
 * States:
 *   CLOSED    → normal operation, counting failures
 *   OPEN      → all calls rejected with CircuitOpenError
 *   HALF_OPEN → allows one test call; success → CLOSED, failure → OPEN
 *
 * Opens when:
 *   - Consecutive failures reach `threshold`
 *   - Error rate exceeds `errorRateThreshold` within `errorRateWindowMs`
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private openedAt: number | null = null;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  /** Rolling window of call outcomes: { timestamp, success } */
  private callHistory: Array<{ ts: number; success: boolean }> = [];

  private options: CircuitBreakerOptions;
  private listeners: CircuitBreakerListener[] = [];
  private name: string;

  constructor(name: string, options?: Partial<CircuitBreakerOptions>) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if enough time has passed to transition to HALF_OPEN
      if (this.openedAt && Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitOpenError(
          `Circuit breaker "${this.name}" is OPEN (${this.consecutiveFailures} failures)`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Register a listener for state change events.
   */
  onStateChange(listener: CircuitBreakerListener): void {
    this.listeners.push(listener);
  }

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current failure count.
   */
  getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /**
   * Get the error rate within the rolling window.
   */
  getErrorRate(): number {
    this.pruneHistory();
    if (this.callHistory.length === 0) return 0;
    const failures = this.callHistory.filter(c => !c.success).length;
    return failures / this.callHistory.length;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state.
   */
  reset(): void {
    this.transitionTo('CLOSED');
    this.consecutiveFailures = 0;
    this.callHistory = [];
    this.clearResetTimer();
  }

  /**
   * Cleanup timers (call on shutdown).
   */
  destroy(): void {
    this.clearResetTimer();
    this.listeners = [];
  }

  // ---- Internal ----

  private onSuccess(): void {
    this.recordCall(true);

    if (this.state === 'HALF_OPEN') {
      // Test call succeeded → close circuit
      logger.info(`CircuitBreaker "${this.name}": HALF_OPEN test succeeded → CLOSED`);
      this.transitionTo('CLOSED');
    }

    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.recordCall(false);

    logger.warn(`CircuitBreaker "${this.name}": failure #${this.consecutiveFailures}`, {
      state: this.state,
      threshold: this.options.threshold,
    });

    if (this.state === 'HALF_OPEN') {
      // Test call failed → reopen
      logger.warn(`CircuitBreaker "${this.name}": HALF_OPEN test failed → OPEN`);
      this.transitionTo('OPEN');
      return;
    }

    // Check consecutive failure threshold
    if (this.consecutiveFailures >= this.options.threshold) {
      logger.error(
        `CircuitBreaker "${this.name}": threshold reached (${this.consecutiveFailures}/${this.options.threshold}) → OPEN`
      );
      this.transitionTo('OPEN');
      return;
    }

    // Check error rate threshold
    const errorRate = this.getErrorRate();
    if (this.callHistory.length >= 5 && errorRate > this.options.errorRateThreshold) {
      logger.error(
        `CircuitBreaker "${this.name}": error rate ${(errorRate * 100).toFixed(1)}% > ${this.options.errorRateThreshold * 100}% → OPEN`
      );
      this.transitionTo('OPEN');
    }
  }

  private recordCall(success: boolean): void {
    this.callHistory.push({ ts: Date.now(), success });
    this.pruneHistory();
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - this.options.errorRateWindowMs;
    this.callHistory = this.callHistory.filter(c => c.ts >= cutoff);
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.clearResetTimer();

    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      // Schedule automatic transition to HALF_OPEN
      this.resetTimer = setTimeout(() => {
        if (this.state === 'OPEN') {
          logger.info(`CircuitBreaker "${this.name}": reset timeout elapsed → HALF_OPEN`);
          this.transitionTo('HALF_OPEN');
        }
      }, this.options.resetTimeoutMs);
    }

    if (newState === 'CLOSED') {
      this.consecutiveFailures = 0;
      this.openedAt = null;
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(newState, oldState, this.consecutiveFailures);
      } catch (err) {
        logger.warn(`CircuitBreaker "${this.name}": listener error`, { error: String(err) });
      }
    }
  }

  private clearResetTimer(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}
