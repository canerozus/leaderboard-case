#!/usr/bin/env bash
# infrastructure/scripts/certbot-renew.sh
# Run on the EC2 host via cron. Renews any near-expiring certs and reloads nginx
# in the edge container if anything changed.

set -euo pipefail

cd /opt/leaderboard
WEBROOT=$(docker volume inspect leaderboard-prod_certbot-webroot --format '{{ .Mountpoint }}')

# Renew only if needed; certbot is a no-op when certs are >30 days from expiry.
sudo certbot renew --webroot -w "$WEBROOT" --quiet

# Reload nginx if any cert changed in the last 5 minutes
if find /etc/letsencrypt/live -mmin -5 -name 'fullchain.pem' | grep -q .; then
  docker compose -f docker-compose.prod.yml --env-file .env.production \
    exec -T edge nginx -s reload
fi
