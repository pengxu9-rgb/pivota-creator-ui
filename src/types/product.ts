export type DealType = "MULTI_BUY_DISCOUNT" | "FLASH_SALE" | "FREE_SHIPPING";

export interface ProductBestDeal {
  dealId: string;
  type: DealType;
  label: string;
  discountPercent?: number;
   // For MULTI_BUY_DISCOUNT, thresholdQuantity indicates how many items
   // must be bought together to trigger the discount.
   thresholdQuantity?: number;
  flashPrice?: number;
  // For FREE_SHIPPING deals, indicate that shipping is free and optionally
  // the minimum order subtotal (in the same currency as the product price).
  freeShipping?: boolean;
  minSubtotal?: number;
  endAt?: string;
  urgencyLevel?: "LOW" | "MEDIUM" | "HIGH";
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  sku?: string;
  inventoryQuantity?: number;
  options?: Record<string, string>;
  imageUrl?: string;
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
  // Whether this item is an explicit creator pick (from creator_picks table
  // or equivalent backend signal).
  creator_pick?: boolean;
  creator_pick_rank?: number;
  creator_mentions?: number;
  from_creator_directly?: boolean;
  detail_url?: string;
  // Deal info from backend
  // Backend uses snake_case; mapper will normalize.
  best_deal?: any;
  all_deals?: any[];
  // Optional structured options/specs (e.g., color / size) from backend product detail.
  options?: any;
  product_options?: any;
  // Optional rich fields for detail views
  images?: any;
  variants?: any;
  attributes?: any;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  /**
   * 原始 HTML 描述（来自 Shopify 等），
   * 仅在详情页使用，用于保留表格等排版。
   */
  descriptionHtml?: string;
  price: number;
  currency: string;
  imageUrl: string;
  inventoryQuantity: number;
  // Merchant metadata for checkout / analytics
  merchantId?: string;
  merchantName?: string;
  // UI 友好字段
  isCreatorPick?: boolean;
  creatorPickRank?: number;
  discountPercent?: number;
  creatorMentions?: number;
  fromCreatorDirectly?: boolean;
  detailUrl?: string;
  // Deal info (do not invent client-side; map from backend or attach mock in mock mode only)
  bestDeal?: ProductBestDeal;
  allDeals?: ProductBestDeal[];
  // Structured options/specs mapped from backend product detail.
  options?: ProductOption[];
  // Optional rich detail fields for variant / gallery UI
  images?: string[];
  variants?: ProductVariant[];
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
