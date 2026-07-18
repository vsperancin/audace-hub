import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cliente Supabase para uso em SERVER COMPONENTS e ROUTE HANDLERS (RSC).
 *
 * Lê cookies via next/headers — só funciona em Server Components, Server
 * Actions e Route Handlers. Para Client Components use lib/supabase/client.ts.
 *
 * Atenção ao adapter de cookies: o Next 14 mudou o formato de cookies().
 * Use getAll/setAll (não get/set/remove).
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Em Server Components, `cookies().set()` é read-only.
            // Isso é esperado — o middleware cuida da renovação.
            // Apenas ignoramos em produção, logamos em dev.
            if (process.env.NODE_ENV === 'development') {
              console.warn('[supabase/server] cookies().set() falhou (read-only em RSC):', error);
            }
          }
        },
      },
    },
  );
}

/**
 * Cliente administrativo (SERVICE_ROLE).
 *
 * ⚠️  BYPASSA RLS — use APENAS em:
 *    - Webhooks (validação de assinatura já garante origem)
 *    - Jobs em background (BullMQ workers)
 *    - Operações que precisam ignorar RLS (ex: encryptar token OAuth)
 *
 * NUNCA exponha este cliente ao browser.
 * NUNCA passe o resultado para Client Components.
 */
export function createAdminClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    },
  );
}