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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, merchantId, country, postalCode, limit, debug, cacheBypass } = body as {
      productId?: string;
      merchantId?: string | null;
      country?: string;
      postalCode?: string;
      limit?: number;
      debug?: boolean;
      cacheBypass?: boolean;
    };

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const invokeUrl = getInvokeUrl();
    const payload = {
      operation: "resolve_product_candidates",
      payload: {
        product_ref: { product_id: productId, ...(merchantId ? { merchant_id: merchantId } : {}) },
        context: {
          ...(country ? { country } : {}),
          ...(postalCode ? { postal_code: postalCode } : {}),
        },
        options: {
          limit: typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 10,
          include_offers: true,
          ...(debug ? { debug: true } : {}),
          ...(cacheBypass ? { cache_bypass: true } : {}),
        },
      },
      metadata: { source: "creator-agent-ui" },
    };

    const res = await fetch(invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Failed to resolve product candidates",
          detail: `resolve_product_candidates failed with status ${res.status}${text ? ` body: ${text}` : ""}`,
        },
        { status: 500 },
      );
    }

    const raw = await res.json();
    return NextResponse.json(raw, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[creator-agent/resolve-product-candidates] error", error);
    return NextResponse.json(
      {
        error: "Failed to resolve product candidates",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

