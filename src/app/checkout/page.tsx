'use client';

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCart } from "@/components/cart/CartProvider";
import {
  createOrderFromCart,
  submitPaymentForOrder,
  type SubmitPaymentResponse,
  type CheckoutOrderResponse,
} from "@/lib/checkoutClient";
import {
  accountsLogin,
  accountsVerify,
  accountsMe,
  getLatestPaidOrderShippingAddress,
  type AccountsUser,
} from "@/lib/accountsClient";
import "@adyen/adyen-web/dist/adyen.css";

type CheckoutStep = "form" | "submitting" | "success" | "error";
type AuthStep = "checking" | "email" | "otp" | "authed";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const hasStripe = !!publishableKey;

export default function CheckoutPage() {
  if (!hasStripe) {
    return <CheckoutInner hasStripe={false} stripe={null} elements={null} />;
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements stripe={stripePromise}>
      <CheckoutWithStripe />
    </Elements>
  );
}

function CheckoutWithStripe() {
  const stripe = useStripe();
  const elements = useElements();
  return (
    <CheckoutInner
      hasStripe={!!stripe}
      stripe={stripe}
      elements={elements}
    />
  );
}

type CheckoutInnerProps = {
  hasStripe: boolean;
  stripe: any;
  elements: any;
};

