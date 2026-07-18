/**
 * Main HTTP client for the Mercado Livre API.
 *
 * Responsibilities:
 *  - Auto-refresh of `access_token` 5 minutes before expiry (lazy — only
 *    when the next request fires).
 *  - Exponential-backoff retry on 429/5xx/network errors with full jitter
 *    to avoid thundering herd.
 *  - Per-connection token-bucket rate limiting (delegated to {@link RateLimiter}).
 *  - Pagination helper that loops automatically until all results are
 *    collected (capped by `maxItems` and `maxPages`).
 *  - Injected logger and fetcher for testability.
 *
 * All public methods accept either a relative path (e.g. `/orders/123`) or
 * a full URL. Relative paths are resolved against the standard ML API base.
 *
 * @module @/lib/ml/client
 */

import {
  createApiError,
  isRateLimited,
  MLRateLimitError,
  MercadoLivreError,
  MLNetworkError,
} from './errors';
import { RateLimiter, getGlobalRateLimiter } from './rate-limiter';
import type {
  Connection,
  Fetcher,
  Logger,
  MLTokenResponse,
  MLPagination,
  MercadoLivreClientOptions,
  PaginationOptions,
} from './types';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_REFRESH_LEAD_MS = 5 * 60 * 1000;

/** ML API base URL (Brazil). */
export const ML_API_BASE_URL = 'https://api.mercadolivre.com';

/** No-op logger used when no logger is injected. */
const NULL_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Hook signature fired when the client refreshes the access token
 * mid-session. The caller is expected to persist the new tokens
 * (encrypted) to the database so other replicas can pick them up.
 */
export type OnTokenRefreshed = (
  connection: Connection,
  tokens: MLTokenResponse
) => Promise<void> | void;

/** Extended options for {@link MercadoLivreClient}. */
export interface ClientConfig extends MercadoLivreClientOptions {
  /** Callback fired after a successful token refresh. */
  readonly onTokenRefreshed?: OnTokenRefreshed;
}

/**
 * In-memory credentials after decryption. Mirrors the `Connection`
 * row but holds decrypted tokens so the client can use them directly.
 */
interface ResolvedCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAtMs: number | null;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly userId: number;
}

/**
 * Mercado Livre HTTP client — the single entry point for all API calls
 * in the Audace Hub app.
 */
export class MercadoLivreClient {
  private readonly connection: Connection;
  private readonly config: Required<Omit<MercadoLivreClientOptions, 'logger' | 'fetcher' | 'rateLimiter' | 'onTokenRefreshed'>> & {
    readonly logger: Logger;
    readonly fetcher: Fetcher;
    readonly rateLimiter: RateLimiter;
    readonly onTokenRefreshed: OnTokenRefreshed | undefined;
  };

  /** Decrypted credentials (mutable in-memory copy). */
  private creds: ResolvedCredentials;
  /** Mutex for concurrent refresh — only one refresh in flight per client. */
  private refreshInFlight: Promise<void> | null = null;

  constructor(connection: Connection, options: ClientConfig = {}) {
    if (!connection) {
      throw new Error('MercadoLivreClient requires a Connection');
    }
    if (!connection.access_token) {
      throw new Error('Connection.access_token is required (decrypted)');
    }
    if (!connection.refresh_token) {
      throw new Error('Connection.refresh_token is required (decrypted)');
    }

    this.connection = connection;
    this.config = {
      logger: options.logger ?? NULL_LOGGER,
      fetcher: options.fetcher ?? defaultFetcher,
      rateLimiter: options.rateLimiter ?? getGlobalRateLimiter(),
      timeoutMs: options.timeoutMs ?? readEnvInt('ML_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
      maxRetries: options.maxRetries ?? readEnvInt('ML_MAX_RETRIES', DEFAULT_MAX_RETRIES),
      baseBackoffMs:
        options.baseBackoffMs ?? readEnvInt('ML_BASE_BACKOFF_MS', DEFAULT_BASE_BACKOFF_MS),
      maxBackoffMs: options.maxBackoffMs ?? readEnvInt('ML_MAX_BACKOFF_MS', DEFAULT_MAX_BACKOFF_MS),
      refreshLeadMs:
        options.refreshLeadMs ?? readEnvInt('ML_REFRESH_LEAD_MS', DEFAULT_REFRESH_LEAD_MS),
      onTokenRefreshed: options.onTokenRefreshed,
    };

    this.creds = {
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      expiresAtMs: connection.access_token_expires_at,
      clientId: connection.client_id,
      clientSecret: connection.client_secret,
      userId: connection.account_id,
    };
  }

  // --------------------------------------------------------------------------
  // Public HTTP verbs
  // --------------------------------------------------------------------------

  /**
   * Authenticated GET. Auto-refreshes the access token first if needed.
   */
  public async get<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  /**
   * Authenticated POST.
   */
  public async post<T>(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('POST', path, body, params);
  }

  /**
   * Authenticated PUT.
   */
  public async put<T>(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('PUT', path, body, params);
  }

  /**
   * Authenticated PATCH.
   */
  public async patch<T>(
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('PATCH', path, body, params);
  }

  /**
   * Authenticated DELETE.
   */
  public async delete<T = void>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    return this.request<T>('DELETE', path, undefined, params);
  }

