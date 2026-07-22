import { NextRequest, NextResponse } from 'next/server';
import { queryOne, verifyPassword, createSession } from '@/lib/db';

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Returns: { ok: true, redirect: string } | { ok: false, msg: string }
 *
 * Auth com Postgres Coolify (substitui Supabase Auth).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ ok: false, msg: 'Email e senha obrigatórios' }, { status: 400 });
    }

    const user = await queryOne<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM public.users WHERE email = $1',
      [email.toLowerCase()],
    );

    if (!user) {
      return NextResponse.json({ ok: false, msg: 'Email ou senha inválidos' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ ok: false, msg: 'Email ou senha inválidos' }, { status: 401 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    const token = await createSession(user.id, ipAddress, userAgent);

    const response = NextResponse.json({ ok: true, redirect: '/dashboard' });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 dias
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[api/auth/login] error:', error);
    return NextResponse.json({ ok: false, msg: 'Erro interno do servidor' }, { status: 500 });
  }
}