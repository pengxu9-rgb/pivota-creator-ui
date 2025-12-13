/* eslint-disable @next/next/no-img-element */
"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Home, Percent, Send, ShoppingCart, User, X } from "lucide-react";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";
import { useCart } from "@/components/cart/CartProvider";

export function CreatorAgentLayout({ children }: { children: ReactNode }) {
  const {
    creator,
    messages,
    input,
    setInput,
    isLoading,
    accountsUser,
    authChecking,
    handleSend,
    similarBaseProduct,
    similarItems,
    isSimilarLoading,
    similarError,
    detailProduct,
    isMobile,
    closeSimilar,
    closeDetail,
    handleSeeSimilar,
    handleViewDetails,
    lastRequest,
    lastResponse,
    safeStringify,
    isDebug,
    openCart,
    cartItemsCount,
    addToCart,
    prefetchProductDetail,
  } = useCreatorAgent();

  const { addItem } = useCart();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = (() => {
    const tabParam = searchParams?.get("tab");
    if (pathname?.includes("/categories")) return "categories";
    if (pathname?.includes("/category/")) return "categories";
    if (tabParam === "deals") return "deals";
    return "forYou";
  })();

  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  // Local state for desktop detail modal (style / size selection and gallery)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(
    {},
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Initialise selection whenever a new detail product is opened.
  useEffect(() => {
    if (!detailProduct) {
      setSelectedOptions({});
      setSelectedVariantId(null);
      setActiveImageIndex(0);
      return;
    }

    const nextSelected: Record<string, string> = {};

    if (detailProduct.variants && detailProduct.variants.length > 0) {
      const first = detailProduct.variants[0];
      if (first.options) {
        for (const [name, value] of Object.entries(first.options)) {
          if (value != null) {
            nextSelected[name] = String(value);
          }
        }
      }
      setSelectedVariantId(first.id);
    } else if (detailProduct.options && detailProduct.options.length > 0) {
      for (const opt of detailProduct.options) {
        if (opt.values && opt.values.length > 0) {
          nextSelected[opt.name] = opt.values[0];
        }
      }
      setSelectedVariantId(null);
    }

    setSelectedOptions(nextSelected);
    setActiveImageIndex(0);
  }, [detailProduct]);

  const selectedVariant = useMemo(() => {
    if (!detailProduct?.variants || detailProduct.variants.length === 0) {
      return null;
    }

    if (selectedVariantId) {
      const byId = detailProduct.variants.find((v) => v.id === selectedVariantId);
      if (byId) return byId;
    }

    const entries = Object.entries(selectedOptions).filter(
      ([, v]) => typeof v === "string" && v,
    );
    if (!entries.length) {
      return detailProduct.variants[0];
    }

    const match =
      detailProduct.variants.find((v) => {
        if (!v.options) return false;
        return entries.every(
          ([name, value]) =>
            String(v.options?.[name] ?? "").trim() === String(value),
        );
      }) ?? null;

    return match || detailProduct.variants[0];
  }, [detailProduct, selectedOptions, selectedVariantId]);

  const detailImages = useMemo(() => {
    if (!detailProduct) return [] as string[];
    if (Array.isArray(detailProduct.images) && detailProduct.images.length > 0) {
      return detailProduct.images;
    }
    return detailProduct.imageUrl ? [detailProduct.imageUrl] : [];
  }, [detailProduct]);

  const displayPrice =
    (selectedVariant && selectedVariant.price) ?? detailProduct?.price ?? 0;
  const displayInventory =
    (selectedVariant && selectedVariant.inventoryQuantity) ??
    detailProduct?.inventoryQuantity ??
    undefined;

  const renderChatPanel = (sectionClassName: string) => (
    <section className={sectionClassName}>
      <div className="mb-3 text-[12px] text-[#8c715c]">
        Describe your needs (scenario, budget, style). I’ll start with pieces
        the creator featured, then similar matches.
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-[#4a3727]">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-3xl rounded-br-sm bg-white px-3 py-2 text-xs text-[#4a3727] shadow-sm"
                    : "max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-bl-sm bg-gradient-to-r from-[#ffe7d6] via-[#fff2e3] to-[#ffe0cc] px-4 py-3 text-xs text-[#4a3727] shadow-md"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-[11px] text-[#a38b78]">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#f6b59b]" />
              Finding options for you…
            </div>
          )}
        </div>

        {isLoading && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f4e2d4]">
            <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] bg-gradient-to-r from-[#f6b59b] via-[#f4a58c] to-[#f8c3a2]" />
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-inset ring-[#f0e2d6] focus-within:ring-2 focus-within:ring-[#f6b59b]/80">
            <input
              className="flex-1 bg-transparent px-1 text-[13px] text-[#4a3727] placeholder:text-[#b29a84] focus:outline-none"
              placeholder="e.g., commuter jacket under $120, clean and minimal…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button
              onClick={handleSend}
              disabled={isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#f6b59b] via-[#f4a58c] to-[#f8c3a2] text-[11px] text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <main className="min-h-screen lg:h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#ffe7d6]/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-[#ffe0cc]/18 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#fff2e3]/22 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col lg:h-screen">
        <header className="border-b border-[#f6ebe0] bg-white px-4 py-3 lg:px-8">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-full bg-[#f6b59b]">
                <img
                  src={creator.avatarUrl}
                  alt={creator.name}
                  className="h-full w-full rounded-full object-cover opacity-95"
                />
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-[#3f3125]">
                  {creator.name}
                </div>
                <div className="text-xs text-[#a38b78]">
                  {creator.tagline ||
                    "Personalized shopping assistant tuned to this creator."}
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <nav className="hidden items-center gap-1 rounded-full bg-[#f4e2d4] p-1 text-xs sm:flex">
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/creator/${encodeURIComponent(creator.slug)}`)
                  }
                  className={
                    activeTab === "forYou"
                      ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:px-4"
                      : "rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200 sm:px-4"
                  }
                >
                  For You
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/creator/${encodeURIComponent(
                        creator.slug,
                      )}?tab=deals#creator-deals`,
                    )
                  }
                  className={
                    activeTab === "deals"
                      ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:px-4"
                      : "rounded-full px-3 py-1.5 text-xs text-[#8c715c] hover:bg-[#f6e6d8] sm:px-4"
                  }
                >
                  Deals
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/creator/${encodeURIComponent(
                        creator.slug,
                      )}/categories`,
                    )
                  }
                  className={
                    activeTab === "categories"
                      ? "hidden rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:inline-flex sm:px-4"
                      : "hidden rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200 sm:inline-flex sm:px-4"
                  }
                >
                  Categories
                </button>
              </nav>

              {!authChecking &&
                (accountsUser ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/account/orders?creator=${encodeURIComponent(
                          creator.slug,
                        )}`,
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f0e2d6] bg-white text-[11px] text-[#8c715c] hover:bg-[#fff0e3]"
                  >
                    <User className="h-3.5 w-3.5 text-[#b29a84]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const returnTo =
                        typeof window !== "undefined"
                          ? window.location.pathname + window.location.search
                          : `/creator/${creator.slug}`;
                  router.push(
                    `/account/login?return_to=${encodeURIComponent(
                      returnTo,
                    )}`,
                  );
                }}
                    className="inline-flex rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] hover:bg-[#fff0e3]"
                  >
                    Sign in
                  </button>
                ))}

              <button
                type="button"
                onClick={openCart}
                className="inline-flex items-center gap-2 rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] hover:bg-[#fff0e3]"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>Cart</span>
                {cartItemsCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[#f6b59b] px-1 text-[10px] font-semibold text-white">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col bg-[#fffaf5] lg:flex-row lg:overflow-hidden">
          {renderChatPanel(
            "hidden w-full flex-col border-b border-[#f6ebe0] bg-white px-4 py-4 lg:flex lg:w-[360px] lg:border-b-0 lg:border-r lg:px-6",
          )}

          <section className="flex flex-1 flex-col bg-[#fffaf5] px-4 py-4 lg:px-8">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </section>
        </div>

        {/* Mobile chat floating button */}
        <button
          type="button"
          onClick={() => setIsMobileChatOpen(true)}
          className="fixed inset-x-0 bottom-16 z-20 flex justify-center lg:hidden"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f6b59b] px-5 py-2 text-xs font-medium text-white shadow-lg hover:bg-[#f29b7f]">
            <Send className="h-3.5 w-3.5" />
            <span>Chat with {creator.name}</span>
          </span>
        </button>

        {/* Mobile chat sheet */}
        {isMobileChatOpen && (
          <div className="fixed inset-0 z-30 flex flex-col bg-[#fffefc]/95 backdrop-blur-sm lg:hidden">
            <div className="flex items-center justify-between border-b border-[#f6ebe0] bg-[#fffefc]/92 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 overflow-hidden rounded-full bg-[#f6b59b]">
                  <img
                    src={creator.avatarUrl}
                    alt={creator.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#3f3125]">
                    {creator.name}
                  </div>
                  <div className="text-[11px] text-[#a38b78]">Chat assistant</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileChatOpen(false)}
                className="rounded-full bg-white px-3 py-1 text-[11px] text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
              >
                Close
              </button>
            </div>
            <div className="flex flex-1 flex-col bg-[#fffefc]/94 px-4 py-4">
              {renderChatPanel(
                "flex h-full w-full flex-col bg-transparent px-0 py-0 border-0",
              )}
            </div>
          </div>
        )}

        {similarBaseProduct && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-4 pb-20 sm:items-center sm:pb-6 sm:pt-6">
            <div className="mx-auto flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-[#f0e2d6] bg-[#fffdf9] text-[#3f3125] shadow-xl sm:p-0">
              <div className="flex items-center justify-between gap-2 border-b border-[#f0e2d6] px-4 py-3 sm:px-6">
                <div>
                  <h3 className="text-sm font-semibold text-[#3f3125] sm:text-base">
                    Similar styles
                  </h3>
                  <p className="mt-0.5 line-clamp-1 text-[11px] text-[#a38b78] sm:text-xs">
                    Based on “{similarBaseProduct.title}”
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-transparent px-3 py-1 text-[11px] text-[#8c715c] hover:bg-[#fff2e3]"
                  onClick={closeSimilar}
                >
                  Close
                </button>
              </div>

              <div className="min-h-[160px] flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                {isSimilarLoading && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-44 animate-pulse rounded-3xl bg-[#f5e3d4]"
                      />
                    ))}
                  </div>
                )}

                {!isSimilarLoading && similarError && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-red-500">{similarError}</p>
                    <button
                      type="button"
                      className="rounded-full bg-[#3f3125] px-3 py-1 text-[11px] text-white shadow-sm hover:bg-black"
                      onClick={() =>
                        handleSeeSimilar(similarBaseProduct as any)
                      }
                    >
                      Try again
                    </button>
                  </div>
                )}

                {!isSimilarLoading &&
                  !similarError &&
                  similarItems.length === 0 && (
                    <p className="text-[11px] text-[#a38b78]">
                      No similar items found yet.
                    </p>
                  )}

                {!isSimilarLoading &&
                  !similarError &&
                  similarItems.length > 0 && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {similarItems.slice(0, 9).map((item) => (
                        <ProductCard
                          key={item.product.id}
                          product={item.product}
                          creatorName={creator.name}
                          creatorId={creator.id}
                          creatorSlug={creator.slug}
                          onSeeSimilar={handleSeeSimilar}
                          onViewDetails={(p) => {
                            closeSimilar();
                            handleViewDetails(p);
                          }}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Mobile bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f0e2d6] bg-[#fffefc] py-1.5 shadow-[0_-6px_30px_rgba(63,49,37,0.16)] lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-around px-4 text-[11px] text-[#b29a84]">
            <button
              type="button"
              onClick={() =>
                router.push(`/creator/${encodeURIComponent(creator.slug)}`)
              }
              className={
                activeTab === "forYou"
                  ? "flex flex-col items-center gap-0.5 text-[#f28b7a]"
                  : "flex flex-col items-center gap-0.5 text-[#b29a84]"
              }
            >
              <Home className="h-4 w-4" />
              <span>For You</span>
            </button>
            <button
              type="button"
              onClick={() =>
                router.push(
                  `/creator/${encodeURIComponent(creator.slug)}/categories`,
                )
              }
              className={
                activeTab === "categories"
                  ? "flex flex-col items-center gap-0.5 text-[#f28b7a]"
                  : "flex flex-col items-center gap-0.5 text-[#b29a84]"
              }
            >
              <Percent className="h-4 w-4" />
              <span>Categories</span>
            </button>
            <button
              type="button"
              onClick={openCart}
              className="relative flex flex-col items-center gap-0.5 text-[#b29a84]"
            >
              <div className="relative">
                <ShoppingCart className="h-4 w-4" />
                {cartItemsCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#f6b59b] px-1 text-[9px] font-semibold text-white">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span>Cart</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (accountsUser) {
                  router.push(
                    `/account/orders?creator=${encodeURIComponent(
                      creator.slug,
                    )}`,
                  );
                } else {
                  const returnTo =
                    typeof window !== "undefined"
                      ? window.location.pathname + window.location.search
                      : `/creator/${creator.slug}`;
                  router.push(
                    `/account/login?return_to=${encodeURIComponent(returnTo)}`,
                  );
                }
              }}
              className="flex flex-col items-center gap-0.5 text-[#b29a84]"
            >
              <User className="h-4 w-4" />
              <span>Profile</span>
            </button>
          </div>
        </nav>

        {/* Desktop product full-detail modal */}
        {detailProduct && !isMobile && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 sm:px-6"
            onClick={closeDetail}
          >
            <div
              className="flex w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-[#f0e2d6] bg-[#fffaf5] text-[#3f3125] shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex h-full w-full flex-col overflow-y-auto sm:flex-row">
                {/* Left: image gallery */}
                {detailImages.length > 0 && (
                  <div className="w-full bg-[#f5e3d4] sm:w-1/2">
                    <div className="relative aspect-[3/4] w-full overflow-hidden">
                      <img
                        src={
                          detailImages[
                            Math.max(
                              0,
                              Math.min(activeImageIndex, detailImages.length - 1),
                            )
                          ]
                        }
                        alt={detailProduct.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                    {detailImages.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto px-3 py-2">
                        {detailImages.map((url, idx) => (
                          <button
                            key={url + idx.toString()}
                            type="button"
                            onClick={() => setActiveImageIndex(idx)}
                            className={`h-16 w-12 flex-shrink-0 overflow-hidden rounded-xl border ${
                              idx === activeImageIndex
                                ? "border-[#3f3125]"
                                : "border-[#f0e2d6]"
                            } bg-[#f6e6d8]`}
                          >
                            <img
                              src={url}
                              alt={detailProduct.title}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Right: full detail content with style / size selection */}
                <div className="flex flex-1 flex-col gap-3 p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#3f3125] sm:text-lg">
                      {detailProduct.title}
                    </h3>
                    {detailProduct.merchantName && (
                      <p className="mt-0.5 text-[11px] text-[#a38b78]">
                        Sold by {detailProduct.merchantName}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#fff0e3] text-[#8c715c] shadow-sm hover:bg-[#ffd9c2]"
                    onClick={closeDetail}
                    aria-label="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {detailProduct.description && (
                  <p className="text-[12px] leading-relaxed text-[#8c715c]">
                    {detailProduct.description}
                  </p>
                )}

                <div className="space-y-2 text-[13px]">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-[#a38b78]">
                    Price
                  </div>
                  <div className="text-lg font-semibold text-[#3f3125]">
                    {detailProduct.currency} {displayPrice.toFixed(2)}
                  </div>
                  {detailProduct.bestDeal?.label && (
                    <div className="text-[12px] font-medium text-[#f28b7a]">
                      {detailProduct.bestDeal.label}
                    </div>
                  )}
                </div>

                {Array.isArray(detailProduct.options) &&
                  detailProduct.options.length > 0 && (
                    <div className="space-y-3 text-[12px]">
                      {detailProduct.options
                        .filter((opt) => opt.values && opt.values.length > 0)
                        .map((opt) => (
                          <div key={opt.name}>
                            <div className="text-[11px] font-medium uppercase tracking-wide text-[#a38b78]">
                              {opt.name}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {opt.values.map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => {
                                    const next = {
                                      ...selectedOptions,
                                      [opt.name]: value,
                                    };
                                    setSelectedOptions(next);
                                    if (
                                      detailProduct.variants &&
                                      detailProduct.variants.length > 0
                                    ) {
                                      const match =
                                        detailProduct.variants.find((v) => {
                                          if (!v.options) return false;
                                          return Object.entries(next).every(
                                            ([name, val]) =>
                                              String(
                                                v.options?.[name] ?? "",
                                              ).trim() === String(val),
                                          );
                                        }) ?? detailProduct.variants[0];
                                      setSelectedVariantId(match.id);
                                      if (match.imageUrl) {
                                        const idx = detailImages.findIndex(
                                          (url) => url === match.imageUrl,
                                        );
                                        if (idx >= 0) {
                                          setActiveImageIndex(idx);
                                        }
                                      }
                                    }
                                  }}
                                  className={`rounded-full border px-3 py-1 text-[11px] transition ${
                                    selectedOptions[opt.name] === value
                                      ? "border-[#3f3125] bg-[#3f3125] text-white"
                                      : "border-[#f0e2d6] bg-white text-[#8c715c]"
                                  }`}
                                >
                                  {value}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {typeof displayInventory === "number" && (
                    <p className="text-[11px] text-[#a38b78]">
                      Stock:{" "}
                      {displayInventory > 0
                        ? `${displayInventory} available`
                        : "Out of stock"}
                    </p>
                  )}

                  <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-[#f6b59b] px-3 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-[#f29b7f]"
                      onClick={() => {
                        const product = detailProduct;
                        const variant = selectedVariant;
                        const images = detailImages;
                        const variantKey = variant?.id || "default";
                        addItem({
                          id: `${product.id}:${variantKey}`,
                          productId: product.id,
                          merchantId: product.merchantId,
                          title: product.title,
                          price: displayPrice,
                          imageUrl:
                            (variant && variant.imageUrl) ||
                            images[0] ||
                            product.imageUrl,
                          quantity: 1,
                          currency: product.currency,
                          creatorId: creator.id,
                          creatorSlug: creator.slug,
                          creatorName: creator.name,
                          variantId: variant?.id,
                          variantSku: variant?.sku,
                          selectedOptions:
                            Object.keys(selectedOptions).length > 0
                              ? selectedOptions
                              : undefined,
                          bestDeal: product.bestDeal ?? null,
                          allDeals: product.allDeals ?? null,
                        });
                      }}
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full border border-[#f0e2d6] bg-white px-3 py-2 text-[12px] font-medium text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
                      onClick={() => {
                        // Close detail modal and open the "similar styles" sheet
                        // using the same handler as product cards.
                        closeDetail();
                        handleSeeSimilar(detailProduct);
                      }}
                    >
                      Find more
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {isDebug && (
          <div className="border-t border-slate-200 bg-slate-950/90 px-4 py-4 text-[11px] leading-relaxed text-white md:px-6 lg:px-10">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <h3 className="mb-2 text-xs font-semibold text-white">
                  lastRequest
                </h3>
                <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
                  {safeStringify(lastRequest)}
                </pre>
              </div>
              <div className="md:col-span-1">
                <h3 className="mb-2 text-xs font-semibold text-white">
                  lastResponse
                </h3>
                <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
                  {safeStringify(lastResponse)}
                </pre>
                {lastResponse?.agentUrlUsed && (
                  <p className="mt-1 text-[10px] text-slate-200">
                    agentUrlUsed: {lastResponse.agentUrlUsed}
                  </p>
                )}
              </div>
              {lastResponse?.rawAgentResponse && (
                <div className="md:col-span-1">
                  <h3 className="mb-2 text-xs font-semibold text-white">
                    rawAgentResponse
                  </h3>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-black/60 p-2 font-mono text-[10px] leading-relaxed">
                    {safeStringify(lastResponse.rawAgentResponse)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
