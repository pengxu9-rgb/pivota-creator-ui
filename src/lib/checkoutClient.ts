import type { CartItem } from "@/components/cart/CartProvider";

const CHECKOUT_PROXY_URL = "/api/creator-agent/checkout/invoke";
const CHECKOUT_SESSION_URL = "/api/creator-agent/checkout/session";
const DIRECT_CHECKOUT_ENABLED =
  String(process.env.NEXT_PUBLIC_ENABLE_DIRECT_CHECKOUT_INVOKE || "")
    .trim()
    .toLowerCase() === "true";
const DIRECT_CHECKOUT_INVOKE_URL = String(
  process.env.NEXT_PUBLIC_DIRECT_CHECKOUT_INVOKE_URL ||
    "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke",
).trim();
const CHECKOUT_DIRECT_OPS = new Set(["preview_quote", "create_order", "submit_payment"]);
const CHECKOUT_TOKEN_STORAGE_KEY = "pivota_checkout_token";

type CreateOrderPayload = {
  merchant_id: string;
  offer_id?: string;
  quote_id?: string;
  discount_codes?: string[];
  selected_delivery_option?: Record<string, any>;
  customer_email: string;
  items: Array<{
    merchant_id: string;
    product_id: string;
    product_title: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  shipping_address: {
    name: string;
    address_line1: string;
    address_line2?: string;
    city: string;
    province?: string;
    country: string;
    postal_code: string;
    phone?: string;
  };
  customer_notes?: string;
  preferred_psp?: string;
  metadata?: {
    source?: string;
    creator_id?: string;
    creator_slug?: string;
    creator_name?: string;
  };
};

export class AgentGatewayError extends Error {
  status: number;
  body: any;

  constructor(message: string, status: number, body: any) {
    super(message);
    this.name = "AgentGatewayError";
    this.status = status;
    this.body = body;
  }
}

export function parseAgentGatewayError(err: unknown): {
  code: string | null;
  message: string;
  detail: any;
  debugId: string | null;
} {
  if (!(err instanceof AgentGatewayError)) {
    const msg =
      err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
        ? (err as any).message
        : "Unknown error";
    return { code: null, message: msg, detail: null, debugId: null };
  }

  const body = err.body;
  const detail = body?.detail ?? body;
  const code =
    typeof detail?.code === "string"
      ? detail.code
      : typeof detail?.error === "string"
        ? detail.error
        : typeof body?.code === "string"
          ? body.code
          : typeof body?.error === "string"
            ? body.error
            : null;

  const debugId =
    typeof detail?.debug_id === "string"
      ? detail.debug_id
      : typeof body?.debug_id === "string"
        ? body.debug_id
        : null;

  const message =
    (typeof detail?.message === "string" && detail.message) ||
    (typeof detail === "string" && detail) ||
    err.message;

  return { code, message, detail, debugId };
}

export function isRetryableQuoteError(code: string | null): boolean {
  return code === "QUOTE_EXPIRED" || code === "QUOTE_MISMATCH";
}

function readCheckoutTokenFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery =
      String(params.get("checkout_token") || params.get("checkoutToken") || "").trim() ||
      null;
    if (fromQuery) {
      window.sessionStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, fromQuery);
      window.localStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, fromQuery);
      return fromQuery;
    }
  } catch {
    // ignore
  }
  try {
    const fromSession = String(
      window.sessionStorage.getItem(CHECKOUT_TOKEN_STORAGE_KEY) || "",
    ).trim();
    if (fromSession) return fromSession;
  } catch {
    // ignore
  }
  try {
    const fromLocal = String(
      window.localStorage.getItem(CHECKOUT_TOKEN_STORAGE_KEY) || "",
    ).trim();
    if (fromLocal) return fromLocal;
  } catch {
    // ignore
  }
  return null;
}

function persistCheckoutToken(token: string | null | undefined): string | null {
  const normalized = String(token || "").trim();
  if (!normalized || typeof window === "undefined") return normalized || null;
  try {
    window.sessionStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, normalized);
  } catch {
    // ignore
  }
  try {
    window.localStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, normalized);
  } catch {
    // ignore
  }
  return normalized;
}

