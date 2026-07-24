/**
 * Invite tokens — signup fechado.
 *
 * Fluxo:
 *   1. Admin cria invite via POST /api/admin/invites (não implementado ainda)
 *      OU inserção direta no DB (dev).
 *   2. Admin manda link pro novo user: /signup?invite=<token>
 *   3. No signup, valida token + email (se pré-preenchido) + expiração.
 *   4. Cria user, marca invite.used_at e used_by.
 */
import { randomBytes } from 'crypto';
import { queryOne, execute } from './db';

export interface Invite {
  id: string;
  token: string;
  email: string | null;
  invited_by: string | null;
  used_by: string | null;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

export async function createInvite(opts: {
  email?: string;
  invitedBy?: string;
  ttlDays?: number;
}): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + (opts.ttlDays ?? 7) * 24 * 60 * 60 * 1000);
  await execute(
    `INSERT INTO public.invites (token, email, invited_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, opts.email?.toLowerCase() ?? null, opts.invitedBy ?? null, expiresAt.toISOString()],
  );
  return token;
}

/** Valida token. Retorna invite válido ou null. */
export async function validateInvite(
  token: string,
  email?: string,
): Promise<Invite | null> {
  const invite = await queryOne<Invite>(
    `SELECT id, token, email, invited_by, used_by, expires_at, created_at, used_at
       FROM public.invites
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > NOW()`,
    [token],
  );
  if (!invite) return null;
  // Se invite tem email fixo, precisa bater
  if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return null;
  }
  return invite;
}

export async function consumeInvite(token: string, userId: string): Promise<void> {
  await execute(
    `UPDATE public.invites
        SET used_at = NOW(),
            used_by = $2
      WHERE token = $1
        AND used_at IS NULL`,
    [token, userId],
  );
}