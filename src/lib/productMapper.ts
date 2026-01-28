import type {
  Product,
  ProductBestDeal,
  ProductOption,
  ProductVariant,
  RawProduct,
} from "@/types/product";
import { formatDescriptionText, hasHtmlTags } from "@/lib/formatDescriptionText";

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

  const freeShipping =
    raw.freeShipping === true || raw.free_shipping === true ? true : undefined;
  const minSubtotal =
    typeof raw.minSubtotal === "number"
      ? raw.minSubtotal
      : typeof raw.min_subtotal === "number"
      ? raw.min_subtotal
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
    freeShipping,
    minSubtotal,
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

  if (!src) {
    // Some upstreams omit `variants` for single-SKU products but still provide
    // a Shopify variant_id via product_ref / sku_id. Checkout requires variant_id.
    const ref = raw?.product_ref || raw?.productRef || null;
    const refVariantId =
      (ref && (ref.variant_id || ref.variantId || ref.sku_id || ref.skuId)) ||
      raw?.variant_id ||
      raw?.variantId ||
      raw?.sku_id ||
      raw?.skuId ||
      null;
    const id = refVariantId != null ? String(refVariantId).trim() : "";
    if (!id) return undefined;

    const priceValue = typeof raw?.price === "number" ? raw.price : 0;
    const inventoryQuantity =
      typeof raw?.inventory_quantity === "number" ? raw.inventory_quantity : undefined;
    const title = "Default";
    const skuRaw =
      (ref && (ref.sku_id || ref.skuId)) || raw?.sku_id || raw?.skuId || undefined;
    const sku = skuRaw != null ? String(skuRaw) : undefined;

    return [
      {
        id,
        title,
        price: priceValue,
        sku,
        inventoryQuantity,
        options: undefined,
        imageUrl: typeof raw?.image_url === "string" ? raw.image_url : undefined,
      },
    ];
  }

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
  const variantsComplete =
    (raw as any)?.attributes?.variants && Array.isArray((raw as any).attributes.variants)
      ? true
      : Array.isArray((raw as any)?.variants)
      ? true
      : false;

  const descriptionRaw = typeof raw.description === "string" ? raw.description : "";
  const descriptionText = formatDescriptionText(descriptionRaw);

  return {
    id: raw.id,
    title: raw.title,
    description: descriptionText,
    descriptionHtml:
      hasHtmlTags(descriptionRaw) && descriptionRaw.trim().length > 0 ? descriptionRaw : undefined,
    price: raw.price,
    currency: raw.currency || (raw as any).currency_code,
    imageUrl: raw.image_url,
    inventoryQuantity: raw.inventory_quantity,
    merchantId: raw.merchant_id,
    merchantName: raw.merchant_name,
    isCreatorPick: Boolean((raw as any).creator_pick),
    creatorPickRank:
      typeof (raw as any).creator_pick_rank === "number"
        ? (raw as any).creator_pick_rank
        : undefined,
    creatorMentions: raw.creator_mentions,
    fromCreatorDirectly: raw.from_creator_directly,
    detailUrl: raw.detail_url,
    bestDeal,
    allDeals,
    options,
    images,
    variants,
    variantsComplete,
  };
}

export function mapRawProducts(raws: RawProduct[] | undefined | null): Product[] {
  if (!raws) return [];
  return raws.map(mapRawProduct);
}

// TODO: creator_mentions / from_creator_directly / detail_url 需要后端在 RawProduct 中提供。
// 当前前端只做字段占位和 UI 消费，具体意义在接口文档中定义。
