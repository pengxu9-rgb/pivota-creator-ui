import { useEffect, useState } from "react";
import type {
  CreatorCategoryTreeResponse,
  CategoryNode,
  CategoryDealSummary,
} from "@/types/category";

interface UseCreatorCategoriesOptions {
  includeCounts?: boolean;
  dealsOnly?: boolean;
  view?: string;
  locale?: string;
}

interface UseCreatorCategoriesResult {
  roots: CategoryNode[];
  hotDeals: CategoryDealSummary[];
  taxonomyVersion?: string;
  market?: string;
  locale?: string;
  viewId?: string;
  source?: string;
  isLoading: boolean;
  error: string | null;
}

export function useCreatorCategories(
  slug: string | undefined,
  options?: UseCreatorCategoriesOptions,
): UseCreatorCategoriesResult {
  const [roots, setRoots] = useState<CategoryNode[]>([]);
  const [hotDeals, setHotDeals] = useState<CategoryDealSummary[]>([]);
  const [meta, setMeta] = useState<{
    taxonomyVersion?: string;
    market?: string;
    locale?: string;
    viewId?: string;
    source?: string;
  }>({});
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
        if (options?.view) {
          params.set("view", options.view);
        }
        if (options?.locale) {
          params.set("locale", options.locale);
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
        setMeta({
          taxonomyVersion: data.taxonomyVersion,
          market: data.market,
          locale: data.locale,
          viewId: data.viewId,
          source: data.source,
        });
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
  }, [slug, options?.includeCounts, options?.dealsOnly, options?.view, options?.locale]);

  return { roots, hotDeals, ...meta, isLoading, error };
}
