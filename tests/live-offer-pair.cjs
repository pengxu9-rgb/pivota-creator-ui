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
console.log(JSON.stringify({schema:"pot.live-offer-pair-acceptance.v1", result:"passed", evidence_mode:"synthetic_offline",
  offers:research.offers.length, blocked_scenarios:report.blocked, external_network_calls:0, orders_created:0, payments_made:0}));
