import Link from 'next/link';
import { cookies } from 'next/headers';
import { query, getSessionUser } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Plug } from 'lucide-react';

interface ConnectionRow {
  id: string;
  platform: string;
  account_label: string | null;
  status: string;
  token_expires_at: Date | null;
}

/**
 * Overview do dashboard (Server Component).
 * Lista conexões + CTA principal: conectar Mercado Livre.
 */
export default async function DashboardPage() {
  const token = cookies().get('session_token')?.value;
  const user = token ? await getSessionUser(token) : null;

  if (!user) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Faça login para acessar o dashboard.</p>
        <Button asChild className="mt-4">
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    );
  }

  const connections = await query<ConnectionRow>(
    `SELECT id, platform, account_label, status, token_expires_at
       FROM public.connections
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [user.id],
  );

  const total = connections.length;
  const active = connections.filter((c) => c.status === 'active').length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            Conecte suas contas de marketplace para começar.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/connections">
            <PlusCircle className="mr-2 h-4 w-4" />
            Conectar conta
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Conexões ativas</CardDescription>
            <CardTitle className="text-3xl">{active}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              de {total} conexão(ões) cadastrada(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Marketplaces</CardDescription>
            <CardTitle className="text-3xl">
              {new Set(connections.map((c) => c.platform)).size}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">plataformas conectadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Próximo passo</CardDescription>
            <CardTitle className="text-base font-medium">
              Conecte sua primeira conta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/connections">
                <Plug className="mr-2 h-4 w-4" />
                Mercado Livre
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}