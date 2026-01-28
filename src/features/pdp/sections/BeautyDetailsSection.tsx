'use client';

import type { MediaGalleryData, Product, ProductDetailsData } from '@/features/pdp/types';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
import { formatDescriptionText, isLikelyHeadingParagraph, splitParagraphs } from '@/lib/formatDescriptionText';

export function BeautyDetailsSection({
  data,
  product,
  media,
}: {
  data: ProductDetailsData;
  product: Product;
  media?: MediaGalleryData | null;
}) {
  const heroUrl = normalizeMediaUrl(media?.items?.[0]?.url || product.image_url);
  const accentImages = media?.items?.slice(1, 3) || [];
  const storySectionIndex = data.sections.findIndex((section) => /brand|story/i.test(section.heading));
  const storySection = storySectionIndex >= 0 ? data.sections[storySectionIndex] : undefined;
  const remainingSections = storySectionIndex >= 0 ? data.sections.filter((_, idx) => idx !== storySectionIndex) : data.sections;
  const formattedDescription =
    formatDescriptionText(product.description) || formatDescriptionText(remainingSections?.[0]?.content);
  const descriptionParagraphs = splitParagraphs(formattedDescription);
  const introText =
    descriptionParagraphs.find((p) => !isLikelyHeadingParagraph(p)) || descriptionParagraphs[0] || '';

  const formattedBrandStory = formatDescriptionText(product.brand_story || storySection?.content);
  const brandStoryParagraphs = splitParagraphs(formattedBrandStory);

  return (
    <div className="py-4">
      {heroUrl ? (
        <div className="relative aspect-[4/5] bg-gradient-to-b from-muted to-background">
          <img
            src={heroUrl}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-contain"
            loading="eager"
            decoding="async"
          />
        </div>
      ) : null}

      <div className="px-3 py-6 text-center">
        <h2 className="text-xl font-serif tracking-wide">{product.title}</h2>
        {product.subtitle ? <p className="mt-2 text-sm text-muted-foreground">{product.subtitle}</p> : null}
        {introText ? (
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto whitespace-pre-line">
            {introText}
          </p>
        ) : null}
      </div>

      {accentImages.length ? (
        <div className="px-3 space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {accentImages.map((item, idx) => (
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

      {formattedBrandStory ? (
        <div className="px-3 py-6">
          <h3 className="text-sm font-semibold mb-2">Brand Story</h3>
          {brandStoryParagraphs.length ? (
            <div className="space-y-2">
              {brandStoryParagraphs.map((paragraph, idx) =>
                isLikelyHeadingParagraph(paragraph) ? (
                  <div key={`${paragraph}-${idx}`} className="text-[11px] font-semibold tracking-wide text-foreground">
                    {paragraph}
                  </div>
                ) : (
                  <p key={`${paragraph}-${idx}`} className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {paragraph}
                  </p>
                ),
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground leading-relaxed">{formattedBrandStory}</p>
          )}
        </div>
      ) : null}

      <div className="mx-3">
        <DetailsAccordion data={{ sections: remainingSections.length ? remainingSections : data.sections }} />
      </div>
    </div>
  );
}
