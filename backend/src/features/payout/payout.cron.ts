// backend/src/features/payout/payout.cron.ts
import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../../shared/lib/logger.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makePayoutService } from './payout.service.js';

/** Mon 00:00:30 UTC — 30s after the week boundary (see DESIGN.md §5.3 for race rationale).
 *  node-cron 6-field syntax: second minute hour day month weekday. */
const SCHEDULE = '30 0 0 * * 1';

export function registerPayoutCron(cache: CacheService): ScheduledTask {
  const service = makePayoutService(cache);
  return cron.schedule(SCHEDULE, async () => {
    try {
      const result = await service.runReset();
      logger.info(result, 'payout: cron tick complete');
    } catch (err) {
      logger.error({ err }, 'payout: cron tick failed');
    }
  }, { timezone: 'UTC' });
}
