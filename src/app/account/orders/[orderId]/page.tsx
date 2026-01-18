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
  type OrdersListItem,
  type ShippingAddress,
} from "@/lib/accountsClient";
import { getCreatorBySlug } from "@/config/creatorAgents";

type NormalizedItem = {
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

function normalizeImageUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith("data:image/")) return v;
  if (v.startsWith("//")) return `https:${v}`;
  if (v.startsWith("https://")) return v;
  if (v.startsWith("http://")) return `https://${v.slice("http://".length)}`;
  return null;
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
    (Array.isArray(rawOrder.items) && rawOrder.items) ||
    (Array.isArray(rawOrder.line_items) && rawOrder.line_items) ||
    (Array.isArray(rawOrder.order_items) && rawOrder.order_items) ||
    (Array.isArray(rawOrder.products) && rawOrder.products) ||
    [];

  return itemsSource.map((raw) => {
    const item = raw as Record<string, unknown>;
    const title =
      pickFirstString(item, ["product_title", "title", "name", "product_name"]) ||
      "Item";
    const quantity = Math.max(1, Math.round(parseNumber(item.quantity ?? item.qty ?? 1)));

    const unitPrice =
      readMajorAmount(item, ["unit_price_minor", "unit_price_cents", "price_minor"], ["unit_price", "price", "amount"]) ??
      null;
    const subtotal =
      readMajorAmount(item, ["subtotal_minor", "subtotal_cents", "line_total_minor"], ["subtotal", "line_total", "total"]) ??
      (unitPrice != null ? unitPrice * quantity : null);

    const imageRaw = pickFirstString(item, [
      "product_image_url",
      "image_url",
      "image",
      "thumbnail_url",
      "thumb_url",
      "image_src",
    ]);
    const imageUrl = imageRaw ? normalizeImageUrl(imageRaw) : null;

    const options =
      item.selected_options && typeof item.selected_options === "object"
        ? Object.entries(item.selected_options as Record<string, unknown>)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(" · ")
        : null;

    return {
      title,
      quantity,
      unitPrice,
      subtotal,
      imageUrl,
      optionsText: options,
    };
  });
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
    (rawOrder.shipping_address as ShippingAddress) ||
    (rawOrder.shippingAddress as ShippingAddress) ||
    (rawOrder.shipping as ShippingAddress) ||
    undefined;

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

  const handleRefund = () => {
    if (!order) return;
    const subject = encodeURIComponent(`Order support: ${order.id}`);
    const body = encodeURIComponent(
      `Hi team,\n\nI would like to request a refund for order ${order.id}.\n\nThanks,`,
    );
    window.location.assign(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
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
                    onClick={handleRefund}
                    disabled={actionLoading !== null}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#f0e2d6] px-3 py-2 text-[11px] font-medium text-[#8c715c] hover:bg-[#fff0e3] disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Request refund
                  </button>
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
                        {order.shippingAddress.province ? `, ${order.shippingAddress.province}` : ""}
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
