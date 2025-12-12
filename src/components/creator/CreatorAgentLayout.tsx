'use client';

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Send, ShoppingCart } from "lucide-react";
import { useCreatorAgent } from "@/components/creator/CreatorAgentContext";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ProductCard } from "@/components/product/ProductCard";

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
    buyNow,
  } = useCreatorAgent();

  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (() => {
    if (pathname?.includes("/categories")) return "categories";
    if (pathname?.includes("/category/")) return "categories";
    return "forYou";
  })();

  return (
    <main className="min-h-screen lg:h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-purple-300/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col lg:h-screen">
        <header className="border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur-sm lg:px-8">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creator.avatarUrl}
                alt={creator.name}
                className="h-9 w-9 rounded-full border border-slate-200 object-cover"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-900">
                  {creator.name}
                </div>
                <div className="text-xs text-slate-500">
                  {creator.tagline ||
                    "Personalized shopping assistant tuned to this creator."}
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <nav className="flex items-center gap-1 rounded-full bg-slate-100/80 p-1 text-xs">
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
                  className="rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-200 sm:px-4"
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
                    className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-100"
                  >
                    <span className="truncate max-w-[120px]">
                      {(() => {
                        const email = accountsUser.email || "Pivota user";
                        return email.length > 8
                          ? `${email.slice(0, 8)}…`
                          : email;
                      })()}
                    </span>
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
                    className="inline-flex rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    Sign in
                  </button>
                ))}

              <button
                type="button"
                onClick={openCart}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>Cart</span>
                {cartItemsCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white">
                    {cartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
          <section className="flex w-full flex-col border-b border-slate-200 bg-white/70 px-4 py-4 backdrop-blur-sm lg:w-[360px] lg:border-b-0 lg:border-r lg:px-6">
            <div className="mb-3 text-[12px] text-slate-600">
              Describe your needs (scenario, budget, style). I’ll start with
              pieces the creator featured, then similar matches.
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-slate-800">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user" ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={
                        m.role === "user"
                          ? "max-w-[80%] rounded-3xl rounded-br-sm bg-slate-100 px-3 py-2 text-xs text-slate-800 shadow-sm"
                          : "max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-bl-sm bg-gradient-to-r from-[#fdf2ff] via-[#e0f2fe] to-[#f5f3ff] px-4 py-3 text-xs text-slate-900 shadow-md"
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                    Finding options for you…
                  </div>
                )}
              </div>

              {isLoading && (
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] bg-gradient-to-r from-[#7c8cff] via-[#62b2ff] to-[#7fffe1]" />
                </div>
              )}

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2 ring-1 ring-inset ring-slate-200 focus-within:ring-2 focus-within:ring-cyan-300/60">
                  <input
                    className="flex-1 bg-transparent px-1 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none"
                    placeholder="e.g., commuter jacket under $120, clean and minimal…"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#7c8cff] via-[#62b2ff] to-[#7fffe1] text-[11px] text-slate-900 shadow-lg transition hover:brightness-110 disabled:opacity-60"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-1 flex-col bg-white/40 px-4 py-4 lg:px-8">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {children}
            </div>
          </section>
        </div>

        {similarBaseProduct && (
          <div className="fixed inset-0 z-30 flex items-end bg-black/40 px-4 pb-6 sm:items-center sm:pb-6 sm:pt-6">
            <div className="mx-auto flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 p-4 text-slate-50 shadow-2xl backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-50">
                    Similar items you may like
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Based on: {similarBaseProduct.title}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
                  onClick={closeSimilar}
                >
                  Close
                </button>
              </div>

              <div className="mt-3 min-h-[140px] flex-1 overflow-y-auto">
                {isSimilarLoading && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="h-32 animate-pulse rounded-2xl bg-white/10"
                      />
                    ))}
                  </div>
                )}

                {!isSimilarLoading && similarError && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-red-300">{similarError}</p>
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
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
                    <p className="text-[11px] text-slate-300">
                      No similar items found yet.
                    </p>
                  )}

                {!isSimilarLoading &&
                  !similarError &&
                  similarItems.length > 0 && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                      {similarItems.slice(0, 9).map((item) => (
                        <ProductCard
                          key={item.product.id}
                          product={item.product}
                          creatorName={creator.name}
                          creatorId={creator.id}
                          creatorSlug={creator.slug}
                          onSeeSimilar={handleSeeSimilar}
                          onViewDetails={handleViewDetails}
                        />
                      ))}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {detailProduct && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
            onClick={closeDetail}
          >
            <div
              className="flex h-[100vh] w-full max-w-md flex-col overflow-hidden bg-white p-4 text-slate-900 shadow-2xl sm:h-[90vh] sm:max-w-3xl sm:rounded-3xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {detailProduct.title}
                  </h3>
                  {detailProduct.merchantName && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Sold by {detailProduct.merchantName}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-200"
                  onClick={closeDetail}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto md:flex-row">
                {detailProduct.imageUrl && (
                  <div className="md:w-1/2 w-full">
                    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-100 aspect-[3/4]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detailProduct.imageUrl}
                        alt={detailProduct.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-1 flex-col space-y-3 text-[13px]">
                  <div className="text-lg font-semibold">
                    {detailProduct.currency} {detailProduct.price.toFixed(2)}
                  </div>

                  {detailProduct.description && (
                    <p className="text-[12px] leading-relaxed text-slate-700">
                      {detailProduct.description}
                    </p>
                  )}

                  {typeof detailProduct.inventoryQuantity === "number" && (
                    <p className="text-[11px] text-slate-500">
                      Stock:{" "}
                      {detailProduct.inventoryQuantity > 0
                        ? `${detailProduct.inventoryQuantity} available`
                        : "Out of stock"}
                    </p>
                  )}

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-slate-900 px-3 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-slate-800"
                      onClick={() => addToCart(detailProduct)}
                    >
                      Add to cart
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-full bg-gradient-to-r from-[#7c8cff] via-[#62b2ff] to-[#7fffe1] px-3 py-2 text-[12px] font-medium text-slate-900 shadow-sm hover:brightness-110"
                      onClick={() => buyNow(detailProduct)}
                    >
                      Buy now
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
