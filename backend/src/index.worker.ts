// backend/src/index.worker.ts
import { loadConfig } from './config.js';
import { logger } from './shared/lib/logger.js';
import { connectMongo, closeMongo } from './shared/db/mongo.js';
import { closePostgres, getPool } from './shared/db/postgres.js';
import { closeRedis, getRedis } from './shared/db/redis.js';
import { CacheService } from './shared/cache/cache.service.js';
import { registerPayoutCron } from './features/payout/payout.cron.js';

async function main() {
  loadConfig();
  await connectMongo();
  await getPool().query('SELECT 1');
  const cache = new CacheService(getRedis(), logger);
  const task = registerPayoutCron(cache);
  task.start();
  logger.info('worker started, payout cron registered');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down');
    task.stop();
    await closeMongo();
    await closePostgres();
    await closeRedis();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

main().catch((err) => { logger.fatal({ err }, 'worker boot failed'); process.exit(1); });
