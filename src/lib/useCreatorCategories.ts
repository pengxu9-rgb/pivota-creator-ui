import { useEffect, useState } from "react";
import type {
  CreatorCategoryTreeResponse,
  CategoryNode,
  CategoryDealSummary,
} from "@/types/category";

interface UseCreatorCategoriesOptions {
  includeCounts?: boolean;
  includeEmpty?: boolean;
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

function formatCategoriesError(status: number | null, detail?: string): string {
  const normalized = String(detail || "").trim().toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    normalized.includes("missing or invalid api key") ||
    normalized.includes("unauthorized")
  ) {
    return "Category discovery is configured, but this environment is missing a valid agent API key.";
  }
  if (
    status === 503 ||
    normalized.includes("not configured") ||
    normalized.includes("unavailable")
  ) {
    return "Category discovery isn't configured or available right now.";
  }
  return "Failed to load categories.";
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
        if (options?.includeEmpty !== undefined) {
          params.set("includeEmpty", String(options.includeEmpty));
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
          const body = await res.json().catch(() => null);
          const detail =
            body && typeof body === "object"
              ? String(
                  (body as { detail?: unknown; error?: unknown }).detail ||
                    (body as { detail?: unknown; error?: unknown }).error ||
                    "",
                ).trim()
              : "";
          const error = new Error(detail || `HTTP ${res.status}`) as Error & {
            status?: number;
          };
          error.status = res.status;
          throw error;
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
        const status =
          typeof (err as { status?: unknown })?.status === "number"
            ? Number((err as { status?: unknown }).status)
            : null;
        const detail = err instanceof Error ? err.message : String(err);
        const shouldLog =
          status == null || ![401, 503].includes(status);
        if (shouldLog) {
          console.error("Failed to load creator categories", err);
        }
        if (!cancelled) {
          setError(formatCategoriesError(status, detail));
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
  }, [
    slug,
    options?.includeCounts,
    options?.dealsOnly,
    options?.includeEmpty,
    options?.view,
    options?.locale,
  ]);

  return { roots, hotDeals, ...meta, isLoading, error };
}
