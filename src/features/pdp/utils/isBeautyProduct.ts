import type { Product } from '@/features/pdp/types';

// Beauty PDP is reserved for cosmetics (lipstick, foundation, makeup, etc).
// Default to Generic PDP unless category/tags explicitly say otherwise.
const BEAUTY_SIGNAL_KEYWORDS = [
  'beauty',
  'makeup',
  'cosmetic',
  'cosmetics',
  'lipstick',
  'foundation',
  'concealer',
  'blush',
  'mascara',
  'eyeshadow',
  'eyeliner',
  'brow',
  'bronzer',
  'highlighter',
  'primer',
  'powder',
  'palette',
  'contour',
  'setting',
  'lip',
  'lips',
  'gloss',
  'nail',
  'polish',
];

// If category/tags indicate these, force Generic PDP even if "beauty" appears.
const NON_MAKEUP_GUARD_KEYWORDS = [
  'skincare',
  'serum',
  'cleanser',
  'toner',
  'moisturizer',
  'moisturiser',
  'lotion',
  'sunscreen',
  'shampoo',
  'conditioner',
  'fragrance',
  'perfume',
];

const NON_MAKEUP_GUARD_PHRASES = ['skin care'];

const NON_BEAUTY_GUARD_KEYWORDS = [
  // Pets
  'dog',
  'cat',
  'pet',
  'leash',
  'collar',
  'harness',
  'treat',
  'toy',
];

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  const normalizedHaystack = ` ${normalizeText(haystack)} `;
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return normalizedHaystack.includes(` ${normalizedPhrase} `);
}

export function isBeautyProduct(product: Product): boolean {
  const title = String(product.title || '');
  const subtitle = String(product.subtitle || '');
  const categoryText = Array.isArray(product.category_path)
    ? product.category_path.join(' ')
    : '';
  const tagsText = Array.isArray(product.tags) ? product.tags.join(' ') : '';

  // Guard against obvious non-beauty domains (e.g., pets) even if mislabeled.
  const guardTokens = new Set(
    normalizeText(`${title} ${subtitle} ${categoryText} ${tagsText}`)
      .split(' ')
      .filter(Boolean),
  );
  if (NON_BEAUTY_GUARD_KEYWORDS.some((kw) => guardTokens.has(kw))) return false;

  // Only category/tags can enable Beauty PDP.
  const signalText = `${categoryText} ${tagsText}`;
  const signalTokens = new Set(
    normalizeText(signalText)
      .split(' ')
      .filter(Boolean),
  );

  if (NON_MAKEUP_GUARD_KEYWORDS.some((kw) => signalTokens.has(kw))) return false;
  if (NON_MAKEUP_GUARD_PHRASES.some((kw) => hasPhrase(signalText, kw))) return false;

  return BEAUTY_SIGNAL_KEYWORDS.some((kw) => signalTokens.has(kw));
}
