// backend/src/app.ts
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './shared/lib/logger.js';
import { errorHandler } from './shared/middleware/errorHandler.middleware.js';
import { CacheService } from './shared/cache/cache.service.js';
import { authRoutes } from './features/auth/auth.routes.js';
import { makeScoreRoutes } from './features/score/score.routes.js';
import { makeLeaderboardRoutes } from './features/leaderboard/leaderboard.routes.js';
import { makeMeRoutes } from './features/me/me.routes.js';
import { historyRoutes } from './features/history/history.routes.js';

export interface AppDeps {
  cache: CacheService;
  buildVersion?: string;
}

export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '16kb' }));
  app.use(pinoHttp({ logger }));

  // Health check — never returns 5xx for redis-down (fail-open).
  app.get('/api/v1/healthz', async (_req, res) => {
    const redisUp = await deps.cache.ping();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: deps.buildVersion ?? 'dev',
      redis: redisUp ? 'up' : 'down',
    });
  });

  app.use('/api/v1/auth',        authRoutes);
  app.use('/api/v1/score',       makeScoreRoutes(deps.cache));
  app.use('/api/v1/leaderboard', makeLeaderboardRoutes(deps.cache));
  app.use('/api/v1/me',          makeMeRoutes(deps.cache));
  app.use('/api/v1/history',     historyRoutes);

  app.use(errorHandler);
  return app;
}
