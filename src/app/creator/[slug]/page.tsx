'use client';

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send, Users, ShoppingCart } from "lucide-react";
import { getCreatorBySlug, type CreatorAgentConfig } from "@/config/creatorAgents";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useCart } from "@/components/cart/CartProvider";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const RECOMMENDED_PRODUCTS: Product[] = [
  {
    id: "rec-1",
    title: "Everyday Stainless Bottle 600ml",
    description: "Minimal stainless bottle for desk or commute.",
    price: 22,
    currency: "USD",
    imageUrl:
      "https://images.pexels.com/photos/3735551/pexels-photo-3735551.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventoryQuantity: 25,
  },
  {
    id: "rec-2",
    title: "CloudFit Daily Hoodie",
    description: "Soft brushed fleece, perfect for casual days.",
    price: 68,
    currency: "USD",
    imageUrl:
      "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventoryQuantity: 18,
  },
  {
    id: "rec-3",
    title: "Urban Tech Runner",
    description: "Lightweight commuter sneakers with breathable mesh.",
    price: 109,
    currency: "USD",
    imageUrl:
      "https://images.pexels.com/photos/1124466/pexels-photo-1124466.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventoryQuantity: 14,
  },
  {
    id: "rec-4",
    title: "Minimal Essential Hoodie",
    description: "Clean silhouette, pairs with everything.",
    price: 59,
    currency: "USD",
    imageUrl:
      "https://images.pexels.com/photos/7671167/pexels-photo-7671167.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventoryQuantity: 22,
  },
];

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
  const [products, setProducts] = useState<Product[]>(RECOMMENDED_PRODUCTS);
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);

  const searchParams = useSearchParams();
  const isDebug = useMemo(() => searchParams?.get("debug") === "1", [searchParams]);
  const { items: cartItems, open: openCart } = useCart();

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

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
        },
      ]);
      setProducts((data.products && data.products.length > 0 ? data.products : RECOMMENDED_PRODUCTS));
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

  const userQueries = messages.filter((m) => m.role === "user");

  return (
    <main className="h-screen bg-gradient-to-b from-[#f8fbff] via-[#eef3fb] to-[#e6ecf7] text-slate-900">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-purple-300/20 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-screen flex-col">
        {/* Top header: creator brand + tabs + cart, full-width */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 text-xs shadow-sm backdrop-blur-sm sm:text-sm md:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 shadow-sm sm:h-11 sm:w-11">
              <img src={creator.avatarUrl} alt={creator.name} className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-900 sm:text-base">{creator.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                  <Users className="h-3 w-3" />
                  Creator Agent
                </span>
              </div>
              {creator.tagline && (
                <p className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">{creator.tagline}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <nav className="hidden items-center gap-1 text-xs sm:flex sm:text-sm">
              <button className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 sm:px-4">
                For You
              </button>
              <button className="rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 sm:px-4">
                Deals
              </button>
              <button className="hidden rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 sm:inline-flex">
                Categories
              </button>
              <button className="hidden rounded-full px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 md:inline-flex">
                Creators
              </button>
            </nav>
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

        {/* Main content: full-screen split layout */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
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
                          : "max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-bl-sm bg-gradient-to-r from-[#7c8cff] via-[#62b2ff] to-[#7fffe1] px-4 py-3 text-xs text-slate-900 shadow-md"
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

          {/* Right: product feed column */}
          <section className="flex flex-1 flex-col bg-white/40 px-4 py-4 lg:px-8">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Featured for you */}
              <div className="space-y-4">
                <SectionHeader
                  title="Featured for you"
                  subtitle={`Based on ${creator.name}'s style and typical scenarios.`}
                />
                {isLoading && products.length === 0 ? (
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
                      <ProductCard key={p.id} product={p} creatorName={creator.name} />
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
                  {userQueries
                    .slice(-5)
                    .reverse()
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="max-w-xs rounded-full bg-slate-100 px-3 py-1.5 text-[11px] text-slate-700 hover:bg-slate-200"
                        onClick={() => setInput(m.content)}
                      >
                        {m.content}
                      </button>
                    ))}
                  {userQueries.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      Start chatting on the left to see recent queries here.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

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
