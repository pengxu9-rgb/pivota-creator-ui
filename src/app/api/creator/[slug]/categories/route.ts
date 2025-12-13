import { NextResponse, type NextRequest } from "next/server";
import { getMockCreatorCategoryTree } from "@/config/categoriesMock";
import type { CreatorCategoryTreeResponse } from "@/types/category";

export async function GET(req: NextRequest, { params }: any) {
  const creatorSlug = params.slug;
  let rawBase =
    process.env.PIVOTA_AGENT_BASE_URL ||
    process.env.PIVOTA_AGENT_URL ||
    process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL;
  const apiKey = process.env.PIVOTA_AGENT_API_KEY;

  const url = new URL(req.url);
  const includeCounts =
    url.searchParams.get("includeCounts") ?? "true";
  const dealsOnly = url.searchParams.get("dealsOnly") ?? "false";

  // Fall back to the shared gateway URL so that creator categories
  // use real data instead of mock when env vars are missing or
  // misconfigured in hosted environments.
  if (!rawBase) {
    rawBase =
      "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke";
  }

  if (!rawBase) {
    const mock = getMockCreatorCategoryTree(creatorSlug);
    return NextResponse.json<CreatorCategoryTreeResponse>(mock);
  }

  const baseUrl = rawBase.replace(/\/agent\/shop\/v1\/invoke\/?$/, "");

  try {
    const qs = new URLSearchParams({
      includeCounts,
      dealsOnly,
    }).toString();

    const res = await fetch(
      `${baseUrl}/creator/${creatorSlug}/categories?${qs}`,
      {
        headers: apiKey ? { "x-api-key": apiKey } : undefined,
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.error("Failed to fetch creator categories", res.status);
      const fallback = getMockCreatorCategoryTree(creatorSlug);
      return NextResponse.json<CreatorCategoryTreeResponse>(fallback);
    }

    const data = (await res.json()) as CreatorCategoryTreeResponse;

    const normalized: CreatorCategoryTreeResponse = {
      creatorId: data.creatorId ?? creatorSlug,
      roots: data.roots ?? [],
      hotDeals: data.hotDeals ?? [],
    };

    return NextResponse.json<CreatorCategoryTreeResponse>(normalized);
  } catch (error) {
    console.error("Error fetching creator categories", error);
    const fallback = getMockCreatorCategoryTree(creatorSlug);
    return NextResponse.json<CreatorCategoryTreeResponse>(fallback);
  }
}
