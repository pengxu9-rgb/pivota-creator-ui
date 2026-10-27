"use strict";
const sharp = require("sharp");
const {createHash} = require("node:crypto");
const {validateAnimation} = require("./sourceGifContract.cjs");
const hash = (b) => createHash("sha256").update(b).digest("hex");
const fail = () => { throw Object.assign(new Error("catalog_preview_unavailable"), {code: "catalog_preview_unavailable"}); };
const need = (v) => { if (!v) fail(); };
const isGif = (b) => Buffer.isBuffer(b) && ["GIF87a", "GIF89a"].some((v) => b.subarray(0, 6).equals(Buffer.from(v)));
function parseGif(body, policy = "complete_gif_all_frames_normalized_rgba_v1") {
  const withXMP = policy === "complete_gif_all_frames_opaque_xmp_normalized_rgba_v2";
  need(withXMP || policy === "complete_gif_all_frames_normalized_rgba_v1");
  need(isGif(body) && body.length >= 14 && body.length <= 8 * 1024 * 1024);
  let offset = 6, blocks = 0, commentBytes = 0, pending = null, loop = null, loopSeen = false, xmpSeen = false;
  const byte = () => { need(offset < body.length); return body[offset++]; };
  const word = () => byte() | byte() << 8;
  const skip = (n) => { need(Number.isSafeInteger(n) && n >= 0 && offset + n <= body.length); offset += n; };
  const subblocks = () => { let bytes = 0; for (let count = 0; count < 4096; count++) { const n = byte(); if (n === 0) return bytes; skip(n); bytes += n; } fail(); };
  const width = word(), height = word(), packed = byte(), background = byte(); byte();
  need(width >= 1 && width <= 4096 && height >= 1 && height <= 4096 && width * height <= 16 * 1024 * 1024);
  const globalColors = packed & 128 ? 2 ** ((packed & 7) + 1) : 0;
  if (globalColors) need(background < globalColors);
  if (globalColors) skip(globalColors * 3);
  const frames = [];
  for (;;) {
    need(++blocks <= 4096); const marker = byte();
    if (marker === 59) { need(offset === body.length && pending === null && frames.length >= 1 && (!withXMP || xmpSeen)); break; }
    if (marker === 33) {
      const kind = byte();
      if (kind === 249) {
        need(pending === null && byte() === 4); const flags = byte(), delay = word(), transparent = byte();
        need(byte() === 0 && (flags & 224) === 0 && (flags & 2) === 0 && (flags >> 2 & 7) <= 3 && delay * 10 <= 60000);
        pending = {duration: delay * 10, disposal: flags >> 2 & 7, transparent: flags & 1 ? transparent : null};
      } else if (kind === 254) {
        commentBytes += subblocks(); need(commentBytes <= 65536);
      } else if (kind === 255) {
        need(frames.length === 0 && (!withXMP || pending === null) && byte() === 11 && offset + 11 <= body.length);
        const application = body.subarray(offset, offset + 11); skip(11);
        if (application.equals(Buffer.from("NETSCAPE2.0"))) {
          need(!loopSeen); need(byte() === 3 && byte() === 1); loop = word(); need(byte() === 0); loopSeen = true;
        } else if (application.equals(Buffer.from("XMP DataXMP"))) {
          // A declared format branch, never a retry after a failed legacy parse.
          need(withXMP && !xmpSeen && pending === null);
          const trailer = Buffer.from([1, ...Array.from({length: 255}, (_, i) => 255 - i), 0, 0]);
          const boundedEnd = Math.min(body.length, offset + 65536 + trailer.length);
          const relativeEnd = body.subarray(offset, boundedEnd).indexOf(trailer);
          need(relativeEnd > 0 && relativeEnd <= 65536);
          const packet = body.subarray(offset, offset + relativeEnd);
          need(!packet.includes(0));
          try { new TextDecoder("utf-8", {fatal: true}).decode(packet); } catch { fail(); }
          offset += relativeEnd + trailer.length; xmpSeen = true;
        } else fail();
      } else fail();
      continue;
    }
    need(marker === 44); const left = word(), top = word(), w = word(), h = word(), flags = byte();
    need(w > 0 && h > 0 && left + w <= width && top + h <= height && (flags & 24) === 0);
    const localColors = flags & 128 ? 2 ** ((flags & 7) + 1) : 0;
    if (localColors) skip(localColors * 3);
    const colors = localColors || globalColors; need(colors > 0);
    if (pending?.transparent !== null && pending?.transparent !== undefined) need(pending.transparent < colors);
    const lzw = byte(); need(lzw >= 2 && lzw <= 8 && subblocks() > 0);
    frames.push(pending || {duration: 0, disposal: 0, transparent: null}); pending = null;
    need(frames.length <= 16 && width * height * frames.length <= 16 * 1024 * 1024 && frames.reduce((s, f) => s + f.duration, 0) <= 120000);
  }
  return {width, height, frame_count: frames.length, loop_count: loop, durations: frames.map((f) => f.duration), disposals: frames.map((f) => f.disposal)};
}
function normalizeRGBA(buffer) {
  need(Buffer.isBuffer(buffer) && buffer.length % 4 === 0);
  for (let i = 0; i < buffer.length; i += 4) if (buffer[i + 3] === 0) buffer[i] = buffer[i + 1] = buffer[i + 2] = 0;
  return buffer;
}
async function imagePreview(media, signal, rendition, preset, gate) {
  const source = media?.body, binding = media?.binding, d = binding?.source_animation;
  try {
    need(Buffer.isBuffer(source) && isGif(source) && binding.basis === "catalog_source_reference" && binding.binding_scope === "source_card_reference" && /^[a-f0-9]{64}$/.test(binding.gif_qualification_sha256 || ""));
    validateAnimation(d, binding.image_sha256); need(source.length === d.original_bytes && hash(source) === d.original_sha256);
    const declared = parseGif(source, d.decoder_policy);
    need(declared.width === d.canvas_width && declared.height === d.canvas_height && declared.frame_count === d.frame_count && declared.loop_count === d.loop_count && JSON.stringify(declared.durations) === JSON.stringify(d.frame_durations_ms) && JSON.stringify(declared.disposals) === JSON.stringify(d.frame_disposals));
  } catch { fail(); }
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener("abort", abort, {once: true}); if (signal?.aborted) abort();
  const timer = setTimeout(abort, 5000);
  try {
    return await gate.run(async () => {
      controller.signal.throwIfAborted();
      const full = sharp(source, {animated: true, pages: -1, limitInputPixels: 16 * 1024 * 1024, failOn: "warning"}).timeout({seconds: 3});
      let preview;
      try {
        const metadata = await full.metadata();
        need(metadata.format === "gif" && metadata.width === d.canvas_width && metadata.height === d.canvas_height * d.frame_count && (metadata.pages ?? 1) === d.frame_count && (metadata.pageHeight ?? metadata.height) === d.canvas_height && metadata.orientation === undefined);
        need((metadata.loop ?? null) === d.loop_count && JSON.stringify(metadata.delay ?? d.frame_durations_ms.map(() => 0)) === JSON.stringify(d.frame_durations_ms));
        controller.signal.throwIfAborted();
        const decoded = await full.ensureAlpha().raw().toBuffer({resolveWithObject: true});
        need(decoded.info.format === "raw" && decoded.info.width === d.canvas_width && decoded.info.height === d.canvas_height * d.frame_count && decoded.info.channels === 4 && decoded.info.depth === "uchar" && decoded.data.length === d.decoded_total_rgba_bytes);
        normalizeRGBA(decoded.data); const frameBytes = d.canvas_width * d.canvas_height * 4;
        for (let i = 0; i < d.frame_count; i++) { controller.signal.throwIfAborted(); need(hash(decoded.data.subarray(i * frameBytes, (i + 1) * frameBytes)) === d.frame_rgba_sha256[i]); }
        // This exact first full canvas is the sole preview source. No frame choice.
        const first = decoded.data.subarray(0, frameBytes);
        preview = sharp(first, {raw: {width: d.canvas_width, height: d.canvas_height, channels: 4}, limitInputPixels: 16 * 1024 * 1024, failOn: "warning"}).timeout({seconds: 3});
        const {data, info} = await preview.resize({width: preset.width, height: preset.height, fit: "inside", withoutEnlargement: true}).webp({quality: preset.quality, effort: 3}).toBuffer({resolveWithObject: true});
        controller.signal.throwIfAborted();
        need(info.format === "webp" && data.length > 0 && data.length <= preset.maxBytes && info.width <= d.canvas_width && info.height <= d.canvas_height && info.width <= preset.width && info.height <= preset.height);
        return {body: data, type: "image/webp", source_sha256: d.original_sha256, preview_sha256: hash(data), width: info.width, height: info.height, rendition, source_format: "gif", source_frame_index: 0, source_frame_count: d.frame_count};
      } finally { full.destroy(); preview?.destroy(); }
    }, controller.signal);
  } catch { fail(); }
  finally { controller.abort(); clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
module.exports = {imagePreview, isGif, parseGif, normalizeRGBA};
