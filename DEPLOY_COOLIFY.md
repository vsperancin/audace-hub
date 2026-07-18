# 🚀 Deploy do Audace Hub no Coolify (hub.vs2b.com.br)

> **Sem GitHub, sem complicação.** Você envia o pacote `.tar.gz` direto pro Coolify via UI.
> Tempo total: **30-45 minutos** (incluindo Supabase + DNS).

---

## 📋 Visão geral do deploy

```
hub.vs2b.com.br (Cloudflare proxy)
        │
        ▼
VINIA (Coolify + Traefik)
        │
        ├── 🟦 audace-hub          (Next.js app, porta 3000)
        └── 🟪 audace-supabase     (Supabase stack, Docker Compose oficial)
```

3 componentes pra subir:

1. **DNS** no Cloudflare → `hub.vs2b.com.br` → IP da VINIA
2. **Supabase self-hosted** (Docker Compose oficial) → subdomínio dedicado (ex: `supabase.vs2b.com.br`)
3. **Audace Hub** (app Next.js) → `hub.vs2b.com.br`

---

## Etapa 1 — DNS no Cloudflare (5 min)

1. Acesse https://dash.cloudflare.com → domínio `vs2b.com.br` → DNS
2. Adicione registro A:
   - **Tipo**: A
   - **Nome**: `hub`
   - **Endereço**: IP público da VINIA (use `curl ifconfig.me` na VINIA pra descobrir)
   - **Proxy**: ✅ ligado (laranja) — Cloudflare gerencia SSL
   - **TTL**: Auto
3. (Opcional) Repita pra `supabase` se quiser subdomínio dedicado pro Supabase

Aguarde 1-2 min e teste:
```bash
dig hub.vs2b.com.br
# Deve retornar IP da VINIA com proxy Cloudflare
```

---

## Etapa 2 — Subabase self-hosted no Coolify (15 min)

### 2.1 Criar serviço Supabase via Docker Compose

1. **Coolify → seu servidor → + New Resource → Docker Compose**
2. Nome: `audace-supabase`
3. Cole o conteúdo do compose oficial: https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
4. **Importante**: substitua as senhas padrão em `.env` do compose:
   - `POSTGRES_PASSWORD` (gere com `openssl rand -hex 32`)
   - `JWT_SECRET` (gere com `openssl rand -hex 32`)
   - `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`/`PASSWORD`
5. Em **Domains** no Coolify, configure: `supabase.vs2b.com.br`
6. **Deploy** — vai demorar 3-5 min pra subir todos containers

### 2.2 Obter URL e keys do Supabase

Após subir, anote (em algum lugar seguro):

| Variável | Onde achar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do Coolify (ex: `https://supabase.vs2b.com.br`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Arquivo `.env` do compose Supabase → `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Arquivo `.env` do compose Supabase → `SERVICE_ROLE_KEY` |

### 2.3 Aplicar migrations do Audace Hub

1. Acesse o **Studio do Supabase** (`https://supabase.vs2b.com.br` — login com DASHBOARD_USERNAME/PASSWORD)
2. Vá em **SQL Editor** → New query
3. Cole e rode (em ordem):

**a) Extensões + Schema principal** — abra `supabase/migrations/20260718000001_init.sql` do pacote, copie e cole tudo, clique **Run**

**b) RLS policies** — abra `supabase/migrations/20260718000002_rls_policies.sql`, copie, cole, rode

**c) Tabela oauth_states** — abra `supabase/migrations/20260118000000_oauth_states.sql`, copie, cole, rode

4. Verifique em **Table Editor** que existem 9 tabelas: `profiles`, `connections`, `sync_jobs`, `orders`, `items`, `ads_metrics`, `notifications`, `audit_log`, `oauth_states`

---

## Etapa 3 — Audace Hub no Coolify (15 min)

### 3.1 Upload do pacote

1. **Coolify → seu servidor → + New Resource → Docker Image** (NÃO Docker Compose — vamos usar só o serviço do app)
   - **Alternativa**: criar como **Docker Compose** com o conteúdo de `docker-compose.yml` deste pacote (mais limpo)
2. **Source**: Upload de arquivo `audace-hub-clean-YYYYMMDD.tar.gz` (174KB, 100 arquivos)
3. Coolify detecta o `Dockerfile` automaticamente e constrói

### 3.2 Configurar env vars

No Coolify, em **Environment Variables** do serviço Audace Hub, adicione:

