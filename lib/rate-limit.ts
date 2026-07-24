/**
 * Rate limit em memória (sem Redis). Suficiente pra dev local com 1 instância.
 *
 * Para prod no Coolify (single container por enquanto) também funciona — quando
 * escalar pra múltiplos containers, substituir por Redis (já tem REDIS_URL no
 * env.example).
 *
 * Janela: 60 segundos. Limite padrão: 5 requests por chave.
 *
 * Chave típica: hash(clientIp + route) ou só clientIp.
 *
 * Cleanup: TTL de 5 minutos pra evitar memory leak.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Limpa entradas expiradas a cada 5 min
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_TTL_MS = 5 * 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;
function ensureCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (now - v.resetAt > CLEANUP_TTL_MS) store.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
  // não bloqueia shutdown do Node
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** máximo de requests permitidos na janela */
  limit: number;
  /** tamanho da janela em ms */
  windowMs: number;
}

/**
 * Aplica sliding-window simples (não leaky bucket).
 * Retorna ok=false se excedeu; cabeçalho Retry-After cabe ao caller.
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (bucket.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }

  const updated: Bucket = { count: bucket.count + 1, resetAt: bucket.resetAt };
  store.set(key, updated);
  return {
    ok: true,
    remaining: opts.limit - updated.count,
    resetAt: updated.resetAt,
  };
}

/** Extrai IP do request, considerando proxies. */
export function getClientIp(request: Request): string {
  const xff: string | null = request.headers.get('x-forwarded-for');
  if (xff !== null && xff.length > 0) {
    const parts = xff.split(',');
    const first = parts[0];
    if (typeof first === 'string' && first.length > 0) return first.trim();
  }
  const real: string | null = request.headers.get('x-real-ip');
  if (real !== null && real.length > 0) return real.trim();
  return 'unknown';
}