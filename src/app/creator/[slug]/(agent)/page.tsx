/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";

export default function CreatorAgentPage() {
  const {
    creator,
    products,
    isLoading,
    isFeaturedLoading,
    creatorDeals,
    userQueries,
    recentQueries,
    setInput,
    handleSeeSimilar,
    handleViewDetails,
    prefetchProductDetail,
  } = useCreatorAgent();

  const searchParams = useSearchParams();
  const activeTab: "forYou" | "deals" = useMemo(() => {
    const tab = searchParams?.get("tab");
    return tab === "deals" ? "deals" : "forYou";
  }, [searchParams]);

  const [visibleCount, setVisibleCount] = useState(6);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset visible items when products or tab changes.
  useEffect(() => {
    if (activeTab === "forYou") {
      setVisibleCount(6);
    }
  }, [activeTab, products]);

  // Infinite scroll: when sentinel进入视口，增加展示数量。
  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        setVisibleCount((current) => {
          const next = current + 6;
          return Math.min(next, products.length || next);
        });
      },
      { root: null, rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [products.length]);

  // Prefetch product-detail for currently visible products so that
  // desktop detail modal can open with full Style/Size and images.
  useEffect(() => {
    if (!products.length) return;
    const slice = products.slice(0, visibleCount);
    slice.forEach((p) => prefetchProductDetail(p));
  }, [products, visibleCount, prefetchProductDetail]);

  const recentQueryList = useMemo(
    () =>
      (recentQueries.length > 0
        ? [...recentQueries].slice(-5).reverse()
        : userQueries.map((m) => m.content).slice(-5).reverse()) ?? [],
    [recentQueries, userQueries],
  );

  return (
    <>
      {activeTab === "forYou" && (
        <>
          <div className="space-y-4">
            <SectionHeader
              title="Featured for you"
              subtitle={`Based on ${creator.name}'s style and typical scenarios.`}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50">
                  All picks
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600">
                  Creator picks
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600">
                  On sale
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Refine with {creator.name}
              </button>
            </div>
            {isFeaturedLoading || (isLoading && products.length === 0) ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-40 animate-pulse rounded-3xl bg-slate-100"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-slate-500">
                No candidates yet. Tell me what you need on the left.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {products.slice(0, visibleCount).map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      creatorName={creator.name}
                      creatorId={creator.id}
                      creatorSlug={creator.slug}
                      onSeeSimilar={handleSeeSimilar}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
                {products.length > visibleCount && (
                  <div
                    ref={loadMoreRef}
                    className="mt-4 h-8 w-full"
                    aria-hidden="true"
                  />
                )}
              </>
            )}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <SectionHeader
              title="Continue from last chat"
              subtitle="Recent queries we worked on together. Tap to reuse a prompt."
            />
            <div className="flex flex-wrap gap-2">
              {recentQueryList.map((query, idx) => (
                <button
                  key={`${query}-${idx}`}
                  type="button"
                  className="max-w-xs rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-200"
                  onClick={() => setInput(query)}
                >
                  {query}
                </button>
              ))}
              {recentQueryList.length === 0 && (
                <p className="text-[11px] text-slate-400">
                  Start chatting on the left to see recent queries here.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === "deals" && (
        <div className="space-y-4" id="creator-deals">
          <SectionHeader
            title="Creator deals"
            subtitle="Bundle discounts and flash deals curated for this creator."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {creatorDeals.map((deal) => (
              <div
                key={deal.dealId}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700"
              >
                <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {deal.type === "MULTI_BUY_DISCOUNT"
                    ? "Bundle & save"
                    : "Flash deal"}
                </div>
                <div className="text-xs font-semibold text-slate-900">
                  {deal.label}
                </div>
                {deal.endAt && (
                  <p className="mt-1 text-[10px] text-slate-500">
                    Ends at {new Date(deal.endAt).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
