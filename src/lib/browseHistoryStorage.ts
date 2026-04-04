import type { DiscoveryRecentView, Product } from "@/types/product";

const MAX_RECENT_VIEWS = 50;
const VIEW_DEDUPE_WINDOW_MS = 15_000;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function normalizeScopeKey(scopeKey: string): string {
  return scopeKey.replace(/[^a-zA-Z0-9:_-]+/g, "_");
}

function getStorageKey(scopeKey: string): string {
  return `pivota_creator_browse_history_${normalizeScopeKey(scopeKey)}`;
}

function parseViewedAt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecentView(
  entry: DiscoveryRecentView | null,
): entry is DiscoveryRecentView {
  return Boolean(entry?.merchant_id && entry.product_id && entry.viewed_at);
}

export function readBrowseHistory(scopeKey: string): DiscoveryRecentView[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(scopeKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const entries: Array<DiscoveryRecentView | null> = parsed.map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        return {
          merchant_id: String(entry.merchant_id || "").trim(),
          product_id: String(entry.product_id || "").trim(),
          title: String(entry.title || "").trim(),
          description: String(entry.description || "").trim(),
          brand: String(entry.brand || "").trim() || undefined,
          category: String(entry.category || "").trim() || undefined,
          product_type: String(entry.product_type || "").trim() || undefined,
          viewed_at: String(entry.viewed_at || "").trim(),
          history_source:
            String(entry.history_source || "").trim().toLowerCase() === "account"
              ? "account"
              : "session",
        } satisfies DiscoveryRecentView;
      });

    return entries.filter(isRecentView).slice(0, MAX_RECENT_VIEWS);
  } catch (error) {
    console.error("Failed to read browse history", error);
    return [];
  }
}

export function recordBrowseHistoryView(
  scopeKey: string,
  product: Product,
): DiscoveryRecentView[] {
  if (!canUseStorage()) return [];

  const merchantId = String(product.merchantId || "").trim();
  const productId = String(product.id || "").trim();
  if (!merchantId || !productId) return readBrowseHistory(scopeKey);

  const nextEntry: DiscoveryRecentView = {
    merchant_id: merchantId,
    product_id: productId,
    title: product.title,
    description: product.description,
    ...(product.brand ? { brand: product.brand } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(product.productType ? { product_type: product.productType } : {}),
    viewed_at: new Date().toISOString(),
    history_source: "session",
  };

  const existing = readBrowseHistory(scopeKey);
  const deduped = existing.filter(
    (entry) =>
      !(
        entry.merchant_id === nextEntry.merchant_id &&
        entry.product_id === nextEntry.product_id
      ),
  );

  const newestExisting = existing.find(
    (entry) =>
      entry.merchant_id === nextEntry.merchant_id &&
      entry.product_id === nextEntry.product_id,
  );
  if (newestExisting) {
    const previousTs = parseViewedAt(newestExisting.viewed_at);
    const nextTs = parseViewedAt(nextEntry.viewed_at);
    if (
      previousTs != null &&
      nextTs != null &&
      nextTs - previousTs < VIEW_DEDUPE_WINDOW_MS
    ) {
      return existing;
    }
  }

  const nextHistory = [nextEntry, ...deduped].slice(0, MAX_RECENT_VIEWS);
  try {
    window.localStorage.setItem(
      getStorageKey(scopeKey),
      JSON.stringify(nextHistory),
    );
  } catch (error) {
    console.error("Failed to persist browse history", error);
  }
  return nextHistory;
}
