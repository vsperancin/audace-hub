-- =============================================================================
-- Audace Hub — Tabela oauth_states (CSRF tokens do fluxo OAuth)
-- =============================================================================
-- Complementa 20260718000001_init.sql e 20260718000002_rls_policies.sql
-- com a tabela de state usada para validar o callback OAuth.
--
-- Persistimos o state EM TEXTO PURO (não hash) porque:
--   1. O state tem TTL curto (10 min) e é single-use.
--   2. Validação é constant-time via `validateState()` (lib/ml/oauth).
--   3. Hash complica o debug sem benefício real aqui (tabela é pequena).
-- =============================================================================

create table if not exists public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'mercadolivre',
  redirect_after text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists idx_oauth_states_expires on public.oauth_states(expires_at);
create index if not exists idx_oauth_states_user on public.oauth_states(user_id);

alter table public.oauth_states enable row level security;
alter table public.oauth_states force row level security;

-- Cada user só vê/cria/atualiza/deleta seus próprios states.
drop policy if exists "users_manage_own_oauth_states" on public.oauth_states;
create policy "users_manage_own_oauth_states"
  on public.oauth_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Limpeza periódica (recomendar cron externo ou pg_cron):
--   delete from public.oauth_states where expires_at < now() - interval '1 hour';