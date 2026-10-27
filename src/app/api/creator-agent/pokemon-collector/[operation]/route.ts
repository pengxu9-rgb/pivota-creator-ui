import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createDemoSession,
  demoCookieName,
  demoRuntime,
  recordDemoEvent,
  requestAllowed,
  validDemoSession,
} from "@/lib/pokemon/demoRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const {
  withStateRequestAdmission,
} = require("@/lib/pokemon/stateRequestAdmission.cjs");

const { withFamilyOperation } = require("@/lib/pokemon/sourceFamilyAdvisory.cjs");
const { liveCatalog } = require("@/lib/pokemon/liveCatalog.cjs");
const { PRIVATE_ROUTE_MS } = require("@/lib/pokemon/requestBudgets.cjs");
const { syntheticEnabled,localEmptyList } = require("@/lib/pokemon/syntheticDemo.cjs");
const { betaScope, principalSession } = require("@/lib/pokemon/betaScope.cjs");

const SAFE = new Set([
  "collector_caller_denied",
  "workspace_not_found",
  "workspace_expired",
  "workspace_version_conflict",
  "logical_turn_in_progress",
  "catalog_confirmation_required",
  "invalid_private_workspace_request",
  "workspace_retention_limit",
  "workspace_storage_limit",
  "catalog_cancelled",
  "catalog_timeout",
  "catalog_rejected_action",
  "catalog_access_denied",
  "catalog_auth_unavailable",
  "catalog_temporarily_unavailable",
  "catalog_work_budget_exceeded",
  "catalog_snapshot_changed",
  "invalid_action",
  "journey_turn_limit",
  "invalid_caller_state",
  "stale_workspace_result",
  "workspace_restart_required",
]);
for (const code of [
  "invalid_catalog_response",
  "catalog_http_error",
  "catalog_transport_error",
  "chat_reply_too_long",
  "chat_not_found",
  "chat_version_conflict",
  "invalid_chat_request",
  "bookmark_not_found",
  "bookmark_limit",
  "conversation_storage_limit",
])
  SAFE.add(code);
for (const code of [
  "state_unavailable",
  "state_auth_unavailable",
  "state_timeout",
  "state_expired",
  "state_lease_lost",
  "state_version_conflict",
  "state_storage_limit",
])
  SAFE.add(code);
const OPERATIONS: Record<string, string> = {
  "collection-list": "collectionList",
  "collection-add": "collectionAdd",
  "collection-update": "collectionUpdate",
  "collection-remove": "collectionRemove",
  "alert-list": "alertList",
  "alert-add": "alertAdd",
  "alert-update": "alertUpdate",
  "alert-remove": "alertRemove",
  "chat-create": "create",
  "chat-send": "send",
  "chat-action": "action",
  "chat-get": "get",
  "chat-list": "list",
  "chat-cancel": "cancel",
  "chat-delete": "delete",
  "bookmark-list": "bookmarkList",
  "bookmark-add": "bookmarkAdd",
  "bookmark-remove": "bookmarkRemove",
  "chat-review-bookmark": "reviewBookmark",
  "chat-review-card": "reviewCard",
  "chat-compare-bookmarks": "compareBookmarks",
};
for (const code of [
  "invalid_personal_request",
  "personal_version_conflict",
  "personal_id_conflict",
  "personal_not_found",
  "personal_limit",
  "invalid_live_catalog_response",
  "live_catalog_unavailable",
  "catalog_market_display_denied",
  "catalog_market_unavailable",
])
  SAFE.add(code);
