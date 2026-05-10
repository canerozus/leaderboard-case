#!/usr/bin/env bash
# infrastructure/scripts/seed.sh
# Run on the EC2 host (or via SSH). Seeds the production database.
#
# Usage:
#   ./seed.sh                  # seed default count (100k)
#   SEED_COUNT=200 ./seed.sh   # seed a smaller count for smoke tests

set -euo pipefail
cd /opt/leaderboard
COUNT="${SEED_COUNT:-100000}"

echo "▸ Running seed (count=$COUNT)"
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -e SEED_COUNT="$COUNT" backend node dist/seed/seed.js
echo "✓ Seed complete"
