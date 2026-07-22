import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plug } from 'lucide-react';

/**
 * Página de conexões (Server Component) — STUB pós-refactor Supabase.
 *
 * Mostra apenas o CTA pra conectar Mercado Livre. A listagem real das
 * conexões existentes será re-implementada usando lib/db.ts.
 */
export default async function ConnectionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Conexões</h1>
        <p className="text-sm text-muted-foreground">
          Conecte suas contas de marketplace para começar a sincronizar.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mercado Livre</CardTitle>
          <CardDescription>
            Conecte sua conta do Mercado Livre pra sincronizar pedidos, anúncios
            e métricas de ads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/api/oauth/ml/start">
              <Plug className="mr-2 h-4 w-4" />
              Conectar Mercado Livre
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Em breve: listagem das suas conexões existentes, status do token, e ações de gerenciamento.
      </p>
    </div>
  );
}