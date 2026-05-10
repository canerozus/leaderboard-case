import { cn } from '../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-canvas-300/60', className)} aria-hidden />
  );
}
