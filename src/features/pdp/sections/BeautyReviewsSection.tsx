'use client';

import { Star, ChevronRight } from 'lucide-react';
import type { ReviewsPreviewData } from '@/features/pdp/types';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
import { cn } from '@/lib/utils';

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn('h-3 w-3', i < rounded ? 'fill-gold text-gold' : 'text-muted-foreground')}
        />
      ))}
    </div>
  );
}

export function BeautyReviewsSection({
  data,
  onWriteReview,
  onSeeAll,
  onAskQuestion,
  onSeeAllQuestions,
  onOpenQuestion,
  brandName,
  showEmpty = false,
  writeReviewLabel = 'Write a review',
  writeReviewEnabled = true,
  openReviewsLabel = 'View all reviews',
  askQuestionLabel = 'Ask a question',
  askQuestionEnabled = true,
  openQuestionsLabel = 'View all',
}: {
  data: ReviewsPreviewData;
  onWriteReview?: () => void;
  onSeeAll?: () => void;
  onAskQuestion?: () => void;
  onSeeAllQuestions?: () => void;
  onOpenQuestion?: (questionId: number) => void;
  brandName?: string;
  showEmpty?: boolean;
  writeReviewLabel?: string;
  writeReviewEnabled?: boolean;
  openReviewsLabel?: string;
  askQuestionLabel?: string;
  askQuestionEnabled?: boolean;
  openQuestionsLabel?: string;
}) {
  const hasSummary = data.review_count > 0 && data.rating > 0;
  const rating5 = data.scale ? (data.rating / data.scale) * 5 : 0;
  const ratingLabel = Number.isFinite(data.rating) ? data.rating.toFixed(1) : "0.0";
  const ratingCount = (() => {
    const anyData = data as any;
    const candidates = [
      anyData.rating_count,
      anyData.ratingCount,
      anyData.rated_review_count,
      anyData.ratedReviewCount,
    ];
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return Number(data.review_count) || 0;
  })();
  const distributionRows = (() => {
    const anyData = data as any;

    const rawFromAny = (() => {
      const candidates = [
        anyData.star_distribution,
        anyData.starDistribution,
        anyData.rating_distribution,
        anyData.ratingDistribution,
        anyData.distribution,
      ];
      for (const v of candidates) {
        if (Array.isArray(v)) return v;
      }
      return null;
    })();

    const rawFromObject = (() => {
      const v = anyData.star_distribution;
      if (!v || typeof v !== "object" || Array.isArray(v)) return null;
      return Object.entries(v).map(([k, val]) => {
        const stars = Number(k);
        if (!Number.isFinite(stars)) return null;
        if (typeof val === "number") return { stars, percent: val };
        if (val && typeof val === "object") return { stars, ...(val as any) };
        return null;
      }).filter(Boolean);
    })();

    const raw = (rawFromAny || rawFromObject || []) as Array<any>;
    const map = new Map<number, { stars: number; count?: number; percent?: number }>();
    raw.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const starsRaw = (item as any).stars ?? (item as any).star ?? (item as any).rating ?? (item as any).score;
      const stars = Number(starsRaw);
      if (!Number.isFinite(stars)) return;
      const count = (item as any).count ?? (item as any).n ?? (item as any).num ?? (item as any).total;
      const percent =
        (item as any).percent ?? (item as any).ratio ?? (item as any).pct ?? (item as any).percentage ?? (item as any).share;
      map.set(stars, { stars, count, percent });
    });

    return [5, 4, 3, 2, 1].map((stars) => {
      const item = map.get(stars);
      let percent: number | null = null;
      if (item) {
        const rc = Number.isFinite(ratingCount) ? ratingCount : Number(data.review_count) || 0;
        if (
          typeof item.count === "number" &&
          Number.isFinite(item.count) &&
          rc > 0
        ) {
          percent = item.count / rc;
        } else if (typeof item.percent === "number" && Number.isFinite(item.percent)) {
          percent = item.percent;
        }
      }
      if (typeof percent === "number" && Number.isFinite(percent)) {
        if (percent > 1) {
          const rc = Number.isFinite(ratingCount) ? ratingCount : Number(data.review_count) || 0;
          const maybeCount =
            rc > 0 &&
            percent <= rc &&
            !(typeof item?.count === "number" && Number.isFinite(item.count));
          percent = maybeCount && rc ? percent / rc : percent / 100;
        }
        percent = Math.max(0, Math.min(1, percent));
      } else {
        percent = null;
      }
      return { stars, percent };
    });
  })();

  const hasValidDistribution = distributionRows.some((r) => typeof r.percent === "number" && r.percent > 0);
  const displayDistributionRows = hasValidDistribution
    ? distributionRows
    : distributionRows.map((r) => ({ ...r, percent: null }));

  return (
    <div className="py-4">
      <div className="mx-3 rounded-2xl bg-card border border-border p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Reviews ({data.review_count})</h3>
          {onWriteReview ? (
            <button
              type="button"
              onClick={onWriteReview}
              aria-disabled={!writeReviewEnabled}
              className={cn(
                'text-xs font-medium text-primary transition-opacity',
                writeReviewEnabled ? 'hover:underline' : 'opacity-50 cursor-not-allowed',
              )}
            >
              {writeReviewLabel}
            </button>
          ) : null}
        </div>

        {hasSummary ? (
          <div className="flex gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold">{ratingLabel}</div>
              <div className="mt-1 flex justify-center">
                <StarRating value={rating5} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {data.review_count} reviews
                {ratingCount > 0 && ratingCount !== data.review_count ? ` · ${ratingCount} ratings` : ""}
              </p>
            </div>

            <div className="flex-1 space-y-1">
              {displayDistributionRows.map((dist) => (
                <div key={dist.stars} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-muted-foreground">{dist.stars}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold rounded-full"
                      style={{ width: `${Math.round((dist.percent ?? 0) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">
                    {dist.percent == null ? "—" : `${Math.round(dist.percent * 100)}%`}
                  </span>
                </div>
              ))}
              {!hasValidDistribution ? (
                <div className="pt-1 text-[11px] text-muted-foreground">
                  Rating breakdown is not available for this product yet.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your thoughts.</p>
        )}

        {data.dimension_ratings?.length ? (
          <div className="flex justify-between mt-3 pt-3 border-t border-border">
            {data.dimension_ratings.slice(0, 3).map((dim) => (
              <div key={dim.label} className="text-center">
                <span className="text-xs text-muted-foreground">{dim.label}</span>
                <div className="text-sm font-semibold mt-0.5">{dim.score}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {data.filter_chips?.length || showEmpty ? (
        <div className="overflow-x-auto mt-3">
          <div className="flex gap-2 px-3">
            {data.filter_chips?.map((chip) => (
              <button
                key={chip.label}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs whitespace-nowrap hover:border-primary/50"
              >
                {chip.label}
                {chip.count != null ? <span className="text-muted-foreground">{chip.count}</span> : null}
              </button>
            ))}
            {!data.filter_chips?.length ? (
              <span className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                No filters yet
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.preview_items?.length ? (
        <div className="mt-3 space-y-3 px-3">
          {data.preview_items.slice(0, 3).map((review) => (
            <div key={review.review_id} className="flex gap-3 pb-3 border-b border-border last:border-0">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{review.author_label || 'Verified buyer'}</span>
                </div>
                <div className="mt-1">
                  <StarRating value={(review.rating / data.scale) * 5} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{review.text_snippet}</p>
              </div>
              {review.media?.length ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={normalizeMediaUrl(review.media[0].url)}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {onSeeAll ? (
        <button
          onClick={onSeeAll}
          className="w-full mt-2 py-2.5 text-sm text-muted-foreground flex items-center justify-center gap-1 hover:text-foreground"
        >
          {openReviewsLabel} <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      {data.questions?.length || showEmpty ? (
        <div className="mt-3 px-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Questions</h3>
            {onAskQuestion ? (
              <button
                type="button"
                onClick={onAskQuestion}
                aria-disabled={!askQuestionEnabled}
                className={cn(
                  'text-xs font-medium text-primary transition-opacity',
                  askQuestionEnabled ? 'hover:underline' : 'opacity-50 cursor-not-allowed',
                )}
              >
                {askQuestionLabel}
              </button>
            ) : null}
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.questions?.map((disc, idx) => {
              const key = `${disc.question}-${idx}`;
              const content = (
                <>
                  <p className="text-sm font-medium">{disc.question}</p>
                  {disc.answer ? <p className="mt-2 text-xs text-muted-foreground">&quot;{disc.answer}&quot;</p> : null}
                  {disc.replies != null ? (
                    <p className="mt-2 text-xs text-muted-foreground">{disc.replies} replies</p>
                  ) : null}
                </>
              );

              if (onOpenQuestion && disc.question_id) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onOpenQuestion(Number(disc.question_id))}
                    className="min-w-[220px] rounded-xl bg-card border border-border p-3 text-left hover:border-primary/50"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div key={key} className="min-w-[220px] rounded-xl bg-card border border-border p-3">
                  {content}
                </div>
              );
            })}
            {onSeeAllQuestions && data.questions?.length ? (
              <button
                type="button"
                onClick={onSeeAllQuestions}
                className="min-w-[120px] rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground hover:border-primary/50"
              >
                {openQuestionsLabel} <ChevronRight className="inline h-4 w-4 align-[-2px]" />
              </button>
            ) : null}
            {!data.questions?.length ? (
              <div className="min-w-[220px] rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                No questions yet.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {data.brand_card?.name || brandName ? (
        <div className="mt-4 mx-3 flex items-center gap-3 rounded-xl bg-card border border-border p-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold tracking-tight">
            {(data.brand_card?.name || brandName || '').slice(0, 12).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-semibold">{data.brand_card?.name || brandName}</p>
            {data.brand_card?.subtitle ? <p className="text-xs text-muted-foreground">{data.brand_card.subtitle}</p> : null}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
}
