import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getInvokeUrl(): string {
  const urlEnv = (process.env.PIVOTA_AGENT_URL ||
    process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL) as string | undefined;
  if (!urlEnv) {
    throw new Error("PIVOTA_AGENT_URL or NEXT_PUBLIC_PIVOTA_AGENT_URL is not configured");
  }
  return urlEnv;
}

function isExternalProductRef(args: { merchantId?: string; productId?: string }) {
  const mid = String(args.merchantId || "").trim().toLowerCase();
  const pid = String(args.productId || "").trim().toLowerCase();
  if (mid === "external_seed") return true;
  if (pid.startsWith("ext_") || pid.startsWith("ext:")) return true;
  return false;
}

function authHeaders(): Record<string, string> {
  const bearer =
    process.env.PIVOTA_AGENT_API_KEY || process.env.PIVOTA_API_KEY || "";
  const xAgent =
    process.env.NEXT_PUBLIC_AGENT_API_KEY ||
    process.env.AGENT_API_KEY ||
    process.env.SHOP_GATEWAY_AGENT_API_KEY ||
    "";

  return {
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...(xAgent ? { "X-Agent-API-Key": xAgent } : {}),
  };
}

function extractProducts(raw: any): any[] {
  if (!raw || typeof raw !== "object") return [];
  const direct = raw.products ?? raw.items ?? null;
  if (Array.isArray(direct)) return direct;
  const data = raw.data && typeof raw.data === "object" ? raw.data : null;
  if (data) {
    const nested = (data as any).products ?? (data as any).items ?? null;
    if (Array.isArray(nested)) return nested;
  }
  const output = raw.output && typeof raw.output === "object" ? raw.output : null;
  if (output) {
    const nested = (output as any).products ?? (output as any).items ?? null;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function toRecommendationItem(p: any) {
  const product_id = String(p?.product_id ?? p?.productId ?? p?.id ?? "").trim();
  const title = String(p?.title ?? p?.name ?? "").trim() || product_id || "Untitled";
  const image_url = String(p?.image_url ?? p?.imageUrl ?? p?.image ?? "").trim() || undefined;
  const merchant_id = String(p?.merchant_id ?? p?.merchantId ?? "").trim() || undefined;

  let amount: number | undefined;
  let currency: string | undefined;
  const rawPrice = p?.price;
  if (rawPrice && typeof rawPrice === "object") {
    if (typeof rawPrice.amount === "number") amount = rawPrice.amount;
    if (typeof rawPrice.currency === "string") currency = rawPrice.currency;
  } else if (typeof rawPrice === "number") {
    amount = rawPrice;
  }
  if (!currency && typeof p?.currency === "string") currency = p.currency;

  const rating = typeof p?.rating === "number" ? p.rating : undefined;
  const review_count =
    typeof p?.review_count === "number" ? p.review_count : typeof p?.reviewCount === "number" ? p.reviewCount : undefined;

  return {
    product_id,
    title,
    ...(image_url ? { image_url } : {}),
    ...(merchant_id ? { merchant_id } : {}),
    ...(amount != null
      ? {
          price: {
            amount,
            currency: currency || "USD",
          },
        }
      : {}),
    ...(rating != null ? { rating } : {}),
    ...(review_count != null ? { review_count } : {}),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { merchantId, productId, limit, debug, cacheBypass } = body as {
      merchantId?: string;
      productId?: string;
      limit?: number;
      debug?: boolean;
      cacheBypass?: boolean;
    };

    if (!merchantId || !productId) {
      return NextResponse.json(
        { error: "Missing merchantId or productId" },
        { status: 400 },
      );
    }

    const invokeUrl = getInvokeUrl();
    const resolvedLimit = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 6;
    const timeoutMs = isExternalProductRef({ merchantId, productId }) ? 8000 : 12000;

    const payload = {
      operation: "find_similar_products",
      payload: {
        // Prefer the flat payload shape because some upstreams validate it strictly.
        // Keep the nested `similar` shape as a compat fallback for older gateways/mocks.
        merchant_id: merchantId,
        product_id: productId,
        limit: resolvedLimit,
        similar: {
          merchant_id: merchantId,
          product_id: productId,
          limit: resolvedLimit,
        },
        ...(debug ? { debug: true } : {}),
        ...(cacheBypass ? { cache_bypass: true } : {}),
      },
      metadata: { source: "creator-agent-ui" },
    };

    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        res = await fetch(invokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      const isAbort =
        err?.name === "AbortError" ||
        String(err?.message || "").toLowerCase().includes("aborted");
      if (isAbort) {
        return NextResponse.json(
          {
            error: "Failed to fetch recommendations",
            detail: `find_similar_products timed out after ${timeoutMs}ms`,
          },
          { status: 504 },
        );
      }
      throw err;
    }

    if (!res.ok) {
      // Do not fail the PDP if similar products are unavailable.
      return NextResponse.json(
        { strategy: "find_similar_products", items: [] },
        { status: 200 },
      );
    }

    const raw = await res.json();
    const products = extractProducts(raw);
    const items = products
      .map(toRecommendationItem)
      .filter((x) => x.product_id);

    return NextResponse.json(
      {
        strategy: "find_similar_products",
        items,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[creator-agent/recommendations] error", error);
    return NextResponse.json(
      { strategy: "find_similar_products", items: [] },
      { status: 200 },
    );
  }
}
