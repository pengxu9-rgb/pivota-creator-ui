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

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickPdpPayload(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  return raw.pdp_payload ?? raw.output?.pdp_payload ?? raw.data?.pdp_payload ?? null;
}

function pickPdpV2Payload(raw: any) {
  if (!isRecord(raw)) return null;
  const modules = Array.isArray((raw as any).modules) ? (raw as any).modules : [];
  const canonical = modules.find((m: any) => isRecord(m) && m.type === "canonical") || null;
  const canonicalData = isRecord((canonical as any)?.data) ? (canonical as any).data : null;
  const base = canonicalData?.pdp_payload;
  if (!isRecord(base)) return null;

  const payload: any = {
    ...base,
    ...(isRecord((base as any).product) ? { product: { ...(base as any).product } } : {}),
    ...(Array.isArray((base as any).modules) ? { modules: [...(base as any).modules] } : { modules: [] }),
    ...(Array.isArray((base as any).actions) ? { actions: [...(base as any).actions] } : { actions: [] }),
  };

  const subject = isRecord((raw as any).subject) ? ((raw as any).subject as any) : null;
  const subjectGroupId =
    subject && String(subject.type || "").trim().toLowerCase() === "product_group"
      ? String(subject.id || "").trim()
      : "";
  const canonicalGroupId =
    canonicalData && typeof canonicalData.product_group_id === "string"
      ? canonicalData.product_group_id.trim()
      : "";
  const productGroupId = canonicalGroupId || subjectGroupId;
  if (productGroupId) payload.product_group_id = productGroupId;

  const offersModule = modules.find((m: any) => isRecord(m) && m.type === "offers") || null;
  const offersData = isRecord((offersModule as any)?.data) ? (offersModule as any).data : null;
  if (offersData) {
    const offers = Array.isArray(offersData.offers) ? offersData.offers : null;
    if (offers) payload.offers = offers;
    const offersCount =
      typeof offersData.offers_count === "number"
        ? offersData.offers_count
        : offers
          ? offers.length
          : payload.offers_count;
    if (offersCount != null) payload.offers_count = offersCount;
    if (typeof offersData.default_offer_id === "string") payload.default_offer_id = offersData.default_offer_id;
    if (typeof offersData.best_price_offer_id === "string") payload.best_price_offer_id = offersData.best_price_offer_id;
    if (!payload.product_group_id && typeof offersData.product_group_id === "string" && offersData.product_group_id.trim()) {
      payload.product_group_id = offersData.product_group_id.trim();
    }
  }

  const reviewsModule = modules.find((m: any) => isRecord(m) && m.type === "reviews_preview") || null;
  const reviewsData = isRecord((reviewsModule as any)?.data) ? (reviewsModule as any).data : null;
  if (reviewsData) {
    payload.modules = (Array.isArray(payload.modules) ? payload.modules : []).filter((m: any) => m?.type !== "reviews_preview");
    payload.modules.push({
      module_id: "reviews_preview",
      type: "reviews_preview",
      priority: 50,
      title: "Reviews",
      data: reviewsData,
    });
  }

  const similarModule = modules.find((m: any) => isRecord(m) && m.type === "similar") || null;
  const similarData = isRecord((similarModule as any)?.data) ? (similarModule as any).data : null;
  if (similarData) {
    payload.modules = (Array.isArray(payload.modules) ? payload.modules : []).filter((m: any) => m?.type !== "recommendations");
    payload.modules.push({
      module_id: "recommendations",
      type: "recommendations",
      priority: 90,
      title: "Similar",
      data: similarData,
    });
    payload.x_recommendations_state = "ready";
  }

  return payload;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { merchantId, productId, include, debug } = body as {
      merchantId?: string;
      productId?: string;
      include?: string[];
      debug?: boolean;
    };

    const includeRaw = Boolean(debug);
    const includeList = Array.isArray(include) ? include.filter(Boolean) : [];
    const wantsRecommendations = includeList.includes("recommendations");

    if (!productId) {
      return NextResponse.json(
        { error: "Missing productId" },
        { status: 400 },
      );
    }

    const invokeUrl = getInvokeUrl();
    const merchantIdNormalized = merchantId ? String(merchantId).trim() : "";
    const product = { merchant_id: merchantIdNormalized, product_id: productId, variant_id: productId };
    const baseRequest = {
      operation: "get_pdp_v2",
      payload: {
        product_ref: {
          product_id: productId,
          ...(merchantIdNormalized ? { merchant_id: merchantIdNormalized } : {}),
        },
        ...(includeList.length ? { include: includeList } : {}),
        options: {
          ...(debug ? { debug: true } : {}),
        },
      },
      metadata: { source: "creator-agent-ui" },
    };

    const fallbackRequest = {
      operation: "get_pdp",
      payload: {
        product,
        ...(debug ? { debug: true } : {}),
      },
      metadata: { source: "creator-agent-ui" },
    };

    let res = await fetch(invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(baseRequest),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");

      // Fallback: if recommendations break upstream, retry without `include`/`similar`
      // so the PDP can still render.
      if (merchantIdNormalized && wantsRecommendations) {
        const retry = await fetch(invokeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(fallbackRequest),
        });

        if (retry.ok) {
          res = retry;
        } else {
          const retryText = await retry.text().catch(() => "");
          return NextResponse.json(
            {
              error: "Failed to fetch pdp payload",
              detail: `get_pdp failed with status ${retry.status}${retryText ? ` body: ${retryText}` : ""}`,
            },
            { status: 500 },
          );
        }
      } else {
        return NextResponse.json(
          {
            error: "Failed to fetch pdp payload",
            detail: `get_pdp_v2 failed with status ${res.status}${text ? ` body: ${text}` : ""}`,
          },
          { status: 500 },
        );
      }
    }

    const raw = await res.json();
    const pdp_payload = pickPdpV2Payload(raw) || pickPdpPayload(raw);

    if (!pdp_payload) {
      return NextResponse.json(
        includeRaw
          ? { error: "PDP payload missing from gateway response", raw }
          : { error: "PDP payload missing from gateway response" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      includeRaw ? { pdp_payload, raw } : { pdp_payload },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[creator-agent/pdp] error", error);
    return NextResponse.json(
      {
        error: "Failed to fetch pdp payload",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
