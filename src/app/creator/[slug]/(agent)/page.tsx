/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";
import { useCart } from "@/components/cart/CartProvider";
import { useCreatorCategories } from "@/lib/useCreatorCategories";
import type { Product } from "@/types/product";

// How many products to show initially in the "Featured for you" grid.
// With 4 columns on desktop this renders roughly 2–3 rows.
const INITIAL_VISIBLE = 16;
const BATCH_VISIBLE = 16;
const DEFAULT_CATEGORY_VIEW = "GLOBAL_FASHION";
const FORCED_LOCALE = "en-US";
const DEALS_SECTION_LIMIT = 12;

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return ts;
}

function includesLoose(haystack: string | undefined, needle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(needle);
}

function DealsGrid({
  items,
  keyPrefix,
  creator,
  onSeeSimilar,
  onViewDetails,
}: {
  items: Product[];
  keyPrefix?: string;
  creator: { id: string; slug: string; name: string };
  onSeeSimilar: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard
          key={keyPrefix ? `${keyPrefix}-${p.id}` : p.id}
          product={p}
          displayMode="deals"
          creatorName={creator.name}
          creatorId={creator.id}
          creatorSlug={creator.slug}
          onSeeSimilar={onSeeSimilar}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  );
}

function DealsSection({
  title,
  subtitle,
  items,
  keyPrefix,
  creator,
  onSeeSimilar,
  onViewDetails,
}: {
  title: string;
  subtitle?: string;
  items: Product[];
  keyPrefix: string;
  creator: { id: string; slug: string; name: string };
  onSeeSimilar: (product: Product) => void;
  onViewDetails: (product: Product) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-[11px] text-slate-600">{subtitle}</div>}
      </div>
      <DealsGrid
        items={items}
        keyPrefix={keyPrefix}
        creator={creator}
        onSeeSimilar={onSeeSimilar}
        onViewDetails={onViewDetails}
      />
    </div>
  );
}

