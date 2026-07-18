/**
 * OAuth 2.0 helpers for the Mercado Livre authorization flow.
 *
 * ML uses standard OAuth 2.0 with PKCE-style `state` parameter for
 * CSRF protection. The functions in this module are pure and have no
 * side effects beyond network calls to the token endpoint.
 *
 * @module @/lib/ml/oauth
 */

import { createApiError, MLNetworkError } from './errors';
import type {
  Connection,
  Fetcher,
  MLScope,
  MLTokenResponse,
} from './types';

/** Default ML OAuth endpoints (Brazil). */
export const ML_OAUTH_BASE_URL = 'https://auth.mercadolivre.com.br';
export const ML_OAUTH_TOKEN_URL = 'https://api.mercadolivre.com/oauth/token';
export const ML_API_BASE_URL = 'https://api.mercadolivre.com';

/**
 * Build the authorization URL to redirect the user to.
 *
 * @param clientId - ML app client_id (numeric string).
 * @param redirectUri - Absolute URL registered in the ML app dashboard.
 * @param scopes - Space-separated list of scopes (e.g. `"read write offline_access"`).
 * @param state - CSRF token (generate with {@link generateState}).
 * @returns Fully-qualified authorization URL.
 */
export function buildAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  scopes: string | string[],
  state: string
): string {
  if (!clientId) throw new Error('clientId is required');
  if (!redirectUri) throw new Error('redirectUri is required');
  if (!state) throw new Error('state is required (use generateState())');

  const scopeString = Array.isArray(scopes) ? scopes.join(' ') : scopes;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  });
  if (scopeString) params.set('scope', scopeString);

  return `${ML_OAUTH_BASE_URL}/authorization?${params.toString()}`;
}

/**
 * Exchange an authorization code for access/refresh tokens.
 *
 * Called from the `/api/ml/callback` route handler after the user
 * authorizes the app.
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  fetcher: Fetcher = defaultFetcher
): Promise<MLTokenResponse> {
  if (!code) throw new Error('code is required');
  if (!clientId) throw new Error('clientId is required');
  if (!clientSecret) throw new Error('clientSecret is required');
  if (!redirectUri) throw new Error('redirectUri is required');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  return postTokenRequest(body, fetcher);
}

/**
 * Refresh an expired access token using the long-lived refresh token.
 *
 * ML rotates the refresh token on every successful refresh — make
 * sure to persist the new value returned in the response.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetcher: Fetcher = defaultFetcher
): Promise<MLTokenResponse> {
  if (!refreshToken) throw new Error('refreshToken is required');
  if (!clientId) throw new Error('clientId is required');
  if (!clientSecret) throw new Error('clientSecret is required');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  return postTokenRequest(body, fetcher);
}

/**
 * Generate a cryptographically secure random state token for CSRF
 * protection in the OAuth flow. Returns a URL-safe base64 string of
 * 32 random bytes (~43 chars).
 *
 * Uses `crypto.randomBytes` from Node's built-in `crypto` module.
 * Falls back to `crypto.getRandomValues` in the browser.
 */
export function generateState(): string {
  const bytes = randomBytes(32);
  return base64UrlEncode(bytes);
}

/**
 * Constant-time string comparison to prevent timing attacks against
 * the OAuth state parameter.
 *
 * Returns `true` if both strings are byte-equal. Always takes the
 * same amount of time regardless of where the strings differ.
 */
export function validateState(state: string, sessionState: string): boolean {
  if (typeof state !== 'string' || typeof sessionState !== 'string') {
    return false;
  }
  if (state.length !== sessionState.length) {
    // Still do a constant-time compare against a fixed string so the
    // length mismatch itself doesn't leak timing information.
    constantTimeEqual(sessionState, sessionState);
    return false;
  }
  return constantTimeEqual(state, sessionState);
}

/**
 * Higher-level helper: persist new tokens to a database row.
 *
 * Provided here (not in the database layer) so the persistence
 * implementation is swappable. Default behaviour is a no-op that
 * just logs the action — callers are expected to override with their
 * own persistence call.
 */
