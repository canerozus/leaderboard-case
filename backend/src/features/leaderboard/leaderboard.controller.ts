// backend/src/features/leaderboard/leaderboard.controller.ts
import type { Request, Response } from 'express';
import { currentWeekId } from '../../shared/lib/weekId.js';
import { PRIZE_DISTRIBUTION } from '../../shared/types/api.types.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { scoreRepo } from '../score/score.repo.js';
import { POOL_RATE } from '../score/score.service.js';
import { makeLeaderboardService, secondsUntilNextWeekBoundary } from './leaderboard.service.js';

export function makeLeaderboardController(cache: CacheService) {
  const service = makeLeaderboardService(cache);
  return {
    async top(_req: Request, res: Response) {
      res.json(await service.getTop());
    },
    async me(req: Request, res: Response) {
      res.json(await service.getMe(req.userId!));
    },
    async state(_req: Request, res: Response) {
      const weekId = currentWeekId();
      const cached = await cache.getPrizePool(weekId);
      const prizePool = cached !== null
        ? cached
        : (await scoreRepo.weeklyEarningsTotal(weekId)) * POOL_RATE;
      res.json({
        weekId,
        prizePool,
        secondsUntilReset: secondsUntilNextWeekBoundary(),
        distribution: PRIZE_DISTRIBUTION,
      });
    },
  };
}
