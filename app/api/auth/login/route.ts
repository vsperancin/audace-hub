import { NextRequest, NextResponse } from 'next/server';
import { queryOne, verifyPassword, createSession } from '@/lib/db';
import { audit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { ok: true, redirect: string } | { ok: false, msg: string }
 *
 * SECURITY: rate limit 5 req/min/IP. Audit log de sucessos e falhas.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');

  const rl = rateLimit(`login:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    await audit({
      action: 'auth.rate_limited',
      ipAddress: ip,
      userAgent,
      metadata: { route: '/api/auth/login' },
    });
    return NextResponse.json(
      { ok: false, msg: 'Muitas tentativas. Tente novamente em 1 minuto.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, msg: 'Email e senha obrigatórios' },
        { status: 400 },
      );
    }

    const user = await queryOne<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM public.users WHERE email = $1',
      [email.toLowerCase()],
    );

    if (!user) {
      // Timing-attack mitigation: hash dummy pra igualar tempo
      await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
      await audit({
        action: 'auth.login.failed',
        ipAddress: ip,
        userAgent,
        metadata: { email: email.toLowerCase(), reason: 'user_not_found' },
      });
      return NextResponse.json(
        { ok: false, msg: 'Email ou senha inválidos' },
        { status: 401 },
      );
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await audit({
        action: 'auth.login.failed',
        ipAddress: ip,
        userAgent,
        resource: `user:${user.id}`,
        metadata: { reason: 'bad_password' },
      });
      return NextResponse.json(
        { ok: false, msg: 'Email ou senha inválidos' },
        { status: 401 },
      );
    }

    await audit({
      action: 'auth.login.success',
      ipAddress: ip,
      userAgent,
      resource: `user:${user.id}`,
    });

    const token = await createSession(user.id, ip, userAgent ?? undefined);

    const response = NextResponse.json({ ok: true, redirect: '/dashboard' });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: true,  // SEMPRE HTTPS-only
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[api/auth/login] error:', error);
    return NextResponse.json(
      { ok: false, msg: 'Erro interno do servidor' },
      { status: 500 },
    );
  }
}