// backend/src/features/payout/payout.service.ts
import { logger } from '../../shared/lib/logger.js';
import { currentWeekId } from '../../shared/lib/weekId.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { scoreRepo } from '../score/score.repo.js';
import { POOL_RATE } from '../score/score.service.js';
import { computePrizes } from './prizes.js';
import { payoutRepo } from './payout.repo.js';

const HISTORY_CAP = 1000;
const PAYOUT_CAP = 100;

export function makePayoutService(cache: CacheService) {
  return {
    /** Run the weekly reset for the closing week. Idempotent; safe to retry. */
    async runReset(closingWeekId: number = currentWeekId() - 1): Promise<{ skipped: boolean; weekId: number }> {
      const acquired = await payoutRepo.acquireWeekLock(closingWeekId);
      if (!acquired) { logger.info({ closingWeekId }, 'payout: another worker holds the lock'); return { skipped: true, weekId: closingWeekId }; }

      try {
        if (await payoutRepo.historyExistsFor(closingWeekId)) {
          logger.info({ closingWeekId }, 'payout: history already written, cleaning up cache only');
          await cache.deleteWeekData(closingWeekId);
          return { skipped: true, weekId: closingWeekId };
        }

        const ranked = await scoreRepo.aggregateTopN(closingWeekId, HISTORY_CAP);
        const earnings = await scoreRepo.weeklyEarningsTotal(closingWeekId);
        const pool = earnings * POOL_RATE;
        const prizes = computePrizes(pool);
        const prizeByRank = new Map(prizes.map((p) => [p.rank, p.amount]));

        const history = ranked.map((r, i) => ({ userId: r.userId, finalRank: i + 1, finalScore: r.total }));
        const payouts = ranked.slice(0, PAYOUT_CAP).map((r, i) => {
          const rank = i + 1;
          return { userId: r.userId, rank, amount: prizeByRank.get(rank) ?? 0 };
        });

        await payoutRepo.writeReset({ weekId: closingWeekId, history, payouts });
        await cache.deleteWeekData(closingWeekId);
        logger.info({ closingWeekId, pool, payouts: payouts.length, history: history.length }, 'payout: reset complete');
        return { skipped: false, weekId: closingWeekId };
      } finally {
        await payoutRepo.releaseWeekLock(closingWeekId);
      }
    },
  };
}
