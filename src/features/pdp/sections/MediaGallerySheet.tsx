'use client';

import { Grid3X3, Play } from 'lucide-react';
import { useMemo } from 'react';
import type { MediaItem } from '@/features/pdp/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
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
  const clampedActive = useMemo(() => {
    if (!items.length) return 0;
    if (!Number.isFinite(activeIndex) || activeIndex < 0) return 0;
    return Math.min(activeIndex, items.length - 1);
  }, [activeIndex, items.length]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`All media (${items.length})`}
      leading={<Grid3X3 className="h-4 w-4" />}
      sheetClassName="h-[75vh]"
      contentClassName="px-4 py-3"
    >
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
              <img
                src={normalizeMediaUrl(item.url)}
                alt={item.alt_text || ''}
                className="absolute inset-0 h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
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
    </BottomSheet>
  );
}
