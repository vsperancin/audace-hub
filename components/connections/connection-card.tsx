'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import type { ConnectionView } from '@/types';

const PLATFORM_LABELS: Record<ConnectionView['platform'], string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  magalu: 'Magalu',
  amazon: 'Amazon',
};

/**
 * Card de conexão existente. Mostra status, data de expiração do token e
 * ações (renovar, remover). Token nunca é exibido.
 */
interface ConnectionCardProps {
  connection: ConnectionView;
}

export function ConnectionCard({ connection }: ConnectionCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Remover conexão ${PLATFORM_LABELS[connection.platform]}?`)) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/connections/${connection.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        router.refresh();
      } else {
        alert('Falha ao remover conexão');
        setIsDeleting(false);
      }
    } catch {
      setIsDeleting(false);
    }
  }

  const statusBadge = (() => {
    switch (connection.status) {
      case 'active':
        return connection.isExpiringSoon ? (
          <Badge variant="warning">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Expira em breve
          </Badge>
        ) : (
          <Badge variant="success">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Ativa
          </Badge>
        );
      case 'expired':
        return <Badge variant="warning">Expirada</Badge>;
      case 'error':
        return <Badge variant="warning">Erro</Badge>;
      case 'disconnected':
        return <Badge variant="destructive">Desconectada</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
    }
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">
              {PLATFORM_LABELS[connection.platform]}
            </CardTitle>
            <CardDescription className="font-mono text-xs">
              ID: {connection.accountId}
            </CardDescription>
          </div>
          {statusBadge}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          Token expira em{' '}
          <span className="font-medium text-foreground">
            {connection.tokenExpiresAt
              ? formatDateTime(connection.tokenExpiresAt)
              : '—'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {connection.scopes.map((scope) => (
            <Badge key={scope} variant="outline" className="text-[10px]">
              {scope}
            </Badge>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="mr-2 h-3 w-3" />
          {isDeleting ? 'Removendo...' : 'Remover'}
        </Button>
      </CardContent>
    </Card>
  );
}