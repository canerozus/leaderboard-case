// backend/src/features/history/history.repo.ts
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../../shared/db/postgres.js';
import type { HistoryEntry } from '../../shared/types/api.types.js';

export const historyRepo = {
  async forUser(userId: string, limit: number): Promise<HistoryEntry[]> {
    const rows = await getDb()
      .select({
        weekId:    schema.weeklyHistory.weekId,
        finalRank: schema.weeklyHistory.finalRank,
        finalScore: schema.weeklyHistory.finalScore,
        prizeAmount: schema.payouts.amount,
      })
      .from(schema.weeklyHistory)
      .leftJoin(schema.payouts, and(
        eq(schema.payouts.weekId, schema.weeklyHistory.weekId),
        eq(schema.payouts.userId, schema.weeklyHistory.userId),
      ))
      .where(eq(schema.weeklyHistory.userId, userId))
      .orderBy(desc(schema.weeklyHistory.weekId))
      .limit(limit);
    return rows.map((r) => ({
      weekId: r.weekId,
      finalRank: r.finalRank,
      finalScore: Number(r.finalScore),
      prizeAmount: r.prizeAmount === null ? null : Number(r.prizeAmount),
    }));
  },
};
