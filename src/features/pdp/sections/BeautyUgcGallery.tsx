'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';

export function BeautyUgcGallery({
  items,
  title = 'Customer Photos',
  showEmpty = false,
}: {
  items: MediaItem[];
  title?: string;
  showEmpty?: boolean;
}) {
  if (!items.length && !showEmpty) return null;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          {items.length ? ` (${items.length})` : ''}
        </h3>
        <button className="text-xs font-medium text-primary">Add yours +</button>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
          {items.slice(0, 6).map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="relative aspect-square">
              <Image src={item.url} alt="" fill className="object-cover" unoptimized />
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

