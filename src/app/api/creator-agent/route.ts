import { NextRequest, NextResponse } from "next/server";
import { getCreatorById } from "@/config/creatorAgents";
import { callPivotaCreatorAgent } from "@/lib/pivotaAgentClient";
import { mapRawProducts } from "@/lib/productMapper";

function extractUpstreamStatusAndDetail(message: string): {
  status?: number;
  detail: string;
} {
  const statusMatch = message.match(/status\s+(\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  const bodyMatch = message.match(/body:\s*(.+)$/s);
  if (bodyMatch) {
    const bodyText = bodyMatch[1].trim();
    try {
      const parsed = JSON.parse(bodyText);
      const detail =
        parsed && typeof parsed === "object" && typeof parsed.detail === "string"
          ? parsed.detail
          : bodyText;
      return { status, detail };
    } catch {
      return { status, detail: bodyText };
    }
  }

  return { status, detail: message };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { creatorId, messages, userId, recentQueries, traceId, search } = body as {
    creatorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
    userId?: string | null;
    recentQueries?: string[];
    traceId?: string | null;
    search?: { page?: number; limit?: number; query?: string | null };
  };

  const creator = getCreatorById(creatorId);
  if (!creator) {
    return NextResponse.json({ error: "Unknown creatorId" }, { status: 400 });
  }

  try {
    const response = await callPivotaCreatorAgent({
      creatorId: creator.id,
      creatorName: creator.name,
      personaPrompt: creator.personaPrompt,
      messages: messages,
      userId: userId ?? undefined,
      recentQueries,
      traceId: traceId ?? undefined,
      search: search ?? undefined,
    });

    const products = mapRawProducts(response.products);

    return NextResponse.json(
      {
        reply: response.reply,
        products,
        page_info: response.page_info ?? undefined,
        rawAgentResponse: response.raw,
        agentUrlUsed: response.agentUrlUsed,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    const { status: upstreamStatus, detail } =
      extractUpstreamStatusAndDetail(message);
    const status =
      upstreamStatus && [409, 429, 503, 504].includes(upstreamStatus)
        ? upstreamStatus
        : 500;
    return NextResponse.json(
      {
        error: "Creator agent backend error",
        detail,
        upstreamStatus: upstreamStatus ?? null,
        traceId: traceId ?? null,
        agentUrlConfigured: Boolean(process.env.PIVOTA_AGENT_URL),
      },
      { status },
    );
  }
}
