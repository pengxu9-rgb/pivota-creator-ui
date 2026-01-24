'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/CartProvider";
import { getCreatorBySlug } from "@/config/creatorAgents";
import type { Module, PDPPayload, Variant } from "@/features/pdp/types";
import { BeautyPDPContainer } from "@/features/pdp/containers/BeautyPDPContainer";
import { GenericPDPContainer } from "@/features/pdp/containers/GenericPDPContainer";
import { isBeautyProduct } from "@/features/pdp/utils/isBeautyProduct";

function pickPdpPayload(raw: any): PDPPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw.pdp_payload ?? raw.pdpPayload ?? raw.payload ?? null;
  return payload && typeof payload === "object" ? (payload as PDPPayload) : null;
}

function safeString(input: unknown): string {
  if (typeof input === "string") return input;
  if (input == null) return "";
  return String(input);
}

function safeNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function buildFallbackPdpPayload(args: {
  merchantId: string;
  productId: string;
  productDetail: any;
}): PDPPayload {
  const currency =
    safeString(args.productDetail?.currency || args.productDetail?.currency_code) || "USD";
  const basePrice = safeNumber(args.productDetail?.price) ?? 0;
  const title = safeString(args.productDetail?.title) || args.productId;
  const description = safeString(args.productDetail?.descriptionHtml || args.productDetail?.description);
  const imageUrl = safeString(args.productDetail?.imageUrl || args.productDetail?.image_url || args.productDetail?.image) || "";
  const imagesRaw = args.productDetail?.images;
  const images = Array.isArray(imagesRaw) ? imagesRaw.map((x) => safeString(x)).filter(Boolean) : [];
  const gallery = (images.length ? images : imageUrl ? [imageUrl] : []).slice(0, 24);

  const variantsRaw = args.productDetail?.variants;
  const variantsList = Array.isArray(variantsRaw) ? variantsRaw : [];
  const mappedVariants: Variant[] =
    variantsList.length > 0
      ? variantsList
          .map((v: any) => {
            const variantId = safeString(v?.id || v?.variant_id || v?.sku_id) || args.productId;
            const variantTitle = safeString(v?.title) || title;
            const variantPrice = safeNumber(v?.price) ?? basePrice;
            const invQty = safeNumber(v?.inventoryQuantity ?? v?.inventory_quantity);
            const optionsObj = v?.options && typeof v.options === "object" ? v.options : null;
            const options = optionsObj
              ? Object.entries(optionsObj).map(([name, value]) => ({ name, value: safeString(value) }))
              : undefined;
            const vImg = safeString(v?.imageUrl || v?.image_url) || undefined;
            const inStock = typeof invQty === "number" ? invQty > 0 : undefined;

            return {
              variant_id: variantId,
              sku_id: safeString(v?.sku) || undefined,
              title: variantTitle,
              ...(options?.length ? { options } : {}),
              price: {
                current: { amount: variantPrice, currency },
              },
              ...(inStock != null ? { availability: { in_stock: inStock, available_quantity: invQty ?? undefined } } : {}),
              ...(vImg ? { image_url: vImg } : {}),
            } as Variant;
          })
          .filter((v: Variant) => Boolean(v.variant_id))
      : [
          {
            variant_id: args.productId,
            title,
            price: { current: { amount: basePrice, currency } },
            availability: {
              in_stock:
                (safeNumber(args.productDetail?.inventoryQuantity ?? args.productDetail?.inventory_quantity) ?? 1) > 0,
              available_quantity:
                safeNumber(args.productDetail?.inventoryQuantity ?? args.productDetail?.inventory_quantity) ?? undefined,
            },
            ...(imageUrl ? { image_url: imageUrl } : {}),
          },
        ];

  const defaultVariantId = mappedVariants[0]?.variant_id || args.productId;

  const now = Date.now();
  const requestId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `req_${now}`;

  const modules: Module[] = [
    {
      module_id: "media_gallery",
      type: "media_gallery",
      priority: 10,
      title: "Media",
      data: {
        items: gallery.map((url) => ({ type: "image", url })),
      },
    },
    {
      module_id: "price_promo",
      type: "price_promo",
      priority: 20,
      title: "Price",
      data: {
        price: { amount: basePrice, currency },
      },
    },
    {
      module_id: "product_details",
      type: "product_details",
      priority: 60,
      title: "Details",
      data: {
        sections: [
          {
            heading: "Description",
            content_type: "text",
            content: description || safeString(args.productDetail?.description) || "",
          },
        ],
      },
    },
  ];

  return {
    schema_version: "pdp.v1",
    page_type: "product_detail",
    tracking: {
      page_request_id: requestId,
      entry_point: "creator-agent-ui:fallback",
    },
    product: {
      product_id: args.productId,
      title,
      image_url: imageUrl || undefined,
      description: description || undefined,
      merchant_id: args.merchantId,
      default_variant_id: defaultVariantId,
      variants: mappedVariants,
      price: { current: { amount: basePrice, currency } },
      availability: {
        in_stock:
          mappedVariants.some((v) => v.availability?.in_stock === true) ||
          (safeNumber(args.productDetail?.inventoryQuantity ?? args.productDetail?.inventory_quantity) ?? 1) > 0,
      },
    },
    x_recommendations_state: "loading",
    modules,
    actions: [
      {
        action_type: "add_to_cart",
        label: "Add to Cart",
        priority: 10,
        target: { variant_id: defaultVariantId },
      },
      {
        action_type: "buy_now",
        label: "Buy Now",
        priority: 20,
        target: { variant_id: defaultVariantId },
      },
    ],
  };
}

