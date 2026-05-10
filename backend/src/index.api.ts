// backend/src/index.api.ts
import { loadConfig } from './config.js';
import { logger } from './shared/lib/logger.js';
import { connectMongo, closeMongo } from './shared/db/mongo.js';
import { closePostgres, getPool } from './shared/db/postgres.js';
import { closeRedis, getRedis } from './shared/db/redis.js';
import { CacheService } from './shared/cache/cache.service.js';
import { buildApp } from './app.js';

async function main() {
  const cfg = loadConfig();
  await connectMongo();
  await getPool().query('SELECT 1');
  const cache = new CacheService(getRedis(), logger);
  const app = buildApp({ cache });

  const server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'api listening'));

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'api shutting down');
    server.close();
    await closeMongo();
    await closePostgres();
    await closeRedis();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

main().catch((err) => { logger.fatal({ err }, 'api boot failed'); process.exit(1); });
