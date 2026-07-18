'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plug, Loader2 } from 'lucide-react';

/**
 * Botão que inicia o fluxo OAuth do Mercado Livre.
 *
 * Fluxo:
 *  1. POST /api/oauth/ml/start → recebe authorization_url.
 *  2. window.location.assign(authorization_url) → redireciona pro ML.
 *  3. ML autentica e redireciona para /api/oauth/ml/callback.
 *  4. Callback troca code por tokens, salva no DB e redireciona pro dashboard.
 */
export function ConnectMlButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/oauth/ml/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redirectAfter: '/dashboard/connections' }),
      });

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(json?.error?.message ?? 'Falha ao iniciar conexão');
      }

      const json = (await response.json()) as { data: { authorization_url: string } };
      window.location.assign(json.data.authorization_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado');
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Plug className="mr-2 h-4 w-4" />
        )}
        {isLoading ? 'Conectando...' : 'Conectar Mercado Livre'}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}