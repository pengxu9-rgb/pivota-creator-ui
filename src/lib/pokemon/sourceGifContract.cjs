"use strict";
// Pure contract checks: safe to import with the existing client media helpers.
const HEX = /^[a-f0-9]{64}$/;
const ANIMATION_KEYS = ["schema", "original_format", "original_sha256", "original_bytes", "canvas_width", "canvas_height", "frame_count", "animated", "loop_count", "frame_durations_ms", "frame_disposals", "frame_rgba_sha256", "frame0_rgba_sha256", "decoded_total_rgba_bytes", "decoder_policy", "preview_policy", "preview_frame_index", "source_low_resolution"];
const FALSE_FLAGS = ["catalog_identity_confirmed", "physical_printing_verified", "price_comparable", "automatic_offer_join_allowed", "display_allowed", "public_display_allowed", "exact_variant_verified", "image_review_complete", "source_access_approved", "source_response_authenticated"];
const CONTEXT_KEYS = ["schema", "card_id", "event_id", "evidence_basis", "binding_scope", "endpoint_snapshot", "endpoint_attributes_json", "identity_sha256", "status", "current_endpoint", "selection_status", "source_provider", "source_card_id", "source_set_code", "source_local_id", "source_document_kind", "source_document_ref", "source_document_sha256", "source_pin", "source_ref", "image_sha256", "inspection_tier", "warnings", "scope", "number_reading_qualification_changed", "source_animation", "gif_qualification_sha256", "acquisition_receipt_sha256", ...FALSE_FLAGS];
const fail = () => { throw Object.assign(new TypeError("invalid_live_catalog_response"), {code: "invalid_live_catalog_response"}); };
const need = (v) => { if (!v) fail(); };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function keys(v, names) { need(object(v) && Object.keys(v).sort().join("\0") === [...names].sort().join("\0")); }
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const pin = (v) => typeof v === "string" && HEX.test(v);
function parseAttributes(text) {
  need(typeof text === "string" && text.length > 0 && new TextEncoder().encode(text).length <= 256 * 1024);
  let at = 0, members = 0;
  const whitespace = () => { while (at < text.length && /[ \t\r\n]/.test(text[at])) at++; };
  function string() {
    need(text[at] === '"'); const start = at++;
    while (at < text.length) {
      if (text[at] === "\\") { at += 2; continue; }
      if (text[at++] === '"') {
        let value; try { value = JSON.parse(text.slice(start, at)); } catch { fail(); }
        for (const c of value) { const n = c.codePointAt(0); need(n < 0xd800 || n > 0xdfff); }
        return value;
      }
    }
    fail();
  }
  function value(depth) {
    need(depth <= 32 && ++members <= 65536); whitespace();
    if (text[at] === "{") {
      at++; whitespace(); const seen = new Set(); if (text[at] === "}") { at++; return; }
      for (;;) { whitespace(); const key = string(); need(!seen.has(key)); seen.add(key); whitespace(); need(text[at++] === ":"); value(depth + 1); whitespace(); const mark = text[at++]; if (mark === "}") return; need(mark === ","); }
    }
    if (text[at] === "[") {
      at++; whitespace(); if (text[at] === "]") { at++; return; }
      for (;;) { value(depth + 1); whitespace(); const mark = text[at++]; if (mark === "]") return; need(mark === ","); }
    }
    if (text[at] === '"') { string(); return; }
    const rest = text.slice(at), token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(rest);
    need(token); if (!/^(?:true|false|null)$/.test(token[0])) need(Number.isFinite(Number(token[0]))); at += token[0].length;
  }
  value(0); whitespace(); need(at === text.length);
  let result; try { result = JSON.parse(text); } catch { fail(); } need(object(result)); return result;
}
function validateAnimation(v, imageSha256) {
  keys(v, ANIMATION_KEYS);
  need(v.schema === "pokemon.source-GIF-animation.v1" && v.original_format === "GIF" && pin(v.original_sha256) && (imageSha256 === undefined || v.original_sha256 === imageSha256));
  need(integer(v.original_bytes, 14, 8 * 1024 * 1024) && integer(v.canvas_width, 1, 4096) && integer(v.canvas_height, 1, 4096) && integer(v.frame_count, 1, 16));
  const pixels = v.canvas_width * v.canvas_height * v.frame_count;
  need(pixels <= 16 * 1024 * 1024 && v.decoded_total_rgba_bytes === pixels * 4 && v.animated === (v.frame_count > 1));
  need(v.loop_count === null || integer(v.loop_count, 0, 65535));
  need(Array.isArray(v.frame_durations_ms) && v.frame_durations_ms.length === v.frame_count && v.frame_durations_ms.every((n) => integer(n, 0, 60000)) && v.frame_durations_ms.reduce((a, b) => a + b, 0) <= 120000);
  need(Array.isArray(v.frame_disposals) && v.frame_disposals.length === v.frame_count && v.frame_disposals.every((n) => integer(n, 0, 3)));
  need(Array.isArray(v.frame_rgba_sha256) && v.frame_rgba_sha256.length === v.frame_count && v.frame_rgba_sha256.every(pin) && v.frame0_rgba_sha256 === v.frame_rgba_sha256[0]);
  need(["complete_gif_all_frames_normalized_rgba_v1", "complete_gif_all_frames_opaque_xmp_normalized_rgba_v2"].includes(v.decoder_policy) && v.preview_policy === "frame0_webp_without_enlargement_v1" && v.preview_frame_index === 0);
  need(v.source_low_resolution === (v.canvas_width < 200 || v.canvas_height < 280));
  return v;
}
function canonicalURL(value, host) {
  need(typeof value === "string" && value.length <= 2048 && !/[\x00-\x20\x7f%\\]/.test(value));
  let u; try { u = new URL(value); } catch { fail(); }
  need(u.protocol === "https:" && u.host === host && !u.username && !u.password && !u.search && !u.hash && u.href === value && !u.pathname.split("/").slice(1).some((p) => ["", ".", ".."].includes(p)));
  return u;
}
function sourceReference(value, card, digest, {sourceIdentityCard, exactSnapshot, endpointFields}) {
  keys(value, CONTEXT_KEYS);
  need(value.schema === "pokemon.catalog-source-image-context.v2" && value.source_provider === "ptcg_database" && value.source_document_kind === "pinned_native_json" && card.language === "ja");
  need(value.card_id === card.card_id && value.evidence_basis === "catalog_source_reference" && value.binding_scope === "source_card_reference" && /^catalog-source-image:[a-f0-9]{64}$/.test(value.event_id));
  need(["current", "stale", "held"].includes(value.status) && ["selected", "superseded", "held"].includes(value.selection_status) && typeof value.current_endpoint === "boolean");
  need(!(value.selection_status === "held" && value.status !== "held") && !(value.status === "current" && !value.current_endpoint) && !(value.status === "stale" && value.current_endpoint));
  need(FALSE_FLAGS.every((k) => value[k] === false) && value.number_reading_qualification_changed === false && value.inspection_tier === "provider_declared_source_reference");
  need(value.scope === "Provider-declared source-card GIF original; previews show its deterministic first frame without enlargement. Finish, edition, physical copy and visible text are unverified.");
  need(pin(value.image_sha256) && pin(value.identity_sha256) && pin(value.source_document_sha256) && pin(value.gif_qualification_sha256) && pin(value.acquisition_receipt_sha256) && typeof digest === "function");
  const animation = validateAnimation(value.source_animation, value.image_sha256);
  const warnings = ["finish_edition_unverified", "not_visually_reviewed", "source_animation_frame0_preview", ...(animation.source_low_resolution ? ["low_resolution_source"] : [])];
  need(Array.isArray(value.warnings) && value.warnings.length === warnings.length && value.warnings.every((v, i) => v === warnings[i]));
  const raw = sourceIdentityCard(card, digest);
  exactSnapshot(value.endpoint_snapshot, card, digest, value.current_endpoint);
  const attributes = parseAttributes(value.endpoint_attributes_json);
  const knownCurrent = endpointFields.every((k) => value.endpoint_snapshot[k] === raw[k]) && object(raw.attributes) && digest(attributes) === digest(raw.attributes);
  need(digest(value.endpoint_snapshot) === value.identity_sha256);
  // The DTO exposes parsed attributes. A byte-only change can legitimately be
  // held by the backend even when those parsed values agree. Never infer true.
  need(value.current_endpoint ? knownCurrent : !knownCurrent || value.status === "held");
  need(typeof value.source_pin === "string" && value.source_pin === value.endpoint_snapshot.provenance);
  const p = /^ptcg-database:([a-f0-9]{40}):(data_jp\/([A-Za-z0-9_.-]+)\/([0-9]{1,6})\.json):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
  need(p && value.source_document_sha256 === p[5] && value.source_card_id === p[4] && value.source_set_code.toLowerCase() === p[3].toLowerCase() && value.source_set_code.toLowerCase() === value.endpoint_snapshot.set_code.toLowerCase());
  const numerator = value.endpoint_snapshot.collector_number.split("/")[0], local = value.source_local_id;
  need(typeof local === "string" && /^[A-Za-z0-9_.-]+$/.test(local) && (local.toLowerCase() === numerator.toLowerCase() || /^[0-9]+$/.test(local) && /^[0-9]+$/.test(numerator) && BigInt(local) === BigInt(numerator)));
  canonicalURL(value.source_document_ref, "github.com");
  need(value.source_document_ref === "https://github.com/type-null/PTCG-database/blob/" + p[1] + "/" + p[2]);
  const image = canonicalURL(value.source_ref, "www.pokemon-card.com");
  const prefix = "/assets/images/card_images/large/" + p[3] + "/" + p[4].padStart(6, "0") + "_";
  need(image.pathname.startsWith(prefix) && /^[A-Za-z0-9_.-]+\.gif$/.test(image.pathname.slice(prefix.length)));
  return value;
}
module.exports = {validateAnimation, sourceReference, parseAttributes, ANIMATION_KEYS};
