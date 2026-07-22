'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface TopbarProps {
  userEmail: string;
}

/**
 * Topbar do dashboard (Client Component).
 *
 * STUB pós-refactor Supabase: não tem menu de user real, só mostra email.
 * O logout é feito pela página /dashboard/settings (botão dedicado).
 */
export function Topbar({ userEmail }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="font-semibold">
          Audace Hub
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{userEmail}</span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/settings">Configurações</Link>
        </Button>
      </div>
    </header>
  );
}