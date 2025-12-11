'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listMyOrders, type OrdersListItem, accountsMe } from "@/lib/accountsClient";
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
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              {creatorConfig ? `Orders with ${creatorConfig.name}` : "Your orders"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {creatorConfig
                ? "Orders placed via this creator’s shopping agent."
                : "Orders placed via Pivota shopping and creator agents."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/creator/nina-studio")}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
          >
            Back
          </button>
        </header>

        <section className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading your orders…</p>
          ) : showLogin ? (
            <div className="space-y-3 text-sm">
              <p className="text-slate-600">
                You’re not signed in yet. Sign in with your email to see your orders.
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
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Sign in with email
              </button>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-500">{error}</p>
          ) : visibleOrders.length === 0 ? (
            <p className="text-sm text-slate-500">
              {creatorConfig
                ? `You don’t have any orders with ${creatorConfig.name} yet. Start a chat with the creator agent to pick a few items.`
                : "You don’t have any orders yet. Start a chat with the shopping agent to get some recommendations."}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              {visibleOrders.map((order) => (
                <div
                  key={order.order_id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-medium text-slate-900">
                      Order {order.order_id}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-600">
                      {order.items_summary || "Order from creator agent"}
                    </p>
                    {order.creator_name && (
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Creator: {order.creator_name}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right text-[11px]">
                    <p className="font-semibold text-slate-900">
                      {order.currency} {(order.total_amount_minor / 100).toFixed(2)}
                    </p>
                    <p className="text-slate-500">
                      {order.payment_status === "paid"
                        ? "Paid"
                        : order.payment_status === "failed"
                          ? order.permissions?.can_pay
                            ? "Payment failed — continue payment to try another card."
                            : "Payment failed."
                          : order.payment_status === "pending"
                            ? order.permissions?.can_pay
                              ? "Payment pending — continue payment to complete this order."
                              : "Payment pending — we’re still processing this payment."
                            : order.payment_status}
                    </p>
                    {order.permissions?.can_pay && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/checkout?orderId=${encodeURIComponent(
                              order.order_id,
                            )}&amount_minor=${
                              order.total_amount_minor
                            }&currency=${order.currency}&items_summary=${encodeURIComponent(
                              order.items_summary || "",
                            )}`,
                          )
                        }
                        className="mt-0.5 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-medium text-white hover:bg-slate-800"
                      >
                        Continue payment
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
