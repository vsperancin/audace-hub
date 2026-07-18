-- ============================================================================
-- Audace Hub — Initial Schema Migration
-- ----------------------------------------------------------------------------
-- Date:     2026-07-18
-- Version:  1.0.0
-- Purpose:  Define the core multi-tenant schema for Audace Hub.
--
-- This migration creates:
--   1. Required PostgreSQL extensions
--   2. Enum types for platforms, sync status, and order status
--   3. The public.profiles table (1:1 with auth.users)
--   4. The public.connections table (multi-tenant marketplace accounts)
--   5. The public.sync_jobs table (synchronization history)
--   6. The public.orders table (denormalized order data)
--   7. The public.items table (catalog snapshot)
--   8. The public.ads_metrics table (advertising metrics)
--   9. The public.notifications table (in-app notifications)
--  10. The public.audit_log table (action traceability)
--  11. Triggers (set_updated_at) and helper functions
--
-- NOTES:
--   - All encrypted-token columns store ciphertext as TEXT. The encryption
--     key lives in the application environment (AES-256-GCM), NOT in the DB.
--   - All tables get a public. prefix so they don't collide with
--     Supabase's own auth.* / storage.* / realtime.* schemas.
--   - RLS is enabled in the next migration (20260718000002_rls_policies.sql).
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid() + crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- uuid_generate_v4()

-- ============================================================================
-- 2. ENUM TYPES
-- ============================================================================

-- Supported marketplace / ERP platforms. Add new platforms here when wiring
-- new integrations; this is intentionally a closed enum so type-checking
-- catches typos at the DB layer.
CREATE TYPE platform_type AS ENUM (
    'mercadolivre',
    'shopee',
    'amazon',
    'tiktokshop',
    'magalu',
    'bling',
    'tiny',
    'omie'
);

-- Status of a single synchronization job. Used by background workers.
CREATE TYPE sync_status AS ENUM (
    'pending',
    'running',
    'success',
    'error'
);

-- Lifecycle of an order. The values match the union of statuses reported
-- by the major marketplaces (Mercado Livre, Shopee, Amazon BR, etc).
CREATE TYPE order_status AS ENUM (
    'pending',
    'paid',
    'shipped',
    'delivered',
    'cancelled',
    'refunded',
    'returned'
);

-- ============================================================================
-- 3. PROFILES — public mirror of auth.users
-- ============================================================================
-- A profile is created automatically (via the trigger below) whenever a new
-- row appears in auth.users. Users can also self-update full_name/avatar_url.

CREATE TABLE public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT,
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.profiles              IS 'Public profile for each authenticated user. Mirrors auth.users 1:1.';
COMMENT ON COLUMN public.profiles.id           IS 'FK to auth.users.id. Cascades on delete.';
COMMENT ON COLUMN public.profiles.email        IS 'Denormalized email for fast read without joining auth.users.';
COMMENT ON COLUMN public.profiles.full_name    IS 'User-provided display name. Nullable.';
COMMENT ON COLUMN public.profiles.avatar_url   IS 'URL to avatar image (usually Supabase Storage). Nullable.';

-- Auto-create a profile row whenever a new auth.users row is inserted.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', NULL)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 4. CONNECTIONS — each marketplace account linked to a user (multi-tenant)
-- ============================================================================
-- One row per (user, platform, account_id) tuple. A single user can connect
-- multiple Mercado Livre accounts, Shopee shops, Amazon Seller accounts, etc.
-- Tokens are stored encrypted; the application decrypts on demand.

CREATE TABLE public.connections (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    platform                 platform_type NOT NULL,
    account_id               TEXT NOT NULL,         -- platform-native id (e.g. ML user_id)
    account_label            TEXT,                  -- human label like "VS2B - Loja principal"
    account_metadata         JSONB,                 -- nickname, email, country_id, etc.

    -- Encrypted tokens (AES-256-GCM, key from app env). NEVER store plaintext.
    access_token_encrypted   TEXT NOT NULL,
    refresh_token_encrypted  TEXT,
    token_expires_at         TIMESTAMPTZ,

    scopes                   TEXT[],                -- e.g. {'read_orders','write_items'}

    status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','expired','error','disconnected')),
    last_error               TEXT,

    last_sync_at             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (user_id, platform, account_id)
);

