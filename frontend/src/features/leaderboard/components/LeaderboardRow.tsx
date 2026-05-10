import { memo, type CSSProperties } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatScore } from '@/shared/lib/format';
import type { LbEntry } from '@/shared/types/api.types';

export interface LeaderboardRowProps {
  entry: LbEntry;
  flash?: boolean;
  className?: string;
  style?: CSSProperties;
}

export const LeaderboardRow = memo(function LeaderboardRow({ entry, flash, className, style }: LeaderboardRowProps) {
  return (
    <div
      data-testid="lb-row"
      style={style}
      className={cn(
        'flex items-center gap-4 px-4 py-3 border-b border-white/5 transition',
        entry.isMe && 'bg-you-glow ring-1 ring-inset ring-accent-500/30',
        flash && 'animate-flash',
        className,
      )}
    >
      <div className="w-12 text-right text-zinc-500 font-mono tabular text-sm">{entry.rank}</div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-zinc-100 font-medium">{entry.displayName}</div>
      </div>
      {entry.country && <div className="text-xs text-zinc-500 font-mono">{entry.country}</div>}
      <div className="w-28 text-right font-mono tabular text-zinc-100">{formatScore(entry.score)}</div>
    </div>
  );
});
