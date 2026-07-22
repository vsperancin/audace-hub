'use client';

/**
 * STUB: Supabase foi removido. Audace Hub agora usa Postgres Coolify direto.
 * Esta função retorna `null` para indicar que a integração Supabase não está
 * mais disponível. Pages que usavam isso vão quebrar até o refactor ser
 * completado.
 *
 * Para usar o novo banco:
 *   import { query, queryOne, execute } from '@/lib/db'
 */

export function createClient(): null {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[lib/supabase/client] Supabase removido. Use lib/db.ts.');
  }
  return null;
}