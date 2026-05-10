# infrastructure/edge/Dockerfile — nginx + bundled SPA + reverse proxy + ACME path
#
# Build context is the repo root (so we can access frontend/). Compose wires this
# up with: context: ..  dockerfile: infrastructure/edge/Dockerfile
#
# Two configs ship in the image. The entrypoint shim picks one based on
# LEADERBOARD_TLS at container start, and substitutes LEADERBOARD_DOMAIN for the
# real value from the env.

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.27-alpine

# ──────── frontend build ────────
FROM node:${NODE_VERSION} AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# In production, all API calls go to the same origin via the nginx proxy
ENV VITE_API_BASE_URL=/api/v1
RUN npm run build

# ──────── edge runtime ────────
FROM nginx:${NGINX_VERSION} AS runtime

# Templates live OUTSIDE /etc/nginx/templates/ so nginx-alpine's bundled
# 20-envsubst-on-templates.sh doesn't double-process them and corrupt the $host /
# $remote_addr variables (which look like env vars to envsubst).
COPY infrastructure/edge/nginx.http.conf  /etc/nginx/leaderboard/nginx.http.conf
COPY infrastructure/edge/nginx.https.conf /etc/nginx/leaderboard/nginx.https.conf
COPY --from=frontend /app/dist /usr/share/nginx/html

# Webroot for ACME http-01 challenges (mounted as a named volume in compose)
RUN mkdir -p /var/www/certbot

# Entrypoint shim: choose template by LEADERBOARD_TLS, substitute LEADERBOARD_DOMAIN
COPY <<'EOF' /docker-entrypoint.d/40-render-config.sh
#!/bin/sh
set -e
TEMPLATE="/etc/nginx/leaderboard/nginx.http.conf"
if [ "${LEADERBOARD_TLS:-0}" = "1" ]; then
  TEMPLATE="/etc/nginx/leaderboard/nginx.https.conf"
fi
DOMAIN="${LEADERBOARD_DOMAIN:-_}"
sed "s|LEADERBOARD_DOMAIN|${DOMAIN}|g" "$TEMPLATE" > /etc/nginx/nginx.conf
EOF
RUN chmod +x /docker-entrypoint.d/40-render-config.sh

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
