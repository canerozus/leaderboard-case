// backend/src/features/leaderboard/leaderboard.dto.ts
import type { Distribution, LbEntry } from '../../shared/types/api.types.js';

export interface TopResponse {
  weekId: number;
  entries: LbEntry[];
}

export interface MeResponse {
  weekId: number;
  inTop100: boolean;
  rank: number | null;
  score: number;
  neighbors: LbEntry[];
}

export interface StateResponse {
  weekId: number;
  prizePool: number;
  secondsUntilReset: number;
  distribution: Distribution;
}
