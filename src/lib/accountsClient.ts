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
  shipping_city?: string | null;
  shipping_country?: string | null;
  items_summary?: string;
  permissions?: OrdersPermissions;
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
  return data as { items: OrdersListItem[]; next_cursor?: string | null };
}
