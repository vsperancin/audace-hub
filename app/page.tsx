import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Landing pública (Server Component).
 * Single-CTA: login ou signup.
 * Sem analytics, sem tracking — área pública mínima.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-bold text-brand-500">Audace Hub</span>
          <nav className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Criar conta</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="container flex flex-1 flex-col items-center justify-center py-20 text-center">
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          Um único painel para <span className="text-brand-500">todas</span> as suas
          vendas em marketplace.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Conecte Mercado Livre, Shopee, Magalu e Amazon em segundos.
          Pedidos, estoque e faturamento consolidados em um só lugar.
        </p>
        <div className="mt-10 flex gap-4">
          <Button asChild size="lg">
            <Link href="/signup">Começar grátis</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Já tenho conta</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-6">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Audace Hub. Todos os direitos reservados.
        </div>
      </footer>
    </main>
  );
}