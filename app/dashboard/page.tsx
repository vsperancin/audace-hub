import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Plug } from 'lucide-react';

/**
 * Overview do dashboard (Server Component).
 * Lista conexões + CTA principal: conectar Mercado Livre.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null; // layout já redireciona, mas TS precisa do guard.

  const { data: connections } = await supabase
    .from('connections')
    .select('id, platform, account_label, status, token_expires_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const total = connections?.length ?? 0;
  const active = connections?.filter((c) => c.status === 'active').length ?? 0;

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
              {new Set(connections?.map((c) => c.platform)).size}
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