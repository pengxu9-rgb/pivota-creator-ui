import { NextRequest, NextResponse } from "next/server";

type LegacyCheckoutHitPayload = {
  event?: "legacy_checkout_order_redirect" | "legacy_checkout_cart_redirect" | "legacy_checkout_error";
  orderId?: string | null;
  creatorSlug?: string | null;
  cartDestination?: string | null;
  pathname?: string | null;
  search?: string | null;
  state?: string | null;
  message?: string | null;
};

function normalizePayload(value: unknown): LegacyCheckoutHitPayload {
  if (!value || typeof value !== "object") {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const read = (key: keyof LegacyCheckoutHitPayload) => {
    const next = raw[key];
    if (typeof next !== "string") return null;
    const trimmed = next.trim();
    return trimmed || null;
  };
  const event = read("event");
  return {
    event:
      event === "legacy_checkout_order_redirect" ||
      event === "legacy_checkout_cart_redirect" ||
      event === "legacy_checkout_error"
        ? event
        : undefined,
    orderId: read("orderId"),
    creatorSlug: read("creatorSlug"),
    cartDestination: read("cartDestination"),
    pathname: read("pathname"),
    search: read("search"),
    state: read("state"),
    message: read("message"),
  };
}

export async function POST(request: NextRequest) {
  let payload: LegacyCheckoutHitPayload = {};

  try {
    payload = normalizePayload(await request.json());
  } catch {
    payload = {};
  }

  console.warn("[creator][legacy-checkout-hit]", {
    ...payload,
    ts: new Date().toISOString(),
    userAgent: request.headers.get("user-agent") || null,
    referer: request.headers.get("referer") || null,
  });

  return NextResponse.json({ status: "ok" });
}
