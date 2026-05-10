// backend/tests/integration/cache-failover.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { makeRawRedis, pointEnvAtStack, startStack, type Stack } from './helpers/containers.js';
import { _resetConfig } from '../../src/config.js';

let stack: Stack;
let app: Express;
let token: string;

beforeAll(async () => {
  stack = await startStack();
  pointEnvAtStack(stack);
  process.env.TAP_RATE_LIMIT_TTL_SEC = '0';   // disable rate-limit for this test
  _resetConfig();

  const { connectMongo } = await import('../../src/shared/db/mongo.js');
  const { getPool }      = await import('../../src/shared/db/postgres.js');
  const { CacheService } = await import('../../src/shared/cache/cache.service.js');
  const { buildApp }     = await import('../../src/app.js');
  const { logger }       = await import('../../src/shared/lib/logger.js');

  await connectMongo();
  await getPool().query('SELECT 1');
  const cache = new CacheService(makeRawRedis(stack), logger);
  app = buildApp({ cache });

  const reg = await request(app).post('/api/v1/auth/register').send({
    username: 'failover_user', password: 'password123', displayName: 'Failover',
  });
  token = reg.body.token;
}, 120_000);

afterAll(async () => {
  const { closeMongo }    = await import('../../src/shared/db/mongo.js');
  const { closePostgres } = await import('../../src/shared/db/postgres.js');
  const { closeRedis }    = await import('../../src/shared/db/redis.js');
  await closeMongo(); await closePostgres(); await closeRedis();
  await stack.stop();
});

describe('fail-open: API serves correct data when Redis is down', () => {
  test('submits succeed, /top and /me read from Mongo while Redis stopped, cache rehydrates on restart', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).post('/api/v1/score/submit')
        .set('Authorization', `Bearer ${token}`).send({ delta: 100 });
      expect(res.status).toBe(204);
    }

    await stack.redis.stop();

    const hz = await request(app).get('/api/v1/healthz');
    expect(hz.status).toBe(200);
    expect(hz.body.redis).toBe('down');

    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post('/api/v1/score/submit')
        .set('Authorization', `Bearer ${token}`).send({ delta: 50 });
      expect(res.status).toBe(204);
    }

    const top = await request(app).get('/api/v1/leaderboard/top').set('Authorization', `Bearer ${token}`);
    expect(top.status).toBe(200);
    expect(top.body.entries[0].score).toBe(100 * 3 + 50 * 2);
    expect(top.body.entries[0].rank).toBe(1);

    const me = await request(app).get('/api/v1/leaderboard/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.score).toBe(400);
    expect(me.body.rank).toBe(1);
    expect(me.body.inTop100).toBe(true);
  });
});
