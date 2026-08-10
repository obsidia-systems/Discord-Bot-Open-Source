# syntax=docker/dockerfile:1
# Multi-stage + buildx: deps nativas (better-sqlite3) se compilán en la etapa final
# para TARGETPLATFORM (ARM64 local / AMD64 TrueNAS).

ARG NODE_VERSION=22

# ─── Base ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ─── Dependencias de workspace ───────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile

# ─── Tipos compartidos ───────────────────────────────────────────────────────
FROM deps AS shared-build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
RUN pnpm --filter @adobos/shared build

# ─── Frontend estático (Astro) ───────────────────────────────────────────────
FROM shared-build AS frontend-build
COPY frontend ./frontend
RUN pnpm --filter @adobos/frontend build

# ─── Backend TypeScript ──────────────────────────────────────────────────────
FROM shared-build AS backend-build
COPY backend ./backend
RUN pnpm --filter @adobos/backend build

# ─── Runtime (un solo proceso Node: Discord WS + panel web) ──────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=file:/data/database.sqlite

WORKDIR /app

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/

# Instala prod deps en la arquitectura destino (SQLite nativo correcto con buildx)
RUN pnpm install --filter @adobos/backend... --prod --frozen-lockfile

COPY --from=shared-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./backend/public

RUN mkdir -p /data \
  && chown -R node:node /app /data

USER node
WORKDIR /app/backend

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