function extractIntentItemsFromInvokeBody(body: { operation: string; payload: any }): Array<Record<string, any>> {
  const operation = String(body?.operation || "").trim().toLowerCase();
  const payload = body?.payload || {};
  if (operation === "preview_quote") {
    const quote = payload?.quote || payload || {};
    const merchantId = String(quote?.merchant_id || "").trim();
    const items = Array.isArray(quote?.items) ? quote.items : [];
    return items
      .map((item) => {
        const productId = String(item?.product_id || "").trim();
        const merchant = String(item?.merchant_id || merchantId).trim();
        const variantId = String(item?.variant_id || "").trim();
        const sku = String(item?.sku || "").trim();
        const quantityRaw = Number(item?.quantity);
        const quantity =
          Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
        if (!productId || !merchant) return null;
        return {
          product_id: productId,
          merchant_id: merchant,
          ...(variantId ? { variant_id: variantId } : {}),
          ...(sku ? { sku } : {}),
          quantity,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;
  }
  if (operation === "create_order") {
    const order = payload?.order || payload || {};
    const merchantId = String(order?.merchant_id || "").trim();
    const items = Array.isArray(order?.items) ? order.items : [];
    return items
      .map((item) => {
        const productId = String(item?.product_id || "").trim();
        const merchant = String(item?.merchant_id || merchantId).trim();
        const variantId = String(item?.variant_id || "").trim();
        const sku = String(item?.sku || "").trim();
        const quantityRaw = Number(item?.quantity);
        const quantity =
          Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
        if (!productId || !merchant) return null;
        return {
          product_id: productId,
          merchant_id: merchant,
          ...(variantId ? { variant_id: variantId } : {}),
          ...(sku ? { sku } : {}),
          quantity,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;
  }
  return [];
}

async function mintCheckoutSessionToken(body: { operation: string; payload: any }): Promise<string | null> {
  const items = extractIntentItemsFromInvokeBody(body);
  if (!items.length) return null;
  try {
    const res = await fetch(CHECKOUT_SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        source: "creator-agent-ui",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return persistCheckoutToken(String(data?.checkout_token || "").trim());
  } catch {
    return null;
  }
}

async function callDirectCheckoutInvoke(body: { operation: string; payload: any }, checkoutToken: string) {
  try {
    const res = await fetch(DIRECT_CHECKOUT_INVOKE_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        "X-Checkout-Token": checkoutToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { fallbackToProxy: true };
      }
      let errorBody: any = undefined;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = undefined;
      }
      const err = new AgentGatewayError(
        `Direct checkout invoke failed with status ${res.status}`,
        res.status,
        errorBody,
      );
      return { fallbackToProxy: false, error: err };
    }

    return {
      fallbackToProxy: false,
      data: await res.json(),
    };
  } catch {
    return { fallbackToProxy: true };
  }
}

export type CheckoutOrderResponse = {
  order_id?: string;
  currency?: string;
  presentment_currency?: string;
  charge_currency?: string;
  settlement_currency?: string | null;
  total_amount_minor?: number;
  total_amount?: number;
  payment_status?: string;
  pricing?: {
    subtotal?: number;
    discount_total?: number;
    shipping_fee?: number;
    tax?: number;
    total?: number;
    [key: string]: unknown;
  } | null;
  promotion_lines?: any[];
  line_items?: any[];
  quote?: any;
  [key: string]: unknown;
};

export type QuotePreviewResponse = {
  quote_id: string;
  expires_at: string;
  engine: string;
  engine_ref?: string | null;
  currency: string;
  presentment_currency?: string;
  charge_currency?: string;
  settlement_currency?: string | null;
  pricing: {
    subtotal: number;
    discount_total: number;
    shipping_fee: number;
    tax: number;
    total: number;
  };
  promotion_lines: any[];
  line_items: any[];
  delivery_options?: any[];
  metadata?: any;
};

export type SubmitPaymentResponse = {
  payment_status?: string;
  redirect_url?: string;
  payment_action?: {
    type?: string;
    url?: string | null;
    client_secret?: string | null;
    [key: string]: unknown;
  } | null;
  payment?: {
    payment_status?: string;
    redirect_url?: string;
    client_secret?: string | null;
    payment_action?: {
      type?: string;
      url?: string | null;
      client_secret?: string | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
};

async function callAgentGateway(body: { operation: string; payload: any }) {
  const operation = String(body?.operation || "").trim().toLowerCase();
  const shouldTryDirect = DIRECT_CHECKOUT_ENABLED && CHECKOUT_DIRECT_OPS.has(operation);
  let checkoutToken = readCheckoutTokenFromBrowser();
  if (shouldTryDirect && !checkoutToken) {
    checkoutToken = await mintCheckoutSessionToken(body);
  }
  if (shouldTryDirect && checkoutToken) {
    const direct = await callDirectCheckoutInvoke(body, checkoutToken);
    if (!direct.fallbackToProxy) {
      if (direct.error) throw direct.error;
      return direct.data;
    }
  }

  const res = await fetch(CHECKOUT_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorBody: any = undefined;
    try {
      errorBody = await res.json();
    } catch {
      try {
        errorBody = await res.text();
      } catch {
        errorBody = undefined;
      }
    }

    const msg =
      typeof errorBody === "string"
        ? errorBody
        : errorBody && typeof errorBody === "object"
          ? JSON.stringify(errorBody)
          : "";

    throw new AgentGatewayError(
      `Agent gateway request failed with status ${res.status}${msg ? ` body: ${msg}` : ""}`,
      res.status,
      errorBody,
    );
  }

  return res.json();
}

export async function previewQuoteFromCart(params: {
  items: CartItem[];
  discountCodes?: string[];
  email: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province?: string;
  country: string;
  postalCode: string;
  phone?: string;
}): Promise<QuotePreviewResponse> {
  if (!params.items.length) {
    throw new Error("Cannot preview quote with empty cart");
  }

  const merchants = new Set(
    params.items.map((i) => String(i.merchantId || "").trim()).filter(Boolean),
  );
  if (merchants.size > 1) {
    throw new Error("Checkout currently supports one seller at a time. Please remove items from other sellers.");
  }

  const offers = new Set(
    params.items.map((i) => String(i.offerId || "").trim()).filter(Boolean),
  );
  if (offers.size > 1) {
    throw new Error("Checkout currently supports one offer at a time. Please remove items from other offers.");
  }

  const missingVariant = params.items.filter((item) => !item.variantId);
  if (missingVariant.length > 0) {
    const titles = missingVariant
      .slice(0, 3)
      .map((i) => i.title)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Please select a size/color for ${titles || "one or more items"} (missing variant selection). Remove the item from your cart and add it again from the product details page.`,
    );
  }

  const merchantId = params.items[0].merchantId || "demo_merchant";
  const offerId = params.items[0].offerId || undefined;
  const items = params.items.map((item) => ({
    product_id: item.productId || item.id,
    variant_id: item.variantId,
    quantity: item.quantity,
  }));

  const data = await callAgentGateway({
    operation: "preview_quote",
    payload: {
      quote: {
        merchant_id: merchantId,
        ...(offerId ? { offer_id: offerId } : {}),
        items,
        discount_codes: params.discountCodes || [],
        customer_email: params.email || undefined,
        shipping_address: {
          name: params.name,
          address_line1: params.addressLine1,
          address_line2: params.addressLine2,
          city: params.city,
          province: params.province,
          country: params.country,
          postal_code: params.postalCode,
          phone: params.phone,
        },
      },
    },
  });

  return data as QuotePreviewResponse;
}

export async function createOrderWithQuote(params: {
  quoteId: string;
  items: CartItem[];
  discountCodes?: string[];
  email: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province?: string;
  country: string;
  postalCode: string;
  phone?: string;
  notes?: string;
}): Promise<CheckoutOrderResponse> {
  if (!params.items.length) {
    throw new Error("Cannot create order with empty cart");
  }

  const merchants = new Set(
    params.items.map((i) => String(i.merchantId || "").trim()).filter(Boolean),
  );
  if (merchants.size > 1) {
    throw new Error("Checkout currently supports one seller at a time. Please remove items from other sellers.");
  }

  const offers = new Set(
    params.items.map((i) => String(i.offerId || "").trim()).filter(Boolean),
  );
  if (offers.size > 1) {
    throw new Error("Checkout currently supports one offer at a time. Please remove items from other offers.");
  }

  const missingVariant = params.items.filter((item) => !item.variantId);
  if (missingVariant.length > 0) {
    const titles = missingVariant
      .slice(0, 3)
      .map((i) => i.title)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Please select a size/color for ${titles || "one or more items"} (missing variant selection). Remove the item from your cart and add it again from the product details page.`,
    );
  }

  const merchantId = params.items[0].merchantId || "demo_merchant";
  const offerId = params.items[0].offerId || undefined;

  const creatorId = params.items[0].creatorId;
  const creatorSlug = params.items[0].creatorSlug;
  const creatorName = params.items[0].creatorName;

  const items = params.items.map((item) => ({
    merchant_id: item.merchantId || merchantId,
    product_id: item.productId || item.id,
    product_title: item.title,
    quantity: item.quantity,
    unit_price: item.price,
    subtotal: item.price * item.quantity,
    variant_id: item.variantId,
    ...(item.variantSku ? { sku: item.variantSku } : {}),
    ...(item.selectedOptions ? { selected_options: item.selectedOptions } : {}),
  }));

  const orderPayload: CreateOrderPayload = {
    merchant_id: merchantId,
    ...(offerId ? { offer_id: offerId } : {}),
    quote_id: params.quoteId,
    discount_codes: params.discountCodes || [],
    customer_email: params.email,
    items,
    shipping_address: {
      name: params.name,
      address_line1: params.addressLine1,
      address_line2: params.addressLine2,
      city: params.city,
      province: params.province,
      country: params.country,
      postal_code: params.postalCode,
      phone: params.phone,
    },
    customer_notes: params.notes,
    metadata: {
      source: "creator-agent-ui",
      ...(creatorId ? { creator_id: creatorId } : {}),
      ...(creatorSlug ? { creator_slug: creatorSlug } : {}),
      ...(creatorName ? { creator_name: creatorName } : {}),
    },
  };

  const data = await callAgentGateway({
    operation: "create_order",
    payload: {
      order: orderPayload,
    },
  });

  return data as CheckoutOrderResponse;
}

export async function createOrderFromCart(params: {
  items: CartItem[];
  discountCodes?: string[];
  email: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  province?: string;
  country: string;
  postalCode: string;
  phone?: string;
  notes?: string;
}): Promise<CheckoutOrderResponse> {
  if (!params.items.length) {
    throw new Error("Cannot create order with empty cart");
  }

  const missingVariant = params.items.filter((item) => !item.variantId);
  if (missingVariant.length > 0) {
    const titles = missingVariant
      .slice(0, 3)
      .map((i) => i.title)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Please select a size/color for ${titles || "one or more items"} (missing variant selection). Remove the item from your cart and add it again from the product details page.`,
    );
  }

  // Use first item's merchant as the order-level merchant; fall back to a demo id.
  const merchantId = params.items[0].merchantId || "demo_merchant";

  const creatorId = params.items[0].creatorId;
  const creatorSlug = params.items[0].creatorSlug;
  const creatorName = params.items[0].creatorName;

  const items = params.items.map((item) => ({
    merchant_id: item.merchantId || merchantId,
    product_id: item.productId || item.id,
    product_title: item.title,
    quantity: item.quantity,
    unit_price: item.price,
    subtotal: item.price * item.quantity,
    variant_id: item.variantId,
    ...(item.variantSku ? { sku: item.variantSku } : {}),
    ...(item.selectedOptions ? { selected_options: item.selectedOptions } : {}),
  }));

  const quote = await previewQuoteFromCart({
    items: params.items,
    discountCodes: params.discountCodes,
    email: params.email,
    name: params.name,
    addressLine1: params.addressLine1,
    addressLine2: params.addressLine2,
    city: params.city,
    province: params.province,
    country: params.country,
    postalCode: params.postalCode,
    phone: params.phone,
  });

  const data = await createOrderWithQuote({
    quoteId: quote.quote_id,
    items: params.items,
    discountCodes: params.discountCodes,
    email: params.email,
    name: params.name,
    addressLine1: params.addressLine1,
    addressLine2: params.addressLine2,
    city: params.city,
    province: params.province,
    country: params.country,
    postalCode: params.postalCode,
    phone: params.phone,
    notes: params.notes,
  });

  return { ...(data as CheckoutOrderResponse), quote } as CheckoutOrderResponse;
}

export async function submitPaymentForOrder(params: {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodHint?: string;
  returnUrl?: string;
}): Promise<SubmitPaymentResponse> {
  const data = await callAgentGateway({
    operation: "submit_payment",
    payload: {
      payment: {
        order_id: params.orderId,
        expected_amount: params.amount,
        currency: params.currency,
        payment_method_hint: params.paymentMethodHint || "card",
        ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
      },
    },
  });

  return data as SubmitPaymentResponse;
}
