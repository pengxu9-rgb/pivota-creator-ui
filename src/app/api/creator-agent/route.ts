import { NextRequest, NextResponse } from "next/server";
import { getCreatorById } from "@/config/creatorAgents";
import { callPivotaCreatorAgent } from "@/lib/pivotaAgentClient";
import { mapRawProducts } from "@/lib/productMapper";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { creatorId, messages } = body as {
    creatorId: string;
    messages: { role: "user" | "assistant"; content: string }[];
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
    });

    const products = mapRawProducts(response.products);

    return NextResponse.json(
      {
        reply: response.reply,
        products,
        rawAgentResponse: response.raw,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: "Creator agent backend error",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
