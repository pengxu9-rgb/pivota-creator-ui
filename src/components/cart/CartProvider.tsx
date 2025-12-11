'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ProductBestDeal } from "@/types/product";

export type CartItem = {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
  quantity: number;
  currency?: string;
  productId?: string;
  merchantId?: string;
  creatorId?: string;
  creatorSlug?: string;
  creatorName?: string;
  // Optional deal info so checkout can preview discounts before the order
  // is actually created on the backend.
  bestDeal?: ProductBestDeal | null;
  allDeals?: ProductBestDeal[] | null;
};

type CartContextValue = {
  items: CartItem[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  subtotal: number;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((v) => !v);

  const addItem = (item: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i,
        );
      }
      return [...prev, item];
    });
    setIsOpen(true);
  };

  const updateQuantity = (id: string, quantity: number) => {
    setItems((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clear = () => setItems([]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );

  const value: CartContextValue = {
    items,
    isOpen,
    open,
    close,
    toggle,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    subtotal,
  };

  // Persist cart to localStorage so items survive route changes / reloads
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("pivota_creator_cart");
      if (stored) {
        const parsed = JSON.parse(stored) as CartItem[];
        if (Array.isArray(parsed)) {
          setItems(parsed);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to load cart from storage", err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (items.length > 0) {
        window.localStorage.setItem("pivota_creator_cart", JSON.stringify(items));
      } else {
        window.localStorage.removeItem("pivota_creator_cart");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save cart to storage", err);
    }
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
