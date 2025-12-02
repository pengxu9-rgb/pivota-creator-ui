import type { RawProduct } from "@/types/product";

export type CreatorAgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type CreatorAgentResponse = {
  reply: string;
  products?: RawProduct[];
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

基础能力与 Pivota Shopping Agent 一致，可以使用工具 find_products / create_order / submit_payment。
你当前服务的 Creator 为：${params.creatorName}（ID: ${params.creatorId}）。

${params.personaPrompt}

请优先在该 Creator 相关的商品中搜索和推荐（通过 creatorIds / creatorMinMentions 等过滤字段），
在必要时再补充全局货盘，并清晰区分「来自 Creator 内容」与「同风格补充」。
  `.trim();

  // TODO: 根据后端最终定义的协议调整字段名和结构
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

  // TODO: 根据真实返回结构做映射
  const reply: string =
    data.reply || data.message || "抱歉，我暂时没有拿到有效的回复内容。";
  const products: RawProduct[] = data.products || data.items || [];

  return { reply, products };
}
