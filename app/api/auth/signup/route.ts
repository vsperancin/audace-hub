import { NextRequest, NextResponse } from 'next/server';
import { queryOne, hashPassword, createSession } from '@/lib/db';
import { validateInvite, consumeInvite } from '@/lib/invites';
import { audit } from '@/lib/audit';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/auth/signup
 * Body: { email, password, full_name?, invite_token }
 * Returns: { ok: true, redirect: string } | { ok: false, msg: string }
 *
 * SECURITY: signup é invite-only desde 2026-07-22.
 * Rate limit: 5 requests / minuto / IP.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent');

  // Rate limit primeiro (antes de qualquer trabalho)
  const rl = rateLimit(`signup:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!rl.ok) {
    await audit({
      action: 'auth.rate_limited',
      ipAddress: ip,
      userAgent,
      metadata: { route: '/api/auth/signup' },
    });
    return NextResponse.json(
      { ok: false, msg: 'Muitas tentativas. Tente novamente em 1 minuto.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  try {
    const body = await request.json();
    const { email, password, full_name, invite_token } = body;

    if (!email || !password || !invite_token) {
      return NextResponse.json(
        { ok: false, msg: 'Email, senha e token de convite são obrigatórios' },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' },
        { status: 400 },
      );
    }

    // Validar invite PRIMEIRO (não vaza se email existe vs invite)
    const invite = await validateInvite(invite_token, email);
    if (!invite) {
      await audit({
        action: 'auth.signup.no_invite',
        ipAddress: ip,
        userAgent,
        metadata: { email: email.toLowerCase() },
      });
      return NextResponse.json(
        { ok: false, msg: 'Convite inválido ou expirado' },
        { status: 403 },
      );
    }

    const existing = await queryOne(
      'SELECT id FROM public.users WHERE email = $1',
      [email.toLowerCase()],
    );
    if (existing) {
      await audit({
        action: 'auth.signup.email_taken',
        ipAddress: ip,
        userAgent,
        metadata: { email: email.toLowerCase() },
      });
      return NextResponse.json(
        { ok: false, msg: 'Email já cadastrado' },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await queryOne<{ id: string }>(
      `INSERT INTO public.users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email.toLowerCase(), passwordHash, full_name || null],
    );

    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'Erro ao criar usuário' },
        { status: 500 },
      );
    }

    // Marcar invite como usado
    await consumeInvite(invite_token, user.id);

    // Audit sucesso (sem user_id porque user_id referencia auth.users,
    // não public.users — em prod seria o id equivalente)
    await audit({
      action: 'auth.signup.success',
      resource: `user:${user.id}`,
      ipAddress: ip,
      userAgent,
      metadata: { email: email.toLowerCase() },
    });

    const token = await createSession(user.id, ip, userAgent ?? undefined);

    const response = NextResponse.json({ ok: true, redirect: '/dashboard' });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: true,  // SEMPRE — Cloudflare garante HTTPS no caminho até o container
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[api/auth/signup] error:', error);
    return NextResponse.json(
      { ok: false, msg: 'Erro interno do servidor' },
      { status: 500 },
    );
  }
}