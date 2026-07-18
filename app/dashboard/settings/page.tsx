import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogoutButton } from './logout-button';

/**
 * Página de configurações do usuário (Server Component).
 */
export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua conta.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Informações da sua conta Supabase.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="E-mail" value={user.email ?? ''} />
          <Field label="ID do usuário" value={user.id} mono />
          <Field
            label="Verificado"
            value={
              user.email_confirmed_at ? (
                <Badge variant="success">Sim</Badge>
              ) : (
                <Badge variant="warning">Pendente</Badge>
              )
            }
          />
          <Field
            label="Criado em"
            value={new Date(user.created_at).toLocaleDateString('pt-BR')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessão</CardTitle>
          <CardDescription>Encerrar sessão neste dispositivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className={`col-span-2 text-sm ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  );
}