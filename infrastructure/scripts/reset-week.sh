#!/usr/bin/env bash
# infrastructure/scripts/reset-week.sh
# Manually run the weekly reset/payout on demand. Defaults to closing the *current*
# week so a demo can show payouts immediately, not wait until Monday.
#
# Usage:
#   ./reset-week.sh              # closes currentWeekId() (and starts a fresh one on next tap)
#   ./reset-week.sh --week 12345 # closes a specific weekId

set -euo pipefail
cd /opt/leaderboard

WEEK_FLAG="${1:-}"
WEEK_VALUE=""
if [ "$WEEK_FLAG" = "--week" ]; then
  WEEK_VALUE="${2:?--week requires a value}"
fi

# Inline ESM script run by node --input-type=module. Imports the compiled payout
# service from the production image and triggers a single reset cycle.
SCRIPT='import { makePayoutService } from "./dist/features/payout/payout.service.js";
import { CacheService } from "./dist/shared/cache/cache.service.js";
import { connectMongo, closeMongo } from "./dist/shared/db/mongo.js";
import { getPool, closePostgres } from "./dist/shared/db/postgres.js";
import { closeRedis, getRedis } from "./dist/shared/db/redis.js";
import { logger } from "./dist/shared/lib/logger.js";
import { currentWeekId } from "./dist/shared/lib/weekId.js";

const arg = process.argv[2];
const weekId = arg ? Number(arg) : currentWeekId();
await connectMongo();
await getPool().query("SELECT 1");
const cache = new CacheService(getRedis(), logger);
const r = await makePayoutService(cache).runReset(weekId);
console.log(JSON.stringify(r));
await closeMongo(); await closePostgres(); await closeRedis();
process.exit(0);'

echo "▸ Triggering reset (weekId=${WEEK_VALUE:-current})"
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T backend node --input-type=module -e "$SCRIPT" $WEEK_VALUE
echo "✓ Reset complete"
