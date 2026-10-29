"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const {offerEvidence, groupComparableOffers} = require("../src/lib/pokemon/offerEvidence.cjs");
const clock = Date.parse("2026-10-24T12:00:00Z"), cardId = "ja:S8B:279/184:holo";
const slab = (company = "PSA", value = "10", overrides = {}) => ({company, value, kind: "slab", certificate_verified: false,
  evidence: "seller_title", review_required: false, review_reasons: [], special_label: null, ...overrides});
const raw = () => slab(null, null, {kind: "raw"});
const unknown = () => slab(null, null, {kind: "unknown"});
function offer(id, overrides = {}) {
  return {offer_id: id, source: "mercari", native_id: id, title: "Seller card listing", url: `https://jp.mercari.com/item/${id}`,
    price_minor: 10000, currency: "JPY", availability: "available", observed_at: "2026-10-24T11:55:00Z", fresh_until: "2026-10-24T12:10:00Z",
    scope: "listing", identity_status: "unverified_candidate", grade: slab(), seller_condition: null, source_status_text: "Available",
    certificate: {number_claim: null, status: "number_missing", physical_authenticity: "not_verified"}, ...overrides};
}
const {exactListing}=require("./listingEvidenceSamples.cjs");
const exact = (id, overrides = {}) => ({...exactListing(offer(id, {listing_quantity: 1, ...overrides}),cardId),...overrides});

test("explicit raw and unknown grade remain distinct, without inventing raw condition", () => {
  const observations = [offer("raw", {grade: raw()}), offer("unknown", {grade: unknown()}), offer("legacy-unknown", {grade: {company: null, value: null, certificate_verified: false}})];
  const groups = groupComparableOffers(observations, cardId, clock);
  assert.equal(groups.length, 2);
  assert.match(groups[0].label, /Raw \/ ungraded seller claim/);
  assert.match(groups[1].label, /Grade unknown/);
  assert.deepEqual(groups[1].offers.map(o => o.offer_id), ["unknown", "legacy-unknown"]);
  assert.equal(offerEvidence(observations[0], clock).sellerCondition, null);
  assert.ok(groups.every(g => !g.priceComparable));
});

test("PSA9, PSA10, BGS10 and special BGS labels never share a comparison", () => {
  const observations = [offer("psa9", {grade: slab("PSA", "9")}), offer("psa10"), offer("bgs10", {grade: slab("BGS", "10")}),
    offer("black", {grade: slab("BGS", "10", {special_label: "black_label"})}), offer("gold", {grade: slab("BGS", "10", {special_label: "gold_label"})})];
  const groups = groupComparableOffers(observations, cardId, clock);
  assert.equal(groups.length, 5);
  assert.match(groups.find(g => g.offers[0].offer_id === "black").label, /BGS 10 · black label/);
  assert.deepEqual(groups.flatMap(g => g.offers).map(o => o.offer_id), observations.map(o => o.offer_id));
});

test("certificate not checked is not a seller-grade conflict or physical authentication", () => {
  const o = offer("cert", {certificate: {number_claim: "12345678", status: "not_checked", physical_authenticity: "not_verified"}});
  const evidence = offerEvidence(o, clock);
  assert.equal(evidence.canSelect, true);
  assert.equal(evidence.reviewRequired, false);
  assert.deepEqual(evidence.reviewReasons, []);
  assert.equal(evidence.certificateStatus, "not_checked");
  assert.match(evidence.certificateLabel, /not checked/);
  assert.match(evidence.physicalAuthenticityLabel, /not verified/);
  assert.equal(evidence.priceComparable, false);
  const malformed = offerEvidence({...o, grade: {...o.grade, certificate_verified: true}, certificate: {...o.certificate, status: "verified", physical_authenticity: "verified"}}, clock);
  assert.equal(malformed.certificateStatus, "not_checked");
  assert.match(malformed.physicalAuthenticityLabel, /not verified/);
});