function CheckoutInner({ hasStripe, stripe, elements }: CheckoutInnerProps) {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();
  const [step, setStep] = useState<CheckoutStep>("form");
  const [error, setError] = useState<string | null>(null);

  // Keep a snapshot of the cart at the moment the order is placed so that
  // the success view can still show what was ordered even after the live cart
  // has been cleared.
  const [placedItems, setPlacedItems] = useState<typeof items | null>(null);
  const [placedSubtotal, setPlacedSubtotal] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [orderId, setOrderId] = useState<string | undefined>();
  const [paymentStatus, setPaymentStatus] = useState<string | undefined>();
  const [cardError, setCardError] = useState<string | null>(null);
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [existingTotalMinor, setExistingTotalMinor] = useState<number | null>(null);
  const [existingCurrency, setExistingCurrency] = useState<string | null>(null);
  const [existingItemsSummary, setExistingItemsSummary] = useState<string | null>(null);
  const [hasPrefilledAddress, setHasPrefilledAddress] = useState(false);

  // Auth state for inline email login
  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [loginEmail, setLoginEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [accountsUser, setAccountsUser] = useState<AccountsUser | null>(null);

  // Adyen drop-in state
  const adyenContainerRef = useRef<HTMLDivElement | null>(null);
  const [adyenMounted, setAdyenMounted] = useState(false);
  const [pspUsed, setPspUsed] = useState<string | null>(null);
  const [isPaymentStep, setIsPaymentStep] = useState(false);

  const currency = existingCurrency || items[0]?.currency || "USD";

  // Prefer the email coming from the accounts service, then fall back to any
  // local email the user has typed during this checkout session.
  const displayEmail =
    (accountsUser && accountsUser.email) || email || loginEmail || "";

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await accountsMe();
        if (cancelled) return;
        if (me) {
          setAccountsUser(me);
          if (me.email) {
            setEmail(me.email);
            setLoginEmail(me.email);
          }
          setAuthStep("authed");
        } else {
          setAuthStep("email");
        }

        // Prefill shipping address from the latest paid order on this account,
        // but only when we are not continuing payment for an existing order
        // and the user hasn't started typing their own address.
        if (me && !existingOrderId && !cancelled) {
          try {
            const addr = await getLatestPaidOrderShippingAddress();
            if (
              addr &&
              !hasPrefilledAddress &&
              !name &&
              !addressLine1 &&
              !city &&
              !country &&
              !postalCode
            ) {
              setName(addr.name || "");
              setAddressLine1(addr.address_line1 || "");
              setAddressLine2(addr.address_line2 || "");
              setCity(addr.city || "");
              setCountry(addr.country || "");
              setPostalCode(addr.postal_code || "");
              setPhone(addr.phone || "");
              setHasPrefilledAddress(true);
            }
          } catch (addrErr) {
            console.error(addrErr);
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setAuthStep("email");
        }
      }
    };
    loadMe();
    return () => {
      cancelled = true;
    };
  }, [existingOrderId, hasPrefilledAddress, name, addressLine1, city, country, postalCode]);

  // Support continuing payment for an existing order from the Orders page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("orderId") || params.get("order_id");
      const amount = params.get("amount_minor") || params.get("amount");
      const cur = params.get("currency");
      const summary = params.get("items_summary");
      if (id) {
        setExistingOrderId(id);
      }
      if (amount) {
        const n = Number(amount);
        if (!Number.isNaN(n)) {
          setExistingTotalMinor(n);
        }
      }
      if (cur) {
        setExistingCurrency(cur);
      }
      if (summary) {
        setExistingItemsSummary(summary);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) {
      setAuthError("Please enter your email.");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      await accountsLogin(loginEmail);
      setAuthStep("otp");
    } catch (err) {
      console.error(err);
      setAuthError("We couldn’t send the code. Please check your email and try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setAuthError("Please enter the verification code.");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const user = await accountsVerify(loginEmail, otp);
      setAccountsUser(user as AccountsUser);
      setEmail(loginEmail);
      setAuthStep("authed");
    } catch (err) {
      console.error(err);
      setAuthError("The code seems incorrect or expired. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length && !existingOrderId) {
      setError("Your cart is empty.");
      return;
    }
    const effectiveEmail =
      displayEmail.trim() ||
      email.trim();

    // Ensure we have some email to attach to the order.
    if (!effectiveEmail) {
      setError("Please enter a valid email before placing the order.");
      return;
    }
    if (!name || !addressLine1 || !city || !country || !postalCode) {
      setError("Please fill in all required fields.");
      return;
    }

    setError(null);
    setStep("submitting");

    try {
      // Ensure we have an order id; if not, create the order first. This
      // happens on the very first click, so the same "Place order" action
      // both creates the order and initiates the payment flow.
      let currentOrderId: string | undefined =
        orderId || existingOrderId || undefined;

      if (!currentOrderId) {
        // Snapshot current cart so we can render a stable summary after success.
        setPlacedItems(items);
        setPlacedSubtotal(subtotal);

        const orderRes = await createOrderFromCart({
          items,
          email: effectiveEmail,
          name,
          addressLine1,
          addressLine2: addressLine2 || undefined,
          city,
          country,
          postalCode,
          phone: phone || undefined,
          notes: notes || undefined,
        });

        const createdOrderId =
          (orderRes as CheckoutOrderResponse).order_id ||
          (orderRes as any).id;

        if (!createdOrderId) {
          throw new Error("Order was created but no order ID was returned.");
        }

        setOrderId(createdOrderId);
        currentOrderId = createdOrderId;

        // Try to infer PSP from the initial order response, similar to the
        // main Shopping Agent checkout flow. This lets us hide the Stripe
        // card box entirely when the merchant is routed to Adyen.
        const anyOrder = orderRes as any;
        const paymentObj = (anyOrder.payment || {}) as any;

        let orderPsp: string | null =
          (anyOrder.psp as string | null) ||
          (paymentObj.psp as string | null) ||
          null;

        const paymentIntentId = paymentObj.payment_intent_id as
          | string
          | undefined;

        if (!orderPsp && paymentIntentId?.startsWith("adyen_session")) {
          orderPsp = "adyen";
        }

        if (orderPsp) {
          setPspUsed(orderPsp);
        }

        setIsPaymentStep(true);
      }

      // Ask gateway to initiate payment. We will only show a "success" state
      // if payment has either been redirected to PSP or clearly marked as
      // succeeded/processing.
      let paymentRes: SubmitPaymentResponse | null = null;
      try {
        const returnUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/account/orders`
            : undefined;

        const amountToCharge =
          existingTotalMinor != null ? existingTotalMinor : subtotal;

        paymentRes = await submitPaymentForOrder({
          orderId: currentOrderId as string,
          amount: amountToCharge,
          currency,
          paymentMethodHint: "card",
          returnUrl,
        });
      } catch (paymentErr) {
        console.error("submit_payment error", paymentErr);
        setPaymentStatus("payment_pending");
        setError(
          "We created your order, but couldn’t start the payment flow. Please check your Orders page or try again.",
        );
        setStep("error");
        return;
      }

      const statusFromGateway =
        paymentRes.payment_status || paymentRes.payment?.payment_status;
      const action =
        paymentRes.payment_action || paymentRes.payment?.payment_action;
      const redirectUrl =
        action?.url ||
        paymentRes.redirect_url ||
        paymentRes.payment?.redirect_url ||
        (paymentRes as any)?.next_action?.redirect_url;

      setPaymentStatus(statusFromGateway);

      const pspFromGateway =
        (paymentRes as any).psp_used ||
        (paymentRes as any).psp ||
        paymentRes.payment?.psp ||
        null;
      if (pspFromGateway) {
        setPspUsed(pspFromGateway);
      }

      // Case 1: Adyen session – mount drop-in UI like Shopping Agent.
      if (action?.type === "adyen_session") {
        const sessionData = action?.client_secret;
        let sessionId =
          (action as any)?.raw?.id ||
          (paymentRes as any)?.payment_intent_id ||
          paymentRes.payment?.payment_intent_id ||
          "";

        if (sessionId && sessionId.startsWith("adyen_session_")) {
          sessionId = sessionId.replace("adyen_session_", "");
        }

        const clientKey =
          (action as any)?.raw?.clientKey ||
          process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY ||
          "";

        if (!sessionData || !clientKey) {
          setError(
            "Payment provider is missing configuration. Please contact support or try again later.",
          );
          setStep("error");
          return;
        }

        try {
          const { default: AdyenCheckout } = await import("@adyen/adyen-web");
          // Clear any previous drop-in so a new Adyen session can be mounted
          // when the user retries payment after a refusal.
          if (adyenContainerRef.current) {
            adyenContainerRef.current.innerHTML = "";
          }
          const checkout = await AdyenCheckout({
            clientKey,
            environment:
              process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT || "test",
            session: {
              id: sessionId,
              sessionData,
            },
            analytics: { enabled: false },
            onPaymentCompleted: (result: any) => {
              const code = result?.resultCode || result?.sessionResult;
              if (
                code === "Authorised" ||
                code === "Pending" ||
                code === "Received"
              ) {
                clear();
                setPaymentStatus("succeeded");
                setStep("success");
              } else {
                // Payment was created but not authorised. Keep the order and
                // allow the user to try again.
                setPaymentStatus(code || "payment_refused");
                setError(
                  "Your card was declined or the payment was not completed. You can try again with a different card.",
                );
                setStep("error");
              }
            },
            onError: (err: any) => {
              // eslint-disable-next-line no-console
              console.error("Adyen error:", err);
              setError(
                "Payment failed with Adyen. Please check your card details or try again.",
              );
              setStep("error");
            },
          });

          if (adyenContainerRef.current) {
            checkout.create("dropin").mount(adyenContainerRef.current);
            setAdyenMounted(true);
            setError(null);
            setStep("form");
            return;
          }

          setError(
            "Payment form is not ready. Please refresh the page and try again.",
          );
          setStep("error");
          return;
        } catch (adyenErr) {
          // eslint-disable-next-line no-console
          console.error("Adyen init failed:", adyenErr);
          setError(
            "We couldn’t start the card payment form. Please try again in a moment.",
          );
          setStep("error");
          return;
        }
      }

      // Case 1: gateway asks us to redirect to a hosted payment page.
      if (action?.type === "redirect_url" && redirectUrl) {
        if (typeof window !== "undefined") {
          clear();
          window.location.href = redirectUrl;
          return;
        }
      }

      // Case 2: Stripe-style client_secret flow – use Stripe.js CardElement.
      const clientSecret =
        action?.client_secret ||
        (paymentRes as any).client_secret ||
        paymentRes.payment?.client_secret;

      const isStripePsp = !pspUsed || pspUsed === "stripe";

      if (clientSecret && stripe && elements && hasStripe && isStripePsp) {
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) {
          setError("Please enter your card details to pay.");
          setStep("error");
          return;
        }

        setCardError(null);
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        });

        if (result.error) {
          setCardError(result.error.message || "Payment failed");
          setError(
            "Payment failed. Please check your card details or try again.",
          );
          setStep("error");
          return;
        }

        const intentStatus = result.paymentIntent?.status;
        if (intentStatus === "succeeded" || intentStatus === "processing") {
          clear();
          setPaymentStatus(intentStatus);
          setStep("success");
          return;
        }

        if (intentStatus === "requires_action") {
          setError(
            "Additional authentication is required. Please complete the 3D Secure flow if prompted.",
          );
          setStep("error");
          return;
        }

        setError(
          "Payment could not be completed. Please try again or use a different card.",
        );
        setStep("error");
        return;
      }

      // Case 3: payment already succeeded / is processing (e.g. 0-amount or
      // off-session). Treat as successful.
      const normalizedStatus = (statusFromGateway || "").toLowerCase();
      const isPaid =
        normalizedStatus === "succeeded" ||
        normalizedStatus === "paid" ||
        normalizedStatus === "completed" ||
        normalizedStatus === "processing";

      if (isPaid) {
        clear();
        setStep("success");
        return;
      }

      // Otherwise we don't claim full success: mark as pending and let the
      // user check their Orders page / email.
      setError(
        "Your order was created, but the payment is not completed yet. Please check your email or Orders page for the latest status.",
      );
      setStep("error");
    } catch (err) {
      console.error(err);
      setError(
        "We couldn’t place the order right now. Please try again in a moment.",
      );
      setStep("error");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 lg:px-10">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-slate-900 sm:text-lg">Checkout</h1>
            <p className="text-xs text-slate-600 sm:text-sm">
              Review your cart and enter your shipping details to place the order.
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

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Left: cart / existing order summary */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Order summary</h2>
            {existingOrderId ? (
              <div className="mt-3 flex-1 space-y-3 text-sm text-slate-600">
                <p>
                  You’re completing payment for an existing order. We’ll apply the payment to:
                </p>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-medium text-slate-900">
                    Order {existingOrderId}
                  </p>
                  {existingItemsSummary && (
                    <p className="mt-1 text-[11px] text-slate-600">
                      {existingItemsSummary}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-slate-500">
                    Total:{" "}
                    <span className="font-semibold text-slate-900">
                      {currency}{" "}
                      {existingTotalMinor != null
                        ? (existingTotalMinor / 100).toFixed(2)
                        : (subtotal || 0).toFixed(2)}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
                  {(step === "success" ? placedItems : items)?.length === 0 ||
                  !(step === "success" ? placedItems : items) ? (
                    <p className="text-sm text-slate-500">
                      Your cart is empty. Go back to the creator agent to pick a few items.
                    </p>
                  ) : (
                    (step === "success" ? placedItems! : items).map((item) => (
                      <div
                        key={item.id}
                        className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3"
                      >
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.title}
                            className="h-16 w-16 rounded-xl object-cover"
                          />
                        )}
                        <div className="flex flex-1 flex-col">
                          <p className="line-clamp-2 text-xs font-medium text-slate-900">
                            {item.title}
                          </p>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                            <span>
                              {currency} {item.price.toFixed(2)} × {item.quantity}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {currency} {(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-semibold text-slate-900">
                      {currency}{" "}
                      {(step === "success" && placedSubtotal != null
                        ? placedSubtotal
                        : subtotal
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Right: shipping + contact form */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            {step === "success" ? (
              <div className="flex flex-1 flex-col items-start justify-center">
                <h2 className="text-sm font-semibold text-slate-900">Order placed</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Thank you for your order. We’ll send a confirmation email shortly.
                </p>
                {orderId && (
                  <p className="mt-2 text-xs text-slate-500">Order ID: {orderId}</p>
                )}
                {paymentStatus && (
                  <p className="mt-1 text-xs text-slate-500">
                    Payment status: {paymentStatus === "payment_pending"
                      ? "pending — you may need to complete payment from the link we sent."
                      : paymentStatus}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/creator/nina-studio")}
                  className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  Continue shopping with Nina Studio
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col space-y-3 text-xs sm:text-sm">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Contact & shipping</h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Verify your email so we can send order updates and let you track your orders later.
                  </p>
                  {hasPrefilledAddress && !existingOrderId && (
                    <p className="mt-0.5 text-[11px] text-emerald-600">
                      We pre-filled your shipping details from your last paid order. You can edit anything that changed.
                    </p>
                  )}
                </div>

                {/* Inline email login / OTP */}
                <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  {authStep === "checking" && (
                    <p className="text-[11px] text-slate-500">Checking your sign-in status…</p>
                  )}
                  {authStep === "email" && (
                    <>
                      <label className="text-[11px] font-medium text-slate-700">
                        Email
                        <input
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={authLoading}
                        onClick={handleSendCode}
                        className="w-full rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {authLoading ? "Sending code…" : "Send verification code"}
                      </button>
                    </>
                  )}
                  {authStep === "otp" && (
                    <>
                      <p className="text-[11px] text-slate-500">
                        We’ve sent a 6-digit code to <span className="font-medium">{loginEmail}</span>.
                        Enter it below to continue.
                      </p>
                      <label className="text-[11px] font-medium text-slate-700">
                        Verification code
                        <input
                          required
                          value={otp}
                          onChange={(e) => setOtp(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={handleVerifyCode}
                          className="flex-1 rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {authLoading ? "Signing in…" : "Verify and continue"}
                        </button>
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={() => {
                            setOtp("");
                            setAuthError(null);
                            setAuthStep("email");
                          }}
                          className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Use a different email
                        </button>
                      </div>
                    </>
                  )}
                  {authStep === "authed" && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                      <div className="text-[11px]">
                        <p className="font-medium text-slate-900">Signed in</p>
                        <p className="text-slate-600">
                          {displayEmail
                            ? `Signed in as ${displayEmail}`
                            : "Signed in with your Pivota account."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Verified
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtp("");
                            setAuthError(null);
                            setAuthStep("email");
                          }}
                          className="text-[10px] text-slate-500 hover:text-slate-700"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  )}
                  {authError && (
                    <p className="text-[11px] text-rose-500">
                      {authError}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-[11px] font-medium text-slate-700">
                    Full name
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Address line 1
                    <input
                      required
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Address line 2 (optional)
                    <input
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      City
                      <input
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Country / Region
                      <input
                        required
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Postal code
                      <input
                        required
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Phone (optional)
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                  </div>
                  <label className="text-[11px] font-medium text-slate-700">
                    Notes for the creator / merchant (optional)
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                </div>

                {hasStripe && isPaymentStep && (!pspUsed || pspUsed === "stripe") && (
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Card details
                      <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <CardElement
                          options={{
                            style: {
                              base: {
                                fontSize: "13px",
                                color: "#020617",
                                "::placeholder": { color: "#94a3b8" },
                              },
                            },
                          }}
                        />
                      </div>
                    </label>
                    {cardError && (
                      <p className="text-[11px] text-rose-500">
                        {cardError}
                      </p>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-[11px] text-rose-500">
                    {error}
                  </p>
                )}

                {(() => {
                  let ctaLabel = "Continue to payment";

                  if (step === "submitting") {
                    ctaLabel = isPaymentStep ? "Processing payment…" : "Preparing payment…";
                  } else if (isPaymentStep) {
                    const lowerStatus = (paymentStatus || "").toLowerCase();
                    if (
                      lowerStatus === "payment_refused" ||
                      lowerStatus === "refused" ||
                      lowerStatus === "failed"
                    ) {
                      ctaLabel = "Try another card";
                    } else {
                      ctaLabel = "Place order";
                    }
                  }

                  return (
                    <button
                      type="submit"
                      disabled={step === "submitting"}
                      className="mt-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {ctaLabel}
                    </button>
                  );
                })()}

                {/* Container for Adyen drop-in when needed */}
                <div
                  ref={adyenContainerRef}
                  className="mt-3"
                />
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
