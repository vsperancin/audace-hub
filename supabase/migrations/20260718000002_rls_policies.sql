-- ============================================================================
-- Audace Hub — Row Level Security Policies
-- ----------------------------------------------------------------------------
-- Date:     2026-07-18
-- Version:  1.0.0
-- Purpose:  Lock down every public.* table so that:
--             * anon                 -> no access
--             * authenticated        -> only their own rows
--             * service_role         -> full access (BYPASSRLS)
--
-- Design notes:
--   * We DROP and recreate policies idempotently so re-running this
--     migration is safe. (Supabase migrations are versioned, but this
--     pattern makes local dev iteration painless.)
--   * Multi-tenant isolation is enforced by sub-queries against
--     public.connections.user_id for child tables (orders, items,
--     sync_jobs, ads_metrics).
--   * audit_log is INSERT-only for authenticated users (no SELECT of other
--     users' rows; the user can see their own entries).
--   * service_role bypasses RLS via the BYPASSRLS attribute granted
--     automatically by Supabase; we don't need explicit policies for it.
-- ============================================================================

-- ============================================================================
-- 1. ENABLE ROW LEVEL SECURITY ON EVERY PUBLIC TABLE
-- ============================================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_metrics  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log    ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner so a misconfigured role can't bypass.
ALTER TABLE public.profiles     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.connections  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_jobs    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.items        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ads_metrics  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log    FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CLEANUP — drop any prior versions of the policies we are about to create
-- ============================================================================
-- This makes the migration idempotent. Supabase tracks migrations, but local
-- `supabase db reset` re-applies every migration in order, so each one must
-- be re-runnable.

DROP POLICY IF EXISTS "Users can view own profile"              ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile"            ON public.profiles;

DROP POLICY IF EXISTS "Users manage own connections"            ON public.connections;

DROP POLICY IF EXISTS "Users view own sync_jobs"                ON public.sync_jobs;
DROP POLICY IF EXISTS "Service inserts sync_jobs"               ON public.sync_jobs;

DROP POLICY IF EXISTS "Users view own orders"                   ON public.orders;
DROP POLICY IF EXISTS "Service writes orders"                   ON public.orders;

DROP POLICY IF EXISTS "Users view own items"                    ON public.items;
DROP POLICY IF EXISTS "Service writes items"                    ON public.items;

DROP POLICY IF EXISTS "Users view own ads_metrics"              ON public.ads_metrics;
DROP POLICY IF EXISTS "Service writes ads_metrics"              ON public.ads_metrics;

DROP POLICY IF EXISTS "Users manage own notifications"          ON public.notifications;

DROP POLICY IF EXISTS "Users view own audit_log"                ON public.audit_log;
DROP POLICY IF EXISTS "Users insert own audit_log"              ON public.audit_log;

-- ============================================================================
-- 3. POLICIES — profiles
-- ============================================================================
-- The handle_new_user() trigger inserts the profile, so the INSERT policy
-- below is a safety net for direct inserts (rare, but possible from the
-- dashboard SQL editor with a service_role key, which bypasses RLS anyway).

CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (auth.uid() = id);

-- ============================================================================
-- 4. POLICIES — connections
-- ============================================================================
-- One FOR ALL policy keeps the rules in one place and avoids drift.

CREATE POLICY "Users manage own connections"
    ON public.connections
    FOR ALL
    TO authenticated
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 5. POLICIES — sync_jobs
-- ============================================================================
-- Users can only SELECT their own sync_jobs (read-only via API).
-- The backend writes via service_role, which bypasses RLS.

CREATE POLICY "Users view own sync_jobs"
    ON public.sync_jobs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.connections c
            WHERE c.id = sync_jobs.connection_id
              AND c.user_id = auth.uid()
        )
    );

