import { NextRequest, NextResponse } from "next/server";
import {
  demoRuntime,
  demoCookieName,
  validDemoSession,
  previewOrigin,
} from "@/lib/pokemon/demoRuntime";
const { liveCatalog, validId } = require("@/lib/pokemon/liveCatalog.cjs");
const { imagePreview } = require("@/lib/pokemon/imagePreview.cjs");
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  try {
    const origin = previewOrigin();
    if (
      !origin ||
      req.headers.get("host") !== new URL(origin).host ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      return NextResponse.json(
        { error: "collector_caller_denied" },
        { status: 403, headers },
      );
    const keys = [...req.nextUrl.searchParams.keys()],
      id = req.nextUrl.searchParams.get("card_id"),
      rendition = req.nextUrl.searchParams.get("rendition") ?? "detail";
    if (
      ![3, 4, 5].includes(keys.length) ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (k) =>
          !["card_id", "event_id", "image_sha256", "identity_sha256", "rendition"].includes(k),
      ) ||
      !["tile", "detail"].includes(rendition) ||
      !/^(?:source-image-fact|number-reading|catalog-source-image):[a-f0-9]{64}$/.test(
        req.nextUrl.searchParams.get("event_id") || "",
      ) ||
      !/^[a-f0-9]{64}$/.test(
        req.nextUrl.searchParams.get("image_sha256") || "",
      ) ||
      (req.nextUrl.searchParams.has("identity_sha256") &&
        !/^[a-f0-9]{64}$/.test(req.nextUrl.searchParams.get("identity_sha256") || "")) ||
      !validId(id)
    )
      return NextResponse.json(
        { error: "invalid_catalog_request" },
        { status: 400, headers },
      );
    const service = demoRuntime();
    if (
      !(await validDemoSession(
        service.directory,
        req.cookies.get(demoCookieName())?.value || "",
      ))
    )
      return NextResponse.json(
        { error: "collector_caller_denied" },
        { status: 403, headers },
      );
    const media = await liveCatalog().media(id, req.signal, {
      event_id: req.nextUrl.searchParams.get("event_id"),
      image_sha256: req.nextUrl.searchParams.get("image_sha256"),
      ...(req.nextUrl.searchParams.has("identity_sha256")
        ? { identity_sha256: req.nextUrl.searchParams.get("identity_sha256") }
        : {}),
    });
    const preview = await imagePreview(media, req.signal, rendition);
    return new NextResponse(new Uint8Array(preview.body), {
      headers: {
        ...headers,
        "Content-Type": preview.type,
        "Content-Length": String(preview.body.byteLength),
        "X-Catalog-Card-Id": encodeURIComponent(media.binding.card_id),
        "X-Catalog-Source-Image-Sha256": preview.source_sha256,
        "X-Catalog-Preview-Sha256": preview.preview_sha256,
        "X-Catalog-Media-Rendition": preview.source_format === "gif" ? "source-animation-frame0-preview-v1" : "source-derived-preview-v1",
        "X-Catalog-Preview-Size": preview.rendition,
        "X-Catalog-Media-Event": media.binding.event_id,
        "X-Catalog-Media-Basis": media.binding.basis,
        "X-Catalog-Media-Driver": media.delivery_driver,
        ...(preview.source_format === "gif" ? {
          "X-Catalog-Original-Format": "gif",
          "X-Catalog-Source-Frame": "0",
          "X-Catalog-Source-Frame-Count": String(preview.source_frame_count),
        } : {}),
      },
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String(e.code)
        : "catalog_media_unavailable";
    const safe = new Set([
      "catalog_media_not_recorded",
      "catalog_media_changed",
      "catalog_media_stale",
      "catalog_media_on_hold",
      "catalog_media_source_denied",
      "catalog_media_page_ambiguous",
      "catalog_media_hash_changed",
      "catalog_media_unavailable",
      "catalog_preview_unavailable",
      "invalid_catalog_media_evidence",
      "invalid_catalog_image",
      "catalog_record_unavailable",
      "catalog_timeout",
      "catalog_access_denied",
      "catalog_media_driver_not_configured",
      "catalog_image_store_object_missing",
      "catalog_image_store_expired",
      "catalog_image_store_timeout",
      "catalog_image_store_unavailable",
      "catalog_image_store_auth_unavailable",
      "catalog_image_store_changed",
      "catalog_image_store_limit",
      "invalid_catalog_image_store_configuration",
    ]);
    return NextResponse.json(
      { error: safe.has(code) ? code : "catalog_media_unavailable" },
      { status: code === "catalog_media_not_recorded" ? 404 : 503, headers },
    );
  }
}
