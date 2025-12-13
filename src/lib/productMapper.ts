import type {
  Product,
  ProductBestDeal,
  ProductOption,
  ProductVariant,
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
  const thresholdQuantity =
    typeof raw.thresholdQuantity === "number"
      ? raw.thresholdQuantity
      : typeof raw.threshold_quantity === "number"
      ? raw.threshold_quantity
      : undefined;

  return {
    dealId,
    type: raw.type,
    label: raw.label,
    discountPercent,
    thresholdQuantity,
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

function normalizeImages(raw: any): string[] | undefined {
  const src = (raw as any).images;
  const urls: string[] = [];

  if (Array.isArray(src)) {
    for (const img of src) {
      if (!img) continue;
      if (typeof img === "string") {
        urls.push(img);
      } else if (typeof img.url === "string") {
        urls.push(img.url);
      } else if (typeof img.src === "string") {
        urls.push(img.src);
      }
    }
  }

  if (typeof raw.image_url === "string" && raw.image_url) {
    if (!urls.includes(raw.image_url)) {
      urls.unshift(raw.image_url);
    }
  }

  return urls.length > 0 ? urls : undefined;
}

function normalizeVariants(raw: any): ProductVariant[] | undefined {
  const src =
    raw?.attributes?.variants && Array.isArray(raw.attributes.variants)
      ? raw.attributes.variants
      : Array.isArray(raw?.variants)
      ? raw.variants
      : null;

  if (!src) return undefined;

  const variants: ProductVariant[] = [];
  for (const v of src) {
    if (!v) continue;
    const id = String(v.variant_id || v.id || "").trim();
    const title = String(v.title || "").trim();
    if (!id) continue;

    const priceValue =
      typeof v.price === "number"
        ? v.price
        : typeof raw.price === "number"
        ? raw.price
        : 0;

    const inventoryQuantity =
      typeof v.inventory_quantity === "number"
        ? v.inventory_quantity
        : undefined;

    let options: Record<string, string> | undefined;
    if (v.options && typeof v.options === "object") {
      options = {};
      for (const [k, value] of Object.entries(v.options)) {
        if (value == null) continue;
        options[String(k)] = String(value);
      }
    }

    const imageUrl =
      typeof v.image_url === "string"
        ? v.image_url
        : typeof (v as any).image?.src === "string"
        ? (v as any).image.src
        : undefined;

    variants.push({
      id,
      title,
      price: priceValue,
      sku: v.sku ? String(v.sku) : undefined,
      inventoryQuantity,
      options,
      imageUrl,
    });
  }

  return variants.length > 0 ? variants : undefined;
}

export function mapRawProduct(raw: RawProduct): Product {
  const bestDeal = raw.best_deal ? normalizeDeal(raw.best_deal, raw.id) : undefined;
  const allDeals = Array.isArray(raw.all_deals)
    ? raw.all_deals.map((d) => normalizeDeal(d, raw.id))
    : undefined;
  const options = normalizeOptions(raw);
  const images = normalizeImages(raw);
  const variants = normalizeVariants(raw);

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
    images,
    variants,
  };
}

export function mapRawProducts(raws: RawProduct[] | undefined | null): Product[] {
  if (!raws) return [];
  return raws.map(mapRawProduct);
}

// TODO: creator_mentions / from_creator_directly / detail_url 需要后端在 RawProduct 中提供。
// 当前前端只做字段占位和 UI 消费，具体意义在接口文档中定义。
