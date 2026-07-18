import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/connections/[id]
 *
 * Remove uma conexão do usuário autenticado. RLS garante que só é possível
 * deletar conexões próprias (qualquer tentativa de deletar de outro user
 * retorna 404 — Postgres não revela existência).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Faça login primeiro' } },
      { status: 401 },
    );
  }

  const { error, count } = await supabase
    .from('connections')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('[DELETE /api/connections/:id]', error);
    return NextResponse.json(
      { ok: false, error: { code: 'db_error', message: 'Falha ao remover conexão' } },
      { status: 500 },
    );
  }

  if (count === 0) {
    return NextResponse.json(
      { ok: false, error: { code: 'not_found', message: 'Conexão não encontrada' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, data: { id } });
}