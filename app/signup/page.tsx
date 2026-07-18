import { SignupForm } from './signup-form';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-8 shadow-sm">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-brand-500">Audace Hub</h1>
          <p className="text-sm text-muted-foreground">Crie sua conta gratuita</p>
        </header>

        <SignupForm />

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link href="/login" className="font-medium text-brand-500 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}