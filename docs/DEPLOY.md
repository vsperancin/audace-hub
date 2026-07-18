# Deploy no Coolify + Cloudflare

Guia passo-a-passo para colocar o Audace Hub em produção usando Coolify (self-hosted PaaS) e Cloudflare (DNS + proxy + SSL).

---

## Arquitetura de produção

```
┌─────────────────────────────────────────────────────────────┐
│                        Cloudflare                           │
│  - DNS (A/CNAME)                                            │
│  - Proxy (camada laranja) — proteção DDoS                   │
│  - SSL termination                                          │
│  - Cache de assets estáticos                                │
└──────────────┬──────────────────────┬───────────────────────┘
               │                      │
       app.audacehub.com.br   supabase.audacehub.com.br
               │                      │
               ▼                      ▼
┌──────────────────────┐  ┌────────────────────────────┐
│  VPS (Coolify)       │  │  VPS (mesmo VPS,           │
│  ─────────────       │  │   Coolify)                  │
│  Docker: app         │  │  ─────────────              │
│  Docker: redis       │  │  Docker Compose Supabase:  │
│  Port: 3000          │  │  - postgres                │
└──────────────────────┘  │  - gotrue (auth)           │
                          │  - postgrest               │
                          │  - realtime                │
                          │  - storage                 │
                          │  - studio                  │
                          │  Port: 8000                │
                          └────────────────────────────┘
```

---

## Pré-requisitos

