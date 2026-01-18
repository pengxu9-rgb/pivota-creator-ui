const ACCOUNTS_BASE = (
  process.env.NEXT_PUBLIC_ACCOUNTS_BASE ||
  "https://web-production-fedb.up.railway.app/accounts"
).replace(/\/$/, "");

type ApiError = Error & { status?: number; detail?: any };

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

async function callAccounts(
  path: string,
  options: RequestInit & { skipJson?: boolean } = {},
) {
  const url = `${ACCOUNTS_BASE}${path}`;
  const res = await fetch(url, {
    method: options.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body,
  });

  if (options.skipJson) {
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
    const message =
      data?.detail?.error?.message ||
      data?.error?.message ||
      res.statusText;
    const err: ApiError = new Error(message);
    err.status = res.status;
    err.detail = data;
    throw err;
  }

  return data;
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
