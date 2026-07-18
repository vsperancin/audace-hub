/**
 * In-memory token-bucket rate limiter for Mercado Livre API calls.
 *
 * The ML API allows roughly 10 RPS sustained per access token. This
 * limiter enforces that locally to avoid 429 responses — it doesn't
 * replace server-side rate limits, just reduces them.
 *
 * Buckets are keyed by `connection_id` (or any opaque string) and
 * live for the lifetime of the Node process. They are NOT shared
 * across multiple Node processes or serverless invocations — for
 * production multi-instance deployments, swap this module for a
 * Redis-backed implementation.
 *
 * @module @/lib/ml/rate-limiter
 */

/** Configuration for the rate limiter. */
export interface RateLimiterConfig {
  /** Maximum tokens in the bucket (burst capacity). Default: 10. */
  readonly capacity?: number;
  /** Tokens added per second. Default: 10. */
  readonly refillPerSecond?: number;
  /** Max time to wait for a token before throwing (ms). Default: 60_000. */
  readonly acquireTimeoutMs?: number;
  /**
   * Function returning current time in ms. Override in tests for
   * deterministic behaviour. Default: `() => Date.now()`.
   */
  readonly now?: () => number;
}

/** Internal state for a single bucket. */
interface Bucket {
  tokens: number;
  lastRefillMs: number;
  /** Pending resolvers waiting for a token, FIFO. */
  waiters: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
    deadlineMs: number;
  }>;
}

/**
 * Default configuration values. Pulled out so the constructor stays
 * readable and tests can reference them.
 */
export const DEFAULT_RATE_LIMITER_CONFIG: Required<RateLimiterConfig> = {
  capacity: 10,
  refillPerSecond: 10,
  acquireTimeoutMs: 60_000,
  now: () => Date.now(),
};

/**
 * Token-bucket rate limiter keyed by an arbitrary string
 * (typically the ML connection_id).
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSecond: number;
  private readonly acquireTimeoutMs: number;
  private readonly now: () => number;
  /** Refill interval in ms — used to schedule wake-ups. */
  private readonly refillIntervalMs: number;
  /** Timer for the next scheduled refill sweep. */
  private nextSweepTimer: NodeJS.Timeout | null = null;

  constructor(config: RateLimiterConfig = {}) {
    const cfg = { ...DEFAULT_RATE_LIMITER_CONFIG, ...config };
    this.capacity = cfg.capacity;
    this.refillPerSecond = cfg.refillPerSecond;
    this.acquireTimeoutMs = cfg.acquireTimeoutMs;
    this.now = cfg.now;
    this.refillIntervalMs = Math.max(1, Math.floor(1000 / this.refillPerSecond));
  }

  /**
   * Acquire a single token, waiting if necessary.
   *
   * Resolves immediately if a token is available. Otherwise, queues
   * the caller and resolves as soon as the bucket refills enough
   * capacity, or rejects with `RateLimiterTimeoutError` after
   * `acquireTimeoutMs`.
   */
  public async acquire(key: string): Promise<void> {
    const bucket = this.getOrCreateBucket(key);
    this.refill(bucket);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve, reject) => {
      const deadlineMs = this.now() + this.acquireTimeoutMs;
      bucket.waiters.push({ resolve, reject, deadlineMs });
      this.scheduleSweep();
    });
  }

  /**
   * Acquire `n` tokens at once. Throws `RangeError` if n > capacity.
   *
   * Useful when a single API call counts as more than one request
   * (e.g. bulk endpoints).
   */
  public async acquireN(key: string, n: number): Promise<void> {
    if (!Number.isInteger(n) || n < 1) {
      throw new RangeError(`acquireN requires a positive integer, got ${n}`);
    }
    if (n > this.capacity) {
      throw new RangeError(
        `Cannot acquire ${n} tokens; bucket capacity is ${this.capacity}`
      );
    }

    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await this.acquire(key);
    }
  }

  /**
   * Returns the current number of tokens in the bucket (after
   * refilling up to `now`). Useful for tests and metrics.
   */
  public getTokens(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    this.refill(bucket);
    return bucket.tokens;
  }

  /**
   * Returns the number of callers currently waiting on this bucket.
   */
  public getWaiterCount(key: string): number {
    return this.buckets.get(key)?.waiters.length ?? 0;
  }

  /**
   * Release all resources — clears the sweep timer and drops every
   * bucket. Pending waiters are rejected.
   *
   * Call this from `process.on('SIGTERM')` handlers to avoid leaking
   * timers during graceful shutdown.
   */
  public destroy(): void {
    if (this.nextSweepTimer) {
      clearTimeout(this.nextSweepTimer);
      this.nextSweepTimer = null;
    }
    const err = new RateLimiterDestroyedError('RateLimiter destroyed');
    for (const bucket of this.buckets.values()) {
      for (const waiter of bucket.waiters) {
        waiter.reject(err);
      }
      bucket.waiters.length = 0;
    }
    this.buckets.clear();
  }

  // ---------- Internal helpers ----------

  private getOrCreateBucket(key: string): Bucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefillMs: this.now(),
        waiters: [],
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  /** Refill the bucket based on elapsed time. */
  private refill(bucket: Bucket): void {
    const now = this.now();
    const elapsedMs = Math.max(0, now - bucket.lastRefillMs);
    if (elapsedMs === 0) return;

    const tokensToAdd = (elapsedMs / 1000) * this.refillPerSecond;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
    bucket.lastRefillMs = now;
  }

  /** Wake up waiters whose deadlines have elapsed with timeout error. */
  private scheduleSweep(): void {
    if (this.nextSweepTimer) return;
    this.nextSweepTimer = setTimeout(() => {
      this.nextSweepTimer = null;
      this.sweep();
    }, this.refillIntervalMs);
    // Don't block process exit.
    if (typeof this.nextSweepTimer.unref === 'function') {
      this.nextSweepTimer.unref();
    }
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      this.refill(bucket);
      this.drainWaiters(key, bucket, now);
    }
    // Schedule next sweep only if there are still pending waiters.
    let hasPending = false;
    for (const bucket of this.buckets.values()) {
      if (bucket.waiters.length > 0) {
        hasPending = true;
        break;
      }
    }
    if (hasPending) this.scheduleSweep();
  }

  private drainWaiters(key: string, bucket: Bucket, now: number): void {
    while (bucket.waiters.length > 0 && bucket.tokens >= 1) {
      const waiter = bucket.waiters.shift();
      if (!waiter) break;
      if (now >= waiter.deadlineMs) {
        waiter.reject(new RateLimiterTimeoutError(
          `Timed out waiting for rate limit token on key "${key}"`
        ));
        continue;
      }
      bucket.tokens -= 1;
      waiter.resolve();
    }

    // Reject any remaining waiters whose deadlines have elapsed.
    if (bucket.waiters.length > 0) {
      const head = bucket.waiters[0];
      if (head && now >= head.deadlineMs) {
        const expired = bucket.waiters.shift();
        if (expired) {
          expired.reject(new RateLimiterTimeoutError(
            `Timed out waiting for rate limit token on key "${key}"`
          ));
        }
      }
    }
  }
}

