import type { Variant } from '@/features/pdp/types';

const COLOR_KEYS = ['color', 'colour', 'shade', 'tone'];
const SIZE_KEYS = ['size', 'fit'];
const BEAUTY_KEYS = [
  { label: 'Finish', keys: ['finish', 'texture'] },
  { label: 'Coverage', keys: ['coverage'] },
  { label: 'Undertone', keys: ['undertone', 'tone'] },
];

function matchesKey(name: string, keys: string[]) {
  const lowered = name.toLowerCase();
  return keys.some((key) => lowered.includes(key));
}

export function getOptionValue(variant: Variant, keys: string[]): string | undefined {
  const options = variant.options || [];
  const match = options.find((opt) => opt.name && matchesKey(opt.name, keys));
  return match?.value;
}

export function collectOptionValues(variants: Variant[], keys: string[]): string[] {
  const values = new Set<string>();
  variants.forEach((variant) => {
    const value = getOptionValue(variant, keys);
    if (value) values.add(String(value));
  });
  return Array.from(values);
}

export function collectColorOptions(variants: Variant[]) {
  return collectOptionValues(variants, COLOR_KEYS);
}

export function collectSizeOptions(variants: Variant[]) {
  return collectOptionValues(variants, SIZE_KEYS);
}

export function findVariantByOptions(args: {
  variants: Variant[];
  color?: string | null;
  size?: string | null;
}): Variant | undefined {
  const { variants, color, size } = args;
  if (!color && !size) return undefined;

  return variants.find((variant) => {
    const colorValue = getOptionValue(variant, COLOR_KEYS);
    const sizeValue = getOptionValue(variant, SIZE_KEYS);
    const colorMatch = color ? colorValue === color : true;
    const sizeMatch = size ? sizeValue === size : true;
    return colorMatch && sizeMatch;
  });
}

export function extractAttributeOptions(variant: Variant): Array<{ name: string; value: string }> {
  const options = variant.options || [];
  return options
    .filter((opt) => opt?.name && opt?.value)
    .filter((opt) => !matchesKey(opt.name, COLOR_KEYS) && !matchesKey(opt.name, SIZE_KEYS))
    .filter((opt) => !BEAUTY_KEYS.some((beauty) => matchesKey(opt.name, beauty.keys)))
    .map((opt) => ({ name: String(opt.name), value: String(opt.value) }))
    .slice(0, 3);
}

export function extractBeautyAttributes(variant: Variant): Array<{ label: string; value: string }> {
  const items: Array<{ label: string; value: string }> = [];
  const meta = variant.beauty_meta || {};

  BEAUTY_KEYS.forEach((beauty) => {
    const fromMeta =
      beauty.label === 'Finish'
        ? meta.finish
        : beauty.label === 'Coverage'
          ? meta.coverage
          : meta.undertone;
    const fromOption = getOptionValue(variant, beauty.keys);
    const value = fromMeta || fromOption;
    if (value) {
      items.push({ label: beauty.label, value: String(value) });
    }
  });

  return items;
}

