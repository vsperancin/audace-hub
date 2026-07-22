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
# IMPORTANTE: Coolify injeta NODE_ENV=production automaticamente.
# Isso é BOM pro build (Next.js detect production mode e otimiza).
# Mas pode pular devDeps. Por isso forçamos install com --include=dev abaixo.
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Install com devDeps explícito (caso NODE_ENV=production tenha pulado)
RUN npm ci --include=dev --no-audit --no-fund || npm install --include=dev --no-audit --no-fund
RUN npm run build

# ---------- Stage 3: runner (imagem final) ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ML OAuth (Client ID é semi-public — vai no Dockerfile; SECRET vai via UI)
ENV ML_APP_ID="7233150780441807"

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