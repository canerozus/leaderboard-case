import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Coins } from 'lucide-react';
import { formatPrize } from '@/shared/lib/format';

export function PrizePoolTicker({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => formatPrize(v));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: 'easeOut' });
    return controls.stop;
  }, [mv, value]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-canvas-200 px-3 py-1.5 ring-1 ring-white/5 shadow-glow">
      <Coins size={14} className="text-accent-400" />
      <span className="hidden sm:inline text-xs uppercase tracking-widest text-zinc-400">Prize pool</span>
      <motion.span className="font-mono tabular text-accent-400 font-semibold ml-0.5">{display}</motion.span>
    </div>
  );
}
