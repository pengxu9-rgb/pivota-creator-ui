'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ChevronLeft,
  LifeBuoy,
  Package,
  ReceiptText,
  RotateCcw,
  Truck,
  XCircle,
} from "lucide-react";
import {
  accountsMe,
  cancelOrder,
  getOrderDetail,
  getOrderTracking,
  requestRefund,
  type OrdersListItem,
  type ShippingAddress,
} from "@/lib/accountsClient";
import { getCreatorBySlug } from "@/config/creatorAgents";

type NormalizedItem = {
  id?: string | null;
  title: string;
  quantity: number;
  unitPrice: number | null;
  subtotal: number | null;
  imageUrl: string | null;
  optionsText?: string | null;
};

type TrackingEvent = {
  status?: string | null;
  message?: string | null;
  location?: string | null;
  occurred_at?: string | null;
  timestamp?: string | null;
};

type TrackingInfo = {
  status?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  events?: TrackingEvent[] | null;
  timeline?: Array<{ status?: string | null; timestamp?: string | null; completed?: boolean | null }> | null;
};

type NormalizedOrder = {
  id: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  deliveryStatus: string;
  currency: string;
  items: NormalizedItem[];
  shippingAddress?: ShippingAddress | null;
  paymentMethod?: string | null;
  refundStatus?: string | null;
  permissions?: OrdersListItem["permissions"];
  totals: {
    subtotal: number;
    discounts: number;
    shipping: number;
    taxes: number;
    total: number;
    currency: string;
  };
  tracking?: TrackingInfo | null;
};

const SUPPORT_EMAIL = "support@pivota.cc";

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    if (!cleaned) return 0;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickFirstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    const parsed = parseNumber(value);
    if (Number.isFinite(parsed) && parsed !== 0) return parsed;
  }
  return null;
}

function normalizeImageUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("https://")) return v;
  if (v.startsWith("http://")) return `https://${v.slice("http://".length)}`;
  return null;
}

function coerceArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj.line_items)) return obj.line_items;
  }
  return null;
}

function normalizePaymentLabel(raw: string): string {
  const normalized = raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (normalized === "apple pay") return "Apple Pay";
  if (normalized === "google pay") return "Google Pay";
  if (normalized === "paypal") return "PayPal";
  if (normalized === "card") return "Card";
  if (normalized === "cash") return "Cash";
  if (normalized === "klarna") return "Klarna";
  if (normalized === "afterpay") return "Afterpay";
  return normalized.replace(/\b\w/g, (m) => m.toUpperCase());
}

function readMajorAmount(
  raw: Record<string, unknown>,
  minorKeys: string[],
  majorKeys: string[],
): number | null {
  for (const key of minorKeys) {
    if (raw[key] != null) {
      return parseNumber(raw[key]) / 100;
    }
  }
  for (const key of majorKeys) {
    if (raw[key] != null) {
      return parseNumber(raw[key]);
    }
  }
  return null;
}

function normalizeItems(rawOrder: Record<string, unknown>): NormalizedItem[] {
  const itemsSource =
    coerceArray(rawOrder.items) ||
    coerceArray(rawOrder.line_items) ||
    coerceArray(rawOrder.order_items) ||
    coerceArray(rawOrder.products) ||
    coerceArray(rawOrder.items_json) ||
    coerceArray(rawOrder.itemsJson) ||
    coerceArray(rawOrder.items_detail) ||
    coerceArray(rawOrder.itemsDetail) ||
    coerceArray(rawOrder.order_items_json) ||
    coerceArray(rawOrder.orderItems) ||
    coerceArray(rawOrder.line_items_json) ||
    coerceArray(rawOrder.lineItems) ||
    [];

  const normalized = itemsSource.map((raw) => {
    const item = raw as Record<string, unknown>;
    const product = (item.product || item.merchandise || item.item || item.variant || item.product_detail) as
      | Record<string, unknown>
      | undefined;
    const id = pickFirstString(item, [
      "line_item_id",
      "lineItemId",
      "item_id",
      "itemId",
      "id",
      "variant_id",
      "variantId",
      "sku_id",
      "skuId",
      "sku",
    ]);
    const title =
      pickFirstString(item, ["product_title", "title", "name", "product_name"]) ||
      (product ? pickFirstString(product, ["product_title", "title", "name"]) : null) ||
      "Item";
    const quantity = Math.max(1, Math.round(parseNumber(item.quantity ?? item.qty ?? 1)));

    const unitPrice =
      readMajorAmount(
        item,
        ["unit_price_minor", "unit_price_cents", "price_minor", "amount_minor", "unit_amount_minor"],
        ["unit_price", "price", "amount", "unit_amount"],
      ) ??
      null;
    const subtotal =
      readMajorAmount(
        item,
        ["subtotal_minor", "subtotal_cents", "line_total_minor", "total_amount_minor"],
        ["subtotal", "line_total", "total", "total_amount"],
      ) ??
      (unitPrice != null ? unitPrice * quantity : null);

    const imageRaw =
      pickFirstString(item, [
        "product_image_url",
        "image_url",
        "image",
        "thumbnail_url",
        "thumb_url",
        "image_src",
      ]) ||
      (product
        ? pickFirstString(product, ["image_url", "image", "thumbnail_url", "image_src"])
        : null) ||
      (item.image && typeof item.image === "object"
        ? pickFirstString(item.image as Record<string, unknown>, ["src", "url"])
        : null);
    const imageUrl = imageRaw ? normalizeImageUrl(imageRaw) : null;

    const optionsSource =
      (item.selected_options && typeof item.selected_options === "object" ? item.selected_options : null) ||
      (item.options && typeof item.options === "object" ? item.options : null) ||
      (item.variant_options && typeof item.variant_options === "object" ? item.variant_options : null);
    const options = optionsSource
      ? Object.entries(optionsSource as Record<string, unknown>)
          .map(([key, value]) => `${key}: ${String(value)}`)
          .join(" · ")
      : null;

    return {
      id,
      title,
      quantity,
      unitPrice,
      subtotal,
      imageUrl,
      optionsText: options,
    };
  });

  if (normalized.length === 0) {
    const summary = pickFirstString(rawOrder, ["items_summary", "itemsSummary", "summary"]);
    if (summary) {
      return [
        {
          title: summary,
          quantity: 1,
          unitPrice: null,
          subtotal: null,
          imageUrl: null,
        },
      ];
    }
  }

  return normalized;
}

