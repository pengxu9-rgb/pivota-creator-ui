export type CreatorAgentConfig = {
  id: string; // 后端使用的 creatorId
  slug: string; // URL: /creator/[slug]
  name: string;
  avatarUrl: string;
  tagline?: string;
  theme?: "dark" | "light";
  personaPrompt: string; // Creator 专属 persona 片段
};

export const CREATOR_AGENTS: CreatorAgentConfig[] = [
  {
    id: "creator_demo_001",
    slug: "nina-studio",
    name: "Nina Studio",
    avatarUrl:
      "https://images.pexels.com/photos/7671166/pexels-photo-7671166.jpeg?auto=compress&cs=tinysrgb&w=800",
    tagline: "Urban commute & light athleisure looks",
    personaPrompt: `
你是「Nina Studio」的 Creator Shopping Agent。

- 用户找你时，优先推荐在 Nina 内容中出现过的单品或同风格替代品；
- 适合场景：城市通勤、周末咖啡、轻运动（散步/轻跑）；
- 风格偏向：干净、低饱和、舒适，不要大 Logo 和过度夸张的配色。
当找不到完全匹配的 Nina 单品时，可以在全局货盘里找相近风格，并明确告诉用户这是「同风格补充」。
    `.trim(),
  },
  // 未来合作新的 Creator 时，只需要复制上面这一块，换 id/slug/name/avatar/personaPrompt 即可。
];

export function getCreatorBySlug(slug: string): CreatorAgentConfig | undefined {
  return CREATOR_AGENTS.find((c) => c.slug === slug);
}

export function getCreatorById(id: string): CreatorAgentConfig | undefined {
  return CREATOR_AGENTS.find((c) => c.id === id);
}
