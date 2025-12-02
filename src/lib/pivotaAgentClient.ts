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

const FALLBACK_PRODUCTS: RawProduct[] = [
  {
    id: "mock-1",
    title: "Mock CloudFit Hoodie",
    description: "适合作为本地开发演示用的连帽衫。",
    price: 459,
    currency: "CNY",
    image_url:
      "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 12,
  },
  {
    id: "mock-2",
    title: "Mock Everyday Bottle 600ml",
    description: "本地开发演示的水杯。",
    price: 169,
    currency: "CNY",
    image_url:
      "https://images.pexels.com/photos/3735551/pexels-photo-3735551.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 33,
  },
  {
    id: "mock-3",
    title: "Mock Urban Tech Runner",
    description: "本地演示的城市跑鞋，偏通勤风。",
    price: 729,
    currency: "CNY",
    image_url:
      "https://images.pexels.com/photos/1124466/pexels-photo-1124466.jpeg?auto=compress&cs=tinysrgb&w=800",
    inventory_quantity: 18,
  },
];

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
  const query = lastUserMessage?.content?.trim() || "Show popular items";

  // 与 Shopping Agent 前端保持一致的调用协议：顶层只使用 operation + payload，
  // 额外信息放在 metadata，方便后端按 creatorId 做过滤/打标。
  const payload = {
    operation: "find_products_multi",
    payload: {
      search: {
        query,
        // 与 Shopping Agent 的 sendMessage 对齐：不过滤库存，limit 10
        in_stock_only: false,
        limit: 10,
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

  const AGENT_API_KEY =
    process.env.NEXT_PUBLIC_AGENT_API_KEY ||
    process.env.AGENT_API_KEY ||
    process.env.SHOP_GATEWAY_AGENT_API_KEY ||
    process.env.PIVOTA_API_KEY ||
    process.env.PIVOTA_AGENT_API_KEY ||
    "";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AGENT_API_KEY ? { "X-Agent-API-Key": AGENT_API_KEY } : {}),
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

    // TODO: 根据 Pivota Agent 实际返回结构，把 reply 和 products 的解析逻辑简化为单一来源。
    const reply: string =
      data.reply ??
      data.message ??
      data.output?.reply ??
      data.output?.final_text ??
      (Array.isArray(rawProducts) && rawProducts.length === 0
        ? "抱歉，没有找到合适的商品，请换个描述或条件试试。"
        : "抱歉，我暂时没有拿到有效的回复内容。");

    return { reply, products: rawProducts, raw: data, agentUrlUsed: url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 如果后端超时，返回友好提示而不是直接抛出
    if (message.includes("UPSTREAM_TIMEOUT") || message.includes("status 504")) {
      return {
        reply: "后端响应超时，请稍后再试或换个描述～",
        products: FALLBACK_PRODUCTS,
        raw: { error: message },
        agentUrlUsed: url,
      };
    }
    throw error;
  }
}
