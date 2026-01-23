'use client';

import Image from 'next/image';
import { Play } from 'lucide-react';
import type { MediaItem } from '@/features/pdp/types';

export function GenericStyleGallery({
  items,
  showEmpty = false,
  title = 'Style Gallery',
}: {
  items: MediaItem[];
  showEmpty?: boolean;
  title?: string;
}) {
  if (!items.length && !showEmpty) return null;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">
          {title}
          {items.length ? ` (${items.length})` : ''}
        </h3>
        <button className="text-xs text-primary">Share yours +</button>
      </div>
      {items.length ? (
        <div className="grid grid-cols-3 gap-1 rounded-lg overflow-hidden">
          {items.slice(0, 6).map((item, idx) => (
            <div key={`${item.url}-${idx}`} className="relative aspect-[3/4]">
              <Image src={item.url} alt="" fill className="object-cover" unoptimized />
              {item.type === 'video' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Play className="h-8 w-8 text-white drop-shadow-lg" fill="white" fillOpacity={0.3} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No style gallery items yet.
        </div>
      )}
    </div>
  );
}

