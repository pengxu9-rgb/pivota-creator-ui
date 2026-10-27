"use strict";
// This is delivery of an already imported primary, never a catalog resolver or
// a fallback cache. The source citation never becomes a storage destination.
const { createHash } = require("node:crypto");
const { cloudTestScope, TEST_BUCKET } = require("./cloudTestScope.cjs");
const { metadataToken } = require("./googleObjectBackend.cjs");
const { betaScope, IMAGE_BUCKET } = require("./betaScope.cjs");
const ORIGIN = "https://storage.googleapis.com";
const MAX_IMAGE = 8 * 1024 * 1024;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const sha = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validNamespace = (value) => typeof value === "string" && /^ui-[a-z0-9-]{3,50}$/.test(value);

function configuration(env = process.env, now = Date.now()) {
  const beta=betaScope(env);
  if(beta)return {driver:"gcs",scope:"beta",bucket:beta.imageBucket,namespace:beta.imageNamespace,startedAt:0,expiresAt:Infinity};
  const driver = env.POKEMON_CREATOR_IMAGE_DRIVER;
  if (driver === undefined || driver === "") fail("catalog_media_driver_not_configured");
  if (env.POKEMON_CREATOR_IMAGE_ENDPOINT) fail("invalid_catalog_image_store_configuration");
  if (driver === "remote") {
    if (env.POKEMON_CREATOR_IMAGE_BUCKET || env.POKEMON_CREATOR_IMAGE_NAMESPACE)
      fail("invalid_catalog_image_store_configuration");
    return { driver: "remote" };
  }
  if (driver !== "gcs" || !cloudTestScope(env, now) ||
    env.POKEMON_CREATOR_IMAGE_BUCKET !== TEST_BUCKET ||
    !validNamespace(env.POKEMON_CREATOR_IMAGE_NAMESPACE) ||
    !validNamespace(env.POKEMON_CREATOR_STATE_NAMESPACE))
    fail("invalid_catalog_image_store_configuration");
  return {
    driver: "gcs", bucket: TEST_BUCKET, namespace: env.POKEMON_CREATOR_IMAGE_NAMESPACE,
    startedAt: Date.parse(env.POKEMON_CREATOR_STATE_STARTED_AT),
    expiresAt: Date.parse(env.POKEMON_CREATOR_STATE_EXPIRES_AT),
  };
}

function validateConfiguration(config, now) {
  if(config?.scope==="beta"){
    if(config.driver!=="gcs"||config.bucket!==IMAGE_BUCKET||config.namespace!=="ui-20261013-full-ea57651c"||
      config.startedAt!==0||config.expiresAt!==Infinity||config.endpoint!==undefined)fail("invalid_catalog_image_store_configuration");
    return;
  }
  if (!config || config.driver !== "gcs" || config.bucket !== TEST_BUCKET ||
    !validNamespace(config.namespace) ||
    !Number.isFinite(config.startedAt) || !Number.isFinite(config.expiresAt) ||
    config.startedAt > now || config.expiresAt <= now || config.expiresAt <= config.startedAt ||
    config.expiresAt - config.startedAt > 86400000 || config.endpoint !== undefined)
    fail("invalid_catalog_image_store_configuration");
}

function objectKey(config, imageSha256) {
  if (!sha(imageSha256)) fail("invalid_catalog_media_evidence");
  return config.namespace + "/catalog-media/" + imageSha256 + ".raw";
}

async function bytes(response, limit, signal) {
  const reader = response.body?.getReader();
  if (!reader) fail("catalog_image_store_unavailable");
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > limit) {
        await reader.cancel();
        fail("catalog_image_store_limit");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function createCatalogImageStore({ config, fetchImpl = fetch,
  getAccessToken = metadataToken(fetchImpl), now = Date.now, ioMs = 8000 } = {}) {
  validateConfiguration(config, now());
  if (!Number.isInteger(ioMs) || ioMs < 1 || ioMs > 8000)
    fail("invalid_catalog_image_store_configuration");
  const fixed = Object.freeze({ ...config });
  const alive = () => {
    if (now() < fixed.startedAt || now() >= fixed.expiresAt) fail("catalog_image_store_expired");
  };
  return {
    async read(binding, signal) {
      alive();
      if (!binding || !sha(binding.image_sha256) || !sha(binding.identity_sha256) ||
        !/^(?:source-image-fact|number-reading|catalog-source-image):[a-f0-9]{64}$/.test(binding.event_id || "") ||
        typeof binding.card_id !== "string" || !/^(?:ja|en):[^\s:|]+:[^\s:|]+:[^\s:|]+$/.test(binding.card_id))
        fail("invalid_catalog_media_evidence");
      const key = objectKey(fixed, binding.image_sha256);
      const path = ORIGIN + "/storage/v1/b/" + fixed.bucket + "/o/" + encodeURIComponent(key);
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      if (signal?.aborted) abort();
      signal?.addEventListener("abort", abort, { once: true });
      const remaining = Math.min(ioMs, fixed.expiresAt - now());
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        controller.signal.throwIfAborted();
        const token = await getAccessToken(controller.signal);
        if (typeof token !== "string" || !token || token.length > 16384 || /\s/.test(token))
          fail("catalog_image_store_auth_unavailable");
        const get = async (url) => {
          alive();
          controller.signal.throwIfAborted();
          const response = await fetchImpl(url, {
            headers: { Authorization: "Bearer " + token }, redirect: "error", signal: controller.signal,
          });
          alive();
          controller.signal.throwIfAborted();
          if (response.status !== 200) {
            await response.body?.cancel();
            fail(response.status === 404 ? "catalog_image_store_object_missing" : "catalog_image_store_unavailable");
          }
          return response;
        };
        const response = await get(path + "?fields=name,bucket,generation,size");
        if (!(response.headers.get("content-type") || "").toLowerCase().startsWith("application/json"))
          fail("catalog_image_store_unavailable");
        const raw = await bytes(response, 4096, controller.signal);
        let metadata;
        try { metadata = JSON.parse(raw.toString("utf8")); }
        catch { fail("catalog_image_store_unavailable"); }
        if (!metadata || metadata.name !== key || metadata.bucket !== fixed.bucket ||
          !/^[1-9][0-9]{0,19}$/.test(metadata.generation || "") ||
          typeof metadata.generation !== "string" || typeof metadata.size !== "string" ||
          !/^[1-9][0-9]{0,7}$/.test(metadata.size) || Number(metadata.size) > MAX_IMAGE)
          fail("catalog_image_store_unavailable");
        const image = await get(path + "?alt=media&generation=" + metadata.generation);
        const body = await bytes(image, MAX_IMAGE, controller.signal);
        alive();
        if (body.length !== Number(metadata.size)) fail("catalog_image_store_changed");
        if (createHash("sha256").update(body).digest("hex") !== binding.image_sha256)
          fail("catalog_media_hash_changed");
        return { body, object_key: key, generation: metadata.generation, driver: "gcs" };
      } catch (error) {
        if (controller.signal.aborted) fail("catalog_image_store_timeout");
        if (/^(?:catalog_image_store_|catalog_media_hash_changed|invalid_catalog_media_evidence)/.test(error?.code || "")) throw error;
        fail("catalog_image_store_unavailable");
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

module.exports = { configuration, createCatalogImageStore, objectKey, ORIGIN, MAX_IMAGE };
