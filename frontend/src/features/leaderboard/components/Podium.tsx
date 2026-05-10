import { Crown, Medal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatScore } from '@/shared/lib/format';
import type { LbEntry } from '@/shared/types/api.types';

const MEDAL_COLOR = ['text-accent-300', 'text-zinc-300', 'text-amber-700'];

export function Podium({ top3 }: { top3: LbEntry[] }) {
  const visual = [top3[1], top3[0], top3[2]];
  const heights = ['h-32', 'h-44', 'h-28'];

  return (
    <div className="grid grid-cols-3 gap-3 px-4 pt-6">
      {visual.map((e, i) => e ? (
        <PodiumPillar key={e.userId} entry={e} pillarHeight={heights[i]!} medalColor={MEDAL_COLOR[e.rank - 1] ?? 'text-zinc-300'} />
      ) : <div key={i} />)}
    </div>
  );
}

function PodiumPillar({ entry, pillarHeight, medalColor }: { entry: LbEntry; pillarHeight: string; medalColor: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn('mb-1', medalColor)}>
        {entry.rank === 1 ? <Crown size={28} /> : <Medal size={22} />}
      </div>
      <div className="text-sm text-zinc-200 truncate max-w-full px-1">{entry.displayName}</div>
      <div className="text-xs text-zinc-400 font-mono tabular">{formatScore(entry.score)}</div>
      <div
        className={cn(
          'mt-2 w-full rounded-t-lg ring-1 ring-white/5',
          pillarHeight,
          entry.rank === 1 && 'bg-gradient-to-b from-accent-500/40 to-canvas-200',
          entry.rank === 2 && 'bg-gradient-to-b from-zinc-400/30 to-canvas-200',
          entry.rank === 3 && 'bg-gradient-to-b from-amber-700/30 to-canvas-200',
        )}
      />
    </div>
  );
}
