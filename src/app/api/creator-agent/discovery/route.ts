import { NextRequest, NextResponse } from "next/server";
import { getCreatorById } from "@/config/creatorAgents";
import {
  getOptionalCreatorInvokeUrl,
  hasConfiguredCreatorInvokeUrl,
} from "@/lib/creatorAgentGateway";
import { callPivotaDiscoveryFeed } from "@/lib/pivotaAgentClient";
import { mapRawProducts } from "@/lib/productMapper";
import type { DiscoveryRecentView, DiscoverySurface } from "@/types/product";

function extractUpstreamStatusAndDetail(message: string): {
  status?: number;
  detail: string;
} {
  const statusMatch = message.match(/status\s+(\d{3})/);
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  const bodyMatch = message.match(/body:\s*(.+)$/s);
  if (bodyMatch) {
    const bodyText = bodyMatch[1].trim();
    try {
      const parsed = JSON.parse(bodyText);
      const detail =
        parsed && typeof parsed === "object"
          ? Array.isArray((parsed as { details?: { operation?: { _errors?: unknown } } }).details?.operation?._errors) &&
            typeof (parsed as { details?: { operation?: { _errors?: unknown[] } } }).details?.operation?._errors?.[0] === "string"
            ? String((parsed as { details?: { operation?: { _errors?: string[] } } }).details?.operation?._errors?.[0])
            : typeof parsed.detail === "string"
              ? parsed.detail
              : typeof parsed.message === "string"
                ? parsed.message
                : typeof parsed.error === "string"
                  ? parsed.error
                  : bodyText
          : bodyText;
      return { status, detail };
    } catch {
      return { status, detail: bodyText };
    }
  }

  return { status, detail: message };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    creatorId,
    userId,
    recentQueries,
    recentViews,
    traceId,
    surface,
    page,
    limit,
    locale,
    debug,
  } = body as {
    creatorId: string;
    userId?: string | null;
    recentQueries?: string[];
    recentViews?: DiscoveryRecentView[];
    traceId?: string | null;
    surface?: DiscoverySurface;
    page?: number;
    limit?: number;
    locale?: string;
    debug?: boolean;
  };

  const creator = getCreatorById(creatorId);
  if (!creator) {
    return NextResponse.json({ error: "Unknown creatorId" }, { status: 400 });
  }

  if (surface !== "home_hot_deals" && surface !== "browse_products") {
    return NextResponse.json({ error: "Invalid discovery surface" }, { status: 400 });
  }

  if (!hasConfiguredCreatorInvokeUrl()) {
    return NextResponse.json(
      {
        error: "Creator discovery backend is not configured",
        detail: "PIVOTA_AGENT_URL is not configured",
        upstreamStatus: null,
        traceId: traceId ?? null,
        agentUrlConfigured: false,
        agentUrlUsed: "unconfigured",
      },
      { status: 503 },
    );
  }

  try {
    const response = await callPivotaDiscoveryFeed({
      creatorId: creator.id,
      creatorName: creator.name,
      userId: userId ?? undefined,
      recentQueries,
      recentViews,
      traceId: traceId ?? undefined,
      surface,
      page,
      limit,
      locale,
      debug: debug === true,
    });

    return NextResponse.json(
      {
        products: mapRawProducts(response.products),
        page_info: response.page_info ?? undefined,
        metadata: response.metadata ?? undefined,
        rawAgentResponse: response.raw,
        agentUrlUsed: response.agentUrlUsed,
        traceId: traceId ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { status: upstreamStatus, detail } =
      extractUpstreamStatusAndDetail(message);
    const shouldLog =
      upstreamStatus == null || ![401, 403].includes(upstreamStatus);
    if (shouldLog) {
      console.error(error);
    }
    const status =
      upstreamStatus &&
      [400, 401, 403, 409, 429, 503, 504].includes(upstreamStatus)
        ? upstreamStatus
        : 500;
    return NextResponse.json(
      {
        error: "Creator discovery backend error",
        detail,
        upstreamStatus: upstreamStatus ?? null,
        traceId: traceId ?? null,
        agentUrlConfigured: hasConfiguredCreatorInvokeUrl(),
        agentUrlUsed: getOptionalCreatorInvokeUrl() || "unconfigured",
      },
      { status },
    );
  }
}
