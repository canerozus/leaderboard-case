import { useEffect, useMemo, useRef, useState } from 'react';
import { History as HistoryIcon, Info, LogOut, Trophy } from 'lucide-react';
import { useTop, useMe, useLbState } from '../hooks/useLeaderboard';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Button } from '@/shared/components/Button';
import { Skeleton } from '@/shared/components/Skeleton';
import { Spinner } from '@/shared/components/Spinner';
import { HeroCard } from '../components/HeroCard';
import { LeaderboardList, ROW_HEIGHT } from '../components/LeaderboardList';
import { Podium } from '../components/Podium';
import { PrizePoolTicker } from '../components/PrizePoolTicker';
import { Countdown } from '../components/Countdown';
import { RewardsModal } from '../components/RewardsModal';
import { SelfBand } from '../components/SelfBand';
import { HistoryDrawer } from '@/features/history/components/HistoryDrawer';
import type { LbEntry } from '@/shared/types/api.types';

export function LeaderboardPage() {
  const top   = useTop();
  const me    = useMe();
  const state = useLbState();
  const logout = useAuthStore((s) => s.logout);

  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selfBandVisible, setSelfBandVisible] = useState(false);
  const meRowAnchor = useRef<HTMLDivElement>(null);

  const myUserId = useAuthStore((s) => s.user?.id);

  const entries: LbEntry[] = useMemo(() => {
    if (!top.data) return [];
    const baseEntries = top.data.entries.map((e) => ({ ...e, isMe: myUserId !== undefined && e.userId === myUserId }));
    if (!me.data || me.data.inTop100) return baseEntries;
    if (me.data.rank === null) return baseEntries;
    return [...baseEntries, ...me.data.neighbors];
  }, [top.data, me.data, myUserId]);

  useEffect(() => {
    if (!me.data?.inTop100 || me.data.rank === null) { setSelfBandVisible(false); return; }
    setSelfBandVisible(me.data.rank > 8);
  }, [me.data]);

  if (top.isLoading || me.isLoading || state.isLoading) {
    return (
      <div className="min-h-screen bg-canvas-50 bg-grid p-4 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-44" />
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-50 bg-grid">
      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="text-accent-400" />
            <h1 className="text-lg font-display font-semibold tracking-tight">Weekly leaderboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {state.data && <Countdown secondsUntilReset={state.data.secondsUntilReset} />}
            {state.data && <PrizePoolTicker value={state.data.prizePool} />}
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} aria-label="history">
              <HistoryIcon size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRewardsOpen(true)} aria-label="rewards info">
              <Info size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={logout} aria-label="log out">
              <LogOut size={14} />
            </Button>
          </div>
        </header>

        <HeroCard />

        <div ref={meRowAnchor} />

        {top.data && top.data.entries.length >= 3 && (
          <Podium top3={top.data.entries.slice(0, 3)} />
        )}

        <div className="h-[60vh] sm:h-[64vh] lg:h-[640px]" style={{ minHeight: 12 * ROW_HEIGHT }}>
          <LeaderboardList entries={entries} hasNeighbors={!me.data?.inTop100 && (me.data?.neighbors.length ?? 0) > 0} />
        </div>

        {top.isFetching || me.isFetching ? (
          <div className="text-xs text-zinc-500 inline-flex items-center gap-2"><Spinner size={12} /> updating…</div>
        ) : null}
      </div>

      {state.data && (
        <RewardsModal
          open={rewardsOpen}
          onClose={() => setRewardsOpen(false)}
          prizePool={state.data.prizePool}
          distribution={state.data.distribution}
        />
      )}

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />

      {selfBandVisible && me.data?.rank && (
        <SelfBand
          rank={me.data.rank}
          score={me.data.score}
          visible={selfBandVisible}
          onJumpToMe={() => meRowAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}
    </div>
  );
}
