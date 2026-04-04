import { NextResponse, type NextRequest } from "next/server";
import {
  getCreatorAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
} from "@/lib/creatorAgentGateway";
import type { CreatorCategoryTreeResponse } from "@/types/category";

function resolveLocale(req: NextRequest, explicit?: string | null): string | undefined {
  const raw = explicit?.trim();
  if (raw) return raw;
  const accept = req.headers.get("accept-language") || "";
  const lower = accept.toLowerCase();
  if (lower.includes("zh")) return "zh-CN";
  return "en-US";
}

async function readUpstreamErrorDetail(res: Response): Promise<string> {
  try {
    const bodyText = await res.text();
    if (!bodyText) return "";
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object") {
        const detail =
          typeof parsed.detail === "string"
            ? parsed.detail
            : typeof parsed.message === "string"
              ? parsed.message
              : typeof parsed.error === "string"
                ? parsed.error
                : "";
        return detail || bodyText;
      }
    } catch {
      return bodyText;
    }
    return bodyText;
  } catch {
    return "";
  }
}

function normalizeCategoryImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return imageUrl;
  return imageUrl.replace("/mock-categories/", "/category-fallbacks/");
}

function normalizeCategoryTreeResponse(
  data: CreatorCategoryTreeResponse,
  creatorSlug: string,
  locale?: string,
  view?: string,
): CreatorCategoryTreeResponse {
  return {
    creatorId: data.creatorId ?? creatorSlug,
    taxonomyVersion: data.taxonomyVersion,
    market: data.market,
    locale: data.locale ?? locale,
    viewId: data.viewId ?? view,
    source: data.source,
    roots: (data.roots ?? []).map((node) => ({
      ...node,
      category: {
        ...node.category,
        imageUrl: normalizeCategoryImageUrl(node.category.imageUrl),
      },
      children: (node.children ?? []).map((child) => ({
        ...child,
        category: {
          ...child.category,
          imageUrl: normalizeCategoryImageUrl(child.category.imageUrl),
        },
      })),
    })),
    hotDeals: data.hotDeals ?? [],
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: creatorSlug } = await params;
  const baseUrl = getOptionalCreatorAgentBaseUrl();
  const apiKey = getCreatorAgentApiKey();
  const upstreamHeaders = apiKey
    ? { "X-Agent-API-Key": apiKey, "x-api-key": apiKey }
    : undefined;

  const url = new URL(req.url);
  const includeCounts =
    url.searchParams.get("includeCounts") ?? "true";
  const includeEmpty = url.searchParams.get("includeEmpty") ?? undefined;
  const dealsOnly = url.searchParams.get("dealsOnly") ?? "false";
  const view = url.searchParams.get("view") ?? undefined;
  const locale = resolveLocale(req, url.searchParams.get("locale"));

  if (!baseUrl) {
    return NextResponse.json(
      {
        error: "PIVOTA_AGENT_URL not configured for creator categories",
      },
      { status: 503 },
    );
  }

  try {
    const qsParams = new URLSearchParams({
      includeCounts,
      dealsOnly,
      ...(includeEmpty ? { includeEmpty } : {}),
      ...(view ? { view } : {}),
      ...(locale ? { locale } : {}),
    });
    const qs = qsParams.toString();

    const res = await fetch(
      `${baseUrl}/creator/${creatorSlug}/categories?${qs}`,
      {
        headers: upstreamHeaders,
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const detail = await readUpstreamErrorDetail(res);
      console.error("Failed to fetch creator categories", res.status, detail);
      return NextResponse.json(
        {
          error: "Upstream error for creator categories",
          detail: detail || undefined,
        },
        { status: res.status },
      );
    }

    const data = (await res.json()) as CreatorCategoryTreeResponse;

    const normalized = normalizeCategoryTreeResponse(
      data,
      creatorSlug,
      locale,
      view,
    );

    return NextResponse.json<CreatorCategoryTreeResponse>(normalized);
  } catch (error) {
    console.error("Error fetching creator categories", error);
    return NextResponse.json(
      { error: "Internal error fetching creator categories" },
      { status: 500 },
    );
  }
}
