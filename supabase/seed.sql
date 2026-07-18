-- ============================================================================
-- Audace Hub — Seed Data (local development only)
-- ----------------------------------------------------------------------------
-- Date:     2026-07-18
-- Version:  1.0.0
-- Purpose:  Insert a demo user + a couple of fake Mercado Livre connections
--           so you can run the app locally and have something to look at.
--
-- WARNING: This file inserts a real auth.users row with a known password.
-- NEVER run this against production. NEVER commit production passwords.
--
-- Demo credentials:
--   email:    demo@audacehub.com
--   password: demo123456
--
-- The bcrypt hash below was generated with:
--   SELECT crypt('demo123456', gen_salt('bf', 10));
-- and pinned here so seed.sql doesn't depend on pgcrypto being re-run.
-- The crypt() call in the INSERT will regenerate it fresh on each apply
-- via the gen_salt('bf') fallback, but we keep the literal hash for clarity.
-- ============================================================================

-- ============================================================================
-- 1. AUTH USER (Supabase Auth)
-- ============================================================================
-- A fixed UUID makes it easy to reference this user from tests, fixtures,
-- and the Next.js dev login flow. email_confirmed_at is set so the user is
-- "verified" and can sign in immediately.

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'demo@audacehub.com',
    crypt('demo123456', gen_salt('bf', 10)),
    NOW(),
    NULL,
    NULL,
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"User Demo","avatar_url":null}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
)
ON CONFLICT (id) DO NOTHING;

-- Supabase also requires a row in auth.identities (one per provider).
INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    provider_id
)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    jsonb_build_object(
        'sub',   '00000000-0000-0000-0000-000000000001',
        'email', 'demo@audacehub.com',
        'email_verified', true
    ),
    'email',
    NOW(),
    NOW(),
    NOW(),
    'demo@audacehub.com'
)
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ============================================================================
-- 2. PUBLIC PROFILE
-- ============================================================================
-- The handle_new_user() trigger in 20260718000001_init.sql already creates
-- this row, but ON CONFLICT DO NOTHING keeps the seed re-runnable.

INSERT INTO public.profiles (id, email, full_name, avatar_url)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'demo@audacehub.com',
    'User Demo',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. CONNECTIONS (two fake Mercado Livre accounts)
-- ============================================================================
-- access_token_encrypted values below are placeholders. The application
-- layer validates envelope shape (v1.<iv>.<ct>.<tag>) and rejects them on
-- use; the row exists so the dashboard has something to render.

INSERT INTO public.connections (
    id,
    user_id,
    platform,
    account_id,
    account_label,
    account_metadata,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    scopes,
    status,
    last_error,
    last_sync_at
)
VALUES
    (
        '00000000-0000-0000-0000-000000000100',
        '00000000-0000-0000-0000-000000000001',
        'mercadolivre',
        '123456789',
        'Demo - VS2B',
        jsonb_build_object(
            'nickname',  'VS2B',
            'email',     'demo+vs2b@audacehub.com',
            'country_id','MLB'
        ),
        'v1.aGFyZGNvZGVkX2l2XzAxMjM0NTY3ODku.aGFyZGNvZGVkX2NpcGhlcnRleHRfZm9yX3ZzMmIu.aGFyZGNvZGVkX2F1dGhfdGFnX3ZzMmI=',
        'v1.aGFyZGNvZGVkX2l2X3JlZnJlc2hfMDEyMzQ1Njc4OS4u.aGFyZGNvZGVkX3JlZnJlc2hfY2lwaGVydGV4dC4u.aGFyZGNvZGVkX3JlZnJlc2hfdGFnXzAxMjM0NTY3ODk=',
        NOW() + INTERVAL '6 hours',
        ARRAY['read_orders','read_items','offline_access'],
        'active',
        NULL,
        NOW() - INTERVAL '15 minutes'
    ),
    (
        '00000000-0000-0000-0000-000000000200',
        '00000000-0000-0000-0000-000000000001',
        'mercadolivre',
        '987654321',
        'Demo - LUMINARIA BISTRO',
        jsonb_build_object(
            'nickname',  'LUMINARIA_BISTRO',
            'email',     'demo+bistro@audacehub.com',
            'country_id','MLB'
        ),
        'v1.aGFyZGNvZGVkX2l2XzA5ODc2NTQzMjE5Lg.aGFyZGNvZGVkX2NpcGhlcnRleHRfZm9yX2Jpc3Ryby4.aGFyZGNvZGVkX2F1dGhfdGFnX2Jpc3Rybw=',
        'v1.aGFyZGNvZGVkX2l2X3JlZnJlc2hfMDk4NzY1NDMyMTku.aGFyZGNvZGVkX3JlZnJlc2hfY2lwaGVydGV4dC4u.aGFyZGNvZGVkX3JlZnJlc2hfdGFnXzA5ODc2NTQzMjE5',
        NOW() + INTERVAL '6 hours',
        ARRAY['read_orders','offline_access'],
        'active',
        NULL,
        NOW() - INTERVAL '2 hours'
    )
