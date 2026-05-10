# frontend/Dockerfile — local dev only.
# Targets:
#   base  — shared layer (deps installed)
#   dev   — vite dev server with HMR; consumed by docker-compose.yml (root)
#   build — produces dist/ for offline use (e.g. CI artifact upload)
#
# Production deliberately does NOT use this Dockerfile. The SPA is bundled INTO the
# edge container — see infrastructure/edge/Dockerfile, which re-runs `npm run build`
# against frontend/ as its first stage.

# --- base: install deps once, reused by dev + build ---------------------------
FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci

# --- dev: Vite dev server, host-bound so it's reachable from outside ----------
FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# --- build: produce static assets for Plan 3b's edge image --------------------
FROM base AS build
COPY . .
RUN npm run build
# Output lives at /app/dist — copied out by the deploy plan's edge image.
