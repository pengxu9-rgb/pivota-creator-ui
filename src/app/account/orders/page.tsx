'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMyOrders, type OrdersListItem, accountsMe } from "@/lib/accountsClient";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrdersListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 py-8 lg:px-8">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Your orders</h1>
            <p className="mt-1 text-sm text-slate-600">
              Orders placed via Pivota shopping and creator agents.
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
                You’re not signed in yet. Sign in with your email to see orders across Pivota and creator
                agents.
              </p>
              <button
                type="button"
                onClick={() => router.push("/account/login")}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Sign in with email
              </button>
            </div>
          ) : error ? (
            <p className="text-sm text-rose-500">{error}</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-slate-500">
              You don’t have any orders yet. Start a chat with the creator agent to get some recommendations.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              {orders.map((order) => (
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
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right text-[11px]">
                    <p className="font-semibold text-slate-900">
                      {order.currency} {(order.total_amount_minor / 100).toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {order.status} · {order.payment_status}
                    </p>
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
