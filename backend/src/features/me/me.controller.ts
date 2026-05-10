// backend/src/features/me/me.controller.ts
import type { Request, Response } from 'express';
import type { CacheService } from '../../shared/cache/cache.service.js';
import { makeMeService } from './me.service.js';

export function makeMeController(cache: CacheService) {
  const service = makeMeService(cache);
  return {
    async get(req: Request, res: Response) {
      try { res.json(await service.get(req.userId!)); }
      catch (err) {
        if ((err as Error).message === 'user_not_found') { res.status(404).json({ error: 'user_not_found', message: 'user not found' }); return; }
        throw err;
      }
    },
  };
}
