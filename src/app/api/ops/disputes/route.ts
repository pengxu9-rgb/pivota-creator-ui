import { NextResponse } from "next/server";

const baseUrl = process.env.MERCHANT_API_BASE_URL;
const adminKey = process.env.MERCHANT_ADMIN_KEY;

if (!baseUrl) {
  console.warn("[ops/disputes] MERCHANT_API_BASE_URL is not set");
}
if (!adminKey) {
  console.warn("[ops/disputes] MERCHANT_ADMIN_KEY is not set");
}

export async function GET(req: Request) {
  if (!baseUrl || !adminKey) {
    return NextResponse.json({ error: "Merchant backend is not configured." }, { status: 500 });
  }

  const url = new URL(req.url);
  const search = url.search || "";

  try {
    const res = await fetch(`${baseUrl}/api/merchant/disputes${search}`, {
      headers: { "X-ADMIN-KEY": adminKey },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("[ops/disputes] GET error", error);
    return NextResponse.json({ error: "Failed to fetch disputes." }, { status: 500 });
  }
}

