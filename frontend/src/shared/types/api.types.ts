// Mirrors backend/src/shared/types/api.types.ts. Hand-duplicated per the
// "client and server in separate projects" requirement.

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  country?: string;
}

export interface AuthSuccess {
  user: PublicUser;
  token: string;
}

export interface LbEntry {
  rank: number;
  userId: string;
  displayName: string;
  country?: string;
  score: number;
  isMe?: boolean;
}

export interface MeResponse {
  weekId: number;
  inTop100: boolean;
  rank: number | null;
  score: number;
  neighbors: LbEntry[];
}

export interface TopResponse {
  weekId: number;
  entries: LbEntry[];
}

export interface StateResponse {
  weekId: number;
  prizePool: number;
  secondsUntilReset: number;
  distribution: Distribution;
}

export interface Distribution {
  topThree: { rank: 1 | 2 | 3; percent: number }[];
  rest:     { fromRank: 4; toRank: 100; totalPercent: 0.55; weighting: 'linear' };
}

export interface MeProfileResponse {
  user: PublicUser;
  weekly: { score: number; rank: number | null };
}

export interface HistoryEntry {
  weekId: number;
  finalRank: number;
  finalScore: number;
  prizeAmount: number | null;
}

export interface HistoryResponse {
  entries: HistoryEntry[];
}

export interface ApiError {
  error: string;
  message: string;
}
