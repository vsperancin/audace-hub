# Audace Hub — Supabase Backend

This directory holds the Postgres schema, migrations, Row Level Security
policies, seed data, and local-dev configuration for **Audace Hub**.

```
supabase/
├── README.md                          # this file
├── config.toml                        # Supabase CLI local-dev configuration
├── migrations/
│   ├── 20260718000001_init.sql        # schema (tables, types, triggers, helpers)
│   └── 20260718000002_rls_policies.sql # Row Level Security policies
└── seed.sql                           # demo user + 2 fake Mercado Livre connections
```

---

## 1. Prerequisites

* **Supabase CLI** — https://supabase.com/docs/guides/cli
  ```bash
  # macOS
  brew install supabase/tap/supabase
  # Debian / Ubuntu — see docs for the .deb / scoop options
  ```
* **Docker Desktop** (or OrbStack on macOS) — Supabase runs its stack in containers.
* **psql** (optional, for inspecting the local DB from the terminal).

---

## 2. First-time setup — run Supabase locally

From the **project root** (the directory that contains `supabase/`):

```bash
# 1. Start the local stack (Postgres, Auth, API, Studio, Inbucket)
supabase start

# 2. The CLI prints all the connection details, e.g.:
#    API URL:    http://127.0.0.1:54321
#    DB URL:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
#    Studio:     http://127.0.0.1:54323
#    Inbucket:   http://127.0.0.1:54324
#    anon key:   eyJ...
#    service_role key: eyJ...
#
# 3. Apply the migrations + seed
supabase db reset   # drops, recreates, applies migrations, runs seed.sql
```

After `supabase db reset` you should have:

* 8 tables in `public.*` (profiles, connections, sync_jobs, orders, items,
  ads_metrics, notifications, audit_log).
* 1 demo user in `auth.users` + matching `public.profiles` row.
* 2 fake Mercado Livre connections (encrypted-token placeholders).

> **Tip**: use `supabase status` to re-print the connection info without
> restarting containers, and `supabase stop` to shut the stack down.

---

## 3. Applying migrations to a managed Supabase project

When you are ready to point at a hosted Supabase instance (staging or
production):

```bash
# 1. Link your local repo to the remote project (one-time)
supabase link --project-ref <your-project-ref>

# 2. Push every new migration in ./migrations
supabase db push

# 3. (Optional) push the seed file via psql. NEVER do this in production.
psql "$(supabase db url --linked | tr -d '"')" -f seed.sql
```

If you prefer to apply manually:

1. Open the Supabase dashboard → **SQL Editor**.
2. Open `migrations/20260718000001_init.sql`, paste, **Run**.
3. Open `migrations/20260718000002_rls_policies.sql`, paste, **Run**.
4. Open `seed.sql`, paste, **Run** *(only in non-production environments)*.

---

## 4. Demo credentials

After running `seed.sql`:

| Field    | Value                  |
|----------|------------------------|
| Email    | `demo@audacehub.com`   |
| Password | `demo123456`           |
| User UUID| `00000000-0000-0000-0000-000000000001` |

The seed inserts two fake Mercado Livre connections so the dashboard has
something to render. The `access_token_encrypted` values are **placeholders**
in the format `v1.<iv>.<ciphertext>.<auth_tag>`; the application layer will
reject them when it tries to make a real API call.

---

## 5. Creating an extra demo user

If you need another demo account (e.g. for testing multi-tenant isolation),
run this in the Supabase SQL Editor *with the service-role key* (RLS blocks
regular users from inserting into `auth.users`):

```sql
-- Replace email/password/uuid as needed.
INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000002',  -- pick a new UUID
    'authenticated', 'authenticated',
    'extra@audacehub.com',
    crypt('demo123456', gen_salt('bf', 10)),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Extra Demo"}',
    NOW(), NOW(), '', '', '', ''
);

-- The handle_new_user() trigger creates the matching profile automatically.
-- If for some reason the trigger didn't fire, insert manually:
-- INSERT INTO public.profiles (id, email, full_name)
-- VALUES ('00000000-0000-0000-0000-000000000002', 'extra@audacehub.com', 'Extra Demo')
-- ON CONFLICT (id) DO NOTHING;
```

