import { NextResponse } from "next/server";
import { getCreatorBySlug } from "@/config/creatorAgents";
import { callPivotaFindSimilarProducts } from "@/lib/pivotaAgentClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { creatorSlug, productId, limit } = body as {
      creatorSlug?: string;
      productId?: string;
      limit?: number;
    };

    if (!creatorSlug || !productId) {
      return NextResponse.json({ error: "Missing creatorSlug or productId" }, { status: 400 });
    }

    const creator = getCreatorBySlug(creatorSlug);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    const similar = await callPivotaFindSimilarProducts({
      creatorId: creator.id,
      productId,
      limit,
    });

    return NextResponse.json({
      baseProductId: similar.base_product_id,
      strategyUsed: similar.strategy_used,
      items: similar.items,
    });
  } catch (error) {
    console.error("[creator-agent/similar] error", error);
    return NextResponse.json(
      { error: "Failed to fetch similar products" },
      { status: 500 },
    );
  }
}
