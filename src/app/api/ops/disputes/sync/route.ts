import { NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

if (!baseUrl) {
  console.warn("[ops/disputes/sync] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/disputes/sync] MERCHANT_ADMIN_KEY is not set");
}

export async function POST(req: Request) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const orderId = body?.orderId || body?.order_id;
  const limit = body?.limit;

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${baseUrl}/api/merchant/disputes/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ADMIN-KEY": adminKey,
      },
      body: JSON.stringify({
        orderId,
        ...(limit ? { limit } : {}),
      }),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/disputes/sync] POST error", error);
    return NextResponse.json({ error: "Failed to sync disputes." }, { status: 500 });
  }
}

