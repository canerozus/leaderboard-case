import { TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Skeleton } from '@/shared/components/Skeleton';
import { cn } from '@/shared/lib/cn';
import { formatRank, formatScore } from '@/shared/lib/format';
import { useTapToEarn } from '../hooks/useTapToEarn';
import { useMe, useMeProfile } from '../hooks/useLeaderboard';
import { useLeaderboardStore } from '../store/leaderboardStore';

export function HeroCard() {
  const me      = useMe();
  const profile = useMeProfile();
  const tap     = useTapToEarn();
  const pendingDelta = useLeaderboardStore((s) => s.pendingDelta);

  if (me.isLoading || profile.isLoading) return <HeroCardSkeleton />;

  const baseScore = me.data?.score ?? 0;
  const score = baseScore + pendingDelta;
  const rank  = me.data?.rank ?? null;
  const inTop100 = me.data?.inTop100 ?? false;

  return (
    <section
      className={cn(
        'rounded-2xl bg-gradient-to-br from-canvas-100 to-canvas-200 p-6 shadow-elevate ring-1 ring-white/5',
        inTop100 && 'ring-accent-500/30',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm uppercase tracking-widest text-zinc-400">Your standing</h2>
        {inTop100 && (
          <span className="text-xs font-semibold text-accent-400 inline-flex items-center gap-1">
            <TrendingUp size={14} /> Top 100
          </span>
        )}
      </div>

      <div className="flex flex-col items-center sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-5 sm:mb-4">
        <span className="text-5xl font-display font-semibold tabular text-zinc-100">{formatRank(rank)}</span>
        <span className="text-zinc-500">{profile.data?.user.displayName}</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-center sm:text-left">
          <div className="text-xs uppercase tracking-widest text-zinc-500 mb-0.5">Weekly score</div>
          <div className="text-2xl font-mono tabular text-accent-400">{formatScore(score)}</div>
        </div>

        <Button
          variant="tap"
          size="lg"
          onClick={() => tap.mutate()}
          disabled={tap.isPending}
          aria-label="tap to earn"
          className="w-full sm:w-auto"
        >
          <Zap size={18} /> Tap to earn
        </Button>
      </div>
    </section>
  );
}

function HeroCardSkeleton() {
  return (
    <section className="rounded-2xl bg-canvas-100 p-6 shadow-elevate ring-1 ring-white/5">
      <Skeleton className="h-3 w-24 mb-4" />
      <Skeleton className="h-12 w-32 mb-6" />
      <div className="flex justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-12 w-36" />
      </div>
    </section>
  );
}
