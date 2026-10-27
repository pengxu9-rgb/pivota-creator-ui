"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCommerceRequest, validateCommerceResponse } = require("../src/lib/pokemon/commerceContract.cjs");
const { validateProviderResult, MESSAGES } = require("../src/lib/pokemon/bnsPreview.cjs");
const { variantScope, chooseVariant, variantKeyFor } = require("../src/lib/pokemon/bnsVariantChoice.cjs");
const { commerceIntent } = require("../src/lib/pokemon/commerceChat.cjs");
const money = (subunit_amount = 2000, currency = "JPY") => ({ currency, subunit_amount });
const variants = () => [
  { variant_key: "sku-1", options: { condition: "PSA 10 seller claim" }, availability: "in_stock", price: money() },
  { variant_key: "sku-2", options: { condition: "Ungraded" }, availability: "out_of_stock", price: money(1000) },
];
const refusal = (code = "variant_selection_required", details = { variants: variants() }) => ({ schema: "pokemon.bns-refusal.v1",
  status: ["variant_selection_required", "variant_changed"].includes(code) ? "variant_selection_required" :
    ["variant_unavailable", "currency_unsupported", "invalid_request", "product_not_eligible"].includes(code) ? "refused" : "unavailable",
  code, reason_codes: [], retryable: code === "merchant_unreachable", message: MESSAGES[code], details });
const productUrl = "https://jp.mercari.com/item/m12345678901";
const handoff = () => ({ schema: "pokemon.agent-commerce.v1", mode: "on_demand_research", status: "variant_selection_required",
  product_url: productUrl, forwarder: { id: "buyship", label: "Buy & Ship" }, message: "Review exact provider variants",
  quote: null, purchasable: false, purchase_action: null, order_created: false, provider_result: refusal() });
