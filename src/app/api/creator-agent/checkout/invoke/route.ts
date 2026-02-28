import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getCreatorCheckoutAuthHeaders,
  getCreatorCheckoutInvokeUrl,
} from "@/lib/creatorAgentGateway";

export const runtime = "nodejs";

const ALLOWED_OPERATIONS = new Set([
  "preview_quote",
  "create_order",
  "submit_payment",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Agent-API-Key, X-Checkout-Token",
  "Access-Control-Expose-Headers": "Server-Timing, x-gateway-retries, x-gateway-trace-id",
} as const;

function withCorsHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    ...CORS_HEADERS,
    ...extraHeaders,
  };
}

export async function POST(req: Request) {
  try {
    const startedAt = Date.now();
    const body = await req.json();
    const operation = String(body?.operation || "").trim();

    if (!ALLOWED_OPERATIONS.has(operation)) {
      return NextResponse.json(
        {
          error: "UNSUPPORTED_OPERATION",
          message: "operation must be preview_quote, create_order, or submit_payment",
        },
        { status: 400, headers: withCorsHeaders() },
      );
    }

    const checkoutToken = String(req.headers.get("x-checkout-token") || "").trim();
    const traceId =
      String(req.headers.get("x-trace-id") || "").trim() ||
      `creator-checkout:${randomUUID()}`;
    const invokeUrl = getCreatorCheckoutInvokeUrl();
    const upstreamStartedAt = Date.now();
    const upstream = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Trace-Id": traceId,
        ...getCreatorCheckoutAuthHeaders({ checkoutToken }),
      },
      body: JSON.stringify(body),
    });
    const upstreamMs = Math.max(0, Date.now() - upstreamStartedAt);
    const totalMs = Math.max(0, Date.now() - startedAt);
    const proxyMs = Math.max(0, totalMs - upstreamMs);
    const upstreamTiming = String(upstream.headers.get("server-timing") || "").trim();
    const upstreamRetries = String(upstream.headers.get("x-gateway-retries") || "").trim();
    const timingHeader = [
      ...(upstreamTiming ? [upstreamTiming] : [`upstream;dur=${upstreamMs}`]),
      `proxy;dur=${proxyMs}`,
      `gateway;dur=${totalMs}`,
    ].join(", ");

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await upstream.json().catch(() => ({}));
      return NextResponse.json(data, {
        status: upstream.status,
        headers: withCorsHeaders({
          "Server-Timing": timingHeader,
          "x-gateway-trace-id": traceId,
          ...(upstreamRetries ? { "x-gateway-retries": upstreamRetries } : {}),
        }),
      });
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: withCorsHeaders({
        "Server-Timing": timingHeader,
        "x-gateway-trace-id": traceId,
        ...(upstreamRetries ? { "x-gateway-retries": upstreamRetries } : {}),
        "Content-Type": contentType || "text/plain; charset=utf-8",
      }),
    });
  } catch (error) {
    console.error("[creator-agent/checkout/invoke] error", error);
    return NextResponse.json(
      {
        error: "CREATOR_CHECKOUT_PROXY_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: withCorsHeaders() },
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json(
    {},
    {
      status: 200,
      headers: withCorsHeaders(),
    },
  );
}
