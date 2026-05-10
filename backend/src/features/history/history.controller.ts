// backend/src/features/history/history.controller.ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { historyService } from './history.service.js';

const QuerySchema = z.object({ limit: z.coerce.number().int().positive().max(50).default(10) });

export const historyController = {
  async list(req: Request, res: Response) {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_input', message: parsed.error.message }); return; }
    res.json({ entries: await historyService.list(req.userId!, parsed.data.limit) });
  },
};
