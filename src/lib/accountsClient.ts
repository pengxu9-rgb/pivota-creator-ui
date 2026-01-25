// Accounts API is proxied through same-origin routes so auth cookies remain first-party.
// This avoids third-party cookie issues (e.g. in-app browsers / iOS Safari) and reduces CORS risk.
const ACCOUNTS_API_BASE = "/api/accounts";
const ACCOUNTS_ROOT_API_BASE = "/api/accounts-root";

type ApiError = Error & { status?: number; detail?: any; code?: string };

export type UgcCapabilityReason =
  | "NOT_AUTHENTICATED"
  | "NOT_PURCHASER"
  | "ALREADY_REVIEWED"
  | "RATE_LIMITED";

export type UgcCapabilities = {
  canUploadMedia: boolean;
  canWriteReview: boolean;
  canAskQuestion: boolean;
  reasons?: {
    upload?: UgcCapabilityReason;
    review?: UgcCapabilityReason;
    question?: UgcCapabilityReason;
  };
};

export interface AccountsUser {
  id: string;
  email: string | null;
  phone: string | null;
  primary_role: string;
  is_guest: boolean;
}

type OrdersPermissions = {
  can_pay: boolean;
  can_cancel: boolean;
  can_reorder: boolean;
};

export type OrdersListItem = {
  order_id: string;
  currency: string;
  total_amount_minor: number;
  status: string;
  payment_status: string;
  fulfillment_status: string;
  delivery_status: string;
  created_at: string;
  // Optional lightweight metadata for Creator-style order cards
  first_item_image_url?: string | null;
  // Optional SKU and option snapshot for the first item,
  // if the backend provides them.
  first_item_variant_sku?: string | null;
  first_item_selected_options?: Record<string, string> | null;
  shipping_city?: string | null;
  shipping_country?: string | null;
  items_summary?: string;
  permissions?: OrdersPermissions;
  creator_id?: string | null;
  creator_name?: string | null;
  creator_slug?: string | null;
};

async function callAccountsBase(
  base: string,
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  const url = `${base}${path}`;
  const { skipJson, headers, method, body, ...rest } = options as any;
  const res = await fetch(url, {
    ...rest,
    method: method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body,
  });

  if (skipJson) {
    return res;
  }

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const code =
      (typeof data?.detail === "string" ? data.detail : undefined) ||
      data?.detail?.error?.code ||
      data?.error?.code ||
      undefined;
    const message =
      (typeof data?.detail === "string" ? data.detail : undefined) ||
      data?.detail?.error?.message ||
      data?.error?.message ||
      res.statusText;
    const err: ApiError = new Error(message);
    err.status = res.status;
    err.detail = data;
    err.code = code;
    throw err;
  }

  return data;
}

async function callAccounts(
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  return callAccountsBase(ACCOUNTS_API_BASE, path, options);
}

async function callAccountsRoot(
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  return callAccountsBase(ACCOUNTS_ROOT_API_BASE, path, options);
}

export async function getPdpV2Personalization(args: {
  productId: string;
  productGroupId?: string | null;
}): Promise<UgcCapabilities | null> {
  const productId = String(args.productId || "").trim();
  if (!productId) return null;

  const params = new URLSearchParams({ productId });
  const groupId = String(args.productGroupId || "").trim();
  if (groupId) params.set("productGroupId", groupId);

  const res = (await callAccounts(`/pdp/v2/personalization?${params.toString()}`, {
    cache: "no-store",
  })) as any;
  const caps = res?.ugcCapabilities;
  if (!caps || typeof caps !== "object") return null;
  return {
    canUploadMedia: Boolean(caps.canUploadMedia),
    canWriteReview: Boolean(caps.canWriteReview),
    canAskQuestion: Boolean(caps.canAskQuestion),
    reasons: caps.reasons || {},
  } as UgcCapabilities;
}

export async function getReviewEligibility(args: {
  productId: string;
  productGroupId?: string | null;
}): Promise<{ eligible: boolean; reason?: string } | null> {
  const productId = String(args.productId || "").trim();
  if (!productId) return null;

  const params = new URLSearchParams({ productId });
  const groupId = String(args.productGroupId || "").trim();
  if (groupId) params.set("productGroupId", groupId);

  try {
    return (await callAccounts(`/reviews/eligibility?${params.toString()}`, {
      cache: "no-store",
    })) as any;
  } catch (err: any) {
    if (err?.status === 401 || err?.code === "NOT_AUTHENTICATED" || err?.code === "UNAUTHENTICATED") {
      return null;
    }
    throw err;
  }
}