```bash
# Aplicação
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://hub.vs2b.com.br

# Supabase (pegar do passo 2.2)
NEXT_PUBLIC_SUPABASE_URL=https://supabase.vs2b.com.br
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...copiar do Supabase...
SUPABASE_SERVICE_ROLE_KEY=eyJ...copiar do Supabase...

# Mercado Livre OAuth (pegar em developers.mercadolivre.com.br/devcenter)
ML_APP_ID=1234567890123456          # ← você precisa criar o app ML
ML_CLIENT_SECRET=abc123def456...      # ← você precisa criar o app ML
ML_REDIRECT_URI=https://hub.vs2b.com.br/api/oauth/ml/callback

# Criptografia (GERAR NOVO pra prod!)
# Na VINIA, rode: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=MDEyMzQ1Njc4OW...colocar o resultado aqui

# Redis (opcional, futuro)
# REDIS_URL=redis://redis:6379
```

### 3.3 Configurar domínio

Em **Domains** do serviço Audace Hub: `hub.vs2b.com.br`

Coolify + Cloudflare gerencia SSL automático via Let's Encrypt / proxy.

### 3.4 Deploy

1. Clique **Deploy**
2. Build demora ~2-3 min (Next.js compila)
3. Quando ficar verde, visite `https://hub.vs2b.com.br` no browser

---

## Etapa 4 — Criar app no Mercado Livre Developers (10 min)

**Importante**: precisa fazer isso ANTES de testar OAuth ML.

1. Acesse https://developers.mercadolivre.com.br/devcenter
2. **Minhas aplicações → Criar aplicação**
3. Preencha:
   - **Nome**: Audace Hub
   - **Descrição**: Plataforma de BI para sellers do Mercado Livre
   - **Redirect URI**: `https://hub.vs2b.com.br/api/oauth/ml/callback`
   - **Domínios permitidos**: `hub.vs2b.com.br`
4. Após criar, anote:
   - **Client ID** (= `ML_APP_ID`)
   - **Client Secret** (= `ML_CLIENT_SECRET`)
5. Volte no Coolify e atualize as env vars com esses valores
6. **Restart** o serviço Audace Hub

---

## Etapa 5 — Primeiro teste (você faz)

1. Abra `https://hub.vs2b.com.br` no browser
2. Clique **Criar conta** → preencha email/senha → confirme
3. Você deve estar logado no dashboard (sidebar estilo Magiic)
4. Vá em **Conexões → Conectar Mercado Livre**
5. Vai redirecionar pra Mercado Livre, peça pra autorizar
6. Volta pro Audace Hub → sua conta ML deve aparecer como "Conectado"
7. **Sucesso!** 🎉

---

## 🔍 Troubleshooting

| Problema | Solução |
|---|---|
| `502 Bad Gateway` ao acessar `hub.vs2b.com.br` | Coolify ainda tá construindo. Aguarde 3-5 min. |
| `SSL_ERROR` | Cloudflare proxy demora ~1min pra emitir cert. Aguarde. |
| `404 em /api/oauth/ml/start` | Verifique se env vars `ML_APP_ID` e `ML_REDIRECT_URI` estão setadas no Coolify |
| Login do ML falha com `redirect_uri_mismatch` | URL no app ML Developers deve ser **exatamente** `https://hub.vs2b.com.br/api/oauth/ml/callback` (sem trailing slash) |
| Token salvo mas "Não autorizado" depois | Verifique se `ENCRYPTION_KEY` no Coolify bate com o usado no `.env.local` (regenerar = perde tokens antigos) |
| Supabase 401 ao logar | Verifique se as migrations rodaram (Table Editor deve ter 9 tabelas) e se RLS está ativo |

---

## 📂 Estrutura de arquivos enviada

```
audace-hub-clean-YYYYMMDD.tar.gz (174KB, 100 arquivos)
├── README.md
├── Dockerfile
├── docker-compose.yml
├── package.json + package-lock.json
├── .env.example
├── app/                    # Next.js App Router (16 arquivos)
├── components/             # shadcn-style components (9 arquivos)
├── lib/                    # Supabase client + ML library + crypto
├── supabase/               # 3 migrations + seed + README + config.toml
├── docs/                   # ARCHITECTURE + DEPLOY + TESTING
├── types/                  # TypeScript types
└── middleware.ts           # Auth middleware
```

**Total código**: ~7.500 LOC TypeScript/SQL

---

## 📞 Próximos passos depois que tudo funcionar

1. Configurar **webhook** do Mercado Livre pra receber notifications em tempo real
2. Adicionar **sync engine** (cron job que puxa orders/items/ads_metrics periodicamente)
3. Adicionar **Bling/Tiny/Omie** como próxima plataforma
4. **Backup automático** do Postgres (cron + restic pra S3 ou HD externo)
5. **Monitoramento** (Uptime Kuma ou similar)

Boa sorte com o deploy! Me chama se travar em alguma etapa. 🚀