'use client';

import Image from 'next/image';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Variant } from '@/features/pdp/types';
import { getOptionValue } from '@/features/pdp/utils/variantOptions';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function GenericColorSheet({
  open,
  onClose,
  variants,
  selectedVariantId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  variants: Variant[];
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Select Color (${variants.length})`}
      sheetClassName="h-[70vh] bg-card"
      contentClassName="px-4 pb-4"
    >
      <div className="mt-2 grid grid-cols-4 gap-2">
        {variants.map((variant) => {
          const isSelected = variant.variant_id === selectedVariantId;
          const amount = variant.price?.current.amount ?? 0;
          const currency = variant.price?.current.currency || 'USD';
          const colorLabel = getOptionValue(variant, ['color', 'colour', 'shade', 'tone']) || variant.title;
          return (
            <button
              key={variant.variant_id}
              onClick={() => {
                onSelect(variant.variant_id);
                onClose();
              }}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border text-center transition-colors ${
                isSelected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="relative h-16 w-11 rounded overflow-hidden bg-muted">
                {variant.image_url ? (
                  <Image src={variant.image_url} alt={colorLabel} fill className="object-cover" unoptimized />
                ) : variant.swatch?.hex ? (
                  <span className="absolute inset-0" style={{ backgroundColor: variant.swatch.hex }} />
                ) : null}
              </div>
              <span className="text-[9px] text-muted-foreground line-clamp-1">{colorLabel}</span>
              <span className="text-[9px] font-medium">{formatPrice(amount, currency)}</span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
