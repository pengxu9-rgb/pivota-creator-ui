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
const CHECKOUT_CONTEXTUAL_OPS = new Set(["preview_quote", "create_order", "submit_payment"]);
const CHECKOUT_TOKEN_STORAGE_KEY = "pivota_checkout_token";
const CHECKOUT_SOURCE_STORAGE_KEY = "pivota_checkout_source";
const CANONICAL_CREATOR_CHECKOUT_SOURCE = "creator_agent";
const CREATOR_UI_SOURCE = CANONICAL_CREATOR_CHECKOUT_SOURCE;

function parseTimeoutMs(raw: string | undefined, fallbackMs: number, minMs: number, maxMs: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallbackMs;
  return Math.max(minMs, Math.min(maxMs, Math.round(n)));
}

const CHECKOUT_PROXY_TIMEOUT_MS = parseTimeoutMs(
  process.env.NEXT_PUBLIC_CHECKOUT_PROXY_TIMEOUT_MS,
  25000,
  3000,
  90000,
);
const DIRECT_CHECKOUT_TIMEOUT_MS = parseTimeoutMs(
  process.env.NEXT_PUBLIC_DIRECT_CHECKOUT_TIMEOUT_MS,
  6000,
  1500,
  30000,
);
const CHECKOUT_SESSION_TIMEOUT_MS = parseTimeoutMs(
  process.env.NEXT_PUBLIC_CHECKOUT_SESSION_TIMEOUT_MS,
  5000,
  1500,
  20000,
);

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
    unit_price?: number;
    subtotal?: number;
    variant_id?: string;
    sku?: string;
    selected_options?: Record<string, string>;
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
    ui_source?: string;
    creator_id?: string;
    creator_slug?: string;
    creator_name?: string;
  };
};

