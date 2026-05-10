import { ChevronUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { formatRank, formatScore } from '@/shared/lib/format';

export interface SelfBandProps {
  rank: number;
  score: number;
  visible: boolean;
  onJumpToMe: () => void;
}

export function SelfBand({ rank, score, visible, onJumpToMe }: SelfBandProps) {
  return (
    <button
      type="button"
      onClick={onJumpToMe}
      className={cn(
        'sticky bottom-4 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-3 rounded-full',
        'bg-accent-500 text-canvas-100 font-semibold px-4 py-2 shadow-glow',
        'transition-opacity duration-300',
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      aria-label="jump to my row"
    >
      <ChevronUp size={16} />
      <span className="tabular">You: {formatRank(rank)}</span>
      <span className="text-canvas-100/70 font-mono">{formatScore(score)}</span>
    </button>
  );
}
