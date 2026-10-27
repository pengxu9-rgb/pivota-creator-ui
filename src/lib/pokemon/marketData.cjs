"use strict";
const {
  normalizePlatformOffers,
  validateUnits,
  components,
  https,
} = require("./platformOffers.cjs");
const fail = () => {
  throw Object.assign(new Error("invalid_live_catalog_response"), {
    code: "invalid_live_catalog_response",
  });
};
const text = (v) => typeof v === "string" && v.length > 0 && v.length <= 2000;
const money = (v) => v === null || (Number.isSafeInteger(v) && v >= 0);
const currency = (v) => ["JPY", "USD", "HKD"].includes(v);
function quoteMatchesCurrentOffer(o) {
  const a = o.quote?.assumptions;
  if (!a) return false;
  const present = (keys) => keys.every((k) => text(a[k]) && a[k].trim());
  if (a.provider === "buyship_partner_v1")
    return (
      a.unit_id === o.unit_id &&
      a.source_url === o.url &&
      a.source_observed_at === o.last_seen &&
      a.source_price_minor === o.current_price_minor &&
      (a.source_currency === o.currency ||
        (o.current_price_minor === null && a.source_currency === null)) &&
      present(["quote_id", "reference_id", "variant_key"]) &&
      (o.seller_native_id == null || a.seller_native_id === o.seller_native_id)
    );
  // No weaker legacy contract for missing or unrecognized providers.
  return false;
}
function validateMarket(
  cardId,
  destination,
  unitsResponse,
  offersResponse,
  now = Date.now(),
) {
  if (
    !Array.isArray(unitsResponse?.units) ||
    !Array.isArray(offersResponse?.offers) ||
    unitsResponse.units.length > 100 ||
    offersResponse.offers.length > 1000
  )
    fail();
  const units = validateUnits(cardId, unitsResponse.units);
  const finish = (result) => ({
    schema: "pokemon.live-market.v2",
    card_id: cardId,
    destination,
    units,
    ...result,
    checked_at: new Date(now).toISOString(),
    basis: "observed_listing_asks",
    sold_sales_available: false,
    checkout_available: false,
  });
  if (offersResponse.schema !== undefined) {
    if (offersResponse.schema !== "pokemon.platform-offers.v1") fail();
    return finish(
      normalizePlatformOffers(cardId, destination, units, offersResponse, now),
    );
  }
  if (
    !offersResponse ||
    Array.isArray(offersResponse) ||
    Object.keys(offersResponse).join() !== "offers"
  )
    fail();
  const ids = new Set();
  for (const u of units) {
    if (
      u?.card_id !== cardId ||
      ![u.unit_id, u.grade_company, u.grade_value, u.condition_bucket].every(
        text,
      ) ||
      u.unit_id !==
        [cardId, u.grade_company, u.grade_value, u.condition_bucket].join(
          "|",
        ) ||
      ids.has(u.unit_id)
    )
      fail();
    ids.add(u.unit_id);
  }
  const keys = new Set();
  const offers = offersResponse.offers.map((o) => {
    const unit = units.find((u) => u.unit_id === o?.unit_id);
    const seen = Date.parse(o?.last_seen),
      key = JSON.stringify([o?.source, o?.native_id]);
    let url;
    try {
      url = new URL(o?.url);
    } catch {
      fail();
    }
    if (
      !unit ||
      ![o.source, o.native_id, o.title].every(text) ||
      keys.has(key) ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      o.current_status !== "on_sale" ||
      !money(o.current_price_minor) ||
      !currency(o.currency) ||
      !Number.isFinite(seen) ||
      seen > now ||
      ["grade_company", "grade_value", "condition_bucket"].some(
        (k) => o[k] !== unit[k],
      ) ||
      !(o.seller_native_id == null || text(o.seller_native_id)) ||
      !(o.seller_name == null || text(o.seller_name)) ||
      !(o.seller_url == null || https(o.seller_url))
    )
      fail();
    keys.add(key);
    let quote = null;
    if (o.quote !== null) {
      const q = o.quote,
        expiry = Date.parse(q?.expires_at),
        quoted = Date.parse(q?.quoted_at);
      if (
        !destination ||
        !q ||
        q.source !== o.source ||
        q.native_id !== o.native_id ||
        q.destination !== destination ||
        !Number.isFinite(expiry) ||
        expiry <= now ||
        !Number.isFinite(quoted) ||
        quoted > now ||
        quoted < seen ||
        !Number.isSafeInteger(q.total_minor) ||
        q.total_minor < 0 ||
        !currency(q.currency) ||
        !text(q.evidence_ref) ||
        !q.components ||
        Object.values(q.components).some(
          (v) => !Number.isSafeInteger(v) || v < 0,
        ) ||
        Object.values(q.components).reduce((a, b) => a + b, 0) !==
          q.total_minor ||
        !quoteMatchesCurrentOffer(o)
      )
        fail();
      quote = {
        schema: "pokemon.legacy-display-quote.v1",
        connector_id: "buyship_partner_v1",
        provider_name: "Buy&Ship",
        merchant_of_record: { id: "buyship", display_name: "Buy&Ship" },
        quote_id: q.assumptions.quote_id,
        purchase_quantity: 1,
        total_minor: q.total_minor,
        currency: q.currency,
        destination: q.destination,
        expires_at: q.expires_at,
        quoted_at: q.quoted_at,
        evidence_ref: q.evidence_ref,
        components: components(q.components, q.total_minor),
        checkout_enabled: false,
      };
    }
    return {
      listing_key: JSON.stringify([
        o.source,
        o.seller_native_id ?? null,
        o.native_id,
      ]),
      source: o.source,
      connector_id: o.source,
      connector_name: null,
      platform: { id: o.source, display_name: null },
      card_id: cardId,
      native_id: o.native_id,
      unit_id: o.unit_id,
      title: o.title,
      url: o.url,
      ask_minor: o.current_price_minor,
      currency: o.currency,
      observed_at: o.last_seen,
      grade_company: o.grade_company,
      grade_value: o.grade_value,
      condition_bucket: o.condition_bucket,
      seller:
        o.seller_native_id == null
          ? null
          : {
              id: o.seller_native_id,
              display_name: o.seller_name ?? null,
              url: o.seller_url ?? null,
            },
      availability: "available",
      listing_quantity: null,
      stock_quantity: null,
      ask_basis: "listing_total",
      valid_until: null,
      quotes: quote ? [quote] : [],
    };
  });
  // Legacy source IDs are actual provenance, never invented platform names or
  // claims about connectors/sellers that this endpoint did not report.
  return finish({
    offers,
    connectors: [],
    coverage: [],
    coverage_scope: "reported_sources_only",
  });
}
module.exports = { validateMarket, quoteMatchesCurrentOffer };
