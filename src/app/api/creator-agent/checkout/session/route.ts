import { NextResponse } from "next/server";
import {
  getCreatorCheckoutAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
} from "@/lib/creatorAgentGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_BASE =
  process.env.PIVOTA_BACKEND_BASE_URL ||
  process.env.NEXT_PUBLIC_PIVOTA_BACKEND_BASE_URL ||
  "https://web-production-fedb.up.railway.app";

function decorateCheckoutUrl(
  rawUrl: any,
  args?: {
    returnUrl?: string;
    source?: string;
  },
) {
  const checkoutUrl = String(rawUrl || "").trim();
  if (!checkoutUrl) return null;
  try {
    const url = new URL(checkoutUrl);
    if (!url.searchParams.get("entry")) {
      url.searchParams.set("entry", "creator_agent");
    }
    if (!url.searchParams.get("source")) {
      url.searchParams.set("source", String(args?.source || "").trim() || "creator_agent");
    }
    const returnUrl = String(args?.returnUrl || "").trim();
    if (returnUrl && !url.searchParams.get("return")) {
      url.searchParams.set("return", returnUrl);
    }
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

function normalizeCheckoutSessionResponse(
  raw: any,
  args?: {
    returnUrl?: string;
    source?: string;
  },
) {
  if (!raw || typeof raw !== "object") return raw;

  const checkoutUrl = decorateCheckoutUrl(raw.checkout_url || raw.checkoutUrl, args);
  const checkoutToken =
    String(raw.checkout_token || raw.checkoutToken || "").trim() || null;
  const checkoutSessionId =
    String(raw.checkout_session_id || raw.checkoutSessionId || "").trim() || null;
  const expiresAtRaw =
    Number(raw.expires_at ?? raw.expiresAt ?? 0) || null;

  return {
    ...raw,
    ...(checkoutUrl ? { checkout_url: checkoutUrl, checkoutUrl } : {}),
    ...(checkoutToken ? { checkout_token: checkoutToken, checkoutToken } : {}),
    ...(checkoutSessionId
      ? { checkout_session_id: checkoutSessionId, checkoutSessionId }
      : {}),
    ...(expiresAtRaw ? { expires_at: expiresAtRaw, expiresAt: expiresAtRaw } : {}),
  };
}

function hasCheckoutSessionPayload(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  return Boolean(
    String(raw.checkout_url || raw.checkoutUrl || "").trim() ||
      String(raw.checkout_token || raw.checkoutToken || "").trim(),
  );
}

async function postCheckoutSessionUpstream(args: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
  returnUrl?: string;
  source?: string;
}) {
  const upstream = await fetch(args.url, {
    method: "POST",
    headers: args.headers,
    body: JSON.stringify(args.body),
  });

  const upstreamText = await upstream.text();
  let upstreamBody: any = {};
  try {
    upstreamBody = upstreamText ? JSON.parse(upstreamText) : {};
  } catch {
    upstreamBody = { error: "INVALID_UPSTREAM_RESPONSE", detail: upstreamText };
  }

  return {
    status: upstream.status,
    body: normalizeCheckoutSessionResponse(upstreamBody, {
      returnUrl: args.returnUrl,
      source: args.source,
    }),
  };
}

function normalizeIntentItems(rawItems: any[]): any[] {
  return rawItems
    .map((raw) => {
      const productId = String(raw?.product_id || raw?.productId || "").trim();
      const merchantId = String(raw?.merchant_id || raw?.merchantId || "").trim();
      const variantId = String(raw?.variant_id || raw?.variantId || "").trim();
      const sku = String(raw?.sku || "").trim();
      const quantityRaw = Number(raw?.quantity);
      const quantity =
        Number.isFinite(quantityRaw) && quantityRaw > 0
          ? Math.floor(quantityRaw)
          : 1;
      if (!productId || !merchantId) return null;
      return {
        product_id: productId,
        merchant_id: merchantId,
        ...(variantId ? { variant_id: variantId } : {}),
        ...(sku ? { sku } : {}),
        quantity,
      };
    })
    .filter(Boolean);
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const apiKey = getCreatorCheckoutAgentApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "CHECKOUT_SESSION_KEY_MISSING",
          message: "Creator checkout API key is not configured",
        },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const items = normalizeIntentItems(Array.isArray(body?.items) ? body.items : []);
    if (!items.length) {
      return NextResponse.json(
        {
          error: "INVALID_REQUEST",
          message: "items[] with merchant_id/product_id is required",
        },
        { status: 400 },
      );
    }

    const returnUrl = String(body?.return_url || body?.returnUrl || "").trim();
    const source = String(body?.source || "").trim() || "creator-agent-ui";
    const market = String(body?.market || "").trim().toUpperCase();
    const locale = String(body?.locale || "").trim();
    const buyerRef = String(body?.buyer_ref || body?.buyerRef || "").trim();
    const jobId = String(body?.job_id || body?.jobId || "").trim();
    const creatorAgentBaseUrl = getOptionalCreatorAgentBaseUrl();
    const requestBody = {
      items,
      ...(returnUrl ? { return_url: returnUrl } : {}),
      ...(source ? { source } : {}),
      ...(market ? { market } : {}),
      ...(locale ? { locale } : {}),
      ...(buyerRef ? { buyer_ref: buyerRef } : {}),
      ...(jobId ? { job_id: jobId } : {}),
    };

    let upstreamResult:
      | {
          status: number;
          body: any;
        }
      | null = null;

    if (creatorAgentBaseUrl) {
      upstreamResult = await postCheckoutSessionUpstream({
        url: `${creatorAgentBaseUrl}/creator-agent/checkout-sessions`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
          "x-api-key": apiKey,
        },
        body: requestBody,
        returnUrl,
        source,
      });
    }

    const shouldFallbackToDirect =
      !upstreamResult ||
      upstreamResult.status === 401 ||
      upstreamResult.status === 403 ||
      upstreamResult.status >= 500 ||
      !hasCheckoutSessionPayload(upstreamResult.body);

    if (shouldFallbackToDirect) {
      upstreamResult = await postCheckoutSessionUpstream({
        url: `${BACKEND_BASE}/agent/v1/checkout/intents`,
        headers: {
          "Content-Type": "application/json",
          "X-Agent-API-Key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
        body: requestBody,
        returnUrl,
        source,
      });
    }

    return NextResponse.json(upstreamResult.body, {
      status: upstreamResult.status,
      headers: {
        "Server-Timing": `gateway;dur=${Math.max(0, Date.now() - startedAt)}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "CREATOR_CHECKOUT_SESSION_PROXY_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          "Server-Timing": `gateway;dur=${Math.max(0, Date.now() - startedAt)}`,
        },
      },
    );
  }
}
