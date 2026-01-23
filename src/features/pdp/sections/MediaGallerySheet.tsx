'use client';

import { createPortal } from 'react-dom';
import Image from 'next/image';
import { Grid3X3, Play, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MediaItem } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function MediaGallerySheet({
  open,
  onClose,
  items,
  activeIndex,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  items: MediaItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const clampedActive = useMemo(() => {
    if (!items.length) return 0;
    if (!Number.isFinite(activeIndex) || activeIndex < 0) return 0;
    return Math.min(activeIndex, items.length - 1);
  }, [activeIndex, items.length]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close media"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-md">
          <div className="h-[75vh] rounded-t-2xl bg-white border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <span>All media ({items.length})</span>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3 overflow-y-auto overscroll-contain flex-1 [-webkit-overflow-scrolling:touch]">
              <div className="grid grid-cols-3 gap-2">
                {items.map((item, idx) => {
                  const isSelected = idx === clampedActive;
                  return (
                    <button
                      key={`${item.url}-${idx}`}
                      type="button"
                      onClick={() => {
                        onSelect(idx);
                        onClose();
                      }}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-xl border transition',
                        isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50',
                      )}
                      aria-label={`Select media ${idx + 1}`}
                    >
                      <Image src={item.url} alt={item.alt_text || ''} fill className="object-cover" unoptimized />
                      {item.type === 'video' ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/15">
                          <Play className="h-8 w-8 text-white drop-shadow-lg" fill="white" fillOpacity={0.35} />
                        </div>
                      ) : null}
                      {isSelected ? (
                        <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">
                          ✓
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

