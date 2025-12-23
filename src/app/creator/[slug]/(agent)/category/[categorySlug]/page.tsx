'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";

const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  sportswear: "Sportswear",
  "lingerie-set": "Lingerie Set",
  toys: "Toys",
  "designer-toys": "Designer Toys",
  "womens-loungewear": "Women’s Loungewear",
  "womens-dress": "Women’s Dress",
  "outdoor-clothing": "Outdoor Clothing",
  "pet-apparel": "Pet Apparel",
  "pet-toys": "Pet Toys",
};

const FORCED_LOCALE = "en-US";

interface CategoryProductsResponse {
  products: Product[];
  pagination?: {
    page: number;
    limit: number;
    total?: number;
  };
}

export default function CreatorCategoryProductsPage() {
  const params = useParams<{ slug: string; categorySlug: string }>();
  const slugParam = params?.slug;
  const categorySlugParam = params?.categorySlug;
  const creatorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const categorySlug = Array.isArray(categorySlugParam)
    ? categorySlugParam[0]
    : categorySlugParam;
  const searchParams = useSearchParams();
  const view = searchParams?.get("view");
  const dealsOnlyParam = searchParams?.get("dealsOnly");
  const dealsOnly = dealsOnlyParam === "true" || dealsOnlyParam === "1";

  const {
    creator,
    handleSeeSimilar,
    handleViewDetails,
    setPromptFromContext,
  } = useCreatorAgent();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryTitle = useMemo(() => {
    if (!categorySlug) return "Category";
    const overridden = CATEGORY_NAME_OVERRIDES[categorySlug];
    if (overridden) return overridden;
    return categorySlug
      .split("-")
      .map((part: string) =>
        part.length > 0 ? part[0]!.toUpperCase() + part.slice(1) : part,
      )
      .join(" ");
  }, [categorySlug]);

  const categoriesHref = useMemo(() => {
    const slug = creatorSlug || creator.slug;
    const search = new URLSearchParams({
      view: view || "GLOBAL_FASHION",
      locale: FORCED_LOCALE,
    }).toString();
    return `/creator/${encodeURIComponent(slug)}/categories?${search}`;
  }, [creatorSlug, creator.slug, view]);

  useEffect(() => {
    if (!creatorSlug || !categorySlug) return;

    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/creator/${encodeURIComponent(
            creatorSlug,
          )}/category/${encodeURIComponent(
            categorySlug,
          )}/products?limit=500&page=1${view ? `&view=${encodeURIComponent(view)}` : ""}&locale=${encodeURIComponent(FORCED_LOCALE)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as CategoryProductsResponse;
        setProducts(data.products || []);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("Failed to load category products", err);
        setError("Failed to load products for this category.");
      } finally {
        setIsLoading(false);
      }
    };

    load();

    return () => {
      controller.abort();
    };
  }, [creatorSlug, categorySlug, view]);

  const handleShopWithAI = () => {
    setPromptFromContext(
      `Browsing category: ${categoryTitle}. Show me great deals and highly relevant pieces in this category.`,
    );
  };

  const displayProducts = useMemo(
    () => (dealsOnly ? products.filter((p) => Boolean(p.bestDeal)) : products),
    [products, dealsOnly],
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <header className="space-y-3">
        <nav className="text-[11px] text-[#b29a84]">
          <a href={categoriesHref} className="underline-offset-2 hover:underline">
            Categories
          </a>
          <span className="mx-1">/</span>
          <span className="text-[#8c715c]">{categoryTitle}</span>
        </nav>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#3f3125] sm:text-2xl">
              {categoryTitle}
            </h1>
            <p className="mt-1 text-xs text-[#8c715c] sm:text-sm">
              Browse products in this category curated for {creator.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleShopWithAI}
            className="hidden rounded-full bg-[#3f3125] px-4 py-2 text-[11px] font-medium text-white shadow-sm hover:bg-black sm:inline-flex"
          >
            Shop this category with AI
          </button>
        </div>

        <button
          type="button"
          onClick={handleShopWithAI}
          className="inline-flex w-full items-center justify-center rounded-full bg-[#3f3125] px-4 py-2 text-[11px] font-medium text-white shadow-sm hover:bg-black sm:hidden"
        >
          Shop this category with AI
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="h-40 animate-pulse rounded-3xl bg-[#f4e2d4]"
            />
          ))}
        </div>
      )}

      {!isLoading && !error && products.length === 0 && (
        <p className="mt-4 text-sm text-[#8c715c]">
          No products found in this category yet. Try switching to another
          category or ask the shopping agent on the left.
        </p>
      )}

      {!isLoading && products.length > 0 && (
        <section className="mt-2">
          <div className="mb-3 text-[11px] text-[#b29a84]">
            Showing {displayProducts.length} item
            {displayProducts.length > 1 ? "s" : ""} in this category.
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {displayProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                displayMode={dealsOnly ? "deals" : "default"}
                creatorName={creator.name}
                creatorId={creator.id}
                creatorSlug={creator.slug}
                onSeeSimilar={handleSeeSimilar}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
