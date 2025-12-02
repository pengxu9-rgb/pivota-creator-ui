import type { Product, RawProduct } from "@/types/product";

export function mapRawProduct(raw: RawProduct): Product {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    price: raw.price,
    currency: raw.currency,
    imageUrl: raw.image_url,
    inventoryQuantity: raw.inventory_quantity,
    // discountPercent / creatorMentions 后续可以从 raw 的扩展字段映射
    creatorMentions: raw.creator_mentions,
    fromCreatorDirectly: raw.from_creator_directly,
    detailUrl: raw.detail_url,
  };
}

export function mapRawProducts(raws: RawProduct[] | undefined | null): Product[] {
  if (!raws) return [];
  return raws.map(mapRawProduct);
}

// TODO: creator_mentions / from_creator_directly / detail_url 需要后端在 RawProduct 中提供。
// 当前前端只做字段占位和 UI 消费，具体意义在接口文档中定义。
