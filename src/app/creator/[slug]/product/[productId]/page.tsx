'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/CartProvider";
import { getCreatorBySlug } from "@/config/creatorAgents";
import type { Module, Offer, PDPPayload, RecommendationsData, Variant } from "@/features/pdp/types";
import { BeautyPDPContainer } from "@/features/pdp/containers/BeautyPDPContainer";
import { GenericPDPContainer } from "@/features/pdp/containers/GenericPDPContainer";
import { isBeautyProduct } from "@/features/pdp/utils/isBeautyProduct";

type ResolveResponse = {
  status?: string;
  product_group_id?: string;
  offers_count?: number;
  offers?: Offer[];
  default_offer_id?: string;
  best_price_offer_id?: string;
  cache?: { hit?: boolean; age_ms?: number; ttl_ms?: number };
};

type RecommendationsResponse = {
  strategy?: string;
  items?: RecommendationsData["items"];
};

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: c }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function summarizeOffer(offer: Offer) {
  const eta = offer.shipping?.eta_days_range;
  const etaLabel = eta ? `${eta[0]}–${eta[1]}d` : "ETA unknown";
  const returnsLabel =
    offer.returns?.return_window_days != null
      ? offer.returns.free_returns
        ? `${offer.returns.return_window_days}d free returns`
        : `${offer.returns.return_window_days}d returns`
      : "Returns unknown";
  return { etaLabel, returnsLabel };
}

function pickPdpPayload(raw: any): PDPPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw.pdp_payload ?? raw.pdpPayload ?? raw.payload ?? null;
  return payload && typeof payload === "object" ? (payload as PDPPayload) : null;
}

function hasRecommendationItems(payload: PDPPayload): boolean {
  const m = payload.modules.find((x) => x.type === "recommendations");
  const items = (m?.data as any)?.items;
  return Array.isArray(items) && items.length > 0;
}

