"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listQuestions, postQuestion, type QuestionListItem } from "@/lib/accountsClient";
import { cn } from "@/lib/utils";

export default function QuestionsListClient() {
  const router = useRouter();
  const params = useSearchParams();

  const productId = (params.get("product_id") || params.get("productId") || "").trim();
  const productGroupId = (params.get("product_group_id") || params.get("productGroupId") || "").trim() || null;
  const returnTo = (params.get("return_to") || "").trim();

  const [notice, setNotice] = useState<{ message: string; tone: "info" | "error" } | null>(null);
  const [items, setItems] = useState<QuestionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), notice.tone === "error" ? 4000 : 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const res = await listQuestions({ productId, ...(productGroupId ? { productGroupId } : {}), limit: 50 });
        if (cancelled) return;
        setItems(res?.items || []);
      } catch (e: any) {
        if (!cancelled) setNotice({ message: e?.message || "Failed to load questions", tone: "error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [productGroupId, productId]);

  const requireLogin = (intent: "question" | "reply") => {
    const redirect =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/community/questions";
    setNotice({
      message: intent === "reply" ? "Please sign in to reply." : "Please sign in to ask a question.",
      tone: "info",
    });
    router.push(`/account/login?return_to=${encodeURIComponent(redirect)}`);
  };

  const submitQuestion = async () => {
    const text = askText.trim();
    if (!text) {
      setNotice({ message: "Please enter a question.", tone: "info" });
      return;
    }
    if (!productId || submitting) return;

    setSubmitting(true);
    try {
      const res = await postQuestion({
        productId,
        ...(productGroupId ? { productGroupId } : {}),
        question: text,
      });
      const qid = Number((res as any)?.question_id ?? (res as any)?.questionId ?? (res as any)?.id) || Date.now();
      setItems((prev) => [{ question_id: qid, question: text, created_at: new Date().toISOString(), replies: 0 }, ...prev]);
      setAskText("");
      setAskOpen(false);
      setNotice({ message: "Question submitted.", tone: "info" });
    } catch (e: any) {
      if (e?.status === 401 || e?.code === "NOT_AUTHENTICATED") {
        requireLogin("question");
        return;
      }
      setNotice({ message: e?.message || "Failed to submit question.", tone: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-mesh px-4 py-10">
      {notice ? (
        <div className="fixed inset-x-0 top-16 z-[2147483647] px-3">
          <div
            className={cn(
              "mx-auto max-w-2xl rounded-xl border px-3 py-2 text-xs shadow-md",
              notice.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-slate-900 bg-slate-900 text-white",
            )}
            role="status"
            aria-live="polite"
          >
            {notice.message}
          </div>
        </div>
      ) : null}

      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-9 w-9 rounded-full border border-border bg-white/80 flex items-center justify-center"
              aria-label="Go back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-semibold">Questions</h1>
              <p className="text-xs text-muted-foreground">Ask and answer questions from the community.</p>
            </div>
          </div>
          <Button size="sm" className="rounded-full" onClick={() => setAskOpen(true)} disabled={!productId}>
            Ask a question
          </Button>
        </div>

        {!productId ? (
          <div className="rounded-2xl border border-border bg-white/70 p-6 text-sm text-muted-foreground">
            Missing product context. Open this page from a PDP “Questions” section.
          </div>
        ) : null}

        {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

        {productId && !loading ? (
          <div className="space-y-3">
            {items.length ? (
              items.map((q) => (
                <Link
                  key={String(q.question_id)}
                  href={`/community/questions/${q.question_id}?${params.toString()}`}
                  className="block rounded-2xl border border-border bg-white/70 p-4 hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-semibold leading-snug">{q.question}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {(q.replies || 0) === 1 ? "1 reply" : `${q.replies || 0} replies`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-0.5" />
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-white/70 p-6 text-sm text-muted-foreground">
                No questions yet. Be the first to ask!
              </div>
            )}
          </div>
        ) : null}

        {returnTo.startsWith("/") ? (
          <div className="text-xs text-muted-foreground">
            <Link href={returnTo} className="hover:underline">
              Back to product
            </Link>
          </div>
        ) : null}
      </div>

      {askOpen ? (
        <div className="fixed inset-0 z-[2147483647] flex items-end justify-center bg-black/40 px-3 py-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Ask a question</h3>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-border text-muted-foreground"
                onClick={() => {
                  if (!submitting) setAskOpen(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Ask about sizing, materials, shipping, or anything else.</p>
            <textarea
              className="mt-3 w-full min-h-[120px] rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              placeholder="Type your question…"
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              disabled={submitting}
            />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                disabled={submitting}
                onClick={() => setAskOpen(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1 rounded-xl" disabled={submitting} onClick={submitQuestion}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