ON CONFLICT (user_id, platform, account_id) DO NOTHING;

-- ============================================================================
-- 4. SYNC_JOBS — a few example entries showing different statuses
-- ============================================================================
INSERT INTO public.sync_jobs (
    id,
    connection_id,
    resource,
    cursor_state,
    status,
    started_at,
    completed_at,
    error_message,
    records_processed
)
VALUES
    (
        '00000000-0000-0000-0000-000000001001',
        '00000000-0000-0000-0000-000000000100',
        'orders',
        jsonb_build_object('offset', 0, 'last_id', 2000006000012345),
        'success',
        NOW() - INTERVAL '20 minutes',
        NOW() - INTERVAL '18 minutes',
        NULL,
        42
    ),
    (
        '00000000-0000-0000-0000-000000001002',
        '00000000-0000-0000-0000-000000000100',
        'items',
        NULL,
        'success',
        NOW() - INTERVAL '19 minutes',
        NOW() - INTERVAL '17 minutes',
        NULL,
        128
    ),
    (
        '00000000-0000-0000-0000-000000001003',
        '00000000-0000-0000-0000-000000000100',
        'ads_metrics',
        NULL,
        'error',
        NOW() - INTERVAL '15 minutes',
        NOW() - INTERVAL '14 minutes',
        'HTTP 429: rate limit exceeded',
        0
    ),
    (
        '00000000-0000-0000-0000-000000001004',
        '00000000-0000-0000-0000-000000000200',
        'orders',
        jsonb_build_object('offset', 0, 'last_id', 2000007000098765),
        'success',
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '1 hour 55 minutes',
        NULL,
        17
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 5. NOTIFICATIONS — a welcome banner + the rate-limit error from above
-- ============================================================================
INSERT INTO public.notifications (
    id,
    user_id,
    type,
    severity,
    title,
    body,
    action_url,
    metadata,
    read_at
)
VALUES
    (
        '00000000-0000-0000-0000-000000002001',
        '00000000-0000-0000-0000-000000000001',
        'welcome',
        'success',
        'Bem-vindo ao Audace Hub!',
        'Suas contas demo estao conectadas. Explore o dashboard para ver pedidos, itens e metricas.',
        '/dashboard',
        jsonb_build_object('source','onboarding'),
        NULL
    ),
    (
        '00000000-0000-0000-0000-000000002002',
        '00000000-0000-0000-0000-000000000001',
        'sync_error',
        'warning',
        'Rate limit na sincronizacao de Ads',
        'A sincronizacao de ads_metrics da conta VS2B foi interrompida por rate limit. Sera retentada automaticamente em 5 minutos.',
        '/connections/00000000-0000-0000-0000-000000000100',
        jsonb_build_object('connection_id','00000000-0000-0000-0000-000000000100','resource','ads_metrics','status_code',429),
        NULL
    )
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 6. AUDIT_LOG — show the kind of trail the system produces
-- ============================================================================
INSERT INTO public.audit_log (
    user_id,
    connection_id,
    action,
    resource,
    ip_address,
    user_agent,
    metadata
)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        NULL,
        'user.signed_up',
        'user',
        '127.0.0.1',
        'seed-script/1.0',
        jsonb_build_object('method','seed','email','demo@audacehub.com')
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000100',
        'connection.created',
        'connection',
        '127.0.0.1',
        'seed-script/1.0',
        jsonb_build_object('platform','mercadolivre','account_id','123456789')
    ),
    (
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000200',
        'connection.created',
        'connection',
        '127.0.0.1',
        'seed-script/1.0',
        jsonb_build_object('platform','mercadolivre','account_id','987654321')
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. SUMMARY
-- ============================================================================
-- After running this seed you should see:
--   * 1 user in auth.users (id 00000000-0000-0000-0000-000000000001)
--   * 1 profile in public.profiles
--   * 2 connections in public.connections
--   * 4 sync_jobs
--   * 2 notifications
--   * 3 audit_log entries
--
-- Sign in at http://localhost:3000/auth/signin with:
--     demo@audacehub.com / demo123456
-- ============================================================================

-- ============================================================================
-- END OF SEED
-- ============================================================================