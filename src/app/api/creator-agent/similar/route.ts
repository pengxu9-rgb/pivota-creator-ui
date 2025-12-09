import { NextResponse } from "next/server";
import { getCreatorBySlug } from "@/config/creatorAgents";
import { callPivotaFindSimilarProducts } from "@/lib/pivotaAgentClient";
import { mapRawProducts } from "@/lib/productMapper";

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

    const rawProducts = await callPivotaFindSimilarProducts({
      creatorId: creator.id,
      productId,
      limit,
    });

    const products = mapRawProducts(rawProducts);

    return NextResponse.json({ products });
  } catch (error) {
    console.error("[creator-agent/similar] error", error);
    return NextResponse.json(
      { error: "Failed to fetch similar products" },
      { status: 500 },
    );
  }
}
