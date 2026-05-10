import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LeaderboardRow } from './LeaderboardRow';
import type { LbEntry } from '@/shared/types/api.types';

const ROW_HEIGHT = 56;

export interface LeaderboardListProps {
  entries: LbEntry[];
  hasNeighbors: boolean;
}

export function LeaderboardList({ entries, hasNeighbors }: LeaderboardListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const flashSet = useRankFlashSet(entries);

  const rows = useMemo(() => {
    const out: ({ kind: 'row'; entry: LbEntry } | { kind: 'divider' })[] = [];
    let dividerInserted = false;
    for (const e of entries) {
      if (hasNeighbors && !dividerInserted && e.rank > 100) {
        out.push({ kind: 'divider' });
        dividerInserted = true;
      }
      out.push({ kind: 'row', entry: e });
    }
    return out;
  }, [entries, hasNeighbors]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  return (
    <div ref={parentRef} className="relative h-full overflow-auto rounded-2xl bg-canvas-100 ring-1 ring-white/5 shadow-elevate">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index]!;
          const top = `${vi.start}px`;
          if (row.kind === 'divider') {
            return (
              <div key="divider" style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT }}
                className="px-4 py-3 text-xs uppercase tracking-widest text-zinc-500 border-y border-dashed border-white/10 bg-canvas-200/40">
                You and your neighbors
              </div>
            );
          }
          return (
            <LeaderboardRow
              key={row.entry.userId}
              entry={row.entry}
              flash={flashSet.has(row.entry.userId)}
              style={{ position: 'absolute', top, left: 0, right: 0 }}
            />
          );
        })}
      </div>
    </div>
  );
}

function useRankFlashSet(entries: LbEntry[]): Set<string> {
  const lastRanks = useRef<Map<string, number>>(new Map());
  const [flash, setFlash] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next: Map<string, number> = new Map();
    const changed = new Set<string>();
    for (const e of entries) {
      next.set(e.userId, e.rank);
      const prev = lastRanks.current.get(e.userId);
      if (prev !== undefined && prev !== e.rank) changed.add(e.userId);
    }
    lastRanks.current = next;
    if (changed.size === 0) return;
    // The setState here is intentional: this is a transient visual effect
    // (a 1.2 s flash on rank-change) driven by an external timer. The
    // react-hooks/set-state-in-effect rule is too strict for this pattern —
    // there's no external system to sync to other than the timer itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlash(changed);
    const id = setTimeout(() => setFlash(new Set()), 1200);
    return () => clearTimeout(id);
  }, [entries]);

  return flash;
}

export { ROW_HEIGHT };
