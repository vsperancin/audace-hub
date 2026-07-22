'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

/**
 * Botão de logout — chama /api/auth/logout e redireciona pra /login.
 */
export function LogoutButton() {
  const router = useRouter();
  const [isPending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('logout error', err);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="destructive" disabled={isPending} onClick={handleLogout}>
      {isPending ? 'Saindo...' : 'Sair'}
    </Button>
  );
}