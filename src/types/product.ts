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
  best_deal?: ProductBestDeal;
  all_deals?: ProductBestDeal[];
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
