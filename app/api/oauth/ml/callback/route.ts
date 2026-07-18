import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
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
 *  5. Salva em `connections` (RLS garante user_id = state.user_id).
 *  6. Marca oauth_state como consumido.
 *  7. Redireciona para /dashboard/connections (ou redirect_after).
 *
 * SEGURANÇA:
 *  - Esta rota é PÚBLICA (o state + DB vinculam ao user).
 *  - state tem TTL 10 min + single-use.
 *  - Tokens NUNCA aparecem em logs ou URL.
 */

const querySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  // 1. ML pode retornar `error` se o user negou.
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return redirectWithError('/login', 'invalid_callback', 'Parâmetros inválidos no callback');
  }

  if (parsed.data.error) {
    return redirectWithError(
      '/dashboard/connections',
      'oauth_denied',
      parsed.data.error_description ?? parsed.data.error,
    );
  }

  const { code, state } = parsed.data;

  // 2. Valida state (constant-time) + busca no DB.
  //    Service-role pois a sessão do user pode ainda não ter cookie setado
  //    neste momento exato (race entre callback e middleware).
  const admin = createAdminClient();
  const { data: stateRow, error: stateError } = await admin
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (stateError || !stateRow) {
    console.warn('[oauth/ml/callback] state inválido, expirado ou já consumido');
    return redirectWithError(
      '/dashboard/connections',
      'invalid_state',
      'Sessão OAuth expirou ou foi reutilizada. Tente novamente.',
    );
  }

  // Defesa extra: garantir que state bate byte-a-byte.
  if (!validateState(state, stateRow.state)) {
    console.error('[oauth/ml/callback] state hash mismatch — possível tampering');
    return redirectWithError(
      '/dashboard/connections',
      'invalid_state',
      'Sessão OAuth inválida.',
    );
  }

  // 3. Valida env vars.
  const appId = process.env.ML_APP_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!appId || !clientSecret || !redirectUri) {
    console.error('[oauth/ml/callback] env vars faltando');
    return redirectWithError(
      '/dashboard/connections',
      'misconfigured',
      'Configuração OAuth incompleta no servidor',
    );
  }

  // 4. Troca code por tokens.
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, appId, clientSecret, redirectUri);
  } catch (err) {
    console.error('[oauth/ml/callback] token exchange falhou:', err);
    return redirectWithError(
      '/dashboard/connections',
      'token_exchange_failed',
      err instanceof Error ? err.message : 'Falha ao trocar code por tokens',
    );
  }

  // 5. Criptografa tokens.
  let accessEnc: string;
  let refreshEnc: string | null = null;
  try {
    accessEnc = encrypt(tokens.access_token);
    if (tokens.refresh_token) {
      refreshEnc = encrypt(tokens.refresh_token);
    }
  } catch (err) {
    console.error('[oauth/ml/callback] falha ao criptografar tokens:', err);
    return redirectWithError(
      '/dashboard/connections',
      'crypto_error',
      'Falha ao salvar tokens com segurança',
    );
  }

  // 6. Salva conexão.
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { error: upsertError } = await admin.from('connections').upsert(
    {
      user_id: stateRow.user_id,
      platform: 'mercadolivre',
      account_id: String(tokens.user_id),
      account_label: null, // populado depois via /users/me
      account_metadata: null,
      status: 'active',
      access_token_encrypted: accessEnc,
      refresh_token_encrypted: refreshEnc,
      token_expires_at: expiresAt,
      scopes: tokens.scope.split(' '),
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,platform,account_id',
    },
  );

  if (upsertError) {
    console.error('[oauth/ml/callback] upsert connection falhou:', upsertError);
    return redirectWithError(
      '/dashboard/connections',
      'db_error',
      'Falha ao salvar conexão',
    );
  }

  // 7. Marca state como consumido.
  await admin
    .from('oauth_states')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', stateRow.id);

  // 8. Redireciona para o destino original (ou padrão).
  const redirectTo = stateRow.redirect_after ?? '/dashboard/connections';
  return NextResponse.redirect(new URL(redirectTo, request.url));
}

function redirectWithError(path: string, code: string, message: string) {
  const url = new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000');
  url.searchParams.set('oauth_error', code);
  url.searchParams.set('oauth_message', message.slice(0, 200));
  return NextResponse.redirect(url);
}