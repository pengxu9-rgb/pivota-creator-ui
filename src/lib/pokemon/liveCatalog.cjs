"use strict";
const catalogMedia = require("./catalogMedia.cjs");
const family = require("./sourceFamilyAdvisory.cjs");
const { CATALOG_CALL_MS } = require("./requestBudgets.cjs");
const { validWarnings } = require("./mediaWarnings.cjs");
const catalogImageStore = require("./catalogImageStore.cjs");
const { createHash } = require("node:crypto");
const { catalogFetch } = require("./catalogReadAdmission.cjs");
const { validateMarket } = require("./marketData.cjs");
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
function configuration(env = process.env) {
  const beta=require("./betaScope.cjs").betaScope(env);
  if(beta)return {baseUrl:env.POKEMON_CREATOR_CATALOG_URL,audience:env.POKEMON_CREATOR_CATALOG_AUDIENCE};
  let url;
  try {
    url = new URL(env.POKEMON_CREATOR_CATALOG_URL);
  } catch {
    fail("live_catalog_not_configured");
  }
  if (
    url.protocol !== "https:" ||
    !/^(?:[a-z0-9-]+---)?pokemon-commerce-index-[a-z0-9-]+\.(?:a\.run\.app|us-west1\.run\.app)$/.test(
      url.hostname,
    ) ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    fail("invalid_live_catalog_configuration");
  return {
    baseUrl: url.origin,
    audience: url.origin.replace(/^https:\/\/[a-z0-9-]+---/, "https://"),
  };
}
function identityToken(fetchImpl = fetch) {
  return async (audience, { signal } = {}) => {
    const url =
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?format=full&audience=" +
      encodeURIComponent(audience);
    const response = await fetchImpl(url, {
      headers: { "Metadata-Flavor": "Google" },
      redirect: "error",
      signal,
    });
    activeResponse(response, signal);
    if (response.status !== 200) fail("catalog_auth_unavailable");
    const raw = await bytes(response, 16384, signal),
      token = raw.toString("utf8");
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      fail("catalog_auth_unavailable");
    return token;
  };
}
function cancelBody(response) {
  // Cleanup cannot keep a cancelled request pending or surface provider errors.
  void Promise.resolve().then(() => response.body?.cancel()).catch(() => {});
}
function activeResponse(response, signal) {
  try { family.operationGuard(signal); }
  catch (error) { cancelBody(response); throw error; }
  return response;
}
async function bytes(response, limit, signal) {
  activeResponse(response, signal);
  const reader = response.body?.getReader();
  if (!reader) fail("invalid_live_catalog_response");
  const cancel = () => { void Promise.resolve().then(() => reader.cancel()).catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      family.operationGuard(signal);
      const part = await reader.read();
      family.operationGuard(signal);
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        fail("live_response_too_large");
      }
      chunks.push(part.value);
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
function validId(id) {
  return (
    typeof id === "string" &&
    id.length <= 240 &&
    /^(ja|en):[^\s:|]+:[^\s:|]+:[^\s:|]+$/.test(id)
  );
}
function validateTitleReview(value) {
  if (!Object.prototype.hasOwnProperty.call(value, "title_review")) return;
  const review = value.title_review;
  const fields = ["status", "event_id", "field", "original_title", "corrected_title", "source_ref", "source_binding_state", "required_evidence", "explanation", "physical_copy_verified", "automatic_offer_join_allowed"];
  const text = (v, limit) => typeof v === "string" && v.trim().length > 0 && v.length <= limit;
  if (!review || typeof review !== "object" || Array.isArray(review) ||
    Object.keys(review).length !== fields.length || fields.some((key) => !Object.prototype.hasOwnProperty.call(review, key)) ||
    !["source_title_review_pending", "stale_source_title_warning"].includes(review.status) ||
    typeof review.event_id !== "string" || !/^catalog-field-quality-warning:[a-f0-9]{64}$/.test(review.event_id) ||
    review.field !== "name" || !text(review.original_title, 2048) || review.corrected_title !== null ||
    !text(review.source_ref, 4096) || !text(review.explanation, 4096) ||
    !Array.isArray(review.required_evidence) || review.required_evidence.length === 0 || review.required_evidence.length > 32 ||
    review.required_evidence.some((item) => !text(item, 2048)) ||
    review.physical_copy_verified !== false || review.automatic_offer_join_allowed !== false ||
    (review.status === "source_title_review_pending"
      ? review.source_binding_state !== "current_exact_identity" || review.source_ref !== value.provenance || review.original_title !== value.name
      : review.source_binding_state !== "source_identity_changed_hold_retained"))
    fail("invalid_live_catalog_response");
}
function card(value, id) {
  if (
    !value ||
    !validId(value.card_id) ||
    (id && value.card_id !== id) ||
    !["ja", "en"].includes(value.language) ||
    !value.card_id.startsWith(value.language + ":") ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.set_code !== "string" ||
    typeof value.collector_number !== "string" ||
    typeof value.variant !== "string" ||
    value.card_id !==
      [
        value.language,
        value.set_code,
        value.collector_number,
        value.variant,
      ].join(":") ||
    typeof value.provenance !== "string"
  )
    fail("invalid_live_catalog_response");
  validateTitleReview(value);
  catalogMedia.sourceIdentityCard(value, snapshotDigest);
  catalogMedia.availability(value.media_availability, value);
  return value;
}
const snapshotDigest = (value) => createHash("sha256")
  .update(JSON.stringify(Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))))
  .digest("hex");
