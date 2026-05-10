// backend/src/features/score/score.controller.ts
import type { Request, Response } from 'express';
import { SubmitDto } from './score.dto.js';
import { makeScoreService } from './score.service.js';
import type { CacheService } from '../../shared/cache/cache.service.js';

export function makeScoreController(cache: CacheService) {
  const service = makeScoreService(cache);
  return {
    async submit(req: Request, res: Response) {
      const parsed = SubmitDto.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'invalid_input', message: parsed.error.message }); return; }
      await service.submit(req.userId!, parsed.data.delta);
      res.status(204).end();
    },
  };
}
