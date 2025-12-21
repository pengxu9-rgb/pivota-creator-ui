'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCreatorCategories } from "@/lib/useCreatorCategories";
import type { CategoryNode } from "@/types/category";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/SectionHeader";

const CATEGORY_VIEWS = [
  { id: "GLOBAL_FASHION", label: "Fashion" },
  { id: "GLOBAL_BEAUTY", label: "Beauty" },
  { id: "GLOBAL_OUTDOOR", label: "Outdoor" },
  { id: "GLOBAL_PETS", label: "Pets" },
  { id: "GLOBAL_TOYS", label: "Toys" },
] as const;

const DEFAULT_VIEW = "GLOBAL_FASHION";
const FORCED_LOCALE = "en-US";

const TOP_CATEGORY_SLUGS = ["sportswear", "lingerie-set", "toys"] as const;

const CATEGORY_IMAGE_FALLBACK: Record<string, string> = {
  sportswear: "/mock-categories/sportswear.jpg",
  "lingerie-set": "/mock-categories/lingerie-set.jpg",
  toys: "/mock-categories/toys.jpg",
  "womens-loungewear": "/mock-categories/womens-loungewear.jpg",
  "designer-toys": "/mock-categories/toys.jpg",
  "outdoor-clothing": "/mock-categories/outdoor-clothing.jpg",
  "womens-dress": "/mock-categories/womens-dress.jpg",
  makeup: "/mock-categories/makeup.jpg",
  "facial-care": "/mock-categories/facial-care.jpg",
  "skin-care": "/mock-categories/skin-care.jpg",
  "nail-polish": "/mock-categories/nail-polish.jpg",
  "press-on-nails": "/mock-categories/press-on-nails.jpg",
  eyelashes: "/mock-categories/eyelashes.jpg",
  haircare: "/mock-categories/haircare.jpg",
  "beauty-tools": "/mock-categories/beauty-tools.jpg",
  "beauty-devices": "/mock-categories/beauty-devices.jpg",
  "contact-lens": "/mock-categories/contact-lens.jpg",
  "camping-gear": "/mock-categories/camping-gear.jpg",
  "hunting-accessories": "/mock-categories/hunting-accessories.jpg",
  "pet-toys": "/mock-categories/pet-toys.jpg",
};

