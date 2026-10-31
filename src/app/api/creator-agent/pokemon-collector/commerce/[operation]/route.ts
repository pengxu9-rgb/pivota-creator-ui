import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { demoRuntime, demoCookieName, validDemoSession, requestAllowed } from "@/lib/pokemon/demoRuntime";
const { commerceConfiguration, validateCommerceRequest, validateCommerceResponse, validateCommerceMode,publicReadOperationAllowed } = require("@/lib/pokemon/commerceContract.cjs");
const history=require("@/lib/pokemon/commerceHistory.cjs");
const {runCommerce}=require("@/lib/pokemon/commerceRun.cjs");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (status: number, value: unknown) => NextResponse.json(value, { status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
export async function POST(req: NextRequest, { params }: { params: Promise<{ operation: string }> }) {
  try {
    if (!requestAllowed(req.headers) || req.nextUrl.search) return json(403, { error: "collector_caller_denied" });
    const operation = (await params).operation;
    if (!["research", "select", "handoff", "psa"].includes(operation)) return json(404, { error: "route_not_found" });
    const service = demoRuntime(), session = req.cookies.get(demoCookieName())?.value || "";
    if (!(await validDemoSession(service.directory, session))) return json(403, { error: "collector_caller_denied" });
    if(!publicReadOperationAllowed(operation))return json(403,{error:"read_only_scope"});
    const reader = req.body?.getReader();
    if (!reader) return json(400, { error: "invalid_commerce_request" });
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length;
      if (size > 32768) { await reader.cancel(); return json(413, { error: "request_too_large" }); } chunks.push(r.value); }
    } finally { reader.releaseLock(); }
    let payload; try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json(400, { error: "invalid_commerce_request" }); }
    const conversation=payload?.conversation;
    history.context(conversation);payload={...payload};delete payload.conversation;
    validateCommerceRequest(operation, payload);
    const invoke=async()=>{
    const config = commerceConfiguration();
    const response = await fetch(config.url + "/commerce/" + operation, { method: "POST", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + config.token,
        "X-Commerce-Owner": createHash("sha256").update("pokemon-commerce:" + session).digest("hex") },
      body: JSON.stringify(payload), signal: AbortSignal.any([req.signal, AbortSignal.timeout(operation === "research" ? 60000 : 25000)]) });
    const bodyReader = response.body?.getReader(); if (!bodyReader) throw Error("commerce_unavailable");
    const parts: Uint8Array[] = []; let length = 0;
    try { for (;;) { const r = await bodyReader.read(); if (r.done) break; length += r.value.length;
      if (length > 1048576) { await bodyReader.cancel(); throw Error("invalid_commerce_response"); } parts.push(r.value); }
    } finally { bodyReader.releaseLock(); }
    const value = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!response.ok) {
      const safe = ["read_only_scope", "grade_review_required", "offer_changed", "offer_unavailable", "selection_expired", "selection_not_found", "invalid_request", "unsupported_url", "unsupported_forwarder", "quote_unavailable"];
      const error=safe.includes(value.error)?value.error:"commerce_unavailable";throw Object.assign(Error(error),{status:response.status===409?409:503});
    }
    validateCommerceResponse(operation, value);
    if (operation === "research" && value.card_id !== payload.card_id) throw Error("invalid_commerce_response");
    if (operation === "psa" && value.verification.certificate_number !== payload.certificate_number) throw Error("invalid_commerce_response");
    validateCommerceMode(value.mode);
    if(req.signal.aborted)throw Error("commerce_unavailable");
    return value;
    };
    const value=await runCommerce({signal:req.signal,
      begin:()=>service.chats.beginCommerce({demoSession:session},{id:conversation.id,version:conversation.version,request_id:conversation.request_id,operation,request:payload},{signal:req.signal,deadline:Date.now()+8000}),
      finish:(reservation:{event_id:string},result:{response?:unknown;error?:string})=>service.chats.finishCommerce({demoSession:session},{id:conversation.id,event_id:reservation.event_id,operation,request:payload,...result},{signal:AbortSignal.timeout(8000),deadline:Date.now()+8000}),invoke});
    return json(200,value);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if(code==="read_only_scope")return json(403,{error:code});
    if(["grade_review_required","chat_version_conflict","logical_turn_in_progress","commerce_check_already_recorded","commerce_reselection_required","commerce_history_limit","commerce_reservation_expired","offer_changed","offer_unavailable","selection_expired","selection_not_found"].includes(code))return json(409,{error:code});
    return json(code === "invalid_commerce_request" ? 400 : 503, { error:
      ["invalid_commerce_request", "invalid_commerce_response", "commerce_not_configured"].includes(code) ? code : "commerce_unavailable" });
  }
}
