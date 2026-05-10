// backend/src/features/score/score.repo.ts
import { ScoreModel } from './score.model.js';

export interface RankedEntry { userId: string; total: number }

export const scoreRepo = {
  /** Hot path. Upserts the (userId, day) bucket and increments the running total. */
  async upsertBucket(input: { userId: string; day: string; weekId: number; delta: number; now: Date }): Promise<void> {
    await ScoreModel.updateOne(
      { userId: input.userId, day: input.day },
      {
        $inc:         { total: input.delta, count: 1 },
        $setOnInsert: { weekId: input.weekId, firstAt: input.now },
        $set:         { lastAt: input.now },
      },
      { upsert: true }
    );
  },

  /** Top N by weekly total, descending. Reads all daily buckets for the week. */
  async aggregateTopN(weekId: number, n: number): Promise<RankedEntry[]> {
    const rows = await ScoreModel.aggregate<{ _id: string; total: number }>([
      { $match: { weekId } },
      { $group: { _id: '$userId', total: { $sum: '$total' } } },
      { $sort:  { total: -1 } },
      { $limit: n },
    ]);
    return rows.map((r) => ({ userId: r._id, total: r.total }));
  },

  /** Single user's weekly total. */
  async weeklyTotal(userId: string, weekId: number): Promise<number> {
    const rows = await ScoreModel.aggregate<{ total: number }>([
      { $match: { userId, weekId } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    return rows[0]?.total ?? 0;
  },

  /** Number of users with a strictly greater weekly total. rank = above + 1. */
  async countAbove(weekId: number, myTotal: number): Promise<number> {
    if (myTotal <= 0) {
      const rows = await ScoreModel.aggregate<{ count: number }>([
        { $match: { weekId } },
        { $group: { _id: '$userId' } },
        { $count: 'count' },
      ]);
      return rows[0]?.count ?? 0;
    }
    const rows = await ScoreModel.aggregate<{ above: number }>([
      { $match: { weekId } },
      { $group: { _id: '$userId', total: { $sum: '$total' } } },
      { $match: { total: { $gt: myTotal } } },
      { $count: 'above' },
    ]);
    return rows[0]?.above ?? 0;
  },

  /** Total earnings across all users for the week (used to compute the prize pool). */
  async weeklyEarningsTotal(weekId: number): Promise<number> {
    const rows = await ScoreModel.aggregate<{ total: number }>([
      { $match: { weekId } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    return rows[0]?.total ?? 0;
  },

  /** Window of users around a given rank (used for /me neighbors fallback). */
  async neighborsFromMongo(weekId: number, fromRank: number, toRank: number): Promise<RankedEntry[]> {
    const rows = await ScoreModel.aggregate<{ _id: string; total: number }>([
      { $match: { weekId } },
      { $group: { _id: '$userId', total: { $sum: '$total' } } },
      { $sort:  { total: -1 } },
      { $skip:  fromRank },
      { $limit: toRank - fromRank + 1 },
    ]);
    return rows.map((r) => ({ userId: r._id, total: r.total }));
  },
};
