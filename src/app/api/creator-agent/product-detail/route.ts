import { NextResponse } from "next/server";
import { callPivotaGetProductDetail } from "@/lib/pivotaAgentClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { merchantId, productId } = body as {
      merchantId?: string;
      productId?: string;
    };

    if (!merchantId || !productId) {
      return NextResponse.json(
        { error: "Missing merchantId or productId" },
        { status: 400 },
      );
    }

    const { product, raw } = await callPivotaGetProductDetail({
      merchantId,
      productId,
    });

    return NextResponse.json(
      {
        product,
        rawAgentResponse: raw,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[creator-agent/product-detail] error", error);
    return NextResponse.json(
      {
        error: "Failed to fetch product detail",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

