# Audace Hub

> Plataforma multi-tenant para consolidar contas de marketplace (Mercado Livre, Shopee, Magalu, Amazon) em um único painel.

**Stack:** Next.js 14 (App Router) · TypeScript strict · Tailwind CSS + shadcn/ui · Supabase (Auth + Postgres + RLS) · Coolify deploy · Docker · Mercado Livre OAuth2

---

## 📑 Índice

- [Visão geral](#-visão-geral)
- [Setup local em 5 minutos](#-setup-local-em-5-minutos)
- [Deploy em produção no Coolify (15 min)](#-deploy-em-produção-no-coolify-15-min)
- [Como obter credenciais do Mercado Livre](#-como-obter-credenciais-do-mercado-livre)
- [Como obter ENCRYPTION_KEY](#-como-obter-encryption_key)
- [Estrutura do projeto](#-estrutura-do-projeto)
- [Variáveis de ambiente](#-variáveis-de-ambiente)
- [Comandos úteis](#-comandos-úteis)
- [Documentação adicional](#-documentação-adicional)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Visão geral

Audace Hub permite que lojistas brasileiros conectem **múltiplas contas de múltiplos marketplaces** via OAuth2 e vejam tudo em um único painel. Cada usuário vê apenas suas próprias conexões (RLS no Postgres).

**Features atuais (v0.1.0):**
- ✅ Autenticação via Supabase (email + senha)
- ✅ Conexão OAuth2 Mercado Livre (read_orders, read_items, read_shipments, read_billing, read_ads, write_items, write_shipments)
- ✅ Tokens armazenados criptografados (AES-256-GCM)
- ✅ Auto-refresh de tokens (5 min antes de expirar) com retry exponencial
- ✅ Dashboard autenticado com sidebar estilo Magiic
- ✅ RLS no Postgres (isolamento por usuário)

**Roadmap:**
- 📊 Sincronização de pedidos (cron)
- 📦 Sincronização de estoque
- 💰 Consolidação de faturamento
- 🔌 Suporte a Shopee/Magalu/Amazon
- 📈 Relatórios e gráficos

---

## 🚀 Setup local em 5 minutos

### Pré-requisitos
- **Node.js 20+** (recomendado: usar `nvm`)
- **npm 10+** (ou pnpm/yarn — npm foi o testado)
- **Supabase CLI** (`npx supabase` funciona sem instalar)
- Conta no [Supabase](https://supabase.com) (free tier serve)
- Conta de developer no [Mercado Livre](https://developers.mercadolivre.com.br) (gratuita)

### Passo 1: clonar e instalar dependências (1 min)

```bash
git clone <repo-url> audace-hub
cd audace-hub
npm install
```

### Passo 2: criar projeto Supabase (2 min)

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Anote:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ nunca exponha)

### Passo 3: aplicar migrations (30s)

```bash
# Se você usa Supabase Cloud:
#   1. Vá em SQL Editor no dashboard
#   2. Cole o conteúdo de supabase/migrations/20260118000000_initial_schema.sql
#   3. Clique em Run

# Se você usa Supabase local (recomendado para dev):
npx supabase start
npx supabase db push
```

### Passo 4: configurar variáveis de ambiente (1 min)

```bash
cp .env.example .env.local
```

Edite `.env.local` e preencha (veja [Variáveis de ambiente](#-variáveis-de-ambiente) para detalhes):

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
ML_APP_ID="1234567890123456"
ML_CLIENT_SECRET="abc..."
ML_REDIRECT_URI="http://localhost:3000/api/oauth/ml/callback"
ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
```

### Passo 5: rodar o dev server (30s)

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Crie uma conta, vá em **Conexões**, clique em **Conectar Mercado Livre** e teste o fluxo OAuth.

✅ **Pronto!** Você tem um ambiente de desenvolvimento completo.

---

## 🌐 Deploy em produção no Coolify (15 min)

### Pré-requisitos
- VPS com Coolify instalado (≥ 4GB RAM recomendado)
- Domínio apontado para o VPS (ex: `app.audacehub.com.br`)
- Cloudflare configurado (proxy + SSL) — opcional mas recomendado

### Passo 1: criar serviço Supabase no Coolify (5 min)

1. No Coolify → **+ New Resource** → **Docker Compose**
2. Use a config oficial: https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml
3. Após subir, anote:
   - URL do Supabase (ex: `https://supabase.audacehub.com.br`)
   - Service role key (do `.env` do compose Supabase, variável `SERVICE_ROLE_KEY`)
4. Aplique as migrations:
   ```bash
   # No terminal do Coolify, no serviço Supabase:
   psql postgresql://postgres:postgres@localhost:5432/postgres -f /path/to/migrations/20260118000000_initial_schema.sql
   # Ou use o dashboard Studio (SQL Editor).
   ```

### Passo 2: subir o app Audace Hub (5 min)

1. **+ New Resource** → **Docker Compose** no Coolify
2. Cole o conteúdo de `docker-compose.yml` deste repo
3. Configure as env vars no Coolify (mesmas do `.env.local`, mas ajustadas para prod):
   ```bash
   NEXT_PUBLIC_APP_URL="https://app.audacehub.com.br"
   NEXT_PUBLIC_SUPABASE_URL="https://supabase.audacehub.com.br"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
   SUPABASE_SERVICE_ROLE_KEY="..."
   ML_APP_ID="..."
   ML_CLIENT_SECRET="..."
   ML_REDIRECT_URI="https://app.audacehub.com.br/api/oauth/ml/callback"
   ENCRYPTION_KEY="..."   # gere NOVO para prod!
   REDIS_URL="redis://redis:6379"
   NODE_ENV="production"
   ```
4. **IMPORTANTE**: atualize o **Redirect URI** no painel do seu app ML para apontar para produção.

### Passo 3: configurar domínio + SSL via Cloudflare (5 min)

1. No Cloudflare: adicione `A app.audacehub.com.br → IP_VPS` (proxy ativado)
2. No Coolify: configure o domínio do app
3. SSL: deixe o Cloudflare gerenciar (modo "Full")
4. Configure page rules/transform rules se quiser cachear assets estáticos

### Passo 4: verificar healthcheck (30s)

```bash
curl https://app.audacehub.com.br/api/health
# Esperado: {"ok":true,"service":"audace-hub","timestamp":"..."}
```

✅ **Pronto!** App em produção com auto-refresh de tokens, RLS, e Docker.

---

## 🔑 Como obter credenciais do Mercado Livre

### 1. Criar conta de developer
1. Acesse [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br)
2. Faça login com sua conta ML (ou crie uma)
3. Vá em **Meus apps** → **Criar nova aplicação**

### 2. Preencher dados do app
- **Nome**: Audace Hub
- **Descrição**: "Plataforma de consolidação de marketplace"
- **Domínio / Redirect URI**:
  - Dev: `http://localhost:3000/api/oauth/ml/callback`
  - Prod: `https://app.audacehub.com.br/api/oauth/ml/callback`
- **Escopos**: marque os que precisa (já temos no `lib/ml/oauth.ts`):
  - `read_orders`, `read_items`, `read_shipments`, `read_billing`, `read_ads`
  - `write_items`, `write_shipments`

### 3. Anotar credenciais
Após criar, você verá:
- **Client ID** (= `ML_APP_ID`)
- **Client Secret** (= `ML_CLIENT_SECRET`)

⚠️ O Client Secret só é mostrado uma vez — copie imediatamente.

### 4. Importante: conta em produção
Para conectar contas de ML reais (não sandbox), seu app precisa estar em **produção**. Faça isso em **Meus apps → [seu app] → Promover para produção**. Pode levar 1-2 dias para aprovação.

---

## 🔐 Como obter ENCRYPTION_KEY

A chave de criptografia AES-256-GCM (32 bytes) deve ser gerada uma única vez e mantida em segredo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copie o resultado para `.env.local` (dev) e Coolify (prod). **Use chaves diferentes** entre dev e prod — se perder a chave, todos os tokens salvos ficam irrecuperáveis (backup obrigatório!).

---

## 📁 Estrutura do projeto

```
audace-hub/
├── app/                          # App Router (Next 14)
│   ├── (public)/                 # Rotas públicas
│   │   ├── page.tsx              # Landing
│   │   ├── login/                # Login + signup
│   │   └── signup/
│   ├── dashboard/                # Rotas autenticadas
│   │   ├── layout.tsx            # Sidebar + Topbar
│   │   ├── page.tsx              # Overview
│   │   ├── connections/          # Lista de conexões
│   │   └── settings/             # Perfil
│   └── api/                      # Route handlers
│       ├── oauth/ml/             # Fluxo OAuth ML
│       ├── connections/          # CRUD de conexões
│       └── health/               # Healthcheck
├── components/
│   ├── ui/                       # shadcn (button, card, input, badge)
│   ├── dashboard/                # Sidebar, Topbar, StatCard
│   └── connections/              # ConnectMlButton, ConnectionCard
├── lib/
│   ├── supabase/                 # Clients (browser, server, admin)
│   ├── ml/                       # Cliente ML + helpers OAuth
│   ├── crypto/                   # AES-256-GCM
│   └── utils.ts                  # cn(), formatBRL(), etc
├── types/                        # Tipos compartilhados
├── supabase/migrations/          # SQL migrations
├── docs/                         # DEPLOY, TESTING, ARCHITECTURE
└── ...
```

Ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para decisões de design detalhadas.

---

## ⚙️ Variáveis de ambiente

| Variável | Descrição | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | URL pública do app | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (anon) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave admin (SECRETA) | ✅ |
| `ML_APP_ID` | Client ID do app ML | ✅ |
| `ML_CLIENT_SECRET` | Client Secret ML (SECRETA) | ✅ |
| `ML_REDIRECT_URI` | Callback OAuth (cadastrado no app ML) | ✅ |
| `ENCRYPTION_KEY` | Chave AES-256 base64 (SECRETA) | ✅ |
| `REDIS_URL` | URL do Redis (cache/filas) | ⬜ opcional |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN | ⬜ opcional |

⚠️ **NUNCA** commite `.env.local`. **NUNCA** exponha `SERVICE_ROLE_KEY` ou `ML_CLIENT_SECRET` no client.

---

## 🛠 Comandos úteis

```bash
npm run dev          # Dev server (hot reload)
npm run build        # Build de produção
npm run start        # Roda build de produção
npm run lint         # ESLint
npm run type-check   # TypeScript (sem emit)
npm run db:push      # Aplica migrations (Supabase CLI)
npm run db:reset     # Reseta DB local (CUIDADO)
npm run format       # Prettier
```

---

## 📚 Documentação adicional

- [docs/DEPLOY.md](docs/DEPLOY.md) — passo-a-passo detalhado Coolify + Cloudflare
- [docs/TESTING.md](docs/TESTING.md) — como testar cada feature
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — diagrama + decisões de design

---

## 🆘 Troubleshooting

### "ENCRYPTION_KEY deve ter 32 bytes"
Você não gerou a chave ou gerou no formato errado. Rode:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### "Token exchange falhou: 400 invalid_grant"
O `code` OAuth expirou (válido por 10 min) ou já foi usado. Inicie o fluxo novamente.

### "redirect_uri_mismatch"
O `ML_REDIRECT_URI` no `.env` não bate EXATAMENTE com o cadastrado no painel do app ML (até a barra final importa).

### "permission denied for table connections"
RLS está ativo e você está tentando acessar sem `auth.uid()`. Use o service_role apenas server-side.

### Dev server não conecta no Supabase
Verifique se `NEXT_PUBLIC_SUPABASE_URL` e a `ANON_KEY` estão corretas e se o projeto Supabase está rodando.

---

## 📄 Licença

Proprietary — © 2026 Audace Hub.

---

**Desenvolvido com ❤️ no Brasil 🇧🇷**