- [Coolify](https://coolify.io) v4 instalado em VPS (≥ 4GB RAM)
- Domínio próprio com nameservers apontando para Cloudflare
- 2 subdomínios: `app.seudominio.com.br` e `supabase.seudominio.com.br`

---

## Parte 1: configurar Cloudflare (5 min)

### 1. Adicionar domínio
1. Cloudflare Dashboard → **Add a Site** → informe seu domínio
2. Escolha plano **Free** (suficiente)
3. Cloudflare fornecerá 2 nameservers — altere no registrar do seu domínio

### 2. Criar registros DNS
| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `app` | `<IP_VPS>` | ✅ Proxied |
| A | `supabase` | `<IP_VPS>` | ✅ Proxied |

### 3. Configurar SSL
- **SSL/TLS** → **Full** (não "Full strict" — Coolify emite cert próprio)
- **Edge Certificates** → **Always Use HTTPS** = ON

---

## Parte 2: subir Supabase no Coolify (10 min)

### 1. Clonar docker-compose oficial
```bash
cd /tmp
git clone https://github.com/supabase/supabase.git
cd supabase/docker
cp .env.example .env
```

### 2. Configurar `.env` do Supabase
Edite as seguintes variáveis (gere novos valores aleatórios):

```bash
POSTGRES_PASSWORD="<senha-forte-aqui>"        # 32+ caracteres
JWT_SECRET="<jwt-secret-32-bytes>"           # openssl rand -base64 32
ANON_KEY="<gere-com-jwt>"                    # use o script docker/gen.keys.sh
SERVICE_ROLE_KEY="<gere-com-jwt>"            # mesmo script
SITE_URL="https://app.audacehub.com.br"
API_EXTERNAL_URL="https://supabase.audacehub.com.br"
SUPABASE_PUBLIC_URL="https://supabase.audacehub.com.br"
```

### 3. Gerar keys JWT
```bash
./docker/scripts/generate-keys.sh
# Saída: ANON_KEY=eyJ..., SERVICE_ROLE_KEY=eyJ...
# Copie para o .env
```

### 4. Deploy no Coolify
1. Coolify → **+ New Resource** → **Docker Compose**
2. Cole o conteúdo de `supabase/docker/docker-compose.yml`
3. Em **Environment Variables**, cole todas do `.env`
4. Configure o domínio `supabase.seudacehub.com.br` (Coolify gera SSL via Let's Encrypt)
5. **Deploy**

### 5. Aplicar migrations
Acesse o **Studio** do Supabase em `https://supabase.audacehub.com.br` (login: `postgres` + senha do `.env`).

1. **SQL Editor** → **New Query**
2. Cole o conteúdo de `supabase/migrations/20260118000000_initial_schema.sql`
3. **Run**

Verifique se funcionou:
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public';
-- Deve mostrar 'connections' e 'oauth_states' com rowsecurity = true
```

---

## Parte 3: subir o Audace Hub no Coolify (10 min)

### 1. Push do código para Git
```bash
cd audace-hub
git init
git add .
git commit -m "feat: initial scaffold"
git remote add origin git@github.com:audace-hub/audace-hub.git
git push -u origin main
```

### 2. Deploy no Coolify
1. Coolify → **+ New Resource** → **Docker Compose**
2. **Build Pack** = `Docker Compose`
3. Cole o conteúdo de `docker-compose.yml` deste repo (ou aponte pro Git)
4. Configure o domínio `app.audacehub.com.br`

### 3. Variáveis de ambiente no Coolify

| Variável | Valor de produção |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.audacehub.com.br` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://supabase.audacehub.com.br` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (do `.env` do Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | (do `.env` do Supabase) |
| `ML_APP_ID` | (do painel ML) |
| `ML_CLIENT_SECRET` | (do painel ML) |
| `ML_REDIRECT_URI` | `https://app.audacehub.com.br/api/oauth/ml/callback` |
| `ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `REDIS_URL` | `redis://redis:6379` |
| `NODE_ENV` | `production` |

⚠️ **Gere NOVA `ENCRYPTION_KEY` para prod!** Não reuse a de dev.

### 4. Atualizar Redirect URI no app ML
No painel do seu app Mercado Livre, atualize:
- **Redirect URI**: `https://app.audacehub.com.br/api/oauth/ml/callback`
- Salve.

### 5. Deploy
Clique em **Deploy** no Coolify. Logs em tempo real aparecem no painel.

---

## Parte 4: verificar (5 min)

### 1. Healthcheck
```bash
curl https://app.audacehub.com.br/api/health
# Esperado: {"ok":true,"service":"audace-hub","timestamp":"..."}
```

### 2. Testar fluxo OAuth
1. Acesse `https://app.audacehub.com.br`
2. Crie conta → login
3. Vá em **Conexões** → **Conectar Mercado Livre**
4. Autorize no ML
5. Deve voltar para `/dashboard/connections` mostrando a conta conectada ✅

### 3. Verificar tokens criptografados
No Studio do Supabase:
```sql
select id, platform, account_id, status, token_expires_at, length(access_token_encrypted) as access_len
from public.connections;
```
`access_len` deve ser ~200+ (base64 do ciphertext + IV + tag).

---

## Backups

### Banco (Supabase)
Configure backup automático no Coolify para o serviço Postgres (Storage Volume → Backup schedule). Recomendado: **diário**, retenção **7 dias**.

### Encryption key
⚠️ **CRÍTICO**: guarde a `ENCRYPTION_KEY` em local seguro (1Password, Bitwarden, Vault). Se perdê-la, todos os tokens salvos são irrecuperáveis.

---

## Atualizações

Para atualizar a aplicação:
```bash
git push
# Coolify detecta push e rebuilda automaticamente (se configurado)
# Ou: Coolify → Deploy → Redeploy
```

Se houve mudança em migrations:
```bash
# Rode a nova migration no Studio SQL Editor
# Ou: psql direto
```

---

## Custos estimados

| Recurso | Custo/mês |
|---|---|
| VPS (4GB RAM) | R$ 50-100 |
| Domínio | R$ 3/mês (anual) |
| Cloudflare Free | R$ 0 |
| **Total** | **~R$ 60-100/mês** |

(Para escalar além de ~1000 usuários ativos, aumentar VPS para 8GB+.)

---

## Suporte

Problemas? Veja [TROUBLESHOOTING.md](../README.md#-troubleshooting) ou abra uma issue.