COMMENT ON TABLE  public.connections                       IS 'One row per connected marketplace account per user.';
COMMENT ON COLUMN public.connections.account_id            IS 'Platform-native account id (ML user_id, Shopee shop_id, etc).';
COMMENT ON COLUMN public.connections.account_label         IS 'Human-readable label set by the user.';
COMMENT ON COLUMN public.connections.account_metadata      IS 'Platform-specific metadata snapshot (nickname, email, country, etc).';
COMMENT ON COLUMN public.connections.access_token_encrypted IS 'AES-256-GCM ciphertext of the OAuth access token.';
COMMENT ON COLUMN public.connections.refresh_token_encrypted IS 'AES-256-GCM ciphertext of the OAuth refresh token (nullable).';
COMMENT ON COLUMN public.connections.token_expires_at      IS 'When the access token expires (UTC).';
COMMENT ON COLUMN public.connections.scopes                IS 'OAuth scopes granted by the user.';
COMMENT ON COLUMN public.connections.last_error            IS 'Last error message from the platform (for diagnostics).';
COMMENT ON COLUMN public.connections.last_sync_at          IS 'When this connection was last synced (any resource).';

CREATE INDEX idx_connections_user_id   ON public.connections (user_id);
CREATE INDEX idx_connections_platform  ON public.connections (platform);
CREATE INDEX idx_connections_active    ON public.connections (status) WHERE status = 'active';
CREATE INDEX idx_connections_expires   ON public.connections (token_expires_at)
    WHERE status = 'active' AND token_expires_at IS NOT NULL;

-- ============================================================================
-- 5. SYNC_JOBS — history of background synchronizations
-- ============================================================================
-- One row per attempted sync (orders, items, shipments, ads_metrics, ...).
-- Workers write a row when starting and update status on completion.

CREATE TABLE public.sync_jobs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id     UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    resource          TEXT NOT NULL,           -- 'orders' | 'items' | 'shipments' | 'ads_metrics' | ...
    cursor_state      JSONB,                   -- pagination cursor / last seen id
    status            sync_status NOT NULL DEFAULT 'pending',
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    error_message     TEXT,
    records_processed INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.sync_jobs                  IS 'One row per sync attempt. Used for debugging and rate limiting.';
COMMENT ON COLUMN public.sync_jobs.resource         IS 'Resource being synced: orders | items | shipments | ads_metrics | ...';
COMMENT ON COLUMN public.sync_jobs.cursor_state     IS 'Pagination cursor / bookmark for incremental sync.';
COMMENT ON COLUMN public.sync_jobs.records_processed IS 'Count of records upserted by this job.';

CREATE INDEX idx_sync_jobs_connection ON public.sync_jobs (connection_id);
CREATE INDEX idx_sync_jobs_running    ON public.sync_jobs (status) WHERE status IN ('pending','running');
CREATE INDEX idx_sync_jobs_created    ON public.sync_jobs (created_at DESC);

-- ============================================================================
-- 6. ORDERS — denormalized order data for fast dashboard queries
-- ============================================================================
-- The raw column stores the full platform response for audit/replay. The
-- structured columns (buyer/items/payments/shipping) are extracted for
-- filtering and aggregations without parsing JSONB at query time.

CREATE TABLE public.orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    platform            platform_type NOT NULL,
    platform_order_id   TEXT NOT NULL,
    status              order_status NOT NULL,
    status_detail       TEXT,                       -- platform-specific sub-status

    total_amount        NUMERIC(12,2),
    currency            TEXT NOT NULL DEFAULT 'BRL',

    buyer               JSONB,                      -- {id, nickname, email, phone, ...}
    items               JSONB,                      -- [{id, title, quantity, unit_price, ...}]
    payments            JSONB,
    shipping            JSONB,

    raw                 JSONB,                      -- full API response (audit)

    platform_created_at TIMESTAMPTZ,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (connection_id, platform_order_id)
);

COMMENT ON TABLE  public.orders                    IS 'Denormalized order data. raw column keeps the full API response.';
COMMENT ON COLUMN public.orders.platform_order_id  IS 'Native id from the platform (e.g. ML order id).';
COMMENT ON COLUMN public.orders.status_detail      IS 'Platform-specific sub-status (free text).';
COMMENT ON COLUMN public.orders.raw                IS 'Full original API payload, kept for audit and replay.';
COMMENT ON COLUMN public.orders.platform_created_at IS 'Order creation time on the platform (not when we synced it).';

