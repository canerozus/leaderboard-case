// backend/src/features/score/score.routes.ts
import { Router } from 'express';
import { loadConfig } from '../../config.js';
import { requireAuth } from '../../shared/middleware/auth.middleware.js';
import { tapRateLimit } from '../../shared/middleware/rateLimit.middleware.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makeScoreController } from './score.controller.js';

export function makeScoreRoutes(cache: CacheService): Router {
  const router = Router();
  const ctrl = makeScoreController(cache);
  router.post('/submit', requireAuth, tapRateLimit(cache, loadConfig().TAP_RATE_LIMIT_TTL_SEC), ctrl.submit);
  return router;
}
