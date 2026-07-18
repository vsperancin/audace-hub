import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Middleware global do Next.js.
 *
 * Responsabilidades:
 *  1. Refrescar o cookie de sessão do Supabase a cada request (necessário
 *     porque tokens JWT expiram e o @supabase/ssr renova via cookie).
 *  2. Proteger rotas autenticadas: /dashboard/** e /api/** (exceto health,
 *     webhooks e rotas explicitamente públicas).
 *  3. Redirecionar usuários não autenticados para /login?redirect=<path>.
 *
 * IMPORTANTE: nunca coloque lógica pesada aqui — middleware roda em Edge
 * Runtime e tem limites de CPU/memória.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas EXCETO:
     *  - _next/static (assets estáticos)
     *  - _next/image (otimização de imagem)
     *  - favicon.ico
     *  - arquivos públicos (png, jpg, svg, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};