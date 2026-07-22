import { Pool } from 'pg';

/**
 * Cliente PostgreSQL para o Audace Hub.
 *
 * Usa DATABASE_KEY (env var do Coolify) no formato:
 *   postgres://user:password@host:port/dbname
 *
 * Connection pooling gerenciado automaticamente.
 */

declare global {
  // eslint-disable-next-line no-var
  var __audace_pg_pool: Pool | undefined;
}

function parseDatabaseUrl(url: string): Pool {
  // Parse mínimo pra pg Pool — ele aceita URL direto.
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export function getPool(): Pool {
  const url = process.env.DATABASE_KEY;
  if (!url) {
    throw new Error(
      'DATABASE_KEY não configurada. Configure no Coolify (Environment Variables) com postgres://user:password@host:port/db',
    );
  }
  if (!global.__audace_pg_pool) {
    global.__audace_pg_pool = parseDatabaseUrl(url);
  }
  return global.__audace_pg_pool;
}

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params: any[] = []): Promise<number> {
  const pool = getPool();
  const result = await pool.query(sql, params);
  return result.rowCount || 0;
}

/**
 * Hash de senha usando bcrypt (cost 10).
 * Implementação simples — usa crypto nativo (sem dependência extra).
 */
export async function hashPassword(password: string): Promise<string> {
  const bcrypt = await import('bcrypt');
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = await import('bcrypt');
  return bcrypt.compare(password, hash);
}

/**
 * Sessions helpers — token opaco + hash SHA-256.
 */
export async function createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

  await execute(
    `INSERT INTO public.sessions (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, ipAddress || null, userAgent || null, expiresAt.toISOString()],
  );

  return token;
}

export async function getSessionUser(token: string) {
  const crypto = await import('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  return queryOne<{ id: string; email: string; full_name: string | null }>(
    `SELECT u.id, u.email, u.full_name
       FROM public.sessions s
       JOIN public.users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > NOW()`,
    [tokenHash],
  );
}

export async function deleteSession(token: string): Promise<void> {
  const crypto = await import('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await execute(`DELETE FROM public.sessions WHERE token_hash = $1`, [tokenHash]);
}