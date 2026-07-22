import { NextResponse, type NextRequest } from 'next/server';

/**
 * STUB: Supabase removido. Audace Hub agora usa Postgres Coolify.
 *
 * Esta função retornava `updateSession(request)` antes — usada pelo middleware
 * global pra refresh de cookies Supabase. Como não temos mais Supabase Auth
 * (trocamos por sessions em lib/db.ts), o middleware raiz (./middleware.ts)
 * já virou pass-through. Esta função é mantida como stub pra imports
 * legados não quebrarem.
 */

export async function updateSession(request: NextRequest) {
  return NextResponse.next();
}