/** Thrown when `acquire()` cannot obtain a token within the deadline. */
export class RateLimiterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterTimeoutError';
    Object.setPrototypeOf(this, RateLimiterTimeoutError.prototype);
  }
}

/** Thrown when `acquire()` is called after `destroy()`. */
export class RateLimiterDestroyedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimiterDestroyedError';
    Object.setPrototypeOf(this, RateLimiterDestroyedError.prototype);
  }
}

/**
 * Process-wide singleton rate limiter. Re-using a single instance
 * across all `MercadoLivreClient` instances in the same Node process
 * is the recommended pattern — this avoids per-connection memory
 * fragmentation while still keying buckets per-connection.
 */
let _globalRateLimiter: RateLimiter | null = null;

/**
 * Get or create the global shared rate limiter.
 *
 * Reads capacity/refill from environment variables if available:
 * - `ML_RATE_LIMIT_CAPACITY` (default: 10)
 * - `ML_RATE_LIMIT_REFILL_PER_SECOND` (default: 10)
 * - `ML_RATE_LIMIT_ACQUIRE_TIMEOUT_MS` (default: 60000)
 */
export function getGlobalRateLimiter(): RateLimiter {
  if (_globalRateLimiter) return _globalRateLimiter;

  const capacity = readEnvInt('ML_RATE_LIMIT_CAPACITY', 10);
  const refill = readEnvInt('ML_RATE_LIMIT_REFILL_PER_SECOND', 10);
  const timeout = readEnvInt('ML_RATE_LIMIT_ACQUIRE_TIMEOUT_MS', 60_000);

  _globalRateLimiter = new RateLimiter({
    capacity,
    refillPerSecond: refill,
    acquireTimeoutMs: timeout,
  });
  return _globalRateLimiter;
}

/** Test helper: clear the global rate limiter instance. */
export function _resetGlobalRateLimiterForTests(): void {
  if (_globalRateLimiter) {
    _globalRateLimiter.destroy();
    _globalRateLimiter = null;
  }
}

function readEnvInt(name: string, fallback: number): number {
  if (typeof process === 'undefined' || !process.env) return fallback;
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}