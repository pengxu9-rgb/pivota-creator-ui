'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCart } from "@/components/cart/CartProvider";
import {
  AgentGatewayError,
  createOrderWithQuote,
  isRetryableQuoteError,
  parseAgentGatewayError,
  previewQuoteFromCart,
  submitPaymentForOrder,
  type SubmitPaymentResponse,
  type CheckoutOrderResponse,
  type QuotePreviewResponse,
} from "@/lib/checkoutClient";
import {
  accountsLogin,
  accountsLoginWithPassword,
  accountsVerify,
  accountsMe,
  getLatestPaidOrderShippingAddress,
  type AccountsUser,
} from "@/lib/accountsClient";
import {
  loadSavedShippingAddress,
  saveShippingAddress,
  hasNonEmptyAddress,
} from "@/lib/addressStorage";
import { normalizeCountryCode, SHIPPING_COUNTRY_GROUPS } from "@/lib/shippingCountries";
import "@adyen/adyen-web/dist/adyen.css";

type CheckoutStep = "form" | "submitting" | "success" | "error";
type AuthStep = "checking" | "email" | "otp" | "authed";
type AuthMethod = "otp" | "password";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
const stripeConfigured = Boolean(publishableKey);
const stripePromise = stripeConfigured ? loadStripe(publishableKey) : null;

export default function CheckoutPage() {
  if (!stripeConfigured) {
    return <CheckoutInner stripeConfigured={false} stripeReady={false} stripe={null} elements={null} />;
  }

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
      stripeConfigured={stripeConfigured}
      stripeReady={!!stripe}
      stripe={stripe}
      elements={elements}
    />
  );
}

type CheckoutInnerProps = {
  stripeConfigured: boolean;
  stripeReady: boolean;
  stripe: any;
  elements: any;
};

