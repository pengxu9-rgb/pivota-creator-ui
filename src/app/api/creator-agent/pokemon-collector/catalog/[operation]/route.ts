import { NextRequest, NextResponse } from "next/server";
import {
  demoRuntime,
  demoCookieName,
  validDemoSession,
  requestAllowed,
} from "@/lib/pokemon/demoRuntime";
const { liveCatalog } = require("@/lib/pokemon/liveCatalog.cjs");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (status: number, value: unknown) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    if (!requestAllowed(req.headers) || req.nextUrl.search)
      return json(403, { error: "collector_caller_denied" });
    const operation = (await params).operation;
    if (!["search", "card", "status", "market"].includes(operation))
      return json(404, { error: "route_not_found" });
    const service = demoRuntime();
    if (
      !(await validDemoSession(
        service.directory,
        req.cookies.get(demoCookieName())?.value || "",
      ))
    )
      return json(403, { error: "collector_caller_denied" });
    const reader = req.body?.getReader();
    if (!reader) return json(400, { error: "invalid_catalog_request" });
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > (operation === "card" ? 32768 : 4096)) {
          await reader.cancel();
          return json(413, { error: "request_too_large" });
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return json(400, { error: "invalid_catalog_request" });
    if (
      operation === "card" &&
      (Object.keys(payload).length !== 1 ||
        !(
          typeof payload.card_id === "string" || Array.isArray(payload.card_ids)
        ))
    )
      return json(400, { error: "invalid_catalog_request" });
    if (operation === "status" && Object.keys(payload).length)
      return json(400, { error: "invalid_catalog_request" });
    const value =
      operation === "status"
        ? await liveCatalog().status(req.signal)
        : operation === "market"
          ? await liveCatalog().market(payload, req.signal)
          : operation === "search"
            ? await liveCatalog().search(payload, req.signal)
            : Array.isArray(payload.card_ids)
              ? await liveCatalog().cards(payload.card_ids, req.signal)
              : await liveCatalog().card(payload.card_id, req.signal);
    return json(200, value);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String(e.code)
        : "live_catalog_unavailable";
    const safe = new Set([
      "invalid_catalog_request",
      "catalog_record_unavailable",
      "catalog_access_denied",
      "catalog_auth_unavailable",
      "catalog_timeout",
      "catalog_busy",
      "catalog_cancelled",
      "invalid_live_catalog_response",
      "live_catalog_unavailable",
      "live_response_too_large",
      "catalog_market_display_denied",
      "catalog_market_unavailable",
    ]);
    return json(
      code === "invalid_catalog_request"
        ? 400
        : code === "catalog_record_unavailable"
          ? 404
          : 503,
      { error: safe.has(code) ? code : "live_catalog_unavailable" },
    );
  }
}
