// backend/src/shared/middleware/rateLimit.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import type { CacheService } from '../cache/cache.service.js';

export function tapRateLimit(cache: CacheService, ttlSec: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json({ error: 'unauthorized', message: 'auth required' }); return; }
    if (ttlSec <= 0) { next(); return; }
    const allowed = await cache.acquireRateLimit(userId, ttlSec);
    // null = Redis down → fail-open, allow through. The brief abuse window is acceptable.
    if (allowed === false) { res.status(429).json({ error: 'rate_limited', message: 'slow down' }); return; }
    next();
  };
}