export interface TokenPersistenceHooks {
  onTokensRefreshed?: (
    connection: Connection,
    tokens: MLTokenResponse
  ) => Promise<void> | void;
}

/**
 * Convenience: refresh tokens AND optionally persist them.
 */
export async function refreshAndPersist(
  connection: Connection,
  fetcher: Fetcher = defaultFetcher,
  hooks: TokenPersistenceHooks = {}
): Promise<MLTokenResponse> {
  const tokens = await refreshAccessToken(
    connection.refresh_token,
    connection.client_id,
    connection.client_secret,
    fetcher
  );

  if (hooks.onTokensRefreshed) {
    await hooks.onTokensRefreshed(connection, tokens);
  }

  return tokens;
}

// ============================================================================
// Scopes preset
// ============================================================================

/** Scope presets for common app use-cases. */
export const SCOPE_PRESETS = {
  /** Read-only access to public data. */
  READ_ONLY: ['read'] as MLScope[],
  /** Read + write — manage listings, answer questions, etc. */
  READ_WRITE: ['read', 'write'] as MLScope[],
  /** Read/write + offline access (refresh tokens, mandatory for any
   * app that needs to call ML on its own without the user online). */
  FULL: [
    'read',
    'write',
    'offline_access',
  ] as MLScope[],
  /** Full + commerce operations (orders, shipments, inventory). */
  COMMERCE: [
    'read',
    'write',
    'offline_access',
    'orders',
    'items',
    'questions',
    'shipments',
    'inventory',
  ] as MLScope[],
  /** Everything typically required for a seller dashboard. */
  SELLER_DASHBOARD: [
    'read',
    'write',
    'offline_access',
    'orders',
    'items',
    'questions',
    'shipments',
    'inventory',
    'reports',
    'mediations',
    'claims',
    'financial',
    'advertising',
  ] as MLScope[],
} as const;

// ============================================================================
// Internal helpers
// ============================================================================

async function postTokenRequest(
  body: URLSearchParams,
  fetcher: Fetcher
): Promise<MLTokenResponse> {
  let response;
  try {
    response = await fetcher(ML_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
  } catch (err) {
    if (err instanceof Error) {
      throw new MLNetworkError(err);
    }
    throw err;
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Non-JSON response — keep as raw text for diagnostic.
      json = { raw: text };
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw createApiError(
      response.status,
      json,
      response.headers,
      `OAuth token request failed: ${response.status}`
    );
  }

  if (!json || typeof json !== 'object') {
    throw new Error('OAuth token endpoint returned empty body');
  }

  const obj = json as Record<string, unknown>;
  if (typeof obj.access_token !== 'string' || typeof obj.refresh_token !== 'string') {
    throw new Error('OAuth token response missing access_token or refresh_token');
  }

  return {
    access_token: obj.access_token,
    refresh_token: obj.refresh_token,
    token_type: typeof obj.token_type === 'string' ? obj.token_type : 'Bearer',
    scope: typeof obj.scope === 'string' ? obj.scope : '',
    user_id: typeof obj.user_id === 'number' ? obj.user_id : Number(obj.user_id),
    expires_in: typeof obj.expires_in === 'number' ? obj.expires_in : Number(obj.expires_in) || 21600,
    refresh_expires_in:
      typeof obj.refresh_expires_in === 'number'
        ? obj.refresh_expires_in
        : obj.refresh_expires_in !== undefined
        ? Number(obj.refresh_expires_in)
        : undefined,
    issued_at: typeof obj.issued_at === 'string' ? obj.issued_at : undefined,
  };
}

function randomBytes(n: number): Uint8Array {
  // Node — prefer crypto.randomBytes (uses OpenSSL CSPRNG).
  if (typeof require !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeCrypto = require('crypto') as typeof import('crypto');
      return new Uint8Array(nodeCrypto.randomBytes(n));
    } catch {
      // Fall through to web crypto.
    }
  }

  // Web / Edge runtime fallback.
  const out = new Uint8Array(n);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(out);
    return out;
  }

  throw new Error('No cryptographically secure random source available');
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = (typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64'));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Default fetcher — uses the global `fetch` available in Node 20+. */
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