  // --------------------------------------------------------------------------
  // Pagination helper
  // --------------------------------------------------------------------------

  /**
   * Drive a paginated search endpoint until all results are collected
   * (or until `maxItems` / `maxPages` is hit).
   *
   * The `fetcher` callback receives the current `offset` and `limit` and
   * must return the page response containing `results` and `paging.total`.
   *
   * @example
   * ```ts
   * const all = await client.withPagination(async ({ offset, limit }) => {
   *   return client.get<MLSearchResponse<MLOrder>>('/orders/search', {
   *     seller: 12345,
   *     offset,
   *     limit,
   *   });
   * });
   * ```
   */
  public async withPagination<TPage, TItem>(
    fetcher: (page: { offset: number; limit: number }) => Promise<TPage>,
    options: PaginationOptions = {}
  ): Promise<TItem[]> {
    const pageSize = options.pageSize ?? 50;
    const maxPages = options.maxPages ?? 1000;
    const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;

    const collected: TItem[] = [];
    let offset = 0;
    let pageCount = 0;

    while (pageCount < maxPages && collected.length < maxItems) {
      // eslint-disable-next-line no-await-in-loop
      const page = await fetcher({ offset, limit: pageSize });

      // Try to extract items via duck-typing — supports both
      // { results: T[] } envelopes and bare T[] responses.
      const results = extractResults<TItem>(page);
      const paging = extractPaging(page);

      collected.push(...results);
      pageCount += 1;

      // Stop conditions.
      if (results.length === 0) break;
      if (collected.length >= maxItems) break;

      if (paging) {
        if (collected.length >= paging.total) break;
        // ML paging is 0-based; next offset is current + limit.
        offset = paging.offset + paging.limit;
        // Safety: if ML reports total=0 or inconsistent paging, stop.
        if (paging.limit <= 0) break;
      } else {
        // No paging info → assume the page was full or empty; advance by pageSize.
        if (results.length < pageSize) break;
        offset += pageSize;
      }
    }

    if (collected.length > maxItems) {
      return collected.slice(0, maxItems);
    }
    return collected;
  }

  // --------------------------------------------------------------------------
  // Token management (public for tests)
  // --------------------------------------------------------------------------

  /**
   * Force a token refresh. Normally you don't call this — the client
   * auto-refreshes before each request. Useful for warming up the
   * connection on boot.
   */
  public async refreshAccessToken(): Promise<void> {
    return this.doRefresh();
  }

  /** Returns the current (possibly refreshed) access token. */
  public getAccessToken(): string {
    return this.creds.accessToken;
  }

  /** Returns the current user/connection id. */
  public getUserId(): number {
    return this.creds.userId;
  }

  // --------------------------------------------------------------------------
  // Internal: HTTP request with retry/backoff
  // --------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    await this.ensureFreshToken();

    const url = this.buildUrl(path, params);
    const rateLimitKey = String(this.connection.id);

