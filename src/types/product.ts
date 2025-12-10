export type DealType = "MULTI_BUY_DISCOUNT" | "FLASH_SALE";

export interface ProductBestDeal {
  dealId: string;
  type: DealType;
  label: string;
  discountPercent?: number;
  flashPrice?: number;
  endAt?: string;
  urgencyLevel?: "LOW" | "MEDIUM" | "HIGH";
}

export interface RawProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  inventory_quantity: number;
  // Optional merchant metadata (populated by real backend)
  merchant_id?: string;
  merchant_name?: string;
  creator_mentions?: number;
  from_creator_directly?: boolean;
  detail_url?: string;
  // Deal info from backend
  // Backend uses snake_case; mapper will normalize.
  best_deal?: any;
  all_deals?: any[];
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  inventoryQuantity: number;
  // Merchant metadata for checkout / analytics
  merchantId?: string;
  merchantName?: string;
  // UI 友好字段
  discountPercent?: number;
  creatorMentions?: number;
  fromCreatorDirectly?: boolean;
  detailUrl?: string;
  // Deal info (do not invent client-side; map from backend or attach mock in mock mode only)
  bestDeal?: ProductBestDeal;
  allDeals?: ProductBestDeal[];
}

// Treat ProductBestDeal as a reusable offer type for similarity responses.
export type Offer = ProductBestDeal;

export interface SimilarProductItem {
  product: Product;
  best_deal?: Offer;
  all_deals?: Offer[];
  scores?: {
    similarity?: number;
    personalization?: number;
  };
  reason?: string;
}

export interface FindSimilarProductsResponse {
  base_product_id: string;
  strategy_used: "content_embedding" | "co_view" | "same_merchant_first" | "auto";
  items: SimilarProductItem[];
}
