import { createClient } from '@/lib/supabase/server';
import { ConnectMlButton } from '@/components/connections/connect-ml-button';
import { ConnectionCard } from '@/components/connections/connection-card';
import { toConnectionView, type ConnectionRow } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Página de conexões (Server Component).
 *
 * Lista as conexões do usuário atual (RLS garante isolamento) e oferece
 * CTA para iniciar fluxo OAuth do Mercado Livre.
 */
export default async function ConnectionsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: rows } = await supabase
    .from('connections')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const connections = (rows as ConnectionRow[] | null)?.map(toConnectionView) ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Conexões</h1>
        <p className="text-sm text-muted-foreground">
          Conecte suas contas de marketplace via OAuth. Os tokens são armazenados
          criptografados (AES-256-GCM).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Livre</CardTitle>
          <CardDescription>
            Pedidos, itens, envios, faturamento e anúncios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectMlButton />
        </CardContent>
      </Card>

      {connections.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Suas conexões</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((c) => (
              <ConnectionCard key={c.id} connection={c} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}