function CheckoutInner({ stripeConfigured, stripeReady, stripe, elements }: CheckoutInnerProps) {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();
  const [step, setStep] = useState<CheckoutStep>("form");
  const [error, setError] = useState<string | null>(null);

  // Keep a snapshot of the cart at the moment the order is placed so that
  // the success view can still show what was ordered even after the live cart
  // has been cleared.
  const [placedItems, setPlacedItems] = useState<typeof items | null>(null);
  const [placedSubtotal, setPlacedSubtotal] = useState<number | null>(null);
  const [placedTotal, setPlacedTotal] = useState<number | null>(null);
  const [placedDiscount, setPlacedDiscount] = useState<number | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [country, setCountry] = useState("US");
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
  const [existingOrderParamsLoaded, setExistingOrderParamsLoaded] = useState(false);
  const [hasPrefilledAddress, setHasPrefilledAddress] = useState(false);

  // Auth state for inline email login
  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("otp");
  const [loginEmail, setLoginEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [accountsUser, setAccountsUser] = useState<AccountsUser | null>(null);

  // Adyen drop-in state
  const adyenContainerRef = useRef<HTMLDivElement | null>(null);
  const [adyenMounted, setAdyenMounted] = useState(false);
  const [pspUsed, setPspUsed] = useState<string | null>(null);
  const [isPaymentStep, setIsPaymentStep] = useState(false);

  const [discountCode, setDiscountCode] = useState("");
  const discountCodes = useMemo(
    () => (discountCode.trim() ? [discountCode.trim()] : []),
    [discountCode],
  );

  const [quote, setQuote] = useState<QuotePreviewResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Locked pricing/promotion lines captured from order.create response (source of truth for payment step).
  const [lockedPricing, setLockedPricing] = useState<CheckoutOrderResponse["pricing"] | null>(null);
  const [lockedPromotionLines, setLockedPromotionLines] = useState<any[]>([]);
  const [lockedLineItems, setLockedLineItems] = useState<any[]>([]);
  const [lockedQuoteMeta, setLockedQuoteMeta] = useState<any>(null);
  const [lockedCurrency, setLockedCurrency] = useState<string | null>(null);

  // Prefetch submit_payment once we enter the payment step so the "Place order"
  // click can focus on Stripe confirmCardPayment (faster perceived checkout).
  const paymentInitPromiseRef = useRef<Promise<SubmitPaymentResponse> | null>(null);
  const paymentInitKeyRef = useRef<string | null>(null);
  const [paymentInitLoading, setPaymentInitLoading] = useState(false);
  const [paymentInitError, setPaymentInitError] = useState<string | null>(null);
  const [prefetchedPaymentRes, setPrefetchedPaymentRes] = useState<SubmitPaymentResponse | null>(null);
  const prefillAttemptedRef = useRef(false);

  const existingPricing =
    existingOrderId && existingTotalMinor != null
      ? {
          subtotal: existingTotalMinor / 100,
          discount_total: 0,
          shipping_fee: 0,
          tax: 0,
          total: existingTotalMinor / 100,
        }
      : null;

  const activePricing =
    step === "success"
      ? lockedPricing
      : isPaymentStep
        ? lockedPricing || existingPricing || quote?.pricing
        : quote?.pricing;
  const activePromotionLines =
    step === "success"
      ? lockedPromotionLines
      : isPaymentStep
        ? lockedPromotionLines
        : quote?.promotion_lines || [];
  const activeExpiresAt =
    step === "success"
      ? lockedQuoteMeta?.expires_at
      : isPaymentStep
        ? lockedQuoteMeta?.expires_at
        : quote?.expires_at;

  const currency =
    existingCurrency ||
    lockedCurrency ||
    (lockedQuoteMeta as any)?.charge_currency ||
    (lockedQuoteMeta as any)?.presentment_currency ||
    lockedQuoteMeta?.currency ||
    (quote as any)?.charge_currency ||
    (quote as any)?.presentment_currency ||
    quote?.currency ||
    items[0]?.currency ||
    placedItems?.[0]?.currency ||
    "USD";

  const estimateCurrency = items[0]?.currency || placedItems?.[0]?.currency || lockedCurrency || "USD";

  const toNumber = (v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const normalizeCurrencyCode = (v: any) => {
    const s = typeof v === "string" ? v : v != null ? String(v) : "";
    const cur = s.trim().toUpperCase();
    return cur || null;
  };

  const amountToCharge = useMemo(() => {
    if (existingTotalMinor != null) return existingTotalMinor / 100;
    if (lockedPricing && (lockedPricing as any).total != null) {
      return toNumber((lockedPricing as any).total);
    }
    if (placedTotal != null) return placedTotal;
    return subtotal;
  }, [existingTotalMinor, lockedPricing, placedTotal, subtotal]);

  const orderIdForPayment = existingOrderId || orderId || null;
  const paymentInitKey = useMemo(() => {
    if (!orderIdForPayment) return null;
    const cur = normalizeCurrencyCode(currency);
    const amountMinor = Number.isFinite(amountToCharge) ? Math.round(amountToCharge * 100) : null;
    if (!cur || amountMinor == null) return null;
    return `${orderIdForPayment}:${cur}:${amountMinor}`;
  }, [orderIdForPayment, currency, amountToCharge]);

  useEffect(() => {
    if (!isPaymentStep) return;
    if (!paymentInitKey) return;
    if (!orderIdForPayment) return;

    // For new orders, wait until we have server-side locked totals so we don't
    // accidentally create a payment intent with a stale amount.
    if (!existingOrderId) {
      if (!lockedPricing || (lockedPricing as any).total == null) return;
    }

    // Avoid duplicating submit_payment calls for the same order/amount/currency.
    if (paymentInitKeyRef.current === paymentInitKey && paymentInitPromiseRef.current) return;
    if (prefetchedPaymentRes && paymentInitKeyRef.current === paymentInitKey) return;

    setPaymentInitLoading(true);
    setPaymentInitError(null);
    setPrefetchedPaymentRes(null);
    // Pre-warm Adyen SDK so session mount is faster when backend selects Adyen.
    void import("@adyen/adyen-web").catch(() => null);

    const returnUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/account/orders`
        : undefined;

    const promise = submitPaymentForOrder({
      orderId: orderIdForPayment,
      amount: amountToCharge,
      currency,
      paymentMethodHint: "card",
      returnUrl,
    });

    paymentInitKeyRef.current = paymentInitKey;
    paymentInitPromiseRef.current = promise;

    promise
      .then((res) => {
        setPrefetchedPaymentRes(res);
        const prefetchedAction = res?.payment_action || res?.payment?.payment_action;
        const prefetchedPsp =
          (res as any)?.psp_used ||
          (res as any)?.psp ||
          res?.payment?.psp ||
          (typeof prefetchedAction?.type === "string" && prefetchedAction.type === "adyen_session"
            ? "adyen"
            : null);
        if (prefetchedPsp) {
          setPspUsed(String(prefetchedPsp));
        }
      })
      .catch((err) => {
        console.error("prefetch submit_payment error", err);
        const msg = err instanceof Error ? err.message : String(err);
        setPaymentInitError(msg || "Failed to prepare payment");
      })
      .finally(() => {
        setPaymentInitLoading(false);
      });
  }, [
    isPaymentStep,
    paymentInitKey,
    orderIdForPayment,
    existingOrderId,
    amountToCharge,
    currency,
    prefetchedPaymentRes,
    lockedPricing,
  ]);

  useEffect(() => {
    if (isPaymentStep) return;
    paymentInitPromiseRef.current = null;
    paymentInitKeyRef.current = null;
    setPaymentInitLoading(false);
    setPaymentInitError(null);
    setPrefetchedPaymentRes(null);
    setAdyenMounted(false);
    if (adyenContainerRef.current) {
      adyenContainerRef.current.innerHTML = "";
    }
  }, [isPaymentStep]);

  useEffect(() => {
    if (!isPaymentStep) return;
    if (step !== "form") return;
    if (!prefetchedPaymentRes || adyenMounted) return;

    const action =
      prefetchedPaymentRes.payment_action ||
      prefetchedPaymentRes.payment?.payment_action;
    if (action?.type !== "adyen_session") return;
    if (!adyenContainerRef.current) return;

    const sessionData = action?.client_secret;
    let sessionId =
      (action as any)?.raw?.id ||
      (prefetchedPaymentRes as any)?.payment_intent_id ||
      prefetchedPaymentRes.payment?.payment_intent_id ||
      "";
    if (sessionId && sessionId.startsWith("adyen_session_")) {
      sessionId = sessionId.replace("adyen_session_", "");
    }

    const clientKey =
      (action as any)?.raw?.clientKey ||
      process.env.NEXT_PUBLIC_ADYEN_CLIENT_KEY ||
      "";
    if (!sessionData || !clientKey) {
      setPaymentInitError("Payment provider is missing configuration.");
      return;
    }

    let cancelled = false;
    setPspUsed("adyen");
    (async () => {
      try {
        const { default: AdyenCheckout } = await import("@adyen/adyen-web");
        if (cancelled || !adyenContainerRef.current) return;
        const checkout = await AdyenCheckout({
          clientKey,
          environment: process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT || "test",
          session: {
            id: sessionId,
            sessionData,
          },
          analytics: { enabled: false },
          onPaymentCompleted: (result: any) => {
            const code = result?.resultCode || result?.sessionResult;
            if (code === "Authorised" || code === "Pending" || code === "Received") {
              clear();
              setPaymentStatus("succeeded");
              setStep("success");
            } else {
              setPaymentStatus(code || "payment_refused");
              setError(
                "Your card was declined or the payment was not completed. You can try again with a different card.",
              );
              setStep("error");
            }
          },
          onError: (err: any) => {
            console.error("Adyen error:", err);
            setError(
              "Payment failed with Adyen. Please check your card details or try again.",
            );
            setStep("error");
          },
        });
        if (cancelled || !adyenContainerRef.current) return;
        adyenContainerRef.current.innerHTML = "";
        checkout.create("dropin").mount(adyenContainerRef.current);
        setAdyenMounted(true);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        console.error("Adyen pre-mount failed:", err);
        setPaymentInitError(
          err?.message || "We couldn’t start the card payment form. Please try again in a moment.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adyenMounted, clear, isPaymentStep, prefetchedPaymentRes, step]);

  const promotionDiscountFromLines = (lines: any[]) =>
    lines.reduce((sum, pl) => sum + Math.abs(toNumber(pl?.amount)), 0);

  const activeLineItemByVariantId = useMemo(() => {
    const activeLineItems =
      step === "success" || isPaymentStep
        ? (lockedLineItems.length ? lockedLineItems : quote?.line_items || [])
        : quote?.line_items || [];
    const m = new Map<string, any>();
    for (const li of (activeLineItems || []) as any[]) {
      const vid = li?.variant_id;
      if (vid != null) m.set(String(vid), li);
    }
    return m;
  }, [isPaymentStep, lockedLineItems, quote, step]);

  const effectivePromotionDiscount = promotionDiscountFromLines(activePromotionLines);
  const hasLockedQuote = Boolean(quote && quote?.pricing && !quoteLoading && !quoteError);

  const derivedLineItemsSubtotal = useMemo(() => {
    const list = (step === "success" ? placedItems : items) || [];
    let sum = 0;
    for (const item of list as any[]) {
      const estimatedUnitPrice =
        typeof item?.price === "number" && !Number.isNaN(item.price) ? item.price : 0;
      const variantKey =
        item?.variantId != null
          ? String(item.variantId)
          : item?.variant_id != null
            ? String(item.variant_id)
            : null;
      const pricingLine = variantKey ? activeLineItemByVariantId.get(variantKey) : null;
      const lockedUnitPriceRaw =
        pricingLine?.unit_price_effective ??
        pricingLine?.unit_price_original ??
        pricingLine?.unit_price ??
        pricingLine?.price ??
        null;
      const lockedUnitPrice = lockedUnitPriceRaw != null ? toNumber(lockedUnitPriceRaw) : null;
      const usingLockedUnit =
        !existingOrderId &&
        lockedUnitPrice != null &&
        lockedUnitPrice > 0 &&
        (hasLockedQuote || isPaymentStep || step === "success");
      const unitPrice = usingLockedUnit ? lockedUnitPrice : estimatedUnitPrice;
      const qty = Number.isFinite(item?.quantity) ? Number(item.quantity) : Number(item?.quantity || 0);
      if (unitPrice > 0 && qty > 0) {
        sum += unitPrice * qty;
      }
    }
    return Number.isFinite(sum) ? sum : 0;
  }, [
    activeLineItemByVariantId,
    existingOrderId,
    hasLockedQuote,
    isPaymentStep,
    items,
    placedItems,
    step,
  ]);

  const pricingSubtotal = activePricing ? toNumber((activePricing as any).subtotal) : subtotal;
  const effectiveSubtotal =
    pricingSubtotal > 0 ? pricingSubtotal : derivedLineItemsSubtotal > 0 ? derivedLineItemsSubtotal : subtotal;
  const effectiveShippingFee = activePricing ? toNumber((activePricing as any).shipping_fee) : 0;
  const effectiveTax = activePricing ? toNumber((activePricing as any).tax) : 0;
  const pricingTotal = activePricing ? toNumber((activePricing as any).total) : subtotal;
  const computedTotal =
    effectiveSubtotal - effectivePromotionDiscount + effectiveShippingFee + effectiveTax;
  const effectiveTotal =
    pricingTotal > 0 ? pricingTotal : computedTotal > 0 ? computedTotal : effectiveSubtotal;

  const displayPromotionLines = (activePromotionLines || []).filter((pl: any) => {
    const label = String(pl?.label || "");
    const reason = pl?.metadata?.reason;
    return label !== "Rounding adjustment" && reason !== "rounding_adjustment";
  });

  // Prefer the email coming from the accounts service, then fall back to any
  // local email the user has typed during this checkout session.
  const displayEmail =
    (accountsUser && accountsUser.email) || email || loginEmail || "";

  const cartSubtotalEstimate = subtotal;
  const currenciesMatch = estimateCurrency === currency;
  const subtotalDelta = hasLockedQuote && currenciesMatch ? effectiveSubtotal - cartSubtotalEstimate : 0;
  const showCurrencySwitchNote =
    !existingOrderId && !isPaymentStep && hasLockedQuote && !currenciesMatch;
  const showSubtotalDeltaNote =
    !existingOrderId && !isPaymentStep && hasLockedQuote && currenciesMatch && Math.abs(subtotalDelta) >= 0.01;

  useEffect(() => {
    const normalized = normalizeCountryCode(country);
    if (normalized && normalized !== country) {
      setCountry(normalized);
    }
  }, [country]);

  useEffect(() => {
    if (!existingOrderParamsLoaded) return;
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
  }, [existingOrderParamsLoaded]);

  useEffect(() => {
    if (!existingOrderParamsLoaded) return;
    if (!accountsUser) return;
    if (existingOrderId) return;
    if (prefillAttemptedRef.current) return;
    if (hasPrefilledAddress) {
      prefillAttemptedRef.current = true;
      return;
    }

    const userStartedTyping = Boolean(name || addressLine1 || city || province || postalCode);
    const countryLooksUntouched = !country || country === "US";
    if (userStartedTyping || !countryLooksUntouched) {
      prefillAttemptedRef.current = true;
      return;
    }

    let cancelled = false;
    prefillAttemptedRef.current = true;
    (async () => {
      try {
        let addr = loadSavedShippingAddress();
        if (!hasNonEmptyAddress(addr)) {
          addr = await getLatestPaidOrderShippingAddress();
        }
        if (cancelled) return;
        if (!addr) return;

        setName(addr.name || "");
        setAddressLine1(addr.address_line1 || "");
        setAddressLine2(addr.address_line2 || "");
        setCity(addr.city || "");
        setProvince(addr.province || "");
        setCountry(normalizeCountryCode(addr.country) || "US");
        setPostalCode(addr.postal_code || "");
        setPhone(addr.phone || "");
        setHasPrefilledAddress(true);
      } catch (addrErr) {
        console.error(addrErr);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountsUser,
    existingOrderId,
    existingOrderParamsLoaded,
    hasPrefilledAddress,
    name,
    addressLine1,
    city,
    province,
    country,
    postalCode,
  ]);

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
    } finally {
      setExistingOrderParamsLoaded(true);
    }
  }, []);

  // Quote-first: generate a locked quote for checkout display.
  useEffect(() => {
    let cancelled = false;
    if (existingOrderId || isPaymentStep || step === "success") {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    if (!items.length) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    const normalizedCountry = normalizeCountryCode(country);

    // Quote preview needs checkout-critical fields; if missing, don't call pricing.
    const hasRequired =
      displayEmail.trim() && name && addressLine1 && city && normalizedCountry && postalCode;
    if (!hasRequired) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    const t = setTimeout(() => {
      (async () => {
        setQuoteLoading(true);
        setQuoteError(null);
        try {
          const nextQuote = await previewQuoteFromCart({
            items,
            discountCodes,
            email: displayEmail.trim(),
            name,
            addressLine1,
            addressLine2: addressLine2 || undefined,
            city,
            province: province || undefined,
            country: normalizedCountry!,
            postalCode,
            phone: phone || undefined,
          });
          if (cancelled) return;
          setQuote(nextQuote);
        } catch (err: any) {
          if (cancelled) return;
          setQuote(null);
          if (err instanceof AgentGatewayError) {
            const { code, message: msg, debugId } = parseAgentGatewayError(err);
            const suffix = debugId ? ` (debug_id: ${debugId})` : "";
            setQuoteError(code ? `${code}: ${msg}${suffix}` : `${msg}${suffix}`);
          } else {
            setQuoteError(err?.message || "Failed to preview quote");
          }
        } finally {
          if (!cancelled) setQuoteLoading(false);
        }
      })();
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
	  }, [
	    items,
	    existingOrderId,
	    isPaymentStep,
	    step,
	    displayEmail,
	    name,
	    addressLine1,
	    addressLine2,
	    city,
	    province,
	    country,
	    postalCode,
	    phone,
	    discountCodes,
	  ]);

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

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setAuthError("Please enter your email and password.");
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      const data = await accountsLoginWithPassword(loginEmail, loginPassword);
      const user = (data as any)?.user || data;
      setAccountsUser(user as AccountsUser);
      setEmail(loginEmail);
      setAuthStep("authed");
    } catch (err: any) {
      const code = err?.code;
      if (code === "NO_PASSWORD") {
        setAuthError("No password is set for this account. Use email code once, then set a password.");
        setAuthMethod("otp");
      } else if (code === "INVALID_CREDENTIALS") {
        setAuthError("Email or password is incorrect.");
      } else {
        console.error(err);
        setAuthError("We couldn’t sign you in. Please try again.");
      }
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
	    const normalizedCountry = normalizeCountryCode(country);

	    // Ensure we have some email to attach to the order.
	    if (!effectiveEmail) {
	      setError("Please enter a valid email before placing the order.");
	      return;
	    }
	    if (!name || !addressLine1 || !city || !normalizedCountry || !postalCode) {
	      setError("Please fill in all required fields.");
	      return;
	    }

    try {
      setError(null);

	      // Update the saved default shipping address for future checkouts.
	      saveShippingAddress({
	        name,
	        address_line1: addressLine1,
	        address_line2: addressLine2 || "",
	        city,
	        province: province || "",
	        country: normalizedCountry,
	        postal_code: postalCode,
	        phone: phone || "",
	      });

      // Step 1: ensure we have an order id. For new orders, the first click
      // only creates the order and prepares the payment step so that Stripe
      // Elements / Adyen Drop-in can mount properly before we confirm.
      let currentOrderId: string | undefined =
        orderId || existingOrderId || undefined;

      if (!isPaymentStep) {
        setStep("submitting");

        if (!currentOrderId) {
          // New order path: create the order first.
          setPlacedItems(items);
          setPlacedSubtotal(null);
          setPlacedTotal(null);
          setPlacedDiscount(null);

          // Ensure we have a locked quote for strong price consistency.
          let quoteToUse = quote;
          if (!quoteToUse) {
	            quoteToUse = await previewQuoteFromCart({
	              items,
	              discountCodes,
	              email: effectiveEmail,
	              name,
	              addressLine1,
	              addressLine2: addressLine2 || undefined,
	              city,
	              province: province || undefined,
	              country: normalizedCountry,
	              postalCode,
	              phone: phone || undefined,
	            });
            setQuote(quoteToUse);
          }

          let orderRes: CheckoutOrderResponse;
          try {
	            orderRes = await createOrderWithQuote({
	              quoteId: quoteToUse.quote_id,
	              items,
	              discountCodes,
	              email: effectiveEmail,
	              name,
	              addressLine1,
	              addressLine2: addressLine2 || undefined,
	              city,
	              province: province || undefined,
	              country: normalizedCountry,
	              postalCode,
	              phone: phone || undefined,
	              notes: notes || undefined,
	            });
          } catch (err) {
            const { code } = parseAgentGatewayError(err);
            if (isRetryableQuoteError(code)) {
              // Auto refresh quote (expired/mismatch) and retry order create once.
	              const refreshedQuote = await previewQuoteFromCart({
	                items,
	                discountCodes,
	                email: effectiveEmail,
	                name,
	                addressLine1,
	                addressLine2: addressLine2 || undefined,
	                city,
	                province: province || undefined,
	                country: normalizedCountry,
	                postalCode,
	                phone: phone || undefined,
	              });
              setQuote(refreshedQuote);

	              orderRes = await createOrderWithQuote({
	                quoteId: refreshedQuote.quote_id,
	                items,
	                discountCodes,
	                email: effectiveEmail,
	                name,
	                addressLine1,
	                addressLine2: addressLine2 || undefined,
	                city,
	                province: province || undefined,
	                country: normalizedCountry,
	                postalCode,
	                phone: phone || undefined,
	                notes: notes || undefined,
	              });
            } else {
              throw err;
            }
          }

          const createdOrderId =
            (orderRes as CheckoutOrderResponse).order_id ||
            (orderRes as any).id;

          if (!createdOrderId) {
            throw new Error("Order was created but no order ID was returned.");
          }

          setOrderId(createdOrderId);
          currentOrderId = createdOrderId;

          // Try to infer PSP and any server-side discounted total from the
          // initial order response so that checkout can display the actual
          // charged amount (including promotions).
          const anyOrder = orderRes as any;
          const paymentObj = (anyOrder.payment || {}) as any;
          const initialOrderAction =
            (anyOrder.payment_action as any) || (paymentObj.payment_action as any) || null;

          if (initialOrderAction?.type === "redirect_url") {
            const initialRedirectUrl =
              initialOrderAction?.url ||
              (typeof initialOrderAction?.client_secret === "string"
                ? initialOrderAction.client_secret
                : null);

            if (initialRedirectUrl && typeof window !== "undefined") {
              window.location.href = initialRedirectUrl;
              return;
            }
          }

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

          const respPricing = anyOrder.pricing || null;
          const respPromotionLines = Array.isArray(anyOrder.promotion_lines)
            ? anyOrder.promotion_lines
            : [];
          const respLineItems = Array.isArray(anyOrder.line_items)
            ? anyOrder.line_items
            : [];
          const respQuoteMeta = anyOrder.quote || null;
          const fallbackQuoteLineItems = Array.isArray(quoteToUse?.line_items)
            ? (quoteToUse as any).line_items
            : [];
          const respCurrency =
            normalizeCurrencyCode(anyOrder.charge_currency) ||
            normalizeCurrencyCode(anyOrder.presentment_currency) ||
            normalizeCurrencyCode(anyOrder.currency) ||
            normalizeCurrencyCode(respQuoteMeta?.charge_currency) ||
            normalizeCurrencyCode(respQuoteMeta?.presentment_currency) ||
            normalizeCurrencyCode(respQuoteMeta?.currency) ||
            normalizeCurrencyCode((quoteToUse as any)?.presentment_currency) ||
            normalizeCurrencyCode(quoteToUse.currency) ||
            normalizeCurrencyCode(items[0]?.currency);

          setLockedPricing(respPricing);
          setLockedPromotionLines(respPromotionLines);
          setLockedLineItems(respLineItems.length ? respLineItems : fallbackQuoteLineItems);
          setLockedQuoteMeta(respQuoteMeta || quoteToUse || null);
          setLockedCurrency(respCurrency);

          // Use pricing/promotion_lines (not subtotal-total guessing).
          const totalFromPricing =
            respPricing && respPricing.total != null ? toNumber(respPricing.total) : null;
          const subtotalFromPricing =
            respPricing && respPricing.subtotal != null ? toNumber(respPricing.subtotal) : null;
          const discountFromLines = promotionDiscountFromLines(respPromotionLines);

          setPlacedSubtotal(subtotalFromPricing != null ? subtotalFromPricing : subtotal);
          setPlacedTotal(totalFromPricing != null ? totalFromPricing : subtotal);
          setPlacedDiscount(discountFromLines > 0 ? discountFromLines : null);
        } else {
          // Existing order (continue payment from Orders page): we only
          // prepare the payment step so that card elements can mount.
          setPlacedItems(items.length ? items : placedItems);
          setPlacedSubtotal(
            existingTotalMinor != null
              ? existingTotalMinor / 100
              : placedSubtotal ?? subtotal,
          );
          setPlacedTotal(
            existingTotalMinor != null
              ? existingTotalMinor / 100
              : placedTotal ?? placedSubtotal ?? subtotal,
          );
          setPlacedDiscount(null);
          if (existingCurrency) {
            setLockedCurrency(normalizeCurrencyCode(existingCurrency));
          }
        }

        // Enter payment step and return; the next click will actually trigger
        // submit_payment + Stripe/Adyen flows once Elements are mounted.
        setIsPaymentStep(true);
        setStep("form");
        return;
      }

      // Step 2: we are already in the payment step; proceed with payment for
      // the existing order id.
      setStep("submitting");

      if (!currentOrderId) {
        throw new Error("Missing order id when trying to start payment.");
      }

      {
        // Snapshot current cart so we can render a stable summary after success.
        if (!placedItems) {
          setPlacedItems(items);
        }
        if (placedSubtotal == null) {
          setPlacedSubtotal(subtotal);
        }
      }

      // Ask gateway to initiate payment (prefer prefetch). We will only show a "success" state
      // if payment has either been redirected to PSP or clearly marked as
      // succeeded/processing.
      let paymentRes: SubmitPaymentResponse | null = null;
      try {
        if (paymentInitKey && paymentInitKeyRef.current === paymentInitKey) {
          if (prefetchedPaymentRes) {
            paymentRes = prefetchedPaymentRes;
          } else if (paymentInitPromiseRef.current) {
            paymentRes = await paymentInitPromiseRef.current;
          }
        }

        if (!paymentRes) {
          const returnUrl =
            typeof window !== "undefined"
              ? `${window.location.origin}/account/orders`
              : undefined;
          paymentRes = await submitPaymentForOrder({
            orderId: currentOrderId as string,
            amount: amountToCharge,
            currency,
            paymentMethodHint: "card",
            returnUrl,
          });
        }
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

      if (clientSecret && isStripePsp && !stripeConfigured) {
        setError(
          "Card payments aren’t available right now because Stripe isn’t configured on this site. Please contact support or try again later.",
        );
        setStep("error");
        return;
      }

      if (clientSecret && stripeConfigured && isStripePsp) {
        if (!stripe || !elements) {
          setError(
            "Payment form is not ready. Please refresh the page and try again.",
          );
          setStep("error");
          return;
        }

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
      if (err instanceof AgentGatewayError) {
        const { code, message: msg, debugId } = parseAgentGatewayError(err);
        const suffix = debugId ? ` (debug_id: ${debugId})` : "";
        if (isRetryableQuoteError(code)) {
          // Refresh quote-first state so the user can retry with a new quote.
          setQuote(null);
          setLockedPricing(null);
          setLockedPromotionLines([]);
          setLockedLineItems([]);
          setLockedQuoteMeta(null);
          setLockedCurrency(null);
          setIsPaymentStep(false);
          setOrderId(undefined);
          setError(
            `${code}: ${msg}${suffix}. We refreshed your quote state; please review and try again.`,
          );
        } else {
          setError(code ? `${code}: ${msg}${suffix}` : `${msg}${suffix}`);
        }
      } else {
        setError(
          "We couldn’t place the order right now. Please try again in a moment.",
        );
      }
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
                      (() => {
                        const estimatedUnitPrice =
                          typeof item.price === "number" && !Number.isNaN(item.price) ? item.price : 0;

                        const variantKey =
                          item.variantId != null
                            ? String(item.variantId)
                            : (item as any).variant_id != null
                              ? String((item as any).variant_id)
                              : null;

                        const pricingLine = variantKey
                          ? activeLineItemByVariantId.get(variantKey)
                          : null;

                        const lockedUnitPriceRaw =
                          pricingLine?.unit_price_effective ??
                          pricingLine?.unit_price_original ??
                          pricingLine?.unit_price ??
                          pricingLine?.price ??
                          null;

                        const lockedUnitPrice =
                          lockedUnitPriceRaw != null ? toNumber(lockedUnitPriceRaw) : null;

                        const usingLockedUnit =
                          !existingOrderId &&
                          lockedUnitPrice != null &&
                          lockedUnitPrice > 0 &&
                          (hasLockedQuote || isPaymentStep || step === "success");

                        const rowCurrency =
                          isPaymentStep || step === "success"
                            ? currency
                            : usingLockedUnit
                              ? currency
                              : estimateCurrency;
                        const unitPrice = usingLockedUnit ? lockedUnitPrice : estimatedUnitPrice;
                        const showUnitPriceDelta =
                          usingLockedUnit &&
                          currenciesMatch &&
                          Math.abs(unitPrice - estimatedUnitPrice) >= 0.01;

                        return (
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
                              {rowCurrency}{" "}
                              {showUnitPriceDelta ? (
                                <>
                                  <span className="mr-1 line-through text-slate-400">
                                    {estimatedUnitPrice.toFixed(2)}
                                  </span>
                                  <span className="font-semibold text-slate-900">
                                    {unitPrice.toFixed(2)}
                                  </span>
                                </>
                              ) : (
                                <span>{unitPrice.toFixed(2)}</span>
                              )}{" "}
                              × {item.quantity}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {rowCurrency} {(unitPrice * item.quantity).toFixed(2)}
                            </span>
                          </div>
                          {showUnitPriceDelta && (
                            <p className="mt-1 text-[11px] text-slate-500">
                              Updated at checkout based on live merchant pricing for your shipping address.
                            </p>
                          )}
                        </div>
                      </div>
                        );
                      })()
                    ))
                  )}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3 text-sm">
                  {!existingOrderId && !isPaymentStep && (
                    <div className="mb-2 text-[11px] text-slate-600">
                      {quoteLoading ? (
                        <span>
                          Locking your price…{" "}
                          <span className="text-slate-500">
                            (We’re fetching live pricing/shipping; this can take up to ~60s.)
                          </span>
                        </span>
                      ) : quoteError ? (
                        <span className="text-rose-600">{quoteError}</span>
                      ) : activeExpiresAt ? (
                        <span>
                          Locked pricing valid until{" "}
                          {new Date(activeExpiresAt).toLocaleString()}
                        </span>
                      ) : (
                        <span>Enter your shipping details to lock pricing.</span>
                      )}
                    </div>
                  )}

                  {showCurrencySwitchNote && (
                    <p className="mb-2 text-[11px] text-slate-600">
                      Currency updates from{" "}
                      <span className="font-semibold text-slate-900">{estimateCurrency}</span>{" "}
                      to{" "}
                      <span className="font-semibold text-slate-900">{currency}</span>{" "}
                      after you select a shipping country.
                    </p>
                  )}

                  {showSubtotalDeltaNote && (
                    <p className="mb-2 text-[11px] text-slate-600">
                      Subtotal updated at checkout{" "}
                      <span className={subtotalDelta >= 0 ? "font-semibold text-slate-900" : "font-semibold text-emerald-700"}>
                        ({subtotalDelta >= 0 ? "+" : "-"}
                        {currency} {Math.abs(subtotalDelta).toFixed(2)})
                      </span>
                      .
                    </p>
                  )}

                  {showCurrencySwitchNote && (
                    <div className="flex items-center justify-between text-[11px] text-slate-600">
                      <span>Estimated subtotal ({estimateCurrency})</span>
                      <span className="font-semibold text-slate-900">
                        {estimateCurrency} {cartSubtotalEstimate.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Subtotal</span>
                    <span className="font-semibold text-slate-900">
                      {currency} {effectiveSubtotal.toFixed(2)}
                    </span>
                  </div>

                  {effectivePromotionDiscount > 0 && (
                    <>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                        <span>Promotion discount</span>
                        <span className="font-semibold text-emerald-600">
                          -{currency} {effectivePromotionDiscount.toFixed(2)}
                        </span>
                      </div>
                      {displayPromotionLines.length > 0 && (
                        <div className="mt-1 space-y-1 text-[11px] text-slate-600">
                          {displayPromotionLines.map((pl: any) => (
                            <div key={pl.id || pl.label} className="flex items-center justify-between">
                              <span className="line-clamp-1">
                                {pl.label}
                                {pl.code ? ` (${pl.code})` : ""}
                              </span>
                              <span className="font-medium text-emerald-700">
                                {toNumber(pl.amount).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {effectiveShippingFee > 0 && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span>Shipping</span>
                      <span className="font-semibold text-slate-900">
                        {currency} {effectiveShippingFee.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {effectiveTax > 0 && (
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
                      <span>Tax</span>
                      <span className="font-semibold text-slate-900">
                        {currency} {effectiveTax.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-slate-900 font-semibold">Total</span>
                    <span className="font-semibold text-slate-900">
                      {currency} {effectiveTotal.toFixed(2)}
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
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={() => setAuthMethod("password")}
                          className={`rounded-full border px-3 py-1 font-medium shadow-sm ${
                            authMethod === "password"
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Password
                        </button>
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={() => setAuthMethod("otp")}
                          className={`rounded-full border px-3 py-1 font-medium shadow-sm ${
                            authMethod === "otp"
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          Email code
                        </button>
                      </div>
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
                      {authMethod === "password" ? (
                        <>
                          <label className="text-[11px] font-medium text-slate-700">
                            Password
                            <input
                              type="password"
                              required
                              value={loginPassword}
                              onChange={(e) => setLoginPassword(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={authLoading}
                            onClick={handlePasswordSignIn}
                            className="w-full rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {authLoading ? "Signing in…" : "Sign in"}
                          </button>
                          <p className="text-[11px] text-slate-500">
                            No password yet? Use Email code once, then set a password on the login page.
                          </p>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={authLoading}
                          onClick={handleSendCode}
                          className="w-full rounded-full bg-slate-900 px-4 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {authLoading ? "Sending code…" : "Send verification code"}
                        </button>
                      )}
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
                      State / Province
                      <input
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
	                    <label className="text-[11px] font-medium text-slate-700">
	                      Country / Region
	                      <select
	                        required
	                        value={country}
	                        onChange={(e) => setCountry(e.target.value)}
	                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
	                      >
	                        {SHIPPING_COUNTRY_GROUPS.map((group) => (
	                          <optgroup key={group.label} label={group.label}>
	                            {group.countries.map((c) => (
	                              <option key={c.code} value={c.code}>
	                                {c.name}
	                              </option>
	                            ))}
	                          </optgroup>
	                        ))}
	                      </select>
	                    </label>
                    <label className="text-[11px] font-medium text-slate-700">
                      Postal code
                      <input
                        required
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                      />
                    </label>
                  </div>
                  <label className="text-[11px] font-medium text-slate-700">
                    Phone (optional)
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Notes for the creator / merchant (optional)
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="text-[11px] font-medium text-slate-700">
                    Discount code (optional)
                    <input
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value)}
                      placeholder="Enter code"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                    <p className="mt-1 text-[11px] font-normal text-slate-500">
                      Checkout pricing is locked once we generate a quote.
                    </p>
                  </label>
                </div>

                {stripeConfigured && isPaymentStep && (!pspUsed || pspUsed === "stripe") && (
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[11px] font-medium text-slate-700">
                      Card details
                      <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        {!stripeReady && (
                          <div className="pb-1 text-[11px] text-slate-500">
                            Loading secure card fields…
                          </div>
                        )}
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
                    {paymentInitLoading && (
                      <p className="text-[11px] text-slate-500">
                        Preparing payment…
                      </p>
                    )}
                    {paymentInitError && (
                      <p className="text-[11px] text-rose-500">
                        {paymentInitError}
                      </p>
                    )}
                    {cardError && (
                      <p className="text-[11px] text-rose-500">
                        {cardError}
                      </p>
                    )}
                  </div>
                )}

                {!stripeConfigured && isPaymentStep && (!pspUsed || pspUsed === "stripe") && (
                  <p className="text-[11px] text-rose-500">
                    Card payments aren’t configured on this site (missing Stripe publishable key). Please contact support or try again later.
                  </p>
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
                    if (pspUsed === "adyen" && adyenMounted) {
                      ctaLabel = "Complete payment in form";
                    } else {
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
                  }

                  return (
                    <button
                      type="submit"
                      disabled={
                        step === "submitting" ||
                        (isPaymentStep && pspUsed === "adyen" && adyenMounted) ||
                        (!existingOrderId &&
                          !isPaymentStep &&
                          (!quote || quoteLoading || !!quoteError))
                      }
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
