-- ============================================================================
-- Audace Hub — Auth Hardening: invite-only signup (OFICIAL)
-- ----------------------------------------------------------------------------
-- Aplicada em prod. Complementa 20260718000001_init.sql + ...002_rls_policies.sql
--
-- Adiciona:
--   1. Tabela public.invites — tokens de convite pra signup fechado
--   2. Coluna public.users.is_admin — flag admin
--   3. Service_role bypass em invites (RNF de service_role ML/backend)
--
-- ANTES desta migration, signup era público (qualquer um criava conta).
-- DEPOIS, signup exige invite_token válido.
-- ============================================================================

-- ============================================================================
-- 1. public.invites
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT NOT NULL UNIQUE,
  email       TEXT,
  invited_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  used_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invites_token    ON public.invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_expires  ON public.invites(expires_at);

-- ============================================================================
-- 2. public.users.is_admin
-- ============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 3. RLS — habilita + bypass pra service_role (que no Supabase tem BYPASSRLS
--    automático, mas emulamos explicitamente em dev/test)
-- ============================================================================
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_bypass_invites" ON public.invites;
CREATE POLICY "service_role_bypass_invites"
  ON public.invites FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- Grants (padrão Supabase — roles anon/authenticated/service_role)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invites TO service_role;

COMMENT ON TABLE  public.invites        IS 'Tokens de convite pra signup fechado (invite-only).';
COMMENT ON COLUMN public.users.is_admin IS 'true = pode criar invites e gerenciar audit log.';