import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware global do Next.js.
 *
 * STUB: Refactor de Supabase → Postgres Coolify. Auth check está desabilitado
 * temporariamente. Todas as rotas passam livre; páginas autenticadas mostram
 * "Em manutenção" via layout guard.
 *
 * Pra reabilitar auth, implementar:
 *   1. Ler cookie `session_token`
 *   2. Validar contra `public.sessions` (lib/db.ts → getSessionUser)
 *   3. Se inválido e rota protegida, redirect /login?redirect=<path>
 */
export async function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};