function extractTracking(raw: Record<string, unknown>): TrackingInfo | null {
  const candidates: Array<Record<string, unknown> | null | undefined> = [
    raw.tracking as Record<string, unknown>,
    raw.tracking_info as Record<string, unknown>,
    raw.fulfillment as Record<string, unknown>,
    raw.shipping as Record<string, unknown>,
  ];
  const candidate = candidates.find((c) => c && typeof c === "object");
  if (!candidate) return null;

  const carrier = pickFirstString(candidate, ["carrier", "shipping_carrier"]);
  const trackingNumber = pickFirstString(candidate, ["tracking_number", "trackingNo", "tracking_number_code"]);
  const trackingUrl = pickFirstString(candidate, ["tracking_url", "trackingUrl", "url"]);
  const status =
    pickFirstString(candidate, ["status", "fulfillment_status", "delivery_status"]) ||
    null;
  const events =
    (Array.isArray(candidate.events) && candidate.events) ||
    (Array.isArray(candidate.tracking_events) && candidate.tracking_events) ||
    null;
  const timeline =
    (Array.isArray(candidate.timeline) && candidate.timeline) ||
    (Array.isArray(candidate.progress) && candidate.progress) ||
    null;

  return {
    carrier,
    trackingNumber,
    trackingUrl,
    status,
    events: events as TrackingEvent[] | null,
    timeline: timeline as TrackingInfo["timeline"] | null,
  };
}

function formatPaymentMethod(rawOrder: Record<string, unknown>): string | null {
  const method = pickFirstString(rawOrder, [
    "payment_method",
    "payment_method_type",
    "payment_method_label",
    "payment_method_name",
    "payment_type",
    "payment_method_display",
  ]);
  const brand = pickFirstString(rawOrder, [
    "payment_method_brand",
    "card_brand",
    "brand",
    "card_brand_name",
  ]);
  const last4 = pickFirstString(rawOrder, [
    "card_last4",
    "last4",
    "card_last_4",
  ]);
  const wallet = pickFirstString(rawOrder, ["wallet_type", "wallet"]);
  const provider = pickFirstString(rawOrder, [
    "payment_provider",
    "payment_gateway",
    "gateway",
  ]);
  const details =
    (rawOrder.payment_method_details as Record<string, unknown>) ||
    (rawOrder.paymentMethodDetails as Record<string, unknown>) ||
    (rawOrder.payment_details as Record<string, unknown>) ||
    (rawOrder.paymentDetails as Record<string, unknown>) ||
    null;

  const detailMethod = details ? pickFirstString(details, ["type", "method", "payment_method"]) : null;
  const detailWallet = details
    ? pickFirstString(details, ["wallet", "wallet_type", "walletType"])
    : null;
  const detailCard =
    details && typeof details.card === "object"
      ? (details.card as Record<string, unknown>)
      : null;
  const detailBrand = detailCard ? pickFirstString(detailCard, ["brand", "network"]) : null;
  const detailLast4 = detailCard ? pickFirstString(detailCard, ["last4", "last_4"]) : null;

  const parts = [method, detailMethod, brand, detailBrand, wallet, detailWallet, provider]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .map((part) => normalizePaymentLabel(String(part))) as string[];

  if (last4 || detailLast4) {
    parts.push(`•••• ${last4 || detailLast4}`);
  }
  if (parts.length === 0) return null;

  const unique = Array.from(
    new Set(parts.map((p) => p.trim())),
  );
  return unique.join(" · ");
}