test("missing certificate number does not discard the explicit seller grade claim", () => {
  const evidence = offerEvidence(offer("number-missing"), clock);
  assert.match(evidence.gradeLabel, /PSA 10/);
  assert.equal(evidence.certificateStatus, "number_missing");
  assert.equal(evidence.reviewRequired, false);
  assert.equal(evidence.canSelect, true);
});

test("source evidence codes and legacy certificate claims remain available to the display layer", () => {
  const evidence = offerEvidence(offer("legacy-cert", {grade: slab("PSA", "10", {evidence: "snkr_used_condition"}),
    certificate: undefined, certificate_number_claim: "12345678", source_status_text: null, listing_status: "public_listing"}), clock);
  assert.equal(evidence.gradeEvidence, "snkr_used_condition");
  assert.equal(evidence.certificateNumberClaim, "12345678");
  assert.equal(evidence.certificateStatus, "not_checked");
  assert.equal(evidence.sourceStatusText, "public_listing");
  assert.equal(evidence.availability, "available");
});

test("sold, unavailable, withdrawn and unknown stock remain visible and cannot be selected", () => {
  const observations = ["sold_out", "unavailable", "withdrawn", "unknown", "available"].map(status => offer(status, {availability: status}));
  const groups = groupComparableOffers(observations, cardId, clock);
  assert.equal(groups.length, 5);
  assert.equal(groups.reduce((n, g) => n + g.offers.length, 0), 5);
  for (const o of observations) assert.equal(offerEvidence(o, clock).canSelect, o.availability === "available");
  assert.match(groups.find(g => g.offers[0].availability === "sold_out").label, /Sold out/);
  assert.match(groups.find(g => g.offers[0].availability === "unknown").label, /Stock unknown/);
});

test("review flags and reasons block selection without hiding sold grade claims", () => {
  const o = offer("conflict", {availability: "sold_out", grade: slab("PSA", "10", {review_required: true, review_reasons: ["title_condition_conflict"]}), seller_condition: "PSA 9", source_status_text: "SOLD"});
  const evidence = offerEvidence(o, clock), group = groupComparableOffers([o], cardId, clock)[0];
  assert.equal(evidence.canSelect, false);
  assert.equal(evidence.reviewRequired, true);
  assert.equal(evidence.sellerCondition, "PSA 9");
  assert.equal(evidence.sourceStatusText, "SOLD");
  assert.match(group.label, /PSA 10.*Sold out.*Needs review/);
  assert.equal(group.offers[0], o);
  assert.equal(offerEvidence(offer("reason-only", {grade: slab("PSA", "10", {review_reasons: ["conflicting_claim"]})}), clock).canSelect, false);
});

test("expired, unreported and future observations cannot masquerade as fresh availability", () => {
  for (const overrides of [{fresh_until: "2026-10-24T12:00:00Z"}, {fresh_until: null}, {fresh_until: "invalid"}, {observed_at: "2026-10-24T12:01:00Z"}, {observed_at: null}]) {
    const evidence = offerEvidence(offer("stale", overrides), clock);
    assert.equal(evidence.canSelect, false);
    assert.notEqual(evidence.freshness, "current");
  }
  assert.equal(offerEvidence(offer("valid"), clock).freshness, "current");
  assert.equal(offerEvidence(offer("bad-clock"), NaN).canSelect, false);
});

test("candidate informational selection is distinct from exact printing and price comparability", () => {
  assert.equal(offerEvidence(offer("candidate"), clock).canSelect, true);
  assert.equal(offerEvidence(offer("candidate"), clock).priceComparable, false);
  for (const status of ["unresolved", "unknown", "verified", ""]) assert.equal(offerEvidence(offer(status, {identity_status: status}), clock).canSelect, false);
  const observations = [offer("unresolved", {identity_status: "unresolved"}), offer("candidate"), exact("exact")];
  const groups = groupComparableOffers(observations, cardId, clock);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(g => g.priceComparable), [false, false, true]);
  assert.match(groups[0].comparisonNote, /no best-price recommendation/);
  assert.equal(groupComparableOffers([exact("wrong")], "ja:OTHER:1:holo", clock)[0].priceComparable, false);
  assert.match(groupComparableOffers([exact("wrong")], "ja:OTHER:1:holo", clock)[0].comparisonNote, /different catalog record/);
});

