import Image from 'next/image';
import { Grid3X3, Play } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { MediaGalleryData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function MediaGallery({
  data,
  title,
  fallbackUrl,
  activeIndex,
  onSelect,
  onOpenAll,
  aspectClass = 'aspect-[6/5]',
  fit = 'object-cover',
}: {
  data?: MediaGalleryData | null;
  title: string;
  fallbackUrl?: string;
  activeIndex?: number;
  onSelect?: (index: number) => void;
  onOpenAll?: () => void;
  aspectClass?: string;
  fit?: 'object-cover' | 'object-contain';
}) {
  const items = data?.items || [];
  const clampedIndex = typeof activeIndex === 'number' && activeIndex >= 0 && activeIndex < items.length ? activeIndex : 0;
  const hero = items[clampedIndex];
  const heroUrl = hero?.url || fallbackUrl;
  const isContain = fit === 'object-contain';

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchActive = useRef(false);

  const canSwipe = useMemo(() => items.length > 1 && typeof onSelect === 'function', [items.length, onSelect]);

  useEffect(() => {
    touchStartX.current = null;
    touchStartY.current = null;
    touchActive.current = false;
  }, [items.length]);

  return (
    <div>
      <div className="relative">
        <div
          className={cn('relative', aspectClass, isContain ? 'bg-muted/30' : 'bg-black/5')}
          onTouchStart={(e) => {
            if (!canSwipe) return;
            const t = e.touches?.[0];
            if (!t) return;
            touchStartX.current = t.clientX;
            touchStartY.current = t.clientY;
            touchActive.current = true;
          }}
          onTouchMove={(e) => {
            if (!touchActive.current) return;
            const t = e.touches?.[0];
            if (!t) return;
            const dx = Math.abs(t.clientX - (touchStartX.current ?? t.clientX));
            const dy = Math.abs(t.clientY - (touchStartY.current ?? t.clientY));
            if (dx > 10 && dx > dy) {
              e.preventDefault();
            }
          }}
          onTouchEnd={(e) => {
            if (!touchActive.current || !canSwipe) return;
            touchActive.current = false;

            const startX = touchStartX.current;
            const startY = touchStartY.current;
            touchStartX.current = null;
            touchStartY.current = null;

            const t = e.changedTouches?.[0];
            if (!t || startX == null || startY == null) return;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;

            if (Math.abs(dy) > Math.abs(dx)) return;
            if (Math.abs(dx) < 40) return;

            const nextIndex = dx < 0 ? clampedIndex + 1 : clampedIndex - 1;
            const bounded = Math.max(0, Math.min(items.length - 1, nextIndex));
            if (bounded !== clampedIndex) onSelect?.(bounded);
          }}
        >
          {heroUrl ? (
            <Image src={heroUrl} alt={hero?.alt_text || title} fill className={fit} unoptimized />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">No media</div>
          )}
        </div>
        {items.length ? (
          <div className="absolute top-3 right-3 rounded-full bg-foreground/60 px-2 py-0.5 text-[10px] text-white">
            {Math.min(clampedIndex + 1, items.length)}/{items.length}
          </div>
        ) : null}
      </div>
      {items.length ? (
        <div className="mt-2 px-3 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {items.slice(0, 5).map((item, idx) => (
              <button
                key={`${item.url}-${idx}`}
                type="button"
                onClick={() => onSelect?.(idx)}
                className={cn(
                  'relative h-12 w-12 rounded-md overflow-hidden border transition flex-shrink-0',
                  idx === clampedIndex ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                )}
                aria-label={`View media ${idx + 1}`}
              >
                <Image src={item.url} alt={item.alt_text || `Media ${idx + 1}`} fill className="object-cover" unoptimized />
                {item.type === 'video' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                    <Play className="h-3 w-3 text-white" fill="white" />
                  </div>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onOpenAll?.()}
              className="flex h-12 w-12 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted/60"
              aria-label="View all media"
            >
              <Grid3X3 className="h-4 w-4" />
              <span className="text-[9px] leading-none">{items.length > 5 ? `+${items.length - 5}` : 'All'}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
