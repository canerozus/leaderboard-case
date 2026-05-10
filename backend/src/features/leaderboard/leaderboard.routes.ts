// backend/src/features/leaderboard/leaderboard.routes.ts
import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makeLeaderboardController } from './leaderboard.controller.js';

export function makeLeaderboardRoutes(cache: CacheService): Router {
  const router = Router();
  const ctrl = makeLeaderboardController(cache);
  router.get('/top',   requireAuth, ctrl.top);
  router.get('/me',    requireAuth, ctrl.me);
  router.get('/state', requireAuth, ctrl.state);
  return router;
}
