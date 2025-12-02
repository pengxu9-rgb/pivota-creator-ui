import type { RawProduct } from "@/types/product";

export type CreatorAgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CreatorAgentResponse = {
  reply: string;
  products?: RawProduct[];
   // 原始后端响应，用于 debug
  raw?: any;
};

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
      products: [
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
      ],
    };
  }

  const systemPrompt = `
你是 Pivota 的「Creator Shopping Agent」。

 - 具备 Pivota Shopping Agent 的基础能力（find_products / create_order / submit_payment）；
 - 当前服务的 Creator 为：${params.creatorName}（ID: ${params.creatorId}）。

 ${params.personaPrompt}

 优先推荐该 Creator 内容中出现过的单品或同风格替代品，当为同风格补充时需向用户说明。
  `.trim();

  const payload = {
    agent: "creator_agent",
    creator_id: params.creatorId,
    persona: systemPrompt,
    messages: params.messages,
    metadata: {
      creatorName: params.creatorName,
      source: "creator-agent-ui",
    },
  };

  // TODO: 上面的 payload 字段名/结构可能需要根据 Pivota Agent 后端最终协议调整。
  // 当前先用一个清晰的草案，方便后续对齐。

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.PIVOTA_AGENT_API_KEY
        ? { Authorization: `Bearer ${process.env.PIVOTA_AGENT_API_KEY}` }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Pivota agent request failed with status ${res.status}`);
  }

  const data = await res.json();

  // TODO: 根据 Pivota Agent 实际返回结构，把 reply 和 products 的解析逻辑简化为单一来源。
  const reply: string =
    data.reply ??
    data.message ??
    data.output?.reply ??
    data.output?.final_text ??
    "抱歉，我暂时没有拿到有效的回复内容。";

  const rawProducts: RawProduct[] =
    data.products ??
    data.output?.products ??
    data.items ??
    data.output?.items ??
    [];

  return { reply, products: rawProducts, raw: data };
}
