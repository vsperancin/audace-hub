import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/db';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Topbar } from '@/components/dashboard/topbar';

/**
 * Layout autenticado (Server Component).
 *
 * - Lê cookie `session_token` e valida contra `public.sessions` (Postgres).
 * - Se inválido, redireciona pra /login.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('session_token')?.value;

  let user: { id: string; email: string; full_name: string | null } | null = null;
  if (token) {
    user = await getSessionUser(token);
  }

  if (!user) {
    redirect('/login?redirect=/dashboard');
  }

  return (
    <div className="flex min-h-screen bg-muted/40">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar userEmail={user.email} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}