'use client';

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCreatorBySlug } from "@/config/creatorAgents";

function ChatsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const creatorSlugParam =
    searchParams?.get("creator") || searchParams?.get("creator_slug") || null;
  const creatorConfig = creatorSlugParam
    ? getCreatorBySlug(creatorSlugParam)
    : getCreatorBySlug("nina-studio");

  const [queries, setQueries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorConfig) {
      setLoading(false);
      return;
    }
    try {
      const key = `pivota_creator_recent_queries_${creatorConfig.slug}`;
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const cleaned = parsed
            .filter((q) => typeof q === "string")
            .slice(-20)
            .reverse();
          setQueries(cleaned);
        }
      }
    } catch (err) {
      console.error("Failed to load recent chats", err);
    } finally {
      setLoading(false);
    }
  }, [creatorConfig]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    if (creatorConfig) {
      router.push(`/account/profile?creator=${encodeURIComponent(creatorConfig.slug)}`);
    } else {
      router.push("/account/profile");
    }
  };

  const handleUseQuery = (query: string) => {
    if (!creatorConfig) return;
    const url = `/creator/${encodeURIComponent(
      creatorConfig.slug,
    )}?tab=forYou&prefill=${encodeURIComponent(query)}`;
    router.push(url);
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fffefc] via-[#fffaf6] to-[#fff7f2] text-[#3f3125]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-[#f4e2d4] pb-4">
          <div>
            <h1 className="text-xl font-semibold text-[#3f3125]">
              Recent chats
            </h1>
            <p className="mt-1 text-xs text-[#a38b78]">
              Tap a previous query to continue the conversation with the creator agent.
            </p>
          </div>
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-[#f0e2d6] bg-white px-3 py-1.5 text-xs text-[#8c715c] shadow-sm hover:bg-[#fff0e3]"
          >
            Back
          </button>
        </header>

        <section className="flex flex-1 flex-col gap-3 pb-8 text-sm">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-10 rounded-2xl bg-[#f5e3d4]/70 animate-pulse"
                />
              ))}
            </div>
          ) : queries.length === 0 ? (
            <p className="text-[13px] text-[#8c715c]">
              You don’t have any recent chats yet. Ask the creator agent a question on the
              creator page and your latest prompts will appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {queries.map((q, idx) => (
                <button
                  key={`${q}-${idx}`}
                  type="button"
                  onClick={() => handleUseQuery(q)}
                  className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-2.5 text-left shadow-sm hover:bg-[#fff7ee]"
                >
                  <span className="line-clamp-2 text-[12px] text-[#3f3125]">
                    {q}
                  </span>
                  <span className="ml-3 text-[11px] text-[#c19a7d]">›</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function ChatsPage() {
  return (
    <Suspense>
      <ChatsPageInner />
    </Suspense>
  );
}

