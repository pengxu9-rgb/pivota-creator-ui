'use client';

import React from "react";
import { X, Minus, Plus, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";

export function CartDrawer() {
  const { items, isOpen, close, updateQuantity, removeItem, subtotal, clear } = useCart();
  const router = useRouter();

  if (!isOpen) return null;

  const currency = items[0]?.currency || "USD";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-slate-50">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Your cart</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">Your cart is empty.</p>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
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
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="line-clamp-2 text-xs font-medium text-slate-900">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {currency} {item.price.toFixed(2)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-xs text-slate-400 hover:text-rose-500"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs text-slate-700">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <footer className="border-t border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold text-slate-900">
              {currency} {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={items.length === 0}
              onClick={() => {
                close();
                router.push("/checkout");
              }}
              className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Checkout
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-100"
              >
                Clear
              </button>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}
