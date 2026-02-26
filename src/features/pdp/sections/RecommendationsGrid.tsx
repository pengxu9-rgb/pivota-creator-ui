import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Star, ChevronRight } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function RecommendationsGrid({
  data,
  onOpenAll,
  onLoadMore,
  onItemClick,
  canLoadMore = false,
  isLoadingMore = false,
}: {
  data: RecommendationsData;
  onOpenAll?: () => void;
  onLoadMore?: () => void;
  onItemClick?: (item: RecommendationsData['items'][number], index: number) => void;
  canLoadMore?: boolean;
  isLoadingMore?: boolean;
}) {
  const PAGE_SIZE = 12;
  const totalItems = data.items.length;
  const [visibleCount, setVisibleCount] = useState(() => Math.min(PAGE_SIZE, totalItems));

  useEffect(() => {
    setVisibleCount(Math.min(PAGE_SIZE, totalItems));
  }, [totalItems]);

  if (!totalItems) return null;

  const visibleItems = data.items.slice(0, visibleCount);
  const hasHiddenLoadedItems = visibleCount < totalItems;
  const showLoadMore = hasHiddenLoadedItems || canLoadMore;

  return (
    <div className="py-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">You May Also Like</h3>
        <button
          type="button"
          onClick={() => {
            setVisibleCount(totalItems);
            onOpenAll?.();
          }}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
        >
          View all <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 grid grid-cols-2 gap-3">
        {visibleItems.map((p, idx) => (
          <Link
            key={p.product_id}
            href={`${encodeURIComponent(p.product_id)}${
              p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''
            }`}
            className="rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
            onClick={() => onItemClick?.(p, idx)}
          >
            <div className="relative aspect-square bg-muted">
              {p.image_url ? (
                <img
                  src={normalizeMediaUrl(p.image_url)}
                  alt={p.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  No image
                </div>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem]">{p.title}</div>
              {p.rating ? (
                <div className="flex items-center gap-1 mt-2">
                  <Star className="h-3 w-3 fill-gold text-gold" />
                  <span className="text-xs">{p.rating.toFixed(1)}</span>
                  {p.review_count ? (
                    <span className="text-xs text-muted-foreground">({p.review_count})</span>
                  ) : null}
                </div>
              ) : null}
              {p.price ? (
                <div className="mt-2 text-sm font-bold">{formatPrice(p.price.amount, p.price.currency)}</div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      {showLoadMore ? (
        <button
          type="button"
          disabled={isLoadingMore}
          onClick={() => {
            let shouldFetchMore = false;
            setVisibleCount((prev) => {
              const next = Math.min(prev + PAGE_SIZE, totalItems);
              shouldFetchMore = next >= totalItems && canLoadMore;
              return next;
            });
            if (shouldFetchMore && !isLoadingMore) onLoadMore?.();
          }}
          className="w-full mt-4 py-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          {isLoadingMore ? "Loading more recommendations..." : "Load more recommendations"}
        </button>
      ) : null}
    </div>
  );
}

export function RecommendationsSkeleton() {
  return (
    <div className="py-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <div className="h-4 w-32 rounded bg-muted/30 animate-pulse" />
        <div className="h-3 w-12 rounded bg-muted/20 animate-pulse" />
      </div>
      <div className="px-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="rounded-xl bg-card border border-border overflow-hidden">
            <div className="aspect-square bg-muted/25 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-full rounded bg-muted/25 animate-pulse" />
              <div className="h-3 w-3/4 rounded bg-muted/20 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted/20 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
