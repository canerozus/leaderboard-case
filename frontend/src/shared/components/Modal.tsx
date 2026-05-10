import { useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas-0/70 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-md rounded-2xl bg-canvas-100 p-6 shadow-elevate ring-1 ring-white/5',
          className,
        )}
      >
        {title ? <h2 className="text-lg font-semibold text-zinc-100 mb-4">{title}</h2> : null}
        {children}
      </div>
    </div>
  );
}
