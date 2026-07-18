'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para uso no BROWSER (Client Components).
 *
 * - Usa anon key (pública, RLS-enforced).
 * - Persiste sessão em cookies (não localStorage) — funciona com SSR.
 * - NUNCA use este cliente com service_role — apenas leitura/escrita do
 *   próprio usuário (respeitando RLS).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}