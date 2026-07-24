# Rotação ENCRYPTION_KEY — 2026-07-24

## Contexto

A chave `ENCRYPTION_KEY` estava hardcoded no Dockerfile do `audace-hub` em
commits anteriores (visível em `git log -p`), commit `ef07de6` e antes.

Foi removida do Dockerfile no commit `ba7886e` (2026-07-23).

## Rotação manual no Coolify (v4.1.2)

Coolify v4.1.2 não tem API funcional pra env vars. **Fazer via UI:**

1. Painel Coolify → app `audace-hub` → **Environment Variables**
2. Localizar `ENCRYPTION_KEY` existente
3. Clicar no ícone **🗑 Delete** (lixeira)
4. Clicar **+ Add New Variable**:
   - Key: `ENCRYPTION_KEY`
   - Value: `AJ0q8tOZCHGrdPclQjMGj4AP7jXlKUFSWOeqLCqHzvA=`  ← **NOVA**
   - **NÃO marcar nada** (v4.1.2 é auto-secret, confirmado)
5. Save
6. Clicar **Deploy** (botão na página do app)

## Impacto

- Tokens ML já salvos (criptografados com a chave ANTIGA) **ficam ilegíveis**.
- Pra reconectar: user desloga do hub, faz login de novo, clica "Conectar Mercado Livre" — OAuth flow cria novos tokens criptografados com a NOVA.
- Em prod: **zero tokens salvos** (app recém-deployado, ninguém conectou ML ainda). Sem perda.

## Validação pós-deploy

```bash
# Verificar que nova chave tá sendo usada (response do health endpoint é igual)
curl https://hub.vs2b.com.br/api/health

# Verificar que não há rastro da chave antiga em runtime (não dá pra ver env vars,
# mas se alguém tentar descriptografar token antigo, vai falhar com erro genérico).
```

## Histórico Git

A chave ANTIGA continua no histórico (`git log -p -- Dockerfile`).
**Não fazer `git filter-repo`** sem necessidade — destrutivo e quebra clones.
Mitigação alternativa: tornar repo privado se for crítico.