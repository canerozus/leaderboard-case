// backend/src/shared/middleware/auth.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { loadConfig } from '../../config.js';
import { verifyToken } from '../lib/jwt.js';

declare global {
  namespace Express { interface Request { userId?: string } }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) { res.status(401).json({ error: 'unauthorized', message: 'missing bearer token' }); return; }
  try {
    const decoded = verifyToken(auth.slice(7), loadConfig().JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'invalid token' });
  }
}
