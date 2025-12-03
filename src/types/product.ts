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
  // 后续后端如果加字段，比如 discount_percent / creator_mentions，可以在这里扩展
  creator_mentions?: number;
  from_creator_directly?: boolean;
  detail_url?: string;
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
}
