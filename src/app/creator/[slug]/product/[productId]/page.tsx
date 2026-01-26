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
import { getPdpV2Personalization, type UgcCapabilities } from "@/lib/accountsClient";

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

function safeUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

function getExternalRedirectUrlFromOffer(offer: unknown): string {
  if (!offer || typeof offer !== "object") return "";
  const o = offer as any;

  const direct =
    safeUrl(o.external_redirect_url) ||
    safeUrl(o.externalRedirectUrl) ||
    safeUrl(o.redirect_url) ||
    safeUrl(o.redirectUrl);
  if (direct) return direct;

  const action = o.action && typeof o.action === "object" ? (o.action as any) : null;
  if (!action) return "";

  return (
    safeUrl(action.external_redirect_url) ||
    safeUrl(action.externalRedirectUrl) ||
    safeUrl(action.redirect_url) ||
    safeUrl(action.redirectUrl) ||
    safeUrl(action.url) ||
    safeUrl(action.href)
  );
}

function getExternalRedirectUrlFromProduct(product: unknown): string {
  if (!product || typeof product !== "object") return "";
  const p = product as any;
  return (
    safeUrl(p.external_redirect_url) ||
    safeUrl(p.externalRedirectUrl) ||
    safeUrl(p.redirect_url) ||
    safeUrl(p.redirectUrl) ||
    safeUrl(p.detail_url) ||
    safeUrl(p.detailUrl)
  );
}

function resolveExternalRedirectUrl(payload: PDPPayload, args?: { offer_id?: string; merchant_id?: string }): string {
  const offerId = typeof args?.offer_id === "string" ? args.offer_id.trim() : "";
  const merchantId = typeof args?.merchant_id === "string" ? args.merchant_id.trim() : "";

  const offersAny = (payload as any).offers;
  const offers = Array.isArray(offersAny) ? offersAny : [];

  if (offerId) {
    const found = offers.find((o: any) => typeof o?.offer_id === "string" && o.offer_id === offerId);
    const url = getExternalRedirectUrlFromOffer(found);
    if (url) return url;
  }

  if (merchantId) {
    const candidates = offers.filter((o: any) => typeof o?.merchant_id === "string" && o.merchant_id === merchantId);
    for (const c of candidates) {
      const url = getExternalRedirectUrlFromOffer(c);
      if (url) return url;
    }
  }

  if (typeof (payload as any).default_offer_id === "string") {
    const found = offers.find(
      (o: any) => typeof o?.offer_id === "string" && o.offer_id === (payload as any).default_offer_id,
    );
    const url = getExternalRedirectUrlFromOffer(found);
    if (url) return url;
  }

  for (const o of offers) {
    const url = getExternalRedirectUrlFromOffer(o);
    if (url) return url;
  }

  return getExternalRedirectUrlFromProduct((payload as any).product);
}

function buildRedirectNotice(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host ? `Redirecting to ${host} in a new tab…` : "Redirecting to external website in a new tab…";
  } catch {
    return "Redirecting to external website in a new tab…";
  }
}

