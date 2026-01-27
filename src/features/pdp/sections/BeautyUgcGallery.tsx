'use client';

import { Play } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
import { cn } from '@/lib/utils';

export function BeautyUgcGallery({
  items,
  title = 'Customer Photos',
  showEmpty = false,
  ctaLabel = 'Share yours +',
  ctaEnabled = true,
  onCtaClick,
}: {
  items: MediaItem[];
  title?: string;
  showEmpty?: boolean;
  ctaLabel?: string;
  ctaEnabled?: boolean;
  onCtaClick?: () => void;
}) {
  if (!items.length && !showEmpty) return null;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          {items.length ? ` (${items.length})` : ''}
        </h3>
        <button
          type="button"
          onClick={onCtaClick}
          aria-disabled={!ctaEnabled}
          className={cn(
            'text-xs font-medium text-primary transition-opacity',
            ctaEnabled ? 'hover:underline' : 'opacity-50 cursor-not-allowed',
          )}
        >
          {ctaLabel}
        </button>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
          {items.slice(0, 6).map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="relative aspect-square">
              <img
                src={normalizeMediaUrl(item.url)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              {item.type === 'video' ? <Play className="absolute top-2 right-2 h-4 w-4 text-white drop-shadow-lg" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No customer photos yet.
        </div>
      )}
    </div>
  );
}
