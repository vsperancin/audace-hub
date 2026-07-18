# Arquitetura do Audace Hub

Decisões de design, diagrama de componentes, e trade-offs.

---

## Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (User)                          │
│  - Páginas server-rendered (Next 14 RSC)                        │
│  - Forms client-side (login, signup, connect)                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare (proxy + SSL)                       │
└────────────────┬────────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Coolify (Docker)                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Next.js App (standalone)                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │    │
│  │  │  App Router │  │  Route      │  │  Middleware      │ │    │
│  │  │  (RSC)      │  │  Handlers   │  │  (auth)          │ │    │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │    │
│  │         │                │                   │          │    │
│  │         └────────────────┴───────────────────┘          │    │
│  │                          │                              │    │
│  │  ┌───────────────────────┴────────────────────────┐    │    │
│  │  │              lib/                                │    │    │
│  │  │  - supabase/ (browser, server, admin clients)   │    │    │
│  │  │  - ml/ (MercadoLivreClient, oauth helpers)      │    │    │
│  │  │  - crypto/ (AES-256-GCM)                        │    │    │
│  │  └────────────┬─────────────────┬─────────────────┘    │    │
│  └───────────────┼─────────────────┼──────────────────────┘    │
│                  │                 │                            │
│         ┌────────▼──────┐   ┌──────▼─────────┐                │
│         │  Redis       │   │  Supabase       │                │
│         │  (cache)     │   │  (Auth + DB)    │                │
│         └──────────────┘   └──────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                  ┌──────────────────────────────────┐
                  │       Mercado Livre API          │
                  │  (oauth, orders, items, etc.)    │
                  └──────────────────────────────────┘
