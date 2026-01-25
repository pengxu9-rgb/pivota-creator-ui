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

    const submissionToken = String(body?.submission_token || "").trim();
    const idempotencyKey = String(body?.idempotency_key || "").trim();

    const merchantId = String(body?.merchant_id || "").trim();
    const platform = String(body?.platform || "").trim();
    const platformProductId = String(body?.platform_product_id || "").trim();
    const variantId = body?.variant_id == null ? null : String(body.variant_id).trim();

    const rating = Number(body?.rating);
    const title = body?.title == null ? null : String(body.title);
    const reviewBody = body?.body == null ? null : String(body.body);

    if (!submissionToken) {
      return NextResponse.json({ error: "Missing submission_token" }, { status: 400 });
    }
    if (!merchantId || !platform || !platformProductId) {
      return NextResponse.json({ error: "Missing subject fields" }, { status: 400 });
    }
    if (!Number.isFinite(rating)) {
      return NextResponse.json({ error: "Missing rating" }, { status: 400 });
    }
    if (!idempotencyKey) {
      return NextResponse.json({ error: "Missing idempotency_key" }, { status: 400 });
    }

    const upstreamBase = getReviewsUpstreamBase();
    const upstreamRes = await fetch(`${upstreamBase}/buyer/reviews/v1/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${submissionToken}`,
        "Idempotency-Key": idempotencyKey,
      },
      cache: "no-store",
      body: JSON.stringify({
        merchant_id: merchantId,
        platform,
        platform_product_id: platformProductId,
        variant_id: variantId,
        rating,
        title,
        body: reviewBody,
      }),
    });

    const data = await parseUpstreamResponse(upstreamRes);
    return NextResponse.json(data, {
      status: upstreamRes.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[reviews create] proxy error:", error);
    return NextResponse.json(
      {
        error: "Gateway proxy error",
        message: (error as Error).message ?? String(error),
      },
      { status: 500 },
    );
  }
}

