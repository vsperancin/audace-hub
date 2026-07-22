import { cookies } from 'next/headers';

/**
 * STUB: Supabase foi removido. Audace Hub agora usa Postgres Coolify direto.
 * Esta função retorna `null` para indicar que a integração Supabase não está
 * mais disponível. Pages que usavam isso vão quebrar até o refactor ser
 * completado.
 *
 * Para usar o novo banco:
 *   import { query, queryOne, execute, getSessionUser } from '@/lib/db'
 */

export function createClient(): null {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[lib/supabase/server] Supabase removido. Use lib/db.ts.');
  }
  return null;
}

export function createAdminClient(): null {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[lib/supabase/server] createAdminClient removido. Use lib/db.ts.');
  }
  return null;
}

// Re-exports vazios pra não quebrar imports
export type CookieOptions = any;