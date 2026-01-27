'use client';

import { ChevronRight } from 'lucide-react';
import type { MediaItem, Variant } from '@/features/pdp/types';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
import { getOptionValue } from '@/features/pdp/utils/variantOptions';
import { cn } from '@/lib/utils';

export function BeautyShadesSection({
  selectedVariant,
  popularLooks = [],
  bestFor = [],
  importantInfo = [],
  mediaItems = [],
  brandName,
  showEmpty = false,
  shareCtaLabel = 'Share yours +',
  shareCtaEnabled = true,
  onShareCtaClick,
}: {
  selectedVariant: Variant;
  popularLooks?: string[];
  bestFor?: string[];
  importantInfo?: string[];
  mediaItems?: MediaItem[];
  brandName?: string;
  showEmpty?: boolean;
  shareCtaLabel?: string;
  shareCtaEnabled?: boolean;
  onShareCtaClick?: () => void;
}) {
  const undertone = selectedVariant.beauty_meta?.undertone || getOptionValue(selectedVariant, ['undertone', 'tone']);
  const shadeHex = selectedVariant.beauty_meta?.shade_hex || selectedVariant.swatch?.hex;
  const galleryItems = mediaItems.slice(1, 3);

  return (
    <div className="py-6">
      <div className="px-4 pb-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Shade Matching</h3>
          <button className="text-sm text-primary font-medium">Take the quiz →</button>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <span className="h-10 w-10 rounded-full ring-2 ring-primary ring-offset-2" style={{ backgroundColor: shadeHex || '#ddd' }} />
          <div>
            <p className="font-medium">{selectedVariant.title}</p>
            {undertone ? (
              <p className="text-sm text-muted-foreground">Best for {undertone} undertones</p>
            ) : (
              <p className="text-sm text-muted-foreground">Find your best match in this collection</p>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Explore shades curated to complement a wide range of skin tones and finishes.
        </p>

        <button className="w-full mt-4 py-3 text-center text-sm font-medium border border-border rounded-xl hover:bg-muted/50">
          View shade guide <ChevronRight className="h-4 w-4 inline ml-1" />
        </button>
      </div>

      {popularLooks.length || showEmpty ? (
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold mb-2">Popular Looks</h3>
          <div className="flex flex-wrap gap-1.5">
            {popularLooks.map((tag) => (
              <button key={tag} className="px-2.5 py-1 rounded-full border border-border bg-card text-xs hover:border-primary/50">
                {tag}
              </button>
            ))}
            {!popularLooks.length ? (
              <span className="px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground text-xs">
                No looks yet
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {bestFor.length || showEmpty ? (
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold mb-2">Best For</h3>
          <div className="flex flex-wrap gap-1.5">
            {bestFor.map((label) => (
              <button key={label} className="px-2.5 py-1 rounded-full border border-border bg-card text-xs hover:border-primary/50">
                {label}
              </button>
            ))}
            {!bestFor.length ? (
              <span className="px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground text-xs">
                No recommendations yet
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Community Feedback</h3>
          <button
            type="button"
            onClick={onShareCtaClick}
            aria-disabled={!shareCtaEnabled}
            className={cn(
              'text-xs text-primary font-medium transition-opacity',
              shareCtaEnabled ? 'hover:underline' : 'opacity-50 cursor-not-allowed',
            )}
          >
            {shareCtaLabel}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Share how this shade looks on you to help others choose.</p>
      </div>

      {importantInfo.length || showEmpty ? (
        <div className="px-4 py-3 bg-muted/30">
          <h3 className="text-sm font-semibold mb-2">Important Information</h3>
          {importantInfo.length ? (
            <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              {importantInfo.map((info) => (
                <p key={info}>{info}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No additional safety or usage details provided.</p>
          )}
        </div>
      ) : null}

      {galleryItems.length ? (
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold mb-3">Shade Gallery</h3>
          {brandName ? (
            <div className="text-xl font-serif tracking-widest text-center mb-4">{brandName.toUpperCase()}</div>
          ) : null}
          <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {galleryItems.map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative aspect-[3/4] bg-muted">
                <img
                  src={normalizeMediaUrl(item.url)}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
