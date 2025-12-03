import type { RawProduct } from "@/types/product";

export type CreatorAgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CreatorAgentResponse = {
  reply: string;
  products?: RawProduct[];
  // 原始后端响应，用于 debug 面板
  raw?: any;
  agentUrlUsed?: string;
};

// Fallback products used in mock mode / timeout scenarios.
// Keep them aligned with the UI Featured card style and use USD for consistency.
const FALLBACK_PRODUCTS: RawProduct[] = [
  {
    id: "mock-featured-1",
    title: "Everyday Stainless Bottle 600ml",
    description: "Minimal stainless bottle for desk or commute.",
    price: 22,
    currency: "USD",
    image_url:
      "https://images.pexels.com/photos/3735551/pexels-photo-3735551.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 25,
  },
  {
    id: "mock-featured-2",
    title: "CloudFit Daily Hoodie",
    description: "Soft brushed fleece, perfect for casual days.",
    price: 68,
    currency: "USD",
    image_url:
      "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 18,
  },
  {
    id: "mock-featured-3",
    title: "Urban Tech Runner",
    description: "Lightweight commuter sneakers with breathable mesh.",
    price: 109,
    currency: "USD",
    image_url:
      "https://images.pexels.com/photos/1124466/pexels-photo-1124466.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 14,
  },
  {
    id: "mock-featured-4",
    title: "Minimal Essential Hoodie",
    description: "Clean silhouette, pairs with everything.",
    price: 59,
    currency: "USD",
    image_url:
      "https://images.pexels.com/photos/7671167/pexels-photo-7671167.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 22,
  },
];

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

  // 简单同义词归一化
  if (lower === "tee" || lower === "t恤" || lower === "t-shirt" || lower === "t shirt") {
    return "t-shirt";
  }

  return trimmed;
}

export async function callPivotaCreatorAgent(params: {
  creatorId: string;
  creatorName: string;
  personaPrompt: string;
  messages: CreatorAgentMessage[];
}): Promise<CreatorAgentResponse> {
  const url =
    process.env.PIVOTA_AGENT_URL ||
    "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke";
  const useMock = !process.env.PIVOTA_AGENT_URL;

  if (useMock) {
    // 本地开发 mock 回复，避免真实网络请求
    return {
      reply:
        "（本地 mock）我会在真实环境中帮你从 Creator 的内容里找适合的单品。先用这几件做 UI 演示 👇",
      products: FALLBACK_PRODUCTS,
    };
  }

  const lastUserMessage = [...params.messages].reverse().find((m) => m.role === "user");
  const userQueryRaw = lastUserMessage?.content ?? "";
  const hasUserQuery = userQueryRaw.trim().length > 0;
  const query = normalizeQuery(userQueryRaw);

  // 与 Shopping Agent 前端保持一致的调用协议：顶层只使用 operation + payload，
  // 额外信息放在 metadata，方便后端按 creatorId 做过滤/打标。
  const basePayload = {
    // 后端明确建议：跨商户搜索使用 find_products，
    // 不填 merchant_id 即为跨商户。
    operation: "find_products",
    payload: {
      search: {
        // 与 Shopping Agent 的 sendMessage 逻辑对齐：
        // page + page_size 分页，不强制只看有库存。
        page: 1,
        page_size: 8,
        in_stock_only: false,
      },
    },
    metadata: {
      creatorId: params.creatorId,
      creatorName: params.creatorName,
      // 目前后端不会使用 persona，只作为元信息占位，方便未来在网关/Agent 层接入。
      persona: params.personaPrompt,
      source: "creator-agent-ui",
    },
  };

  // TODO: 上面的 payload 字段名/结构可能需要根据 Pivota Agent 后端最终协议调整。
  // 当前先用一个清晰的草案，方便后续对齐。

  // 后端推荐：读取 PIVOTA_AGENT_API_KEY 并使用 Bearer 头；
  // 其他 key 名用于向后兼容现有配置。
  const BEARER_API_KEY =
    process.env.PIVOTA_AGENT_API_KEY || process.env.PIVOTA_API_KEY || "";

  const X_AGENT_API_KEY =
    process.env.NEXT_PUBLIC_AGENT_API_KEY ||
    process.env.AGENT_API_KEY ||
    process.env.SHOP_GATEWAY_AGENT_API_KEY ||
    "";

  try {
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
          ...(BEARER_API_KEY ? { Authorization: `Bearer ${BEARER_API_KEY}` } : {}),
          ...(X_AGENT_API_KEY ? { "X-Agent-API-Key": X_AGENT_API_KEY } : {}),
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

      const data = await res.json();

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
        reply =
          "I couldn’t find good matches for that request. Try adjusting your budget, style, or category.";
      }

      return { data, rawProducts, reply };
    }

    // 第一次：按用户 query 或默认 query 调用
    const primary = await runOnce(query);
    let { data, rawProducts, reply } = primary;

    // 若用户输入了非空 query 且结果为 0，则再用空 query 兜底一次默认货盘
    if (hasUserQuery && (!rawProducts || rawProducts.length === 0)) {
      const fallback = await runOnce("");
      if (fallback.rawProducts && fallback.rawProducts.length > 0) {
        rawProducts = fallback.rawProducts;
        data = { primary: primary.data, fallback: fallback.data };
        // 主查询 0 结果，但默认货盘有商品：不再强调“找不到”，直接给推荐。
        reply = "Here are some popular or similar pieces I recommend based on your request.";
      }
    }

    return { reply, products: rawProducts, raw: data, agentUrlUsed: url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 如果后端超时，返回友好提示而不是直接抛出
    if (message.includes("UPSTREAM_TIMEOUT") || message.includes("status 504")) {
      return {
        reply:
          "The shopping backend timed out. Please try again in a moment or rephrase your request.",
        products: FALLBACK_PRODUCTS,
        raw: { error: message },
        agentUrlUsed: url,
      };
    }
    throw error;
  }
}
