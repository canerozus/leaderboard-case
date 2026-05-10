// backend/src/features/history/history.routes.ts
import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.middleware.js';
import { historyController } from './history.controller.js';

export const historyRoutes: Router = Router();
historyRoutes.get('/', requireAuth, historyController.list);
