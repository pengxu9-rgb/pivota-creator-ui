import { NextResponse, type NextRequest } from "next/server";
import { getMockCreatorCategoryTree } from "@/config/categoriesMock";
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

export async function GET(req: NextRequest, { params }: any) {
  const creatorSlug = params.slug;
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

  // In production, never silently fall back to mock:
  // if gateway URL is missing, surface an explicit error.
  if (!baseUrl && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "PIVOTA_AGENT_URL not configured for creator categories",
      },
      { status: 500 },
    );
  }

  // In development, allow local mock when backend URL is absent.
  if (!baseUrl) {
    const mock = getMockCreatorCategoryTree(creatorSlug);
    return NextResponse.json<CreatorCategoryTreeResponse>(mock);
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
      console.error("Failed to fetch creator categories", res.status);
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Upstream error for creator categories" },
          { status: res.status },
        );
      }
      const fallback = getMockCreatorCategoryTree(creatorSlug);
      return NextResponse.json<CreatorCategoryTreeResponse>(fallback);
    }

    const data = (await res.json()) as CreatorCategoryTreeResponse;

    const normalized: CreatorCategoryTreeResponse = {
      creatorId: data.creatorId ?? creatorSlug,
      taxonomyVersion: data.taxonomyVersion,
      market: data.market,
      locale: data.locale ?? locale,
      viewId: data.viewId ?? view,
      source: data.source,
      roots: data.roots ?? [],
      hotDeals: data.hotDeals ?? [],
    };

    return NextResponse.json<CreatorCategoryTreeResponse>(normalized);
  } catch (error) {
    console.error("Error fetching creator categories", error);
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Internal error fetching creator categories" },
        { status: 500 },
      );
    }
    const fallback = getMockCreatorCategoryTree(creatorSlug);
    return NextResponse.json<CreatorCategoryTreeResponse>(fallback);
  }
}