CREATE INDEX idx_orders_connection        ON public.orders (connection_id);
CREATE INDEX idx_orders_platform_status   ON public.orders (platform, status);
CREATE INDEX idx_orders_synced            ON public.orders (synced_at DESC);
CREATE INDEX idx_orders_platform_created  ON public.orders (platform_created_at DESC);
CREATE INDEX idx_orders_buyer_gin         ON public.orders USING GIN (buyer);

-- ============================================================================
-- 7. ITEMS — catalog snapshot
-- ============================================================================
-- Synced from each platform's catalog API. raw keeps the full payload.

CREATE TABLE public.items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id       UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    platform            platform_type NOT NULL,
    platform_item_id    TEXT NOT NULL,

    title               TEXT NOT NULL,
    sku                 TEXT,
    price               NUMERIC(12,2),
    currency            TEXT NOT NULL DEFAULT 'BRL',
    available_quantity  INT,
    sold_quantity       INT,

    status              TEXT,                      -- 'active' | 'paused' | 'closed'
    listing_type        TEXT,                      -- 'classic' | 'premium' | ...
    category_id         TEXT,

    permalink           TEXT,
    thumbnail           TEXT,

    raw                 JSONB,

    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (connection_id, platform_item_id)
);

COMMENT ON TABLE  public.items                 IS 'Catalog snapshot. raw keeps the full platform payload.';
COMMENT ON COLUMN public.items.platform_item_id IS 'Native item id (e.g. MLB...).';
COMMENT ON COLUMN public.items.status          IS 'Platform listing status: active | paused | closed.';
COMMENT ON COLUMN public.items.sku             IS 'Seller SKU. Indexed only when not null.';

CREATE INDEX idx_items_connection ON public.items (connection_id);
CREATE INDEX idx_items_status     ON public.items (status);
CREATE INDEX idx_items_sku        ON public.items (sku) WHERE sku IS NOT NULL;

-- ============================================================================
-- 8. ADS_METRICS — paid-traffic metrics per item per period
-- ============================================================================
-- Designed to mirror the data shape exposed by Mercado Livre's Ads API.
-- One row per (connection, item_id, date_from, date_to) tuple. date_from/
-- date_to allow daily, weekly, and monthly aggregations.

CREATE TABLE public.ads_metrics (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id            UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    platform                 platform_type NOT NULL DEFAULT 'mercadolivre',

    item_id                  TEXT NOT NULL,         -- e.g. MLB123...

    date_from                DATE NOT NULL,
    date_to                  DATE NOT NULL,

    clicks                   INT,
    prints                   INT,
    cost                     NUMERIC(12,2),

    direct_amount            NUMERIC(12,2),
    indirect_amount          NUMERIC(12,2),
    total_amount             NUMERIC(12,2),
    organic_amount           NUMERIC(12,2),

    units_quantity           INT,
    direct_units_quantity    INT,
    indirect_units_quantity  INT,

    ctr                      NUMERIC(6,4),         -- click-through rate
    cpc                      NUMERIC(10,4),        -- cost per click
    cvr                      NUMERIC(6,4),         -- conversion rate
    roas                     NUMERIC(10,4),        -- return on ad spend
    acos                     NUMERIC(6,4),         -- advertising cost of sales
    sov                      NUMERIC(6,4),         -- share of voice

    impression_share         NUMERIC(6,4),
    top_impression_share     NUMERIC(6,4),

    synced_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (connection_id, item_id, date_from, date_to),
    CHECK  (date_to >= date_from)
);

COMMENT ON TABLE  public.ads_metrics              IS 'Paid-traffic metrics per item per period.';
COMMENT ON COLUMN public.ads_metrics.item_id      IS 'Native item id from the platform.';
COMMENT ON COLUMN public.ads_metrics.date_from    IS 'Period start (inclusive).';
COMMENT ON COLUMN public.ads_metrics.date_to      IS 'Period end (inclusive). date_to >= date_from enforced.';

CREATE INDEX idx_ads_metrics_connection ON public.ads_metrics (connection_id);
CREATE INDEX idx_ads_metrics_item       ON public.ads_metrics (item_id);
CREATE INDEX idx_ads_metrics_period     ON public.ads_metrics (date_from, date_to DESC);

