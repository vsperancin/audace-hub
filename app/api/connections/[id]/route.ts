import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, execute } from '@/lib/db';

/**
 * DELETE /api/connections/[id]
 *
 * Remove uma conexão do usuário autenticado.
 *
 * STUB pós-refactor Supabase: implementa com `db.execute` direto (sem RLS,
 * então validamos user_id manualmente).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const token = cookies().get('session_token')?.value;
  const user = token ? await getSessionUser(token) : null;

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Faça login primeiro' } },
      { status: 401 },
    );
  }

  const deleted = await execute(
    'DELETE FROM public.connections WHERE id = $1 AND user_id = $2',
    [id, user.id],
  );

  if (deleted === 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Conexão não encontrada' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}