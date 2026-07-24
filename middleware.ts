import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware global do Next.js.
 *
 * Aplica headers de segurança em TODA response.
 * Auth check de rotas protegidas fica nos layouts (já implementado).
 *
 * Pra reabilitar auth aqui (defesa em profundidade):
 *   1. Ler cookie `session_token`
 *   2. Validar contra `public.sessions` (lib/db.ts → getSessionUser)
 *   3. Se inválido e rota protegida, redirect /login?redirect=<path>
 */

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'; default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; font-src 'self' data:",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};