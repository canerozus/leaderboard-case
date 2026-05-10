import { Modal } from '@/shared/components/Modal';
import { formatPrize } from '@/shared/lib/format';
import type { Distribution } from '@/shared/types/api.types';

export interface RewardsModalProps {
  open: boolean;
  onClose: () => void;
  prizePool: number;
  distribution: Distribution;
}

export function RewardsModal({ open, onClose, prizePool, distribution }: RewardsModalProps) {
  const restAmount = prizePool * distribution.rest.totalPercent;

  return (
    <Modal open={open} onClose={onClose} title="Weekly rewards">
      <p className="text-sm text-zinc-400 mb-4">
        2% of all earnings this week go to the prize pool. Distributed at the end of the week to the top 100.
      </p>
      <ul className="divide-y divide-white/5 rounded-xl bg-canvas-200 ring-1 ring-white/5 overflow-hidden">
        {distribution.topThree.map((row) => (
          <li key={row.rank} className="flex items-center justify-between px-4 py-3">
            <span className="font-mono tabular text-zinc-300">#{row.rank}</span>
            <span className="text-xs uppercase tracking-widest text-zinc-500">{(row.percent * 100).toFixed(0)}%</span>
            <span className="font-mono tabular text-accent-400">{formatPrize(prizePool * row.percent)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between px-4 py-3">
          <span className="font-mono tabular text-zinc-300">#4 – #100</span>
          <span className="text-xs uppercase tracking-widest text-zinc-500">
            {(distribution.rest.totalPercent * 100).toFixed(0)}% (linear)
          </span>
          <span className="font-mono tabular text-accent-400">{formatPrize(restAmount)}</span>
        </li>
      </ul>
      <p className="text-xs text-zinc-500 mt-4">
        Rest of the pool splits across ranks 4–100 with weights 97 → 1.
      </p>
    </Modal>
  );
}
