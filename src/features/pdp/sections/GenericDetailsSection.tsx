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

export function GenericDetailsSection({
  data,
  product,
  media,
}: {
  data: ProductDetailsData;
  product: Product;
  media?: MediaGalleryData | null;
}) {
  const primarySection = data.sections[0];
  const secondarySections = data.sections.slice(1);
  const description = stripHtml(primarySection?.content || product.description);
  const detailImages = (media?.items || []).slice(1, 3);

  return (
    <div className="p-3">
      <h2 className="text-sm font-semibold mb-2">Product Details</h2>
      <div className="mb-3">
        <h3 className="text-sm font-semibold mb-1.5">{primarySection?.heading || 'Fabric & Care'}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description || 'Details not available.'}</p>
      </div>

      {detailImages.length ? (
        <div className="space-y-2">
          {detailImages.map((item, idx) => (
            <Image
              key={`${item.url}-${idx}`}
              src={item.url}
              alt=""
              width={800}
              height={600}
              className="w-full h-auto rounded-lg"
              unoptimized
            />
          ))}
        </div>
      ) : null}

      {secondarySections.length ? (
        <div className="mt-3">
          <DetailsAccordion data={{ sections: secondarySections }} />
        </div>
      ) : null}
    </div>
  );
}
