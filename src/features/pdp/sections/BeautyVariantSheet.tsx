'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Variant } from '@/features/pdp/types';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647]">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-md">
          <div className="h-[70vh] rounded-t-2xl bg-card border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">Select Shade ({variants.length})</div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto py-2 space-y-1 px-4">
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
                      isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary/40' : 'border-border hover:border-primary/50'
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
            </div>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

