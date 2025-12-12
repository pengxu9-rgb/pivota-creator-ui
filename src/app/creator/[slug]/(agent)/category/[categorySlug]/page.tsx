'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";

export default function CreatorCategoryProductsPage() {
  const params = useParams<{
    slug: string;
    categorySlug: string;
  }>();
  const slugParam = params?.slug;
  const categorySlugParam = params?.categorySlug;
  const creatorSlug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const categorySlug = Array.isArray(categorySlugParam)
    ? categorySlugParam[0]
    : categorySlugParam;

  const { creator, setPromptFromContext } = useCreatorAgent();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categoryTitle = useMemo(() => {
    if (!categorySlug) return "Category";
    const pretty = categorySlug.replace(/-/g, " ");
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }, [categorySlug]);

  useEffect(() => {
    if (!creatorSlug || !categorySlug) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/creator/${creatorSlug}/category/${categorySlug}/products`,
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { products?: Product[] };
        if (cancelled) return;
        setProducts(data.products ?? []);
      } catch (err) {
        console.error("Failed to load category products", err);
        if (!cancelled) {
          setError("Failed to load products for this category.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [creatorSlug, categorySlug]);

  const handleShopWithAI = () => {
    setPromptFromContext(
      `Browsing category: ${categoryTitle}. Show me deals and highly relevant products in this category.`,
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            Categories / {categoryTitle}
          </div>
          <SectionHeader
            title={categoryTitle}
            subtitle="Products in this category, with deals integrated."
          />
        </div>
        <button
          type="button"
          onClick={handleShopWithAI}
          className="hidden rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 sm:inline-flex"
        >
          Shop this category with AI
        </button>
      </div>

      {isLoading && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-40 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      )}

      {!isLoading && !error && products.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No products were found in this category yet. Try asking the agent on
          the left for alternatives.
        </p>
      )}

      {!isLoading && !error && products.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              creatorName={creator.name}
              creatorId={creator.id}
              creatorSlug={creator.slug}
            />
          ))}
        </div>
      )}
    </>
  );
}