---

## 6. Regenerating the seed

```bash
# Wipe public data + re-apply migrations + re-seed
supabase db reset

# Or, if you only want to re-run seed.sql without dropping the DB:
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)" -f supabase/seed.sql
```

To customize the seed (different accounts, different metrics, etc), edit
`seed.sql` directly and re-run `supabase db reset`.

---

## 7. Schema overview

| Table             | Purpose                                                |
|-------------------|--------------------------------------------------------|
| `profiles`        | 1:1 mirror of `auth.users` (display name, avatar)      |
| `connections`     | Marketplace accounts linked to a user (multi-tenant)   |
| `sync_jobs`       | History of background sync attempts                    |
| `orders`          | Denormalized order data + raw API payload              |
| `items`           | Catalog snapshot + raw API payload                     |
| `ads_metrics`     | Paid-traffic metrics per item per period               |
| `notifications`   | In-app notifications (alerts, banners, etc.)           |
| `audit_log`       | Append-only action trail                               |

All encrypted-token columns (`access_token_encrypted`,
`refresh_token_encrypted`) hold AES-256-GCM ciphertext produced by the
application. **The key lives in the application environment, not the
database.** See `public.is_valid_encrypted_token(text)` for the
shape-validation helper.

### Enums

* `platform_type` — mercadolivre, shopee, amazon, tiktokshop, magalu,
  bling, tiny, omie.
* `sync_status`   — pending, running, success, error.
* `order_status`  — pending, paid, shipped, delivered, cancelled,
  refunded, returned.

---

## 8. Row Level Security

`public.*` tables all have RLS **enabled** and **forced** (even the table
owner is subject to policies). Three roles exist:

| Role            | Access                                              |
|-----------------|-----------------------------------------------------|
| `anon`          | No policies granted → all operations denied.        |
| `authenticated` | Limited to own rows (see policies in migration 2).  |
| `service_role`  | Bypasses RLS via `BYPASSRLS`. Backend uses this.    |

The frontend (Next.js client components) connects as `authenticated`. The
backend (Next.js API routes, background workers) connects as `service_role`
and is responsible for OAuth callbacks, sync writes, and audit logging.

---

## 9. Common operations

```bash
# Open the local database in psql
psql "$(supabase status --output env | grep DB_URL | cut -d= -f2-)"

# Tail Postgres logs
supabase logs db

# Tail all logs
supabase logs

# Reset everything (drops DB + re-applies migrations + re-seeds)
supabase db reset

# Generate a new migration stub
supabase migration new <name>

# Diff live DB against local migrations
supabase db diff
```

---

## 10. Troubleshooting

* **`relation "auth.users" does not exist`** — you're not running against
  a Supabase-managed database. The `auth` schema is provided by GoTrue and
  is only present in Supabase stacks (local or hosted).
* **`permission denied for table auth.users`** in `seed.sql` — you are
  connected as `authenticated` or `anon` instead of `postgres` /
  `service_role`. Use `supabase db reset` (which uses `postgres`) or run
  the seed from the SQL Editor with the service-role key.
* **Demo user can't sign in** — make sure `email_confirmed_at` is set in
  the `auth.users` insert, and that `auth.identities` has a matching row.
  The seed script handles both.
* **RLS blocks a query the app needs** — make sure the backend uses the
  `service_role` key for writes to `orders`, `items`, `ads_metrics`, and
  `sync_jobs`. The `authenticated` role can only read those tables.
* **`is_valid_encrypted_token` rejects valid tokens** — your envelope
  format drifted from `v1.<iv>.<ct>.<tag>`. Update either the regex in
  `20260718000001_init.sql` or the producer in the app code.

---

## 11. References

* Supabase docs: https://supabase.com/docs
* Local development: https://supabase.com/docs/guides/cli/local-development
* RLS guide: https://supabase.com/docs/guides/auth/row-level-security
* Auth admin (creating users via SQL): https://supabase.com/docs/guides/auth/admin-users