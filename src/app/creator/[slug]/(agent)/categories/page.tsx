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
  const [activeRootId, setActiveRootId] = useState<string | null>(null);

  const router = useRouter();
  const { setPromptFromContext } = useCreatorAgent();

  const sortedRoots = useMemo(
    () =>
      [...roots].sort(
        (a, b) => (b.category.priority ?? 0) - (a.category.priority ?? 0),
      ),
    [roots],
  );

  const effectiveActiveRootId = useMemo(() => {
    if (activeRootId) return activeRootId;
    return sortedRoots[0]?.category.id ?? null;
  }, [activeRootId, sortedRoots]);

  const activeRoot =
    sortedRoots.find((node) => node.category.id === effectiveActiveRootId) ??
    sortedRoots[0];

  const visibleNodes: CategoryNode[] = useMemo(() => {
    if (!activeRoot) return [];
    if (activeRoot.children && activeRoot.children.length > 0) {
      return activeRoot.children;
    }
    // Fallback: when backend only has root-level categories, treat roots as clickable tiles.
    return sortedRoots;
  }, [activeRoot, sortedRoots]);

  function handleSubcategoryClick(node: CategoryNode) {
    const sub = node.category;
    const creatorSlugSafe = creatorSlug || "creator";
    router.push(`/creator/${creatorSlugSafe}/category/${sub.slug}`);
    setPromptFromContext(
      `Browsing category: ${sub.name}. Show me deals and highly relevant products in this category.`,
    );
  }

  const handleToggleAll = () => {
    setShowDealsOnly(false);
    setActiveRootId(null);
  };

  const handleToggleDealsOnly = () => {
    setShowDealsOnly(true);
    setActiveRootId(null);
  };

  return (
    <>
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <SectionHeader
            title="Browse by category"
            subtitle="Explore curated categories for this creator. Combine with chat on the left for more personalized picks."
          />
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
          <div className="mt-2 flex gap-2 overflow-x-auto rounded-xl bg-slate-900/5 p-3 text-xs text-slate-800">
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
        <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center rounded-2xl bg-slate-100 p-4"
            >
              <div className="mb-3 h-20 w-20 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && sortedRoots.length === 0 && !error && (
        <p className="mt-4 text-sm text-slate-500">
          No categories available yet. Try asking the agent on the left for
          recommendations.
        </p>
      )}

      {!isLoading && sortedRoots.length > 0 && (
        <div className="mt-4 flex flex-1 flex-col gap-4 lg:flex-row">
          <aside className="hidden w-56 shrink-0 border-r border-slate-200 pr-4 lg:block">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Categories
            </h2>
            <nav className="space-y-1">
              {sortedRoots.map((node) => {
                const isActive = node.category.id === effectiveActiveRootId;
                return (
                  <button
                    key={node.category.id}
                    onClick={() => setActiveRootId(node.category.id || null)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                      isActive
                        ? "bg-slate-900 text-white"
                        : "text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    <span>{node.category.name}</span>
                    <span className="text-xs text-slate-400">›</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="flex flex-1 flex-col gap-4">
            <div className="flex gap-2 overflow-x-auto lg:hidden">
              {sortedRoots.map((node) => {
                const isActive = node.category.id === effectiveActiveRootId;
                return (
                  <button
                    key={node.category.id}
                    onClick={() => setActiveRootId(node.category.id || null)}
                    className={cn(
                      "whitespace-nowrap rounded-full border px-3 py-1 text-xs",
                      isActive
                        ? "border-cyan-400 bg-cyan-500/10 text-cyan-700"
                        : "border-slate-300 bg-white text-slate-700",
                    )}
                  >
                    {node.category.name}
                  </button>
                );
              })}
            </div>

            <main className="flex-1">
              <div className="mb-4 flex items-baseline justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {activeRoot?.category.name ?? "Categories"}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {visibleNodes.length} categories curated for this creator.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {visibleNodes.map((node) => {
                  const sub = node.category;
                  const hasDeals = (sub.deals?.length ?? 0) > 0;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => handleSubcategoryClick(node)}
                      className="flex flex-col items-center rounded-2xl bg-white p-4 text-center text-slate-900 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                    >
                      <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                        {sub.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sub.imageUrl}
                            alt={sub.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            No image
                          </span>
                        )}
                      </div>
                      <span className="line-clamp-2 text-sm">{sub.name}</span>
                      <div className="mt-1 flex flex-col gap-1">
                        <span className="text-[11px] text-slate-500">
                          {(sub.productCount ?? 0) > 0
                            ? `${sub.productCount} items`
                            : "Browse items"}
                        </span>
                        {hasDeals && (
                          <span className="inline-flex items-center justify-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700">
                            Deals available
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </main>
          </div>
        </div>
      )}
    </>
  );
}
