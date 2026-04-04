import { NextResponse, type NextRequest } from "next/server";
import type { Product, RawProductPrice } from "@/types/product";
import {
  getCreatorAgentApiKey,
  getOptionalCreatorAgentBaseUrl,
} from "@/lib/creatorAgentGateway";
import { mapRawProduct } from "@/lib/productMapper";

interface BackendProduct {
  id: string;
  title: string;
  description: string;
  price?: RawProductPrice;
  currency?: string;
  price_amount?: number | string;
  price_currency?: string;
  price_label?: string;
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

export async function GET(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ slug: string; categorySlug: string }> },
) {
  const { slug: creatorSlug, categorySlug } = await params;
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

  if (!baseUrl) {
    return NextResponse.json(
      {
        error: "PIVOTA_AGENT_URL not configured for creator category products",
      },
      { status: 503 },
    );
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
      const detail = await readUpstreamErrorDetail(res);
      console.error(
        "Failed to fetch category products",
        res.status,
        detail,
        creatorSlug,
        categorySlug,
      );
      return NextResponse.json(
        {
          error: "Upstream error for creator category products",
          detail: detail || undefined,
        },
        { status: res.status },
      );
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
    return NextResponse.json(
      { error: "Internal error fetching creator category products" },
      { status: 500 },
    );
  }
}
