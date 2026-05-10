// backend/src/shared/lib/weekId.test.ts
import { describe, test, expect } from 'vitest';
import { currentWeekId, dayKey } from './weekId.js';

describe('currentWeekId', () => {
  test('1970-01-05 00:00 UTC = week 0', () => {
    expect(currentWeekId(Date.UTC(1970, 0, 5))).toBe(0);
  });
  test('1970-01-12 00:00 UTC = week 1', () => {
    expect(currentWeekId(Date.UTC(1970, 0, 12))).toBe(1);
  });
  test('one millisecond before week boundary still belongs to previous week', () => {
    expect(currentWeekId(Date.UTC(1970, 0, 12) - 1)).toBe(0);
  });
  test('aligns to Monday 00:00 UTC', () => {
    const monday = Date.UTC(2026, 4, 4);
    expect(currentWeekId(monday)).toBe(currentWeekId(monday + 6 * 86_400_000));
    expect(currentWeekId(monday)).not.toBe(currentWeekId(monday + 7 * 86_400_000));
  });
});

describe('dayKey', () => {
  test('formats UTC midnight as YYYY-MM-DD', () => {
    expect(dayKey(new Date(Date.UTC(2026, 4, 9)))).toBe('2026-05-09');
  });
  test('uses UTC, not local time', () => {
    expect(dayKey(new Date(Date.UTC(2026, 4, 9, 23, 30)))).toBe('2026-05-09');
  });
});
