// backend/src/features/me/me.routes.ts
import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware.js';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makeMeController } from './me.controller.js';

export function makeMeRoutes(cache: CacheService): Router {
  const router = Router();
  const ctrl = makeMeController(cache);
  router.get('/', requireAuth, ctrl.get);
  return router;
}
