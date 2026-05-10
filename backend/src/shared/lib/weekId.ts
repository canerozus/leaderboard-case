// backend/src/shared/lib/weekId.ts
const EPOCH_MS = Date.UTC(1970, 0, 5);
const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;

export function currentWeekId(now: number = Date.now()): number {
  return Math.floor((now - EPOCH_MS) / WEEK_MS);
}

export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
