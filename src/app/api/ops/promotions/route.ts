import { NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

if (!baseUrl) {
  console.warn("[ops/promotions] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/promotions] MERCHANT_ADMIN_KEY is not set");
}

export async function GET(req: Request) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const url = new URL(req.url);
  const search = url.search || "";

  try {
    const res = await fetch(`${baseUrl}/api/merchant/promotions${search}`, {
      headers: {
        "X-ADMIN-KEY": adminKey,
      },
      cache: "no-store",
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/promotions] GET error", error);
    return NextResponse.json({ error: "Failed to fetch promotions." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const body = await req.json();

  try {
    const res = await fetch(`${baseUrl}/api/merchant/promotions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ADMIN-KEY": adminKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/promotions] POST error", error);
    return NextResponse.json({ error: "Failed to create promotion." }, { status: 500 });
  }
}
