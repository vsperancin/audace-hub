/**
 * Tipos compartilhados do Audace Hub.
 *
 * Convenção: tipos do banco (snake_case) ficam separados dos tipos de UI
 * (camelCase) para evitar acoplamento entre Postgres e React.
 *
 * Para tipos da API ML (Order, Item, etc.), prefira importar de `@/lib/ml`
 * que é a fonte canônica (lib/ml/types.ts gerado pelo agente paralelo).
 */

// =============================================================================
// Enums de domínio
// =============================================================================

/** Plataformas de marketplace suportadas. Adicione novas aqui. */
export type Platform = 'mercadolivre' | 'shopee' | 'magalu' | 'amazon';

/** Status da conexão OAuth — alinhado com o schema do DB. */
export type ConnectionStatus = 'active' | 'expired' | 'error' | 'disconnected';

// =============================================================================
// Modelos de banco (mirror do schema)
// =============================================================================

/**
 * Representação crua da tabela `connections`.
 * Os tokens são SEMPRE strings criptografadas (base64 AES-256-GCM).
 * Para usar, descriptografe via `lib/crypto/tokens.ts:decrypt()`.
 *
 * IMPORTANTE: nomes das colunas batem com a migration `20260718000001_init.sql`
 * (account_label, account_metadata — não account_nickname).
 */
export interface ConnectionRow {
  id: string;
  user_id: string;
  platform: Platform;
  account_id: string;
  account_label: string | null;
  account_metadata: Record<string, unknown> | null;
  status: ConnectionStatus;
  /** Base64 AES-256-GCM. */
  access_token_encrypted: string;
  /** Base64 AES-256-GCM (nullable — alguns grants não retornam refresh). */
  refresh_token_encrypted: string | null;
  /** ISO 8601 UTC (nullable — preenchido após primeiro OAuth). */
  token_expires_at: string | null;
  scopes: string[];
  last_error: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * View de UI para uma conexão — formato camelCase e com tokens já
 * removidos (nunca envie tokens criptografados pro client!).
 */
export interface ConnectionView {
  id: string;
  platform: Platform;
  accountId: string;
  accountLabel: string | null;
  status: ConnectionStatus;
  tokenExpiresAt: string | null;
  scopes: string[];
  createdAt: string;
  /** Calculado na exibição: true se token vence em < 24h. */
  isExpiringSoon: boolean;
}

/** Adapter row → view (sem tokens). */
export function toConnectionView(row: ConnectionRow): ConnectionView {
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  const isExpiringSoon = expiresAt > 0 && expiresAt - Date.now() < 24 * 60 * 60 * 1000;
  return {
    id: row.id,
    platform: row.platform,
    accountId: row.account_id,
    accountLabel: row.account_label,
    status: row.status,
    tokenExpiresAt: row.token_expires_at,
    scopes: row.scopes,
    createdAt: row.created_at,
    isExpiringSoon,
  };
}

// =============================================================================
// Tipos de API / Route Handlers
// =============================================================================

/** Resposta JSON padronizada para route handlers. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** Erro padronizado para responses 4xx/5xx. */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// =============================================================================
// Tipos auxiliares
// =============================================================================

/** Item de menu da sidebar (estilo Magiic). */
export interface NavItem {
  label: string;
  href: string;
  icon: 'LayoutDashboard' | 'Package' | 'ShoppingCart' | 'Plug' | 'Settings';
  badge?: number;
}

/** Estatísticas exibidas no overview do dashboard. */
export interface DashboardStats {
  totalConnections: number;
  activeConnections: number;
  expiringConnections: number;
  totalOrdersLast30d: number;
  totalRevenueLast30d: number;
}