const json = (status: number, value: unknown) =>
  NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function payloadFor(req: NextRequest): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_private_workspace_request");
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 262144) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("invalid_private_workspace_request");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new Error("invalid_private_workspace_request");
  return payload;
}
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  const COOKIE = demoCookieName();
  const began = Date.now(),
    requestId = randomUUID();
  let operation = "unknown",
    status = 500,
    code: string | undefined;
  const supplied = req.headers.get("x-creator-request-id");
  const browserRequestId =
    supplied &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      supplied,
    )
      ? supplied
      : undefined;
  const reply = (statusCode: number, value: unknown) => {
    const response = json(statusCode, value);
    response.headers.set("X-Pokemon-Request-Id", requestId);
    return response;
  };
  try {
    if (!requestAllowed(req.headers) || req.nextUrl.search) {
      status = 403;
      return reply(status, { error: "collector_caller_denied" });
    }
    operation = (await params).operation;
    if (operation !== "bootstrap" && !Object.hasOwn(OPERATIONS, operation)) {
      status = 404;
      return reply(status, { error: "route_not_found" });
    }
    const payload = await payloadFor(req),
      service = demoRuntime();
    let session = req.cookies.get(COOKIE)?.value || "";
    const beta=betaScope();
    const accountSession=beta?principalSession(req.headers.get("x-pot-beta-principal")):undefined;
    if(beta&&session!==accountSession)throw new Error("collector_caller_denied");
    if (operation === "bootstrap") {
      if (Object.keys(payload).length)
        throw new Error("invalid_private_workspace_request");
      const exists = await validDemoSession(
        service.directory,
        session,
        began + PRIVATE_ROUTE_MS,
      );
      if (!exists)
        session = await createDemoSession(service.directory, began + PRIVATE_ROUTE_MS, accountSession);
      status = 200;
      const response = reply(status, {
        mode: beta?"invite_only_beta":"owner_local_demo",
        account_authenticated: !!beta,
        retention_hours: beta?720:24,
        synthetic_demo: syntheticEnabled(),
      });
      if (!exists)
        response.cookies.set(COOKIE, session, {
          httpOnly: true,
          sameSite: "strict",
          path: "/api/creator-agent/pokemon-collector",
          maxAge: beta?30*86400:86400,
        });
      return response;
    }
    if (!(await validDemoSession(service.directory, session, began + PRIVATE_ROUTE_MS))) {
      status = 403;
      return reply(status, { error: "collector_caller_denied" });
    }
    const context = { demoSession: session };
    const invoke = () =>
      service.telemetry.run({ requestId, browserRequestId }, async () => {
        const target =
          operation.startsWith("collection-") || operation.startsWith("alert-")
            ? service.personal
            : service.chats;
        return withFamilyOperation(async () => {
          const value = await target[OPERATIONS[operation]](context, payload, {
            signal: req.signal,
            deadline: began + PRIVATE_ROUTE_MS,
          });
          if(localEmptyList(operation,value))return value;
          return liveCatalog().validateFamilyPresentation(value, req.signal, began + PRIVATE_ROUTE_MS);
        }, { signal: req.signal, deadline: began + PRIVATE_ROUTE_MS });
      });
    // Stop must reach the active lease directly. Other owner-state requests
    // wait for the preceding operation and its cleanup; each write runs once.
    const result =
      operation === "chat-cancel"
        ? await invoke()
        : await withStateRequestAdmission(
            createHash("sha256")
              .update("owner-local-demo:" + session)
              .digest("hex"),
            invoke,
            req.signal,
            began + PRIVATE_ROUTE_MS,
          );
    status = 200;
    return reply(status, result);
  } catch (error) {
    const provided =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : error instanceof Error
          ? error.message
          : "";
    code = SAFE.has(provided)
      ? provided
      : provided === "request_too_large"
        ? provided
        : "private_collector_unavailable";
    status = [
      "state_unavailable",
      "state_auth_unavailable",
      "state_timeout",
      "state_lease_lost",
      "invalid_catalog_response",
      "catalog_http_error",
      "catalog_transport_error",
      "catalog_temporarily_unavailable",
      "catalog_auth_unavailable",
      "catalog_timeout",
      "invalid_live_catalog_response",
      "live_catalog_unavailable",
    ].includes(code)
      ? 503
      : code === "state_expired"
        ? 403
        : code === "state_version_conflict"
          ? 409
          : code === "collector_caller_denied"
            ? 403
            : [
                  "workspace_not_found",
                  "chat_not_found",
                  "bookmark_not_found",
                  "personal_not_found",
                ].includes(code)
              ? 404
              : [
                    "logical_turn_in_progress",
                    "workspace_version_conflict",
                    "chat_version_conflict",
                    "personal_version_conflict",
                    "personal_id_conflict",
                  ].includes(code)
                ? 409
                : code === "request_too_large"
                  ? 413
                  : 400;
    return reply(status, { error: code });
  } finally {
    await recordDemoEvent({
      kind: "creator_api",
      requestId,
      browserRequestId,
      operation,
      status,
      code,
      duration_ms: Date.now() - began,
    });
  }
}
