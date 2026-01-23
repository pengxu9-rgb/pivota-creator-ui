import Link from 'next/link';
import Image from 'next/image';
import { Star, ChevronRight } from 'lucide-react';
import type { RecommendationsData } from '@/features/pdp/types';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function RecommendationsGrid({ data }: { data: RecommendationsData }) {
  if (!data.items.length) return null;
  return (
    <div className="py-6">
      <div className="px-4 flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">You May Also Like</h3>
        <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
          View all <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 grid grid-cols-2 gap-3">
        {data.items.slice(0, 6).map((p) => (
          <Link
            key={p.product_id}
            href={`../${encodeURIComponent(p.product_id)}${
              p.merchant_id ? `?merchant_id=${encodeURIComponent(p.merchant_id)}` : ''
            }`}
            className="rounded-xl bg-card border border-border overflow-hidden hover:shadow-md transition-shadow"
          >
            <div className="relative aspect-square bg-muted">
              {p.image_url ? (
                <Image src={p.image_url} alt={p.title} fill className="object-cover" unoptimized />
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
      <button className="w-full mt-4 py-3 text-sm text-muted-foreground hover:text-foreground">
        Load more recommendations
      </button>
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

