'use client';

import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send, Users } from "lucide-react";
import { getCreatorBySlug, type CreatorAgentConfig } from "@/config/creatorAgents";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-50">
        <div className="text-sm text-slate-400">Creator agent 未找到。</div>
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
        `嗨，我是基于 ${creator.name} 内容训练出来的购物助手 👋\n\n` +
        `你可以这样问我：\n` +
        `• 想要一套和你春夏通勤视频类似的搭配\n` +
        `• 帮我选一双适合上班又能走很多路的鞋\n` +
        `• 预算 800 内，找一件你那种中性一点的风衣`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);

  const searchParams = useSearchParams();
  const isDebug = useMemo(() => searchParams?.get("debug") === "1", [searchParams]);

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
      setProducts(data.products ?? []);
    } catch (error) {
      console.error(error);
      setLastResponse((prev: any) => prev ?? { error: "request failed", detail: String(error) });
      setMessages((prev) => [
        ...prev,
        {
          id: `a-error-${Date.now()}`,
          role: "assistant",
          content: "我这边连后端遇到一点问题，你可以稍后再试一下 🙏",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0b1021] via-[#0a0f1d] to-[#080c18] text-slate-50">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-white/10 shadow-glass">
              <img src={creator.avatarUrl} alt={creator.name} className="h-full w-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-50">{creator.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200">
                  <Users className="h-3 w-3" />
                  Creator Agent
                </span>
              </div>
              {creator.tagline && <p className="mt-0.5 text-xs text-slate-400">{creator.tagline}</p>}
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <section className="flex min-h-[520px] flex-col rounded-[28px] border border-white/5 bg-gradient-to-b from-[#0f162c] to-[#0b1021] p-4 shadow-glass backdrop-blur-xl">
            <div className="mb-3 text-[12px] text-slate-300">
              描述你的需求（场景 + 预算 + 风格），我会优先从 {creator.name} 用过/搭配过的单品里帮你找，其次才是同风格补充。
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[80%] rounded-3xl rounded-br-sm bg-white/10 px-3 py-2 text-xs text-slate-100 shadow-sm"
                        : "max-w-[80%] whitespace-pre-wrap rounded-3xl rounded-bl-sm bg-gradient-to-r from-[#8d7bff] via-[#7f8bff] to-[#62b2ff] px-4 py-3 text-xs text-white shadow-lg"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {isLoading && (
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                正在为你筛选商品…
              </div>
            )}
            </div>

            {isLoading && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 animate-[pulse_1.2s_ease-in-out_infinite] bg-gradient-to-r from-[#8d7bff] via-[#62b2ff] to-[#7fffe1]" />
              </div>
            )}

            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-full bg-[#0c1224] px-3 py-2 ring-1 ring-inset ring-white/10 focus-within:ring-2 focus-within:ring-cyan-300/60">
                <input
                  className="flex-1 bg-transparent px-1 text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  placeholder="例如：预算 800 内的通勤风衣，偏中性、不要大 logo…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#8d7bff] via-[#7f8bff] to-[#62b2ff] text-[11px] text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section className="flex min-h-[520px] flex-col rounded-[28px] border border-white/5 bg-gradient-to-b from-[#0f162c] to-[#0b1021] p-4 shadow-glass backdrop-blur-xl">
            <SectionHeader
              title="为你挑出的商品"
              subtitle={`优先展示 ${creator.name} 穿搭/内容里出现过的单品，其次是同风格补充。`}
            />

            {isLoading && products.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="h-40 animate-pulse rounded-3xl bg-white/5" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-slate-400">
                还没有候选商品，先在左侧和我聊聊你的需求吧。
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} creatorName={creator.name} />
                ))}
              </div>
            )}
          </section>
        </div>

        {isDebug && (
          <div className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-[11px] leading-relaxed">
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-100">lastRequest</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
                {safeStringify(lastRequest)}
              </pre>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold text-slate-100">lastResponse</h3>
              <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed">
                {safeStringify(lastResponse)}
              </pre>
            </div>
            {lastResponse?.rawAgentResponse && (
              <div>
                <h3 className="mb-2 text-xs font-semibold text-slate-100">rawAgentResponse</h3>
                <pre className="max-h-48 overflow-auto rounded-lg bg-black/60 p-2 font-mono text-[10px] leading-relaxed">
                  {safeStringify(lastResponse.rawAgentResponse)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
