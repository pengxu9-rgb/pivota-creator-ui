"use strict";
const { validateProviderResult, validateVariants, money } = require("./bnsPreview.cjs");
const { validateSeller } = require("./sellerEvidence.cjs");
const {validateIdentityEvidence,validateListingPhotos,validateCoverage}=require("./listingEvidence.cjs");
const {validatePurchaseLink,validateMarketplaceConnections}=require("./purchaseLink.cjs");
const {validateSourceReadiness}=require("./sourceReadiness.cjs");
const fail = (code = "invalid_commerce_response") => { throw Object.assign(new Error(code), { code }); };
const text = (v, max = 2000) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const https = (v) => { try { const u = new URL(v); return text(v, 4096) && u.protocol === "https:" && !u.username && !u.password; } catch { return false; } };
const quoteMoney = (m) => !!m && typeof m === "object" && !Array.isArray(m) && Object.keys(m).length === 2 && Object.hasOwn(m, "currency") && Object.hasOwn(m, "subunit_amount") && typeof m.currency === "string" && /^[A-Z]{3}$/.test(m.currency) && Number.isSafeInteger(m.subunit_amount) && m.subunit_amount >= 0;
const timestamp = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
function validateResearchPlatform(p) {
  if (!p || !text(p.source, 100) || !text(p.status, 100) || typeof p.message !== "string" || p.message.length > 2000 ||
    p.reason_code !== undefined && (!text(p.reason_code, 100) || !/^[a-z0-9_]+$/.test(p.reason_code))) fail();
  if (p.diagnostics === undefined) return;
  const d = p.diagnostics, counts = ["requests", "allowed_requests", "blocked_requests", "failed_requests", "responses", "pinned_hosts", "listing_links", "blocked_api_requests"];
  const fields = [...counts, "schema", "stage", "elapsed_ms", "search_status", "search_api_status"];
  if (!d || typeof d !== "object" || Object.keys(d).length !== fields.length || Object.keys(d).some(k => !fields.includes(k)) ||
    d.schema !== "pokemon.public-browser-diagnostics.v1" || !["validation", "dns", "launch", "navigation", "hydration", "inspection", "complete"].includes(d.stage) ||
    !Number.isInteger(d.elapsed_ms) || d.elapsed_ms < 0 || d.elapsed_ms > 22000 ||
    counts.some(k => !Number.isInteger(d[k]) || d[k] < 0 || d[k] > 129) || d.allowed_requests > 64 || d.pinned_hosts > 6 || d.listing_links > 25 ||
    ["search_status", "search_api_status"].some(k => d[k] !== null && (!Number.isInteger(d[k]) || d[k] < 100 || d[k] > 599))) fail();
}
function validateOffer(o) {
  if (!o || !text(o.offer_id, 300) || !text(o.source, 100) || !text(o.native_id, 128) || !text(o.title) || !https(o.url) ||
    !(o.price_minor === null || Number.isSafeInteger(o.price_minor) && o.price_minor >= 0) ||
    !(o.currency === null || typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency)) ||
    !timestamp(o.observed_at) || !(o.fresh_until == null || timestamp(o.fresh_until)) ||
    !["available", "unknown", "sold_out", "unavailable", "withdrawn"].includes(o.availability) ||
    !o.grade || o.grade.certificate_verified !== false ||
    !(o.grade.company === null || text(o.grade.company, 80)) ||
    !(o.grade.value === null || text(o.grade.value, 80)) || !["unresolved", "unverified_candidate", "exact_match", "identity_conflict"].includes(o.identity_status) || !text(o.scope, 100)) fail();
  if(o.synthetic!==undefined&&typeof o.synthetic!=="boolean")fail();
  validatePurchaseLink(o);
  const g=o.grade;
  if (o.scope !== "listing" && o.seller != null) fail();
  validateSeller(o.seller, o.source, o.observed_at);
  validateIdentityEvidence(o);
  validateListingPhotos(o);
  if (g.kind !== undefined && (!["slab","raw","unknown"].includes(g.kind) ||
      g.kind === "slab" && (!g.company || !g.value) || g.kind === "raw" && (g.company !== null || g.value !== null))) fail();
  if (g.evidence !== undefined && !text(g.evidence,100) ||
      g.review_required !== undefined && typeof g.review_required !== "boolean" ||
      g.review_reasons !== undefined && (!Array.isArray(g.review_reasons) || g.review_reasons.length>32 || g.review_reasons.some(r=>!text(r,100)||!/^[a-z0-9_]+$/.test(r))) ||
      g.special_label !== undefined && g.special_label !== null && !text(g.special_label,100)) fail();
  for (const field of ["seller_condition","source_status_text","evidence_ref","certificate_number_claim"]) {
    if (o[field] !== undefined && o[field] !== null && !text(o[field],2048)) fail();
  }
  if (o.authenticity_verified !== undefined && o.authenticity_verified !== false ||
      o.physical_authenticity_verified !== undefined && o.physical_authenticity_verified !== false) fail();
  if (o.certificate !== undefined && (!o.certificate || Object.keys(o.certificate).sort().join(",")!=="number_claim,physical_authenticity,status" ||
      !["not_checked","number_missing"].includes(o.certificate.status) || o.certificate.physical_authenticity!=="not_verified" ||
      !(o.certificate.number_claim===null || text(o.certificate.number_claim,64)) ||
      (o.certificate.status==="number_missing") !== (o.certificate.number_claim===null) ||
      o.certificate_number_claim!==undefined && o.certificate_number_claim!==o.certificate.number_claim)) fail();
  return o;
}
function validateCommerceResponse(operation, value) {
  if (!value || value.schema !== "pokemon.agent-commerce.v1" ||
      !["synthetic_fixture", "on_demand_research"].includes(value.mode)) fail();
  if (operation === "research") {
    if (!text(value.card_id, 240) || !timestamp(value.checked_at) || !Array.isArray(value.offers) || value.offers.length > 100 ||
      !Array.isArray(value.platforms) || value.platforms.length > 32 || !Array.isArray(value.forwarders) || value.forwarders.length > 32 ||
      value.forwarders.some((p) => !text(p.id, 100) || !text(p.label, 160) || typeof p.quote_available !== "boolean" || typeof p.manual_handoff_available !== "boolean")) fail();
    value.platforms.forEach(validateResearchPlatform);
    validateMarketplaceConnections(value.marketplace_connections);
    value.offers.forEach(validateOffer);
    validateSourceReadiness(value.source_readiness,value.offers,value.mode);
    if(value.mode!=="synthetic_fixture"&&value.offers.some(o=>o.synthetic===true))fail();
    validateCoverage(value);
    if (new Set(value.offers.map((o) => o.offer_id)).size !== value.offers.length) fail();
  } else if (operation === "select") {
    if (!text(value.selection_id, 300) || !timestamp(value.expires_at)) fail();
    validateOffer(value.offer);
    if(value.mode!=="synthetic_fixture"&&value.offer.synthetic===true)fail();
  } else if (operation === "psa") {
    validatePsaVerification(value.verification);
  } else if (operation === "handoff") {
    if (!["manual_handoff_required", "variant_selection_required", "quote_ready_for_review"].includes(value.status) ||
      (value.status === "quote_ready_for_review") !== (value.quote !== null) || !https(value.product_url) || !value.forwarder || !text(value.forwarder.label, 160) ||
      value.order_created !== false || value.purchasable !== false || value.purchase_action !== null ||
      typeof value.message !== "string") fail();
    if (value.provider_result !== undefined) {
      validateProviderResult(value.provider_result);
      if (value.quote !== null || value.forwarder.id !== "buyship" || value.status !==
        (value.provider_result.status === "variant_selection_required" ? "variant_selection_required" : "manual_handoff_required")) fail();
    }
    // A quote is informational here; this frontend has no order/payment route.
    if (value.quote !== null) {
      const q = value.quote, b = q?.buyship;
      if (q?.status !== "quote_ready_for_review" || !b || !text(b.quote_id, 300) ||
        !timestamp(b.expires_at) || !timestamp(b.quoted_at) || Date.parse(b.expires_at) <= Date.parse(b.quoted_at) || !b.components || typeof b.components !== "object" ||
        !b.grand_total || !Number.isSafeInteger(b.grand_total.subunit_amount) || b.grand_total.subunit_amount < 0 ||
        typeof b.grand_total.currency !== "string" || !/^[A-Z]{3}$/.test(b.grand_total.currency) || Object.keys(b.components).length > 32 ||
        !Object.keys(b.components).length || Object.values(b.components).some((m) => !m || m.currency !== b.grand_total.currency ||
          !Number.isSafeInteger(m.subunit_amount) || m.subunit_amount < 0) ||
        Object.values(b.components).reduce((total, m) => total + BigInt(m.subunit_amount), 0n) !== BigInt(b.grand_total.subunit_amount)) fail();
      if (value.mode === "on_demand_research" || q.evidence?.mode === "url_quote_preview" || q.evidence?.schema === "pokemon.bns-url-preview-evidence.v1" || q.listing?.grade || b.resolved_availability !== undefined) validateUrlQuote(q, value.product_url);
    }
  } else fail();
  return value;
}
function validateUrlQuote(q, productUrl) {
  const e = q.evidence, listing = q.listing, b = q.buyship;
  const fields = ["schema", "mode", "identity_status", "certificate_verified", "authenticity_verified", "selected_offer_sha256",
    "resolve_response_sha256", "quote_response_sha256", "binding_sha256", "binding_scope"];
  if (!e || Object.keys(e).length !== fields.length || Object.keys(e).some(k => !fields.includes(k)) ||
    e.schema !== "pokemon.bns-url-preview-evidence.v1" || e.mode !== "url_quote_preview" || e.identity_status !== "unverified_candidate" ||
    e.certificate_verified !== false || e.authenticity_verified !== false ||
    ["selected_offer_sha256", "resolve_response_sha256", "quote_response_sha256", "binding_sha256"].some(k => typeof e[k] !== "string" || !/^[a-f0-9]{64}$/.test(e[k])) ||
    e.binding_scope !== "selected marketplace URL and BNS reference/variant only; catalog identity and seller grade remain unverified" ||
    q.purchasable !== false || q.purchase_action !== null || q.order_created !== false || Object.hasOwn(q, "unit_id") || !text(q.card_id, 256) ||
    !listing || listing.url !== productUrl || !text(listing.source, 100) || !text(listing.native_id, 300) || !text(listing.title) ||
    !timestamp(listing.observed_at) || listing.identity_status !== "unverified_candidate" ||
    !(listing.ask === null || quoteMoney(listing.ask)) || !listing.grade || listing.grade.certificate_verified !== false ||
    !(listing.grade.company === null || text(listing.grade.company, 80)) || !(listing.grade.value === null || text(listing.grade.value, 80)) ||
    b.canonical_url !== productUrl || !text(b.reference_id, 300) || typeof b.merchant_domain !== "string" || !/^[A-Za-z0-9.-]{1,253}$/.test(b.merchant_domain) ||
    b.resolved_availability !== "in_stock" || !money(b.resolve_price) || !quoteMoney(b.unit_price) || b.unit_price.currency !== b.grand_total.currency ||
    b.currency !== b.grand_total.currency || !b.destination || !["HK", "US"].includes(b.destination.country) ||
    b.destination.country === "US" && (typeof b.destination.state !== "string" || !/^[A-Z]{2}$/.test(b.destination.state)) ||
    ["items", "local_shipping", "international_shipping", "duties", "bns_service_fee"].some(k => !Object.hasOwn(b.components, k)) || Object.keys(b.components).length !== 5 ||
    b.components.items.currency !== b.unit_price.currency || b.components.items.subunit_amount !== b.unit_price.subunit_amount ||
    typeof b.resolve_price_differs_from_observation !== "boolean" ||
    b.resolve_price_differs_from_observation !== !!(listing.ask && listing.ask.currency === b.resolve_price.currency && listing.ask.subunit_amount !== b.resolve_price.subunit_amount)) fail();
  validateVariants([{ variant_key: b.variant_key, options: b.variant_options, availability: b.resolved_availability, price: b.resolve_price }]);
}
function validateCommerceRequest(operation, p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) fail("invalid_commerce_request");
  const fields = { research: ["card_id", "query", "platforms", "product_urls"],
    select: ["card_id", "offer_id", "expected_observed_at", "expected_price_minor", "currency"],
    handoff: ["selection_id", "forwarder", "destination", "variant_key"], psa: ["certificate_number", "offer_id"] }[operation];
  if (!fields || Object.keys(p).some((key) => !fields.includes(key))) fail("invalid_commerce_request");
  if (operation === "research") {
    if (!text(p.card_id, 240) || !text(p.query, 240) ||
      (p.platforms !== undefined && (!Array.isArray(p.platforms) || p.platforms.length > 10 || p.platforms.some((v) => !text(v, 100)))) ||
      (p.product_urls !== undefined && (!Array.isArray(p.product_urls) || p.product_urls.length > 5 || p.product_urls.some((v) => !https(v))))) fail("invalid_commerce_request");
  } else if (operation === "select") {
    if (!text(p.card_id, 240) || !text(p.offer_id, 300) || !timestamp(p.expected_observed_at) ||
      !(p.expected_price_minor === null || Number.isSafeInteger(p.expected_price_minor) && p.expected_price_minor >= 0) ||
      !(p.currency === null || typeof p.currency === "string" && /^[A-Z]{3}$/.test(p.currency))) fail("invalid_commerce_request");
  } else if (operation === "psa") {
    if (typeof p.certificate_number !== "string" || !/^[0-9]{7,12}$/.test(p.certificate_number) ||
      (p.offer_id !== undefined && !text(p.offer_id, 300))) fail("invalid_commerce_request");
  } else if (operation === "handoff") {
    if (!text(p.selection_id, 300) || !text(p.forwarder, 100) ||
      !p.destination || !/^[A-Z]{2}$/.test(p.destination.country || "") ||
      p.variant_key !== undefined && (!text(p.variant_key, 300) || p.variant_key !== p.variant_key.trim() || /[\x00-\x1f\x7f]/.test(p.variant_key))) fail("invalid_commerce_request");
  } else fail("invalid_commerce_request");
  return p;
}
function validatePsaVerification(v) {
  const nullableText = (value, max = 300) => value === null || text(value, max);
  const fields = ["certificate_number", "grade", "card_number", "subject", "year", "brand", "variety"];
  if (!v || v.schema !== "pokemon.psa-cert.v1" || v.provider !== "psa" ||
    !["found", "not_found", "invalid", "unavailable", "mismatch"].includes(v.status) ||
    !(v.certificate_number === null || typeof v.certificate_number === "string" && /^[0-9]{7,12}$/.test(v.certificate_number)) ||
    !timestamp(v.checked_at) || !(v.expires_at === null || timestamp(v.expires_at)) ||
    typeof v.cached !== "boolean" || typeof v.record_found !== "boolean" ||
    v.certificate_verified !== false || v.authenticity_verified !== false || v.physical_authenticity_verified !== false ||
    !nullableText(v.reason, 300) || !text(v.message, 2000) || !v.comparison ||
    !["not_compared", "matched", "mismatch", "inconclusive"].includes(v.comparison.status) ||
    ["matched_fields", "mismatched_fields", "missing_fields"].some((key) => !Array.isArray(v.comparison[key]) ||
      v.comparison[key].length > fields.length || new Set(v.comparison[key]).size !== v.comparison[key].length ||
      v.comparison[key].some((name) => !fields.includes(name)))) fail();
  if (v.record !== null) {
    if (!v.record_found || v.record.certificate_number !== v.certificate_number ||
      ["subject", "card_number", "year", "brand", "variety", "grade", "grade_description", "item_status"].some((key) => !nullableText(v.record[key], 1000))) fail();
  } else if (v.record_found) fail();
  if (["found", "mismatch"].includes(v.status) && !v.record_found ||
    ["not_found", "invalid", "unavailable"].includes(v.status) && v.record_found ||
    v.status === "mismatch" && v.comparison.status !== "mismatch" ||
    v.comparison.status === "matched" && (!v.record_found || !v.comparison.matched_fields.length || v.comparison.mismatched_fields.length || v.comparison.missing_fields.length)) fail();
  return v;
}
function commerceConfiguration(env = process.env) {
  let u; try { u = new URL(env.POKEMON_COMMERCE_URL); } catch { fail("commerce_not_configured"); }
  const { cloudTestScope } = require("./cloudTestScope.cjs");
  const managedLoopback = env.POKEMON_COMMERCE_MANAGED_SIDECAR === "true" && cloudTestScope(env) && u.href === "http://127.0.0.1:8766/";
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/" ||
    !(u.protocol === "https:" || managedLoopback || !env.K_SERVICE && u.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(u.hostname)) ||
    !text(env.POKEMON_COMMERCE_TOKEN, 1024) || env.POKEMON_COMMERCE_TOKEN.length < 24 ||
    /[^\x21-\x7e]/.test(env.POKEMON_COMMERCE_TOKEN)) fail("commerce_not_configured");
  return { url: u.origin, token: env.POKEMON_COMMERCE_TOKEN };
}
function validateCommerceMode(mode, env = process.env) {
  const { syntheticEnabled } = require("./syntheticDemo.cjs");
  const { cloudTestScope } = require("./cloudTestScope.cjs");
  const localFixture = syntheticEnabled(env);
  const requested = env.POKEMON_COMMERCE_FIXTURE === "true";
  const privateFixture = requested && env.POKEMON_COMMERCE_MANAGED_SIDECAR === "true" && cloudTestScope(env) &&
    env.POKEMON_COMMERCE_BNS_ENABLED !== "true" && env.POKEMON_COMMERCE_BNS_URL_PREVIEW !== "true" && env.POKEMON_COMMERCE_PSA_ENABLED !== "true";
  if (requested && !localFixture && !privateFixture) fail("commerce_not_configured");
  if ((localFixture || privateFixture) !== (mode === "synthetic_fixture")) fail("commerce_mode_mismatch");
  return mode;
}
function publicReadOperationAllowed(operation,env=process.env){
  return !Object.hasOwn(env,"POKEMON_COMMERCE_PUBLIC_LISTING_URLS")||operation==="research";
}
module.exports = { validateCommerceRequest, validateCommerceResponse, commerceConfiguration, validateOffer, validatePsaVerification, validateCommerceMode, publicReadOperationAllowed };