export default function CreatorAgentPage() {
  const {
    creator,
    products,
    isLoading,
    isFeaturedLoading,
    userQueries,
    recentQueries,
    setInput,
    sendMessage,
    handleSeeSimilar,
    handleViewDetails,
    prefetchProductDetail,
    currentSession,
  } = useCreatorAgent();

  const router = useRouter();
  const pathname = usePathname();
  const { items: cartItems } = useCart();
  const searchParams = useSearchParams();
  const activeTab: "forYou" | "deals" = useMemo(() => {
    const tab = searchParams?.get("tab");
    return tab === "deals" ? "deals" : "forYou";
  }, [searchParams]);
  const prefillQuery = searchParams?.get("prefill");

  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "creator" | "sale">(
    "all",
  );

  const categoryView = searchParams?.get("view") || DEFAULT_CATEGORY_VIEW;
  const { hotDeals } = useCreatorCategories(activeTab === "deals" ? creator.slug : undefined, {
    dealsOnly: true,
    view: categoryView,
    locale: FORCED_LOCALE,
    includeEmpty: true,
  });

  const onboardingKey = useMemo(
    () => `pivota_creator_onboarding_seen_v1_${creator.slug}`,
    [creator.slug],
  );
  const forcedOnboarding = searchParams?.get("onboarding") === "1";
  const [showOnboarding, setShowOnboarding] = useState<boolean>(forcedOnboarding);
  const [onboardingDraft, setOnboardingDraft] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forcedOnboarding) {
      setShowOnboarding(true);
      return;
    }

    const seen = window.localStorage.getItem(onboardingKey) === "1";
    const hasUserHistory =
      recentQueries.length > 0 ||
      userQueries.length > 0 ||
      Boolean(currentSession?.lastUserQuery);

    if (seen || hasUserHistory) {
      if (!seen) {
        try {
          window.localStorage.setItem(onboardingKey, "1");
        } catch {
          // ignore
        }
      }
      setShowOnboarding(false);
      return;
    }

    setShowOnboarding(true);
  }, [
    forcedOnboarding,
    onboardingKey,
    recentQueries.length,
    userQueries.length,
    currentSession?.lastUserQuery,
  ]);

  const dismissOnboarding = () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(onboardingKey, "1");
      } catch {
        // ignore
      }
    }
    setShowOnboarding(false);
  };

  const submitOnboarding = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    dismissOnboarding();

    const next = new URLSearchParams(searchParams?.toString());
    next.delete("onboarding");
    next.set("chat", "1");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);

    await sendMessage(trimmed);
  };

  const onboardingPrompts = useMemo(
    () => [
      { label: "Comfy work from home", prompt: "Comfy work from home outfits" },
      { label: "Date night under $150", prompt: "Date night outfit under $150" },
      { label: "Summer essentials", prompt: "Summer essentials for my closet" },
    ],
    [],
  );

  // Reset visible items when products or tab changes.
  useEffect(() => {
    if (activeTab === "forYou") {
      setVisibleCount(INITIAL_VISIBLE);
    }
  }, [activeTab, products, activeFilter]);

  const filteredProducts = useMemo(() => {
    if (activeFilter === "creator") {
      return products.filter(
        (p) =>
          p.isCreatorPick ||
          p.fromCreatorDirectly ||
          (p.creatorMentions ?? 0) > 0,
      );
    }
    if (activeFilter === "sale") {
      return products.filter((p) => Boolean(p.bestDeal));
    }
    return products;
  }, [products, activeFilter]);

  // Infinite scroll: when sentinel进入视口，增加展示数量。
  useEffect(() => {
    if (!loadMoreRef.current) return;
    if (typeof IntersectionObserver === "undefined") return;

    const el = loadMoreRef.current;
    const maxVisible = filteredProducts.length;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting) return;
        setVisibleCount((current) => {
          const next = current + BATCH_VISIBLE;
          const upper = maxVisible || next;
          return Math.min(next, upper);
        });
      },
      { root: null, rootMargin: "200px", threshold: 0.1 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [filteredProducts.length]);

  // Prefetch product-detail for currently visible products so that
  // desktop detail modal can open with full Style/Size and images.
  useEffect(() => {
    if (!filteredProducts.length) return;
    const maxVisible = filteredProducts.length;
    const count = Math.min(visibleCount, maxVisible || visibleCount);
    const slice = filteredProducts.slice(0, count);
    slice.forEach((p) => prefetchProductDetail(p));
  }, [filteredProducts, visibleCount, prefetchProductDetail]);

  // When arriving with a ?prefill= query (from Recent chats page),
  // populate the chat input so the user can continue that conversation.
  useEffect(() => {
    if (!prefillQuery) return;
    setInput(prefillQuery);
  }, [prefillQuery, setInput]);

  useEffect(() => {
    if (!prefillQuery) return;
    setOnboardingDraft(prefillQuery);
  }, [prefillQuery]);

  const recentQueryList = useMemo(
    () =>
      (recentQueries.length > 0
        ? [...recentQueries].slice(-5).reverse()
        : userQueries.map((m) => m.content).slice(-5).reverse()) ?? [],
    [recentQueries, userQueries],
  );

  const dealsProducts = useMemo(
    () => products.filter((p) => Boolean(p.bestDeal)),
    [products],
  );

  const [dealsSort, setDealsSort] = useState<
    "recommended" | "endingSoon" | "biggestDiscount"
  >("recommended");
  const [dealsSearch, setDealsSearch] = useState("");
  const [dealsFilters, setDealsFilters] = useState<{
    flash: boolean;
    bundle: boolean;
    freeShipping: boolean;
  }>({ flash: false, bundle: false, freeShipping: false });

  const normalizedDealsSearch = dealsSearch.trim().toLowerCase();

  const filteredDealsProducts = useMemo(() => {
    let list = dealsProducts;

    if (normalizedDealsSearch) {
      list = list.filter((p) => {
        return (
          includesLoose(p.title, normalizedDealsSearch) ||
          includesLoose(p.merchantName, normalizedDealsSearch) ||
          includesLoose(p.bestDeal?.label, normalizedDealsSearch)
        );
      });
    }

    if (dealsFilters.flash || dealsFilters.bundle) {
      const allowedTypes = new Set<string>();
      if (dealsFilters.flash) allowedTypes.add("FLASH_SALE");
      if (dealsFilters.bundle) allowedTypes.add("MULTI_BUY_DISCOUNT");
      list = list.filter((p) => p.bestDeal && allowedTypes.has(p.bestDeal.type));
    }

    if (dealsFilters.freeShipping) {
      list = list.filter(
        (p) =>
          Boolean(p.bestDeal?.freeShipping) || p.bestDeal?.type === "FREE_SHIPPING",
      );
    }

    return list;
  }, [dealsProducts, dealsFilters, normalizedDealsSearch]);

  const sortedDealsProducts = useMemo(() => {
    if (dealsSort === "recommended") return filteredDealsProducts;

    const decorated = filteredDealsProducts.map((p, idx) => ({ p, idx }));

    if (dealsSort === "endingSoon") {
      decorated.sort((a, b) => {
        const at = parseTimestamp(a.p.bestDeal?.endAt) ?? Number.POSITIVE_INFINITY;
        const bt = parseTimestamp(b.p.bestDeal?.endAt) ?? Number.POSITIVE_INFINITY;
        if (at !== bt) return at - bt;
        return a.idx - b.idx;
      });
      return decorated.map(({ p }) => p);
    }

    decorated.sort((a, b) => {
      const ad = a.p.bestDeal?.discountPercent;
      const bd = b.p.bestDeal?.discountPercent;
      const aHas = typeof ad === "number" && !Number.isNaN(ad);
      const bHas = typeof bd === "number" && !Number.isNaN(bd);
      if (aHas && bHas && ad !== bd) return bd! - ad!;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.idx - b.idx;
    });
    return decorated.map(({ p }) => p);
  }, [filteredDealsProducts, dealsSort]);

  const featuredDeals = useMemo(() => {
    const list = filteredDealsProducts.filter(
      (p) => p.isCreatorPick || typeof p.creatorPickRank === "number",
    );
    if (list.length === 0) return [];
    const copy = [...list];
    copy.sort((a, b) => {
      const ar = typeof a.creatorPickRank === "number" ? a.creatorPickRank : 1e9;
      const br = typeof b.creatorPickRank === "number" ? b.creatorPickRank : 1e9;
      if (ar !== br) return ar - br;
      return a.title.localeCompare(b.title);
    });
    return copy.slice(0, DEALS_SECTION_LIMIT);
  }, [filteredDealsProducts]);

  const endingSoonDeals = useMemo(() => {
    const list = filteredDealsProducts
      .map((p) => ({ p, ts: parseTimestamp(p.bestDeal?.endAt) }))
      .filter((x) => x.ts != null)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0))
      .slice(0, DEALS_SECTION_LIMIT)
      .map((x) => x.p);
    return list;
  }, [filteredDealsProducts]);

  const freeShippingDeals = useMemo(() => {
    const list = filteredDealsProducts.filter(
      (p) => Boolean(p.bestDeal?.freeShipping) || p.bestDeal?.type === "FREE_SHIPPING",
    );
    return list.slice(0, DEALS_SECTION_LIMIT);
  }, [filteredDealsProducts]);

  const hasActiveDealsControls =
    dealsSort !== "recommended" ||
    dealsFilters.flash ||
    dealsFilters.bundle ||
    dealsFilters.freeShipping ||
    Boolean(normalizedDealsSearch);

  const clearDealsControls = () => {
    setDealsSearch("");
    setDealsFilters({ flash: false, bundle: false, freeShipping: false });
    setDealsSort("recommended");
  };

  return (
    <>
      {activeTab === "forYou" && showOnboarding && (
        <div className="space-y-6">
            <div className="rounded-3xl border border-[#f4e2d4] bg-[#fffaf5] px-5 py-10 text-center shadow-sm sm:px-10">
              <div className="text-[12px] text-[#8c715c]">
              Welcome to {creator.name}&apos;s Studio!
              </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              Ask me anything!
            </div>

            <div className="mx-auto mt-6 w-full max-w-2xl">
              <div className="flex items-center gap-3 rounded-3xl border border-[#f4e2d4] bg-white px-4 py-3 shadow-md">
                <input
                  value={onboardingDraft}
                  onChange={(e) => setOnboardingDraft(e.target.value)}
                  placeholder="e.g. casual outfits for a weekend trip..."
                  className="w-full bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitOnboarding(onboardingDraft);
                    }
                  }}
                  inputMode="search"
                />
                <button
                  type="button"
                  onClick={() => submitOnboarding(onboardingDraft)}
                  disabled={isLoading || onboardingDraft.trim().length === 0}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f4cbb8] text-slate-900 shadow-sm disabled:opacity-60"
                  aria-label="Send"
                >
                  <span className="text-[14px]">➤</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {onboardingPrompts.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => submitOnboarding(p.prompt)}
                    className="rounded-full bg-[#f6efe8] px-4 py-2 text-[12px] text-[#3f3125] hover:bg-[#efe6dd]"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={dismissOnboarding}
                  className="rounded-full px-4 py-2 text-[12px] text-slate-500 hover:text-slate-700"
                >
                  Skip
                </button>
              </div>
            </div>
          </div>

            <div className="space-y-3">
              <div className="text-center text-[14px] font-semibold text-slate-900">
              {creator.name}&apos;s Picks
              </div>

            {isFeaturedLoading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-40 animate-pulse rounded-3xl bg-slate-100"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-[12px] text-slate-600">
                Browse categories or ask a question to get personalized picks.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {products.slice(0, 8).map((p) => (
                  <ProductCard
                    key={`onboarding-${p.id}`}
                    product={p}
                    creatorName={creator.name}
                    creatorId={creator.id}
                    creatorSlug={creator.slug}
                    onSeeSimilar={handleSeeSimilar}
                    onViewDetails={handleViewDetails}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "forYou" && !showOnboarding && (
        <>
          <div className="space-y-4">
            <SectionHeader
              title="Featured for you"
              subtitle={`Based on ${creator.name}'s style and typical scenarios.`}
            />
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveFilter("all")}
                  className={
                    activeFilter === "all"
                      ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                      : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600"
                  }
                >
                  All picks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("creator")}
                  className={
                    activeFilter === "creator"
                      ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                      : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600"
                  }
                >
                  Creator picks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter("sale")}
                  className={
                    activeFilter === "sale"
                      ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                      : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600"
                  }
                >
                  On sale
                </button>
              </div>
            </div>
            {isFeaturedLoading || (isLoading && products.length === 0) ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                {/*
                  逐步展示最多 90 个商品；其余结果保留在内存中，不在首屏渲染。
                  当用户切换 Creator picks / On sale 筛选时，只在前端
                  基于已有结果做过滤，不额外打后端。
                */}
                {(() => {
                  const maxVisible = filteredProducts.length;
                  const count = Math.min(visibleCount, maxVisible || visibleCount);
                  const hasMore = maxVisible > 0 && count < maxVisible;

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {filteredProducts.slice(0, count).map((p) => (
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
                      {hasMore && (
                        <div
                          ref={loadMoreRef}
                          className="mt-4 h-8 w-full"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === "deals" && (
        <div className="space-y-4" id="creator-deals">
          <SectionHeader
            title="Deals"
            subtitle="Deals are estimates. Final price is locked at checkout."
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12px] text-slate-700">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  Quote-first checkout
                </div>
                <div className="mt-0.5 text-[11px] text-slate-600">
                  Deals are signals only; we lock the final price after we generate a quote at checkout.
                </div>
              </div>

              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/checkout")}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-slate-50 hover:bg-slate-800"
                >
                  Go to checkout ({cartItems.length})
                </button>
              )}
            </div>
          </div>

          <div className="sticky top-0 z-20 -mx-1 rounded-b-2xl bg-[#fffefc]/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fffefc]/80">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                  <input
                    value={dealsSearch}
                    onChange={(e) => setDealsSearch(e.target.value)}
                    placeholder="Search deals (product, merchant, label)"
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-[12px] text-slate-900 outline-none focus:border-slate-900"
                    inputMode="search"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDealsFilters((prev) => ({ ...prev, flash: !prev.flash }))
                    }
                    className={
                      dealsFilters.flash
                        ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                        : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700"
                    }
                  >
                    Flash
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDealsFilters((prev) => ({ ...prev, bundle: !prev.bundle }))
                    }
                    className={
                      dealsFilters.bundle
                        ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                        : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700"
                    }
                  >
                    Bundle
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDealsFilters((prev) => ({
                        ...prev,
                        freeShipping: !prev.freeShipping,
                      }))
                    }
                    className={
                      dealsFilters.freeShipping
                        ? "inline-flex items-center rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-slate-50"
                        : "inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-700"
                    }
                  >
                    Free shipping
                  </button>

                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-600">
                    Sort
                    <select
                      value={dealsSort}
                      onChange={(e) =>
                        setDealsSort(
                          e.target.value as
                            | "recommended"
                            | "endingSoon"
                            | "biggestDiscount",
                        )
                      }
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="endingSoon">Ending soon</option>
                      <option value="biggestDiscount">Biggest %</option>
                    </select>
                  </label>

                  {hasActiveDealsControls && (
                    <button
                      type="button"
                      onClick={clearDealsControls}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] font-semibold text-slate-900">
                Deals by categories
              </div>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/creator/${encodeURIComponent(
                      creator.slug,
                    )}/categories?view=${encodeURIComponent(categoryView)}&locale=${encodeURIComponent(
                      FORCED_LOCALE,
                    )}&dealsOnly=true`,
                  )
                }
                className="text-[11px] font-medium text-slate-700 underline-offset-2 hover:underline"
              >
                View categories (Deals only)
              </button>
            </div>

            {hotDeals.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {hotDeals.map((deal) => {
                  const target = deal.categoryIds?.[0];
                  const href = target
                    ? `/creator/${encodeURIComponent(
                        creator.slug,
                      )}/category/${encodeURIComponent(
                        target,
                      )}?view=${encodeURIComponent(categoryView)}&locale=${encodeURIComponent(
                        FORCED_LOCALE,
                      )}&dealsOnly=true`
                    : `/creator/${encodeURIComponent(
                        creator.slug,
                      )}/categories?view=${encodeURIComponent(categoryView)}&locale=${encodeURIComponent(
                        FORCED_LOCALE,
                      )}&dealsOnly=true`;
                  return (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => router.push(href)}
                      className={
                        deal.type === "FLASH_SALE"
                          ? "inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] text-rose-700 hover:bg-rose-500/15"
                          : "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-700 hover:bg-emerald-500/15"
                      }
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {deal.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-slate-600">
                No deal categories yet.
              </div>
            )}
          </div>

          {dealsProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-[12px] text-slate-600">
              <div>No deals available right now.</div>
              <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => router.push(`/creator/${encodeURIComponent(creator.slug)}`)}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-slate-50 hover:bg-slate-800"
                >
                  Browse For You
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/creator/${encodeURIComponent(
                        creator.slug,
                      )}/categories?view=${encodeURIComponent(categoryView)}&locale=${encodeURIComponent(
                        FORCED_LOCALE,
                      )}`,
                    )
                  }
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  View categories
                </button>
              </div>
            </div>
          ) : sortedDealsProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-[12px] text-slate-600">
              <div>No matching deals.</div>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={clearDealsControls}
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-[11px] font-medium text-slate-50 hover:bg-slate-800"
                >
                  Clear all
                </button>
              </div>
            </div>
          ) : (
            <>
              <DealsSection
                title="Featured"
                subtitle="Creator picks with deals"
                items={featuredDeals}
                keyPrefix="featured"
                creator={creator}
                onSeeSimilar={handleSeeSimilar}
                onViewDetails={handleViewDetails}
              />

              <DealsSection
                title="Ending soon"
                subtitle="Based on deal end date"
                items={endingSoonDeals}
                keyPrefix="ending"
                creator={creator}
                onSeeSimilar={handleSeeSimilar}
                onViewDetails={handleViewDetails}
              />

              <DealsSection
                title="Free shipping"
                subtitle="Shipping benefit deals"
                items={freeShippingDeals}
                keyPrefix="free-ship"
                creator={creator}
                onSeeSimilar={handleSeeSimilar}
                onViewDetails={handleViewDetails}
              />

              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-slate-900">
                  All deals
                </div>
                <div className="text-[11px] text-slate-600">
                  Showing {sortedDealsProducts.length} deal item
                  {sortedDealsProducts.length === 1 ? "" : "s"}.
                </div>
              </div>

              <DealsGrid
                items={sortedDealsProducts}
                creator={creator}
                onSeeSimilar={handleSeeSimilar}
                onViewDetails={handleViewDetails}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
