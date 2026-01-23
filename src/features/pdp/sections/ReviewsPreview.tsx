import { Star } from 'lucide-react';
import type { ReviewsPreviewData } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('h-4 w-4', i < rounded ? 'fill-gold text-gold' : 'text-muted-foreground')}
        />
      ))}
    </div>
  );
}

export function ReviewsPreview({
  data,
  onWriteReview,
  onSeeAll,
}: {
  data: ReviewsPreviewData;
  onWriteReview?: () => void;
  onSeeAll?: () => void;
}) {
  const hasSummary = data.review_count > 0 && data.rating > 0;

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Reviews</div>
        {onWriteReview ? (
          <button className="text-xs font-medium text-primary" onClick={onWriteReview}>
            {data.entry_points?.write_review?.label || 'Write a review'}
          </button>
        ) : null}
      </div>
      {hasSummary ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="text-3xl font-bold">{data.rating.toFixed(1)}</div>
            <div>
              <StarRating value={(data.rating / data.scale) * 5} />
              <div className="mt-1 text-xs text-muted-foreground">{data.review_count} reviews</div>
            </div>
          </div>
          {data.preview_items?.length ? (
            <div className="mt-4 space-y-3">
              {data.preview_items.slice(0, 2).map((r) => (
                <div key={r.review_id} className="text-sm text-muted-foreground">
                  <div className="text-xs text-foreground font-medium">{r.author_label || 'Verified buyer'}</div>
                  <div className="mt-1 line-clamp-3">{r.text_snippet}</div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">No reviews yet. Be the first to share your thoughts.</div>
      )}
      {onSeeAll ? (
        <button className="mt-4 w-full text-sm text-primary font-medium" onClick={onSeeAll}>
          {data.entry_points?.open_reviews?.label || 'See all reviews'}
        </button>
      ) : null}
    </div>
  );
}

