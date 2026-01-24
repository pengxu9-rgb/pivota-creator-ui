'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TRANSITION_MS = 200;

export function BottomSheet({
  open,
  onClose,
  title,
  leading,
  children,
  sheetClassName,
  contentClassName,
  headerClassName,
  overlayClassName,
  disableScrollLock = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  leading?: React.ReactNode;
  children: React.ReactNode;
  sheetClassName?: string;
  contentClassName?: string;
  headerClassName?: string;
  overlayClassName?: string;
  disableScrollLock?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), TRANSITION_MS);
      return () => clearTimeout(t);
    }

    setRendered(true);
    const raf = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || disableScrollLock) return;
    if (typeof document === 'undefined') return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    try {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }
    } catch {
      // ignore
    }

    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [disableScrollLock, open]);

  if (!mounted || !rendered) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647] flex items-end justify-center">
      <button
        type="button"
        className={cn(
          'absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0',
          overlayClassName,
        )}
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full">
        <div
          className={cn(
            'mx-auto w-full max-w-md transform transition-transform duration-200',
            visible ? 'translate-y-0' : 'translate-y-6',
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div
            className={cn(
              'rounded-t-3xl border border-border bg-white shadow-[0_-16px_40px_rgba(0,0,0,0.16)] overflow-hidden',
              sheetClassName,
            )}
            role="dialog"
            aria-modal="true"
          >
            <div className="pt-2">
              <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
            </div>

            <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border', headerClassName)}>
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                {leading ? <span className="text-muted-foreground">{leading}</span> : null}
                <span className="truncate">{title}</span>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-border bg-white flex items-center justify-center hover:bg-muted/40 transition-colors"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              className={cn(
                'flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
                contentClassName,
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

