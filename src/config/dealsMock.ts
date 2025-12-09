import type { Product, ProductBestDeal } from "@/types/product";

// Simple mock deals for UI previews in mock mode only.
export const MOCK_DEALS: ProductBestDeal[] = [
  {
    dealId: "mock-deal-1",
    type: "MULTI_BUY_DISCOUNT",
    label: "Buy 3, get 20% off",
    discountPercent: 20,
    urgencyLevel: "MEDIUM",
  },
  {
    dealId: "mock-deal-2",
    type: "FLASH_SALE",
    label: "Flash deal",
    discountPercent: 15,
    flashPrice: 29,
    endAt: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    urgencyLevel: "HIGH",
  },
];

export function attachMockDeals(products: Product[]): Product[] {
  return products.map((p, idx) => {
    if (idx % 2 === 0) {
      return {
        ...p,
        bestDeal: {
          dealId: "mock-deal-1",
          type: "MULTI_BUY_DISCOUNT",
          label: "Buy 3, get 20% off",
          discountPercent: 20,
        },
      };
    }
    if (idx % 3 === 0) {
      return {
        ...p,
        bestDeal: {
          dealId: "mock-deal-2",
          type: "FLASH_SALE",
          label: "Flash deal",
          discountPercent: 15,
          flashPrice: Math.max(5, p.price * 0.8),
          endAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
          urgencyLevel: "HIGH",
        },
      };
    }
    return p;
  });
}

export function getMockSimilarProducts(
  base: Product,
  allProducts: Product[],
  limit = 6,
): Product[] {
  const others = allProducts.filter((p) => p.id !== base.id);
  return others.slice(0, limit);
}
