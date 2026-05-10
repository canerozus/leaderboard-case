import { Modal } from '@/shared/components/Modal';
import { Skeleton } from '@/shared/components/Skeleton';
import { formatPrize, formatRank, formatScore, formatWeekRange } from '@/shared/lib/format';
import { useHistory } from '../hooks/useHistory';

export interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HistoryDrawer({ open, onClose }: HistoryDrawerProps) {
  const history = useHistory(10);

  return (
    <Modal open={open} onClose={onClose} title="Your history">
      {history.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" />
        </div>
      ) : !history.data || history.data.entries.length === 0 ? (
        <p className="text-sm text-zinc-400">No completed weeks yet.</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-xl bg-canvas-200 ring-1 ring-white/5 overflow-hidden">
          {history.data.entries.map((e) => (
            <li key={e.weekId} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm text-zinc-200">{formatWeekRange(e.weekId)}</div>
                <div className="text-xs text-zinc-500 font-mono">{formatRank(e.finalRank)} · {formatScore(e.finalScore)}</div>
              </div>
              {e.prizeAmount !== null && (
                <span className="text-sm font-mono tabular text-accent-400">+{formatPrize(e.prizeAmount)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