function requireCompletePrimaryContract(detail) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail))
    fail("invalid_live_catalog_response");
  const present = (key) => Object.prototype.hasOwnProperty.call(detail, key);
  if (!present("primary_image") || !present("catalog_source_image") ||
    !detail.primary_image || detail.catalog_source_image === undefined)
    fail("invalid_live_catalog_response");
}
function validateDetail(d, id) {
  card(d?.card, id);
  requireCompletePrimaryContract(d);
  if (
    !d.number_context ||
    d.number_context.card_id !== id ||
    !Array.isArray(d.discovery_facets) ||
    d.discovery_facets.some(
      (f) =>
        !f || typeof f.facet_type !== "string" || typeof f.value !== "string",
    ) ||
    !(
      d.set === null ||
      (d.set &&
        d.set.language === d.card.language &&
        d.set.set_code === d.card.set_code &&
        (d.set.name === null || typeof d.set.name === "string") &&
        (d.set.release_date === null || typeof d.set.release_date === "string"))
    )
  )
    fail("invalid_live_catalog_response");
  const facts = d.source_image_facts,
    number = d.number_context.observed_printed_number;
  for (const [r, schema, prefix] of [
    [facts, "pokemon.source-image-fact-context.v1", "source-image-fact:"],
    [number, "pokemon.number-reading-context.v1", "number-reading:"],
  ]) {
    if (r === null || r === undefined) continue;
    if (
      r.schema !== schema ||
      typeof r.current_endpoint !== "boolean" ||
      typeof r.event_id !== "string" ||
      !r.event_id.startsWith(prefix) ||
      typeof r.source_ref !== "string" ||
      !/^https:\/\//.test(r.source_ref) ||
      !/^[a-f0-9]{64}$/.test(r.image_sha256 || "") ||
      typeof r.scope !== "string"
    )
      fail("invalid_live_catalog_response");
  }
  if (
    facts &&
    !validWarnings(facts.warnings)
  )
    fail("invalid_live_catalog_response");
  if (
    number &&
    (![
      "catalog_text_observed",
      "catalog_denominator_not_observed",
      "different_text_observed",
      "reading_hold",
      "stale_endpoint",
    ].includes(number.status) ||
      (number.current_endpoint
        ? number.status === "stale_endpoint"
        : number.status !== "stale_endpoint") ||
      number.visible_text_agreement !==
        (number.current_endpoint && number.status !== "reading_hold") ||
      (number.printed_denominator_observed && !number.visible_text_agreement) ||
      typeof number.visible_text_agreement !== "boolean" ||
      (number.source_coordinate_conflict !== undefined &&
        typeof number.source_coordinate_conflict !== "boolean") ||
      typeof number.printed_denominator_observed !== "boolean")
  )
    fail("invalid_live_catalog_response");
  const availability = catalogMedia.availability(
    d.card.media_availability,
    d.card,
  );
  catalogMedia.matchDetail(availability, facts, number);
  const reference = catalogMedia.sourceReference(d.catalog_source_image, d.card, snapshotDigest);
  const primary = catalogMedia.primaryImage(d.primary_image, d.card, facts, number, reference, snapshotDigest);
  const r = primary.record;
  const source_scan_hold = primary.status === "held";
  const matchingNumber =
    number &&
    r &&
    number.current_endpoint &&
    number.source_ref === r.source_ref &&
    number.image_sha256 === r.image_sha256;
  const media_evidence =
    r &&
    !source_scan_hold &&
    (!availability ||
      !["identity_hold", "held_source_scan_evidence"].includes(
        availability.status,
      ))
      ? {
          basis: primary.basis,
          current_endpoint: r.current_endpoint,
          source_ref: r.source_ref,
          image_sha256: r.image_sha256,
          event_id: r.event_id,
          identity_sha256: primary.identity_sha256,
          binding_scope: primary.scope,
          scope: r.scope,
          warnings: primary.basis === "catalog_source_reference" ? reference.warnings : facts ? r.warnings : [],
          number_status: matchingNumber ? number.status : null,
          printed_denominator_observed: matchingNumber
            ? number.printed_denominator_observed
            : null,
          ...(primary.basis === "catalog_source_reference" && r.schema === "pokemon.catalog-source-image-context.v2"
            ? { source_animation: r.source_animation, gif_qualification_sha256: r.gif_qualification_sha256 } : {}),
        }
      : null;
  return { ...d, media_evidence, source_scan_hold };
}
function evidence(detail) {
  requireCompletePrimaryContract(detail);
  // Distinct evidence types are sources, never a rescue path for stale/invalid facts.
  const facts = detail.source_image_facts;
  if (
    detail.card?.variant_dimension_hold ||
    ["identity_hold", "held_source_scan_evidence"].includes(
      detail.card?.media_availability?.status,
    )
  )
    fail("catalog_media_on_hold");
  const reading = detail.number_context?.observed_printed_number;
  const reference = catalogMedia.sourceReference(detail.catalog_source_image, detail.card, snapshotDigest);
  const primary = catalogMedia.primaryImage(detail.primary_image, detail.card, facts, reading, reference, snapshotDigest);
  if (primary.status === "held") fail("catalog_media_on_hold");
  if (primary.status === "missing") fail("catalog_media_not_recorded");
  if (primary.status === "stale") fail("catalog_media_stale");
  const record = primary.record;
  if (!record) fail("catalog_media_not_recorded");
  if (record.current_endpoint !== true) fail("catalog_media_stale");
  if (
    !/^[a-f0-9]{64}$/.test(record.image_sha256 || "") ||
    typeof record.event_id !== "string"
  )
    fail("invalid_catalog_media_evidence");
  if (
    primary.basis === "number_reading" &&
    (record.visible_text_agreement !== true ||
      record.status === "reading_hold" ||
      record.source_coordinate_conflict === true)
  )
    fail("catalog_media_on_hold");
  return {
    card_id: detail.card.card_id,
    event_id: record.event_id,
    identity_sha256: primary.identity_sha256,
    basis: primary.basis,
    binding_scope: primary.scope,
    source_ref: record.source_ref,
    image_sha256: record.image_sha256,
    scope: record.scope,
    ...(primary.basis === "catalog_source_reference" && record.schema === "pokemon.catalog-source-image-context.v2"
      ? { source_animation: record.source_animation, gif_qualification_sha256: record.gif_qualification_sha256 } : {}),
  };
}
function mediaURL(raw, page = false) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail("catalog_media_source_denied");
  }
  if (
    /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw) ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.search ||
    u.hash
  )
    fail("catalog_media_source_denied");
  const allowed = page
    ? u.hostname === "www.pokemon-card.com" &&
      /^\/card-search\/details\.php\/card\/\d+$/.test(u.pathname)
    : (u.hostname === "assets.tcgdex.net" &&
        /^\/(?:en|ja)\/[A-Za-z0-9_.\/-]+\/high\.(?:webp|png|jpg)$/.test(
          u.pathname,
        )) ||
      (u.hostname === "images.pokemontcg.io" &&
        /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+_hires\.png$/.test(u.pathname)) ||
      (u.hostname === "www.30th.pokemon-card.com" &&
        /^\/images\/[a-z0-9]+\/cards\/[a-zA-Z0-9_.-]+\.png$/.test(
          u.pathname,
        )) ||
      (u.hostname === "www.pokemon-card.com" &&
        /^\/assets\/images\/card_images\/(?:large|legend)\/[a-zA-Z0-9_/-]+\.jpg$/.test(
          u.pathname,
        ));
  if (!allowed) fail("catalog_media_source_denied");
  return u.href;
}
function pageImage(html, source) {
  const urls = new Set();
  for (const m of html.matchAll(
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
  )) {
    const u = new URL(m[1].replace(/&amp;/g, "&"), source);
    if (
      u.hostname === "www.pokemon-card.com" &&
      /^\/assets\/images\/card_images\/(?:large|legend)\//.test(u.pathname)
    )
      urls.add(mediaURL(u.href));
  }
  if (urls.size !== 1) fail("catalog_media_page_ambiguous");
  return [...urls][0];
}
function imageType(body) {
  if (
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (body[0] === 255 && body[1] === 216 && body[2] === 255)
    return "image/jpeg";
  if (
    body.toString("ascii", 0, 4) === "RIFF" &&
    body.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  fail("invalid_catalog_image");
}
function imageTypeForBinding(body, binding) {
  const gif = require("./sourceGifPreview.cjs");
  if (gif.isGif(body) || binding?.source_animation !== undefined) {
    if (!gif.isGif(body) || binding.basis !== "catalog_source_reference" || binding.binding_scope !== "source_card_reference") fail("invalid_catalog_image");
    const d = require("./sourceGifContract.cjs").validateAnimation(binding.source_animation, binding.image_sha256);
    if (body.length !== d.original_bytes || !/^[a-f0-9]{64}$/.test(binding.gif_qualification_sha256 || "")) fail("invalid_catalog_image");
    return "image/gif";
  }
  return imageType(body);
}
function createLiveCatalog({
  baseUrl,
  getIdToken = identityToken(),
  fetchImpl = fetch,
  timeoutMs = CATALOG_CALL_MS,
  imageDelivery = null,
  imageStore,
} = {}) {
  const config = configuration({ POKEMON_CREATOR_CATALOG_URL: baseUrl });
  if (imageDelivery && !["remote", "gcs"].includes(imageDelivery.driver))
    fail("invalid_catalog_image_store_configuration");
  const storedImages = imageDelivery?.driver === "gcs"
    ? imageStore || catalogImageStore.createCatalogImageStore({ config: imageDelivery, fetchImpl })
    : null;
  async function bounded(run, signal, deadline) {
    const controller = new AbortController();
    if (signal?.aborted) fail("catalog_cancelled");
    const remaining = deadline === undefined ? timeoutMs : Math.min(timeoutMs, deadline - Date.now());
    if (!(remaining > 0)) fail("catalog_timeout");
    let failure, rejectStopped;
    const stopped = new Promise((_, reject) => { rejectStopped = reject; });
    const stop = (code) => {
      if (failure) return;
      failure = Object.assign(new Error(code), { code });
      controller.abort(failure);
      rejectStopped(failure);
    };
    const abort = () => stop("catalog_cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    const end = Date.now() + remaining;
    const timer = setTimeout(() => stop("catalog_timeout"), remaining);
    if (signal?.aborted) abort();
    try {
      // A dependency may ignore its signal. The caller still receives a bounded
      // outcome; guards prevent late authentication from dispatching new reads.
      const work = Promise.resolve().then(() => family.withFamilyOperation(
        () => { family.operationGuard(controller.signal); return run(controller.signal); },
        { signal: controller.signal, deadline: end },
      ));
      return await Promise.race([work, stopped]);
    } catch (error) {
      if (failure) throw failure;
      if (error?.code) throw error;
      fail("live_catalog_unavailable");
    } finally {
      controller.abort();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  async function read(route, signal, budget, market = false, oneShot = false) {
    family.operationGuard(signal);
    const token = await getIdToken(config.audience, { signal });
    family.operationGuard(signal);
    if (typeof token !== "string" || !token) fail("catalog_auth_unavailable");
    let response;
    for (let attempt = 0; attempt < (oneShot ? 1 : 2); attempt++) {
      family.operationGuard(signal);
      response = await catalogFetch(
        config.baseUrl,
        config.baseUrl + route,
        {
          headers: { Authorization: "Bearer " + token },
          redirect: "error",
          signal,
          cache: "no-store",
        },
        fetchImpl,
      );
      activeResponse(response, signal);
      if (
        response.status !== 503 ||
        response.headers.get("x-collector-error") !== "catalog_busy"
      )
        break;
      if (
        !(response.headers.get("content-type") || "").startsWith(
          "application/json",
        )
      ) {
        await response.body?.cancel();
        fail("invalid_live_catalog_response");
      }
      let busy;
      try {
        busy = JSON.parse((await bytes(response, 4096, signal)).toString("utf8"));
      } catch {
        fail("invalid_live_catalog_response");
      }
      if (busy?.error !== "catalog_busy" || Object.keys(busy).length !== 1)
        fail("invalid_live_catalog_response");
      if (attempt || oneShot) fail("catalog_busy");
      const retry = response.headers.get("retry-after");
      const delay =
        retry !== null && /^\d+$/.test(retry)
          ? Math.max(200, Math.min(1000, Number(retry) * 1000))
          : 200;
      await pause(delay, signal);
    }
    if (!response.ok) {
      if (market && response.status === 400) {
        if (
          !(response.headers.get("content-type") || "").startsWith(
            "application/json",
          )
        )
          fail("invalid_live_catalog_response");
        let rejected;
        try {
          rejected = JSON.parse((await bytes(response, 4096, signal)).toString("utf8"));
        } catch {
          fail("invalid_live_catalog_response");
        }
        if (
          !rejected ||
          Object.keys(rejected).length !== 1 ||
          typeof rejected.error !== "string"
        )
          fail("invalid_live_catalog_response");
        fail(
          rejected.error === "catalog source is not approved for display"
            ? "catalog_market_display_denied"
            : rejected.error === "unknown card"
              ? "catalog_record_unavailable"
              : "catalog_market_unavailable",
        );
      }
      await response.body?.cancel();
      fail(
        response.status === 400
          ? "catalog_record_unavailable"
          : response.status === 401 || response.status === 403
            ? "catalog_access_denied"
            : "live_catalog_unavailable",
      );
    }
    if (
      !(response.headers.get("content-type") || "").startsWith(
        "application/json",
      )
    )
      fail("invalid_live_catalog_response");
    const raw = await bytes(response, 8 * 1024 * 1024, signal);
    family.chargeBytes(raw.length);
    if (budget) {
      budget.bytes += raw.length;
      if (budget.bytes > 8 * 1024 * 1024) fail("live_response_too_large");
    }
    let value;
    try {
      value = JSON.parse(raw.toString("utf8"));
    } catch {
      fail("invalid_live_catalog_response");
    }
    return value;
  }
  async function detail(id, signal, budget) {
    if (!validId(id)) fail("invalid_catalog_request");
    const d = await read(
      "/catalog-card?card_id=" + encodeURIComponent(id),
      signal,
      budget,
    );
    return validateDetail(d, id);
  }
  const admitFamily = (value, signal, budget) => family.validateFamilyPresentation(value, { signal, readStatus: () => read("/catalog-status", signal, budget, false, true) });
  return {
    async validateFamilyPresentation(value, signal, deadline) {
      return bounded((s) => admitFamily(value, s), signal, deadline);
    },
    async market(payload, signal) {
      if (
        !payload ||
        Object.keys(payload).some(
          (k) => !["card_id", "destination"].includes(k),
        ) ||
        !validId(payload.card_id) ||
        (payload.destination != null &&
          !["HK", "US"].includes(payload.destination))
      )
        fail("invalid_catalog_request");
      return bounded(async (s) => {
        const query = "?card_id=" + encodeURIComponent(payload.card_id),
          budget = { bytes: 0 };
        const units = await read("/units" + query, s, budget, true);
        const offers = await read(
          "/offers" +
            query +
            (payload.destination ? "&destination=" + payload.destination : ""),
          s,
          budget,
          true,
        );
        return {
          ...validateMarket(
            payload.card_id,
            payload.destination || null,
            units,
            offers,
          ),
          backend: config.baseUrl,
          data_source: "live_catalog",
        };
      }, signal);
    },
    async status(signal) {
      return bounded(async (s) => {
        const d = await family.readStatusOnce(() => read("/catalog-status", s, undefined, false, true), s);
        const admission = Object.prototype.hasOwnProperty.call(d, "source_family_admission") ? family.validateAdmissionStatus(d.source_family_admission) : null;
        if (
          !Number.isInteger(d?.printings) ||
          d.printings < 0 ||
          !Array.isArray(d.set_coverage) ||
          d.set_coverage.some(
            (r) =>
              !["ja", "en"].includes(r.language) ||
              !Number.isInteger(r.printings) ||
              r.printings < 0,
          )
        )
          fail("invalid_live_catalog_response");
        const languages = { ja: 0, en: 0 };
        for (const r of d.set_coverage) languages[r.language] += r.printings;
        if (languages.ja + languages.en !== d.printings)
          fail("invalid_live_catalog_response");
        let sourceImageEvidence = null;
        if (d.source_image_facts !== undefined) {
          const f = d.source_image_facts;
          if (
            !f ||
            Array.isArray(f) ||
            [
              "source_image_fact_subjects",
              "source_image_fact_events",
              "stale_source_image_facts",
            ].some((k) => !Number.isSafeInteger(f[k]) || f[k] < 0) ||
            f.source_image_fact_subjects > d.printings ||
            f.source_image_fact_events < f.source_image_fact_subjects ||
            f.stale_source_image_facts > f.source_image_fact_subjects
          )
            fail("invalid_live_catalog_response");
          sourceImageEvidence = {
            records: f.source_image_fact_subjects,
            current_records:
              f.source_image_fact_subjects - f.stale_source_image_facts,
            events: f.source_image_fact_events,
          };
        }
        return {
          records: d.printings,
          languages,
          ...(admission ? { catalog_revision: admission.catalog_revision, source_family_admission: admission } : {}),
          source_image_evidence: sourceImageEvidence,
          source_scan_coverage: catalogMedia.coverage(
            d.source_scan_coverage,
            d.printings,
          ),
          catalog_source_image_coverage: catalogMedia.referenceCoverage(
            d.catalog_source_image_coverage,
            d.printings,
          ),
          backend: config.baseUrl,
          data_source: "live_catalog",
        };
      }, signal);
    },
    async search(payload, signal) {
      if (
        !payload ||
        Object.keys(payload).some(
          (k) => !["q", "offset", "with_source_scans"].includes(k),
        ) ||
        (payload.with_source_scans !== undefined &&
          typeof payload.with_source_scans !== "boolean") ||
        typeof payload.q !== "string" ||
        !payload.q.trim() ||
        payload.q.length > 200 ||
        !Number.isInteger(payload.offset) ||
        payload.offset < 0 ||
        payload.offset > 100000
      )
        fail("invalid_catalog_request");
      return bounded(async (s) => {
        const value = await read(
          "/catalog-search?q=" +
            encodeURIComponent(payload.q.trim().normalize("NFKC")) +
            "&limit=12&offset=" +
            payload.offset +
            (payload.with_source_scans !== undefined
              ? "&with_source_scans=" + payload.with_source_scans
              : ""),
          s,
        );
        if (
          !Array.isArray(value?.cards) ||
          value.cards.length > 12 ||
          !Number.isInteger(value.total) ||
          value.total < 0 ||
          value.offset !== payload.offset ||
          value.query !== payload.q.trim().normalize("NFKC")
        )
          fail("invalid_live_catalog_response");
        value.cards.forEach((c) => card(c));
        await admitFamily(value, s);
        if (
          value.with_source_scans !== undefined ||
          payload.with_source_scans !== undefined
        ) {
          if (
            typeof value.with_source_scans !== "boolean" ||
            value.with_source_scans !== (payload.with_source_scans ?? false) ||
            !Number.isSafeInteger(value.total_before_source_scan_filter) ||
            value.total_before_source_scan_filter < value.total ||
            (!value.with_source_scans &&
              value.total_before_source_scan_filter !== value.total) ||
            value.cards.some((c) => !c.media_availability) ||
            (value.with_source_scans &&
              value.cards.some(
                (c) =>
                  c.media_availability?.with_source_scans_eligible !== true,
              ))
          )
            fail("invalid_live_catalog_response");
        }
        if (
          new Set(value.cards.map((c) => c.card_id)).size !== value.cards.length
        )
          fail("invalid_live_catalog_response");
        return {
          ...value,
          backend: config.baseUrl,
          data_source: "live_catalog",
        };
      }, signal);
    },
    async card(id, signal) {
      return bounded(
        async (s) => {
          const value = await detail(id, s);
          await admitFamily(value, s);
          return { ...value, backend: config.baseUrl, data_source: "live_catalog" };
        },
        signal,
      );
    },
    async cards(ids, signal) {
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 100 ||
        ids.some((id) => !validId(id)) ||
        new Set(ids).size !== ids.length
      )
        fail("invalid_catalog_request");
      return bounded(async (s) => {
        const cards = new Array(ids.length);
        const budget = { bytes: 0 };
        let next = 0;
        // Current exact reads only. Limit upstream concurrency; never cache or
        // replace a failed record with historical metadata or another source.
        await Promise.all(
          Array.from({ length: Math.min(4, ids.length) }, async () => {
            while (next < ids.length) {
              s.throwIfAborted();
              const index = next++;
              cards[index] = await detail(ids[index], s, budget);
            }
          }),
        );
        await admitFamily(cards, s, budget);
        return {
          schema: "pokemon.live-card-details.v1",
          cards,
          backend: config.baseUrl,
          data_source: "live_catalog",
        };
      }, signal);
    },
    async media(id, signal, expected) {
      return bounded(async (s) => {
        const d = await detail(id, s);
        await admitFamily(d, s);
        const binding = evidence(d);
        if (
          expected &&
          (expected.event_id !== binding.event_id ||
            expected.image_sha256 !== binding.image_sha256 ||
            (expected.identity_sha256 !== undefined && expected.identity_sha256 !== binding.identity_sha256))
        )
          fail("catalog_media_changed");
        if (!imageDelivery) fail("catalog_media_driver_not_configured");
        if (imageDelivery.driver === "gcs") {
          // This is the configured primary delivery origin. No citation fetch,
          // local file, previous response or alternate rendition can rescue it.
          const stored = await storedImages.read(binding, s);
          const type = imageTypeForBinding(stored.body, binding);
          if (createHash("sha256").update(stored.body).digest("hex") !== binding.image_sha256)
            fail("catalog_media_hash_changed");
          return { body: stored.body, type, binding, delivery_driver: "gcs" };
        }
        let image;
        const ref = new URL(binding.source_ref);
        if (
          ref.hostname === "www.pokemon-card.com" &&
          ref.pathname.startsWith("/card-search/")
        ) {
          const source = mediaURL(binding.source_ref, true),
            page = await fetchImpl(source, { redirect: "error", signal: s });
          if (
            !page.ok ||
            !(page.headers.get("content-type") || "").startsWith("text/html")
          )
            fail("catalog_media_unavailable");
          image = pageImage(
            (await bytes(page, 2 * 1024 * 1024)).toString("utf8"),
            source,
          );
        } else if (binding.source_animation !== undefined) {
          // This is an explicitly selected GIF reference in remote-driver mode.
          // The GCS branch above never contacts a source after an object failure.
          const u = new URL(binding.source_ref);
          if (u.protocol !== "https:" || u.host !== "www.pokemon-card.com" || u.username || u.password || u.search || u.hash || u.href !== binding.source_ref ||
            !/^\/assets\/images\/card_images\/large\/[A-Za-z0-9_.-]+\/[0-9]{6}_[A-Za-z0-9_.-]+\.gif$/.test(u.pathname)) fail("catalog_media_source_denied");
          image = u.href;
        } else image = mediaURL(binding.source_ref);
        const response = await fetchImpl(image, {
          redirect: "error",
          signal: s,
        });
        if (!response.ok) {
          await response.body?.cancel();
          fail("catalog_media_unavailable");
        }
        const body = await bytes(response, 8 * 1024 * 1024),
          type = imageTypeForBinding(body, binding);
        if (
          createHash("sha256").update(body).digest("hex") !==
          binding.image_sha256
        )
          fail("catalog_media_hash_changed");
        return { body, type, binding, delivery_driver: "remote" };
      }, signal);
    },
  };
}
let singleton;
function liveCatalog() {
  const { syntheticEnabled, createSyntheticCatalog } = require("./syntheticDemo.cjs");
  if (syntheticEnabled()) return createSyntheticCatalog();
  return singleton || (singleton = createLiveCatalog({ ...configuration(), imageDelivery: catalogImageStore.configuration() }));
}
module.exports = {
  configuration,
  identityToken,
  createLiveCatalog,
  liveCatalog,
  evidence,
  mediaURL,
  pageImage,
  validId,
  imageType,
  imageTypeForBinding,
};
