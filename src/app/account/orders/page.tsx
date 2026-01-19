'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listMyOrders,
  type OrdersListItem,
  accountsMe,
  cancelOrder,
} from "@/lib/accountsClient";
import { getCreatorBySlug } from "@/config/creatorAgents";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrdersListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [creatorSlug, setCreatorSlug] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get("creator") || params.get("creator_slug");
      setCreatorSlug(slug);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const creatorConfig = creatorSlug ? getCreatorBySlug(creatorSlug) : undefined;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const me = await accountsMe();
        if (!me) {
          if (!cancelled) {
            setIsAuthed(false);
            setLoading(false);
          }
          return;
        }
        setIsAuthed(true);
        const data = await listMyOrders(null, 20);
        if (!cancelled) {
          setOrders(data.items || []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("We couldn’t load your orders right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const showLogin = isAuthed === false;

  const visibleOrders = useMemo(() => {
    if (!creatorSlug) return orders;

    const filtered = orders.filter((order) => {
      if (order.creator_slug && creatorSlug) {
        return order.creator_slug === creatorSlug;
      }
      if (order.creator_id && creatorConfig?.id) {
        return order.creator_id === creatorConfig.id;
      }
      return false;
    });

    // 如果当前还没有任何订单带 creator 元数据（老数据或后端尚未部署），
    // 即使带了 ?creator= 参数，也先回退展示全部订单，避免误导用户看不到订单。
    const hasCreatorMetadata = orders.some(
      (o) => o.creator_slug || o.creator_id,
    );
    if (!hasCreatorMetadata) {
      return orders;
    }

    return filtered;
  }, [orders, creatorSlug, creatorConfig]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[#f4e2d4] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#3f3125]">
              My Orders
            </h1>
            <p className="mt-1 text-xs text-[#a38b78]">
              {creatorConfig
                ? `Orders placed via ${creatorConfig.name}’s shopping agent.`
                : "Track and manage your purchases from Pivota shopping and creator agents."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
                return;
              }
              if (creatorConfig) {
                router.push(`/creator/${encodeURIComponent(creatorConfig.slug)}`);
              } else {
                router.push("/creator/nina-studio");
              }
            }}
            className="rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
          >
            Back to shopping
          </button>
        </header>

        {loading ? (
          <section className="flex flex-1 flex-col gap-2 pb-8">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-2xl border border-[#f4e2d4] bg-white/70 px-3 py-2 shadow-sm sm:px-4 sm:py-3"
              >
                <div className="hidden h-12 w-12 rounded-xl bg-[#f5e3d4] sm:block" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-32 rounded-full bg-[#f2e3d8]" />
                  <div className="h-3 w-48 rounded-full bg-[#f2e3d8]" />
                </div>
                <div className="h-3 w-20 rounded-full bg-[#f2e3d8]" />
              </div>
            ))}
          </section>
        ) : showLogin ? (
          <section className="flex flex-1 flex-col items-start justify-center gap-3 pb-8 text-sm">
            <p className="text-[#8c715c]">
              You’re not signed in yet. Sign in with your email to see your
              orders.
            </p>
            <button
              type="button"
              onClick={() => {
                const returnTo =
                  typeof window !== "undefined"
                    ? window.location.pathname + window.location.search
                    : "/account/orders";
                router.push(
                  `/account/login?return_to=${encodeURIComponent(returnTo)}`,
                );
              }}
              className="rounded-full bg-[#3f3125] px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-black"
            >
              Sign in with email
            </button>
          </section>
        ) : error ? (
          <section className="flex flex-1 items-center pb-8">
            <p className="text-sm text-rose-500">{error}</p>
          </section>
        ) : visibleOrders.length === 0 ? (
          <section className="flex flex-1 items-center pb-8">
            <p className="text-sm text-[#8c715c]">
              {creatorConfig
                ? `You don’t have any orders with ${creatorConfig.name} yet. Start a chat with the creator agent to pick a few items.`
                : "You don’t have any orders yet. Start a chat with the shopping agent to get some recommendations."}
            </p>
          </section>
        ) : (
          <section className="flex flex-1 flex-col gap-2 pb-8 text-sm">
            {visibleOrders.map((order) => {
                const isCancelled =
                  order.status === "cancelled" || order.status === "refunded";

                const statusLabel = (() => {
                  if (order.status === "cancelled") return "Cancelled";
                  if (order.status === "refunded") return "Refunded";

                  const delivery = (order.delivery_status || "").toLowerCase();
                  const fulfillment = (order.fulfillment_status || "").toLowerCase();
                  if (delivery === "delivered" || fulfillment === "delivered") {
                    return "Delivered";
                  }
                  if (
                    delivery === "in_transit" ||
                    delivery === "shipped" ||
                    fulfillment === "shipped" ||
                    fulfillment === "fulfilled"
                  ) {
                    return "Shipped";
                  }

                  if (order.payment_status === "paid") return "Paid";

                  if (order.payment_status === "failed") {
                    return order.permissions?.can_pay
                      ? "Payment failed — continue payment to try another card."
                      : "Payment failed.";
                  }

                  if (order.payment_status === "pending") {
                    return order.permissions?.can_pay
                      ? "Payment pending — continue payment to complete this order."
                      : "Payment pending — we’re still processing this payment.";
                  }

                  // Fallback to whatever backend sent so we at least show something.
                  return order.payment_status || order.status;
                })();

                const shortStatus = (() => {
                  if (order.status === "cancelled") return "Cancelled";
                  if (order.status === "refunded") return "Refunded";
                  const delivery = (order.delivery_status || "").toLowerCase();
                  const fulfillment = (order.fulfillment_status || "").toLowerCase();
                  if (delivery === "delivered" || fulfillment === "delivered") {
                    return "Delivered";
                  }
                  if (
                    delivery === "in_transit" ||
                    delivery === "shipped" ||
                    fulfillment === "shipped" ||
                    fulfillment === "fulfilled"
                  ) {
                    return "Shipped";
                  }
                  if (order.payment_status === "pending") return "Payment pending";
                  if (order.payment_status === "paid") return "Paid";
                  return order.status || "Processing";
                })();

                const statusToneClasses = (() => {
                  if (order.status === "cancelled" || order.status === "refunded") {
                    return "bg-rose-50 text-rose-600 border border-rose-100";
                  }
                  const delivery = (order.delivery_status || "").toLowerCase();
                  const fulfillment = (order.fulfillment_status || "").toLowerCase();
                  if (delivery === "delivered" || fulfillment === "delivered") {
                    return "bg-emerald-50 text-emerald-700 border border-emerald-100";
                  }
                  if (
                    delivery === "in_transit" ||
                    delivery === "shipped" ||
                    fulfillment === "shipped" ||
                    fulfillment === "fulfilled"
                  ) {
                    return "bg-sky-50 text-sky-700 border border-sky-100";
                  }
                  if (order.payment_status === "pending") {
                    return "bg-amber-50 text-amber-700 border border-amber-100";
                  }
                  return "bg-slate-100 text-slate-700 border border-slate-200";
                })();

                const previewImageUrl =
                  (order as any).first_item_image_url ||
                  (order as any).thumbnail_url ||
                  (order as any).image_url ||
                  null;

                const firstItemOptions = (order as any)
                  .first_item_selected_options as
                  | Record<string, string>
                  | null
                  | undefined;
                const firstItemSku = (order as any)
                  .first_item_variant_sku as string | null | undefined;
                const firstItemOptionsText =
                  firstItemOptions && typeof firstItemOptions === "object"
                    ? Object.entries(firstItemOptions)
                        .map(([name, value]) => `${name}: ${value}`)
                        .join(" · ")
                    : null;

                const canCancel =
                  order.payment_status === "pending" && !isCancelled;

              const canContinuePayment =
                order.permissions?.can_pay && !isCancelled;

              const detailUrl = `/account/orders/${encodeURIComponent(
                order.order_id,
              )}${creatorSlug ? `?creator=${encodeURIComponent(creatorSlug)}` : ""}`;

                return (
                  <div
                    key={order.order_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(detailUrl)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(detailUrl);
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-[#f4e2d4] bg-white px-3 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-3"
                  >
                    <div className="hidden h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f5e3d4] sm:block">
                      {previewImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewImageUrl}
                          alt={order.items_summary || "Order items"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-[#8c715c]">
                          Order
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(detailUrl);
                            }}
                            className="text-left text-[12px] font-semibold text-[#3f3125] hover:underline sm:text-[13px]"
                          >
                            {order.order_id}
                          </button>
                          <p className="mt-0.5 truncate text-[10px] text-[#a38b78]">
                            {new Date(order.created_at).toLocaleDateString(
                              undefined,
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}{" "}
                            {order.items_summary ? "·" : ""}{" "}
                            {order.items_summary || "Order from creator agent"}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-medium ${statusToneClasses} sm:text-[10px]`}
                        >
                          {shortStatus}
                        </span>
                      </div>

                      {order.creator_name && (
                        <p className="hidden truncate text-[10px] text-[#b29a84] sm:block">
                          Creator: {order.creator_name}
                        </p>
                      )}
                      {(firstItemOptionsText || firstItemSku) && (
                        <p className="hidden truncate text-[10px] text-[#b29a84] sm:block">
                          {firstItemOptionsText}
                          {firstItemOptionsText && firstItemSku ? " · " : ""}
                          {firstItemSku ? `SKU: ${firstItemSku}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="mt-1 flex min-w-0 flex-col items-start gap-0.5 text-left text-[10px] sm:mt-0 sm:items-end sm:text-right">
                      <div className="flex w-full items-center justify-between gap-2 sm:justify-end">
                        <p className="text-[13px] font-semibold text-[#3f3125] sm:text-sm">
                          {order.currency}{" "}
                          {(
                            typeof order.total_amount_minor === "number" &&
                            !Number.isNaN(order.total_amount_minor)
                              ? order.total_amount_minor / 100
                              : 0
                          ).toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(detailUrl);
                          }}
                          className="shrink-0 rounded-full border border-[#f0e2d6] px-2.5 py-0.5 text-[10px] font-medium text-[#8c715c] hover:bg-[#fff0e3]"
                        >
                          View details
                        </button>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 justify-start sm:justify-end">
                        {canContinuePayment && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(
                                `/checkout?orderId=${encodeURIComponent(
                                  order.order_id,
                                )}&amount_minor=${
                                  order.total_amount_minor
                                }&currency=${order.currency}&items_summary=${encodeURIComponent(
                                  order.items_summary || "",
                                )}`,
                              );
                            }}
                            className="rounded-full bg-[#3f3125] px-2.5 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-black"
                          >
                            Continue payment
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            onClick={async (event) => {
                              event.stopPropagation();
                              try {
                                const reason = window.prompt(
                                  "Optional: tell us why you’re cancelling this order (leave empty to skip).",
                                );
                                await cancelOrder(order.order_id, reason || undefined);
                                const data = await listMyOrders(null, 20);
                                setOrders(data.items || []);
                              } catch (err) {
                                console.error(err);
                                const anyErr = err as any;
                                const code: string | undefined =
                                  anyErr?.detail?.error?.code ||
                                  anyErr?.detail?.error_code;
                                if (code === "INVALID_STATE") {
                                  alert(
                                    "This order has already been cancelled or refunded. The list will be refreshed.",
                                  );
                                  try {
                                    const data = await listMyOrders(null, 20);
                                    setOrders(data.items || []);
                                  } catch (reloadErr) {
                                    console.error("reload orders after cancel failed", reloadErr);
                                  }
                                } else {
                                  alert(
                                    "We couldn’t cancel this order right now. Please try again or contact support.",
                                  );
                                }
                              }
                            }}
                            className="rounded-full border border-[#f0e2d6] px-2.5 py-0.5 text-[10px] font-medium text-[#8c715c] hover:bg-[#fff0e3]"
                          >
                            Cancel order
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </section>
        )}
      </div>
    </main>
  );
}
