import { describe, expect, test } from 'vitest';
import { computePrizes } from './prizes.js';

describe('computePrizes', () => {
  test('top three: 20%, 15%, 10%', () => {
    const prizes = computePrizes(10_000);
    expect(prizes.find((p) => p.rank === 1)!.amount).toBe(2000);
    expect(prizes.find((p) => p.rank === 2)!.amount).toBe(1500);
    expect(prizes.find((p) => p.rank === 3)!.amount).toBe(1000);
  });

  test('returns exactly 100 entries', () => {
    expect(computePrizes(10_000)).toHaveLength(100);
  });

  test('ranks 4..100 sum to 55% of pool (within float epsilon)', () => {
    const prizes = computePrizes(10_000);
    const restSum = prizes.filter((p) => p.rank >= 4).reduce((s, p) => s + p.amount, 0);
    expect(restSum).toBeCloseTo(5500, 1);
  });

  test('linear weighting: rank 4 > rank 5 > ... > rank 100', () => {
    const prizes = computePrizes(10_000);
    for (let r = 4; r < 100; r += 1) {
      const a = prizes.find((p) => p.rank === r)!.amount;
      const b = prizes.find((p) => p.rank === r + 1)!.amount;
      expect(a).toBeGreaterThan(b);
    }
  });

  test('rank 100 amount > 0', () => {
    expect(computePrizes(10_000).find((p) => p.rank === 100)!.amount).toBeGreaterThan(0);
  });

  test('rank 4 weight = 97, rank 100 weight = 1: ratio 97x', () => {
    const prizes = computePrizes(10_000);
    const r4   = prizes.find((p) => p.rank === 4)!.amount;
    const r100 = prizes.find((p) => p.rank === 100)!.amount;
    expect(r4 / r100).toBeCloseTo(97, 1);
  });

  test('all 100 amounts sum to 100% of pool', () => {
    const total = computePrizes(10_000).reduce((s, p) => s + p.amount, 0);
    expect(total).toBeCloseTo(10_000, 1);
  });

  test('zero pool yields zeroed entries (no NaN)', () => {
    const prizes = computePrizes(0);
    expect(prizes).toHaveLength(100);
    for (const p of prizes) expect(p.amount).toBe(0);
  });
});
