'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import type { UgcCapabilities } from '@/lib/accountsClient';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';

export function BeautyPDPContainer({
  payload,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
  ugcCapabilities,
}: {
  payload: PDPPayload;
  onAddToCart: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
  ugcCapabilities?: UgcCapabilities | null;
}) {
  return (
    <PdpContainer
      payload={payload}
      mode="beauty"
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onWriteReview={onWriteReview}
      onSeeAllReviews={onSeeAllReviews}
      ugcCapabilities={ugcCapabilities}
    />
  );
}
