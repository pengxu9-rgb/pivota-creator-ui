import { redirect } from "next/navigation";
import {
  getCreatorAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
  getCreatorAgentAuthHeaders,
  getCreatorInvokeUrl,
} from "@/lib/creatorAgentGateway";
import type { CreatorCategoryTreeResponse, CategoryNode } from "@/types/category";

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

function firstString(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) {
      return entry.trim();
    }
  }
  return null;
}

function collectCategorySlugs(nodes: CategoryNode[] | undefined, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const node of nodes || []) {
    const slug = String(node?.category?.slug || "").trim();
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
    out.push(...collectCategorySlugs(node?.children, seen));
  }
  return out;
}

async function resolveMerchantIdFromCreatorCategories(args: {
  creatorSlug: string;
  productId: string;
  view?: string | null;
  locale?: string | null;
}): Promise<string | null> {
  const baseUrl = getOptionalCreatorAgentBaseUrl();
  if (!baseUrl) return null;

  const apiKey = getCreatorAgentApiKey();
  const headers = apiKey
    ? { "X-Agent-API-Key": apiKey, "x-api-key": apiKey }
    : undefined;
  const categoryQs = new URLSearchParams({
    includeCounts: "false",
    includeEmpty: "false",
    dealsOnly: "false",
    ...(args.view ? { view: args.view } : {}),
    ...(args.locale ? { locale: args.locale } : {}),
  });

  const categoriesRes = await fetch(
    `${baseUrl}/creator/${encodeURIComponent(args.creatorSlug)}/categories?${categoryQs.toString()}`,
    {
      headers,
      cache: "no-store",
    },
  ).catch(() => null);
  if (!categoriesRes?.ok) return null;

  const categoryTree = (await categoriesRes.json().catch(() => null)) as CreatorCategoryTreeResponse | null;
  const categorySlugs = collectCategorySlugs(categoryTree?.roots);
  if (!categorySlugs.length) return null;

  for (const categorySlug of categorySlugs) {
    const productsQs = new URLSearchParams({
      page: "1",
      limit: "500",
      ...(args.view ? { view: args.view } : {}),
      ...(args.locale ? { locale: args.locale } : {}),
    });
    const productsRes = await fetch(
      `${baseUrl}/creator/${encodeURIComponent(args.creatorSlug)}/categories/${encodeURIComponent(categorySlug)}/products?${productsQs.toString()}`,
      {
        headers,
        cache: "no-store",
      },
    ).catch(() => null);
    if (!productsRes?.ok) continue;

    const payload = (await productsRes.json().catch(() => null)) as
      | { products?: Array<{ id?: string | number; merchant_id?: string; merchantId?: string }> }
      | null;
    const match = (payload?.products || []).find(
      (product) => String(product?.id || "").trim() === args.productId,
    );
    const merchantId =
      String(match?.merchant_id || "").trim() ||
      String(match?.merchantId || "").trim() ||
      "";
    if (merchantId) return merchantId;
  }

  return null;
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
  const view = firstString(query.view);
  const locale = firstString(query.locale);

  for (const [key, value] of Object.entries(query)) {
    appendSearchParam(target, key, value);
  }

  if (!target.searchParams.has("merchant_id")) {
    const resolvedMerchantId =
      (await resolveMerchantId(productId)) ||
      (await resolveMerchantIdFromCreatorCategories({
        creatorSlug: slug,
        productId,
        view,
        locale,
      }));
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
