import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { generateState, buildAuthorizationUrl, SCOPE_PRESETS } from '@/lib/ml/oauth';

/**
 * POST /api/oauth/ml/start
 *
 * Inicia o fluxo OAuth2 do Mercado Livre.
 *
 * Fluxo:
 *  1. Valida auth (middleware já garante, mas conferimos de novo).
 *  2. Valida body (Zod, opcional).
 *  3. Gera state aleatório (32 bytes base64url).
 *  4. Persiste state no DB (TTL 10 min) — vinculado ao user_id.
 *  5. Retorna `authorization_url` para o client redirecionar o browser.
 *
 * @see https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
 */

const bodySchema = z.object({
  redirectAfter: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Auth: precisa estar logado.
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: { code: 'unauthorized', message: 'Faça login primeiro' } },
        { status: 401 },
      );
    }

    // 2. Valida body (opcional).
    let body: z.infer<typeof bodySchema> = {};
    try {
      const json = (await request.json()) as unknown;
      body = bodySchema.parse(json);
    } catch {
      // Body vazio é OK.
    }

    // 3. Valida env vars.
    const appId = process.env.ML_APP_ID;
    const redirectUri = process.env.ML_REDIRECT_URI;
    if (!appId || !redirectUri) {
      console.error('[oauth/ml/start] ML_APP_ID ou ML_REDIRECT_URI não configurados');
      return NextResponse.json(
        { ok: false, error: { code: 'misconfigured', message: 'Variáveis OAuth não configuradas' } },
        { status: 500 },
      );
    }

    // 4. Gera state e persiste.
    const state = generateState();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    const { error: insertError } = await supabase.from('oauth_states').insert({
      state,
      user_id: user.id,
      platform: 'mercadolivre',
      redirect_after: body.redirectAfter ?? null,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('[oauth/ml/start] erro ao salvar state:', insertError);
      return NextResponse.json(
        { ok: false, error: { code: 'db_error', message: 'Falha ao iniciar OAuth' } },
        { status: 500 },
      );
    }

    // 5. Constrói URL e retorna.
    // SCOPE_PRESETS.SELLER_DASHBOARD = read + write + orders + items + shipments
    // + questions + financial + advertising. Cobre todos os requisitos do produto.
    const authorizationUrl = buildAuthorizationUrl(
      appId,
      redirectUri,
      SCOPE_PRESETS.SELLER_DASHBOARD,
      state,
    );

    return NextResponse.json({
      ok: true,
      data: { authorization_url: authorizationUrl },
    });
  } catch (error) {
    console.error('[oauth/ml/start] erro inesperado:', error);
    return NextResponse.json(
      { ok: false, error: { code: 'internal_error', message: 'Erro inesperado' } },
      { status: 500 },
    );
  }
}