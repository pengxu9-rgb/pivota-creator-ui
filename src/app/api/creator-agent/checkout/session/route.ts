import { NextResponse } from "next/server";
import {
  getCreatorCheckoutAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
} from "@/lib/creatorAgentGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANONICAL_CREATOR_CHECKOUT_SOURCE = "creator_agent";
const LEGACY_CREATOR_CHECKOUT_SOURCES = new Set([
  "creator",
  "creator_agent",
  "creator_agent_ui",
]);
const CHECKOUT_SESSION_UPSTREAM_TIMEOUT_MS = 8000;

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
      url.searchParams.set("entry", CANONICAL_CREATOR_CHECKOUT_SOURCE);
    }
    if (!url.searchParams.get("source")) {
      url.searchParams.set(
        "source",
        normalizeCheckoutSource(args?.source) || CANONICAL_CREATOR_CHECKOUT_SOURCE,
      );
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

function normalizeCheckoutSource(raw: unknown): string | null {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (!normalized) return null;
  if (LEGACY_CREATOR_CHECKOUT_SOURCES.has(normalized)) {
    return CANONICAL_CREATOR_CHECKOUT_SOURCE;
  }
  return normalized;
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

function hasResolvedCheckoutItems(items: Record<string, any>[]): boolean {
  return items.every((item) => {
    const productId = String(item?.product_id || item?.productId || "").trim();
    const merchantId = String(item?.merchant_id || item?.merchantId || "").trim();
    const variantId = String(item?.variant_id || item?.variantId || "").trim();
    return Boolean(productId && merchantId && variantId);
  });
}

async function postCheckoutSessionUpstream(args: {
  url: string;
  headers: Record<string, string>;
  body: Record<string, any>;
  returnUrl?: string;
  source?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("checkout_session_timeout"),
    CHECKOUT_SESSION_UPSTREAM_TIMEOUT_MS,
  );
  try {
    const upstream = await fetch(args.url, {
      method: "POST",
      headers: args.headers,
      body: JSON.stringify(args.body),
      signal: controller.signal,
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      status: 504,
      body: {
        error: "UPSTREAM_TIMEOUT",
        detail,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIntentItems(rawItems: any[]): any[] {
  return rawItems
    .map((raw) => {
      const productId = String(raw?.product_id || raw?.productId || "").trim();
      const merchantId = String(raw?.merchant_id || raw?.merchantId || "").trim();
      const variantId = String(raw?.variant_id || raw?.variantId || "").trim();
      const itemId = String(raw?.id || "").trim();
      const sku = String(raw?.sku || raw?.sku_id || raw?.skuId || "").trim();
      const quantityRaw = Number(raw?.quantity);
      const quantity =
        Number.isFinite(quantityRaw) && quantityRaw > 0
          ? Math.floor(quantityRaw)
          : 1;
      if (!productId || !merchantId) return null;
      const normalizedItemId = variantId || itemId || sku || productId;
      return {
        product_id: productId,
        productId,
        merchant_id: merchantId,
        merchantId,
        ...(variantId ? { variant_id: variantId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(normalizedItemId ? { id: normalizedItemId } : {}),
        ...(sku ? { sku } : {}),
        ...(sku ? { skuId: sku } : {}),
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
    const source =
      normalizeCheckoutSource(body?.source) || CANONICAL_CREATOR_CHECKOUT_SOURCE;
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

    const shouldTryDirectFirst = hasResolvedCheckoutItems(items);

    if (shouldTryDirectFirst) {
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

    if (!upstreamResult && creatorAgentBaseUrl) {
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

    if (shouldFallbackToDirect && !shouldTryDirectFirst) {
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

    if (!upstreamResult) {
      return NextResponse.json(
        {
          error: "CREATOR_CHECKOUT_SESSION_UNAVAILABLE",
          message: "Unable to create creator checkout session",
        },
        {
          status: 502,
          headers: {
            "Server-Timing": `gateway;dur=${Math.max(0, Date.now() - startedAt)}`,
          },
        },
      );
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