const preview = () => {
  const h = handoff(); delete h.provider_result; h.status = "quote_ready_for_review";
  h.quote = { status: "quote_ready_for_review", purchasable: false, purchase_action: null, order_created: false,
    card_id: "ja:SV2A:173/165:holo", listing: { source: "mercari", native_id: "m12345678901", url: productUrl,
      title: "Pikachu 173/165", observed_at: "2026-10-22T01:00:00Z", ask: money(),
      grade: { company: "PSA", value: "10", certificate_verified: false }, identity_status: "unverified_candidate" },
    buyship: { reference_id: "server-held-reference", variant_key: "sku-1", canonical_url: productUrl,
      merchant_domain: "jp.mercari.com", resolve_price: money(2100), resolve_price_differs_from_observation: true,
      quote_id: "provider-quote", quoted_at: "2026-10-22T01:00:01Z", expires_at: "2026-10-22T01:15:01Z",
      destination: { country: "HK" }, currency: "HKD", unit_price: money(12000, "HKD"),
      components: { items: money(12000, "HKD"), bns_service_fee: money(1000, "HKD"), local_shipping: money(0, "HKD"), international_shipping: money(0, "HKD"), duties: money(0, "HKD") }, grand_total: money(13000, "HKD"),
      variant_options: { condition: "PSA 10 seller claim" }, resolved_availability: "in_stock" },
    evidence: { schema: "pokemon.bns-url-preview-evidence.v1", mode: "url_quote_preview", identity_status: "unverified_candidate",
      certificate_verified: false, authenticity_verified: false, selected_offer_sha256: "1".repeat(64), resolve_response_sha256: "2".repeat(64),
      quote_response_sha256: "3".repeat(64), binding_sha256: "4".repeat(64),
      binding_scope: "selected marketplace URL and BNS reference/variant only; catalog identity and seller grade remain unverified" } };
  return h;
};
test("URL preview accepts an unindexed listing while preserving provider amount and unverified identity", () => {
  const h = preview(); assert.equal(Object.hasOwn(h.quote, "unit_id"), false);
  assert.doesNotThrow(() => validateCommerceResponse("handoff", h));
  h.quote.listing.ask = null; h.quote.buyship.resolve_price_differs_from_observation = false;
  assert.doesNotThrow(() => validateCommerceResponse("handoff", h));
  h.quote.listing.ask = money(500, "USD");
  assert.doesNotThrow(() => validateCommerceResponse("handoff", h));
});
test("URL preview rejects another URL, invented verification, unsafe variants and disguised evidence mode", () => {
  for (const mutate of [q => { q.listing.url += "?other=1"; }, q => { q.buyship.canonical_url = "https://evil.invalid/item"; },
    q => { q.evidence.certificate_verified = true; }, q => { q.evidence.authenticity_verified = true; },
    q => { q.listing.grade.certificate_verified = true; }, q => { q.listing.identity_status = "verified"; },
    q => { q.evidence.mode = "indexed"; }, q => { q.evidence.binding_scope = "verified card identity"; },
    q => { q.unit_id = "invented-unit"; }, q => { q.purchasable = true; },
    q => { q.buyship.resolve_price_differs_from_observation = false; }, q => { q.buyship.resolved_availability = "out_of_stock"; },
    q => { q.buyship.variant_options = { condition: "<script>secret</script>" }; }, q => { q.evidence.secret = "token"; },
    q => { q.buyship.currency = "JPY"; }, q => { q.buyship.destination = { country: "SG" }; }, q => { delete q.buyship.components.duties; }]) {
    const h = preview(); mutate(h.quote); assert.throws(() => validateCommerceResponse("handoff", h), /invalid_commerce_response/);
  }
});
test("handoff requests carry only the selected server choice, never browser references or prices", () => {
  const request = { selection_id: "owner-selection", forwarder: "buyship", destination: { country: "HK" }, variant_key: "sku-1" };
  assert.doesNotThrow(() => validateCommerceRequest("handoff", request));
  for (const extra of [{ url: productUrl }, { reference_id: "invented" }, { price: money() }, { quantity: 2 }, { owner: "other" }])
    assert.throws(() => validateCommerceRequest("handoff", { ...request, ...extra }));
  for (const variant_key of ["", " ", "secret\nkey", "x".repeat(301), 123])
    assert.throws(() => validateCommerceRequest("handoff", { ...request, variant_key }));
});
test("detailed refusals accept only closed fields, static messages and normalized bounded choices", () => {
  assert.doesNotThrow(() => validateCommerceResponse("handoff", handoff()));
  const v = refusal("variant_unavailable"); v.reason_codes = ["OUT_OF_STOCK"];
  assert.doesNotThrow(() => validateProviderResult(v));
  const currency = refusal("currency_unsupported", { supported_currencies: ["HKD", "USD"] }); currency.reason_codes = ["CURRENCY_UNSUPPORTED"];
  assert.doesNotThrow(() => validateProviderResult(currency));
  const invalid = refusal("invalid_request", { field_errors: [{ field: "destination.state", message: "Choose a two-letter US state code." }] });
  assert.doesNotThrow(() => validateProviderResult(invalid));
  const retry = refusal("merchant_unreachable", {}); assert.equal(validateProviderResult(retry).retryable, true);
  for (const mutate of [r => { r.message = "secret from provider"; }, r => { r.details.secret = "token"; },
    r => { r.code = "undocumented_code"; }, r => { r.retryable = true; }, r => { r.status = "refused"; },
    r => { r.reason_codes = ["TOKEN=secret"]; }, r => { r.details.variants.push(r.details.variants[0]); },
    r => { r.details.variants[0].url = "https://evil.invalid"; }, r => { r.details.variants[0].options.foo = "url?token=secret"; },
    r => { r.details.variants[0].price.subunit_amount = -1; }, r => { r.details.variants[0].availability = "available"; }]) {
    const r = refusal(); mutate(r); assert.throws(() => validateProviderResult(r), /invalid_commerce_response/);
  }
  for (const mutate of [r => { r.code = [r.code]; }, r => { r.details.variants[0].price.currency = ["JPY"]; }]) {
    const r = refusal(); mutate(r); assert.throws(() => validateProviderResult(r));
  }
  const badField = structuredClone(invalid); badField.details.field_errors[0].field = ["destination.state"];
  assert.throws(() => validateProviderResult(badField));
  invalid.details.field_errors[0].message = "client-secret";
  assert.throws(() => validateProviderResult(invalid));
  const wrongStatus = handoff(); wrongStatus.status = "manual_handoff_required";
  assert.throws(() => validateCommerceResponse("handoff", wrongStatus));
  const h = handoff(); h.quote = preview().quote;
  assert.throws(() => validateCommerceResponse("handoff", h));
});
test("variant choices require an explicit in-stock choice and expire across context or displayed-value changes", () => {
  const r = refusal(), scope = variantScope("selection-a", "buyship", "US", "CA");
  assert.equal(variantKeyFor(r, null, scope), undefined);
  assert.equal(chooseVariant(r, 1, scope), null);
  assert.equal(chooseVariant(r, 99, scope), null);
  const choice = chooseVariant(r, 0, scope);
  assert.equal(variantKeyFor(r, choice, scope), "sku-1");
  for (const other of [variantScope("selection-b", "buyship", "US", "CA"), variantScope("selection-a", "other", "US", "CA"),
    variantScope("selection-a", "buyship", "US", "NY"), variantScope("selection-a", "buyship", "HK")])
    assert.equal(variantKeyFor(r, choice, other), undefined);
  for (const mutate of [v => { v.price.subunit_amount++; }, v => { v.options.condition = "PSA 9 seller claim"; }, v => { v.availability = "out_of_stock"; }]) {
    const changed = structuredClone(r); mutate(changed.details.variants[0]);
    assert.equal(variantKeyFor(changed, choice, scope), undefined);
  }
  assert.deepEqual(commerceIntent("choose variant 2"), { kind: "variant", index: 1 });
  assert.deepEqual(commerceIntent("choose offer 2"), { kind: "select", index: 1 });
});
