'use client';

import type { PDPPayload, Variant } from '@/features/pdp/types';
import { PdpContainer } from '@/features/pdp/containers/PdpContainer';

export function GenericPDPContainer({
  payload,
  onAddToCart,
  onBuyNow,
  onWriteReview,
  onSeeAllReviews,
}: {
  payload: PDPPayload;
  onAddToCart: (args: { variant: Variant; quantity: number }) => void;
  onBuyNow: (args: { variant: Variant; quantity: number }) => void;
  onWriteReview?: () => void;
  onSeeAllReviews?: () => void;
}) {
  return (
    <PdpContainer
      payload={payload}
      mode="generic"
      onAddToCart={onAddToCart}
      onBuyNow={onBuyNow}
      onWriteReview={onWriteReview}
      onSeeAllReviews={onSeeAllReviews}
    />
  );
}

