import { redirect } from "next/navigation";
import {
  getCreatorAgentAuthHeaders,
  getCreatorInvokeUrl,
} from "@/lib/creatorAgentGateway";

function sanitizeBaseUrl(raw: string | undefined): string {
  const value = String(raw || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim()
    .replace(/^['\"]+|['\"]+$/g, "")
    .replace(/\/$/, "");
  return value;
}

function appendSearchParam(target: URL, key: string, value: string | string[] | undefined) {
  if (typeof value === "string") {
    if (value) target.searchParams.append(key, value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item) {
      target.searchParams.append(key, item);
    }
  }
}

async function resolveMerchantId(productId: string): Promise<string | null> {
  const invokeUrl = getCreatorInvokeUrl();
  const invokeAuthHeaders = getCreatorAgentAuthHeaders();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(invokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...invokeAuthHeaders },
      body: JSON.stringify({
        operation: "resolve_product_candidates",
        payload: {
          product_ref: { product_id: productId },
          options: {
            limit: 1,
            include_offers: true,
          },
        },
        metadata: { source: "creator_agent" },
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const raw = await res.json().catch(() => null);
    const candidateMerchantId =
      String(raw?.canonical_product_ref?.merchant_id || "").trim() ||
      String(raw?.offers?.[0]?.merchant_id || "").trim() ||
      null;
    return candidateMerchantId;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function CreatorProductAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, productId } = await params;
  const query = (await searchParams) || {};

  const standardPdpBase =
    sanitizeBaseUrl(process.env.CREATOR_STANDARD_PDP_BASE_URL) ||
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_CREATOR_STANDARD_PDP_BASE_URL) ||
    "https://agent.pivota.cc";

  const target = new URL(`/products/${encodeURIComponent(productId)}`, `${standardPdpBase}/`);

  for (const [key, value] of Object.entries(query)) {
    appendSearchParam(target, key, value);
  }

  if (!target.searchParams.has("merchant_id")) {
    const resolvedMerchantId = await resolveMerchantId(productId);
    if (resolvedMerchantId) {
      target.searchParams.set("merchant_id", resolvedMerchantId);
    }
  }

  if (!target.searchParams.has("creator_slug") && slug) {
    target.searchParams.set("creator_slug", slug);
  }
  if (!target.searchParams.has("entry")) {
    target.searchParams.set("entry", "creator_agent");
  }
  if (!target.searchParams.has("entry_point")) {
    target.searchParams.set("entry_point", "creator_pdp_alias");
  }

  redirect(target.toString());
}
