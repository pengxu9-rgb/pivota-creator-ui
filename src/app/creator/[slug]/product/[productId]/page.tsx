'use client';

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { getCreatorBySlug } from "@/config/creatorAgents";
import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";

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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-sm text-slate-500">Creator agent not found.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-purple-300/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 text-xs shadow-sm backdrop-blur-sm sm:px-6 lg:px-10">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-slate-200 px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200 shadow-sm sm:h-10 sm:w-10">
              <img
                src={creator.avatarUrl}
                alt={creator.name}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-900 sm:text-sm">
                {creator.name}
              </div>
              {creator.tagline && (
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {creator.tagline}
                </p>
              )}
            </div>
          </div>
        </header>

        <div className="flex flex-1 justify-center px-4 py-4 sm:px-6 lg:px-10">
          <div className="flex w-full max-w-4xl flex-col gap-6 rounded-3xl bg-white/95 p-4 shadow-xl sm:p-6 lg:p-8">
            {loading && (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Loading product…
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-slate-600">{error}</p>
                <button
                  type="button"
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                  onClick={handleBack}
                >
                  Back to creator
                </button>
              </div>
            )}

            {!loading && !error && product && (
              <div className="flex flex-1 flex-col gap-6 md:flex-row">
                {product.imageUrl && (
                  <div className="md:w-1/2 w-full">
                    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-slate-100">
                      <img
                        src={product.imageUrl}
                        alt={product.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-4 text-[13px]">
                  <div>
                    <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
                      {product.title}
                    </h1>
                    {product.merchantName && (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Sold by {product.merchantName}
                      </p>
                    )}
                  </div>

                  {product.description && (
                    <p className="text-[12px] leading-relaxed text-slate-700">
                      {product.description}
                    </p>
                  )}

                  <div className="space-y-2 text-[13px]">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      Price
                    </div>
                    <div className="text-lg font-semibold">
                      {product.currency} {product.price.toFixed(2)}
                    </div>
                    {product.bestDeal?.label && (
                      <div className="text-[12px] font-medium text-cyan-700">
                        {product.bestDeal.label}
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
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                {opt.name}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {opt.values.map((value) => (
                                  <button
                                    key={value}
                                    type="button"
                                    className="min-w-[2.5rem] rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700"
                                  >
                                    {value}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                  {typeof product.inventoryQuantity === "number" && (
                    <p className="text-[11px] text-slate-500">
                      Stock:{" "}
                      {product.inventoryQuantity > 0
                        ? `${product.inventoryQuantity} available`
                        : "Out of stock"}
                    </p>
                  )}

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-slate-900 px-3 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-slate-800"
                      onClick={() => {
                        addItem({
                          id: product.id,
                          productId: product.id,
                          merchantId: product.merchantId,
                          title: product.title,
                          price: product.price,
                          imageUrl: product.imageUrl,
                          quantity: 1,
                          currency: product.currency,
                          creatorId: creator.id,
                          creatorSlug: creator.slug,
                          creatorName: creator.name,
                          bestDeal: product.bestDeal ?? null,
                          allDeals: product.allDeals ?? null,
                        });
                      }}
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-gradient-to-r from-[#7c8cff] via-[#62b2ff] to-[#7fffe1] px-3 py-2 text-[12px] font-medium text-slate-900 shadow-sm hover:brightness-110"
                      onClick={() => {
                        clear();
                        addItem({
                          id: product.id,
                          productId: product.id,
                          merchantId: product.merchantId,
                          title: product.title,
                          price: product.price,
                          imageUrl: product.imageUrl,
                          quantity: 1,
                          currency: product.currency,
                          creatorId: creator.id,
                          creatorSlug: creator.slug,
                          creatorName: creator.name,
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
                      className="inline-flex text-[11px] text-cyan-600 hover:underline"
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