function upsertRecommendations(payload: PDPPayload, recs: RecommendationsData): PDPPayload {
  const existing = payload.modules.findIndex((m) => m.type === "recommendations");
  const nextModules: Module[] =
    existing >= 0
      ? payload.modules.map((m, idx) => (idx === existing ? { ...m, data: recs } : m))
      : [
          ...payload.modules,
          {
            module_id: "recommendations",
            type: "recommendations",
            priority: 90,
            title: "Similar",
            data: recs,
          },
        ];

  return {
    ...payload,
    modules: nextModules,
    x_recommendations_state: "ready",
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

  const [resolveState, setResolveState] = useState<{
    loading: boolean;
    error: string | null;
    data: ResolveResponse | null;
  }>({ loading: false, error: null, data: null });
  const [resolveNonce, setResolveNonce] = useState(0);

  const [pdpState, setPdpState] = useState<{
    loading: boolean;
    error: string | null;
    payload: PDPPayload | null;
  }>({ loading: false, error: null, payload: null });
  const [pdpNonce, setPdpNonce] = useState(0);

  const resolvedMode = useMemo(() => {
    if (forcedTemplate === "beauty") return "beauty";
    if (forcedTemplate === "generic") return "generic";
    if (pdpState.payload) return isBeautyProduct(pdpState.payload.product) ? "beauty" : "generic";
    return "generic";
  }, [forcedTemplate, pdpState.payload]);

  const basePath = useMemo(() => {
    if (!creator?.slug || !productId) return null;
    return `/creator/${encodeURIComponent(creator.slug)}/product/${encodeURIComponent(productId)}`;
  }, [creator?.slug, productId]);

  const setMerchantInUrl = useCallback((args: { merchantId: string; offerId?: string }) => {
    if (!basePath) return;
    const next = new URLSearchParams(searchParams?.toString() || "");
    next.set("merchant_id", args.merchantId);
    if (args.offerId) next.set("offer_id", args.offerId);
    router.replace(`${basePath}?${next.toString()}`);
  }, [basePath, router, searchParams]);

  useEffect(() => {
    if (!basePath || !productId) return;
    if (merchantId) return;

    let cancelled = false;
    const run = async () => {
      try {
        setResolveState({ loading: true, error: null, data: null });
        const res = await fetch("/api/creator-agent/resolve-product-candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            limit: 10,
            debug,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail = body?.detail || "Failed to resolve sellers";
          throw new Error(detail);
        }
        const data = (await res.json()) as ResolveResponse;
        if (cancelled) return;

        const offers = Array.isArray(data.offers) ? data.offers : [];
        const count = typeof data.offers_count === "number" ? data.offers_count : offers.length;

        if (count === 1 && offers[0]?.merchant_id) {
          setMerchantInUrl({ merchantId: offers[0].merchant_id, offerId: offers[0].offer_id });
          return;
        }

        setResolveState({ loading: false, error: null, data });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setResolveState({ loading: false, error: msg || "Can’t load sellers for this product right now. Please retry.", data: null });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [basePath, debug, merchantId, productId, resolveNonce, setMerchantInUrl]);

  useEffect(() => {
    if (!merchantId || !productId) return;

    let cancelled = false;
    const run = async () => {
      try {
        setPdpState({ loading: true, error: null, payload: null });
        const res = await fetch("/api/creator-agent/pdp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId,
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

        // Don’t block first paint on recommendations. Always show the frame first,
        // then progressively hydrate the Similar section.
        const nextPayload: PDPPayload = {
          ...pdp_payload,
          x_recommendations_state: hasRecommendationItems(pdp_payload) ? "ready" : "loading",
        };
        setPdpState({ loading: false, error: null, payload: nextPayload });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
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
    if (!merchantId || !productId || !pdpState.payload) return;
    if (pdpState.payload.x_recommendations_state !== "loading") return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/creator-agent/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId,
            productId,
            limit: 6,
            debug,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail = body?.detail || "Failed to load recommendations";
          throw new Error(detail);
        }

        const json = (await res.json()) as RecommendationsResponse;
        const items = Array.isArray(json.items) ? json.items : [];
        const recs: RecommendationsData = { strategy: json.strategy, items };

        if (cancelled) return;
        setPdpState((prev) => {
          if (!prev.payload) return prev;
          return { ...prev, payload: upsertRecommendations(prev.payload, recs) };
        });
      } catch {
        if (cancelled) return;
        setPdpState((prev) => {
          if (!prev.payload) return prev;
          return { ...prev, payload: { ...prev.payload, x_recommendations_state: "ready" } };
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debug, merchantId, pdpState.payload, productId]);

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
    const merchant = String(args.merchant_id || merchantId || "").trim() || undefined;
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

  const chooseSellerGate = !merchantId && !pdpState.payload;

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

  if (chooseSellerGate) {
    const offers = resolveState.data?.offers || [];
    const defaultOfferId = resolveState.data?.default_offer_id;
    const bestPriceOfferId = resolveState.data?.best_price_offer_id;

    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="max-w-md mx-auto px-4 py-6">
          <h1 className="text-lg font-semibold">Choose a seller</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This product is available from multiple sellers. Please pick one to continue.
          </p>

          {resolveState.loading ? (
            <div className="mt-6 text-sm text-muted-foreground">Loading sellers…</div>
          ) : null}

          {resolveState.error ? (
            <div className="mt-6 rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-medium">Failed to load product</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Can’t load sellers for this product right now. Please retry.
              </div>
            <div className="mt-4">
              <Button
                onClick={() => {
                  setResolveState({ loading: false, error: null, data: null });
                  setResolveNonce((n) => n + 1);
                }}
                className="w-full"
              >
                Retry
              </Button>
              </div>
            </div>
          ) : null}

          {!resolveState.loading && !resolveState.error ? (
            <div className="mt-6 space-y-3">
              {offers.map((offer) => {
                const { etaLabel, returnsLabel } = summarizeOffer(offer);
                const isDefault = defaultOfferId && offer.offer_id === defaultOfferId;
                const isBestPrice = bestPriceOfferId && offer.offer_id === bestPriceOfferId;
                return (
                  <div
                    key={offer.offer_id}
                    className="rounded-2xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">
                          {offer.merchant_name || offer.merchant_id}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {etaLabel} · {returnsLabel}
                        </div>
                        <div className="mt-2 text-base font-bold">
                          {formatPrice(offer.price.amount, offer.price.currency)}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          {isDefault ? (
                            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium">
                              Recommended
                            </span>
                          ) : null}
                          {isBestPrice ? (
                            <span className="rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-[11px] font-medium">
                              Best price
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        onClick={() => setMerchantInUrl({ merchantId: offer.merchant_id, offerId: offer.offer_id })}
                        className="shrink-0"
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
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
