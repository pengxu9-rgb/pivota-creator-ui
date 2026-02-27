import { NextResponse, type NextRequest } from "next/server";
import type { Product } from "@/types/product";
import {
  getCreatorAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
} from "@/lib/creatorAgentGateway";
import { mapRawProduct } from "@/lib/productMapper";

interface BackendProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_url?: string;
  inventory_quantity: number;
  merchant_id?: string;
  merchant_name?: string;
  creator_mentions?: number;
  from_creator_directly?: boolean;
  detail_url?: string;
  best_deal?: any;
  all_deals?: any[];
}

interface CreatorCategoryProductsResponse {
  creatorId: string;
  categorySlug: string;
  products: BackendProduct[];
  pagination?: {
    page: number;
    limit: number;
    total?: number;
  };
}

function resolveLocale(req: NextRequest, explicit?: string | null): string | undefined {
  const raw = explicit?.trim();
  if (raw) return raw;
  const accept = req.headers.get("accept-language") || "";
  const lower = accept.toLowerCase();
  if (lower.includes("zh")) return "zh-CN";
  return "en-US";
}

function getMockCategoryProducts(
  _creatorSlug: string,
  categorySlug: string,
): Product[] {
  const base: BackendProduct[] = [
    {
      id: `${categorySlug}-p1`,
      title: `Sample ${categorySlug} pick #1`,
      description: "Mock product for local browsing without backend.",
      price: 39,
      currency: "USD",
      image_url: "https://images.pexels.com/photos/3738084/pexels-photo-3738084.jpeg?auto=compress&cs=tinysrgb&w=800",
      inventory_quantity: 12,
    },
    {
      id: `${categorySlug}-p2`,
      title: `Sample ${categorySlug} pick #2`,
      description: "Another mock item curated for this category.",
      price: 59,
      currency: "USD",
      image_url: "https://images.pexels.com/photos/3738090/pexels-photo-3738090.jpeg?auto=compress&cs=tinysrgb&w=800",
      inventory_quantity: 5,
    },
  ];

  return base.map((p) => mapRawProduct(p as any));
}

export async function GET(req: NextRequest, { params }: any) {
  const creatorSlug = params.slug;
  const categorySlug = params.categorySlug;
  const baseUrl = getOptionalCreatorAgentBaseUrl();
  const apiKey = getCreatorAgentApiKey();
  const upstreamHeaders = apiKey
    ? { "X-Agent-API-Key": apiKey, "x-api-key": apiKey }
    : undefined;

  const url = new URL(req.url);
  const page = url.searchParams.get("page") ?? "1";
  const limit = url.searchParams.get("limit") ?? "500";
  const view = url.searchParams.get("view") ?? undefined;
  const locale = resolveLocale(req, url.searchParams.get("locale"));

  // In production, never silently fall back to mock:
  // if gateway URL is missing, surface an explicit error.
  if (!baseUrl && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "PIVOTA_AGENT_URL not configured for creator category products",
      },
      { status: 500 },
    );
  }

  // In development, allow local mock when backend URL is absent.
  if (!baseUrl) {
    const mockProducts = getMockCategoryProducts(creatorSlug, categorySlug);
    return NextResponse.json<{
      products: Product[];
      pagination: { page: number; limit: number; total: number };
    }>({
      products: mockProducts,
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || mockProducts.length,
        total: mockProducts.length,
      },
    });
  }

  try {
    const qsParams = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(view ? { view } : {}),
      ...(locale ? { locale } : {}),
    }).toString();
    const res = await fetch(
      `${baseUrl}/creator/${creatorSlug}/categories/${categorySlug}/products?${qsParams}`,
      {
        headers: upstreamHeaders,
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.error(
        "Failed to fetch category products",
        res.status,
        creatorSlug,
        categorySlug,
      );
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "Upstream error for creator category products" },
          { status: res.status },
        );
      }
      const mockProducts = getMockCategoryProducts(creatorSlug, categorySlug);
      return NextResponse.json<{
        products: Product[];
        pagination: { page: number; limit: number; total: number };
      }>({
        products: mockProducts,
        pagination: {
          page: Number(page) || 1,
          limit: Number(limit) || mockProducts.length,
          total: mockProducts.length,
        },
      });
    }

    const data = (await res.json()) as CreatorCategoryProductsResponse;

    const backendProducts = data.products ?? [];
    const normalized: Product[] = backendProducts.map((raw) =>
      mapRawProduct(raw as any),
    );

    return NextResponse.json<{
      products: Product[];
      pagination?: CreatorCategoryProductsResponse["pagination"];
    }>({
      products: normalized,
      pagination: data.pagination,
    });
  } catch (error) {
    console.error(
      "Error fetching creator category products",
      error,
      creatorSlug,
      categorySlug,
    );
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Internal error fetching creator category products" },
        { status: 500 },
      );
    }
    const mockProducts = getMockCategoryProducts(creatorSlug, categorySlug);
    return NextResponse.json<{
      products: Product[];
      pagination: { page: number; limit: number; total: number };
    }>({
      products: mockProducts,
      pagination: {
        page: Number(page) || 1,
        limit: Number(limit) || mockProducts.length,
        total: mockProducts.length,
      },
    });
  }
}
