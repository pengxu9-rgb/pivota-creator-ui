import type { CartItem } from "@/components/cart/CartProvider";

const AGENT_URL =
  process.env.PIVOTA_AGENT_URL ||
  "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke";

const BEARER_API_KEY =
  process.env.PIVOTA_AGENT_API_KEY || process.env.PIVOTA_API_KEY || "";

const X_AGENT_API_KEY =
  process.env.NEXT_PUBLIC_AGENT_API_KEY ||
  process.env.AGENT_API_KEY ||
  process.env.SHOP_GATEWAY_AGENT_API_KEY ||
  "";

type CreateOrderPayload = {
  merchant_id: string;
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
    country: string;
    postal_code: string;
    phone?: string;
  };
  customer_notes?: string;
  preferred_psp?: string;
};

export type CheckoutOrderResponse = {
  order_id?: string;
  currency?: string;
  total_amount_minor?: number;
  payment_status?: string;
  [key: string]: unknown;
};

async function callAgentGateway(body: { operation: string; payload: any }) {
  const res = await fetch(AGENT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(BEARER_API_KEY ? { Authorization: `Bearer ${BEARER_API_KEY}` } : {}),
      ...(X_AGENT_API_KEY ? { "X-Agent-API-Key": X_AGENT_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errorBody: string | undefined;
    try {
      errorBody = await res.text();
    } catch {
      errorBody = undefined;
    }
    throw new Error(
      `Agent gateway request failed with status ${res.status}${
        errorBody ? ` body: ${errorBody}` : ""
      }`,
    );
  }

  return res.json();
}

export async function createOrderFromCart(params: {
  items: CartItem[];
  email: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  country: string;
  postalCode: string;
  phone?: string;
  notes?: string;
}): Promise<CheckoutOrderResponse> {
  if (!params.items.length) {
    throw new Error("Cannot create order with empty cart");
  }

  // Use first item's merchant as the order-level merchant; fall back to a demo id.
  const merchantId = params.items[0].merchantId || "demo_merchant";

  const items = params.items.map((item) => ({
    merchant_id: item.merchantId || merchantId,
    product_id: item.productId || item.id,
    product_title: item.title,
    quantity: item.quantity,
    unit_price: item.price,
    subtotal: item.price * item.quantity,
  }));

  const orderPayload: CreateOrderPayload = {
    merchant_id: merchantId,
    customer_email: params.email,
    items,
    shipping_address: {
      name: params.name,
      address_line1: params.addressLine1,
      address_line2: params.addressLine2,
      city: params.city,
      country: params.country,
      postal_code: params.postalCode,
      phone: params.phone,
    },
    customer_notes: params.notes,
  };

  const data = await callAgentGateway({
    operation: "create_order",
    payload: {
      order: orderPayload,
    },
  });

  return data as CheckoutOrderResponse;
}

