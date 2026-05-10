// backend/seed/demo-traffic.ts
import { loadConfig } from '../src/config.js';
import { logger } from '../src/shared/lib/logger.js';
import { connectMongo, closeMongo } from '../src/shared/db/mongo.js';
import { getDb, schema, closePostgres } from '../src/shared/db/postgres.js';
import { closeRedis, getRedis } from '../src/shared/db/redis.js';
import { CacheService } from '../src/shared/cache/cache.service.js';
import { makeScoreService } from '../src/features/score/score.service.js';

const TICK_MS = 2_000;
const USERS_PER_TICK = 50;
const MIN_DELTA = 1;
const MAX_DELTA = 5;

async function main() {
  loadConfig();
  await connectMongo();
  const cache = new CacheService(getRedis(), logger);
  const service = makeScoreService(cache);

  const ids = (await getDb().select({ id: schema.users.id }).from(schema.users).limit(10_000)).map((r) => r.id);
  if (ids.length === 0) { logger.error('no users in postgres — run npm run seed first'); process.exit(1); }
  logger.info({ pool: ids.length }, 'demo-traffic: started; ctrl-c to stop');

  process.on('SIGINT', async () => {
    logger.info('stopping demo-traffic');
    await closeMongo(); await closePostgres(); await closeRedis();
    process.exit(0);
  });

  for (;;) {
    const ops: Promise<void>[] = [];
    for (let i = 0; i < USERS_PER_TICK; i += 1) {
      const userId = ids[Math.floor(Math.random() * ids.length)]!;
      const delta = MIN_DELTA + Math.floor(Math.random() * (MAX_DELTA - MIN_DELTA + 1));
      ops.push(service.submit(userId, delta));
    }
    await Promise.allSettled(ops);
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main().catch((err) => { logger.fatal({ err }, 'demo-traffic failed'); process.exit(1); });
