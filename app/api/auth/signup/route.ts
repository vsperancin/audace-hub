import { NextRequest, NextResponse } from 'next/server';
import { queryOne, hashPassword, createSession } from '@/lib/db';

/**
 * POST /api/auth/signup
 * Body: { email: string, password: string, full_name?: string }
 * Returns: { ok: true, redirect: string } | { ok: false, msg: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, full_name } = body;

    if (!email || !password) {
      return NextResponse.json({ ok: false, msg: 'Email e senha obrigatórios' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ ok: false, msg: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    const existing = await queryOne('SELECT id FROM public.users WHERE email = $1', [email.toLowerCase()]);
    if (existing) {
      return NextResponse.json({ ok: false, msg: 'Email já cadastrado' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await queryOne<{ id: string }>(
      `INSERT INTO public.users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email.toLowerCase(), passwordHash, full_name || null],
    );

    if (!user) {
      return NextResponse.json({ ok: false, msg: 'Erro ao criar usuário' }, { status: 500 });
    }

    const ipAddress = request.headers.get('x-forwarded-for') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    const token = await createSession(user.id, ipAddress, userAgent);

    const response = NextResponse.json({ ok: true, redirect: '/dashboard' });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[api/auth/signup] error:', error);
    return NextResponse.json({ ok: false, msg: 'Erro interno do servidor' }, { status: 500 });
  }
}