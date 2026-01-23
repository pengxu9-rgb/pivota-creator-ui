import type { Variant } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

export function VariantSelector({
  variants,
  selectedVariantId,
  onChange,
  mode,
}: {
  variants: Variant[];
  selectedVariantId: string;
  onChange: (variantId: string) => void;
  mode: 'beauty' | 'generic';
}) {
  if (!variants.length) return null;
  if (variants.length === 1) return null;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{mode === 'beauty' ? 'Shade' : 'Options'}</div>
        <div className="text-xs text-muted-foreground">{variants.length} variants</div>
      </div>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {variants.map((v) => {
          const isSelected = v.variant_id === selectedVariantId;
          return (
            <button
              key={v.variant_id}
              onClick={() => onChange(v.variant_id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors whitespace-nowrap',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/40 font-semibold'
                  : 'border-border hover:border-primary/50',
              )}
            >
              {mode === 'beauty' && v.swatch?.hex ? (
                <span className="h-3 w-3 rounded-full ring-1 ring-border" style={{ backgroundColor: v.swatch.hex }} />
              ) : null}
              <span className={cn('truncate', isSelected ? 'font-semibold' : 'font-medium')}>{v.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