-- An authenticated user is never expected to insert/update sync_jobs
-- directly. service_role handles all writes. We intentionally omit an
-- INSERT/UPDATE/DELETE policy for the authenticated role, which denies
-- those operations (RLS default = deny without a matching policy).

-- ============================================================================
-- 6. POLICIES — orders
-- ============================================================================

CREATE POLICY "Users view own orders"
    ON public.orders
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.connections c
            WHERE c.id = orders.connection_id
              AND c.user_id = auth.uid()
        )
    );

-- Writes are service_role only (the sync worker is the only writer).

-- ============================================================================
-- 7. POLICIES — items
-- ============================================================================

CREATE POLICY "Users view own items"
    ON public.items
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.connections c
            WHERE c.id = items.connection_id
              AND c.user_id = auth.uid()
        )
    );

-- Writes are service_role only.

-- ============================================================================
-- 8. POLICIES — ads_metrics
-- ============================================================================

CREATE POLICY "Users view own ads_metrics"
    ON public.ads_metrics
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.connections c
            WHERE c.id = ads_metrics.connection_id
              AND c.user_id = auth.uid()
        )
    );

-- Writes are service_role only.

-- ============================================================================
-- 9. POLICIES — notifications
-- ============================================================================
-- Users have full CRUD on their own notifications (mark-as-read, dismiss, etc).

CREATE POLICY "Users manage own notifications"
    ON public.notifications
    FOR ALL
    TO authenticated
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 10. POLICIES — audit_log
-- ============================================================================
-- audit_log is append-only from the app's perspective. Users can see their
-- own entries (useful for the "activity" page) and insert entries about
-- their own user_id, but never UPDATE or DELETE.

CREATE POLICY "Users view own audit_log"
    ON public.audit_log
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users insert own audit_log"
    ON public.audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 11. ANONYMOUS ROLE — explicit deny on everything
-- ============================================================================
-- Supabase's anon role is used for the magic-link landing pages and
-- pre-auth flows. We don't want anonymous users to read any of the above.
-- No policies are granted TO anon, so all operations are denied by default.

-- ============================================================================
-- 12. COMMENTS — document the policy intent
-- ============================================================================
COMMENT ON POLICY "Users can view own profile"      ON public.profiles    IS 'A user can only SELECT their own profile row.';
COMMENT ON POLICY "Users manage own connections"    ON public.connections IS 'A user has full CRUD on their own connections only.';
COMMENT ON POLICY "Users view own sync_jobs"        ON public.sync_jobs   IS 'A user can SELECT sync jobs belonging to their own connections.';
COMMENT ON POLICY "Users view own orders"           ON public.orders      IS 'A user can SELECT orders belonging to their own connections.';
COMMENT ON POLICY "Users view own items"            ON public.items       IS 'A user can SELECT items belonging to their own connections.';
COMMENT ON POLICY "Users view own ads_metrics"      ON public.ads_metrics IS 'A user can SELECT ads metrics belonging to their own connections.';
COMMENT ON POLICY "Users manage own notifications"  ON public.notifications IS 'A user has full CRUD on their own notifications.';
COMMENT ON POLICY "Users view own audit_log"        ON public.audit_log   IS 'A user can SELECT only their own audit log entries.';
COMMENT ON POLICY "Users insert own audit_log"      ON public.audit_log   IS 'A user can INSERT audit log entries scoped to their own user_id.';

-- ============================================================================
-- 13. service_role NOTE
-- ============================================================================
-- Supabase's service_role is a Postgres role with the BYPASSRLS attribute.
-- It does NOT need explicit policies to read/write every row. The Next.js
-- backend will connect as service_role for all privileged operations:
--   * OAuth callback (token storage)
--   * Background sync workers (order/item/ads_metrics writes)
--   * Admin dashboards / moderation
-- The frontend (Next.js client components) connects as authenticated and
-- is restricted by the policies above.
-- ============================================================================

-- ============================================================================
-- END OF RLS POLICIES MIGRATION
-- ============================================================================