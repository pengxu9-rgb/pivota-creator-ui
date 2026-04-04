export type DealType = "MULTI_BUY_DISCOUNT" | "FLASH_SALE" | "FREE_SHIPPING";
export type DiscoverySurface = "home_hot_deals" | "browse_products";
export type DiscoveryStrategy = "personalized_interest" | "cold_start_curated";
export type PersonalizationSource =
  | "account_history"
  | "session_history"
  | "merged"
  | "none";

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

export type RawProductPrice =
  | number
  | string
  | {
      amount?: number | string;
      currency?: string;
      currency_code?: string;
      label?: string;
    }
  | null
  | undefined;

export interface ProductVariant {
  id: string;
  title: string;
  price?: number;
  priceLabel?: string;
  sku?: string;
  inventoryQuantity?: number;
  options?: Record<string, string>;
  imageUrl?: string;
}

export interface RawProduct {
  id: string;
  title: string;
  description: string;
  price?: RawProductPrice;
  currency?: string;
  // Some backends send currency as currency_code.
  currency_code?: string;
  price_amount?: number | string;
  price_currency?: string;
  price_label?: string;
  image_url: string;
  inventory_quantity: number;
  // Some unified catalog backends include a product_ref carrying variant_id / sku_id.
  product_ref?: {
    platform?: string;
    platform_product_id?: string;
    variant_id?: string;
    sku_id?: string;
  };
  // Optional flattened ids used by some adapters.
  platform_product_id?: string;
  variant_id?: string;
  sku_id?: string;
  // Optional merchant metadata (populated by real backend)
  merchant_id?: string;
  merchant_name?: string;
  brand?: string;
  category?: string;
  product_type?: string;
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
  price?: number;
  priceLabel?: string;
  currency: string;
  imageUrl: string;
  inventoryQuantity: number;
  // Merchant metadata for checkout / analytics
  merchantId?: string;
  merchantName?: string;
  brand?: string;
  category?: string;
  productType?: string;
  // UI 友好字段
  isCreatorPick?: boolean;
  creatorPickRank?: number;
  discountPercent?: number;
  creatorMentions?: number;
  fromCreatorDirectly?: boolean;
  detailUrl?: string;
  // Deal info comes from backend contracts only; do not invent client-side values.
  bestDeal?: ProductBestDeal;
  allDeals?: ProductBestDeal[];
  // Structured options/specs mapped from backend product detail.
  options?: ProductOption[];
  // Optional rich detail fields for variant / gallery UI
  images?: string[];
  variants?: ProductVariant[];
  /**
   * Whether `variants` represents the complete set of variants/options from the upstream store.
   * If false, the list may be synthesized from a single `variant_id` reference and must not be
   * used for silent SKU selection.
   */
  variantsComplete?: boolean;
  variantContract?: Record<string, unknown>;
}

export interface DiscoveryRecentView {
  merchant_id: string;
  product_id: string;
  title: string;
  description: string;
  brand?: string;
  category?: string;
  product_type?: string;
  viewed_at: string;
  history_source?: "session" | "account";
}

export interface DiscoveryFeedMetadata {
  discovery_strategy: DiscoveryStrategy;
  personalization_source: PersonalizationSource;
  history_items_used: number;
  anchor_count: number;
  scoring_version: string;
  surface: DiscoverySurface;
  locale: string;
  candidate_source?: "override" | "products_search" | "unknown";
  candidate_counts?: {
    raw: number;
    normalized: number;
    scored: number;
    eligible_pool: number;
    returned: number;
  };
  request_latency_ms?: number;
  rank_debug?: Record<string, unknown>;
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
