// backend/src/shared/types/api.types.ts
export interface LbEntry {
  rank: number;
  userId: string;
  displayName: string;
  country?: string;
  score: number;
  isMe?: boolean;
}

export interface HistoryEntry {
  weekId: number;
  finalRank: number;
  finalScore: number;
  prizeAmount: number | null;
}

export interface Distribution {
  topThree: { rank: 1 | 2 | 3; percent: number }[];
  rest:     { fromRank: 4; toRank: 100; totalPercent: 0.55; weighting: 'linear' };
}

export const PRIZE_DISTRIBUTION: Distribution = {
  topThree: [{ rank: 1, percent: 0.20 }, { rank: 2, percent: 0.15 }, { rank: 3, percent: 0.10 }],
  rest:     { fromRank: 4, toRank: 100, totalPercent: 0.55, weighting: 'linear' },
};
