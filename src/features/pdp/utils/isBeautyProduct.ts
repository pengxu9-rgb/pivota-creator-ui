import type { Product } from '@/features/pdp/types';

const BEAUTY_KEYWORDS = [
  'beauty',
  'makeup',
  'cosmetic',
  'skincare',
  'skin care',
  'lip',
  'lips',
  'lipstick',
  'foundation',
  'concealer',
  'blush',
  'mascara',
  'eyeshadow',
  'fragrance',
  'perfume',
];

export function isBeautyProduct(product: Product): boolean {
  const category = (product.category_path || []).join(' ').toLowerCase();
  const title = String(product.title || '').toLowerCase();
  const subtitle = String(product.subtitle || '').toLowerCase();
  const brand = product.brand?.name ? String(product.brand.name).toLowerCase() : '';
  const tags = Array.isArray(product.tags) ? product.tags.join(' ').toLowerCase() : '';
  const department = product.department ? String(product.department).toLowerCase() : '';
  const combined = `${category} ${title} ${subtitle} ${brand} ${tags} ${department}`;
  return BEAUTY_KEYWORDS.some((kw) => combined.includes(kw));
}