```

---

## Decisões arquiteturais

### 1. Next.js 14 App Router (vs. Pages Router)

**Decisão:** App Router.

**Por quê:**
- Server Components por padrão = menos JS no browser = melhor performance
- Layouts aninhados (`app/dashboard/layout.tsx` envolve todas as rotas `/dashboard/*`)
- Streaming SSR nativo
- Suporte oficial para Route Handlers (`app/api/*/route.ts`)

**Trade-off:**
- Ecossistema mais novo (alguns libs ainda não 100% compatíveis)
- `cookies()` em Server Components é read-only (resolvido com middleware)
- Curva de aprendizado se a equipe só conhece Pages Router

---

### 2. Supabase Auth + @supabase/ssr (vs. next-auth)

**Decisão:** Supabase Auth com `@supabase/ssr`.

**Por quê:**
- **Unificação Auth + DB**: RLS usa `auth.uid()` direto nas policies. Com next-auth, teríamos que sincronizar JWT custom com Supabase.
- **Self-hosted friendly**: Supabase pode rodar no mesmo Coolify (Postgres + GoTrue).
- **Sem vendor lock-in**: o DB é Postgres puro, podemos migrar pra qualquer provider.

**Trade-off:**
- Menos provedores OAuth prontos (só email/senha + OAuth genérico). Mas nosso caso é email/senha, então OK.
- Documentação Supabase às vezes atrasada em relação à versão (`@supabase/ssr` mudou formato de cookies em 2024).

---

### 3. RLS (Row-Level Security) para multi-tenancy

**Decisão:** Cada tabela com dados do user tem RLS estrita.

**Por quê:**
- **Defense in depth**: mesmo que a aplicação tenha bug expondo query maliciosa, o banco recusa.
- **Menos código**: não precisamos passar `user_id` em cada query — `auth.uid()` é automático.
- **Auditoria clara**: as policies SQL são a fonte da verdade de quem pode o quê.

**Trade-off:**
- Debugging mais difícil (erro genérico "permission denied" sem dizer qual policy falhou).
- Service role key precisa ser bem guardada (bypassa tudo).

---

### 4. AES-256-GCM para tokens

**Decisão:** AES-256-GCM (não AES-CBC, não RSA).

**Por quê:**
- **AEAD** (Authenticated Encryption with Associated Data): cifra + autentica em 1 operação.
- Tampering detection automático via auth tag (16 bytes).
- Hardware acceleration em CPUs modernas (AES-NI).
- IV aleatório de 12 bytes (96 bits) é o padrão NIST para GCM.

**Formato armazenado:** `base64(IV[12] || ciphertext || tag[16])`.

**Por que NÃO RSA:** RSA é caro computacionalmente e limitado a ~245 bytes com RSA-2048. Tokens ML têm ~1500 bytes.
**Por que NÃO CBC:** CBC precisa de HMAC separado para autenticação. GCM é mais simples e seguro.

**Trade-off:**
- Se `ENCRYPTION_KEY` vazar, TODOS os tokens são comprometidos. Mitigação: rotação periódica (re-encrypt batch job).
- Se perder a chave, tokens são irrecuperáveis. Mitigação: backup obrigatório em vault.

---

### 5. Auto-refresh proativo (5 min antes de expirar)

**Decisão:** Refresh antes da chamada, baseado em `expires_at`.

**Alternativas consideradas:**
- Refresh on 401 (reativo): simples, mas causa latência na primeira request após expirar.
- Background cron refresh: complexo, precisa de scheduler, race conditions.

**Por quê proativo:**
- Latência consistente (nunca paga o custo de 401 + refresh + retry).
- Simples de implementar (1 check antes de cada request).
- Funciona bem com 1 réplica.

**Trade-off:**
- Para multi-réplica com alta concorrência, mutex in-memory não basta. Solução futura: mutex em Redis.

---

### 6. MercadoLivreClient com retry exponencial (tenacity)

**Decisão:** `tenacity` para retries.

**Por quê:**
- Biblioteca battle-tested (original do Stack Overflow / rapportive).
- API fluent: `retry(fn, { stop, wait, retryOnError })`.
- Suporta jitter (evita "thundering herd").

**Configuração:**
- 3 tentativas
- Backoff: 500ms, 1s, 2s (com jitter)
- Retry apenas em 5xx e 429 (NÃO em 4xx = erro do caller)

---

### 7. React Server Components por padrão

**Decisão:** `'use client'` só onde necessário (forms interativos, hooks).

**Componentes client atuais:**
- `login-form.tsx`, `signup-form.tsx` (forms)
- `connect-ml-button.tsx` (onClick + fetch)
- `connection-card.tsx` (delete confirmation)
- `sidebar.tsx` (usePathname)
- `topbar.tsx` (logout action)

**Por quê:** bundle JS menor = FCP/LCP melhores, SEO melhor (RSC é HTML puro).

---

### 8. TypeScript strict + Zod para validação

**Decisão:**
- `strict: true` no tsconfig
- `noUncheckedIndexedAccess: true` (força null check em `arr[0]`)
- `noImplicitOverride: true`
- Zod para TODA entrada de API route

**Por quê:**
- Erros em build-time > erros em runtime.
- Zod gera types automaticamente (`z.infer<typeof schema>`).
- Single source of truth para validação.

---

### 9. Coolify + Docker (vs. Vercel/AWS)

**Decisão:** Coolify self-hosted.

**Por quê:**
- Custo: VPS único roda Supabase + app + Redis (~R$ 100/mês vs. ~R$ 500+ em Vercel+Supabase Cloud+Redis).
- Controle total: logs, métricas, backups.
- Soberania de dados (LGPD-friendly para clientes brasileiros).
- Sem vendor lock-in.

**Trade-off:**
- Você gerencia SSL, updates de segurança, scaling.
- Sem edge functions (mas App Router + RSC compensa).

---

## Estrutura de dados

### Tabela `connections`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | Identificador único |
| `user_id` | uuid FK → auth.users | Dono da conexão |
| `platform` | text | 'mercadolivre' \| 'shopee' \| ... |
| `account_id` | text | ID da conta no marketplace |
| `account_nickname` | text? | Apelido (populado depois) |
| `status` | text | 'active' \| 'expired' \| 'revoked' \| 'pending' |
| `access_token_encrypted` | text | AES-256-GCM base64 |
| `refresh_token_encrypted` | text | AES-256-GCM base64 |
| `token_expires_at` | timestamptz | UTC ISO |
| `scopes` | text[] | Escopos OAuth concedidos |
| `created_at` | timestamptz | Auto |
| `updated_at` | timestamptz | Auto (trigger) |

**Constraint:** `UNIQUE (user_id, platform, account_id)` — impede duplicar conexão.

### Tabela `oauth_states`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | |
| `state_hash` | text UNIQUE | SHA-256 do state |
| `user_id` | uuid FK | Dono do state |
| `platform` | text | Sempre 'mercadolivre' por enquanto |
| `redirect_after` | text? | URL para redirect pós-callback |
| `expires_at` | timestamptz | TTL 10 min |
| `consumed_at` | timestamptz? | Marcado após uso |

**Por que armazenar hash do state:** se o DB vazar, attacker não consegue forjar callbacks (precisaria do raw state).

---

## Segurança

### Camadas de defesa

1. **Cloudflare WAF** — DDoS, bots, exploits conhecidos.
2. **HTTPS** — TLS 1.3, HSTS.
3. **Next.js security headers** — X-Frame-Options, CSP, etc.
4. **Middleware** — auth check em rotas protegidas.
5. **Server-side guards** — `auth.getUser()` em cada Server Component / Route Handler.
6. **RLS** — isolamento por user no DB.
7. **Tokens criptografados** — defense in depth.
8. **State anti-CSRF** — SHA-256 hash com TTL.
9. **Timing-safe state comparison** — `crypto.timingSafeEqual`.
10. **Input validation (Zod)** — em TODA route handler.

### O que NÃO fazemos

- ❌ Não expomos `service_role_key` no client.
- ❌ Não logamos tokens (nem criptografados).
- ❌ Não retornamos tokens em responses de API.
- ❌ Não confiamos em cookies sem revalidar JWT no server.

---

## Performance

### Targets (SLOs)

| Métrica | Target |
|---|---|
| FCP (First Contentful Paint) | < 1s |
| LCP (Largest Contentful Paint) | < 2s |
| TTI (Time to Interactive) | < 2.5s |
| API p95 latency | < 300ms |
| Uptime | ≥ 99.5% |

### Otimizações aplicadas

- **Server Components** = menos JS no browser
- **`output: 'standalone'`** = imagem Docker menor (~150MB)
- **Image domains allowlist** = proteção contra SSRF via `next/image`
- **`cache: 'no-store'`** em chamadas ML = sempre fresh (evita cache stale de tokens)

---

## Limitações conhecidas (v0.1.0)

1. **Mutex de refresh in-memory** — não funciona em multi-réplica. Mitigação: usar Redis (futuro).
2. **Sem background jobs** — sincronização de pedidos não é contínua. Roadmap: BullMQ + Redis.
3. **Sem suporte a refresh rotation via webhook** — ML notifica revogação mas não escutamos. Roadmap.
4. **Não tem rate limiting** — dependemos do rate limit do ML. Roadmap: token bucket no Redis.
5. **1 plataforma** — só Mercado Livre. Roadmap: Shopee, Magalu, Amazon.

---

## Roadmap técnico

| Versão | Features |
|---|---|
| v0.1 | ✅ Scaffold + OAuth ML + RLS + encrypt |
| v0.2 | Sincronização de pedidos (cron diário) |
| v0.3 | Sincronização de estoque (webhook ML) |
| v0.4 | Relatórios de vendas consolidados |
| v0.5 | Shopee OAuth + adapter |
| v1.0 | Multi-plataforma + dashboard BI |

---

## Referências

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Supabase RLS guide](https://supabase.com/docs/guides/auth/row-level-security)
- [@supabase/ssr docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Mercado Livre OAuth2](https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao)
- [AES-GCM (NIST SP 800-38D)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)