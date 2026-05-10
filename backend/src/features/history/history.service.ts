// backend/src/features/history/history.service.ts
import { historyRepo } from './history.repo.js';

export const historyService = {
  list: (userId: string, limit: number) => historyRepo.forUser(userId, Math.min(Math.max(limit, 1), 50)),
};
