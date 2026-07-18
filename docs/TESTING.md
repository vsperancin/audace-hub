# Guia de testes

Como testar cada feature do Audace Hub em desenvolvimento local.

---

## Setup para testes

```bash
# 1. Subir Supabase local
npx supabase start

# 2. Aplicar migrations
npx supabase db push

# 3. Configurar .env.local com as credenciais do Supabase local
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=<output de supabase start>
# SUPABASE_SERVICE_ROLE_KEY=<output de supabase start>

# 4. Rodar app
npm run dev
```

---

## 1. Autenticação

### 1.1 Cadastro
1. Acesse `http://localhost:3000/signup`
2. Preencha nome, email, senha
3. **Esperado**: redirect para `/dashboard`
4. **Verificar no Studio**:
   ```sql
   select id, email, created_at from auth.users;
   ```

### 1.2 Login
1. Logout (botão sair no topbar)
2. Acesse `http://localhost:3000/login`
3. Use as credenciais do cadastro
4. **Esperado**: redirect para `/dashboard`

### 1.3 Logout
1. No topbar, clique em **Sair**
2. **Esperado**: redirect para `/login`, cookie de sessão removido

### 1.4 Middleware (proteção de rotas)
1. Sem estar logado, acesse `/dashboard`
2. **Esperado**: redirect para `/login?redirect=/dashboard`
3. Sem estar logado, faça `curl http://localhost:3000/api/connections/abc`
4. **Esperado**: `401 {"ok":false,"error":{"code":"unauthorized"}}`

---

## 2. Criptografia de tokens

### 2.1 Teste unitário manual
```bash
# Gerar chave
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Anote a chave

# Em outro terminal, com a chave no .env.local:
node --experimental-vm-modules -e "
import('./lib/crypto/tokens.ts').then(({ encrypt, decrypt }) => {
  const token = 'APP_USR-1234567890-abcdef';
  const enc = encrypt(token);
  const dec = decrypt(enc);
  console.log('original:', token);
  console.log('encrypted:', enc);
  console.log('decrypted:', dec);
  console.log('match:', token === dec);
});
"
```

### 2.2 Teste de tampering
```bash
node -e "
const { decrypt, CryptoError } = require('./lib/crypto/tokens.ts');
// Modificar 1 byte do payload — auth tag deve falhar
try {
  // ... (rodar encrypt, modificar 1 char, decrypt)
  console.error('FALHOU: tampering não detectado');
} catch (e) {
  if (e.code === 'tampering_detected') console.log('OK: tampering detectado');
}
"
```

---

## 3. Fluxo OAuth Mercado Livre

### 3.1 App de teste no ML
1. Acesse [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br)
2. Crie app com Redirect URI `http://localhost:3000/api/oauth/ml/callback`
3. **Use conta sandbox ML** (sellersandbox.mercadolivre.com.br) para testes

### 3.2 Conectar conta
1. Login no app → `/dashboard/connections`
2. Clique **Conectar Mercado Livre**
3. **Esperado**: redirect para `auth.mercadolivre.com.br`
4. Faça login com conta sandbox e autorize
5. **Esperado**: redirect para `/dashboard/connections` mostrando a conta

### 3.3 Verificar no DB
```sql
select id, platform, account_id, status, token_expires_at, scopes
from public.connections;
```
**Esperado**: 1 linha com `status=active`, `account_id=<seu_user_id_ml>`.

### 3.4 Verificar criptografia
```sql
select
  account_id,
  length(access_token_encrypted) as access_len,
  length(refresh_token_encrypted) as refresh_len,
  access_token_encrypted not like 'APP_USR%' as is_encrypted
from public.connections;
```
**Esperado**: `is_encrypted = true` (tokens brutos não devem aparecer).

### 3.5 Testar state inválido
1. Tente acessar `http://localhost:3000/api/oauth/ml/callback?code=fake&state=fake`
2. **Esperado**: redirect para `/dashboard/connections?oauth_error=invalid_state`

### 3.6 Testar code expirado
1. Inicie OAuth, NÃO autorize no ML, espere 10 min
2. Tente usar o code antigo (forjar URL)
3. **Esperado**: `oauth_error=token_exchange_failed` com mensagem do ML

---

## 4. RLS (Row-Level Security)

