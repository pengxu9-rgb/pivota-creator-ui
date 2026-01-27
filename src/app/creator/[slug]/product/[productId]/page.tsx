'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getCreatorBySlug } from "@/config/creatorAgents";
import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";
import { ProductDescription } from "@/components/product/ProductDescription";

export default function CreatorProductDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const productIdParam = params?.productId;
  const productId =
    Array.isArray(productIdParam) ? productIdParam[0] : productIdParam;

  const merchantId =
    searchParams?.get("merchant_id") ||
    searchParams?.get("merchantId") ||
    "";

  const creator = slug ? getCreatorBySlug(slug) : undefined;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const { addItem, clear, close } = useCart();

  useEffect(() => {
    if (!creator || !productId || !merchantId) {
      setLoading(false);
      if (!creator) {
        setError("Creator not found.");
      } else {
        setError("Missing product or merchant information.");
      }
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/creator-agent/product-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId,
            productId,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail =
            body?.detail || `Failed to load product detail (status ${res.status})`;
          throw new Error(detail);
        }

        const data = (await res.json()) as { product?: Product };
        if (!cancelled) {
          if (data.product) {
            setProduct(data.product);
            setSelectedOptions({});
            setSelectedVariantId(null);
            setActiveImageIndex(0);
            setError(null);
          } else {
            setError("Product not found.");
          }
        }
      } catch (err) {
        console.error("[creator product detail] load error", err);
        if (!cancelled) {
          setError("Failed to load product detail.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [creator, merchantId, productId]);

  // Initialise selection state when product loads.
  useEffect(() => {
    if (!product) return;

    const nextSelected: Record<string, string> = {};

    if (product.variants && product.variants.length > 0) {
      const first = product.variants[0];
      if (first.options) {
        for (const [name, value] of Object.entries(first.options)) {
          if (value != null) {
            nextSelected[name] = String(value);
          }
        }
      }
      setSelectedVariantId(first.id);
    } else if (product.options && product.options.length > 0) {
      for (const opt of product.options) {
        if (opt.values && opt.values.length > 0) {
          nextSelected[opt.name] = opt.values[0];
        }
      }
      setSelectedVariantId(null);
    }

    setSelectedOptions(nextSelected);
    setActiveImageIndex(0);
  }, [product]);

  const selectedVariant = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return null;

    if (selectedVariantId) {
      const byId = product.variants.find((v) => v.id === selectedVariantId);
      if (byId) return byId;
    }

    const entries = Object.entries(selectedOptions).filter(
      ([, v]) => typeof v === "string" && v,
    );
    if (!entries.length) {
      return product.variants[0];
    }

    const match =
      product.variants.find((v) => {
        if (!v.options) return false;
        return entries.every(
          ([name, value]) =>
            String(v.options?.[name] ?? "").trim() === String(value),
        );
      }) ?? null;

    return match || product.variants[0];
  }, [product, selectedOptions, selectedVariantId]);

  const images = useMemo(() => {
    if (!product) return [];
    if (Array.isArray(product.images) && product.images.length > 0) {
      return product.images;
    }
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product]);

  const displayPrice =
    (selectedVariant && selectedVariant.price) ?? product?.price ?? 0;
  const displayInventory =
    (selectedVariant && selectedVariant.inventoryQuantity) ??
    product?.inventoryQuantity ??
    undefined;

  const safeSingleVariantFallback =
    product?.variantsComplete === false &&
    (!product.options || product.options.length === 0) &&
    (product.variants?.length ?? 0) === 1 &&
    (product.variants?.[0]?.title === "Default" ||
      product.variants?.[0]?.title === "Default Title");

  const canAddToCart =
    Boolean(selectedVariant?.id) && (product?.variantsComplete === true || safeSingleVariantFallback);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else if (creator) {
      router.push(`/creator/${creator.slug}`);
    } else {
      router.push("/");
    }
  };

  if (!creator) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fffefc] text-[#3f3125]">
        <div className="text-sm text-[#a38b78]">Creator agent not found.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#ffe7d6]/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-[#ffe0cc]/18 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#fff2e3]/22 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-[#f6ebe0] bg-white/90 px-4 py-3 text-xs shadow-sm backdrop-blur-sm sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-[#f0e2d6] px-3 py-1 text-[11px] text-[#8c715c] hover:bg-[#fff0e3]"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-[#f6ebe0] shadow-sm sm:h-10 sm:w-10">
              <img
                src={creator.avatarUrl}
                alt={creator.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-[#3f3125] sm:text-sm">
                {creator.name}
              </div>
              {creator.tagline && (
                <p className="mt-0.5 text-[11px] text-[#a38b78]">
                  {creator.tagline}
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-1 justify-center px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex w-full max-w-4xl flex-col gap-6 rounded-3xl bg-[#fffaf5]/95 p-4 shadow-xl sm:p-6 lg:p-8">
            {loading && (
              <div className="flex flex-1 items-center justify-center text-sm text-[#a38b78]">
                Loading product…
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-[#a38b78]">{error}</p>
                <button
                  type="button"
                  className="rounded-full bg-[#f6b59b] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#f29b7f]"
                  onClick={handleBack}
                >
                  Back to creator
                </button>
              </div>
            )}

            {!loading && !error && product && (
              <div className="flex flex-1 flex-col gap-6 md:flex-row">
                {images.length > 0 && (
                  <div className="md:w-1/2 w-full flex flex-col gap-3">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-[#f5e3d4]">
                      <img
                        src={
                          images[
                            Math.max(
                              0,
                              Math.min(activeImageIndex, images.length - 1),
                            )
                          ]
                        }
                        alt={product.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                    {images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto pt-1">
                        {images.map((url, idx) => (
                          <button
                            key={url + idx.toString()}
                            type="button"
                            onClick={() => setActiveImageIndex(idx)}
                            className={`h-16 w-12 flex-shrink-0 overflow-hidden rounded-xl border ${
                              idx === activeImageIndex
                                ? "border-[#3f3125]"
                                : "border-[#f0e2d6]"
                            } bg-[#f6e6d8]`}
                          >
                            <img
                              src={url}
                              alt={product.title}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-4 text-[13px]">
                  <div>
                    <h1 className="text-base font-semibold text-[#3f3125] sm:text-lg">
                      {product.title}
                    </h1>
                    {product.merchantName && (
                      <p className="mt-0.5 text-[11px] text-[#a38b78]">
                        Sold by {product.merchantName}
                      </p>
                    )}
                  </div>

                  {(product.description || product.descriptionHtml) && (
                    <div className="mt-1">
                      <ProductDescription
                        description={product.description}
                        descriptionHtml={product.descriptionHtml}
                      />
                    </div>
                  )}

	                  <div className="space-y-2 text-[13px]">
	                    <div className="text-[11px] font-medium uppercase tracking-wide text-[#a38b78]">
	                      Price
	                    </div>
	                    <div className="text-lg font-semibold text-[#3f3125]">
	                      {product.currency}{" "}
	                      {(
	                        typeof displayPrice === "number" &&
	                        !Number.isNaN(displayPrice)
	                          ? displayPrice
	                          : 0
	                      ).toFixed(2)}
	                    </div>
	                    {product.bestDeal?.label && (
	                      <div className="text-[12px] font-medium text-[#f28b7a]">
	                        {product.bestDeal.label}
	                      </div>
	                    )}
	                    {!product.bestDeal?.freeShipping &&
	                      product.allDeals?.some((d) => d.freeShipping) && (
	                        <div className="text-[11px] font-medium text-[#8c715c]">
	                          Free shipping available
	                        </div>
	                      )}
	                  </div>

                  {Array.isArray(product.options) &&
                    product.options.length > 0 && (
                      <div className="space-y-3 text-[12px]">
                        {product.options
                          .filter(
                            (opt) =>
                              opt.values && opt.values.length > 0,
                          )
                          .map((opt) => (
                            <div key={opt.name}>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-[#a38b78]">
                                {opt.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {opt.values.map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...selectedOptions,
                                        [opt.name]: value,
                                      };
                                      setSelectedOptions(next);
                                      if (product.variants && product.variants.length > 0) {
                                        const match =
                                          product.variants.find((v) => {
                                            if (!v.options) return false;
                                            return Object.entries(next).every(
                                              ([name, val]) =>
                                                String(v.options?.[name] ?? "").trim() ===
                                                String(val),
                                            );
                                          }) ?? product.variants[0];
                                        setSelectedVariantId(match.id);
                                        if (match.imageUrl) {
                                          const idx = images.findIndex(
                                            (url) => url === match.imageUrl,
                                          );
                                          if (idx >= 0) {
                                            setActiveImageIndex(idx);
                                          }
                                        }
                                      }
                                    }}
                                    className={`min-w-[2.5rem] rounded-full border px-3 py-1 text-[11px] ${
                                      selectedOptions[opt.name] === value
                                        ? "border-[#3f3125] bg-[#3f3125] text-white"
                                        : "border-[#f0e2d6] bg-white text-[#8c715c]"
                                    }`}
                                  >
                                    {value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                  {typeof displayInventory === "number" && (
                    <p className="text-[11px] text-[#a38b78]">
                      Stock:{" "}
                      {displayInventory > 0
                        ? `${displayInventory} available`
                        : "Out of stock"}
                    </p>
                  )}

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={!canAddToCart}
                      className={`flex-1 rounded-full px-3 py-2 text-[12px] font-medium text-white shadow-sm ${
                        canAddToCart
                          ? "bg-[#f6b59b] hover:bg-[#f29b7f]"
                          : "cursor-not-allowed bg-[#f6b59b]/50"
                      }`}
                      onClick={() => {
                        if (!canAddToCart) return;
                        const variant = selectedVariant;
                        const variantKey = variant!.id;
                        addItem({
                          id: `${product.id}:${variantKey}`,
                          productId: product.id,
                          merchantId: product.merchantId,
                          title: product.title,
                          price: displayPrice,
                          imageUrl:
                            (variant && variant.imageUrl) ||
                            images[0] ||
                            product.imageUrl,
                          quantity: 1,
                          currency: product.currency,
                          creatorId: creator.id,
                          creatorSlug: creator.slug,
                          creatorName: creator.name,
                          variantId: variant!.id,
                          variantSku: variant!.sku,
                          selectedOptions:
                            Object.keys(selectedOptions).length > 0
                              ? selectedOptions
                              : undefined,
                          bestDeal: product.bestDeal ?? null,
                          allDeals: product.allDeals ?? null,
                        });
                      }}
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      disabled={!canAddToCart}
                      className={`flex-1 rounded-full border border-[#f0e2d6] bg-white px-3 py-2 text-[12px] font-medium shadow-sm ${
                        canAddToCart
                          ? "text-[#8c715c] hover:bg-[#fff0e3]"
                          : "cursor-not-allowed text-[#8c715c]/50"
                      }`}
                      onClick={() => {
                        if (!canAddToCart) return;
                        clear();
                        const variant = selectedVariant;
                        const variantKey = variant!.id;
                        addItem({
                          id: `${product.id}:${variantKey}`,
                          productId: product.id,
                          merchantId: product.merchantId,
                          title: product.title,
                          price: displayPrice,
                          imageUrl:
                            (variant && variant.imageUrl) ||
                            images[0] ||
                            product.imageUrl,
                          quantity: 1,
                          currency: product.currency,
                          creatorId: creator.id,
                          creatorSlug: creator.slug,
                          creatorName: creator.name,
                          variantId: variant!.id,
                          variantSku: variant!.sku,
                          selectedOptions:
                            Object.keys(selectedOptions).length > 0
                              ? selectedOptions
                              : undefined,
                          bestDeal: product.bestDeal ?? null,
                          allDeals: product.allDeals ?? null,
                        });
                        close();
                        router.push("/checkout");
                      }}
                    >
                      Buy now
                    </button>
                  </div>

                  {product.detailUrl && (
                    <a
                      href={product.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex text-[11px] text-[#a38b78] hover:underline"
                    >
                      Open store page
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
