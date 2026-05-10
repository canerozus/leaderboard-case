// backend/src/features/score/score.service.ts
import { currentWeekId, dayKey } from '../../shared/lib/weekId.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { scoreRepo } from './score.repo.js';

export const POOL_RATE = 0.02;

export function makeScoreService(cache: CacheService) {
  return {
    async submit(userId: string, delta: number): Promise<void> {
      const now = new Date();
      const weekId = currentWeekId(now.getTime());
      const day = dayKey(now);

      await scoreRepo.upsertBucket({ userId, day, weekId, delta, now });

      await cache.incrementScore(userId, weekId, delta);
      await cache.incrementPrizePool(weekId, delta * POOL_RATE);
    },
  };
}
