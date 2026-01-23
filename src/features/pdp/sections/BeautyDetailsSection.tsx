'use client';

import Image from 'next/image';
import type { MediaGalleryData, Product, ProductDetailsData } from '@/features/pdp/types';
import { DetailsAccordion } from '@/features/pdp/sections/DetailsAccordion';

function stripHtml(input?: string) {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function BeautyDetailsSection({
  data,
  product,
  media,
}: {
  data: ProductDetailsData;
  product: Product;
  media?: MediaGalleryData | null;
}) {
  const heroUrl = media?.items?.[0]?.url || product.image_url;
  const accentImages = media?.items?.slice(1, 3) || [];
  const storySectionIndex = data.sections.findIndex((section) => /brand|story/i.test(section.heading));
  const storySection = storySectionIndex >= 0 ? data.sections[storySectionIndex] : undefined;
  const remainingSections = storySectionIndex >= 0 ? data.sections.filter((_, idx) => idx !== storySectionIndex) : data.sections;
  const introText = stripHtml(product.description) || stripHtml(remainingSections?.[0]?.content);

  return (
    <div className="py-4">
      {heroUrl ? (
        <div className="aspect-[4/5] bg-gradient-to-b from-muted to-background">
          <Image src={heroUrl} alt={product.title} fill className="object-contain" unoptimized />
        </div>
      ) : null}

      <div className="px-3 py-6 text-center">
        <h2 className="text-xl font-serif tracking-wide">{product.title}</h2>
        {product.subtitle ? <p className="mt-2 text-sm text-muted-foreground">{product.subtitle}</p> : null}
        {introText ? (
          <div className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{introText}</div>
        ) : null}
      </div>

      {accentImages.length ? (
        <div className="px-3 space-y-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl overflow-hidden">
            {accentImages.map((item, idx) => (
              <div key={`${item.url}-${idx}`} className="relative aspect-[3/4] bg-muted">
                <Image src={item.url} alt="" fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {product.brand_story || storySection ? (
        <div className="px-3 py-6">
          <h3 className="text-sm font-semibold mb-2">Brand Story</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{product.brand_story || storySection?.content}</p>
        </div>
      ) : null}

      <div className="mx-3">
        <DetailsAccordion data={{ sections: remainingSections.length ? remainingSections : data.sections }} />
      </div>
    </div>
  );
}

