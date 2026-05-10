// backend/src/features/payout/payout.repo.ts
import { sql } from 'drizzle-orm';
import { getDb, getPool, schema } from '../../shared/db/postgres.js';

export const payoutRepo = {
  async acquireWeekLock(weekId: number): Promise<boolean> {
    const r = await getPool().query<{ ok: boolean }>(`SELECT pg_try_advisory_lock($1) AS ok`, [weekId]);
    return r.rows[0]?.ok === true;
  },

  async releaseWeekLock(weekId: number): Promise<void> {
    await getPool().query(`SELECT pg_advisory_unlock($1)`, [weekId]);
  },

  async historyExistsFor(weekId: number): Promise<boolean> {
    const r = await getDb().select({ c: sql<number>`count(*)::int` })
      .from(schema.weeklyHistory).where(sql`${schema.weeklyHistory.weekId} = ${weekId}`);
    return (r[0]?.c ?? 0) > 0;
  },

  /** Atomic write of weekly_history (top 1000) and payouts (top 100). */
  async writeReset(input: {
    weekId: number;
    history: Array<{ userId: string; finalRank: number; finalScore: number }>;
    payouts: Array<{ userId: string; rank: number; amount: number }>;
  }): Promise<void> {
    const db = getDb();
    await db.transaction(async (tx) => {
      if (input.history.length > 0) {
        await tx.insert(schema.weeklyHistory).values(
          input.history.map((h) => ({ weekId: input.weekId, userId: h.userId, finalRank: h.finalRank, finalScore: h.finalScore })),
        ).onConflictDoNothing();
      }
      if (input.payouts.length > 0) {
        await tx.insert(schema.payouts).values(
          input.payouts.map((p) => ({ weekId: input.weekId, userId: p.userId, rank: p.rank, amount: String(p.amount) })),
        ).onConflictDoNothing();
      }
    });
  },
};
