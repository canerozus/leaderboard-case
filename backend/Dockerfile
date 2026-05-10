# backend/Dockerfile — multi-stage; node:24-bookworm-slim
# Stages:
#   base  — install all deps (used as parent for dev/build/test)
#   dev   — tsx watch; mounted source via compose volume
#   build — tsc compile to dist/
#   prod  — minimal runtime: dist/ + production deps, non-root user
#
# Debian-based (bookworm-slim) instead of alpine: glibc avoids native-module
# compatibility surprises with bcrypt and the like.

ARG NODE_VERSION=24-bookworm-slim

# ─── base ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci

# ─── dev ────────────────────────────────────────────────────────────────
# Used by docker-compose `api` and `worker` services. The compose file
# bind-mounts the source over /app and uses an anonymous volume to keep
# /app/node_modules from the image.
FROM base AS dev
COPY . .
EXPOSE 3000
# Default to API; the worker service overrides this with `command:` in compose.
CMD ["npm", "run", "dev:api"]

# ─── build ──────────────────────────────────────────────────────────────
FROM base AS build
COPY . .
RUN mkdir -p migrations && npm run build

# ─── prod ───────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system app && useradd --system --gid app app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/healthz || exit 1
CMD ["node", "dist/src/index.api.js"]
