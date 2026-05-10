import { describe, expect, test } from 'vitest';
import { formatScore, formatPrize, formatDuration, formatRank, formatWeekRange } from './format';

describe('formatScore', () => {
  test('formats with thousands separators', () => {
    expect(formatScore(1234)).toBe('1,234');
    expect(formatScore(1_234_567)).toBe('1,234,567');
    expect(formatScore(0)).toBe('0');
  });
});

describe('formatPrize', () => {
  test('two decimal places with thousands separators and currency-ish prefix', () => {
    expect(formatPrize(1234.5)).toBe('1,234.50');
    expect(formatPrize(0)).toBe('0.00');
    expect(formatPrize(100.123)).toBe('100.12');
  });
});

describe('formatDuration', () => {
  test('renders d hh:mm:ss for >= 1 day', () => {
    expect(formatDuration(2 * 86_400 + 3 * 3600 + 4 * 60 + 5)).toBe('2d 03:04:05');
  });
  test('renders hh:mm:ss for < 1 day', () => {
    expect(formatDuration(3 * 3600 + 4 * 60 + 5)).toBe('03:04:05');
    expect(formatDuration(0)).toBe('00:00:00');
  });
});

describe('formatRank', () => {
  test('returns "—" for null', () => {
    expect(formatRank(null)).toBe('—');
  });
  test('uses ordinal suffix for 1, 2, 3, 4', () => {
    expect(formatRank(1)).toBe('1st');
    expect(formatRank(2)).toBe('2nd');
    expect(formatRank(3)).toBe('3rd');
    expect(formatRank(4)).toBe('4th');
    expect(formatRank(11)).toBe('11th');
    expect(formatRank(21)).toBe('21st');
    expect(formatRank(101)).toBe('101st');
  });
});

describe('formatWeekRange', () => {
  test('weekId 0 = 1970-01-05 → 1970-01-11', () => {
    expect(formatWeekRange(0)).toBe('Jan 5 – Jan 11, 1970');
  });
});
