'use client';

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { getOrderDetail } from "@/lib/accountsClient";
import { continueHostedCreatorCheckout } from "@/lib/hostedCreatorCheckout";

type LegacyCheckoutState = "redirecting" | "migrated" | "error";

function readMinorAmount(raw: string | null): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

function normalizeCurrency(raw: string | null | undefined): string | null {
  const value = String(raw || "").trim().toUpperCase();
  return value || null;
}

function reportLegacyCheckoutHit(payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    ...payload,
    pathname: window.location.pathname,
    search: window.location.search,
  });
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/creator-agent/checkout/legacy-hit", blob);
    return;
  }
  void fetch("/api/creator-agent/checkout/legacy-hit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function inferOrderAmountMinor(detail: Awaited<ReturnType<typeof getOrderDetail>>): number | null {
  const order = detail?.order;
  if (!order) return null;

  const directMinor = Number(order.total_amount_minor ?? null);
  if (Number.isFinite(directMinor) && directMinor > 0) {
    return Math.round(directMinor);
  }

  const majorAmount = Number((order as { total?: unknown }).total ?? order.total_amount ?? null);
  if (Number.isFinite(majorAmount) && majorAmount > 0) {
    return Math.round(majorAmount * 100);
  }

  return null;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LegacyCheckoutShell message="Redirecting to the hosted checkout..." />}>
      <CheckoutPageContent />
    </Suspense>
  );
}

function CheckoutPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { items } = useCart();
  const hasStartedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  const [state, setState] = useState<LegacyCheckoutState>("redirecting");
  const [message, setMessage] = useState("Redirecting to the hosted checkout...");

  const orderId = useMemo(
    () =>
      String(
        searchParams?.get("orderId") ||
          searchParams?.get("order_id") ||
          "",
      ).trim(),
    [searchParams],
  );
  const queryAmountMinor = useMemo(
    () =>
      readMinorAmount(
        searchParams?.get("amountMinor") ||
          searchParams?.get("amount_minor") ||
          searchParams?.get("totalMinor") ||
          searchParams?.get("total_amount_minor") ||
          null,
      ),
    [searchParams],
  );
  const queryCurrency = useMemo(
    () =>
      normalizeCurrency(
        searchParams?.get("currency") ||
          searchParams?.get("charge_currency") ||
          searchParams?.get("presentment_currency"),
      ),
    [searchParams],
  );
  const creatorSlug = useMemo(() => {
    const itemSlug = items.find((item) => String(item.creatorSlug || "").trim())?.creatorSlug;
    const querySlug = String(
      searchParams?.get("creatorSlug") ||
        searchParams?.get("creator_slug") ||
        searchParams?.get("creator") ||
        "",
    ).trim();
    return String(itemSlug || querySlug || "").trim() || null;
  }, [items, searchParams]);
  const cartDestination = creatorSlug
    ? `/creator/${encodeURIComponent(creatorSlug)}?openCart=1`
    : "/";

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    let cancelled = false;

    const run = async () => {
      try {
        if (orderId) {
          reportLegacyCheckoutHit({
            event: "legacy_checkout_order_redirect",
            orderId,
            creatorSlug,
            cartDestination,
            state: "redirecting",
          });
          setMessage("Redirecting your existing order to the hosted checkout...");

          let amountMinor = queryAmountMinor;
          let currency = queryCurrency;

          if (amountMinor == null || !currency) {
            const detail = await getOrderDetail(orderId);
            amountMinor = amountMinor ?? inferOrderAmountMinor(detail);
            currency = currency ?? normalizeCurrency(detail?.order?.currency);
          }

          if (amountMinor == null || !currency) {
            throw new Error("Unable to recover the order total for hosted checkout.");
          }

          await continueHostedCreatorCheckout({
            orderId,
            amountMinor,
            currency,
            returnUrl: typeof window !== "undefined" ? window.location.href : undefined,
          });
          return;
        }

        if (cancelled) return;
        reportLegacyCheckoutHit({
          event: "legacy_checkout_cart_redirect",
          orderId,
          creatorSlug,
          cartDestination,
          state: "migrated",
        });
        setState("migrated");
        setMessage("Checkout moved back to the creator cart. Redirecting you now...");
        timeoutRef.current = window.setTimeout(() => {
          router.replace(cartDestination);
        }, 1200);
      } catch (error) {
        if (cancelled) return;
        reportLegacyCheckoutHit({
          event: "legacy_checkout_error",
          orderId,
          creatorSlug,
          cartDestination,
          state: "error",
          message: error instanceof Error ? error.message : "unknown_error",
        });
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to continue with hosted checkout.",
        );
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [cartDestination, creatorSlug, orderId, queryAmountMinor, queryCurrency, router]);

  return <LegacyCheckoutShell state={state} orderId={orderId} message={message} cartDestination={cartDestination} />;
}

function LegacyCheckoutShell({
  state = "redirecting",
  orderId = "",
  message,
  cartDestination = "/",
}: {
  state?: LegacyCheckoutState;
  orderId?: string;
  message: string;
  cartDestination?: string;
}) {
  return (
    <main className="min-h-screen bg-[#f7f0e8] px-6 py-16 text-[#3f3125]">
      <div className="mx-auto flex max-w-xl flex-col gap-6 rounded-[28px] border border-[#ead8c7] bg-white/90 p-8 shadow-[0_20px_60px_rgba(63,49,37,0.08)]">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a38b78]">
            Legacy Checkout
          </p>
          <h1 className="text-2xl font-semibold">
            {orderId ? "Moving this order to hosted checkout" : "Checkout has moved"}
          </h1>
          <p className="text-sm leading-6 text-[#6b5848]">{message}</p>
        </div>

        {state === "redirecting" && (
          <div className="rounded-2xl border border-[#f1e3d6] bg-[#fff8f2] px-4 py-3 text-sm text-[#7b6857]">
            Please wait while we hand this session back to the canonical shopping checkout.
          </div>
        )}

        {state === "migrated" && (
          <div className="flex flex-wrap gap-3">
            <Link
              href={cartDestination}
              className="rounded-full bg-[#3f3125] px-5 py-2 text-sm font-medium text-white"
            >
              Open creator cart
            </Link>
            <Link
              href="/account/orders"
              className="rounded-full border border-[#d8c4b3] px-5 py-2 text-sm font-medium text-[#3f3125]"
            >
              View orders
            </Link>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-wrap gap-3">
            <Link
              href={orderId ? "/account/orders" : cartDestination}
              className="rounded-full bg-[#3f3125] px-5 py-2 text-sm font-medium text-white"
            >
              {orderId ? "Back to orders" : "Back to creator"}
            </Link>
            {!orderId && (
              <Link
                href="/account/orders"
                className="rounded-full border border-[#d8c4b3] px-5 py-2 text-sm font-medium text-[#3f3125]"
              >
                View orders
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
