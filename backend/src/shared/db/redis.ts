// backend/src/shared/db/redis.ts
// IMPORTANT: import this ONLY from CacheService. No feature service may use ioredis directly.
import Redis from 'ioredis';
import { loadConfig } from '../../config.js';
import { logger } from '../lib/logger.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(loadConfig().REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2_000,
    lazyConnect: false,
  });
  client.on('error', (err) => logger.warn({ err }, 'redis client error'));
  return client;
}

export async function closeRedis(): Promise<void> {
  if (!client) return;
  client.disconnect();
  client = null;
}
