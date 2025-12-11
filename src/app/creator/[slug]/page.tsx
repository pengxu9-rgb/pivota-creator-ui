'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Send, ShoppingCart } from "lucide-react";
import { getCreatorBySlug, type CreatorAgentConfig } from "@/config/creatorAgents";
import type { Product, SimilarProductItem } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useCart } from "@/components/cart/CartProvider";
import { accountsMe, type AccountsUser } from "@/lib/accountsClient";
import { attachMockDeals, getMockSimilarProducts, MOCK_DEALS } from "@/config/dealsMock";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export default function CreatorAgentPage() {
  const params = useParams();
  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const creator = slug ? getCreatorBySlug(slug) : undefined;

  if (!creator) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-sm text-slate-500">Creator agent not found.</div>
      </main>
    );
  }

  return <CreatorAgentShell creator={creator} />;
}

function CreatorAgentShell({ creator }: { creator: CreatorAgentConfig }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m1",
      role: "assistant",
      content:
        `Hi! I'm the shopping agent tuned for ${creator.name}.\n\n` +
        `Try asking:\n` +
        `• A commuter outfit similar to your spring/summer looks\n` +
        `• Shoes that are great for long walks to work\n` +
        `• A clean, minimalist windbreaker under $120`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"forYou" | "deals" | "categories">("forYou");
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(true);

  const searchParams = useSearchParams();
  const isDebug = useMemo(() => searchParams?.get("debug") === "1", [searchParams]);
  const router = useRouter();
  const { items: cartItems, open: openCart, addItem, clear, close } = useCart();
  const [accountsUser, setAccountsUser] = useState<AccountsUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [similarBaseProduct, setSimilarBaseProduct] = useState<Product | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarProductItem[]>([]);
  const [isSimilarLoading, setIsSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const recentQueriesStorageKey = useMemo(
    () => `pivota_creator_recent_queries_${creator.slug}`,
    [creator.slug],
  );
  // Only use mock mode in non-production without an explicit agent URL.
  const isMockMode =
    process.env.NODE_ENV !== "production" &&
    !process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL;

  const safeStringify = (value: any) => {
    try {
      return JSON.stringify(
        value,
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
        2,
      );
    } catch (error) {
      console.error("Failed to stringify debug data", error);
      return "<<unable to stringify debug data>>";
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Persist recent queries locally (last 5)
    setRecentQueries((prev) => {
      const withoutDuplicate = prev.filter((q) => q !== trimmed);
      const updated = [...withoutDuplicate, trimmed].slice(-5);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(recentQueriesStorageKey, JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to persist recent queries", err);
        }
      }
      return updated;
    });

    // Update recent queries list and persist to localStorage so that
    // "Continue from last chat" can show meaningful history even after
    // a page refresh.
    setRecentQueries((prev) => {
      const withoutDuplicate = prev.filter((q) => q !== trimmed);
      const updated = [...withoutDuplicate, trimmed].slice(-5);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(recentQueriesStorageKey, JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to persist recent queries", err);
        }
      }
      return updated;
    });

    try {
      const res = await fetch("/api/creator-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorId: creator.id,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userId: accountsUser?.id || accountsUser?.email || null,
          recentQueries,
        }),
      });

      setLastRequest({
        creatorId: creator.id,
        messages: [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        payload: {
          search: {
            query: trimmed,
            limit: 8,
            in_stock_only: true,
            page: 1,
          },
        },
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setLastResponse(errBody);
        throw new Error("request failed");
      }

      const data = (await res.json()) as {
        reply: string;
        products?: Product[];
        rawAgentResponse?: any;
        agentUrlUsed?: string;
      };

      setLastResponse(data);

      const normalizedProducts = data.products ?? [];
      const withDeals = isMockMode ? attachMockDeals(normalizedProducts) : normalizedProducts;

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
        },
      ]);
      setProducts(withDeals);
    } catch (error) {
      console.error(error);
      setLastResponse((prev: any) => prev ?? { error: "request failed", detail: String(error) });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-error-${Date.now()}`,
          role: "assistant",
          content: "I'm having trouble reaching the backend. Please try again in a moment 🙏",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeeSimilar = async (base: Product) => {
    setSimilarBaseProduct(base);
    setIsSimilarLoading(true);
    setSimilarError(null);
    setSimilarItems([]);
    try {
      const res = await fetch("/api/creator-agent/similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creatorSlug: creator.slug,
          productId: base.id,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        items?: SimilarProductItem[];
        baseProductId?: string;
        strategyUsed?: string;
      };
      setSimilarItems(data.items ?? []);
    } catch (error) {
      console.error("See similar error", error);
      setSimilarError("Failed to load similar items. Please try again.");
    } finally {
      setIsSimilarLoading(false);
    }
  };

  const userQueries = messages.filter((m) => m.role === "user");
  const creatorDeals = useMemo(() => {
    if (!isMockMode) {
      const unique = new Map<string, any>();
      products.forEach((p) => {
        if (p.bestDeal) {
          const id = p.bestDeal.dealId || `${p.id}-deal`;
          if (!unique.has(id)) {
            unique.set(id, p.bestDeal);
          }
        }
      });
      const deals = Array.from(unique.values());
      if (deals.length > 0) return deals.slice(0, 3);
    }
    return MOCK_DEALS.slice(0, 3);
  }, [isMockMode, products]);

  // Load signed-in user so we can reflect status in the creator header.
  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await accountsMe();
        if (!cancelled) {
          setAccountsUser(me);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) {
          setAuthChecking(false);
        }
      }
    };
    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load recent queries from localStorage so "Continue from last chat"
  // reflects the last few prompts across sessions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(recentQueriesStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((q) => typeof q === "string").slice(-5);
        setRecentQueries(cleaned);
      }
    } catch (err) {
      console.error("Failed to load recent queries", err);
    }
  }, [recentQueriesStorageKey]);

  // Initial "Featured for you" from real backend, so右侧列表尽量使用真实选品
  useEffect(() => {
    let cancelled = false;

    const loadFeatured = async () => {
      try {
        setIsFeaturedLoading(true);
        const res = await fetch("/api/creator-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorId: creator.id,
            messages: [] as { role: "user" | "assistant"; content: string }[],
            userId: accountsUser?.id || accountsUser?.email || null,
            recentQueries,
          }),
        });
        if (!res.ok) return;

        const data = (await res.json()) as {
          reply: string;
          products?: Product[];
          rawAgentResponse?: any;
          agentUrlUsed?: string;
        };

        if (cancelled) return;
        if (data.products && data.products.length > 0) {
          const withDeals = isMockMode ? attachMockDeals(data.products) : data.products;
          setProducts(withDeals);
        }

        if (isDebug) {
          setLastRequest((prev: any) => prev ?? {
            creatorId: creator.id,
            messages: [],
            // 和 callPivotaCreatorAgent 的默认 query 保持语义一致
            payload: {
              search: {
                query: "Show popular items",
                in_stock_only: false,
                limit: 10,
              },
            },
          });
          setLastResponse((prev: any) => prev ?? data);
        }
      } catch (error) {
        console.error("loadFeatured error", error);
      } finally {
        if (!cancelled) {
          setIsFeaturedLoading(false);
        }
      }
    };

    loadFeatured();

    return () => {
      cancelled = true;
    };
  }, [creator.id, isDebug, isMockMode, accountsUser?.id, accountsUser?.email, recentQueries]);

  // Prevent background scroll when the similar drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.body.style.overflow;
    if (similarBaseProduct) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = original;
    }
    return () => {
      document.body.style.overflow = original;
    };
  }, [similarBaseProduct]);

  return (
    <main className="min-h-screen lg:h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-purple-300/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col lg:h-screen">
        {/* Top header: creator brand + tabs + cart, full-width */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 text-xs shadow-sm backdrop-blur-sm sm:text-sm md:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 shadow-sm sm:h-11 sm:w-11">
              <img src={creator.avatarUrl} alt={creator.name} className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-900 sm:text-base">{creator.name}</h1>
              </div>
              {creator.tagline && (
                <p className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">{creator.tagline}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <nav className="hidden items-center gap-1 text-xs sm:flex sm:text-sm">
              <button
                type="button"
                onClick={() => setActiveTab("forYou")}
                className={
                  activeTab === "forYou"
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:px-4"
                    : "rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 sm:px-4"
                }
              >
                For You
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("deals")}
                className={
                  activeTab === "deals"
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:px-4"
                    : "rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 sm:px-4"
                }
              >
                Deals
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("categories")}
                className={
                  activeTab === "categories"
                    ? "hidden rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:inline-flex sm:px-4"
                    : "hidden rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 sm:inline-flex sm:px-4"
                }
              >
                Categories
              </button>
            </nav>
            <button
              type="button"
              onClick={() => router.push(`/account/orders?creator=${encodeURIComponent(creator.slug)}`)}
              className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 sm:inline-flex"
            >
              Orders
            </button>
            {!authChecking &&
              (accountsUser ? (
                <div className="hidden items-center rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 sm:inline-flex">
                  <span className="truncate max-w-[120px]">
                    {(() => {
                      const email = accountsUser.email || "Pivota user";
                      return email.length > 8 ? `${email.slice(0, 8)}…` : email;
                    })()}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/account/login")}
                  className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 sm:inline-flex"
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
              {cartItems.length > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-900 px-1 text-[10px] font-semibold text-white">
                  {cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Main content: split layout (stacked on small screens, side-by-side on large) */}
        <div className="flex flex-1 flex-col lg:flex-row lg:overflow-hidden">
          {/* Left: chat column */}
          <section className="flex w-full flex-col border-b border-slate-200 bg-white/70 px-4 py-4 backdrop-blur-sm lg:w-[360px] lg:border-b-0 lg:border-r lg:px-6">
            <div className="mb-3 text-[12px] text-slate-600">
              Describe your needs (scenario, budget, style). I’ll start with pieces Nina featured, then similar
              matches.
            </div>

            {/* Messages area scrolls independently, input anchored at bottom */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-slate-800">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
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

          {/* Right: product feed / tabs content column */}
          <section className="flex flex-1 flex-col bg-white/40 px-4 py-4 lg:px-8">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {activeTab === "forYou" && (
                <>
                  {/* Featured for you */}
                  <div className="space-y-4">
                    <SectionHeader
                      title="Featured for you"
                      subtitle={`Based on ${creator.name}'s style and typical scenarios.`}
                    />
                    {(isFeaturedLoading || (isLoading && products.length === 0)) ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <div key={idx} className="h-40 animate-pulse rounded-3xl bg-slate-100" />
                        ))}
                      </div>
                    ) : products.length === 0 ? (
                      <div className="flex flex-1 items-center justify-center text-[12px] text-slate-500">
                        No candidates yet. Tell me what you need on the left.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {products.slice(0, 4).map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            creatorName={creator.name}
                            creatorId={creator.id}
                            creatorSlug={creator.slug}
                            onSeeSimilar={handleSeeSimilar}
                            onViewDetails={setDetailProduct}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Continue from last chat - recent user queries */}
                  <div className="mt-6 space-y-3">
                    <SectionHeader
                      title="Continue from last chat"
                      subtitle="Recent queries we worked on together. Tap to reuse a prompt."
                    />
                    <div className="flex flex-wrap gap-2">
                      {(recentQueries.length > 0
                        ? [...recentQueries].slice(-5).reverse()
                        : userQueries.map((m) => m.content).slice(-5).reverse()
                      ).map((query, idx) => (
                        <button
                          key={`${query}-${idx}`}
                          type="button"
                          className="max-w-xs rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-200"
                          onClick={() => setInput(query)}
                        >
                          {query}
                        </button>
                      ))}
                      {recentQueries.length === 0 && userQueries.length === 0 && (
                        <p className="text-[11px] text-slate-400">
                          Start chatting on the left to see recent queries here.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activeTab === "deals" && (
                <div className="space-y-4">
                  <SectionHeader
                    title="Creator deals"
                    subtitle="Bundle discounts and flash deals curated for this creator."
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {creatorDeals.map((deal) => (
                      <div
                        key={deal.dealId}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-700"
                      >
                        <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {deal.type === "MULTI_BUY_DISCOUNT" ? "Bundle & save" : "Flash deal"}
                        </div>
                        <div className="text-xs font-semibold text-slate-900">{deal.label}</div>
                        {deal.endAt && (
                          <p className="mt-1 text-[10px] text-slate-500">
                            Ends at {new Date(deal.endAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "categories" && (
                <div className="space-y-4">
                  <SectionHeader
                    title="Browse by category"
                    subtitle="Soon you’ll be able to jump directly into tops, bottoms, shoes and more."
                  />
                  <p className="text-[12px] text-slate-600">
                    Category-based browsing is coming soon. In the meantime, describe your scenario on the left
                    (commute, weekend coffee, light workout, etc.) and the agent will pick pieces across
                    categories for you.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Similar items drawer */}
        {similarBaseProduct && (
          <div className="fixed inset-0 z-30 flex items-end bg-black/40 px-4 pb-6 sm:items-center sm:pb-6 sm:pt-6">
            <div className="mx-auto flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 p-4 text-slate-50 shadow-2xl backdrop-blur-xl sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-50">Similar items you may like</h3>
                  <p className="text-[11px] text-slate-300">
                    Based on: {similarBaseProduct.title}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
                  onClick={() => {
                    setSimilarBaseProduct(null);
                    setSimilarItems([]);
                    setSimilarError(null);
                    setIsSimilarLoading(false);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-3 min-h-[140px] flex-1 overflow-y-auto">
                {isSimilarLoading && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <div key={idx} className="h-32 animate-pulse rounded-2xl bg-white/10" />
                    ))}
                  </div>
                )}

                {!isSimilarLoading && similarError && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-red-300">{similarError}</p>
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-slate-100 hover:bg-white/20"
                      onClick={() => handleSeeSimilar(similarBaseProduct)}
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
                      {similarItems.map((item) => (
                        <ProductCard
                          key={item.product.id}
                          product={item.product}
                          creatorName={creator.name}
                          creatorId={creator.id}
                          creatorSlug={creator.slug}
                          onSeeSimilar={handleSeeSimilar}
                          onViewDetails={setDetailProduct}
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
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6"
            onClick={() => setDetailProduct(null)}
          >
            <div
              className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 text-slate-900 shadow-2xl sm:p-6 md:flex md:gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 md:flex-[0_0_55%]">
                <div>
                  <h3 className="text-sm font-semibold">{detailProduct.title}</h3>
                  {detailProduct.merchantName && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Sold by {detailProduct.merchantName}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-700 hover:bg-slate-200"
                  onClick={() => setDetailProduct(null)}
                >
                  Close
                </button>
              </div>

              {detailProduct.imageUrl && (
                <div className="mt-3 overflow-hidden rounded-2xl bg-slate-100 md:mt-0 md:flex-1">
                  <img
                    src={detailProduct.imageUrl}
                    alt={detailProduct.title}
                    className="w-full object-cover"
                  />
                </div>
              )}

              <div className="mt-3 space-y-2 text-[13px]">
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
                    onClick={() => {
                      addItem({
                        id: detailProduct.id,
                        productId: detailProduct.id,
                        merchantId: detailProduct.merchantId,
                        title: detailProduct.title,
                        price: detailProduct.price,
                        imageUrl: detailProduct.imageUrl,
                        quantity: 1,
                        currency: detailProduct.currency,
                        creatorId: creator.id,
                        creatorSlug: creator.slug,
                        creatorName: creator.name,
                      });
                    }}
                  >
                    Add to cart
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-full border border-slate-300 px-3 py-2 text-[12px] font-medium text-slate-800 hover:bg-slate-100"
                    onClick={() => {
                      // Buy now: checkout with this single item only.
                      clear();
                      addItem({
                        id: detailProduct.id,
                        productId: detailProduct.id,
                        merchantId: detailProduct.merchantId,
                        title: detailProduct.title,
                        price: detailProduct.price,
                        imageUrl: detailProduct.imageUrl,
                        quantity: 1,
                        currency: detailProduct.currency,
                        creatorId: creator.id,
                        creatorSlug: creator.slug,
                        creatorName: creator.name,
                      });
                      close();
                      router.push("/checkout");
                    }}
                  >
                    Buy now
                  </button>
                </div>
                {detailProduct.detailUrl && (
                  <a
                    href={detailProduct.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-[11px] text-cyan-600 hover:underline"
                  >
                    Open store page
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {isDebug && (
          <div className="border-t border-slate-200 bg-slate-950/90 px-4 py-4 text-[11px] leading-relaxed text-white md:px-6 lg:px-10">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-1">
                <h3 className="mb-2 text-xs font-semibold text-white">lastRequest</h3>
                <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
                  {safeStringify(lastRequest)}
                </pre>
              </div>
              <div className="md:col-span-1">
                <h3 className="mb-2 text-xs font-semibold text-white">lastResponse</h3>
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
                  <h3 className="mb-2 text-xs font-semibold text-white">rawAgentResponse</h3>
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