### 4.1 Isolamento entre usuários
```bash
# Criar 2 usuários (via UI de signup)
# user1@x.com e user2@x.com

# Conectar ML com user1
# No Studio, criar conexão manualmente para user2:
```

```sql
-- Como service_role (Studio):
insert into public.connections (
  user_id, platform, account_id, status,
  access_token_encrypted, refresh_token_encrypted, token_expires_at,
  scopes
) values (
  '<USER2_ID>', 'mercadolivre', '999', 'active',
  'fake-encrypted', 'fake-encrypted', now() + interval '6 hour',
  array['read_orders']
);
```

```bash
# Login com user1, acessar /dashboard/connections
# Esperado: apenas a conexão de user1 aparece

# Login com user2, acessar /dashboard/connections
# Esperado: conexão de user2 aparece (NÃO a de user1)
```

### 4.2 SQL direto (bypass RLS)
```sql
-- Como service_role: TUDO visível (esperado)
select * from public.connections;
```

```sql
-- Como authenticated user (RLS ativo):
-- Vai falhar — mas podemos testar via policy:
set local role authenticated;
set local "request.jwt.claims" to '{"sub": "<USER1_ID>"}';
select * from public.connections;
-- Esperado: apenas conexões de USER1
```

### 4.3 Tentativa de deletar conexão alheia
```bash
# Como user1 logado, deletar uma connection de user2:
curl -X DELETE http://localhost:3000/api/connections/<USER2_CONNECTION_ID> \
  -H "Cookie: sb-access-token=<USER1_TOKEN>"
# Esperado: 404 not_found (RLS impede + DELETE não encontrou nada)
```

---

## 5. Cliente MercadoLivreClient

### 5.1 Auto-refresh
1. Conecte uma conta ML
2. Espere até faltar 5 min para o token expirar
3. Faça uma requisição para qualquer endpoint que use `MercadoLivreClient`
4. **Esperado**: token é renovado ANTES da chamada (verificar logs do Supabase — tabela `connections` com novo `token_expires_at`)

### 5.2 Retry exponencial
1. Em `lib/ml/client.ts`, adicione `console.log` antes de cada tentativa
2. Desconecte a internet por 5s
3. Faça uma chamada
4. Reconecte
5. **Esperado**: 1ª tentativa falha, 2ª após ~500ms, 3ª após ~1s, sucesso

### 5.3 Erro 401 vs retry
1. Força `expires_at` no DB para o passado
2. Force refresh a falhar (mude o client_secret temporariamente)
3. Chame um endpoint ML
4. **Esperado**: `MLTokenExpiredError` (sem retry — 401 não é retentável)

---

## 6. UI/UX

### 6.1 Sidebar
- Item **Escritório** (overview) é o ativo padrão
- Itens Estoque/Vendas são placeholders (links para `/dashboard/estoque` que dá 404 — esperado até próxima feature)

### 6.2 Dashboard overview
- Card "Conexões ativas" mostra número correto
- Card "Marketplaces" mostra número único de plataformas
- Card "Próximo passo" some após primeira conexão

### 6.3 Connections page
- Empty state: mostra CTA para conectar ML
- Após conectar: card com nickname, status, expiração, scopes

### 6.4 Settings
- Mostra email, ID do user, status de verificação
- Botão "Sair" funciona

---

## 7. Performance / Cache

### 7.1 First Load (FCP)
- Abra DevTools → Lighthouse
- Rode audit em `/dashboard`
- **Esperado**: FCP < 1s, LCP < 2s

### 7.2 Bundle size
```bash
npm run build
# Verifique output de .next/static — cada chunk < 200KB idealmente
```

---

## Checklist de aceitação (v0.1.0)

- [ ] Cadastro/login/logout funcionam
- [ ] Middleware protege `/dashboard` e `/api/*` autenticado
- [ ] OAuth ML completo (start → callback → conexão salva)
- [ ] Tokens armazenados criptografados (verificável via SQL)
- [ ] RLS impede usuário A ver conexões de usuário B
- [ ] Auto-refresh funciona 5min antes de expirar
- [ ] Retry exponencial funciona em 5xx
- [ ] README + docs estão completos
- [ ] `npm run type-check` sem erros
- [ ] `npm run lint` sem erros
- [ ] `npm run build` completa com sucesso