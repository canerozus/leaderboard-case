// backend/src/shared/cache/cache.service.test.ts
import { describe, test, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import { CacheService } from './cache.service.js';

const ALWAYS_THROW: any = new Proxy({}, {
  get: () => () => Promise.reject(new Error('redis down')),
});

const silentLogger: any = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), fatal: vi.fn(), trace: vi.fn() };

function makeCache(): CacheService {
  return new CacheService(ALWAYS_THROW as Redis, silentLogger);
}

describe('CacheService — fail-open contract: every method returns null on Redis failure', () => {
  test('getTopHundred', async () => { expect(await makeCache().getTopHundred(1)).toBeNull(); });
  test('incrementScore', async () => { expect(await makeCache().incrementScore('u', 1, 1)).toBeNull(); });
  test('incrementPrizePool', async () => { expect(await makeCache().incrementPrizePool(1, 1)).toBeNull(); });
  test('getRankAndScore', async () => { expect(await makeCache().getRankAndScore('u', 1)).toBeNull(); });
  test('getNeighbors', async () => { expect(await makeCache().getNeighbors('u', 1, 200)).toBeNull(); });
  test('getPrizePool', async () => { expect(await makeCache().getPrizePool(1)).toBeNull(); });
  test('setPrizePool', async () => { expect(await makeCache().setPrizePool(1, 100)).toBeNull(); });
  test('warmTopJson', async () => { expect(await makeCache().warmTopJson(1, [])).toBeNull(); });
  test('deleteWeekData', async () => { expect(await makeCache().deleteWeekData(1)).toBeNull(); });
  test('acquireRateLimit', async () => { expect(await makeCache().acquireRateLimit('u', 1)).toBeNull(); });
  test('acquireRehydrateLock', async () => { expect(await makeCache().acquireRehydrateLock(1, 30)).toBeNull(); });
  test('releaseRehydrateLock', async () => { expect(await makeCache().releaseRehydrateLock(1)).toBeNull(); });
  test('bulkZAdd', async () => { expect(await makeCache().bulkZAdd('lb:1', [{ userId: 'u', score: 1 }])).toBeNull(); });
  test('ping returns false (does not throw)', async () => { expect(await makeCache().ping()).toBe(false); });
});

import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll } from 'vitest';
import IORedis from 'ioredis';

describe('CacheService — happy path against a real Redis', () => {
  let redisContainer: StartedTestContainer;
  let redis: IORedis;
  let cache: CacheService;

  beforeAll(async () => {
    redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redis = new IORedis({ host: redisContainer.getHost(), port: redisContainer.getMappedPort(6379), maxRetriesPerRequest: 1 });
    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
    cache = new CacheService(redis, silentLogger);
  });

  afterAll(async () => {
    redis.disconnect();
    await redisContainer.stop();
  });

  test('incrementScore + getRankAndScore round-trip', async () => {
    await cache.incrementScore('u1', 100, 50);
    const r = await cache.getRankAndScore('u1', 100);
    expect(r).not.toBeNull();
    expect(r!.rank).toBe(0);
    expect(r!.score).toBe(50);
  });

  test('acquireRateLimit returns true once, false within TTL', async () => {
    const a = await cache.acquireRateLimit('u-rl', 2);
    const b = await cache.acquireRateLimit('u-rl', 2);
    expect(a).toBe(true);
    expect(b).toBe(false);
  });
});