function normalizeShippingAddress(
  rawOrder: Record<string, unknown>,
  rawShipping?: Record<string, unknown> | null,
): ShippingAddress | null {
  const source = rawShipping && typeof rawShipping === "object" ? rawShipping : null;
  const name =
    (source ? pickFirstString(source, ["name", "full_name", "recipient_name"]) : null) ||
    pickFirstString(rawOrder, ["shipping_name", "recipient_name"]) ||
    "";
  const addressLine1 =
    (source
      ? pickFirstString(source, ["address_line1", "address1", "line1", "address_line_1", "street1", "street"])
      : null) ||
    pickFirstString(rawOrder, ["shipping_address_line1", "shipping_address1", "shipping_line1", "shipping_street"]) ||
    "";
  const addressLine2 =
    (source
      ? pickFirstString(source, ["address_line2", "address2", "line2", "address_line_2", "street2", "unit", "apt"])
      : null) ||
    pickFirstString(rawOrder, ["shipping_address_line2", "shipping_address2", "shipping_line2"]) ||
    "";
  const city =
    (source ? pickFirstString(source, ["city", "town", "locality"]) : null) ||
    pickFirstString(rawOrder, ["shipping_city", "shipping_town"]) ||
    "";
  const province =
    (source ? pickFirstString(source, ["province", "state", "state_code", "region", "state_name"]) : null) ||
    pickFirstString(rawOrder, ["shipping_state", "shipping_state_code", "shipping_province", "shipping_region"]) ||
    "";
  const country =
    (source ? pickFirstString(source, ["country", "country_code", "country_name"]) : null) ||
    pickFirstString(rawOrder, ["shipping_country", "shipping_country_code"]) ||
    "";
  const postalCode =
    (source ? pickFirstString(source, ["postal_code", "zip", "zipcode", "zip_code", "postal"]) : null) ||
    pickFirstString(rawOrder, ["shipping_postal_code", "shipping_zip"]) ||
    "";
  const phone =
    (source ? pickFirstString(source, ["phone", "phone_number"]) : null) ||
    pickFirstString(rawOrder, ["shipping_phone"]) ||
    "";

  if (!name && !addressLine1 && !city && !country && !postalCode) {
    return null;
  }

  return {
    name,
    address_line1: addressLine1,
    address_line2: addressLine2,
    city,
    province,
    country,
    postal_code: postalCode,
    phone,
  };
}

