import type {
  RawProduct,
  FindSimilarProductsResponse,
  SimilarProductItem,
  Product,
} from "@/types/product";
import { mapRawProduct } from "@/lib/productMapper";
import {
  getCreatorAgentAuthHeaders,
  getOptionalCreatorInvokeUrl,
} from "@/lib/creatorAgentGateway";
export type CreatorAgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CreatorAgentResponse = {
  reply: string;
  products?: RawProduct[];
  page_info?: {
    page: number;
    page_size: number;
    total?: number;
    has_more: boolean;
  };
  // 原始后端响应，用于 debug 面板
  raw?: any;
  agentUrlUsed?: string;
};

// 控制是否在主查询 0 结果时，用「空查询」兜底热门商品。
// 默认关闭：宁可不推不相关商品，也不强行填满列表。
const ENABLE_POPULAR_FALLBACK =
  process.env.NEXT_PUBLIC_CREATOR_AGENT_ALLOW_POPULAR_FALLBACK === "1";

function normalizeQuery(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // 常见“泛化指令”统一视为默认推荐（空 query）
  const genericIntents = new Set([
    "show popular items",
    "show me popular items",
    "show me some popular items",
    "recommend something",
    "recommend some products",
    "热门商品",
    "推荐一些好物",
  ]);
  if (genericIntents.has(lower)) return "";

  return trimmed;
}

function isLikelyChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function isColdOuterwearIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  const zhKeywords = [
    "外套",
    "大衣",
    "羽绒服",
    "冲锋衣",
    "风衣",
    "棉服",
    "滑雪服",
    "御寒",
    "保暖",
    "很冷",
    "天气很冷",
    "山上",
    "爬山",
    "登山",
    "徒步",
    "露营",
  ];

  const enKeywords = [
    "cold",
    "mountain",
    "hiking",
    "snow",
    "snowy",
    "jacket",
    "coat",
    "parka",
    "puffer",
    "down jacket",
    "outerwear",
    "shell",
    "windbreaker",
  ];

  if (zhKeywords.some((kw) => text.includes(kw))) return true;
  if (enKeywords.some((kw) => lower.includes(kw))) return true;
  return false;
}

function isToyLikeProduct(product: RawProduct): boolean {
  const text = `${product.title || ""} ${product.description || ""}`.toLowerCase();
  const toyKeywords = [
    "labubu",
    "doll",
    "toy",
    "figure",
    "vinyl",
    "plush",
    "plushie",
    "stuffed",
    "公仔",
    "玩具",
    "娃娃",
    "手办",
    "盲盒",
    "毛绒",
  ];
  return toyKeywords.some((kw) => text.includes(kw));
}

function buildNoResultReply(options: {
  hasUserQuery: boolean;
  userQuery: string;
}): string {
  const { hasUserQuery, userQuery } = options;
  const useChinese = isLikelyChinese(userQuery);

  if (useChinese) {
    if (hasUserQuery) {
      return [
        "我暂时没有找到足够匹配你这次需求的商品，所以不会强行推荐不合适的选项。",
        "你可以试着：",
        "1）换一个更具体的关键词，比如品类（例如“羽绒服”“冲锋衣”“大衣”）；",
        "2）告诉我你的预算、尺码，以及喜欢/不喜欢的品牌或风格；",
        "3）把使用场景说得更具体一些，比如“城市通勤”“办公室空调房”“周末徒步/登山”等。",
      ].join("\n");
    }
    return [
      "目前还没有适合推荐的商品，我先不推不相关的东西。",
      "你可以先告诉我你要找的场景、预算或具体品类，我会再帮你一起缩小范围。",
    ].join("\n");
  }

  if (hasUserQuery) {
    return [
      "I couldn’t find products that match your request well enough, so I’m not going to recommend unrelated items just to fill the list.",
      "You can try one of these:",
      "- search with a more specific category (e.g. coat, down jacket, hiking shell),",
      "- share your budget, size, or brands/styles you like or dislike,",
      "- or describe the occasion in more detail (e.g. city commute, office AC, weekend hiking).",
    ].join("\n");
  }

  return [
    "I don’t have good items to recommend yet and prefer not to show unrelated products.",
    "Tell me what category, budget, or occasion you care about, and I’ll try again.",
  ].join("\n");
}

