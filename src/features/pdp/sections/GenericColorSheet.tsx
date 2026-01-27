'use client';

import { useMemo } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Variant } from '@/features/pdp/types';
import { normalizeMediaUrl } from '@/features/pdp/utils/mediaUrl';
import { getOptionValue } from '@/features/pdp/utils/variantOptions';

export function GenericColorSheet({
  open,
  onClose,
  variants,
  selectedColor,
  onSelectColor,
}: {
  open: boolean;
  onClose: () => void;
  variants: Variant[];
  selectedColor: string | null;
  onSelectColor: (color: string) => void;
}) {
  const colorOptions = useMemo(() => {
    const map = new Map<
      string,
      { value: string; image_url?: string; swatch_hex?: string }
    >();

    for (const variant of variants) {
      const value = getOptionValue(variant, ['color', 'colour', 'shade', 'tone']) || '';
      const normalized = value.trim();
      if (!normalized) continue;
      if (map.has(normalized)) continue;

      map.set(normalized, {
        value: normalized,
        image_url: variant.image_url ? normalizeMediaUrl(variant.image_url) : undefined,
        swatch_hex: variant.swatch?.hex,
      });
    }

    return Array.from(map.values());
  }, [variants]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Select Color (${colorOptions.length || variants.length})`}
      sheetClassName="h-[70vh] bg-card"
      contentClassName="px-4 pb-4"
    >
      <div className="mt-3 grid grid-cols-3 gap-3">
        {(colorOptions.length ? colorOptions : [{ value: 'Default' }]).map((opt) => {
          const isSelected = Boolean(selectedColor && opt.value === selectedColor);
          const hasPreview = Boolean(opt.image_url || opt.swatch_hex);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value !== 'Default') onSelectColor(opt.value);
                onClose();
              }}
              className={[
                'rounded-xl border px-3 py-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:border-primary/50',
              ].join(' ')}
            >
              {hasPreview ? (
                <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-lg bg-muted">
                  {opt.image_url ? (
                    <img
                      src={opt.image_url}
                      alt={opt.value}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="absolute inset-0" style={{ backgroundColor: opt.swatch_hex }} />
                  )}
                </div>
              ) : null}
              <div className="text-sm font-medium truncate">{opt.value}</div>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