export default function CreatorProductDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addItem, clear, close } = useCart();

  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const productIdParam = params?.productId;
  const productId = Array.isArray(productIdParam) ? productIdParam[0] : productIdParam;

  const creator = slug ? getCreatorBySlug(slug) : undefined;

  const merchantId =
    searchParams?.get("merchant_id") ||
    searchParams?.get("merchantId") ||
    "";

  const forcedTemplate = (searchParams?.get("pdp") || "").toLowerCase();
  const debug = Boolean(searchParams?.get("pdp_debug") || searchParams?.get("debug"));

  const [pdpState, setPdpState] = useState<{
    loading: boolean;
    error: string | null;
    payload: PDPPayload | null;
  }>({ loading: true, error: null, payload: null });
  const [pdpNonce, setPdpNonce] = useState(0);

  const resolvedMode = useMemo(() => {
    if (forcedTemplate === "beauty") return "beauty";
    if (forcedTemplate === "generic") return "generic";
    if (pdpState.payload) return isBeautyProduct(pdpState.payload.product) ? "beauty" : "generic";
    return "generic";
  }, [forcedTemplate, pdpState.payload]);

  useEffect(() => {
    if (!productId) return;

    let cancelled = false;
    const run = async () => {
      try {
        setPdpState({ loading: true, error: null, payload: null });
        const res = await fetch("/api/creator-agent/pdp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(merchantId ? { merchantId } : {}),
            productId,
            debug,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail = body?.detail || "Failed to load product";
          throw new Error(detail);
        }
        const data = await res.json();
        const pdp_payload = pickPdpPayload(data);
        if (!pdp_payload) throw new Error("PDP payload missing");
        if (cancelled) return;

        const nextPayload: PDPPayload = { ...pdp_payload, x_recommendations_state: "ready" };
        setPdpState({ loading: false, error: null, payload: nextPayload });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);

        // Fallback: if `get_pdp` fails (common for external products / slow upstream),
        // fetch minimal product detail and build a safe PDPPayload so the page can render.
        try {
          const detailRes = await fetch("/api/creator-agent/product-detail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ merchantId, productId }),
          });
          if (detailRes.ok) {
            const detailJson = await detailRes.json();
            const productDetail = (detailJson && typeof detailJson === "object" ? (detailJson as any).product : null) || null;
            if (productDetail && !cancelled) {
              const fallback = buildFallbackPdpPayload({ merchantId, productId, productDetail });
              setPdpState({ loading: false, error: null, payload: fallback });
              return;
            }
          }
        } catch {
          // ignore and show error below
        }

        setPdpState({
          loading: false,
          error: msg || "Failed to load product",
          payload: null,
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debug, merchantId, pdpNonce, productId]);

  const handleAddToCart = (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => {
    if (!creator || !pdpState.payload) return;
    const variant = args.variant;
    const price =
      variant.price?.current.amount ??
      pdpState.payload.product.price?.current.amount ??
      0;
    const currency =
      variant.price?.current.currency ??
      pdpState.payload.product.price?.current.currency ??
      "USD";
    const imageUrl = variant.image_url || pdpState.payload.product.image_url || undefined;
    const selectedOptions = Array.isArray(variant.options)
      ? Object.fromEntries(variant.options.map((o) => [o.name, o.value]))
      : undefined;
    const merchant = String(args.merchant_id || pdpState.payload.product.merchant_id || merchantId || "").trim() || undefined;
    const offerId = String(args.offer_id || "").trim() || undefined;

    addItem({
      id: [pdpState.payload.product.product_id, variant.variant_id, offerId || merchant || "unknown"].join(":"),
      title: pdpState.payload.product.title,
      price: typeof price === "number" && Number.isFinite(price) ? price : 0,
      currency,
      imageUrl,
      quantity: Math.max(1, Math.floor(args.quantity || 1)),
      productId: pdpState.payload.product.product_id,
      merchantId: merchant,
      offerId,
      creatorId: creator.id,
      creatorSlug: creator.slug,
      creatorName: creator.name,
      variantId: variant.variant_id,
      variantSku: variant.sku_id,
      selectedOptions,
    });
  };

  const handleBuyNow = (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => {
    clear();
    handleAddToCart(args);
    close();
    router.push("/checkout");
  };

  if (!creator) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Creator not found.</div>
      </main>
    );
  }

  if (!productId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Missing product id.</div>
      </main>
    );
  }


  if (pdpState.loading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="h-5 w-40 bg-muted/30 rounded animate-pulse" />
          <div className="mt-4 h-64 bg-muted/20 rounded-2xl animate-pulse" />
          <div className="mt-4 space-y-2">
            <div className="h-4 w-3/4 bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted/20 rounded animate-pulse" />
          </div>
          <div className="mt-6 text-sm text-muted-foreground">Loading product…</div>
        </div>
      </main>
    );
  }

  if (pdpState.error || !pdpState.payload) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="max-w-md mx-auto px-4 py-10">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="text-sm font-semibold">Failed to load product</div>
            <div className="mt-1 text-sm text-muted-foreground">{pdpState.error || "Unknown error"}</div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => {
                  setPdpState({ loading: false, error: null, payload: null });
                  setPdpNonce((n) => n + 1);
                }}
                className="flex-1"
              >
                Retry
              </Button>
              <Button
                variant="outline"
                onClick={() => router.back()}
                className="flex-1"
              >
                Back
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen lovable-pdp">
      {resolvedMode === "beauty" ? (
        <BeautyPDPContainer payload={pdpState.payload} onAddToCart={handleAddToCart} onBuyNow={handleBuyNow} />
      ) : (
        <GenericPDPContainer payload={pdpState.payload} onAddToCart={handleAddToCart} onBuyNow={handleBuyNow} />
      )}
    </main>
  );
}
