import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  getCreatorCheckoutAuthHeaders,
  getCreatorCheckoutInvokeUrl,
} from "@/lib/creatorAgentGateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_TIMING_NAME = "gateway";

type CheckoutOrderSessionResponse = {
  checkout_url?: string;
  checkoutUrl?: string;
  checkout_token?: string;
  checkoutToken?: string;
  checkout_session_id?: string;
  checkoutSessionId?: string;
  payment?: {
    hosted_url?: string;
    checkout_token?: string;
    checkout_session_id?: string;
  } | null;
  error?: string;
  message?: string;
  detail?: unknown;
};

function readCheckoutUrl(payload: CheckoutOrderSessionResponse): string | null {
  const checkoutUrl = String(
    payload.checkout_url || payload.checkoutUrl || payload.payment?.hosted_url || "",
  ).trim();
  return checkoutUrl || null;
}

function normalizeCheckoutResponse(payload: CheckoutOrderSessionResponse) {
  const checkoutUrl = readCheckoutUrl(payload);
  const checkoutToken =
    String(payload.checkout_token || payload.checkoutToken || payload.payment?.checkout_token || "").trim() ||
    null;
  const checkoutSessionId =
    String(
      payload.checkout_session_id ||
        payload.checkoutSessionId ||
        payload.payment?.checkout_session_id ||
        "",
    ).trim() || null;

  return {
    ...payload,
    ...(checkoutUrl ? { checkout_url: checkoutUrl, checkoutUrl } : {}),
    ...(checkoutToken ? { checkout_token: checkoutToken, checkoutToken } : {}),
    ...(checkoutSessionId
      ? { checkout_session_id: checkoutSessionId, checkoutSessionId }
      : {}),
  };
}

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id || body?.orderId || "").trim();
    const amountMinor = Number(body?.amount_minor ?? body?.amountMinor);
    const currency = String(body?.currency || "").trim().toUpperCase();
    const returnUrl = String(body?.return_url || body?.returnUrl || "").trim();
    const locale = String(body?.locale || "").trim();
    const source = String(body?.source || "").trim() || "creator_agent";

    if (!orderId || !Number.isFinite(amountMinor) || amountMinor <= 0 || !currency) {
      return NextResponse.json(
        {
          error: "INVALID_REQUEST",
          message: "order_id, amount_minor, and currency are required",
        },
        { status: 400 },
      );
    }

    const invokeUrl = getCreatorCheckoutInvokeUrl();
    const traceId =
      String(req.headers.get("x-trace-id") || "").trim() ||
      `creator-order-checkout:${randomUUID()}`;

    const upstream = await fetch(invokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Trace-Id": traceId,
        ...getCreatorCheckoutAuthHeaders(),
      },
      body: JSON.stringify({
        operation: "submit_payment",
        payload: {
          payment: {
            order_id: orderId,
            expected_amount: Math.round(amountMinor) / 100,
            currency,
            payment_method_hint: "card",
            source,
            ...(returnUrl ? { return_url: returnUrl } : {}),
            ...(locale ? { locale } : {}),
          },
        },
      }),
    });

    const upstreamText = await upstream.text();
    let upstreamBody: CheckoutOrderSessionResponse = {};
    try {
      upstreamBody = upstreamText ? (JSON.parse(upstreamText) as CheckoutOrderSessionResponse) : {};
    } catch {
      upstreamBody = {
        error: "INVALID_UPSTREAM_RESPONSE",
        detail: upstreamText,
      };
    }

    const normalizedBody = normalizeCheckoutResponse(upstreamBody);
    const totalMs = Math.max(0, Date.now() - startedAt);

    return NextResponse.json(normalizedBody, {
      status: upstream.status,
      headers: {
        "Server-Timing": `${SERVER_TIMING_NAME};dur=${totalMs}`,
        "x-gateway-trace-id": traceId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "CREATOR_ORDER_CHECKOUT_SESSION_PROXY_ERROR",
        detail: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: {
          "Server-Timing": `${SERVER_TIMING_NAME};dur=${Math.max(0, Date.now() - startedAt)}`,
        },
      },
    );
  }
}
