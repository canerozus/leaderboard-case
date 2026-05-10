// backend/src/features/auth/auth.routes.ts
import { Router } from 'express';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makeAuthController } from './auth.controller.js';

export function makeAuthRoutes(cache: CacheService): Router {
  const router = Router();
  const ctrl = makeAuthController(cache);
  router.post('/register', ctrl.register);
  router.post('/login',    ctrl.login);
  return router;
}
