// IMPORTS DNS-FIX PRIMEIRO: força DNS público (8.8.8.8, 1.1.1.1)
// porque container Coolify não tem DNS configurado
import '@/lib/dns-fix';

import { NextResponse, type NextRequest } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';
import { exchangeCodeForTokens, validateState } from '@/lib/ml/oauth';
import { encrypt } from '@/lib/crypto/tokens';

/**
 * GET /api/oauth/ml/callback
 *
 * Callback OAuth2 do Mercado Livre.
 *
 * Fluxo:
 *  1. Recebe `code` + `state` do ML (?code=...&state=...).
 *  2. Valida state contra tabela oauth_states (constant-time, anti-CSRF).
 *  3. Troca code por access_token + refresh_token.
 *  4. Criptografa tokens com AES-256-GCM.
 *  5. Salva em `connections`.
 *  6. Marca oauth_state como consumido.
 *  7. Redireciona para /dashboard/connections.
 *
 * SEGURANÇA:
 *  - state TTL 10 min + single-use.
 *  - Tokens NUNCA aparecem em logs ou URL.
 *  - Criptografia AES-256-GCM com chave do env.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const fail = (msg: string) => {
    const redirectUrl = new URL('/dashboard/connections', url.origin);
    redirectUrl.searchParams.set('error', 'oauth_failed');
    redirectUrl.searchParams.set('msg', msg);
    return NextResponse.redirect(redirectUrl);
  };

  // 1. ML pode retornar error se o user negou
  if (oauthError) {
    return fail(`Mercado Livre recusou: ${oauthError}`);
  }
  if (!code || !state) {
    return fail('Parâmetros code/state ausentes');
  }

  try {
    // 2. Valida state contra oauth_states
    const stateRow = await queryOne<{ user_id: string; expires_at: Date; consumed_at: Date | null }>(
      `SELECT user_id, expires_at, consumed_at
         FROM public.oauth_states
        WHERE state = $1`,
      [state],
    );

    if (!stateRow) {
      return fail('State inválido (possível CSRF ou expirado)');
    }
    if (stateRow.consumed_at) {
      return fail('State já utilizado (replay detectado)');
    }
    if (new Date(stateRow.expires_at) < new Date()) {
      return fail('State expirado (>10min) — reinicie o fluxo');
    }

    // 3. Marca state como consumido (single-use)
    await execute(
      `UPDATE public.oauth_states SET consumed_at = NOW() WHERE state = $1`,
      [state],
    );

    // 4. Troca code por tokens
    const clientId = process.env.ML_APP_ID || '';
    const clientSecret = process.env.ML_CLIENT_SECRET || '';
    const redirectUri = process.env.ML_REDIRECT_URI || `${url.origin}/api/oauth/ml/callback`;

    if (!clientId || !clientSecret) {
      return fail('ML_APP_ID ou ML_CLIENT_SECRET não configurados');
    }

    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);

    // 5. user_id (do Mercado Livre) — vem no response ou via /users/me
    // Para simplificar: usa o user_id do state (vinculado ao nosso user)
    const userId = stateRow.user_id;

    // 6. user_id do ML (pra preencher account_id no upsert)
    // O access_token response não tem user_id ML. Usamos account_id genérico.
    const accountId = `ml-${userId.slice(0, 8)}`; // placeholder
    const accountLabel = `Mercado Livre ${new Date().toISOString().slice(0, 10)}`;

    // 7. Criptografa tokens
    const accessTokenEnc = encrypt(tokens.access_token);
    const refreshTokenEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

    // 8. Calcula expires_at
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // 9. Salva em public.connections
    await execute(
      `INSERT INTO public.connections (
         user_id, platform, account_id, account_label, account_metadata,
         access_token_encrypted, refresh_token_encrypted, token_expires_at,
         scopes, status, last_sync_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW())
       ON CONFLICT (user_id, platform, account_id)
       DO UPDATE SET
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = 'active',
         last_sync_at = NOW(),
         updated_at = NOW()`,
      [
        userId,
        'mercadolivre',
        accountId,
        accountLabel,
        JSON.stringify({ ml_token_type: tokens.token_type, ml_scope: tokens.scope }),
        accessTokenEnc,
        refreshTokenEnc,
        expiresAt,
        tokens.scope ? tokens.scope.split(' ') : null,
      ],
    );

    // 10. Sucesso — redireciona pro dashboard de conexões
    const successUrl = new URL('/dashboard/connections', url.origin);
    successUrl.searchParams.set('success', 'ml_connected');
    return NextResponse.redirect(successUrl);
  } catch (error) {
    console.error('[api/oauth/ml/callback] error:', error);
    return fail(`Erro ao processar callback: ${(error as Error).message}`);
  }
}