export default function CreatorCategoriesPage() {
  const params = useParams<{ slug: string }>();
  const slugParam = params?.slug;
  const creatorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const searchParams = useSearchParams();

  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [activeView, setActiveView] = useState(DEFAULT_VIEW);

  useEffect(() => {
    const view = searchParams?.get("view");
    const allowed = CATEGORY_VIEWS.some((v) => v.id === view);
    setActiveView(allowed && view ? view : DEFAULT_VIEW);
  }, [searchParams]);

  const { roots, hotDeals, isLoading, error, source } = useCreatorCategories(
    creatorSlug,
    {
      dealsOnly: showDealsOnly,
      view: activeView,
      locale: FORCED_LOCALE,
      includeEmpty: true,
    },
  );
  const router = useRouter();

  const displayNodes = useMemo(() => {
    if (activeView !== "GLOBAL_BEAUTY") return roots;
    const out: CategoryNode[] = [];
    for (const node of roots) {
      out.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        out.push(...node.children);
      }
    }
    return out;
  }, [activeView, roots]);

  const sortedRoots = useMemo(
    () => [...displayNodes].sort((a, b) => (b.category.priority ?? 0) - (a.category.priority ?? 0)),
    [displayNodes],
  );

  const heroCategories = useMemo(() => {
    if (sortedRoots.length === 0) return [];
    const picked: CategoryNode[] = [];
    const remaining = [...sortedRoots];
    for (const slug of TOP_CATEGORY_SLUGS) {
      const idx = remaining.findIndex((n) => n.category.slug === slug);
      if (idx >= 0) {
        picked.push(remaining[idx]);
        remaining.splice(idx, 1);
      }
    }
    while (picked.length < 3 && remaining.length > 0) {
      picked.push(remaining.shift()!);
    }
    return picked;
  }, [sortedRoots]);
  const restCategories = useMemo(() => {
    const heroIds = new Set(heroCategories.map((n) => n.category.id));
    return sortedRoots.filter((n) => !heroIds.has(n.category.id));
  }, [heroCategories, sortedRoots]);

  const buildCategoryHref = (node: CategoryNode) => {
    const cat = node.category;
    const creatorSlugSafe = creatorSlug || "creator";
    const search = new URLSearchParams({
      view: activeView,
      locale: FORCED_LOCALE,
    }).toString();
    return `/creator/${encodeURIComponent(
      creatorSlugSafe,
    )}/category/${encodeURIComponent(cat.slug)}?${search}`;
  };

  const handleToggleAll = () => {
    setShowDealsOnly(false);
  };

  const handleToggleDealsOnly = () => {
    setShowDealsOnly(true);
  };

  const handleViewChange = (viewId: string) => {
    setActiveView(viewId);
    const creatorSlugSafe = creatorSlug || "creator";
    router.replace(
      `/creator/${encodeURIComponent(creatorSlugSafe)}/categories?view=${encodeURIComponent(
        viewId,
      )}&locale=${encodeURIComponent(FORCED_LOCALE)}`,
    );
  };

  return (
    <>
      <header className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 sm:text-2xl">
              Shop by Category
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Explore our curated collections for every occasion.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full bg-slate-100 p-1 text-[11px] text-slate-600">
            <button
              type="button"
              onClick={handleToggleAll}
              className={cn(
                "rounded-full px-2.5 py-1",
                !showDealsOnly && "bg-white text-slate-900 shadow-sm",
              )}
            >
              All
            </button>
            <button
              type="button"
              onClick={handleToggleDealsOnly}
              className={cn(
                "rounded-full px-2.5 py-1",
                showDealsOnly && "bg-white text-slate-900 shadow-sm",
              )}
            >
              Deals only
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full bg-slate-100 p-1 text-[11px] text-slate-600">
            {CATEGORY_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleViewChange(v.id)}
                className={cn(
                  "rounded-full px-2.5 py-1",
                  activeView === v.id && "bg-white text-slate-900 shadow-sm",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          {source && source !== "canonical" && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
              Source: {source}
            </span>
          )}
        </div>

        {hotDeals.length > 0 && (
          <div className="mt-1 flex gap-2 overflow-x-auto rounded-xl bg-slate-900/5 p-3 text-xs text-slate-800">
            {hotDeals.map((deal) => (
              <span
                key={deal.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1",
                  deal.type === "FLASH_SALE"
                    ? "bg-rose-500/10 text-rose-700"
                    : "bg-emerald-500/10 text-emerald-700",
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {deal.label}
              </span>
            ))}
          </div>
        )}
      </header>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-56 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      )}

      {!isLoading && sortedRoots.length === 0 && !error && (
        <p className="mt-6 text-sm text-slate-500">
          No categories available yet. Try asking the agent on the left for
          recommendations.
        </p>
      )}

      {!isLoading && sortedRoots.length > 0 && (
        <div className="mt-6 space-y-8">
          <SectionHeader
            title="Top categories"
            subtitle="Pinned categories and high-signal groups appear first."
          />

          {/* Hero row: large cards (desktop) */}
          <section className="hidden gap-4 md:grid md:grid-cols-3">
            {heroCategories.map((node) => {
              const cat = node.category;
              const imageUrl =
                cat.imageUrl || CATEGORY_IMAGE_FALLBACK[cat.slug] || "";
              const isTopCategory = TOP_CATEGORY_SLUGS.includes(cat.slug as any);
              return (
                <a
                  key={cat.id}
                  href={buildCategoryHref(node)}
                  className={cn(
                    "group flex h-64 flex-col overflow-hidden rounded-3xl bg-slate-900/5 text-left text-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl",
                    isTopCategory && "shadow-lg",
                  )}
                >
                  <div className="relative flex-1">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={cat.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-medium text-slate-600">
                        {cat.name}
                      </div>
                    )}
                    <div className="absolute inset-0 flex flex-col justify-between px-4 py-4 text-white drop-shadow-md">
                      <div className="max-w-[70%] text-base font-semibold">
                        {cat.name}
                      </div>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm group-hover:bg-white">
                        →
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </section>

          {/* Hero row on mobile: horizontal scroll */}
          <section className="mt-4 flex gap-4 overflow-x-auto md:hidden">
            {heroCategories.map((node) => {
              const cat = node.category;
              const imageUrl =
                cat.imageUrl || CATEGORY_IMAGE_FALLBACK[cat.slug] || "";
              const isTopCategory = TOP_CATEGORY_SLUGS.includes(cat.slug as any);
              return (
                <a
                  key={cat.id}
                  href={buildCategoryHref(node)}
                  className={cn(
                    "group flex w-60 flex-col overflow-hidden rounded-3xl bg-slate-900/5 text-left text-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl",
                    isTopCategory && "shadow-lg",
                  )}
                >
                  <div className="relative h-56">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={cat.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-medium text-slate-600">
                        {cat.name}
                      </div>
                    )}
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-4 pt-6 text-white">
                      <div className="text-base font-semibold">{cat.name}</div>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm group-hover:bg-white">
                        →
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </section>

          {/* All categories grid */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              All categories
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {(restCategories.length > 0 ? restCategories : sortedRoots).map(
                (node) => {
                  const cat = node.category;
                  const imageUrl =
                    cat.imageUrl || CATEGORY_IMAGE_FALLBACK[cat.slug] || "";
                  return (
                    <a
                      key={cat.id}
                      href={buildCategoryHref(node)}
                      className={cn(
                        "group flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white text-left text-slate-900 shadow-sm transition hover:-translate-y-1 hover:shadow-md",
                        TOP_CATEGORY_SLUGS.includes(cat.slug as any) &&
                          "ring-1 ring-amber-200/80 ring-offset-1 ring-offset-white",
                      )}
                    >
                      <div className="h-44 w-full overflow-hidden bg-slate-100 sm:h-48">
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imageUrl}
                            alt={cat.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-[11px] font-medium text-slate-600">
                            {cat.name}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1 px-3 py-2">
                        <div className="text-sm font-semibold">{cat.name}</div>
                        <div className="mt-0.5 flex justify-end">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white shadow-sm group-hover:bg-slate-800">
                            →
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                },
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
