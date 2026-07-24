-- ============================================================================
-- Audace Hub — LOCAL ONLY: tabelas de auth faltantes
-- ----------------------------------------------------------------------------
-- Aplicada apenas no dev local. NÃO está no repositório prod (Coolify usa
-- Supabase Auth para auth.users + RLS via auth.uid()).
--
-- Cria public.users (com password_hash bcrypt) e public.sessions
-- que o código de auth espera (lib/db.ts, app/api/auth/*).
--
-- Schema/code drift: as migrations oficiais criam public.profiles
-- (mirror de auth.users, sem password_hash), mas o código de auth
-- local (rota /api/auth/{login,signup}) escreve em public.users.
--
-- TODO: quando mover o app pra Supabase Auth de verdade, substituir
-- lib/db.ts createSession/getSessionUser/deleteSession por
-- supabase.auth.* e remover esta migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Sessions — token opaco + SHA-256
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  ip_address  TEXT,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user     ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON public.sessions(expires_at);

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- service_role e postgres (owner) bypass via policy explícita
DROP POLICY IF EXISTS "service_role_bypass_users"    ON public.users;
DROP POLICY IF EXISTS "service_role_bypass_sessions" ON public.sessions;
CREATE POLICY "service_role_bypass_users"
  ON public.users FOR ALL TO service_role, postgres
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_sessions"
  ON public.sessions FOR ALL TO service_role, postgres
  USING (true) WITH CHECK (true);

-- Usuário autenticado pode ver/atualizar o próprio user
DROP POLICY IF EXISTS "users_view_own_row"   ON public.users;
DROP POLICY IF EXISTS "users_update_own_row" ON public.users;
CREATE POLICY "users_view_own_row"
  ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);
CREATE POLICY "users_update_own_row"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Usuário pode ver/deletar as próprias sessions
DROP POLICY IF EXISTS "sessions_own" ON public.sessions;
CREATE POLICY "sessions_own"
  ON public.sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE  public.users    IS 'LOCAL-ONLY: usuários autenticados (password_hash bcrypt). Substituir por Supabase Auth em prod.';
COMMENT ON TABLE  public.sessions IS 'LOCAL-ONLY: sessões server-side (token_hash SHA-256, expira em 30 dias).';