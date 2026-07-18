import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Lista de rotas públicas que NÃO exigem autenticação.
 * Tudo fora desta lista + /dashboard + /api/* exige login.
 */
const PUBLIC_ROUTES = new Set<string>([
  '/',
  '/login',
  '/signup',
  '/auth/callback',
]);

// Endpoints públicos dentro de /api (webhooks, healthcheck, etc).
const PUBLIC_API_PREFIXES = ['/api/health', '/api/oauth/ml/callback'];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Atualiza os cookies de sessão do Supabase e enforce auth em rotas protegidas.
 *
 * O @supabase/ssr exige um adapter de cookies — implementamos nos formatos
 * `getAll`/`setAll` (novo) ao invés do legado `get`/`set`/`remove` para
 * suportar cookies particionados usados em Server Actions.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // IMPORTANTE: getUser() valida o JWT no servidor (não confia apenas no cookie).
  // Se o token expirou, o Supabase renova automaticamente via refresh token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ---- Regras de acesso ----
  const isProtected =
    pathname.startsWith('/dashboard') ||
    (pathname.startsWith('/api/') && !isPublicRoute(pathname));

  if (!user && isProtected) {
    if (pathname.startsWith('/api/')) {
      // Para API, retorna 401 JSON em vez de redirect.
      return NextResponse.json(
        { error: 'unauthorized', message: 'Autenticação necessária' },
        { status: 401 },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Usuário autenticado tentando acessar /login ou /signup → manda pro dashboard.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}