test("currency, lot quantity and raw condition partition even exact catalog observations", () => {
  const observations = [exact("JPY"), exact("USD", {currency: "USD"}), exact("lot2", {listing_quantity: 2}), exact("lotUnknown", {listing_quantity: null}),
    exact("rawNM", {grade: raw(), seller_condition: "Near mint"}), exact("rawDamaged", {grade: raw(), seller_condition: "Damaged"}), exact("rawUnknown", {grade: raw()})];
  const groups = groupComparableOffers(observations, cardId, clock);
  assert.equal(groups.length, observations.length);
  assert.equal(groups.find(g => g.offers[0].offer_id === "lotUnknown").priceComparable, false);
  assert.equal(groups.find(g => g.offers[0].offer_id === "rawUnknown").priceComparable, false);
  assert.match(groups.find(g => g.offers[0].offer_id === "lotUnknown").comparisonNote, /do not assume one card/);
  assert.equal(offerEvidence(offer("stock-count", {quantity: 1, stock_quantity: 3}), clock).lotQuantity, null);
  assert.equal(offerEvidence(offer("lot-alias", {lot_quantity: 2}), clock).lotQuantity, 2);
  assert.equal(offerEvidence(offer("lot-conflict", {listing_quantity: 1, lot_quantity: 2}), clock).canSelect, false);
});

test("only compatible exact groups sort by ask; other observations retain their source order", () => {
  const high = exact("high", {price_minor: 20000}), low = exact("low", {price_minor: 10000}), equal = exact("equal", {price_minor: 10000});
  const observations = [high, low, equal, offer("candidate-high", {price_minor: 50000}), offer("candidate-low", {price_minor: 1000}), exact("USD", {price_minor: 1, currency: "USD"})];
  const original = observations.slice(), groups = groupComparableOffers(observations, cardId, clock);
  assert.deepEqual(groups[0].offers.map(o => o.offer_id), ["low", "equal", "high"]);
  assert.deepEqual(groups[1].offers.map(o => o.offer_id), ["candidate-high", "candidate-low"]);
  assert.deepEqual(groups[2].offers.map(o => o.offer_id), ["USD"]);
  assert.deepEqual(observations, original);
  assert.equal(groups.reduce((n, g) => n + g.offers.length, 0), observations.length);
});

test("summary, missing price and missing currency never become selectable listing asks", () => {
  for (const overrides of [{scope: "product_summary"}, {price_minor: null}, {price_minor: -1}, {price_minor: 1.1}, {currency: null}]) {
    const evidence = offerEvidence(offer("not-selectable", overrides), clock);
    assert.equal(evidence.canSelect, false);
    assert.equal(evidence.priceComparable, false);
  }
  assert.equal(offerEvidence(offer("zero", {price_minor: 0}), clock).canSelect, true);
  assert.match(groupComparableOffers([offer("summary", {scope: "product_summary"})], cardId, clock)[0].comparisonNote, /not an exact seller listing/);
  assert.deepEqual(groupComparableOffers(null, cardId, clock), []);
});

test("incomplete or contradictory grade shapes require review rather than silently changing category", () => {
  for (const grade of [slab("PSA", null), slab(null, "10"), rawWithClaim(), slab("PSA", "10", {kind: "unknown"}), slab("PSA", "10", {kind: "unrecognized"})]) {
    const evidence = offerEvidence(offer("bad-grade", {grade}), clock);
    assert.equal(evidence.reviewRequired, true);
    assert.equal(evidence.canSelect, false);
  }
  function rawWithClaim() {return slab("PSA", "10", {kind: "raw"});}
  const legacy = offerEvidence(offer("legacy", {grade: {company: "PSA", value: "10", certificate_verified: false}}), clock);
  assert.equal(legacy.gradeKind, "slab");
  assert.equal(legacy.reviewRequired, false);
  assert.match(legacy.gradeLabel, /seller claim/);
});
