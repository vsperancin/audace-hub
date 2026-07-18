import { LoginForm } from './login-form';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Entrar' };

interface LoginPageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-brand-500">Audace Hub</h1>
          <p className="text-sm text-muted-foreground">Entre com sua conta</p>
        </header>

        <LoginForm redirectTo={params.redirect ?? '/dashboard'} />

        <p className="text-center text-sm text-muted-foreground">
          Não tem conta?{' '}
          <Link href="/signup" className="font-medium text-brand-500 hover:underline">
            Criar agora
          </Link>
        </p>
      </div>
    </main>
  );
}