"use strict";
// Cross-language acceptance uses the pinned backend's synthetic rehearsal. It
// never receives credentials, invokes a live provider or creates an order.
const assert = require("node:assert/strict");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const {validateCommerceResponse, validateCommerceRequest} = require("../src/lib/pokemon/commerceContract.cjs");
const {selectionMatches, handoffMatches, handoffView} = require("../src/lib/pokemon/bnsChatState.cjs");
const {variantScope, chooseVariant, variantKeyFor} = require("../src/lib/pokemon/bnsVariantChoice.cjs");
const {validateSourceReadiness, photosAllowed} = require("../src/lib/pokemon/sourceReadiness.cjs");

const backend = process.argv[2];
assert.ok(backend && path.isAbsolute(backend), "Provide the absolute reviewed backend checkout");
const result = spawnSync("python3", ["-B", "-m", "tests.live_offer_rehearsal"], {
  cwd: backend, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(result.error);
assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.schema, "pokemon.live-offer-rehearsal.v1");
assert.equal(report.evidence_mode, "synthetic_offline");
assert.equal(report.external_network_calls, 0);
const now = Date.parse(report.now);
assert.ok(Number.isFinite(now));
for (const [operation, value] of [["research", report.research], ["select", report.selection],
  ["handoff", report.variant_required], ["handoff", report.handoff]]) {
  validateCommerceResponse(operation, value);
  assert.equal(value.purchasable, false);
  assert.equal(value.order_created, false);
  assert.equal(value.purchase_action, null);
}

const research = report.research, selection = report.selection, handoff = report.handoff;
validateSourceReadiness(research.source_readiness, research.offers, research.mode);
assert.ok(research.offers.length >= 2, "Exercise several sellers on one platform");
assert.equal(new Set(research.offers.map(offer => offer.source)).size, 1);
assert.ok(new Set(research.offers.map(offer => offer.native_id)).size >= 2);
assert.ok(new Set(research.offers.map(offer => offer.seller?.id).filter(Boolean)).size >= 2,
  "Multiple listings do not by themselves establish multiple sellers");
for (const offer of research.offers) {
  assert.equal(offer.grade.certificate_verified, false);
  if (offer.listing_photos?.length) assert.ok(photosAllowed(research, offer.source));
}
const offer = research.offers.find(row => row.offer_id === selection.offer.offer_id);
assert.ok(offer);
assert.ok(selectionMatches(selection, offer, now), "Backend selection must retain the displayed listing evidence");

assert.equal(report.variant_required.provider_result.status, "variant_selection_required");
assert.equal(handoffView(report.variant_required, now, selection.expires_at).kind, "variant");
assert.ok(handoff.quote);
const destination = handoff.quote.buyship.destination;
const scope = variantScope(selection.selection_id, handoff.forwarder.id, destination.country, destination.state);
assert.equal(variantKeyFor(report.variant_required.provider_result, null, scope), undefined,
  "A provider option must never be selected automatically");
const index = report.variant_required.provider_result.details.variants.findIndex(row => row.variant_key === handoff.quote.buyship.variant_key);
assert.ok(index >= 0);
const choice = chooseVariant(report.variant_required.provider_result, index, scope);
const key = variantKeyFor(report.variant_required.provider_result, choice, scope);
assert.equal(key, handoff.quote.buyship.variant_key);
assert.equal(variantKeyFor(report.variant_required.provider_result, choice, scope + "changed"), undefined);
validateCommerceRequest("handoff", {selection_id: selection.selection_id, forwarder: handoff.forwarder.id,
  destination, variant_key: key});
assert.ok(handoffMatches(handoff, offer, handoff.quote.card_id, handoff.forwarder.id,
  destination, key, selection.expires_at, now), "Quote must bind the selected exact listing, option and destination");
assert.equal(handoffView(handoff, now, selection.expires_at).kind, "quote");
assert.equal(handoff.quote.evidence.authenticity_verified, false);
assert.equal(handoff.quote.evidence.certificate_verified, false);
assert.ok(Array.isArray(report.blocked) && report.blocked.length >= 3);
assert.ok(report.blocked.every(row => typeof row.scenario === "string" && typeof row.code === "string" && row.code));
assert.ok(report.provider_paths.length >= 3);
assert.ok(report.provider_paths.every(endpoint => ["/v1/oauth/token", "/v1/products/resolve", "/v1/quotes"].includes(endpoint)));
assert.throws(() => validateCommerceRequest("order", {quote_id: handoff.quote.buyship.quote_id}));
// The adversarial cases must stay refused through the actual frontend, not
// merely return a locally asserted Python exception.
const adversarial = spawnSync("python3", ["-B", "-c",
  "import json; from tests.test_bns_printing_identity import printing_report; print(json.dumps(printing_report()))"], {
  cwd: backend, encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(adversarial.error);
assert.equal(adversarial.status, 0, adversarial.stderr);
const printing = JSON.parse(adversarial.stdout);
assert.equal(printing.evidence_mode, "synthetic_offline");
assert.equal(printing.external_network_calls, 0);
assert.ok(printing.cases.length >= 4 && printing.cases.length <= 120);
for (const original of ["Edition", "Language", "Finish", "product_name"])
  assert.ok(printing.cases.some(row => row.case === original));
for (const row of printing.cases) {
  assert.ok(["selected_options", "resolve_name", "quote_name"].includes(row.stage));
  assert.equal(row.expected, "product_mismatch");
  assert.equal(row.expected_provider_paths, row.stage === "quote_name" ? 3 : 2);
  validateCommerceResponse("research", row.research);
  validateCommerceResponse("select", row.selection);
  validateCommerceResponse("handoff", row.choices);
  validateCommerceResponse("handoff", row.handoff);
  assert.equal(row.handoff.quote, null);
  assert.equal(row.handoff.quote_status, "product_mismatch");
  assert.equal(handoffView(row.handoff, Date.parse(row.research.checked_at), row.selection.expires_at).kind, "refused");
  assert.equal(row.handoff.purchasable, false);
  assert.equal(row.handoff.order_created, false);
  assert.equal(row.handoff.purchase_action, null);
  assert.equal(row.provider_paths.length, row.expected_provider_paths);
  assert.deepEqual(row.provider_paths, row.stage === "quote_name" ?
    ["/v1/oauth/token", "/v1/products/resolve", "/v1/quotes"] : ["/v1/oauth/token", "/v1/products/resolve"]);
  assert.deepEqual(row.external_attempts, []);
}
const compatibleResult = spawnSync("python3", ["-B", "-c",
  "import json; from tests.test_bns_printing_identity import compatible_raw_report; print(json.dumps(compatible_raw_report()))"], {
  cwd: backend, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(compatibleResult.error);
assert.equal(compatibleResult.status, 0, compatibleResult.stderr);
const compatible = JSON.parse(compatibleResult.stdout);
assert.equal(compatible.evidence_mode, "synthetic_offline");
assert.equal(compatible.external_network_calls, 0);
assert.ok(compatible.cases.length >= 3);
for (const row of compatible.cases) {
  assert.equal(row.expected, "quote_ready_for_review");
  assert.equal(row.expected_provider_paths, 3);
  validateCommerceResponse("research", row.research);
  validateCommerceResponse("select", row.selection);
  validateCommerceResponse("handoff", row.choices);
  validateCommerceResponse("handoff", row.handoff);
  assert.equal(row.selection.offer.grade.kind, "raw");
  assert.equal(row.handoff.status, "quote_ready_for_review");
  const priceQuote = row.handoff.quote;
  assert.ok(priceQuote);
  assert.equal(priceQuote.listing.grade.certificate_verified, false);
  assert.equal(priceQuote.evidence.authenticity_verified, false);
  assert.equal(handoffView(row.handoff, Date.parse(priceQuote.buyship.quoted_at), row.selection.expires_at).kind, "quote");
  assert.equal(row.handoff.purchasable, false);
  assert.equal(row.handoff.order_created, false);
  assert.equal(row.handoff.purchase_action, null);
  assert.deepEqual(row.provider_paths, ["/v1/oauth/token", "/v1/products/resolve", "/v1/quotes"]);
  assert.deepEqual(row.external_attempts, []);
}
const controlsResult = spawnSync("python3", ["-B", "-c",
  "import json; from tests.test_bns_printing_identity import printing_controls_report; print(json.dumps(printing_controls_report()))"], {
  cwd: backend, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(controlsResult.error);
assert.equal(controlsResult.status, 0, controlsResult.stderr);
const controls = JSON.parse(controlsResult.stdout);
assert.equal(controls.evidence_mode, "synthetic_offline");
assert.equal(controls.external_network_calls, 0);
assert.equal(controls.cases.length, 4);
for (const row of controls.cases) {
  validateCommerceResponse("research", row.research);
  validateCommerceResponse("select", row.selection);
  validateCommerceResponse("handoff", row.choices);
  validateCommerceResponse("handoff", row.handoff);
  assert.equal(row.handoff.status, "quote_ready_for_review");
  assert.ok(row.handoff.quote);
  assert.equal(row.handoff.quote.evidence.authenticity_verified, false);
  assert.equal(row.handoff.quote.evidence.certificate_verified, false);
  assert.equal(handoffView(row.handoff, Date.parse(row.handoff.quote.buyship.quoted_at), row.selection.expires_at).kind, "quote");
  assert.equal(row.handoff.purchasable, false);
  assert.equal(row.handoff.order_created, false);
  assert.equal(row.handoff.purchase_action, null);
  assert.deepEqual(row.provider_paths, ["/v1/oauth/token", "/v1/products/resolve", "/v1/quotes"]);
  assert.deepEqual(row.external_attempts, []);
}
const rawResult = spawnSync("python3", ["-B", "-c",
  "import json; from tests.test_adversary_source_fixes import raw_card_report; print(json.dumps(raw_card_report()))"], {
  cwd: backend, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(rawResult.error);
assert.equal(rawResult.status, 0, rawResult.stderr);
const raw = JSON.parse(rawResult.stdout);
validateCommerceResponse("research", raw.research);
validateCommerceResponse("select", raw.selection);
assert.equal(raw.selection.offer.grade.kind, "raw");
assert.equal(raw.selection.offer.grade.company, null);
assert.equal(raw.selection.offer.grade.value, null);
assert.equal(raw.selection.offer.grade.certificate_verified, false);
assert.equal(raw.selection.offer.seller_condition, "Near mint or better");
const rawOffer = raw.research.offers.find(row => row.offer_id === raw.selection.offer.offer_id);
assert.ok(rawOffer && selectionMatches(raw.selection, rawOffer, Date.parse(raw.research.checked_at)));
assert.equal(raw.selection.purchasable, false);
assert.equal(raw.selection.order_created, false);
assert.equal(raw.selection.purchase_action, null);
const expiredResult = spawnSync("python3", ["-B", "-c",
  "import json; from tests.test_adversary_source_fixes import expired_quote_report; print(json.dumps(expired_quote_report()))"], {
  cwd: backend, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
});
assert.ifError(expiredResult.error);
assert.equal(expiredResult.status, 0, expiredResult.stderr);
const expired = JSON.parse(expiredResult.stdout);
validateCommerceResponse("research", expired.research);
validateCommerceResponse("select", expired.selection);
validateCommerceResponse("handoff", expired.handoff);
assert.ok(Date.parse(expired.before_publish) < Date.parse(expired.quote_expires_at));
assert.ok(Date.parse(expired.final_checked_at) >= Date.parse(expired.quote_expires_at));
assert.ok(expired.native_wait_elapsed >= 2.5, "Exercise an actual delayed readiness lock");
assert.equal(expired.handoff.quote, null);
assert.equal(expired.handoff.quote_status, "quote_expired");
assert.equal(expired.handoff.provider_result.code, "quote_expired");
assert.notEqual(handoffView(expired.handoff, Date.parse(expired.final_checked_at), expired.selection.expires_at).kind, "quote");
assert.equal(expired.handoff.purchasable, false);
assert.equal(expired.handoff.order_created, false);
assert.equal(expired.handoff.purchase_action, null);
assert.deepEqual(expired.external_attempts, []);
console.log(JSON.stringify({schema:"pot.live-offer-pair-acceptance.v1", result:"passed", evidence_mode:"synthetic_offline",
  offers:research.offers.length, blocked_scenarios:report.blocked, printing_contradictions_blocked:printing.cases.length,
  compatible_raw_quotes:compatible.cases.length, compatible_printing_quotes:controls.cases.length,
  native_raw_card_selected:true, late_quote_expiry_refused:true,
  external_network_calls:0, orders_created:0, payments_made:0}));
