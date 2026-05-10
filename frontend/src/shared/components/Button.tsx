import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'ghost' | 'tap';
type Size    = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent-500 text-canvas-100 hover:bg-accent-400 active:bg-accent-600 shadow-glow',
  ghost:   'bg-canvas-200 text-zinc-100 hover:bg-canvas-300 ring-1 ring-white/5',
  tap:     'bg-gradient-to-b from-accent-400 to-accent-600 text-canvas-100 hover:brightness-110 active:scale-[0.98] shadow-glow',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-14 px-6 text-base font-semibold',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, disabled, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {loading ? <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" /> : null}
      {children}
    </button>
  );
});