    // Single attempt — retry happens around the whole attempt in `withRetry`.
    const executeOnce = async (): Promise<T> => {
      // Acquire a token from the rate limiter before each attempt.
      await this.config.rateLimiter.acquire(rateLimitKey);

      const controller = new AbortController();
      const timeoutHandle = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs
      );

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.creds.accessToken}`,
        Accept: 'application/json',
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      let response;
      const start = Date.now();
      try {
        response = await this.config.fetcher(url.toString(), {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : null,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutHandle);
        const cause = err instanceof Error ? err : new Error(String(err));
        const elapsed = Date.now() - start;
        this.config.logger.warn('ML request failed (network)', {
          method,
          url: url.toString(),
          elapsed,
          error: cause.message,
        });
        throw new MLNetworkError(cause);
      }
      clearTimeout(timeoutHandle);
      const elapsed = Date.now() - start;

      // Read the body once. ML sometimes returns JSON, sometimes plain
      // text on errors — handle both.
      const text = await response.text();
      const json = parseJsonSafe(text);

      if (response.status >= 200 && response.status < 300) {
        this.config.logger.debug('ML request ok', {
          method,
          url: url.toString(),
          status: response.status,
          elapsed,
        });
        // Some ML endpoints return 204 with empty body — return undefined cast.
        if (response.status === 204 || text.length === 0) {
          return undefined as T;
        }
        return json as T;
      }

      // Status < 200 or >= 300 — raise a typed error.
      const apiError = createApiError(
        response.status,
        json ?? text,
        response.headers,
        `ML API ${response.status} on ${method} ${path}`
      );

      // Special case: 401 means the access token is bad/expired. Try a
      // forced refresh once before propagating the error (the retry
      // loop will pick up the new token on the next attempt).
      if (response.status === 401 && this.refreshInFlight === null) {
        this.config.logger.info('ML request 401 — forcing refresh', {
          method,
          url: url.toString(),
        });
        await this.doRefresh();
        const refreshedError = new MercadoLivreError(
          'Access token was refreshed; retry the request',
          401,
          'token_refreshed',
          apiError.body,
          apiError.headers
        );
        refreshedError.name = 'MLTokenRefreshed';
        throw refreshedError;
      }

      this.config.logger.warn('ML request error', {
        method,
        url: url.toString(),
        status: response.status,
        code: apiError.code,
        elapsed,
      });
      throw apiError;
    };

    return this.withRetry(method, path, executeOnce);
  }

  private async withRetry<T>(
    method: string,
    path: string,
    fn: () => Promise<T>
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (!isRetryable(err)) {
          throw err;
        }
        if (attempt >= this.config.maxRetries) {
          // Out of retries.
          if (isRateLimited(err) && err instanceof MLRateLimitError) {
            throw err;
          }
          throw err;
        }

        const delayMs = this.computeBackoff(err, attempt);
        this.config.logger.warn('ML request retry', {
          method,
          path,
          attempt: attempt + 1,
          maxAttempts: this.config.maxRetries + 1,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await sleep(delayMs);
      }
    }
    // Shouldn't reach here, but for type safety:
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private computeBackoff(err: unknown, attempt: number): number {
    // Honor Retry-After when present.
    if (isRateLimited(err) && err instanceof MLRateLimitError && err.retryAfter != null) {
      // Add jitter to server-supplied Retry-After to avoid synchronised retries.
      const jitter = Math.random() * 250;
      return Math.min(this.config.maxBackoffMs, err.retryAfter * 1000 + jitter);
    }
    // Exponential backoff with full jitter:
    //   delay = random(0, base * 2^attempt), capped at max.
    const exp = this.config.baseBackoffMs * 2 ** attempt;
    const capped = Math.min(this.config.maxBackoffMs, exp);
    return Math.floor(Math.random() * capped);
  }

  private async ensureFreshToken(): Promise<void> {
    if (!this.isTokenExpiringSoon()) return;
    await this.doRefresh();
  }

  private isTokenExpiringSoon(): boolean {
    if (this.creds.expiresAtMs == null) return false;
    return this.creds.expiresAtMs - Date.now() <= this.config.refreshLeadMs;
  }

  private async doRefresh(): Promise<void> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }
    this.refreshInFlight = (async () => {
      try {
        const tokens = await this.callOAuthRefreshEndpoint();
        this.creds = {
          ...this.creds,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAtMs: Date.now() + tokens.expires_in * 1000,
        };
        this.config.logger.info('ML token refreshed', {
          userId: this.creds.userId,
          expiresInSec: tokens.expires_in,
        });
        if (this.config.onTokenRefreshed) {
          await this.config.onTokenRefreshed(this.connection, tokens);
        }
      } finally {
        this.refreshInFlight = null;
      }
    })();
    return this.refreshInFlight;
  }

  private async callOAuthRefreshEndpoint(): Promise<MLTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      refresh_token: this.creds.refreshToken,
    });

    let response;
    try {
      response = await this.config.fetcher(
        'https://api.mercadolivre.com/oauth/token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: body.toString(),
        }
      );
    } catch (err) {
      const cause = err instanceof Error ? err : new Error(String(err));
      throw new MLNetworkError(cause, 'OAuth token refresh network error');
    }

    const text = await response.text();
    const json = parseJsonSafe(text);

    if (response.status < 200 || response.status >= 300) {
      throw createApiError(
        response.status,
        json ?? text,
        response.headers,
        `OAuth refresh failed: ${response.status}`
      );
    }

    const obj = (json ?? {}) as Record<string, unknown>;
    if (typeof obj.access_token !== 'string' || typeof obj.refresh_token !== 'string') {
      throw new Error('OAuth refresh response missing access_token or refresh_token');
    }

    return {
      access_token: obj.access_token,
      refresh_token: obj.refresh_token,
      token_type: typeof obj.token_type === 'string' ? obj.token_type : 'Bearer',
      scope: typeof obj.scope === 'string' ? obj.scope : '',
      user_id:
        typeof obj.user_id === 'number'
          ? obj.user_id
          : Number(obj.user_id) || this.creds.userId,
      expires_in:
        typeof obj.expires_in === 'number'
          ? obj.expires_in
          : Number(obj.expires_in) || 21600,
      refresh_expires_in:
        typeof obj.refresh_expires_in === 'number'
          ? obj.refresh_expires_in
          : obj.refresh_expires_in !== undefined
          ? Number(obj.refresh_expires_in)
          : undefined,
      issued_at: typeof obj.issued_at === 'string' ? obj.issued_at : undefined,
    };
  }

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean>
  ): URL {
    const url = path.startsWith('http://') || path.startsWith('https://')
      ? new URL(path)
      : new URL(`${ML_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }
}

