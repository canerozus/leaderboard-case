// backend/src/shared/lib/logger.ts
import pino from 'pino';
import { loadConfig } from '../../config.js';

export const logger = pino({
  level: loadConfig().LOG_LEVEL,
  base: { service: 'leaderboard-case' },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
