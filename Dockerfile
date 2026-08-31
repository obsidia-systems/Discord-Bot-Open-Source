# syntax=docker/dockerfile:1
# Backend prod: Discord gateway + API. El panel lo sirve el servicio `frontend`.
# Canvas nativo se compila en TARGETPLATFORM (ARM64 local / AMD64 TrueNAS).

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ fontconfig fonts-liberation \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN pnpm install --frozen-lockfile --filter @adobos/backend...

FROM deps AS shared-build
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
RUN pnpm --filter @adobos/shared build

FROM shared-build AS backend-build
COPY backend ./backend
RUN pnpm --filter @adobos/backend build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SERVE_STATIC=false

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY backend/package.json ./backend/
RUN pnpm install --filter @adobos/backend... --prod --frozen-lockfile

COPY --from=shared-build /app/packages/shared/dist ./packages/shared/dist
COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=backend-build /app/backend/drizzle ./backend/drizzle
COPY --from=backend-build /app/backend/assets ./backend/assets

RUN mkdir -p /data \
  && chown -R node:node /app /data

USER node
WORKDIR /app/backend

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
