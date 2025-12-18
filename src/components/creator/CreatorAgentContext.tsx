'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { accountsMe, type AccountsUser } from "@/lib/accountsClient";
import { attachMockDeals, MOCK_DEALS } from "@/config/dealsMock";
import type {
  Product,
  SimilarProductItem,
  ProductBestDeal,
} from "@/types/product";
import type { CreatorAgentConfig } from "@/config/creatorAgents";
import {
  createInitialSession,
  decideEntryBehavior,
  DEFAULT_CONFIG,
  loadSessionIndex,
  saveSessionIndex,
  updateSessionOnMessages,
} from "@/lib/chatSessions";
import type {
  SessionMeta,
  EntryContext as SessionEntryContext,
  DecisionResult,
  TaskState,
} from "@/lib/chatSessions";
import type { ChatMessage } from "@/types/chat";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "unknown";
  const KEY = "pivota_device_id";
  let existing = window.localStorage.getItem(KEY);
  if (!existing) {
    existing = `dev_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(KEY, existing);
  }
  return existing;
}

function buildInitialMessages(creator: CreatorAgentConfig): ChatMessage[] {
  return [
    {
      id: "welcome-1",
      role: "assistant",
      content:
        `Hi! I'm the shopping agent tuned for ${creator.name}.\n\n` +
        `Try asking:\n` +
        `• A commuter outfit similar to your spring/summer looks\n` +
        `• Shoes that are great for long walks to work\n` +
        `• A clean, minimalist windbreaker under $120`,
    },
  ];
}

interface CreatorAgentContextValue {
  creator: CreatorAgentConfig;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  products: Product[];
  chatRecommendations: Product[];
  lastRequest: any;
  lastResponse: any;
  isFeaturedLoading: boolean;
  isDebug: boolean;
  isMockMode: boolean;
  userQueries: ChatMessage[];
  recentQueries: string[];
  creatorDeals: ProductBestDeal[];
  accountsUser: AccountsUser | null;
  authChecking: boolean;
  currentSession: SessionMeta | null;
  sessionDecision: DecisionResult | null;
  startNewSession: () => void;
  similarBaseProduct: Product | null;
  similarItems: SimilarProductItem[];
  isSimilarLoading: boolean;
  similarError: string | null;
  detailProduct: Product | null;
  isMobile: boolean;
  prefetchProductDetail: (product: Product) => void;
  openDetail: (product: Product) => void;
  closeDetail: () => void;
  closeSimilar: () => void;
  handleSend: () => Promise<void>;
  handleSeeSimilar: (base: Product) => Promise<void>;
  handleViewDetails: (base: Product) => void;
  setPromptFromContext: (prompt: string) => void;
  setSimilarBaseProduct: (product: Product | null) => void;
  setSimilarItems: (items: SimilarProductItem[]) => void;
  setSimilarError: (value: string | null) => void;
  safeStringify: (value: any) => string;
  openCart: () => void;
  cartItemsCount: number;
  addToCart: (product: Product) => void;
  buyNow: (product: Product) => void;
}

const CreatorAgentContext = createContext<CreatorAgentContextValue | null>(
  null,
);

