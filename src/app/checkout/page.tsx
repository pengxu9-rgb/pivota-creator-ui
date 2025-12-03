'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { createOrderFromCart } from "@/lib/checkoutClient";

type CheckoutStep = "form" | "submitting" | "success" | "error";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();
  const [step, setStep] = useState<CheckoutStep>("form");
  const [error, setError] = useState<string | null>(null);

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

  const currency = items[0]?.currency || "USD";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!items.length) {
      setError("Your cart is empty.");
      return;
    }
    if (!email || !name || !addressLine1 || !city || !country || !postalCode) {
      setError("Please fill in all required fields.");
      return;
    }

    setError(null);
    setStep("submitting");

    try {
      const res = await createOrderFromCart({
        items,
        email,
        name,
        addressLine1,
        addressLine2: addressLine2 || undefined,
        city,
        country,
        postalCode,
        phone: phone || undefined,
        notes: notes || undefined,
      });

      setOrderId((res as any).order_id || (res as any).id);
      clear();
      setStep("success");
    } catch (err) {
      console.error(err);
      setError("We couldn’t place the order right now. Please try again in a moment.");
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
            Back to creator agent
          </button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          {/* Left: cart summary */}
          <section className="flex flex-col rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Order summary</h2>
            <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Your cart is empty. Go back to the creator agent to pick a few items.
                </p>
              ) : (
                items.map((item) => (
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
                  {currency} {subtotal.toFixed(2)}
                </span>
              </div>
            </div>
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
                    Use an email you can access so we can send order updates.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <label className="text-[11px] font-medium text-slate-700">
                    Email
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 shadow-sm outline-none focus:border-slate-900"
                    />
                  </label>
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

                {error && (
                  <p className="text-[11px] text-rose-500">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={step === "submitting" || !items.length}
                  className="mt-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {step === "submitting" ? "Placing order…" : "Place order"}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

