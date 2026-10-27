"use strict";
const sharp = require("sharp"),
  { createHash } = require("node:crypto"),
  { createReadAdmission } = require("./catalogReadAdmission.cjs");
const key = Symbol.for("pivota.pokemon.media.preview-admission.v1");
const gate =
  globalThis[key] || (globalThis[key] = createReadAdmission({ maxQueued: 8 }));
const hash = (body) => createHash("sha256").update(body).digest("hex");
function fail() {
  throw Object.assign(new Error("catalog_preview_unavailable"), {
    code: "catalog_preview_unavailable",
  });
}
function rejectAnimatedPng(body) {
  if (
    !body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return;
  let offset = 8;
  for (let chunks = 0; chunks < 4096 && offset + 12 <= body.length; chunks++) {
    const length = body.readUInt32BE(offset);
    if (length > body.length - offset - 12) fail();
    const type = body.toString("ascii", offset + 4, offset + 8);
    if (["acTL", "fcTL", "fdAT"].includes(type)) fail();
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || offset !== body.length) fail();
      return;
    }
  }
  fail();
}
async function imagePreview(media, signal, rendition = "detail") {
  const presets = {
    tile: { width: 360, height: 512, quality: 74, maxBytes: 128 * 1024 },
    detail: { width: 720, height: 1024, quality: 82, maxBytes: 512 * 1024 },
  };
  if (!Object.hasOwn(presets, rendition)) fail();
  const preset = presets[rendition];
  const source = media?.body,
    sourceHash = media?.binding?.image_sha256;
  if (
    !Buffer.isBuffer(source) ||
    !source.length ||
    source.length > 8 * 1024 * 1024 ||
    !/^[a-f0-9]{64}$/.test(sourceHash || "") ||
    hash(source) !== sourceHash
  )
    fail();
  const gif = require("./sourceGifPreview.cjs");
  if (gif.isGif(source) || media?.binding?.source_animation !== undefined)
    return gif.imagePreview(media, signal, rendition, preset, gate);
  rejectAnimatedPng(source);
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, 5000);
  try {
    return await gate.run(async () => {
      controller.signal.throwIfAborted();
      const pipeline = sharp(source, {
        limitInputPixels: 16 * 1024 * 1024,
        failOn: "warning",
      }).timeout({ seconds: 3 });
      try {
        const metadata = await pipeline.metadata(),
          oriented = metadata.autoOrient;
        if (
          !["png", "jpeg", "webp"].includes(metadata.format) ||
          !Number.isSafeInteger(metadata.width) ||
          !Number.isSafeInteger(metadata.height) ||
          metadata.width < 1 ||
          metadata.height < 1 ||
          metadata.width * metadata.height > 16 * 1024 * 1024 ||
          !Number.isSafeInteger(oriented?.width) ||
          !Number.isSafeInteger(oriented?.height) ||
          oriented.width < 1 ||
          oriented.height < 1 ||
          (metadata.pages !== undefined && metadata.pages !== 1) ||
          metadata.pageHeight
        )
          fail();
        controller.signal.throwIfAborted();
        const { data, info } = await pipeline
          .autoOrient()
          .resize({
            width: preset.width,
            height: preset.height,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: preset.quality, effort: 3 })
          .toBuffer({ resolveWithObject: true });
        // Keep the admission slot until native processing settles, even after cancellation.
        controller.signal.throwIfAborted();
        if (
          info.format !== "webp" ||
          !data.length ||
          data.length > preset.maxBytes ||
          info.width > oriented.width ||
          info.height > oriented.height ||
          info.width > preset.width ||
          info.height > preset.height
        )
          fail();
        return {
          body: data,
          type: "image/webp",
          source_sha256: sourceHash,
          preview_sha256: hash(data),
          width: info.width,
          height: info.height,
          rendition,
        };
      } finally {
        pipeline.destroy();
      }
    }, controller.signal);
  } catch {
    fail();
  } finally {
    controller.abort();
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
module.exports = { imagePreview };