export async function createReviewFromUser(args: {
  productId: string;
  productGroupId?: string | null;
  subject: {
    merchant_id: string;
    platform: string;
    platform_product_id: string;
    variant_id?: string | null;
  };
  rating: number;
  title?: string | null;
  body?: string | null;
}) {
  const productId = String(args.productId || "").trim();
  if (!productId) return null;

  return callAccountsRoot("/buyer/reviews/v1/reviews/from_user", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({
      product_id: productId,
      ...(args.productGroupId ? { product_group_id: String(args.productGroupId) } : {}),
      subject: {
        merchant_id: String(args.subject.merchant_id || ""),
        platform: String(args.subject.platform || ""),
        platform_product_id: String(args.subject.platform_product_id || ""),
        variant_id: args.subject.variant_id == null ? null : String(args.subject.variant_id),
      },
      rating: Number(args.rating),
      title: args.title == null ? null : String(args.title),
      body: args.body == null ? null : String(args.body),
    }),
  });
}

export async function postQuestion(args: {
  productId: string;
  productGroupId?: string | null;
  question: string;
}) {
  const productId = String(args.productId || "").trim();
  if (!productId) return null;

  return callAccountsRoot("/questions", {
    method: "POST",
    cache: "no-store",
    body: JSON.stringify({
      productId,
      ...(args.productGroupId ? { productGroupId: String(args.productGroupId) } : {}),
      question: String(args.question || ""),
    }),
  });
}

export async function accountsLogin(email: string) {
  return callAccounts("/auth/login", {
    method: "POST",
    body: JSON.stringify({ channel: "email", email }),
  });
}

export async function accountsVerify(email: string, otp: string) {
  const data = await callAccounts("/auth/verify", {
    method: "POST",
    body: JSON.stringify({ channel: "email", email, otp }),
  });

  // Some deployments wrap the user inside { user, memberships, ... }.
  return (data as any).user || data;
}

export async function accountsMe(): Promise<AccountsUser | null> {
  try {
    const raw = await callAccounts("/auth/me");
    const user = (raw as any).user || raw;
    if (!user) return null;
    return user as AccountsUser;
  } catch (err) {
    const e = err as ApiError;
    if (e.status === 401) return null;
    throw err;
  }
}

export async function listMyOrders(
  cursor?: string | null,
  limit = 20,
): Promise<{ items: OrdersListItem[]; next_cursor?: string | null }> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);

  const data = await callAccounts(`/orders/list?${params.toString()}`);

  const anyData = data as any;
  const items: OrdersListItem[] =
    anyData.items || anyData.orders || [];
  const nextCursor: string | null =
    anyData.next_cursor ?? anyData.cursor ?? null;

  return { items, next_cursor: nextCursor };
}

export async function cancelOrder(orderId: string, reason?: string): Promise<void> {
  await callAccounts(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

export type OrderDetailResponse = {
  order?: OrdersListItem & {
    items?: Array<Record<string, unknown>>;
    shipping_address?: ShippingAddress;
    subtotal_amount_minor?: number | string | null;
    discount_amount_minor?: number | string | null;
    shipping_amount_minor?: number | string | null;
    tax_amount_minor?: number | string | null;
    total_amount_minor?: number | string | null;
    subtotal_amount?: number | string | null;
    discount_amount?: number | string | null;
    shipping_amount?: number | string | null;
    tax_amount?: number | string | null;
    total_amount?: number | string | null;
    tracking?: Record<string, unknown> | null;
  };
  [k: string]: unknown;
};

export async function getOrderDetail(orderId: string): Promise<OrderDetailResponse> {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}`);
}

export async function getOrderTracking(orderId: string): Promise<Record<string, unknown>> {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}/tracking`);
}

export type RefundRequestItem = {
  item_id?: string;
  title?: string;
  quantity?: number;
  amount?: number;
};

export type RefundRequestPayload = {
  amount?: number;
  currency?: string;
  reason?: string;
  items?: RefundRequestItem[];
};

export async function requestRefund(
  orderId: string,
  payload: RefundRequestPayload,
): Promise<Record<string, unknown>> {
  return callAccounts(`/orders/${encodeURIComponent(orderId)}/refund`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type ShippingAddress = {
  name?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  phone?: string;
};

export async function getLatestPaidOrderShippingAddress(): Promise<ShippingAddress | null> {
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("payment_status", "paid");

  const data = await callAccounts(`/orders/list?${params.toString()}`);
  const anyData = data as any;
  const orders: OrdersListItem[] = anyData.orders || anyData.items || [];
  const latest = orders[0];

  if (!latest?.order_id) return null;

  // Fetch full order detail so we can read the complete shipping_address.
  const detail = await callAccounts(`/orders/${encodeURIComponent(latest.order_id)}`);
  const addr = (detail as any)?.order?.shipping_address;
  if (!addr || typeof addr !== "object") return null;

  return {
    name: addr.name ?? "",
    address_line1: addr.address_line1 ?? "",
    address_line2: addr.address_line2 ?? "",
    city: addr.city ?? "",
    province: addr.province ?? addr.state ?? "",
    country: addr.country ?? "",
    postal_code: addr.postal_code ?? "",
    phone: addr.phone ?? "",
  };
}
