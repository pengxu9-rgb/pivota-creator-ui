'use client';

import type { Variant } from '@/features/pdp/types';
import { BottomSheet } from '@/components/ui/BottomSheet';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function BeautyVariantSheet({
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
      title={`Select Shade (${variants.length})`}
      sheetClassName="h-[70vh] bg-card"
      contentClassName="py-2 space-y-1 px-4"
    >
      {variants.map((variant) => {
        const isSelected = variant.variant_id === selectedVariantId;
        const amount = variant.price?.current.amount ?? 0;
        const currency = variant.price?.current.currency || 'USD';
        return (
          <button
            key={variant.variant_id}
            onClick={() => {
              onSelect(variant.variant_id);
              onClose();
            }}
            className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {variant.swatch?.hex ? (
              <span
                className="h-5 w-5 rounded-full ring-1 ring-border flex-shrink-0"
                style={{ backgroundColor: variant.swatch.hex }}
              />
            ) : (
              <span className="h-5 w-5 rounded-full bg-muted flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{variant.title}</div>
              {variant.beauty_meta ? (
                <div className="text-[10px] text-muted-foreground truncate">
                  {[variant.beauty_meta.undertone, variant.beauty_meta.finish, variant.beauty_meta.coverage]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              ) : null}
            </div>
            <div className="text-xs font-medium">{formatPrice(amount, currency)}</div>
            {isSelected ? <span className="text-primary text-[10px] font-medium">✓</span> : null}
          </button>
        );
      })}
    </BottomSheet>
  );
}