export async function callPivotaCreatorAgent(params: {
  creatorId: string;
  creatorName: string;
  personaPrompt: string;
  messages: CreatorAgentMessage[];
  userId?: string | null;
  recentQueries?: string[];
  traceId?: string | null;
  search?: {
    page?: number;
    limit?: number;
    query?: string | null;
  };
}): Promise<CreatorAgentResponse> {
  const url = getOptionalCreatorInvokeUrl();
  if (!url) {
    // Mock mode: return a short reply + a few mock products for local UI dev.
    return {
      reply:
        "Here are some mock picks while the backend is not configured. Connect PIVOTA_AGENT_URL to see real items.",
      products: [
        {
          id: "mock-1",
          title: "Mock CloudFit Hoodie",
          description: "A cozy hoodie for mock mode demos.",
          price: 59,
          currency: "USD",
          image_url:
            "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
          inventory_quantity: 12,
        },
        {
          id: "mock-2",
          title: "Mock Everyday Bottle",
          description: "Lightweight stainless bottle for desk or commute.",
          price: 22,
          currency: "USD",
          image_url:
            "https://images.pexels.com/photos/3735551/pexels-photo-3735551.jpeg?auto=compress&cs=tinysrgb&w=800",
          inventory_quantity: 33,
        },
        {
          id: "mock-3",
          title: "Mock Urban Runner",
          description: "Lightweight commuter sneakers with breathable mesh.",
          price: 109,
          currency: "USD",
          image_url:
            "https://images.pexels.com/photos/1124466/pexels-photo-1124466.jpeg?auto=compress&cs=tinysrgb&w=800",
          inventory_quantity: 18,
        },
      ],
      page_info: {
        page: 1,
        page_size: 3,
        total: 3,
        has_more: false,
      },
      agentUrlUsed: "mock",
    };
  }

  const lastUserMessage = [...params.messages].reverse().find((m) => m.role === "user");
  const userQueryRaw = lastUserMessage?.content ?? "";
  const hasUserQuery = userQueryRaw.trim().length > 0;
  const query = normalizeQuery(params.search?.query ?? userQueryRaw);
  const recentQueries = params.recentQueries?.filter(Boolean).slice(-5);
  const searchPage = Math.max(1, Math.floor(Number(params.search?.page || 1) || 1));
  const searchLimit = Math.max(1, Math.floor(Number(params.search?.limit || 24) || 24));

  // 与 Shopping Agent 前端保持一致的调用协议：顶层只使用 operation + payload，
  // 额外信息放在 metadata，方便后端按 creatorId 做过滤/打标。
  const basePayload = {
    // 跨商户搜索：使用 find_products_multi，limit 支持多商户场景。
    operation: "find_products_multi",
    payload: {
      search: {
        // page + limit 分页，不强制只看有库存。
        page: searchPage,
        // 默认首屏 24，后续由前端增量加载。
        limit: searchLimit,
        in_stock_only: false,
        allow_external_seed: true,
        external_seed_strategy: "unified_relevance",
        search_all_merchants: true,
      },
      user: {
        id: params.userId || undefined,
        recent_queries: recentQueries,
      },
    },
    metadata: {
      creator_id: params.creatorId,
      creator_name: params.creatorName,
      // 目前后端不会使用 persona，只作为元信息占位，方便未来在网关/Agent 层接入。
      persona: params.personaPrompt,
      source: "creator-agent-ui",
      ...(params.traceId ? { trace_id: params.traceId } : {}),
    },
  };

  // TODO: 上面的 payload 字段名/结构可能需要根据 Pivota Agent 后端最终协议调整。
  // 当前先用一个清晰的草案，方便后续对齐。

  const creatorAuthHeaders = getCreatorAgentAuthHeaders();

  try {
    function deriveTaskBaseFromUrl(invokeUrl: string): string {
      // Expect URLs like: http://host/agent/shop/v1/invoke
      return invokeUrl.replace(/\/invoke\/?$/, "");
    }

    async function resolvePendingIfNeeded(
      data: any,
      invokeUrl: string,
    ): Promise<any> {
      if (!data || data.status !== "pending" || !data.task_id) {
        return data;
      }

      const base = deriveTaskBaseFromUrl(invokeUrl);
      const statusUrl = `${base}/creator/tasks/${data.task_id}`;

      const maxAttempts = 10;
      const delayMs = 500;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        const res = await fetch(statusUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...creatorAuthHeaders,
          },
        });

        if (!res.ok) {
          let bodyText: string | undefined;
          try {
            bodyText = await res.text();
          } catch {
            bodyText = undefined;
          }
          throw new Error(
            `Creator task status failed with status ${res.status}${
              bodyText ? ` body: ${bodyText}` : ""
            }`,
          );
        }

        const body = await res.json();
        const status = body.status as string | undefined;
        if (status === "succeeded" && body.result) {
          return body.result;
        }
        if (status && ["failed", "cancelled", "timeout", "expired"].includes(status)) {
          const msg = body.error || `Creator task ended with status=${status}`;
          throw new Error(msg);
        }
      }

      throw new Error("Creator task did not complete in time");
    }

    async function runOnce(searchQuery: string) {
      const payload = {
        ...basePayload,
        payload: {
          ...basePayload.payload,
          search: {
            ...basePayload.payload.search,
            query: searchQuery,
          },
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...creatorAuthHeaders,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errorBody: string | undefined;
        try {
          errorBody = await res.text();
        } catch (err) {
          errorBody = undefined;
        }
        throw new Error(
          `Pivota agent request failed with status ${res.status}${
            errorBody ? ` body: ${errorBody}` : ""
          }`,
        );
      }

      const initialData = await res.json();
      const data = await resolvePendingIfNeeded(initialData, url);

      const rawProducts: RawProduct[] =
        data.products ??
        data.output?.products ??
        data.items ??
        data.output?.items ??
        [];
      const backendReply: string | undefined =
        data.reply ?? data.message ?? data.output?.reply ?? data.output?.final_text;

      let reply: string;
      if (backendReply) {
        reply = backendReply;
      } else if (Array.isArray(rawProducts) && rawProducts.length > 0) {
        // 后端没返回文案但有商品时，用一个友好的英文提示，而不是“找不到”
        reply = hasUserQuery
          ? "Here are some product picks based on your request."
          : "Here are some popular pieces to get you started.";
      } else {
        reply = buildNoResultReply({
          hasUserQuery,
          userQuery: userQueryRaw || query,
        });
      }

      const pageRaw = Number(data?.page);
      const pageSizeRaw = Number(data?.page_size ?? data?.pageSize);
      const totalRaw = Number(data?.total);
      const hasMoreRaw = data?.has_more;
      const hasMoreAlt = data?.hasMore;

      const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : searchPage;
      const pageSize =
        Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
          ? Math.floor(pageSizeRaw)
          : searchLimit;
      const total =
        Number.isFinite(totalRaw) && totalRaw >= 0 ? Math.floor(totalRaw) : undefined;
      const hasMore =
        typeof hasMoreRaw === "boolean"
          ? hasMoreRaw
          : typeof hasMoreAlt === "boolean"
            ? hasMoreAlt
            : typeof total === "number"
              ? page * pageSize < total
              : Array.isArray(rawProducts) && rawProducts.length >= pageSize;

      return {
        data,
        rawProducts,
        reply,
        pageInfo: {
          page,
          page_size: pageSize,
          ...(typeof total === "number" ? { total } : {}),
          has_more: hasMore,
        },
      };
    }

    // 第一次：按用户 query 或默认 query 调用
    const primary = await runOnce(query);
    let { data, rawProducts, reply, pageInfo } = primary;

    // 保护逻辑：当用户明确在问「山上/很冷/外套/大衣」这类冷天气穿着时，
    // 如果返回的主要是玩具 / 公仔 / Labubu 等明显不相关商品，则视为「无合适结果」。
    if (hasUserQuery && isColdOuterwearIntent(userQueryRaw || query)) {
      const original = rawProducts ?? [];
      const filtered = original.filter((p) => !isToyLikeProduct(p));
      if (filtered.length === 0 && original.length > 0) {
        rawProducts = [];
        reply = buildNoResultReply({
          hasUserQuery,
          userQuery: userQueryRaw || query,
        });
      } else {
        rawProducts = filtered;
      }
    }

    // 若用户输入了非空 query 且结果为 0，则再用空 query 兜底一次默认货盘
    if (
      ENABLE_POPULAR_FALLBACK &&
      hasUserQuery &&
      (!rawProducts || rawProducts.length === 0)
    ) {
      const fallback = await runOnce("");
      if (fallback.rawProducts && fallback.rawProducts.length > 0) {
        rawProducts = fallback.rawProducts;
        data = { primary: primary.data, fallback: fallback.data };
        pageInfo = fallback.pageInfo;
        // 主查询 0 结果，但默认货盘有商品：明确说明是更宽泛的热门推荐。
        reply =
          "I couldn’t find strong matches for your original request, but here are some more general popular pieces you can browse.";
      }
    }

    return {
      reply,
      products: rawProducts,
      page_info: pageInfo,
      raw: data,
      agentUrlUsed: url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 如果后端超时，返回友好提示（不再注入本地 mock 商品）
    if (message.includes("UPSTREAM_TIMEOUT") || message.includes("status 504")) {
      return {
        reply:
          "The shopping backend timed out. Please try again in a moment or rephrase your request.",
        products: [],
        page_info: {
          page: searchPage,
          page_size: searchLimit,
          has_more: false,
        },
        raw: { error: message },
        agentUrlUsed: url,
      };
    }
    throw error;
  }
}

