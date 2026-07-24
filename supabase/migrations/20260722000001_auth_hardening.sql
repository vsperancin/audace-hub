-- ============================================================================
-- Audace Hub — LOCAL ONLY: harden auth (invite-only + audit + RLS grants)
-- ----------------------------------------------------------------------------
-- Complementa 20260722000000_local_auth_tables.sql.
--
-- 1. Cria tabela public.invites (token + email + expira + usado)
-- 2. Adiciona public.users.is_admin boolean (default false)
-- 3. Garante que audit_log aceita INSERT via service_role bypass
-- 4. Reforça RLS em public.users (autenticado só vê a si)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  email       TEXT,                          -- pré-preenchido se quiser
  invited_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_token    ON public.invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_expires  ON public.invites(expires_at);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass_invites" ON public.invites;
CREATE POLICY "service_role_bypass_invites"
  ON public.invites FOR ALL TO service_role, postgres
  USING (true) WITH CHECK (true);

-- Admin pode listar/criar invites (mas isso é checado no código,
-- não via policy — porque auth.uid() vem de auth.users e o admin
-- não está marcado em auth.users). Por isso service_role é usado no INSERT.

-- ============================================================================
-- public.users.is_admin
-- ============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- audit_log: garantir service_role bypass (auth FK é só pra log de tentativas)
-- ============================================================================
DROP POLICY IF EXISTS "service_role_bypass_audit_log" ON public.audit_log;
CREATE POLICY "service_role_bypass_audit_log"
  ON public.audit_log FOR ALL TO service_role, postgres
  USING (true) WITH CHECK (true);

-- IMPORTANTE: audit_log.user_id referencia auth.users(id) (FK hardcoded na
-- migration oficial). O trigger/handler no Next deve passar o auth.users.id,
-- não public.users.id. Ver lib/audit.ts.

COMMENT ON TABLE  public.invites       IS 'LOCAL-ONLY: tokens de convite pra signup fechado.';
COMMENT ON COLUMN public.users.is_admin IS 'true = pode criar invites e ver audit log de todos.';