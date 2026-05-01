import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "home";

const DEFAULT_AGENT_BASE = "https://pivota-agent-production.up.railway.app";

function sanitizeEnvValue(raw: string | undefined): string {
  return String(raw || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = sanitizeEnvValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function resolveAgentBaseUrl(): string {
  const raw = firstNonEmpty(
    process.env.PIVOTA_AGENT_BASE_URL,
    process.env.PIVOTA_AGENT_URL,
    process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL,
  );
  const value = raw || DEFAULT_AGENT_BASE;
  if (value.startsWith("/")) return DEFAULT_AGENT_BASE;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withScheme
    .replace(/\/agent\/shop\/v1\/invoke\/?$/i, "")
    .replace(/\/agent\/creator\/v1\/invoke\/?$/i, "")
    .replace(/\/+$/, "");
}

function resolveAgentApiKey(): string {
  return firstNonEmpty(
    process.env.CREATOR_AGENT_API_KEY,
    process.env.PIVOTA_AGENT_API_KEY,
    process.env.PIVOTA_API_KEY,
    process.env.CREATOR_CHECKOUT_AGENT_API_KEY,
    process.env.AGENT_API_KEY,
    process.env.SHOP_GATEWAY_AGENT_API_KEY,
    process.env.NEXT_PUBLIC_AGENT_API_KEY,
  );
}

function buildAuthHeaders(): Record<string, string> {
  const key = resolveAgentApiKey();
  if (!key) return {};
  return {
    "X-Agent-API-Key": key,
    "X-API-Key": key,
    Authorization: `Bearer ${key}`,
  };
}

function forwardLang(raw: string | null): string {
  return String(raw || "").trim().toUpperCase() === "CN" ? "CN" : "EN";
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const upstream = await fetch(`${resolveAgentBaseUrl()}/v1/photos/upload`, {
      method: "POST",
      headers: {
        "X-Lang": forwardLang(req.headers.get("x-lang")),
        ...(req.headers.get("x-aurora-uid")
          ? { "X-Aurora-UID": String(req.headers.get("x-aurora-uid")) }
          : {}),
        ...buildAuthHeaders(),
      },
      body: form,
    });

    const text = await upstream.text();
    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = text;
    }

    return NextResponse.json(payload, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: "PHOTO_UPLOAD_PROXY_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
