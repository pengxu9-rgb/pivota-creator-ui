import type { CartItem } from "@/components/cart/CartProvider";

type HostedCheckoutSessionResponse = {
  checkout_url?: string;
  checkoutUrl?: string;
  checkout_token?: string;
  checkoutToken?: string;
  checkout_session_id?: string;
  checkoutSessionId?: string;
  error?: string;
  message?: string;
  detail?: unknown;
};

const CART_HOSTED_CHECKOUT_SESSION_URL = "/api/creator-agent/checkout/session";
const ORDER_HOSTED_CHECKOUT_SESSION_URL = "/api/creator-agent/checkout/order-session";

function readHostedCheckoutUrl(payload: HostedCheckoutSessionResponse): string | null {
  const value = String(payload.checkout_url || payload.checkoutUrl || "").trim();
  return value || null;
}

function buildHostedCheckoutItems(items: CartItem[]) {
  return items.map((item) => ({
    id: String(item.variantId || item.id || "").trim(),
    product_id: String(item.productId || item.id || "").trim(),
    merchant_id: String(item.merchantId || "").trim(),
    variant_id: String(item.variantId || "").trim(),
    ...(String(item.variantSku || "").trim() ? { sku: String(item.variantSku || "").trim() } : {}),
    quantity: Number(item.quantity) > 0 ? Math.floor(Number(item.quantity)) : 1,
  }));
}

function describeHostedCheckoutError(payload: HostedCheckoutSessionResponse): string {
  return (
    String(payload.message || "").trim() ||
    String(payload.error || "").trim() ||
    String(payload.detail || "").trim() ||
    "Unable to start hosted checkout"
  );
}

export async function createHostedCreatorCheckoutSession(items: CartItem[]): Promise<{
  checkoutUrl: string;
  checkoutToken: string | null;
  checkoutSessionId: string | null;
}> {
  if (!items.length) {
    throw new Error("Cannot start checkout with an empty cart");
  }

  const merchants = new Set(
    items.map((item) => String(item.merchantId || "").trim()).filter(Boolean),
  );
  if (merchants.size > 1) {
    throw new Error("Hosted checkout currently supports one seller at a time.");
  }

  const missingVariant = items.filter((item) => !String(item.variantId || "").trim());
  if (missingVariant.length > 0) {
    const titles = missingVariant
      .slice(0, 3)
      .map((item) => item.title)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Please select a size/color for ${titles || "one or more items"} before checkout.`,
    );
  }

  const response = await fetch(CART_HOSTED_CHECKOUT_SESSION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      items: buildHostedCheckoutItems(items),
      source: "creator_agent",
      return_url: typeof window !== "undefined" ? window.location.href : undefined,
      locale:
        typeof navigator !== "undefined" && String(navigator.language || "").trim()
          ? navigator.language
          : "en-US",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as HostedCheckoutSessionResponse;
  const checkoutUrl = readHostedCheckoutUrl(payload);
  if (!response.ok || !checkoutUrl) {
    throw new Error(describeHostedCheckoutError(payload));
  }

  return {
    checkoutUrl,
    checkoutToken: String(payload.checkout_token || payload.checkoutToken || "").trim() || null,
    checkoutSessionId:
      String(payload.checkout_session_id || payload.checkoutSessionId || "").trim() || null,
  };
}

export async function startHostedCreatorCheckout(items: CartItem[]): Promise<void> {
  const session = await createHostedCreatorCheckoutSession(items);
  if (typeof window === "undefined") return;
  window.location.assign(session.checkoutUrl);
}

export async function createHostedCreatorOrderCheckoutSession(params: {
  orderId: string;
  amountMinor: number;
  currency: string;
  returnUrl?: string;
}): Promise<{
  checkoutUrl: string;
  checkoutToken: string | null;
  checkoutSessionId: string | null;
}> {
  const orderId = String(params.orderId || "").trim();
  if (!orderId) {
    throw new Error("Missing order id for hosted checkout");
  }

  const currency = String(params.currency || "").trim().toUpperCase();
  if (!currency) {
    throw new Error("Missing currency for hosted checkout");
  }

  const amountMinor = Number(params.amountMinor);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new Error("Missing order amount for hosted checkout");
  }

  const response = await fetch(ORDER_HOSTED_CHECKOUT_SESSION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_id: orderId,
      amount_minor: Math.round(amountMinor),
      currency,
      source: "creator_agent",
      return_url:
        String(params.returnUrl || "").trim() ||
        (typeof window !== "undefined" ? window.location.href : undefined),
      locale:
        typeof navigator !== "undefined" && String(navigator.language || "").trim()
          ? navigator.language
          : "en-US",
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as HostedCheckoutSessionResponse;
  const checkoutUrl = readHostedCheckoutUrl(payload);
  if (!response.ok || !checkoutUrl) {
    throw new Error(describeHostedCheckoutError(payload));
  }

  return {
    checkoutUrl,
    checkoutToken: String(payload.checkout_token || payload.checkoutToken || "").trim() || null,
    checkoutSessionId:
      String(payload.checkout_session_id || payload.checkoutSessionId || "").trim() || null,
  };
}

export async function continueHostedCreatorCheckout(params: {
  orderId: string;
  amountMinor: number;
  currency: string;
  returnUrl?: string;
}): Promise<void> {
  const session = await createHostedCreatorOrderCheckoutSession(params);
  if (typeof window === "undefined") return;
  window.location.assign(session.checkoutUrl);
}
