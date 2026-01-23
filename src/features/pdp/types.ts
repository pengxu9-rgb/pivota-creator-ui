export interface PDPPayload {
  schema_version: string;
  page_type: string;
  tracking: PageTracking;
  product: Product;
  product_group_id?: string;
  offers?: Offer[];
  offers_count?: number;
  default_offer_id?: string;
  best_price_offer_id?: string;
  x_recommendations_state?: 'loading' | 'ready';
  modules: Module[];
  actions: GlobalAction[];
}

export interface PageTracking {
  page_request_id: string;
  entry_point: string;
  experiment?: string;
}

export interface Product {
  product_id: string;
  title: string;
  subtitle?: string;
  brand?: { name: string };
  brand_story?: string;
  category_path?: string[];
  image_url?: string;
  tags?: string[];
  department?: string;
  beauty_meta?: {
    popular_looks?: string[];
    best_for?: string[];
    important_info?: string[];
  };
  recent_purchases?: Array<{
    user_label: string;
    variant_label?: string;
    time_label?: string;
    price_label?: string;
  }>;
  size_guide?: SizeGuide;
  default_variant_id: string;
  variants: Variant[];
  price?: VariantPrice;
  availability?: { in_stock: boolean; available_quantity?: number };
  shipping?: { eta_days_range?: number[] };
  returns?: { return_window_days?: number; free_returns?: boolean };
  description?: string;
  merchant_id?: string;
}

export interface SizeGuide {
  columns: string[];
  rows: Array<{
    label: string;
    values: string[];
  }>;
  note?: string;
  model_info?: string;
}

export interface VariantPrice {
  current: Price;
  compare_at?: Price;
}

export interface Variant {
  variant_id: string;
  sku_id?: string;
  title: string;
  options?: { name: string; value: string }[];
  swatch?: { hex?: string };
  beauty_meta?: {
    shade_hex?: string;
    finish?: string;
    coverage?: string;
    undertone?: string;
  };
  price?: VariantPrice;
  availability?: { in_stock: boolean; available_quantity?: number };
  image_url?: string;
}

export interface Price {
  amount: number;
  currency: string;
}

export interface Offer {
  offer_id: string;
  product_group_id?: string;
  merchant_id: string;
  merchant_name?: string;
  price: Price;
  shipping?: {
    eta_days_range?: [number, number];
    cost?: Price;
    method_label?: string;
  };
  returns?: {
    return_window_days?: number;
    free_returns?: boolean;
  };
  inventory?: {
    in_stock?: boolean;
    available_quantity?: number;
  };
  fulfillment_type?: 'platform' | 'merchant' | '3pl' | string;
  tier?: string;
}

export interface Module {
  module_id: string;
  type: ModuleType;
  priority: number;
  title?: string;
  tracking_context?: Record<string, unknown>;
  data: unknown;
}

export type ModuleType =
  | 'media_gallery'
  | 'price_promo'
  | 'trust_badges'
  | 'product_details'
  | 'reviews_preview'
  | 'recommendations'
  | 'variant_selector';

export interface GlobalAction {
  action_type: ActionType;
  label: string;
  priority: number;
  target: ActionTarget;
}

export type ActionType = 'buy_now' | 'add_to_cart' | 'select_variant' | 'open_embed';

export interface ActionTarget {
  variant_id?: string;
  embed_intent_type?: string;
  resolve_params?: Record<string, string>;
}

export interface MediaGalleryData {
  items: MediaItem[];
}

export interface MediaItem {
  type: 'image' | 'video';
  url: string;
  source?: string;
  alt_text?: string;
  thumbnail_url?: string;
  duration_ms?: number;
}

export interface PricePromoData {
  price: Price;
  compare_at?: Price;
  promotions?: { label: string; description?: string }[];
}

export interface ProductDetailsData {
  sections: DetailSection[];
}

export interface DetailSection {
  heading: string;
  content_type: 'text';
  content: string;
  collapsed_by_default?: boolean;
}

export interface ReviewsPreviewData {
  scale: number;
  rating: number;
  review_count: number;
  star_distribution?: Array<{
    stars: number;
    count?: number;
    percent?: number;
  }>;
  dimension_ratings?: Array<{
    label: string;
    score: number;
  }>;
  filter_chips?: Array<{
    label: string;
    count?: number;
  }>;
  questions?: Array<{
    question: string;
    answer?: string;
    replies?: number;
  }>;
  brand_card?: {
    name: string;
    subtitle?: string;
  };
  preview_items?: Array<{
    review_id: string;
    rating: number;
    author_label?: string;
    text_snippet: string;
    media?: MediaItem[];
  }>;
  entry_points?: {
    open_reviews?: { action_type: 'open_embed'; label: string; target: ActionTarget };
    write_review?: { action_type: 'open_embed'; label: string; target: ActionTarget };
  };
}

export interface RecommendationsData {
  strategy?: string;
  items: Array<{
    product_id: string;
    title: string;
    image_url?: string;
    price?: Price;
    rating?: number;
    review_count?: number;
    merchant_id?: string;
  }>;
}

