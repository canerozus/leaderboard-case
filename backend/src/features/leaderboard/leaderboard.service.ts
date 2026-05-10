// backend/src/features/leaderboard/leaderboard.service.ts
import { currentWeekId } from '../../shared/lib/weekId.js';
import { logger } from '../../shared/lib/logger.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { ScoreModel } from '../score/score.model.js';
import { scoreRepo } from '../score/score.repo.js';
import { hydrateRankedEntries } from './profile.lookup.js';
import type { MeResponse, TopResponse } from './leaderboard.dto.js';

const REHYDRATE_LOCK_TTL_SEC = 30;
const REHYDRATE_BATCH = 1000;

export function makeLeaderboardService(cache: CacheService) {
  return {
    async getTop(): Promise<TopResponse> {
      const weekId = currentWeekId();
      const cached = await cache.getTopHundred(weekId);
      if (cached !== null) return { weekId, entries: cached };

      // null = Redis down OR cache cold. Serve from Mongo, kick off rehydration.
      void this.rehydrateWeek(weekId).catch((err) => logger.warn({ err, weekId }, 'rehydrate kick failed'));
      const ranked = await scoreRepo.aggregateTopN(weekId, 100);
      const entries = await hydrateRankedEntries(ranked, 1);
      await cache.warmTopJson(weekId, entries);
      return { weekId, entries };
    },

    async getMe(userId: string): Promise<MeResponse> {
      const weekId = currentWeekId();
      const cacheResult = await cache.getRankAndScore(userId, weekId);

      if (cacheResult !== null && cacheResult.rank !== null) {
        if (cacheResult.rank < 100) {
          return { weekId, inTop100: true, rank: cacheResult.rank + 1, score: cacheResult.score, neighbors: [] };
        }
        const neighbors = await cache.getNeighbors(userId, weekId, cacheResult.rank);
        if (neighbors !== null) {
          return { weekId, inTop100: false, rank: cacheResult.rank + 1, score: cacheResult.score, neighbors };
        }
      }

      // Cache miss / Redis down / partial failure → Mongo path
      void this.rehydrateWeek(weekId).catch((err) => logger.warn({ err, weekId }, 'rehydrate kick failed'));
      return this.computeMeFromMongo(userId, weekId);
    },

    async computeMeFromMongo(userId: string, weekId: number): Promise<MeResponse> {
      const myTotal = await scoreRepo.weeklyTotal(userId, weekId);
      if (myTotal === 0) return { weekId, inTop100: false, rank: null, score: 0, neighbors: [] };

      const above = await scoreRepo.countAbove(weekId, myTotal);
      const rank = above + 1;
      const score = myTotal;

      if (rank <= 100) return { weekId, inTop100: true, rank, score, neighbors: [] };

      // window: 3 above + me + 2 below, but never enter the top-100 region
      const fromRank = Math.max(rank - 3, 101);
      const toRank   = rank + 2;
      const ranked = await scoreRepo.neighborsFromMongo(weekId, fromRank - 1, toRank - 1);
      const neighbors = await hydrateRankedEntries(ranked, fromRank);
      return {
        weekId,
        inTop100: false,
        rank,
        score,
        neighbors: neighbors.map((n) => ({ ...n, isMe: n.userId === userId })),
      };
    },

    async rehydrateWeek(weekId: number): Promise<void> {
      const acquired = await cache.acquireRehydrateLock(weekId, REHYDRATE_LOCK_TTL_SEC);
      if (acquired !== true) return;

      try {
        const cursor = ScoreModel.aggregate<{ _id: string; total: number }>([
          { $match: { weekId } },
          { $group: { _id: '$userId', total: { $sum: '$total' } } },
        ]).cursor({ batchSize: REHYDRATE_BATCH });

        let batch: { userId: string; score: number }[] = [];
        for await (const doc of cursor) {
          batch.push({ userId: doc._id, score: doc.total });
          if (batch.length >= REHYDRATE_BATCH) {
            await cache.bulkZAdd(`lb:${weekId}`, batch);
            batch = [];
          }
        }
        if (batch.length > 0) await cache.bulkZAdd(`lb:${weekId}`, batch);

        const earnings = await scoreRepo.weeklyEarningsTotal(weekId);
        await cache.setPrizePool(weekId, earnings * 0.02);
        logger.info({ weekId }, 'rehydrate complete');
      } finally {
        await cache.releaseRehydrateLock(weekId);
      }
    },
  };
}

export function secondsUntilNextWeekBoundary(now: number = Date.now()): number {
  const EPOCH_MS = Date.UTC(1970, 0, 5);
  const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;
  const next = EPOCH_MS + (Math.floor((now - EPOCH_MS) / WEEK_MS) + 1) * WEEK_MS;
  return Math.max(0, Math.floor((next - now) / 1000));
}