export async function callPivotaGetProductDetail(params: {
  merchantId: string;
  productId: string;
}): Promise<{ product: Product; raw: any }> {
  const url = getOptionalCreatorInvokeUrl();
  if (!url) {
    throw new Error("PIVOTA_AGENT_URL or NEXT_PUBLIC_PIVOTA_AGENT_URL is not configured");
  }
  const creatorAuthHeaders = getCreatorAgentAuthHeaders();

  const payload = {
    operation: "get_product_detail",
    payload: {
      product: {
        merchant_id: params.merchantId,
        product_id: params.productId,
      },
    },
    metadata: {
      source: "creator-agent-ui",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...creatorAuthHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let bodyText: string | undefined;
    try {
      bodyText = await res.text();
    } catch {
      bodyText = undefined;
    }
    throw new Error(
      `get_product_detail failed with status ${res.status}${
        bodyText ? ` body: ${bodyText}` : ""
      }`,
    );
  }

  const data = await res.json();
  const raw: RawProduct =
    data.product ??
    data.output?.product ??
    data.product_raw ??
    data;

  const product = mapRawProduct(raw);
  return { product, raw: data };
}

export async function callPivotaFindSimilarProducts(params: {
  creatorId?: string;
  productId: string;
  limit?: number;
  strategy?: "auto" | "content_embedding" | "co_view" | "same_merchant_first";
}): Promise<FindSimilarProductsResponse> {
  const url = getOptionalCreatorInvokeUrl();
  // Mock mode: reuse a small slice of products as "similar" when backend is unavailable.
  if (!url) {
    return {
      base_product_id: params.productId,
      strategy_used: "auto",
      items: [],
    };
  }
  const creatorAuthHeaders = getCreatorAgentAuthHeaders();

  const payload = {
    operation: "find_similar_products",
    payload: {
      product_id: params.productId,
      creator_id: params.creatorId,
      limit: params.limit ?? 12,
      strategy: params.strategy ?? "auto",
    },
    metadata: {
      source: "creator-agent-ui",
      creator_id: params.creatorId,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...creatorAuthHeaders,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorBody: string | undefined;
      try {
        errorBody = await res.text();
      } catch (err) {
        errorBody = undefined;
      }
      throw new Error(
        `Pivota agent similar request failed with status ${res.status}${
          errorBody ? ` body: ${errorBody}` : ""
        }`,
      );
    }

    const data = await res.json();
    const itemsRaw: any[] = data.items ?? data.products ?? data.output?.items ?? [];
    const mappedItems: SimilarProductItem[] = itemsRaw.map((item) => {
      const rawProd: RawProduct | undefined =
        item.product ?? item.raw_product ?? item.product_raw ?? item;
      const product = rawProd ? mapRawProduct(rawProd) : (mapRawProduct as any)(item);
      const bestDeal = item.best_deal ?? product.bestDeal;
      const allDeals = item.all_deals ?? product.allDeals ?? [];
      return {
        product: {
          ...product,
          bestDeal: product.bestDeal ?? bestDeal,
          allDeals: product.allDeals ?? allDeals,
        },
        best_deal: bestDeal,
        all_deals: allDeals,
        scores: item.scores,
        reason: item.reason,
      };
    });

    return {
      base_product_id: data.base_product_id || params.productId,
      strategy_used: data.strategy_used || "auto",
      items: mappedItems,
    };
  } catch (err) {
    console.error("callPivotaFindSimilarProducts error", err);
    // Graceful fallback: return empty and let caller decide UI handling.
    return {
      base_product_id: params.productId,
      strategy_used: "auto",
      items: [],
    };
  }
}
