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

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

interface CreatorAgentContextValue {
  creator: CreatorAgentConfig;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  products: Product[];
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
  const router = useRouter();
  const { items: cartItems, open: openCart, addItem, clear, close } = useCart();

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
  const [isMobile, setIsMobile] = useState(false);

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
    if (isMobile) {
      const params = new URLSearchParams();
      if (base.merchantId) {
        params.set("merchant_id", base.merchantId);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => {
      setIsMobile(window.innerWidth < 768);
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
            messages: [] as {
              role: "user" | "assistant";
              content: string;
            }[],
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
          const withDeals = isMockMode
            ? attachMockDeals(data.products)
            : data.products;
          setProducts(withDeals);
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
    if (similarBaseProduct) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = original;
    }
    return () => {
      document.body.style.overflow = original;
    };
  }, [similarBaseProduct]);

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

  const value: CreatorAgentContextValue = {
    creator,
    messages,
    input,
    setInput,
    isLoading,
    products,
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
