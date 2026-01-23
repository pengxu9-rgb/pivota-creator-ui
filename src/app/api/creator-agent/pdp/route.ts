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

function pickPdpPayload(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  return raw.pdp_payload ?? raw.output?.pdp_payload ?? raw.data?.pdp_payload ?? null;
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

    if (!merchantId || !productId) {
      return NextResponse.json(
        { error: "Missing merchantId or productId" },
        { status: 400 },
      );
    }

    const invokeUrl = getInvokeUrl();
    const payload = {
      operation: "get_pdp",
      payload: {
        product: { merchant_id: merchantId, product_id: productId },
        ...(Array.isArray(include) && include.length ? { include } : {}),
        ...(debug ? { debug: true } : {}),
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
          error: "Failed to fetch pdp payload",
          detail: `get_pdp failed with status ${res.status}${text ? ` body: ${text}` : ""}`,
        },
        { status: 500 },
      );
    }

    const raw = await res.json();
    const pdp_payload = pickPdpPayload(raw);

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
