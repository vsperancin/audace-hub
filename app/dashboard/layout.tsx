import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Topbar } from '@/components/dashboard/topbar';

/**
 * Layout autenticado (Server Component).
 *
 * - Server-side check de sessão: se não houver user, redireciona pra /login.
 *   (Defesa em profundidade — middleware já protege, mas server check é
 *   obrigatório pra evitar flash de UI logada.)
 * - Estrutura: Sidebar fixa à esquerda (estilo Magiic) + Topbar + main.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar userEmail={user.email ?? ''} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}