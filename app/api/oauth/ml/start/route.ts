import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, execute } from '@/lib/db';
import { generateState, buildAuthorizationUrl, SCOPE_PRESETS } from '@/lib/ml/oauth';

/**
 * POST /api/oauth/ml/start
 *
 * Inicia o fluxo OAuth2 do Mercado Livre.
 *
 * Fluxo:
 *  1. Valida auth (cookie session_token → public.sessions).
 *  2. Gera state aleatório (32 bytes base64url).
 *  3. Persiste state no DB (TTL 10 min) — vinculado ao user_id.
 *  4. Retorna `authorization_url` para o client redirecionar o browser.
 */

export async function POST(request: NextRequest) {
  try {
    const token = cookies().get('session_token')?.value;
    const user = token ? await getSessionUser(token) : null;
    if (!user) {
      return NextResponse.json({ ok: false, msg: 'Não autenticado' }, { status: 401 });
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

    return NextResponse.json({ ok: true, authorization_url: authUrl });
  } catch (error) {
    console.error('[api/oauth/ml/start] error:', error);
    return NextResponse.json({ ok: false, msg: 'Erro ao iniciar OAuth' }, { status: 500 });
  }
}