type CheckoutContext = {
  token: string | null;
  source: string | null;
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

function isAbortError(err: unknown): boolean {
  if (!err) return false;
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return err.name === "AbortError";
  }
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    String((err as any).name) === "AbortError"
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeCheckoutSource(raw: unknown): string | null {
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (!normalized) return null;
  if (
    normalized === "creator" ||
    normalized === "creator_agent" ||
    normalized === "creator_agent_ui"
  ) {
    return CANONICAL_CREATOR_CHECKOUT_SOURCE;
  }
  return normalized;
}

function readStoredString(key: string, storage: Storage): string | null {
  const value = String(storage.getItem(key) || "").trim();
  return value || null;
}

function persistCheckoutContext(context: {
  token?: string | null;
  source?: string | null;
}): CheckoutContext {
  const token = String(context.token || "").trim() || null;
  const source =
    normalizeCheckoutSource(context.source) ||
    (token ? CANONICAL_CREATOR_CHECKOUT_SOURCE : null);
  if (typeof window === "undefined") {
    return { token, source };
  }
  try {
    if (token) {
      window.sessionStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, token);
      window.localStorage.setItem(CHECKOUT_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(CHECKOUT_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(CHECKOUT_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  try {
    if (source) {
      window.sessionStorage.setItem(CHECKOUT_SOURCE_STORAGE_KEY, source);
      window.localStorage.setItem(CHECKOUT_SOURCE_STORAGE_KEY, source);
    } else {
      window.sessionStorage.removeItem(CHECKOUT_SOURCE_STORAGE_KEY);
      window.localStorage.removeItem(CHECKOUT_SOURCE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return { token, source };
}

function readCheckoutSourceFromParams(params: URLSearchParams): string | null {
  const explicitSource =
    params.get("source") || params.get("src") || params.get("checkout_source");
  if (explicitSource) {
    return normalizeCheckoutSource(explicitSource);
  }
  const entrySource = normalizeCheckoutSource(params.get("entry"));
  return entrySource === CANONICAL_CREATOR_CHECKOUT_SOURCE ? entrySource : null;
}

function readCheckoutContextFromBrowser(): CheckoutContext {
  if (typeof window === "undefined") return { token: null, source: null };
  try {
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery =
      String(params.get("checkout_token") || params.get("checkoutToken") || "").trim() ||
      null;
    const sourceFromQuery = readCheckoutSourceFromParams(params);
    if (fromQuery) {
      return persistCheckoutContext({
        token: fromQuery,
        source: sourceFromQuery || CANONICAL_CREATOR_CHECKOUT_SOURCE,
      });
    }
    if (sourceFromQuery) {
      const existingToken =
        readStoredString(CHECKOUT_TOKEN_STORAGE_KEY, window.sessionStorage) ||
        readStoredString(CHECKOUT_TOKEN_STORAGE_KEY, window.localStorage);
      return persistCheckoutContext({
        token: existingToken,
        source: sourceFromQuery,
      });
    }
  } catch {
    // ignore
  }
  try {
    const fromSessionToken = readStoredString(
      CHECKOUT_TOKEN_STORAGE_KEY,
      window.sessionStorage,
    );
    const fromSessionSource = normalizeCheckoutSource(
      readStoredString(CHECKOUT_SOURCE_STORAGE_KEY, window.sessionStorage),
    );
    if (fromSessionToken || fromSessionSource) {
      return persistCheckoutContext({
        token: fromSessionToken,
        source: fromSessionSource || CANONICAL_CREATOR_CHECKOUT_SOURCE,
      });
    }
  } catch {
    // ignore
  }
  try {
    const fromLocalToken = readStoredString(CHECKOUT_TOKEN_STORAGE_KEY, window.localStorage);
    const fromLocalSource = normalizeCheckoutSource(
      readStoredString(CHECKOUT_SOURCE_STORAGE_KEY, window.localStorage),
    );
    if (fromLocalToken || fromLocalSource) {
      return persistCheckoutContext({
        token: fromLocalToken,
        source: fromLocalSource || CANONICAL_CREATOR_CHECKOUT_SOURCE,
      });
    }
  } catch {
    // ignore
  }
  return { token: null, source: null };
}

function extractIntentItemsFromInvokeBody(body: { operation: string; payload: any }): Array<Record<string, any>> {
  const operation = String(body?.operation || "").trim().toLowerCase();
  const payload = body?.payload || {};
  if (operation === "preview_quote") {
    const quote = payload?.quote || payload || {};
    const merchantId = String(quote?.merchant_id || "").trim();
    const items = Array.isArray(quote?.items) ? quote.items : [];
    return items
      .map((item: any) => {
        const productId = String(item?.product_id || "").trim();
        const merchant = String(item?.merchant_id || merchantId).trim();
        const variantId = String(item?.variant_id || "").trim();
        const sku = String(item?.sku || "").trim();
        const quantityRaw = Number(item?.quantity);
        const quantity =
          Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
        if (!productId || !merchant) return null;
        const normalizedItemId = variantId || sku || productId;
        return {
          product_id: productId,
          productId,
          merchant_id: merchant,
          merchantId: merchant,
          ...(variantId ? { variant_id: variantId } : {}),
          ...(variantId ? { variantId } : {}),
          ...(normalizedItemId ? { id: normalizedItemId } : {}),
          ...(sku ? { sku } : {}),
          ...(sku ? { skuId: sku } : {}),
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
      .map((item: any) => {
        const productId = String(item?.product_id || "").trim();
        const merchant = String(item?.merchant_id || merchantId).trim();
        const variantId = String(item?.variant_id || "").trim();
        const sku = String(item?.sku || "").trim();
        const quantityRaw = Number(item?.quantity);
        const quantity =
          Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
        if (!productId || !merchant) return null;
        const normalizedItemId = variantId || sku || productId;
        return {
          product_id: productId,
          productId,
          merchant_id: merchant,
          merchantId: merchant,
          ...(variantId ? { variant_id: variantId } : {}),
          ...(variantId ? { variantId } : {}),
          ...(normalizedItemId ? { id: normalizedItemId } : {}),
          ...(sku ? { sku } : {}),
          ...(sku ? { skuId: sku } : {}),
          quantity,
        };
      })
      .filter(Boolean) as Array<Record<string, any>>;
  }
  return [];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readQuotedUnitPrice(lineItem: any): number | null {
  const value =
    lineItem?.unit_price_effective ??
    lineItem?.unit_price_original ??
    lineItem?.unit_price ??
    lineItem?.price ??
    null;
  return isFiniteNumber(value) ? value : null;
}

function findQuoteLineItem(quoteLineItems: any[] | undefined, item: CartItem): any | null {
  if (!Array.isArray(quoteLineItems) || quoteLineItems.length === 0) return null;
  const variantId = String(item.variantId || "").trim();
  const productId = String(item.productId || item.id || "").trim();
  return (
    quoteLineItems.find((line) => String(line?.variant_id || "").trim() === variantId) ||
    quoteLineItems.find((line) => String(line?.product_id || "").trim() === productId) ||
    null
  );
}

function buildCreateOrderLineItems(params: {
  items: CartItem[];
  merchantId: string;
  quoteLineItems?: any[];
}) {
  return params.items.map((item) => {
    const quotedLineItem = findQuoteLineItem(params.quoteLineItems, item);
    const quotedUnitPrice = readQuotedUnitPrice(quotedLineItem);
    const unitPrice = quotedUnitPrice ?? (isFiniteNumber(item.price) ? item.price : null);
    return {
      merchant_id: item.merchantId || params.merchantId,
      product_id: item.productId || item.id,
      product_title: item.title,
      quantity: item.quantity,
      ...(unitPrice != null
        ? {
            unit_price: unitPrice,
            subtotal: unitPrice * item.quantity,
          }
        : {}),
      variant_id: item.variantId,
      ...(item.variantSku ? { sku: item.variantSku } : {}),
      ...(item.selectedOptions ? { selected_options: item.selectedOptions } : {}),
    };
  });
}

async function mintCheckoutSessionToken(body: {
  operation: string;
  payload: any;
  metadata?: Record<string, any>;
}): Promise<string | null> {
  const items = extractIntentItemsFromInvokeBody(body);
  if (!items.length) return null;
  try {
    const res = await fetchWithTimeout(CHECKOUT_SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items,
        source: CANONICAL_CREATOR_CHECKOUT_SOURCE,
      }),
    }, CHECKOUT_SESSION_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return persistCheckoutContext({
      token: String(data?.checkout_token || "").trim(),
      source: CANONICAL_CREATOR_CHECKOUT_SOURCE,
    }).token;
  } catch {
    return null;
  }
}

async function callDirectCheckoutInvoke(
  body: { operation: string; payload: any; metadata?: Record<string, any> },
  checkoutToken: string,
) {
  try {
    const res = await fetchWithTimeout(DIRECT_CHECKOUT_INVOKE_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        "X-Checkout-Token": checkoutToken,
      },
      body: JSON.stringify(body),
    }, DIRECT_CHECKOUT_TIMEOUT_MS);

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
  } catch (err) {
    if (isAbortError(err)) {
      return { fallbackToProxy: true };
    }
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
  status?: string;
  confirmation_owner?: "backend" | "client";
  requires_client_confirmation?: boolean;
  payment_status_raw?: string | null;
  redirect_url?: string;
  payment_action?: {
    type?: string;
    url?: string | null;
    client_secret?: string | null;
    [key: string]: unknown;
  } | null;
  payment?: {
    payment_status?: string;
    status?: string;
    confirmation_owner?: "backend" | "client";
    requires_client_confirmation?: boolean;
    payment_status_raw?: string | null;
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

export type SubmitPaymentContract = {
  paymentStatus: string;
  confirmationOwner: "backend" | "client";
  requiresClientConfirmation: boolean;
  paymentStatusRaw: string | null;
};

const BACKEND_OWNED_PAYMENT_STATUSES = new Set([
  "processing",
  "paid",
  "completed",
  "succeeded",
]);
const CLIENT_OWNED_PAYMENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function normalizePaymentStatusToken(rawStatus: unknown): string {
  const token = readString(rawStatus);
  if (!token) return "unknown";
  return token.toLowerCase();
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function isBackendSettledPaymentStatus(status: unknown): boolean {
  const normalized = normalizePaymentStatusToken(status);
  return BACKEND_OWNED_PAYMENT_STATUSES.has(normalized);
}

export function resolveSubmitPaymentContract(paymentRes: SubmitPaymentResponse): SubmitPaymentContract {
  const top = paymentRes as Record<string, unknown>;
  const nested =
    paymentRes.payment && typeof paymentRes.payment === "object"
      ? (paymentRes.payment as Record<string, unknown>)
      : null;
  const action =
    paymentRes.payment_action ||
    (nested?.payment_action as SubmitPaymentResponse["payment_action"]) ||
    null;
  const actionType = normalizePaymentStatusToken(action?.type || null);
  const statusRaw =
    readString(top.payment_status) ||
    readString(top.status) ||
    readString(nested?.payment_status) ||
    readString(nested?.status);
  const paymentStatus = normalizePaymentStatusToken(statusRaw);
  const explicitRequires =
    readBoolean(top.requires_client_confirmation) ??
    readBoolean(nested?.requires_client_confirmation);
  const explicitOwnerRaw =
    readString(top.confirmation_owner) || readString(nested?.confirmation_owner);
  const explicitOwner =
    explicitOwnerRaw === "client"
      ? "client"
      : explicitOwnerRaw === "backend"
        ? "backend"
        : null;
  const paymentStatusRaw = paymentStatus === "unknown" ? statusRaw : null;

  if (explicitRequires != null) {
    const owner = explicitOwner || (explicitRequires ? "client" : "backend");
    return {
      paymentStatus,
      confirmationOwner: owner,
      requiresClientConfirmation: explicitRequires,
      paymentStatusRaw,
    };
  }
  if (explicitOwner) {
    return {
      paymentStatus,
      confirmationOwner: explicitOwner,
      requiresClientConfirmation: explicitOwner === "client",
      paymentStatusRaw,
    };
  }

  // Compatibility: hosted actions still need client interaction even when
  // legacy backends miss explicit owner flags.
  if (actionType === "adyen_session" || actionType === "redirect_url") {
    return {
      paymentStatus,
      confirmationOwner: "client",
      requiresClientConfirmation: true,
      paymentStatusRaw,
    };
  }

  if (CLIENT_OWNED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      paymentStatus,
      confirmationOwner: "client",
      requiresClientConfirmation: true,
      paymentStatusRaw,
    };
  }
  if (BACKEND_OWNED_PAYMENT_STATUSES.has(paymentStatus)) {
    return {
      paymentStatus,
      confirmationOwner: "backend",
      requiresClientConfirmation: false,
      paymentStatusRaw,
    };
  }

  // Legacy fallback: Stripe client secret without explicit flags still needs
  // client-side confirmation for backwards compatibility.
  if (actionType === "stripe_client_secret") {
    return {
      paymentStatus,
      confirmationOwner: "client",
      requiresClientConfirmation: true,
      paymentStatusRaw,
    };
  }

  return {
    paymentStatus,
    confirmationOwner: "backend",
    requiresClientConfirmation: false,
    paymentStatusRaw,
  };
}

async function callAgentGateway(body: {
  operation: string;
  payload: any;
  metadata?: Record<string, any>;
}) {
  const operation = String(body?.operation || "").trim().toLowerCase();
  const isCheckoutOperation = CHECKOUT_DIRECT_OPS.has(operation);
  const shouldTryDirect = DIRECT_CHECKOUT_ENABLED && isCheckoutOperation;
  const checkoutContext = readCheckoutContextFromBrowser();
  const checkoutSource =
    normalizeCheckoutSource(checkoutContext.source) || CANONICAL_CREATOR_CHECKOUT_SOURCE;
  const requestBody = CHECKOUT_CONTEXTUAL_OPS.has(operation)
    ? {
        ...body,
        metadata: {
          ...(body?.metadata && typeof body.metadata === "object" ? body.metadata : {}),
          source: checkoutSource,
          ui_source: CREATOR_UI_SOURCE,
        },
      }
    : body;
  let checkoutToken = checkoutContext.token;
  if (isCheckoutOperation && !checkoutToken) {
    checkoutToken = await mintCheckoutSessionToken(requestBody);
  }
  if (isCheckoutOperation && checkoutSource === CANONICAL_CREATOR_CHECKOUT_SOURCE && !checkoutToken) {
    throw new AgentGatewayError(
      "Hosted checkout token is required before running checkout operations",
      502,
      {
        error: "CHECKOUT_TOKEN_REQUIRED",
        message: "Unable to mint hosted checkout token",
      },
    );
  }
  if (shouldTryDirect && checkoutToken) {
    const direct = await callDirectCheckoutInvoke(requestBody, checkoutToken);
    if (!direct.fallbackToProxy) {
      if (direct.error) throw direct.error;
      return direct.data;
    }
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(
      CHECKOUT_PROXY_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(checkoutToken ? { "X-Checkout-Token": checkoutToken } : {}),
        },
        body: JSON.stringify(requestBody),
      },
      CHECKOUT_PROXY_TIMEOUT_MS,
    );
  } catch (err) {
    if (isAbortError(err)) {
      throw new AgentGatewayError(
        `Checkout request timed out after ${CHECKOUT_PROXY_TIMEOUT_MS}ms`,
        504,
        {
          error: "TIMEOUT",
          message: "Checkout request timed out",
          timeout_ms: CHECKOUT_PROXY_TIMEOUT_MS,
        },
      );
    }
    throw err;
  }

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
  quoteLineItems?: any[];
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

  const items = buildCreateOrderLineItems({
    items: params.items,
    merchantId,
    quoteLineItems: params.quoteLineItems,
  });

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
      source: CANONICAL_CREATOR_CHECKOUT_SOURCE,
      ui_source: CREATOR_UI_SOURCE,
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
    quoteLineItems: quote.line_items,
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
        source: CANONICAL_CREATOR_CHECKOUT_SOURCE,
        payment_method_hint: params.paymentMethodHint || "card",
        ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
      },
    },
  });

  return data as SubmitPaymentResponse;
}
