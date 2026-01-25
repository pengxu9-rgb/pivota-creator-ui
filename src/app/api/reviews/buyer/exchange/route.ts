import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ACCOUNTS_BASE = "https://web-production-fedb.up.railway.app/accounts";

function getReviewsUpstreamBase(): string {
  const explicit = (
    process.env.REVIEWS_UPSTREAM_BASE ||
    process.env.NEXT_PUBLIC_REVIEWS_UPSTREAM_BASE ||
    process.env.NEXT_PUBLIC_REVIEWS_BASE
  )?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const accounts = (process.env.NEXT_PUBLIC_ACCOUNTS_BASE || DEFAULT_ACCOUNTS_BASE)
    .trim()
    .replace(/\/$/, "");
  if (accounts.endsWith("/accounts")) return accounts.slice(0, -"/accounts".length);
  return accounts;
}

async function parseUpstreamResponse(resp: Response) {
  const text = await resp.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token || "").trim();
    const ttlSeconds = Number.isFinite(Number(body?.ttl_seconds))
      ? Number(body.ttl_seconds)
      : 900;
    const orderId = String(body?.order_id || "").trim();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const upstreamBase = getReviewsUpstreamBase();
    const upstreamRes = await fetch(`${upstreamBase}/buyer/reviews/v1/verification/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      body: JSON.stringify({
        ttl_seconds: ttlSeconds,
        order_id: orderId || undefined,
      }),
    });

    const data = await parseUpstreamResponse(upstreamRes);
    return NextResponse.json(data, {
      status: upstreamRes.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[reviews exchange] proxy error:", error);
    return NextResponse.json(
      {
        error: "Gateway proxy error",
        message: (error as Error).message ?? String(error),
      },
      { status: 500 },
    );
  }
}

