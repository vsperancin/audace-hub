/**
 * Mercado Livre API Error classes
 *
 * Provides typed error hierarchy for handling different failure modes
 * from the ML API. All errors extend {@link MercadoLivreError} which
 * carries HTTP status, ML error code, and the parsed response body.
 *
 * @module @/lib/ml/errors
 */

/**
 * Base error for all Mercado Livre API failures.
 *
 * Carries the HTTP status, ML error code (e.g. `invalid_token`,
 * `not_found`, `validation_error`), and the full parsed response body
 * so callers can inspect additional context.
 */
export class MercadoLivreError extends Error {
  /** HTTP status code from the failed request (0 if no response was received). */
  public readonly status: number;
  /** ML error code as returned in the response body. */
  public readonly code: string;
  /** Parsed response body (may be `null` for network errors). */
  public readonly body: unknown;
  /** Response headers (may be `null` for network errors). */
  public readonly headers: Record<string, string>;
  /** ISO timestamp when the error was captured. */
  public readonly timestamp: string;

  constructor(
    message: string,
    status: number,
    code: string,
    body: unknown = null,
    headers: Record<string, string> = {}
  ) {
    super(message);
    this.name = 'MercadoLivreError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.headers = headers;
    this.timestamp = new Date().toISOString();
    // Maintain proper prototype chain for `instanceof` after transpilation.
    Object.setPrototypeOf(this, MercadoLivreError.prototype);
  }

  /**
   * Convert the error to a plain JSON object suitable for logging.
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      timestamp: this.timestamp,
      body: this.body,
    };
  }
}

/**
 * Authentication/authorization failures (HTTP 401, 403).
 *
 * The most common cause is an expired or revoked access token. The
 * client will normally attempt to refresh the token before raising
 * this error, so receiving one usually indicates the refresh token is
 * also invalid and the user needs to re-authorize the app.
 */
export class MLAuthError extends MercadoLivreError {
  constructor(
    message: string,
    status: number,
    code: string,
    body: unknown = null,
    headers: Record<string, string> = {}
  ) {
    super(message, status, code, body, headers);
    this.name = 'MLAuthError';
    Object.setPrototypeOf(this, MLAuthError.prototype);
  }
}

/**
 * Rate limit exceeded (HTTP 429).
 *
 * The client retries these automatically up to the configured
 * `maxRetries` using the `Retry-After` header to back off. This error
 * is only thrown after exhausting all retry attempts.
 */
export class MLRateLimitError extends MercadoLivreError {
  /** Seconds to wait before retrying, as parsed from `Retry-After`. */
  public readonly retryAfter: number | null;

  constructor(
    message: string,
    status: number,
    code: string,
    body: unknown = null,
    headers: Record<string, string> = {},
    retryAfter: number | null = null
  ) {
    super(message, status, code, body, headers);
    this.name = 'MLRateLimitError';
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, MLRateLimitError.prototype);
  }
}

/**
 * Resource not found (HTTP 404).
 *
 * The requested item, order, user, or other resource does not exist
 * or is not accessible to the current user.
 */
export class MLNotFoundError extends MercadoLivreError {
  constructor(
    message: string,
    status: number,
    code: string,
    body: unknown = null,
    headers: Record<string, string> = {}
  ) {
    super(message, status, code, body, headers);
    this.name = 'MLNotFoundError';
    Object.setPrototypeOf(this, MLNotFoundError.prototype);
  }
}

/**
 * Request validation failure (HTTP 400).
 *
 * The request payload or query parameters failed ML's validation
 * rules. Inspect `body` for the per-field error details.
 */
export class MLValidationError extends MercadoLivreError {
  constructor(
    message: string,
    status: number,
    code: string,
    body: unknown = null,
    headers: Record<string, string> = {}
  ) {
    super(message, status, code, body, headers);
    this.name = 'MLValidationError';
    Object.setPrototypeOf(this, MLValidationError.prototype);
  }
}

/**
 * Network/transport failures (no HTTP response received).
 *
 * Wrapped as an error so callers can handle transport problems with
 * the same `try/catch` shape used for API errors.
 */
export class MLNetworkError extends MercadoLivreError {
  public override readonly cause: Error | undefined;

  constructor(cause: Error, message?: string) {
    super(
      message ?? `Network error: ${cause.message}`,
      0,
      'network_error',
      null,
      {}
    );
    this.name = 'MLNetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, MLNetworkError.prototype);
  }
}

/**
 * Type guard for rate-limit errors. Returns true for both
 * {@link MLRateLimitError} instances and any {@link MercadoLivreError}
 * whose status is 429.
 */
export function isRateLimited(error: unknown): error is MLRateLimitError {
  if (error instanceof MLRateLimitError) return true;
  if (error instanceof MercadoLivreError) return error.status === 429;
  return false;
}

/**
 * Parse the `Retry-After` header from an error's headers.
 *
 * The header can be expressed as either a delta-seconds value
 * (`Retry-After: 120`) or an HTTP-date (`Retry-After: Wed, 21 Oct 2026
 * 07:28:00 GMT`). Returns the number of seconds to wait, or `null` if
 * the header is missing/unparseable.
 */
export function getRetryAfter(error: unknown): number | null {
  let headers: Record<string, string> | null = null;

  if (error instanceof MLRateLimitError) {
    return error.retryAfter;
  }
  if (error instanceof MercadoLivreError) {
    headers = error.headers;
  }

  if (!headers) return null;

  // Headers are case-insensitive — try both casings.
  const raw =
    headers['retry-after'] ??
    headers['Retry-After'] ??
    headers['RETRY-AFTER'];

  if (!raw) return null;

  // Delta-seconds form.
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  // HTTP-date form.
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }

  return null;
}

/**
 * Map an HTTP status + body to the most specific error subclass.
 *
 * Falls back to the base {@link MercadoLivreError} when no subtype
 * matches.
 */
export function createApiError(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  fallbackMessage?: string
): MercadoLivreError {
  const bodyObj =
    body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const code =
    (typeof bodyObj?.error === 'string' && bodyObj.error) ||
    (typeof bodyObj?.code === 'string' && bodyObj.code) ||
    `http_${status}`;
  const message =
    (typeof bodyObj?.message === 'string' && bodyObj.message) ||
    (typeof bodyObj?.error_description === 'string' && bodyObj.error_description) ||
    fallbackMessage ||
    `Mercado Livre API error ${status}`;

  const retryAfter = status === 429 ? getRetryAfterFromHeaders(headers) : null;

  if (status === 429) {
    return new MLRateLimitError(message, status, code, body, headers, retryAfter);
  }
  if (status === 404) {
    return new MLNotFoundError(message, status, code, body, headers);
  }
  if (status === 401 || status === 403) {
    return new MLAuthError(message, status, code, body, headers);
  }
  if (status === 400 || status === 422) {
    return new MLValidationError(message, status, code, body, headers);
  }
  return new MercadoLivreError(message, status, code, body, headers);
}

function getRetryAfterFromHeaders(headers: Record<string, string>): number | null {
  const raw =
    headers['retry-after'] ??
    headers['Retry-After'] ??
    headers['RETRY-AFTER'];
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delta = Math.ceil((date - Date.now()) / 1000);
    return delta > 0 ? delta : 0;
  }
  return null;
}