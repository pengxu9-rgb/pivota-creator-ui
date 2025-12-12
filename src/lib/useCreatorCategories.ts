import { useEffect, useState } from "react";
import type {
  CreatorCategoryTreeResponse,
  CategoryNode,
  CategoryDealSummary,
} from "@/types/category";

interface UseCreatorCategoriesOptions {
  includeCounts?: boolean;
  dealsOnly?: boolean;
}

interface UseCreatorCategoriesResult {
  roots: CategoryNode[];
  hotDeals: CategoryDealSummary[];
  isLoading: boolean;
  error: string | null;
}

export function useCreatorCategories(
  slug: string | undefined,
  options?: UseCreatorCategoriesOptions,
): UseCreatorCategoriesResult {
  const [roots, setRoots] = useState<CategoryNode[]>([]);
  const [hotDeals, setHotDeals] = useState<CategoryDealSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (options?.includeCounts !== undefined) {
          params.set("includeCounts", String(options.includeCounts));
        }
        if (options?.dealsOnly !== undefined) {
          params.set("dealsOnly", String(options.dealsOnly));
        }
        const qs = params.toString();
        const url = qs
          ? `/api/creator/${slug}/categories?${qs}`
          : `/api/creator/${slug}/categories`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data: CreatorCategoryTreeResponse = await res.json();
        if (cancelled) return;
        setRoots(data.roots || []);
        setHotDeals(data.hotDeals || []);
      } catch (err) {
        console.error("Failed to load creator categories", err);
        if (!cancelled) {
          setError("Failed to load categories");
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
  }, [slug, options?.includeCounts, options?.dealsOnly]);

  return { roots, hotDeals, isLoading, error };
}