-- ============================================================================
-- 9. NOTIFICATIONS — in-app notifications
-- ============================================================================
-- Used for alerts like "sync_error", "token_expired", "low_roas", etc.
-- The user marks a notification as read by setting read_at.

CREATE TABLE public.notifications (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    type         TEXT NOT NULL,                    -- 'sync_error' | 'token_expired' | 'low_roas' | ...
    severity     TEXT NOT NULL CHECK (severity IN ('info','warning','error','success')),

    title        TEXT NOT NULL,
    body         TEXT,
    action_url   TEXT,

    metadata     JSONB,

    read_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.notifications            IS 'In-app notifications. read_at IS NULL means unread.';
COMMENT ON COLUMN public.notifications.type       IS 'Discriminator: sync_error | token_expired | low_roas | ...';
COMMENT ON COLUMN public.notifications.severity   IS 'Severity: info | warning | error | success.';
COMMENT ON COLUMN public.notifications.action_url IS 'Optional deep link the user is taken to when clicking.';

CREATE INDEX idx_notifications_user_unread
    ON public.notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

-- ============================================================================
-- 10. AUDIT_LOG — traceability for every privileged action
-- ============================================================================
-- Append-only. Backend writes here on every connection.create, oauth.refresh,
-- sync.start, settings.update, etc. id is BIGSERIAL so it survives long-term
-- high-volume inserts better than UUID for ordered scans.

CREATE TABLE public.audit_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL,

    action        TEXT NOT NULL,                   -- 'connection.created' | 'oauth.refreshed' | ...
    resource      TEXT,                            -- resource kind affected

    ip_address    INET,
    user_agent    TEXT,

    metadata      JSONB,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.audit_log          IS 'Append-only audit trail. Never UPDATE/DELETE from app code.';
COMMENT ON COLUMN public.audit_log.action   IS 'Dot-notation event name: connection.created, oauth.refreshed, sync.started, ...';
COMMENT ON COLUMN public.audit_log.resource IS 'Affected resource kind: connection | order | item | settings | ...';

CREATE INDEX idx_audit_log_user   ON public.audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log (action, created_at DESC);

-- ============================================================================
-- 11. TRIGGERS — updated_at maintenance
-- ============================================================================
-- A single trigger function is shared by every table that needs auto-touched
-- updated_at. Attach it with a per-table trigger.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger function: sets NEW.updated_at = NOW() on UPDATE.';

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_connections_updated_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 12. HELPER FUNCTIONS
-- ============================================================================

-- Validate that an encrypted-token column actually looks like our envelope.
-- Format: v1.<base64(iv)>.<base64(ciphertext)>.<base64(auth_tag)>
-- Real encryption/decryption happens in the application layer using a key
-- from env; the DB only validates shape so we can fail fast on corruption.
CREATE OR REPLACE FUNCTION public.is_valid_encrypted_token(token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN token IS NOT NULL
        AND token ~ '^v1\.[A-Za-z0-9+/=_-]{16,}\.[A-Za-z0-9+/=_-]+\.[A-Za-z0-9+/=_-]{20,}$';
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.is_valid_encrypted_token(TEXT)
    IS 'Returns true if token matches the v1.<iv>.<ct>.<tag> envelope produced by the app encryption layer.';

-- Generic "current user has a connection with id X" check, useful for views
-- and additional policies. Returns false if auth.uid() is null (anon user).
CREATE OR REPLACE FUNCTION public.user_owns_connection(p_connection_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.connections c
        WHERE c.id = p_connection_id
          AND c.user_id = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.user_owns_connection(UUID)
    IS 'RLS helper: returns true when the current auth.uid() owns the given connection.';

-- ============================================================================
-- 13. GRANT baseline privileges to Supabase roles
-- ============================================================================
-- Supabase connects with three roles: anon, authenticated, service_role.
-- service_role bypasses RLS entirely (it's a SUPERUSER-like role for the
-- backend). anon and authenticated are subject to RLS policies defined in
-- the next migration.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- All app tables are reachable by the authenticated role. RLS will restrict
-- which rows they can see. service_role gets full CRUD for the backend.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables created by `supabase db diff` will inherit these grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT                  ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT                  ON SEQUENCES TO service_role;

-- ============================================================================
-- END OF INITIAL SCHEMA MIGRATION
-- ============================================================================