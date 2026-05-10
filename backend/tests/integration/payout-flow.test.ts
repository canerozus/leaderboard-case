// backend/tests/integration/payout-flow.test.ts
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { makeRawRedis, pointEnvAtStack, startStack, type Stack } from './helpers/containers.js';
import { _resetConfig } from '../../src/config.js';

let stack: Stack;

beforeAll(async () => { stack = await startStack(); pointEnvAtStack(stack); _resetConfig(); }, 90_000);
afterAll(async () => { await stack.stop(); });

describe('payout flow', () => {
  test('seeds 5 users, runs reset, asserts payouts', async () => {
    const { connectMongo, closeMongo }   = await import('../../src/shared/db/mongo.js');
    const { getDb, schema, closePostgres } = await import('../../src/shared/db/postgres.js');
    const { closeRedis }                 = await import('../../src/shared/db/redis.js');
    const { CacheService }               = await import('../../src/shared/cache/cache.service.js');
    const { logger }                     = await import('../../src/shared/lib/logger.js');
    const { ScoreModel }                 = await import('../../src/features/score/score.model.js');
    const { makePayoutService }          = await import('../../src/features/payout/payout.service.js');

    await connectMongo();

    const users = await getDb().insert(schema.users).values([
      { username: 'p1', passwordHash: 'x', displayName: 'P1' },
      { username: 'p2', passwordHash: 'x', displayName: 'P2' },
      { username: 'p3', passwordHash: 'x', displayName: 'P3' },
      { username: 'p4', passwordHash: 'x', displayName: 'P4' },
      { username: 'p5', passwordHash: 'x', displayName: 'P5' },
    ]).returning();

    const closingWeek = 100;
    const totals = [1000, 800, 600, 400, 200];
    const day = '2026-01-05';

    for (let i = 0; i < users.length; i += 1) {
      await ScoreModel.create({
        userId: users[i]!.id, day, weekId: closingWeek,
        total: totals[i], count: totals[i], firstAt: new Date(), lastAt: new Date(),
      });
    }

    const cache = new CacheService(makeRawRedis(stack), logger);
    const result = await makePayoutService(cache).runReset(closingWeek);
    expect(result.skipped).toBe(false);

    const { eq } = await import('drizzle-orm');

    const history = await getDb().select().from(schema.weeklyHistory)
      .where(eq(schema.weeklyHistory.weekId, closingWeek))
      .orderBy(schema.weeklyHistory.finalRank);
    expect(history).toHaveLength(5);
    expect(history[0]!.userId).toBe(users[0]!.id);
    expect(history[0]!.finalScore).toBe(1000);

    // Pool = sum(totals) * 0.02 = 3000 * 0.02 = 60
    // 1st place gets 12 (20%), 2nd 9 (15%), 3rd 6 (10%); ranks 4–5 split 33 with weights 97 + 96
    const payouts = await getDb().select().from(schema.payouts)
      .where(eq(schema.payouts.weekId, closingWeek))
      .orderBy(schema.payouts.rank);
    expect(payouts).toHaveLength(5);
    expect(Number(payouts[0]!.amount)).toBeCloseTo(12, 2);
    expect(Number(payouts[1]!.amount)).toBeCloseTo(9, 2);
    expect(Number(payouts[2]!.amount)).toBeCloseTo(6, 2);

    const second = await makePayoutService(cache).runReset(closingWeek);
    expect(second.skipped).toBe(true);

    await closeMongo(); await closePostgres(); await closeRedis();
  });
});
