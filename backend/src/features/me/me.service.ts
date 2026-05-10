// backend/src/features/me/me.service.ts
import { authRepo } from '../auth/auth.repo.js';
import { currentWeekId } from '../../shared/lib/weekId.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { scoreRepo } from '../score/score.repo.js';

export function makeMeService(cache: CacheService) {
  return {
    async get(userId: string) {
      const user = await authRepo.findById(userId);
      if (!user) throw new Error('user_not_found');
      const weekId = currentWeekId();
      const cached = await cache.getRankAndScore(userId, weekId);
      const score = cached?.score ?? await scoreRepo.weeklyTotal(userId, weekId);
      const rank = cached?.rank !== undefined && cached?.rank !== null ? cached.rank + 1 : null;
      return {
        user: { id: user.id, username: user.username, displayName: user.displayName, country: user.country ?? undefined },
        weekly: { score, rank },
      };
    },
  };
}
