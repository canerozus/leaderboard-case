// backend/src/shared/middleware/errorHandler.middleware.ts
import type { ErrorRequestHandler } from 'express';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal', message: 'something went wrong' });
};
