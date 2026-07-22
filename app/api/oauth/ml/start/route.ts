// IMPORTS DNS-FIX PRIMEIRO
import '@/lib/dns-fix';

import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, execute } from '@/lib/db';
import { generateState, buildAuthorizationUrl, SCOPE_PRESETS } from '@/lib/ml/oauth';

/**
 * GET /api/oauth/ml/start
 *
 * Inicia o fluxo OAuth2 do Mercado Livre. É um GET (não POST) porque o
 * usuário acessa via clique num link — o browser faz GET automaticamente.
 *
 * Fluxo:
 *  1. Valida auth (cookie session_token → public.sessions).
 *     Se não autenticado, redireciona pra /login?redirect=/dashboard.
 *  2. Gera state aleatório (32 bytes base64url).
 *  3. Persiste state no DB (TTL 10 min) — vinculado ao user_id.
 *  4. Redireciona o browser pra authorization_url do Mercado Livre.
 *
 * O Mercado Livre faz OAuth2 normal: code + state → /api/oauth/ml/callback.
 */

export async function GET(request: NextRequest) {
  try {
    // 1. Auth: precisa estar logado
    const token = cookies().get('session_token')?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', '/dashboard');
      return NextResponse.redirect(loginUrl);
    }

    // 2. State
    const state = generateState();

    // 3. Persist state (vinculado ao user_id, expira em 10min)
    await execute(
      `INSERT INTO public.oauth_states (state, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
       ON CONFLICT (state) DO NOTHING`,
      [state, user.id],
    );

    // 4. Build authorization URL
    const clientId = process.env.ML_APP_ID || '';
    const redirectUri = process.env.ML_REDIRECT_URI || `https://${request.headers.get('host')}/api/oauth/ml/callback`;
    const authUrl = buildAuthorizationUrl(clientId, redirectUri, SCOPE_PRESETS.READ_WRITE, state);

    // 5. Redirect direto pro Mercado Livre (em vez de retornar JSON)
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[api/oauth/ml/start] error:', error);
    const errUrl = new URL('/dashboard/connections', request.url);
    errUrl.searchParams.set('error', 'oauth_start_failed');
    return NextResponse.redirect(errUrl);
  }
}