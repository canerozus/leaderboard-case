#!/usr/bin/env bash
# infrastructure/scripts/deploy.sh
# Run from your laptop. SSHes into the EC2 host, pulls latest, rebuilds, restarts,
# and smoke-tests. Idempotent — safe to re-run.
#
# Usage:
#   SSH_HOST=ubuntu@leaderboard.example.com SSH_KEY=~/.ssh/leaderboard-ec2.pem ./deploy.sh
#
# Optional:
#   REMOTE_DIR=/opt/leaderboard   (default)

set -euo pipefail

SSH_HOST="${SSH_HOST:?set SSH_HOST=user@host}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/leaderboard-ec2.pem}"
REMOTE_DIR="${REMOTE_DIR:-/opt/leaderboard}"
COMPOSE_ARGS=(-f docker-compose.prod.yml --env-file .env.production)

echo "▸ Deploying to $SSH_HOST ($REMOTE_DIR)"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_HOST" bash -s <<EOF
set -euxo pipefail
cd $REMOTE_DIR
git fetch origin
git reset --hard origin/main
docker compose ${COMPOSE_ARGS[@]} build
docker compose ${COMPOSE_ARGS[@]} up -d
docker compose ${COMPOSE_ARGS[@]} ps
EOF

echo "▸ Smoke-testing edge"
DOMAIN=$(ssh -i "$SSH_KEY" "$SSH_HOST" "grep ^LEADERBOARD_DOMAIN= $REMOTE_DIR/.env.production | cut -d= -f2")
if [ -z "$DOMAIN" ]; then
  echo "✗ LEADERBOARD_DOMAIN missing on host" >&2
  exit 1
fi

# Try HTTPS first; fall back to HTTP for the pre-TLS bootstrap window
if curl -fsS "https://${DOMAIN}/api/v1/healthz" 2>/dev/null | jq; then
  echo "✓ HTTPS healthz OK"
else
  curl -fsS "http://${DOMAIN}/api/v1/healthz" | jq
  echo "✓ HTTP healthz OK (TLS not yet active)"
fi

echo "✓ Deploy complete"
