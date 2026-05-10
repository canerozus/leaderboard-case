// backend/tests/integration/score-flow.test.ts
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
  _resetConfig();

  // Late imports so config is loaded with test env.
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
    username: 'tester1', password: 'password123', displayName: 'Tester',
  });
  token = reg.body.token;
}, 90_000);

afterAll(async () => {
  const { closeMongo }    = await import('../../src/shared/db/mongo.js');
  const { closePostgres } = await import('../../src/shared/db/postgres.js');
  const { closeRedis }    = await import('../../src/shared/db/redis.js');
  await closeMongo(); await closePostgres(); await closeRedis();
  await stack.stop();
});

describe('score flow', () => {
  test('submit + me + top together', async () => {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((r) => setTimeout(r, 1100));
      const res = await request(app).post('/api/v1/score/submit')
        .set('Authorization', `Bearer ${token}`).send({ delta: 10 });
      expect(res.status).toBe(204);
    }

    const me = await request(app).get('/api/v1/leaderboard/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.score).toBe(50);
    expect(me.body.rank).toBe(1);
    expect(me.body.inTop100).toBe(true);

    const top = await request(app).get('/api/v1/leaderboard/top').set('Authorization', `Bearer ${token}`);
    expect(top.status).toBe(200);
    expect(top.body.entries[0].userId).toBeDefined();
    expect(top.body.entries[0].score).toBe(50);
    expect(top.body.entries[0].rank).toBe(1);

    const state = await request(app).get('/api/v1/leaderboard/state').set('Authorization', `Bearer ${token}`);
    expect(state.body.prizePool).toBeCloseTo(50 * 0.02, 5);
  });
});