function isExternalOnlyProduct(payload: PDPPayload | null, args?: { merchant_id?: string; offer_id?: string }): boolean {
  if (!payload) return false;
  const offerId = safeString(args?.offer_id).trim().toLowerCase();
  const merchantId = safeString(args?.merchant_id).trim().toLowerCase();

  if (merchantId === "external_seed") return true;
  if (offerId && offerId.includes("external_seed")) return true;

  const productGroupId = safeString((payload as any).product_group_id).trim().toLowerCase();
  if (productGroupId.startsWith("pg:external:") || productGroupId.startsWith("pg:external_seed:")) return true;

  const productId = safeString(payload.product?.product_id).trim().toLowerCase();
  if (productId.startsWith("ext_") || productId.startsWith("ext:")) return true;

  const offersAny = (payload as any).offers;
  const offers = Array.isArray(offersAny) ? offersAny : [];
  if (offers.some((o: any) => safeString(o?.merchant_id).trim().toLowerCase() === "external_seed")) return true;

  return false;
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
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);
  const [ugcCapabilities, setUgcCapabilities] = useState<UgcCapabilities | null>({
    canUploadMedia: false,
    canWriteReview: false,
    canAskQuestion: false,
    reasons: {
      upload: "NOT_AUTHENTICATED",
      review: "NOT_AUTHENTICATED",
      question: "NOT_AUTHENTICATED",
    },
  });

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

  useEffect(() => {
    let cancelled = false;
    const pid = String(pdpState.payload?.product?.product_id || "").trim();
    if (!pid) return;
    const pgid = String(pdpState.payload?.product_group_id || "").trim() || null;

    setUgcCapabilities({
      canUploadMedia: false,
      canWriteReview: false,
      canAskQuestion: false,
      reasons: {
        upload: "NOT_AUTHENTICATED",
        review: "NOT_AUTHENTICATED",
        question: "NOT_AUTHENTICATED",
      },
    });

    (async () => {
      try {
        const caps = await getPdpV2Personalization({
          productId: pid,
          ...(pgid ? { productGroupId: pgid } : {}),
        });
        if (cancelled) return;
        if (caps) setUgcCapabilities(caps);
      } catch (err: any) {
        if (cancelled) return;
        if (err?.code === "NOT_AUTHENTICATED" || err?.status === 401) return;
        // Keep defaults.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdpState.payload?.product?.product_id, pdpState.payload?.product_group_id]);

  useEffect(() => {
    if (!redirectNotice) return;
    const t = window.setTimeout(() => setRedirectNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [redirectNotice]);

  const openExternalRedirect = (url: string) => {
    if (!url) return;
    setRedirectNotice(buildRedirectNotice(url));
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = url;
    }
  };

  const resolveRedirectViaProductDetail = async (args: { merchant_id?: string; offer_id?: string }): Promise<string> => {
    if (!pdpState.payload) return "";

    const pid = safeString(pdpState.payload.product?.product_id || productId).trim();
    if (!pid) return "";

    let mid =
      typeof args.merchant_id === "string" ? args.merchant_id.trim() : "";
    if (!mid) mid = safeString(pdpState.payload.product?.merchant_id || merchantId).trim();

    const offersAny = (pdpState.payload as any).offers;
    const offers = Array.isArray(offersAny) ? offersAny : [];

    const offerId = typeof args.offer_id === "string" ? args.offer_id.trim() : "";
    if (!mid && offerId) {
      const found = offers.find((o: any) => safeString(o?.offer_id).trim() === offerId);
      mid = safeString(found?.merchant_id).trim();
    }

    if (!mid && typeof (pdpState.payload as any).default_offer_id === "string") {
      const found = offers.find(
        (o: any) => safeString(o?.offer_id).trim() === safeString((pdpState.payload as any).default_offer_id).trim(),
      );
      mid = safeString(found?.merchant_id).trim();
    }

    if (!mid && offers.length > 0) {
      mid = safeString(offers[0]?.merchant_id).trim();
    }

    if (!mid) return "";

    try {
      const res = await fetch("/api/creator-agent/product-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: mid,
          productId: pid,
        }),
      });
      if (!res.ok) return "";
      const data = await res.json().catch(() => null);
      const detail = data && typeof data === "object" ? (data as any).product : null;
      return getExternalRedirectUrlFromProduct(detail);
    } catch {
      return "";
    }
  };

  const resolveRedirectViaGateway = async (args: { merchant_id?: string; offer_id?: string }): Promise<string> => {
    if (!pdpState.payload) return "";
    const pid = safeString(pdpState.payload.product?.product_id || productId).trim();
    if (!pid) return "";

    const mid =
      typeof args.merchant_id === "string"
        ? args.merchant_id
        : safeString(pdpState.payload.product?.merchant_id || merchantId).trim() || undefined;

    try {
      const res = await fetch("/api/creator-agent/resolve-product-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: pid,
          ...(mid ? { merchantId: mid } : {}),
          limit: 12,
        }),
      });
      if (!res.ok) return "";
      const data = await res.json();

      const offers =
        Array.isArray((data as any)?.offers)
          ? (data as any).offers
          : Array.isArray((data as any)?.output?.offers)
            ? (data as any).output.offers
            : [];

      for (const offer of offers) {
        const url = getExternalRedirectUrlFromOffer(offer);
        if (url) return url;
      }
    } catch {
      // ignore
    }

    return "";
  };

  const handleAddToCart = (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => {
    if (!creator || !pdpState.payload) return;
    const redirectUrl = resolveExternalRedirectUrl(pdpState.payload, args);
    if (redirectUrl) {
      openExternalRedirect(redirectUrl);
      return;
    }

    const isExternalOnly = isExternalOnlyProduct(pdpState.payload, args);
    if (isExternalOnly) {
      void (async () => {
        const viaDetail = await resolveRedirectViaProductDetail(args);
        if (viaDetail) {
          openExternalRedirect(viaDetail);
          return;
        }
        const viaGateway = await resolveRedirectViaGateway(args);
        if (viaGateway) {
          openExternalRedirect(viaGateway);
          return;
        }
        setRedirectNotice("This item is only available on an external site (redirect unavailable).");
      })();
      return;
    }

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

  const handleBuyNow = async (args: { variant: Variant; quantity: number; merchant_id?: string; offer_id?: string }) => {
    if (!creator || !pdpState.payload) return;

    const redirectUrl = resolveExternalRedirectUrl(pdpState.payload, args);
    if (redirectUrl) {
      openExternalRedirect(redirectUrl);
      return;
    }

    const isExternalOnly = isExternalOnlyProduct(pdpState.payload, args);
    if (isExternalOnly) {
      const viaDetail = await resolveRedirectViaProductDetail(args);
      if (viaDetail) {
        openExternalRedirect(viaDetail);
        return;
      }
      const viaGateway = await resolveRedirectViaGateway(args);
      if (viaGateway) {
        openExternalRedirect(viaGateway);
        return;
      }
      setRedirectNotice("This item is only available on an external site (redirect unavailable).");
      return;
    }

    const resolved = await resolveRedirectViaGateway(args);
    if (resolved) {
      openExternalRedirect(resolved);
      return;
    }

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
      {redirectNotice ? (
        <div
          role="status"
          className="fixed top-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-foreground shadow backdrop-blur"
        >
          {redirectNotice}
        </div>
      ) : null}
      {resolvedMode === "beauty" ? (
        <BeautyPDPContainer
          payload={pdpState.payload}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          ugcCapabilities={ugcCapabilities}
        />
      ) : (
        <GenericPDPContainer
          payload={pdpState.payload}
          onAddToCart={handleAddToCart}
          onBuyNow={handleBuyNow}
          ugcCapabilities={ugcCapabilities}
        />
      )}
    </main>
  );
}
