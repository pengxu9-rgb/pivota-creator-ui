import { NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

if (!baseUrl) {
  console.warn("[ops/returns/sync] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/returns/sync] MERCHANT_ADMIN_KEY is not set");
}

export async function POST(req: Request) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(`${baseUrl}/api/merchant/returns/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ADMIN-KEY": adminKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/returns/sync] POST error", error);
    return NextResponse.json({ error: "Failed to sync returns." }, { status: 500 });
  }
}