export function CreatorAgentProvider({
  creator,
  children,
}: {
  creator: CreatorAgentConfig;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const isDebug = useMemo(
    () => searchParams?.get("debug") === "1",
    [searchParams],
  );
  const entrySource = useMemo<SessionEntryContext["entrySource"]>(() => {
    const raw = searchParams?.get("entry")?.toLowerCase();
    switch (raw) {
      case "profile":
        return "PROFILE";
      case "history":
        return "HISTORY";
      case "deeplink":
        return "DEEPLINK";
      case "checkout":
        return "CHECKOUT";
      case "support":
        return "SUPPORT";
      default:
        return "HOME";
    }
  }, [searchParams]);
  const requestedSessionId = useMemo(
    () => searchParams?.get("sessionId") ?? undefined,
    [searchParams],
  );
  const router = useRouter();
  const { items: cartItems, open: openCart, addItem, clear, close } = useCart();

  const [messages, setMessages] = useState<ChatMessage[]>([
    ...buildInitialMessages(creator),
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [chatRecommendations, setChatRecommendations] = useState<Product[]>([]);
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(true);
  const [accountsUser, setAccountsUser] = useState<AccountsUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [similarBaseProduct, setSimilarBaseProduct] =
    useState<Product | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarProductItem[]>([]);
  const [isSimilarLoading, setIsSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    // Align with Tailwind `lg` breakpoint (desktop layout starts at 1024px).
    return window.innerWidth < 1024;
  });
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionMeta | null>(
    null,
  );
  const [sessionDecision, setSessionDecision] =
    useState<DecisionResult | null>(null);

  // Cache for enriched product-detail responses so that desktop modals
  // can open with full Style/Size and images immediately when possible.
  const detailCacheRef = useRef<Map<string, Product>>(new Map());
  const detailInFlightRef = useRef<Set<string>>(new Set());

  const makeCacheKey = (p: { id?: string; merchantId?: string | null }) => {
    if (!p.id) return "";
    return p.merchantId ? `${p.merchantId}:${p.id}` : String(p.id);
  };

  const prefetchProductDetail = useCallback(
    async (base: Product) => {
      if (!base.id || !base.merchantId) return;
      const key = makeCacheKey(base);
      if (!key) return;
      if (detailCacheRef.current.has(key) || detailInFlightRef.current.has(key)) {
        return;
      }

      detailInFlightRef.current.add(key);
      try {
        const res = await fetch("/api/creator-agent/product-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantId: base.merchantId,
            productId: base.id,
          }),
        });

        if (!res.ok) return;
        const data = (await res.json()) as { product?: Product };
        if (!data.product) return;

        const merged: Product = { ...base, ...data.product };
        detailCacheRef.current.set(key, merged);

         // Eagerly prefetch primary images so that when the user opens
         // the desktop detail modal, the gallery can render without an
         // extra image round-trip.
         if (typeof window !== "undefined") {
           try {
             const urls = new Set<string>();
             if (merged.imageUrl) {
               urls.add(merged.imageUrl);
             }
             if (Array.isArray(merged.images) && merged.images.length > 0) {
               merged.images.slice(0, 4).forEach((u) => {
                 if (typeof u === "string" && u.trim()) {
                   urls.add(u);
                 }
               });
             }
             urls.forEach((url) => {
               try {
                 const img = new Image();
                 img.src = url;
               } catch {
                 // ignore individual preload errors
               }
             });
           } catch (err) {
             console.error("[creator detail] image preload error", err);
           }
         }

        // If the modal is currently showing this product, update it in-place.
        setDetailProduct((prev) => {
          if (!prev) return prev;
          const prevKey = makeCacheKey(prev);
          return prevKey === key ? merged : prev;
        });
      } catch (err) {
        console.error("[creator detail] prefetch error", err);
      } finally {
        detailInFlightRef.current.delete(key);
      }
    },
    [],
  );

  const isMockMode =
    process.env.NODE_ENV !== "production" &&
    !process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL;

  const recentQueriesStorageKey = useMemo(
    () => `pivota_creator_recent_queries_${creator.slug}`,
    [creator.slug],
  );

  const sessionStorageKey = useMemo(
    () => `pivota_creator_sessions_${creator.slug}`,
    [creator.slug],
  );

  const sessionMessagesStorageKey = useMemo(
    () => `pivota_creator_session_messages_${creator.slug}`,
    [creator.slug],
  );

  const deviceId = useMemo(() => getOrCreateDeviceId(), []);

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

    setRecentQueries((prev) => {
      const withoutDuplicate = prev.filter((q) => q !== trimmed);
      const updated = [...withoutDuplicate, trimmed].slice(-5);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            recentQueriesStorageKey,
            JSON.stringify(updated),
          );
        } catch (err) {
          console.error("Failed to persist recent queries", err);
        }
      }
      return updated;
    });

    setRecentQueries((prev) => {
      const withoutDuplicate = prev.filter((q) => q !== trimmed);
      const updated = [...withoutDuplicate, trimmed].slice(-5);
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(
            recentQueriesStorageKey,
            JSON.stringify(updated),
          );
        } catch (err) {
          console.error("Failed to persist recent queries", err);
        }
      }
      return updated;
    });

    const historyForBackend = (() => {
      const base = [...recentQueries, trimmed];
      const unique = base.filter((q, idx) => base.indexOf(q) === idx);
      return unique
        .slice(-5)
        .map((q) => (q.length > 80 ? q.slice(0, 80) : q));
    })();

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
          recentQueries: historyForBackend,
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
      const withDeals = isMockMode
        ? attachMockDeals(normalizedProducts)
        : normalizedProducts;

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
        },
      ]);
      setProducts(withDeals);
      if (withDeals.length > 0) {
        setChatRecommendations(withDeals);
      }
    } catch (error) {
      console.error(error);
      setLastResponse((prev: any) =>
        prev ?? { error: "request failed", detail: String(error) },
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `a-error-${Date.now()}`,
          role: "assistant",
          content:
            "I'm having trouble reaching the backend. Please try again in a moment 🙏",
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
          limit: 9,
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

  const handleViewDetails = (base: Product) => {
    // On mobile, navigate to full product detail page.
    // On desktop, open the inline detail modal and let the layout render it.
    const isMobileViewport =
      isMobile ||
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 1023px)").matches);

    if (isMobileViewport) {
      const effectiveMerchantId =
        base.merchantId || (base as any)?.merchant_id || null;
      const params = new URLSearchParams();
      if (effectiveMerchantId) {
        params.set("merchant_id", effectiveMerchantId);
      }
      const query = params.toString();
      router.push(
        `/creator/${creator.slug}/product/${encodeURIComponent(base.id)}${
          query ? `?${query}` : ""
        }`,
      );
    } else {
      openDetail(base);
    }
  };

  const userQueries = useMemo(
    () => messages.filter((m) => m.role === "user"),
    [messages],
  );

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

  // 初始化会话（仅本地），基于简单入口策略。
  useEffect(() => {
    if (typeof window === "undefined") return;

    const { sessions: storedSessions, currentSessionId } = loadSessionIndex(
      sessionStorageKey,
    );
    const filtered = storedSessions.filter(
      (s) => s.creatorId === creator.id,
    );

    const now = new Date();
    const ctx: SessionEntryContext = {
      entrySource,
      userId: null,
      deviceId,
      creatorId: creator.id,
      currentSessionId: currentSessionId ?? undefined,
      requestedSessionId,
    };

    const decision = decideEntryBehavior(ctx, filtered, now, DEFAULT_CONFIG);
    setSessionDecision(decision);

    let nextSessions = filtered;
    let active: SessionMeta | null = null;

    if (decision.action === "CREATE_NEW" || filtered.length === 0) {
      active = createInitialSession(ctx, now);
      nextSessions = [...filtered, active];
    } else {
      const targetId = decision.sessionId ?? currentSessionId;
      active =
        (targetId && nextSessions.find((s) => s.id === targetId)) ||
        nextSessions[0] ||
        null;
      if (!active) {
        active = createInitialSession(ctx, now);
        nextSessions = [...nextSessions, active];
      }
    }

    setSessions(nextSessions);
    setCurrentSession(active);

     // 为当前会话加载历史消息，如果没有则回退到欢迎消息。
    try {
      const raw = window.localStorage.getItem(sessionMessagesStorageKey);
      if (raw && active?.id) {
        const parsed = JSON.parse(raw) as Record<string, ChatMessage[]>;
        const existing = parsed?.[active.id];
        if (Array.isArray(existing) && existing.length > 0) {
          setMessages(existing);
        } else {
          setMessages(buildInitialMessages(creator));
        }
      } else {
        setMessages(buildInitialMessages(creator));
      }
    } catch {
      setMessages(buildInitialMessages(creator));
    }

    saveSessionIndex(sessionStorageKey, {
      sessions: nextSessions,
      currentSessionId: active?.id ?? null,
    });
  }, [
    creator,
    deviceId,
    sessionStorageKey,
    entrySource,
    requestedSessionId,
    sessionMessagesStorageKey,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    check();
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("resize", check);
    };
  }, []);

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

  // 根据消息更新当前会话摘要/时间戳。
  useEffect(() => {
    if (!currentSession) return;
    const now = new Date();
    const updated = updateSessionOnMessages(currentSession, messages, now);
    setCurrentSession(updated);
    setSessions((prev) => {
      const next = prev.map((s) => (s.id === updated.id ? updated : s));
      saveSessionIndex(sessionStorageKey, {
        sessions: next,
        currentSessionId: updated.id,
      });
      return next;
    });
  }, [messages, currentSession, sessionStorageKey]);

  // 按会话持久化消息，便于从 Profile/历史记录恢复时还原上下文。
  useEffect(() => {
    if (!currentSession) return;
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(sessionMessagesStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const store: Record<string, ChatMessage[]> =
        parsed && typeof parsed === "object" ? parsed : {};
      store[currentSession.id] = messages;
      window.localStorage.setItem(
        sessionMessagesStorageKey,
        JSON.stringify(store),
      );
    } catch (err) {
      console.error("Failed to persist session messages", err);
    }
  }, [messages, currentSession, sessionMessagesStorageKey]);

  useEffect(() => {
    let cancelled = false;

    const loadFeatured = async () => {
      try {
        setIsFeaturedLoading(true);
        const historyForBackend = recentQueries
          .slice(-5)
          .map((q) => (q.length > 80 ? q.slice(0, 80) : q));

        const res = await fetch("/api/creator-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creatorId: creator.id,
            messages: [] as {
              role: "user" | "assistant";
              content: string;
            }[],
            userId: accountsUser?.id || accountsUser?.email || null,
            recentQueries: historyForBackend,
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
          const withDeals = isMockMode
            ? attachMockDeals(data.products)
            : data.products;
          setProducts(withDeals);
          // Do not overwrite chatRecommendations here; keep these for Featured section only.

          // Optimistically prefetch detail for the first batch of featured
          // products so desktop detail modals can open with Style/Size and
          // images immediately.
          withDeals.slice(0, 6).forEach((p) => {
            void prefetchProductDetail(p);
          });
        }

        if (isDebug) {
          setLastRequest((prev: any) =>
            prev ?? {
              creatorId: creator.id,
              messages: [],
              payload: {
                search: {
                  query: "Show popular items",
                  in_stock_only: false,
                  limit: 10,
                },
              },
            },
          );
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
  }, [
    creator.id,
    isDebug,
    isMockMode,
    accountsUser?.id,
    accountsUser?.email,
    recentQueries,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const original = document.body.style.overflow;
    const shouldLock = Boolean(similarBaseProduct || detailProduct);
    if (shouldLock) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = original;
    }
    return () => {
      document.body.style.overflow = original;
    };
  }, [similarBaseProduct, detailProduct]);

  const cartItemsCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const openDetail = (product: Product) => {
    // Prefer cached enriched detail if available, otherwise fall back to
    // the base product and start a prefetch in the background.
    const cachedKey = makeCacheKey(product);
    const cached =
      cachedKey && detailCacheRef.current.has(cachedKey)
        ? detailCacheRef.current.get(cachedKey)!
        : null;
    setDetailProduct(cached ?? product);
    // Fire and forget; prefetch will update the modal when data arrives.
    void prefetchProductDetail(product);
  };

  const closeDetail = () => {
    setDetailProduct(null);
  };

  const closeSimilar = () => {
    setSimilarBaseProduct(null);
    setSimilarItems([]);
    setSimilarError(null);
    setIsSimilarLoading(false);
  };

  const setPromptFromContext = (prompt: string) => {
    setInput(prompt);
  };

  const addToCart = (product: Product) => {
    addItem({
      id: product.id,
      productId: product.id,
      merchantId: product.merchantId,
      title: product.title,
      price: product.price,
      imageUrl: product.imageUrl,
      quantity: 1,
      currency: product.currency,
      creatorId: creator.id,
      creatorSlug: creator.slug,
      creatorName: creator.name,
      bestDeal: product.bestDeal ?? null,
      allDeals: product.allDeals ?? null,
    });
  };

  const buyNow = (product: Product) => {
    clear();
    addToCart(product);
    close();
    router.push("/checkout");
  };

  const startNewSession = () => {
    const now = new Date();
    const ctx: SessionEntryContext = {
      entrySource: "HOME",
      userId: accountsUser?.id || accountsUser?.email || null,
      deviceId,
      creatorId: creator.id,
    };

    const archivedSessions: SessionMeta[] = sessions.map((s) =>
      s.id === currentSession?.id && s.status !== "ARCHIVED"
        ? {
            ...s,
            status: "ARCHIVED",
            taskState:
              s.taskState === "TASK_COMPLETED"
                ? s.taskState
                : ("TASK_COMPLETED" as TaskState),
            archivedAt: now.toISOString(),
            completedAt: s.completedAt ?? now.toISOString(),
          }
        : s,
    );

    const newSession = createInitialSession(ctx, now);
    const nextSessions = [...archivedSessions, newSession];
    setSessions(nextSessions);
    setCurrentSession(newSession);
    setSessionDecision({
      action: "CREATE_NEW",
      sessionId: newSession.id,
      ui: {},
    });
    setChatRecommendations([]);
    setMessages(buildInitialMessages(creator));
    saveSessionIndex(sessionStorageKey, {
      sessions: nextSessions,
      currentSessionId: newSession.id,
    });
  };

  const value: CreatorAgentContextValue = {
    creator,
    messages,
    input,
    setInput,
    isLoading,
    products,
    chatRecommendations,
    lastRequest,
    lastResponse,
    isFeaturedLoading,
    isDebug,
    isMockMode,
    userQueries,
    recentQueries,
    creatorDeals,
    accountsUser,
    authChecking,
    currentSession,
    sessionDecision,
    startNewSession,
    similarBaseProduct,
    similarItems,
    isSimilarLoading,
    similarError,
    detailProduct,
    isMobile,
    prefetchProductDetail,
    openDetail,
    closeDetail,
    closeSimilar,
    handleSend,
    handleSeeSimilar,
    handleViewDetails,
    setPromptFromContext,
    setSimilarBaseProduct,
    setSimilarItems,
    setSimilarError,
    safeStringify,
    openCart,
    cartItemsCount,
    addToCart,
    buyNow,
  };

  return (
    <CreatorAgentContext.Provider value={value}>
      {children}
    </CreatorAgentContext.Provider>
  );
}

export function useCreatorAgent(): CreatorAgentContextValue {
  const ctx = useContext(CreatorAgentContext);
  if (!ctx) {
    throw new Error("useCreatorAgent must be used within CreatorAgentProvider");
  }
  return ctx;
}
