import { NextResponse, type NextRequest } from 'next/server';

/**
 * GET /api/oauth/ml/callback
 *
 * STUB pós-refactor Supabase → Postgres Coolify.
 *
 * A lógica completa do callback OAuth (validação de state, troca de code por
 * tokens, criptografia AES-256-GCM, upsert em `connections`) será
 * re-implementada usando lib/db.ts + lib/crypto/tokens. Por ora, apenas
 * redireciona com erro informativo.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error') || 'callback_not_implemented';

  const redirectUrl = new URL('/dashboard/connections', url.origin);
  redirectUrl.searchParams.set('error', error);
  redirectUrl.searchParams.set('msg', 'OAuth callback em re-implementação. Tente novamente em breve.');

  return NextResponse.redirect(redirectUrl);
}