function normalizeOrder(rawData: Record<string, unknown>): NormalizedOrder | null {
  const rawOrder = (rawData.order as Record<string, unknown>) || rawData;
  if (!rawOrder || typeof rawOrder !== "object") return null;

  const id =
    pickFirstString(rawOrder, ["order_id", "orderId", "id"]) || "";
  const createdAt =
    pickFirstString(rawOrder, ["created_at", "createdAt", "placed_at"]) || "";
  const status = pickFirstString(rawOrder, ["status", "order_status"]) || "processing";
  const paymentStatus =
    pickFirstString(rawOrder, ["payment_status", "paymentStatus"]) || "";
  const fulfillmentStatus =
    pickFirstString(rawOrder, ["fulfillment_status", "fulfillmentStatus"]) || "";
  const deliveryStatus =
    pickFirstString(rawOrder, ["delivery_status", "deliveryStatus"]) || "";
  const currency =
    pickFirstString(rawOrder, ["currency", "currency_code", "payment_currency"]) ||
    "USD";

  const items = normalizeItems(rawOrder);
  const itemSubtotal = items.reduce((sum, item) => sum + (item.subtotal ?? 0), 0);

  const subtotal =
    readMajorAmount(rawOrder, ["subtotal_amount_minor", "subtotal_minor"], ["subtotal_amount", "subtotal"]) ??
    itemSubtotal;
  const discounts =
    readMajorAmount(rawOrder, ["discount_amount_minor", "discount_minor"], ["discount_amount", "discount_total", "discounts"]) ??
    0;
  const shipping =
    readMajorAmount(rawOrder, ["shipping_amount_minor", "shipping_minor"], ["shipping_amount", "shipping_cost", "shipping"]) ??
    0;
  const taxes =
    readMajorAmount(rawOrder, ["tax_amount_minor", "tax_minor"], ["tax_amount", "tax_total", "taxes"]) ??
    0;
  const total =
    readMajorAmount(rawOrder, ["total_amount_minor", "total_minor"], ["total_amount", "total"]) ??
    Math.max(0, subtotal - discounts + shipping + taxes);

  const shippingAddress =
    normalizeShippingAddress(
      rawOrder,
      (rawOrder.shipping_address as Record<string, unknown>) ||
        (rawOrder.shippingAddress as Record<string, unknown>) ||
        (rawOrder.shipping as Record<string, unknown>) ||
        null,
    ) || undefined;

  const paymentMethod = formatPaymentMethod(rawOrder);
  const refundStatus =
    pickFirstString(rawOrder, [
      "refund_status",
      "refundStatus",
      "refund_status_raw",
      "after_sales_status",
      "afterSalesStatus",
      "after_sales_case_status",
    ]) || null;

  return {
    id,
    createdAt,
    status,
    paymentStatus,
    fulfillmentStatus,
    deliveryStatus,
    currency,
    items,
    shippingAddress,
    paymentMethod,
    refundStatus,
    permissions: rawOrder.permissions as OrdersListItem["permissions"],
    totals: {
      subtotal,
      discounts,
      shipping,
      taxes,
      total,
      currency: currency.toUpperCase(),
    },
    tracking: extractTracking(rawOrder),
  };
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();

  const creatorSlugParam =
    searchParams?.get("creator") || searchParams?.get("creator_slug") || null;
  const creatorConfig = creatorSlugParam
    ? getCreatorBySlug(creatorSlugParam)
    : undefined;

  const orderId = String(params?.orderId || "");
  const [order, setOrder] = useState<NormalizedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [tracking, setTracking] = useState<TrackingInfo | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<null | "track" | "cancel" | "refund">(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundItems, setRefundItems] = useState<Record<number, boolean>>({});
  const [refundNote, setRefundNote] = useState<string | null>(null);
  const [refundSubmitted, setRefundSubmitted] = useState(false);

  const formatDate = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return (dateStr: string) => {
      if (!dateStr) return "—";
      const date = new Date(dateStr);
      return Number.isNaN(date.getTime()) ? "—" : fmt.format(date);
    };
  }, []);

  const formatMoney = useMemo(() => {
    return (amount: number, currency: string) => {
      const value = Number.isFinite(amount) ? amount : 0;
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
      } catch {
        return `${value.toFixed(2)} ${currency}`;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const me = await accountsMe();
        if (cancelled) return;
        if (!me) {
          setIsAuthed(false);
          setLoading(false);
          return;
        }
        setIsAuthed(true);
        const detail = await getOrderDetail(orderId);
        const normalized = normalizeOrder(detail as Record<string, unknown>);
        if (!normalized) {
          throw new Error("We couldn’t find this order.");
        }
        setOrder(normalized);
        setTracking(normalized.tracking || null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("We couldn’t load this order right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (!orderId) {
      setLoading(false);
      setError("Missing order id.");
      return;
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    if (!order) return;
    const defaults: Record<number, boolean> = {};
    order.items.forEach((_, idx) => {
      defaults[idx] = true;
    });
    setRefundItems(defaults);
    setRefundAmount("");
    setRefundReason("");
    setRefundNote(null);
    setRefundSubmitted(false);
    setRefundOpen(false);
  }, [order?.id]);

  const handleRequireLogin = () => {
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/account/orders";
    router.push(`/account/login?return_to=${encodeURIComponent(returnTo)}`);
  };

  const loadTracking = async () => {
    if (!orderId) return;
    setTrackingError(null);
    setActionLoading("track");
    try {
      const data = await getOrderTracking(orderId);
      const normalized = extractTracking(data as Record<string, unknown>);
      if (normalized) {
        setTracking(normalized);
      } else {
        setTracking(null);
        setTrackingError("No tracking info yet.");
      }
    } catch (err) {
      console.error(err);
      setTrackingError("Unable to load tracking details right now.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    const status = order.status.toLowerCase();
    if (status === "cancelled" || status === "canceled" || status === "refunded") {
      return;
    }
    if (!window.confirm("Cancel this order?")) return;
    setActionLoading("cancel");
    try {
      const reason = window.prompt("Optional: tell us why you’re cancelling this order (leave empty to skip).", "");
      await cancelOrder(order.id, reason || undefined);
      const detail = await getOrderDetail(order.id);
      const normalized = normalizeOrder(detail as Record<string, unknown>);
      if (normalized) setOrder(normalized);
    } catch (err) {
      console.error(err);
      alert("We couldn’t cancel this order right now. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefundRequest = async () => {
    if (!order) return;
    setRefundNote(null);
    const selected = order.items.filter((_, idx) => refundItems[idx]);
    const amountValue = refundAmount.trim()
      ? parseNumber(refundAmount)
      : 0;

    if (!selected.length && !amountValue) {
      setRefundNote("Select items or enter a refund amount.");
      return;
    }
    if (!window.confirm("Send this refund request to the merchant?")) return;

    setActionLoading("refund");
    try {
      const payload = {
        amount: amountValue > 0 ? Math.round(amountValue * 100) / 100 : undefined,
        currency: order.totals.currency,
        reason: refundReason.trim() || undefined,
        items: selected.length
          ? selected.map((item) => ({
              item_id: item.id || undefined,
              title: item.title,
              quantity: item.quantity,
              amount: item.subtotal ?? undefined,
            }))
          : undefined,
      };
      await requestRefund(order.id, payload);
      setRefundSubmitted(true);
      setRefundOpen(false);
      const detail = await getOrderDetail(order.id);
      const normalized = normalizeOrder(detail as Record<string, unknown>);
      if (normalized) setOrder(normalized);
    } catch (err) {
      console.error(err);
      setRefundNote("We couldn’t submit the refund request. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const statusToneClasses = (statusRaw: string, paymentStatusRaw: string, fulfillmentRaw: string, deliveryRaw: string) => {
    const status = statusRaw.toLowerCase();
    const paymentStatus = paymentStatusRaw.toLowerCase();
    const fulfillment = fulfillmentRaw.toLowerCase();
    const delivery = deliveryRaw.toLowerCase();
    if (status === "cancelled" || status === "canceled" || status === "refunded") {
      return "bg-rose-50 text-rose-600 border border-rose-100";
    }
    if (delivery === "delivered") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    }
    if (fulfillment === "shipped") {
      return "bg-sky-50 text-sky-700 border border-sky-100";
    }
    if (paymentStatus === "pending") {
      return "bg-amber-50 text-amber-700 border border-amber-100";
    }
    if (paymentStatus === "failed") {
      return "bg-rose-50 text-rose-600 border border-rose-100";
    }
    if (paymentStatus === "paid") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-100";
    }
    return "bg-slate-100 text-slate-700 border border-slate-200";
  };

  const statusLabel = (order?: NormalizedOrder | null) => {
    if (!order) return "Processing";
    const status = order.status.toLowerCase();
    if (status === "cancelled" || status === "canceled") return "Cancelled";
    if (status === "refunded") return "Refunded";
    if (order.deliveryStatus.toLowerCase() === "delivered") return "Delivered";
    if (order.fulfillmentStatus.toLowerCase() === "shipped") return "Shipped";
    if (order.paymentStatus.toLowerCase() === "failed") return "Payment failed";
    if (order.paymentStatus.toLowerCase() === "pending") return "Payment pending";
    if (order.paymentStatus.toLowerCase() === "paid") return "Paid";
    return order.status || "Processing";
  };

  const isCancelled =
    order?.status.toLowerCase() === "cancelled" ||
    order?.status.toLowerCase() === "canceled" ||
    order?.status.toLowerCase() === "refunded";
  const isPaid = order?.paymentStatus.toLowerCase() === "paid";
  const isShipped =
    order?.fulfillmentStatus.toLowerCase() === "shipped" ||
    order?.deliveryStatus.toLowerCase() === "shipped";
  const isDelivered = order?.deliveryStatus.toLowerCase() === "delivered";
  const refundStatusLower = (order?.refundStatus || "").toLowerCase();
  const refundLocked =
    refundStatusLower.includes("pending") ||
    refundStatusLower.includes("requested") ||
    refundStatusLower.includes("approved") ||
    refundStatusLower.includes("processing") ||
    refundSubmitted;
  const refundStatusLabel = order?.refundStatus
    ? `Refund status: ${order.refundStatus}`
    : refundSubmitted
    ? "Refund request sent. Awaiting merchant approval."
    : null;

  const progressSteps = useMemo(() => {
    if (!order) return [];
    if (isCancelled) {
      return [
        {
          key: "placed",
          title: "Order placed",
          desc: "We received your order",
          done: true,
          current: false,
          at: order.createdAt,
        },
        {
          key: "cancelled",
          title: "Cancelled",
          desc: "This order was cancelled",
          done: true,
          current: true,
          at: order.createdAt,
        },
      ];
    }

    return [
      {
        key: "placed",
        title: "Order placed",
        desc: "We received your order",
        done: true,
        current: !isPaid,
        at: order.createdAt,
      },
      {
        key: "paid",
        title: "Payment confirmed",
        desc: "Payment received",
        done: isPaid,
        current: isPaid && !isShipped,
        at: isPaid ? order.createdAt : null,
      },
      {
        key: "processing",
        title: "Processing",
        desc: "Items are being packed",
        done: isPaid || isShipped || isDelivered,
        current: isPaid && !isShipped,
        at: isPaid ? order.createdAt : null,
      },
      {
        key: "shipped",
        title: "Shipped",
        desc: "Handed off to the carrier",
        done: isShipped || isDelivered,
        current: isShipped && !isDelivered,
        at: isShipped ? order.createdAt : null,
      },
      {
        key: "delivered",
        title: "Delivered",
        desc: "Delivered to your address",
        done: isDelivered,
        current: isDelivered,
        at: isDelivered ? order.createdAt : null,
      },
    ];
  }, [order, isCancelled, isPaid, isShipped, isDelivered]);

  const itemsCountLabel = order
    ? `${order.items.length} item${order.items.length === 1 ? "" : "s"}`
    : "";
  const selectedRefundItems = order
    ? order.items.filter((_, idx) => refundItems[idx])
    : [];
  const refundMax = selectedRefundItems.reduce(
    (sum, item) => sum + (item.subtotal ?? 0),
    0,
  );
  const shippingRegion = order?.shippingAddress
    ? order.shippingAddress.province ||
      (order.shippingAddress as unknown as { state?: string }).state ||
      (order.shippingAddress as unknown as { region?: string }).region ||
      ""
    : "";

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[#f4e2d4] pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-[#c7ad97]" />
            <h1 className="text-xl font-semibold text-[#3f3125]">
              Order details
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        </header>

        {loading && (
          <section className="rounded-3xl border border-[#f4e2d4] bg-white/80 px-4 py-4 text-sm shadow-sm">
            <div className="h-4 w-40 animate-pulse rounded-full bg-[#f5e3d4]" />
            <div className="mt-3 h-3 w-56 animate-pulse rounded-full bg-[#f5e3d4]" />
          </section>
        )}

        {!loading && isAuthed === false && (
          <section className="flex flex-1 flex-col items-start justify-center gap-3 rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-6 text-sm shadow-sm">
            <p className="text-[#8c715c]">
              Sign in to view your order details and tracking updates.
            </p>
            <button
              type="button"
              onClick={handleRequireLogin}
              className="rounded-full bg-[#3f3125] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black"
            >
              Sign in with email
            </button>
          </section>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600 shadow-sm">
            <AlertCircle className="h-5 w-5" />
            <div>{error}</div>
          </div>
        )}

        {!loading && order && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-8">
              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-[#a38b78]">
                      {formatDate(order.createdAt)}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold text-[#3f3125]">
                      {order.id || "Order"}
                    </div>
                    {creatorConfig && (
                      <div className="mt-1 text-[11px] text-[#b29a84]">
                        Creator: {creatorConfig.name}
                      </div>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${statusToneClasses(
                      order.status,
                      order.paymentStatus,
                      order.fulfillmentStatus,
                      order.deliveryStatus,
                    )}`}
                  >
                    {statusLabel(order)}
                  </span>
                </div>
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm lg:hidden">
                <div className="text-sm font-medium text-[#3f3125]">Summary</div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[#a38b78]">
                    <span>Subtotal</span>
                    <span className="font-medium text-[#3f3125]">
                      {formatMoney(order.totals.subtotal, order.totals.currency)}
                    </span>
                  </div>
                  {order.totals.discounts > 0 && (
                    <div className="flex items-center justify-between text-[#a38b78]">
                      <span>Discounts</span>
                      <span className="font-medium text-[#3f3125]">
                        -{formatMoney(order.totals.discounts, order.totals.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[#a38b78]">
                    <span>Shipping</span>
                    <span className="font-medium text-[#3f3125]">
                      {order.totals.shipping <= 0
                        ? "Free"
                        : formatMoney(order.totals.shipping, order.totals.currency)}
                    </span>
                  </div>
                  <div className="pt-2 flex items-center justify-between text-[#3f3125]">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">
                      {formatMoney(order.totals.total, order.totals.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="text-sm font-medium text-[#3f3125]">
                  Order actions
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={loadTracking}
                    disabled={actionLoading !== null}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3f3125] px-3 py-2 text-[11px] font-medium text-white shadow-sm hover:bg-black disabled:opacity-70"
                  >
                    <Truck className="h-4 w-4" />
                    {actionLoading === "track" ? "Loading…" : "Track order"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const subject = encodeURIComponent(`Order support: ${order.id}`);
                      window.location.assign(`mailto:${SUPPORT_EMAIL}?subject=${subject}`);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f0e2d6] bg-white px-3 py-2 text-[11px] font-medium text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
                  >
                    <LifeBuoy className="h-4 w-4" />
                    Contact support
                  </button>
                </div>

                {!isCancelled && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={actionLoading !== null || order.paymentStatus.toLowerCase() === "paid"}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#f0e2d6] px-3 py-2 text-[11px] font-medium text-[#8c715c] hover:bg-[#fff0e3] disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel order
                  </button>
                )}

                {isPaid && (
                  <button
                    type="button"
                    onClick={() => setRefundOpen((prev) => !prev)}
                    disabled={actionLoading !== null || refundLocked}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#f0e2d6] px-3 py-2 text-[11px] font-medium text-[#8c715c] hover:bg-[#fff0e3] disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {refundLocked ? "Refund requested" : refundOpen ? "Hide refund form" : "Request refund"}
                  </button>
                )}

                {refundOpen && order && !refundLocked && (
                  <div className="mt-3 rounded-2xl border border-[#f0e2d6] bg-[#fffaf6] px-3 py-3 text-[11px] text-[#8c715c]">
                    <div className="text-[11px] text-[#8c715c]">
                      Select items or enter a refund amount. Merchant approval
                      is required.
                    </div>
                    <div className="mt-3 space-y-2">
                      {order.items.map((item, idx) => (
                        <label key={`${item.title}-${idx}`} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={Boolean(refundItems[idx])}
                            onChange={(event) =>
                              setRefundItems((prev) => ({
                                ...prev,
                                [idx]: event.target.checked,
                              }))
                            }
                            className="mt-0.5 h-3.5 w-3.5 rounded border-[#d9c6b3] text-[#3f3125]"
                          />
                          <span className="text-[11px] text-[#8c715c]">
                            {item.title}
                            <span className="ml-1 text-[10px] text-[#b29a84]">
                              · Qty {item.quantity}
                              {item.subtotal != null
                                ? ` · ${formatMoney(item.subtotal, order.totals.currency)}`
                                : ""}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2">
                      <label className="text-[11px] text-[#8c715c]">
                        Refund amount (optional)
                      </label>
                      <input
                        type="text"
                        value={refundAmount}
                        onChange={(event) => setRefundAmount(event.target.value)}
                        placeholder={
                          refundMax > 0
                            ? `Up to ${formatMoney(refundMax, order.totals.currency)}`
                            : "Enter amount"
                        }
                        className="w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-[11px] text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>

                    <div className="mt-3">
                      <label className="text-[11px] text-[#8c715c]">
                        Reason (optional)
                      </label>
                      <textarea
                        value={refundReason}
                        onChange={(event) => setRefundReason(event.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-[#f0e2d6] bg-white px-3 py-2 text-[11px] text-[#3f3125] outline-none focus:border-[#3f3125]"
                      />
                    </div>

                    {refundNote && (
                      <div className="mt-2 text-[10px] text-rose-500">
                        {refundNote}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRefundRequest}
                      disabled={actionLoading !== null}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-[#3f3125] px-3 py-2 text-[11px] font-medium text-white shadow-sm hover:bg-black disabled:opacity-60"
                    >
                      {actionLoading === "refund" ? "Submitting…" : "Submit refund request"}
                    </button>
                  </div>
                )}

                {refundStatusLabel && (
                  <div className="mt-2 text-[11px] text-[#a38b78]">
                    {refundStatusLabel}
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="text-sm font-medium text-[#3f3125]">
                  Order progress
                </div>
                <div className="mt-4 space-y-4">
                  {progressSteps.map((step, idx) => {
                    const dotClass = step.done
                      ? "bg-emerald-500 text-white"
                      : step.current
                      ? "bg-[#3f3125] text-white"
                      : "bg-[#f5e3d4] text-[#8c715c]";
                    const lineClass = step.done ? "bg-emerald-200" : "bg-[#f0e2d6]";
                    const timestamp = step.at ? formatDate(step.at) : null;
                    return (
                      <div key={step.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${dotClass}`}>
                            {step.done ? "✓" : idx + 1}
                          </div>
                          {idx < progressSteps.length - 1 && (
                            <div className={`min-h-8 w-px flex-1 ${lineClass}`} />
                          )}
                        </div>
                        <div className="flex flex-1 items-start justify-between gap-3">
                          <div>
                            <div className={`text-sm font-medium ${step.done || step.current ? "text-[#3f3125]" : "text-[#a38b78]"}`}>
                              {step.title}
                            </div>
                            <div className="text-xs text-[#a38b78]">{step.desc}</div>
                          </div>
                          {timestamp && (
                            <div className="text-[10px] text-[#b29a84]">{timestamp}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-[#f0e2d6] bg-[#fffaf6] px-4 py-3">
                  <div className="text-xs font-medium text-[#3f3125]">Tracking</div>
                  {tracking ? (
                    <div className="mt-2 space-y-2 text-[11px] text-[#8c715c]">
                      <div>
                        {tracking.status || "In transit"}
                        {tracking.carrier ? ` · ${tracking.carrier}` : ""}
                        {tracking.trackingNumber ? ` · ${tracking.trackingNumber}` : ""}
                      </div>
                      {tracking.trackingUrl && (
                        <a
                          href={tracking.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#3f3125] underline"
                        >
                          Open carrier tracking
                        </a>
                      )}
                      {Array.isArray(tracking.events) && tracking.events.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {tracking.events.slice(0, 4).map((event, idx) => (
                            <div key={`${event.status || event.message}-${idx}`} className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] text-[#3f3125]">
                                  {event.status || event.message || "Update"}
                                </div>
                                {event.location && (
                                  <div className="text-[10px] text-[#b29a84]">{event.location}</div>
                                )}
                              </div>
                              <div className="text-[10px] text-[#b29a84]">
                                {event.timestamp || event.occurred_at || ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-[#a38b78]">
                      {trackingError || "No tracking info yet."}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-[#3f3125]">Items</div>
                  <div className="text-[11px] text-[#a38b78]">{itemsCountLabel}</div>
                </div>
                <div className="mt-3 divide-y divide-[#f4e2d4]">
                  {order.items.map((item, idx) => (
                    <div key={`${item.title}-${idx}`} className="flex items-start gap-3 py-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#f0e2d6] bg-[#fff7f2]">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-[#c7ad97]" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="text-[13px] font-semibold text-[#3f3125]">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#a38b78]">
                          Qty {item.quantity}
                          {item.unitPrice != null ? ` · ${formatMoney(item.unitPrice, order.totals.currency)}` : ""}
                        </div>
                        {item.optionsText && (
                          <div className="text-[10px] text-[#b29a84]">
                            {item.optionsText}
                          </div>
                        )}
                      </div>
                      <div className="text-[12px] font-semibold text-[#3f3125]">
                        {item.subtotal != null ? formatMoney(item.subtotal, order.totals.currency) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 lg:col-span-4 lg:sticky lg:top-6">
              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="text-sm font-medium text-[#3f3125]">Summary</div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[#a38b78]">
                    <span>Subtotal</span>
                    <span className="font-medium text-[#3f3125]">
                      {formatMoney(order.totals.subtotal, order.totals.currency)}
                    </span>
                  </div>
                  {order.totals.discounts > 0 && (
                    <div className="flex items-center justify-between text-[#a38b78]">
                      <span>Discounts</span>
                      <span className="font-medium text-[#3f3125]">
                        -{formatMoney(order.totals.discounts, order.totals.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[#a38b78]">
                    <span>Shipping</span>
                    <span className="font-medium text-[#3f3125]">
                      {order.totals.shipping <= 0
                        ? "Free"
                        : formatMoney(order.totals.shipping, order.totals.currency)}
                    </span>
                  </div>
                  {order.totals.taxes > 0 && (
                    <div className="flex items-center justify-between text-[#a38b78]">
                      <span>Taxes</span>
                      <span className="font-medium text-[#3f3125]">
                        {formatMoney(order.totals.taxes, order.totals.currency)}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 flex items-center justify-between text-[#3f3125]">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">
                      {formatMoney(order.totals.total, order.totals.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="text-sm font-medium text-[#3f3125]">
                  Shipping address
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-[#8c715c]">
                  {order.shippingAddress ? (
                    <>
                      <div className="text-[12px] font-semibold text-[#3f3125]">
                        {order.shippingAddress.name || "—"}
                      </div>
                      <div>{order.shippingAddress.address_line1}</div>
                      {order.shippingAddress.address_line2 && (
                        <div>{order.shippingAddress.address_line2}</div>
                      )}
                      <div>
                        {order.shippingAddress.city}
                        {shippingRegion ? `, ${shippingRegion}` : ""}
                        {order.shippingAddress.postal_code ? ` ${order.shippingAddress.postal_code}` : ""}
                      </div>
                      <div>{order.shippingAddress.country}</div>
                    </>
                  ) : (
                    <div>No shipping address on file.</div>
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-[#f4e2d4] bg-white/90 px-4 py-4 shadow-sm">
                <div className="text-sm font-medium text-[#3f3125]">Payment</div>
                <div className="mt-2 space-y-2 text-[11px] text-[#8c715c]">
                  <div className="flex items-center justify-between">
                    <span>Status</span>
                    <span className="font-medium text-[#3f3125]">
                      {statusLabel(order)}
                    </span>
                  </div>
                  {order.paymentMethod && (
                    <div className="flex items-center justify-between">
                      <span>Method</span>
                      <span className="font-medium text-[#3f3125]">
                        {order.paymentMethod}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span>Amount</span>
                    <span className="font-medium text-[#3f3125]">
                      {formatMoney(order.totals.total, order.totals.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {order.permissions?.can_pay && (
                <button
                  type="button"
                  onClick={() => {
                    const amountMinor = Math.round(order.totals.total * 100);
                    router.push(
                      `/checkout?orderId=${encodeURIComponent(order.id)}&amount_minor=${amountMinor}&currency=${order.totals.currency}`,
                    );
                  }}
                  className="rounded-full bg-[#3f3125] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black"
                >
                  Continue payment
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
