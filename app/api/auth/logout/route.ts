import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession, getSessionUser } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/logout
 * Limpa cookie session_token e remove sessão do DB. Audita.
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('session_token')?.value;
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');

  let userId: string | undefined;
  if (token) {
    // Pegar user antes de deletar pra audit
    const user = await getSessionUser(token);
    userId = user?.id;
    await deleteSession(token);
  }

  await audit({
    action: 'auth.logout',
    resource: userId ? `user:${userId}` : undefined,
    ipAddress: ip,
    userAgent,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set('session_token', '', {
    httpOnly: true,
    secure: true,  // SEMPRE HTTPS-only
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}