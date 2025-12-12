import type {
  Product,
  ProductBestDeal,
  ProductOption,
  RawProduct,
} from "@/types/product";

function stripHtml(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/<[^>]+>/g, "").trim();
}

function normalizeDeal(raw: any, productId: string): ProductBestDeal {
  if (!raw) {
    return {
      dealId: `${productId}-deal`,
      type: "MULTI_BUY_DISCOUNT",
      label: "",
    };
  }

  const dealId = raw.dealId || raw.id || `${productId}-deal`;
  const discountPercent =
    typeof raw.discountPercent === "number"
      ? raw.discountPercent
      : typeof raw.discount_percent === "number"
      ? raw.discount_percent
      : undefined;
  const flashPrice =
    typeof raw.flashPrice === "number"
      ? raw.flashPrice
      : typeof raw.flash_price === "number"
      ? raw.flash_price
      : undefined;
  const endAt = raw.endAt || raw.end_at || undefined;
  const urgencyLevel = raw.urgencyLevel || raw.urgency_level || undefined;

  return {
    dealId,
    type: raw.type,
    label: raw.label,
    discountPercent,
    flashPrice,
    endAt,
    urgencyLevel,
  };
}

function normalizeOptions(raw: RawProduct): ProductOption[] | undefined {
  const source: any = (raw as any).options || (raw as any).product_options;
  if (!Array.isArray(source)) return undefined;

  const result: ProductOption[] = [];
  for (const opt of source) {
    if (!opt) continue;
    const name: string =
      typeof opt.name === "string"
        ? opt.name
        : typeof opt.label === "string"
        ? opt.label
        : "";
    if (!name) continue;

    const valuesSource =
      opt.values || opt.options || opt.value_list || opt.valueList;
    const values = Array.isArray(valuesSource)
      ? valuesSource.map((v: any) => String(v))
      : [];
    if (!values.length) continue;

    result.push({ name, values });
  }

  return result.length > 0 ? result : undefined;
}

export function mapRawProduct(raw: RawProduct): Product {
  const bestDeal = raw.best_deal ? normalizeDeal(raw.best_deal, raw.id) : undefined;
  const allDeals = Array.isArray(raw.all_deals)
    ? raw.all_deals.map((d) => normalizeDeal(d, raw.id))
    : undefined;
  const options = normalizeOptions(raw);

  return {
    id: raw.id,
    title: raw.title,
    description: stripHtml(raw.description),
    price: raw.price,
    currency: raw.currency,
    imageUrl: raw.image_url,
    inventoryQuantity: raw.inventory_quantity,
    merchantId: raw.merchant_id,
    merchantName: raw.merchant_name,
    creatorMentions: raw.creator_mentions,
    fromCreatorDirectly: raw.from_creator_directly,
    detailUrl: raw.detail_url,
    bestDeal,
    allDeals,
    options,
  };
}

export function mapRawProducts(raws: RawProduct[] | undefined | null): Product[] {
  if (!raws) return [];
  return raws.map(mapRawProduct);
}

// TODO: creator_mentions / from_creator_directly / detail_url 需要后端在 RawProduct 中提供。
// 当前前端只做字段占位和 UI 消费，具体意义在接口文档中定义。
