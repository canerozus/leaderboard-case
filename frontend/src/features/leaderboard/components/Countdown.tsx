import { Clock } from 'lucide-react';
import { useCountdown } from '../hooks/useCountdown';
import { formatDuration } from '@/shared/lib/format';

export function Countdown({ secondsUntilReset }: { secondsUntilReset: number }) {
  const remaining = useCountdown(secondsUntilReset);
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-canvas-200 px-3 py-1.5 ring-1 ring-white/5">
      <Clock size={14} className="text-zinc-400" />
      <span className="hidden sm:inline text-xs uppercase tracking-widest text-zinc-400">Resets in</span>
      <span className="font-mono tabular text-zinc-100 font-semibold ml-0.5">{formatDuration(remaining)}</span>
    </div>
  );
}
