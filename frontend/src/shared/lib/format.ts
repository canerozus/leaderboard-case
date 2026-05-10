export function formatScore(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatPrize(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const tail = `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return days > 0 ? `${days}d ${tail}` : tail;
}

export function formatRank(rank: number | null): string {
  if (rank === null) return '—';
  const last2 = rank % 100;
  if (last2 >= 11 && last2 <= 13) return `${rank}th`;
  switch (rank % 10) {
    case 1:  return `${rank}st`;
    case 2:  return `${rank}nd`;
    case 3:  return `${rank}rd`;
    default: return `${rank}th`;
  }
}

const EPOCH_MS = Date.UTC(1970, 0, 5);
const WEEK_MS  = 7 * 24 * 60 * 60 * 1000;

export function formatWeekRange(weekId: number): string {
  const start = new Date(EPOCH_MS + weekId * WEEK_MS);
  const end   = new Date(EPOCH_MS + weekId * WEEK_MS + 6 * 86_400_000);
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const yr  = start.getUTCFullYear();
  return `${fmt.format(start)} – ${fmt.format(end)}, ${yr}`;
}
