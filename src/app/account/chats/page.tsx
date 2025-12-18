'use client';

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCreatorBySlug } from "@/config/creatorAgents";
import { loadSessionIndex, type SessionMeta } from "@/lib/chatSessions";

function ChatsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const creatorSlugParam =
    searchParams?.get("creator") || searchParams?.get("creator_slug") || null;
  const creatorConfig = creatorSlugParam
    ? getCreatorBySlug(creatorSlugParam)
    : getCreatorBySlug("nina-studio");

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorConfig) {
      setLoading(false);
      return;
    }

    const sessionKey = `pivota_creator_sessions_${creatorConfig.slug}`;

    try {
      if (typeof window !== "undefined") {
        const { sessions: storedSessions } = loadSessionIndex(sessionKey);
        if (Array.isArray(storedSessions) && storedSessions.length > 0) {
          const filtered = storedSessions
            .filter((s) => s.creatorId === creatorConfig.id)
            .sort(
              (a, b) =>
                new Date(b.lastActiveAt).getTime() -
                new Date(a.lastActiveAt).getTime(),
            );
          if (filtered.length > 0) {
            setSessions(filtered);
            setLoading(false);
            return;
          }
        }
      }
    } catch (err) {
      console.error("Failed to load chat sessions", err);
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
    const params = new URLSearchParams();
    params.set("tab", "forYou");
    params.set("entry", "history");
    params.set("prefill", query);
    router.push(
      `/creator/${encodeURIComponent(creatorConfig.slug)}?${params.toString()}`,
    );
  };

  const handleOpenSession = (session: SessionMeta) => {
    if (!creatorConfig) return;
    const params = new URLSearchParams();
    params.set("tab", "forYou");
    params.set("entry", "history");
    params.set("sessionId", session.id);
    if (session.lastUserQuery) {
      params.set("prefill", session.lastUserQuery);
    }
    router.push(
      `/creator/${encodeURIComponent(creatorConfig.slug)}?${params.toString()}`,
    );
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
          ) : sessions.length > 0 ? (
            <div className="flex flex-col gap-2">
              {sessions.map((s) => {
                const isCompleted =
                  s.status === "ARCHIVED" || s.taskState === "TASK_COMPLETED";
                const statusLabel = isCompleted ? "Completed" : "In progress";
                const statusClass = isCompleted
                  ? "rounded-full bg-[#ffe7ed] px-2 py-0.5 text-[10px] text-[#d66a7c]"
                  : "rounded-full bg-[#e3f0ff] px-2 py-0.5 text-[10px] text-[#4a74c0]";
                let timeLabel = "";
                try {
                  timeLabel = new Date(s.lastActiveAt).toLocaleString();
                } catch {
                  timeLabel = s.lastActiveAt;
                }

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleOpenSession(s)}
                    className="flex items-center justify-between rounded-2xl border border-[#f4e2d4] bg-white/90 px-4 py-2.5 text-left shadow-sm hover:bg-[#fff7ee]"
                  >
                    <div className="flex-1">
                      <div className="line-clamp-2 text-[12px] font-medium text-[#3f3125]">
                        {s.lastUserQuery || "Untitled chat"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#a38b78]">
                        {timeLabel}
                      </div>
                    </div>
                    <div className="ml-3 flex flex-col items-end gap-1">
                      <span className={statusClass}>{statusLabel}</span>
                      <span className="text-[11px] text-[#c19a7d]">›</span>
                    </div>
                  </button>
                );
              })}
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
