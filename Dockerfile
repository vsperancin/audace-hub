# =============================================================================
# Audace Hub — Dockerfile multi-stage (otimizado para Next 14 standalone)
# =============================================================================
# Imagem final ~150MB usando node:20-alpine + output standalone do Next.
# =============================================================================

# ---------- Stage 1: deps ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN \
  if [ -f package-lock.json ]; then npm ci; \
  else npm install; \
  fi

# ---------- Stage 2: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
# IMPORTANTE: NÃO setar NODE_ENV=production aqui — Coolify injeta isso automaticamente
# e isso faz npm ci pular devDependencies. Manter development pro build stage.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- Stage 3: runner (imagem final) ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuário não-root por segurança.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copia apenas o output standalone + assets públicos + .next/static.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]