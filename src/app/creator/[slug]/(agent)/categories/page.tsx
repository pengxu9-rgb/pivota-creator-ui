'use client';

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCreatorCategories } from "@/lib/useCreatorCategories";
import type { CategoryNode } from "@/types/category";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";

export default function CreatorCategoriesPage() {
  const params = useParams<{ slug: string }>();
  const slugParam = params?.slug;
  const creatorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;

  const [showDealsOnly, setShowDealsOnly] = useState(false);

  const { roots, hotDeals, isLoading, error } = useCreatorCategories(
    creatorSlug,
    { dealsOnly: showDealsOnly },
  );
  const router = useRouter();
  const { setPromptFromContext } = useCreatorAgent();

  const sortedRoots = useMemo(
    () =>
      [...roots].sort(
        (a, b) => (b.category.priority ?? 0) - (a.category.priority ?? 0),
      ),
    [roots],
  );

  const heroCategories = useMemo(
    () => sortedRoots.slice(0, 3),
    [sortedRoots],
  );
  const restCategories = useMemo(
    () => (sortedRoots.length > 3 ? sortedRoots.slice(3) : []),
    [sortedRoots],
  );

  function handleCategoryClick(node: CategoryNode) {
    const cat = node.category;
    const creatorSlugSafe = creatorSlug || "creator";
    router.push(`/creator/${creatorSlugSafe}/category/${cat.slug}`);
    setPromptFromContext(
      `Browsing category: ${cat.name}. Show me deals and highly relevant products in this category.`,
    );
  }

  const handleToggleAll = () => {
    setShowDealsOnly(false);
  };

  const handleToggleDealsOnly = () => {
    setShowDealsOnly(true);
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
          {/* Hero row: large cards (desktop) */}
          <section className="hidden gap-4 md:grid md:grid-cols-3">
            {heroCategories.map((node) => {
              const cat = node.category;
              const count = cat.productCount ?? 0;
              const hasDeals = (cat.deals?.length ?? 0) > 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(node)}
                  className="group flex h-64 flex-col overflow-hidden rounded-3xl bg-slate-100 text-left text-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative flex-1">
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-medium text-slate-600">
                        {cat.name}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                      <div>
                        <div className="text-sm font-semibold">
                          {cat.name}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-100/80">
                          {count > 0
                            ? `${count} items`
                            : "Browse items in this category"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {hasDeals && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/80 px-2 py-0.5 text-[10px] text-white">
                            Deals
                          </span>
                        )}
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm group-hover:bg-white">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Hero row on mobile: horizontal scroll */}
          <section className="mt-4 flex gap-4 overflow-x-auto md:hidden">
            {heroCategories.map((node) => {
              const cat = node.category;
              const count = cat.productCount ?? 0;
              const hasDeals = (cat.deals?.length ?? 0) > 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(node)}
                  className="group flex w-60 flex-col overflow-hidden rounded-3xl bg-slate-100 text-left text-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative h-56">
                    {cat.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.imageUrl}
                        alt={cat.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-medium text-slate-600">
                        {cat.name}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                      <div>
                        <div className="text-sm font-semibold">
                          {cat.name}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-100/80">
                          {count > 0
                            ? `${count} items`
                            : "Browse items in this category"}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {hasDeals && (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/80 px-2 py-0.5 text-[10px] text-white">
                            Deals
                          </span>
                        )}
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm group-hover:bg-white">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
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
                  const count = cat.productCount ?? 0;
                  const hasDeals = (cat.deals?.length ?? 0) > 0;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(node)}
                      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white text-left text-slate-900 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                    >
                      <div className="h-32 w-full overflow-hidden bg-slate-100">
                        {cat.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cat.imageUrl}
                            alt={cat.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-[11px] font-medium text-slate-600">
                            {cat.name}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1 px-3 py-3">
                        <div>
                          <div className="text-sm font-semibold">
                            {cat.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {count > 0
                              ? `${count} items`
                              : "Browse items in this category"}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          {hasDeals && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                              Deals
                            </span>
                          )}
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] text-white shadow-sm group-hover:bg-slate-800">
                            →
                          </span>
                        </div>
                      </div>
                    </button>
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
