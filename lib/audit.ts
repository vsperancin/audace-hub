/**
 * Audit log — registra ações sensíveis em public.audit_log.
 *
 * Schema (migration oficial):
 *   id           bigserial
 *   user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL
 *   connection_id uuid REFERENCES connections(id) ON DELETE SET NULL
 *   action       text (ex: 'auth.signup', 'auth.login', 'ml.connect')
 *   resource     text (ex: 'user:<id>', 'connection:<id>')
 *   ip_address   inet
 *   user_agent   text
 *   metadata     jsonb
 *   created_at   timestamptz DEFAULT now()
 *
 * IMPORTANTE: user_id referencia auth.users (Supabase Auth). Em dev local
 * com shim, o role audace tem BYPASSRLS, então o INSERT passa direto.
 */
import { execute } from './db';

export type AuditAction =
  | 'auth.signup.success'
  | 'auth.signup.failed'
  | 'auth.signup.no_invite'
  | 'auth.signup.email_taken'
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.rate_limited'
  | 'ml.oauth.start'
  | 'ml.oauth.callback.success'
  | 'ml.oauth.callback.failed';

export interface AuditEvent {
  action: AuditAction;
  /** auth.users.id (Supabase Auth). NULL se a ação falhou antes de criar user. */
  authUserId?: string | null;
  resource?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget. Nunca lança — se o audit falhar, a operação principal
 * não pode ser bloqueada (mas logamos no stderr pra investigar).
 */
export async function audit(evt: AuditEvent): Promise<void> {
  try {
    await execute(
      `INSERT INTO public.audit_log
         (user_id, action, resource, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        evt.authUserId ?? null,
        evt.action,
        evt.resource ?? null,
        evt.ipAddress ?? null,
        evt.userAgent ?? null,
        evt.metadata ? JSON.stringify(evt.metadata) : null,
      ],
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] failed to log event', { action: evt.action, err });
  }
}