// ============================================================================
// Helpers
// ============================================================================

/** Default fetcher — wraps the global `fetch`. */
const defaultFetcher: Fetcher = async (url, init) => {
  const res = await fetch(url, init);
  return {
    status: res.status,
    headers: extractHeaders(res.headers),
    text: () => res.text(),
    json: () => res.json(),
  };
};

function extractHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function parseJsonSafe(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractResults<T>(page: unknown): T[] {
  if (Array.isArray(page)) return page as T[];
  if (page && typeof page === 'object') {
    const obj = page as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.orders)) return obj.orders as T[];
    if (Array.isArray(obj.questions)) return obj.questions as T[];
    if (Array.isArray(obj.campaigns)) return obj.campaigns as T[];
  }
  return [];
}

function extractPaging(page: unknown): MLPagination | null {
  if (!page || typeof page !== 'object') return null;
  const obj = page as Record<string, unknown>;
  const paging = obj.paging;
  if (!paging || typeof paging !== 'object') return null;
  const p = paging as Record<string, unknown>;
  if (
    typeof p.total === 'number' &&
    typeof p.offset === 'number' &&
    typeof p.limit === 'number'
  ) {
    return {
      total: p.total,
      offset: p.offset,
      limit: p.limit,
      primary_key: typeof p.primary_key === 'string' ? p.primary_key : undefined,
    };
  }
  return null;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof MLNetworkError) return true;
  if (err instanceof MLRateLimitError) return true;
  if (err instanceof MercadoLivreError) {
    // 5xx → retry. 429 already handled above.
    return err.status >= 500 && err.status <= 599;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readEnvInt(name: string, fallback: number): number {
  if (typeof process === 'undefined' || !process.env) return fallback;
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}