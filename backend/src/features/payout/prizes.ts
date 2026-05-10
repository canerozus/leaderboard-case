// backend/src/features/payout/prizes.ts
export interface Prize { rank: number; amount: number }

const TOP_PCT = { 1: 0.20, 2: 0.15, 3: 0.10 } as const;
const REST_TOTAL_PCT = 0.55;
const TOP_RANK = 1;
const BOTTOM_RANK = 100;

export function computePrizes(pool: number): Prize[] {
  const out: Prize[] = [];
  out.push({ rank: 1, amount: pool * TOP_PCT[1] });
  out.push({ rank: 2, amount: pool * TOP_PCT[2] });
  out.push({ rank: 3, amount: pool * TOP_PCT[3] });

  let weightSum = 0;
  for (let r = 4; r <= BOTTOM_RANK; r += 1) weightSum += (101 - r);

  const restPool = pool * REST_TOTAL_PCT;
  for (let r = 4; r <= BOTTOM_RANK; r += 1) {
    const w = 101 - r;
    const amount = weightSum === 0 ? 0 : restPool * (w / weightSum);
    out.push({ rank: r, amount });
  }
  if (out.length !== BOTTOM_RANK - TOP_RANK + 1) throw new Error('prize count invariant violated');
  return out;
}
