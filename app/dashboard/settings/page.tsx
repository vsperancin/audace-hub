import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoutButton } from './logout-button';

/**
 * Página de configurações (Server Component) — STUB pós-refactor.
 */
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie sua conta e preferências.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sessão</CardTitle>
          <CardDescription>
            Encerrar sua sessão neste navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Mais configurações em breve (preferências de notificação, exportação de dados, etc).
      </p>
    </div>
  );
}