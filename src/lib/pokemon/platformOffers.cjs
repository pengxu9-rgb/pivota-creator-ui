"use strict";
// Internal transport contract. Platform API adapters must explicitly translate
// their own contract into this schema; unknown payloads never use legacy parsing.
const fail = () => {
  throw Object.assign(new Error("invalid_live_catalog_response"), {
    code: "invalid_live_catalog_response",
  });
};
const text = (v, max = 2000) =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const id = (v) => text(v, 100) && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(v);
const currency = (v) => ["JPY", "USD", "HKD"].includes(v);
const money = (v) => Number.isSafeInteger(v) && v >= 0;
const timestamp = (v) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const exact = (v, keys) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
function https(value) {
  try {
    const u = new URL(value);
    return text(value) && u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function merchant(value) {
  if (
    !exact(value, ["id", "display_name"]) ||
    !id(value.id) ||
    !text(value.display_name, 160)
  )
    fail();
  return { ...value };
}
function connector(value) {
  if (
    !exact(value, [
      "schema",
      "id",
      "display_name",
      "enabled",
      "platforms",
      "capabilities",
      "permissions",
      "destinations",
      "merchant_of_record",
    ]) ||
    value.schema !== "pokemon.platform-connector.v1" ||
    !id(value.id) ||
    !text(value.display_name, 160) ||
    typeof value.enabled !== "boolean" ||
    !Array.isArray(value.platforms) ||
    !value.platforms.length ||
    value.platforms.length > 32 ||
    !Array.isArray(value.destinations) ||
    value.destinations.length > 64 ||
    new Set(value.destinations).size !== value.destinations.length ||
    value.destinations.some(
      (d) => typeof d !== "string" || !/^[A-Z]{2}$/.test(d),
    ) ||
    !exact(value.capabilities, [
      "listings",
      "locked_quotes",
      "checkout",
      "orders",
    ]) ||
    Object.values(value.capabilities).some((v) => typeof v !== "boolean") ||
    !exact(value.permissions, [
      "listing_display",
      "quote_display",
      "cross_source_comparison",
      "quote_store",
      "order_write",
    ]) ||
    Object.values(value.permissions).some((v) => typeof v !== "boolean") ||
    (value.capabilities.checkout &&
      (!value.capabilities.locked_quotes || !value.capabilities.orders))
  )
    fail();
  const platforms = new Set();
  for (const p of value.platforms) {
    if (
      !exact(p, ["id", "display_name"]) ||
      !id(p.id) ||
      !text(p.display_name, 160) ||
      platforms.has(p.id)
    )
      fail();
    platforms.add(p.id);
  }
  if (value.merchant_of_record !== null) merchant(value.merchant_of_record);
  if (value.capabilities.locked_quotes && value.merchant_of_record === null)
    fail();
  return structuredClone(value);
}
function connectorRegistry(values) {
  if (!Array.isArray(values) || values.length > 32) fail();
  const registry = new Map(),
    platforms = new Map();
  for (const value of values) {
    const c = connector(value);
    if (registry.has(c.id)) fail();
    for (const p of c.platforms) {
      if (platforms.has(p.id) && platforms.get(p.id) !== p.display_name) fail();
      platforms.set(p.id, p.display_name);
    }
    registry.set(c.id, c);
  }
  return registry;
}
function validateUnits(cardId, values) {
  if (!text(cardId) || !Array.isArray(values) || values.length > 100) fail();
  const seen = new Set();
  for (const u of values) {
    if (
      u?.card_id !== cardId ||
      ![u.unit_id, u.grade_company, u.grade_value, u.condition_bucket].every(
        (v) => text(v),
      ) ||
      u.unit_id !==
        [cardId, u.grade_company, u.grade_value, u.condition_bucket].join(
          "|",
        ) ||
      seen.has(u.unit_id)
    )
      fail();
    seen.add(u.unit_id);
  }
  return values;
}
function seller(value) {
  if (value === null) return null;
  if (
    !exact(value, ["id", "display_name", "url"]) ||
    !text(value.id, 200) ||
    !(value.display_name === null || text(value.display_name, 160)) ||
    !(value.url === null || https(value.url))
  )
    fail();
  return { ...value };
}
function components(value, total) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.keys(value).length > 32 ||
    Object.entries(value).some(([k, v]) => !id(k) || !money(v)) ||
    !money(total)
  )
    fail();
  if (
    Object.values(value).reduce((sum, v) => sum + BigInt(v), 0n) !==
    BigInt(total)
  )
    fail();
  return { ...value };
}
const sourceSnapshot = (o) => ({
  card_id: o.card_id,
  unit_id: o.unit_id,
  platform_id: o.platform_id,
  native_id: o.native_id,
  seller_id: o.seller?.id ?? null,
  url: o.url,
  observed_at: o.observed_at,
  ask_minor: o.ask_minor,
  currency: o.currency,
  listing_quantity: o.listing_quantity,
  stock_quantity: o.stock_quantity,
  availability: o.availability,
  valid_until: o.valid_until,
});
function validateQuote(q, o, registry, destination, now) {
  const c = registry.get(q?.connector_id),
    snap = sourceSnapshot(o);
  if (
    !exact(q, [
      "schema",
      "quote_id",
      "connector_id",
      "platform_id",
      "native_id",
      "unit_id",
      "seller_id",
      "merchant_of_record",
      "destination",
      "purchase_quantity",
      "total_minor",
      "currency",
      "components",
      "quoted_at",
      "expires_at",
      "evidence_ref",
      "source_snapshot",
    ]) ||
    q.schema !== "pokemon.platform-quote.v1" ||
    !c?.enabled ||
    !c.capabilities.locked_quotes ||
    !c.permissions.quote_display ||
    !c.platforms.some((p) => p.id === o.platform_id) ||
    !destination ||
    !c.destinations.includes(destination) ||
    !text(q.quote_id, 200) ||
    q.platform_id !== o.platform_id ||
    q.native_id !== o.native_id ||
    q.unit_id !== o.unit_id ||
    q.seller_id !== (o.seller?.id ?? null) ||
    q.destination !== destination ||
    !currency(q.currency) ||
    !timestamp(q.quoted_at) ||
    Date.parse(q.quoted_at) > now ||
    Date.parse(q.quoted_at) < Date.parse(o.observed_at) ||
    !timestamp(q.expires_at) ||
    Date.parse(q.expires_at) <= now ||
    Date.parse(q.expires_at) <= Date.parse(q.quoted_at) ||
    !text(q.evidence_ref) ||
    !Number.isSafeInteger(q.purchase_quantity) ||
    q.purchase_quantity < 1 ||
    q.purchase_quantity > 999 ||
    (o.stock_quantity !== null && q.purchase_quantity > o.stock_quantity) ||
    o.availability !== "available" ||
    (o.valid_until !== null && Date.parse(o.valid_until) <= now) ||
    !exact(q.source_snapshot, Object.keys(snap)) ||
    Object.entries(snap).some(([k, v]) => q.source_snapshot[k] !== v)
  )
    fail();
  const m = merchant(q.merchant_of_record);
  if (
    m.id !== c.merchant_of_record?.id ||
    m.display_name !== c.merchant_of_record?.display_name
  )
    fail();
  return {
    ...q,
    merchant_of_record: m,
    source_snapshot: { ...q.source_snapshot },
    components: components(q.components, q.total_minor),
    provider_name: c.display_name,
    checkout_enabled: false,
  };
}
function normalizePlatformOffers(
  cardId,
  destination,
  units,
  body,
  now = Date.now(),
) {
  if (
    !(
      destination === null ||
      (typeof destination === "string" && /^[A-Z]{2}$/.test(destination))
    ) ||
    !exact(body, [
      "schema",
      "card_id",
      "destination",
      "connectors",
      "coverage",
      "offers",
    ]) ||
    body.schema !== "pokemon.platform-offers.v1" ||
    body.card_id !== cardId ||
    body.destination !== destination ||
    !Array.isArray(body.offers) ||
    body.offers.length > 1000 ||
    !Array.isArray(body.coverage)
  )
    fail();
  validateUnits(cardId, units);
  const registry = connectorRegistry(body.connectors),
    seen = new Set(),
    used = new Map(),
    quoteKeys = new Set();
  const offers = body.offers.map((o) => {
    const c = registry.get(o?.connector_id),
      unit = units.find((u) => u.unit_id === o?.unit_id);
    if (
      !exact(o, [
        "schema",
        "connector_id",
        "platform_id",
        "native_id",
        "card_id",
        "unit_id",
        "title",
        "url",
        "seller",
        "availability",
        "listing_quantity",
        "stock_quantity",
        "ask_minor",
        "currency",
        "ask_basis",
        "observed_at",
        "valid_until",
        "quotes",
      ]) ||
      o.schema !== "pokemon.platform-listing.v1" ||
      o.card_id !== cardId ||
      !c?.enabled ||
      !c.capabilities.listings ||
      !c.permissions.listing_display ||
      !c.platforms.some((p) => p.id === o.platform_id) ||
      !unit ||
      !text(o.native_id, 200) ||
      !text(o.title) ||
      !https(o.url) ||
      !["available", "sold_out", "withdrawn", "unknown"].includes(
        o.availability,
      ) ||
      !(
        o.listing_quantity === null ||
        (Number.isSafeInteger(o.listing_quantity) &&
          o.listing_quantity >= 1 &&
          o.listing_quantity <= 999)
      ) ||
      !(
        o.stock_quantity === null ||
        (Number.isSafeInteger(o.stock_quantity) &&
          o.stock_quantity >= 0 &&
          o.stock_quantity <= 999999)
      ) ||
      (o.availability === "available" && o.stock_quantity === 0) ||
      !(o.ask_minor === null || money(o.ask_minor)) ||
      !(
        currency(o.currency) ||
        (o.currency === null && o.ask_minor === null)
      ) ||
      o.ask_basis !== "listing_total" ||
      !timestamp(o.observed_at) ||
      Date.parse(o.observed_at) > now ||
      !(
        o.valid_until === null ||
        (timestamp(o.valid_until) &&
          Date.parse(o.valid_until) > Date.parse(o.observed_at))
      ) ||
      !Array.isArray(o.quotes) ||
      o.quotes.length > 8
    )
      fail();
    const s = seller(o.seller),
      key = JSON.stringify([o.platform_id, o.native_id]);
    // The same platform listing arriving through two paths is not two offers.
    // The backend must resolve any contradictory duplicate explicitly.
    if (seen.has(key)) fail();
    seen.add(key);
    used.set(c.id, (used.get(c.id) || 0) + 1);
    const quotes = o.quotes.map((q) => {
      const checked = validateQuote(q, o, registry, destination, now),
        qkey = JSON.stringify([q.connector_id, q.quote_id]);
      if (quoteKeys.has(qkey)) fail();
      quoteKeys.add(qkey);
      used.set(q.connector_id, (used.get(q.connector_id) || 0) + 1);
      return checked;
    });
    const platform = c.platforms.find((p) => p.id === o.platform_id);
    return {
      listing_key: key,
      source: o.platform_id,
      connector_id: c.id,
      connector_name: c.display_name,
      platform: { ...platform },
      native_id: o.native_id,
      card_id: cardId,
      unit_id: o.unit_id,
      title: o.title,
      url: o.url,
      seller: s,
      availability: o.availability,
      listing_quantity: o.listing_quantity,
      stock_quantity: o.stock_quantity,
      ask_minor: o.ask_minor,
      currency: o.currency,
      ask_basis: o.ask_basis,
      observed_at: o.observed_at,
      valid_until: o.valid_until,
      grade_company: unit.grade_company,
      grade_value: unit.grade_value,
      condition_bucket: unit.condition_bucket,
      quotes,
    };
  });
  const covered = new Set();
  for (const row of body.coverage) {
    const c = registry.get(row?.connector_id),
      count = used.get(row?.connector_id) || 0;
    if (
      !exact(row, ["connector_id", "state", "checked_at", "error_code"]) ||
      !c ||
      covered.has(c.id) ||
      ![
        "available",
        "empty",
        "unavailable",
        "not_connected",
        "not_requested",
      ].includes(row.state) ||
      !timestamp(row.checked_at) ||
      Date.parse(row.checked_at) > now ||
      (row.state === "unavailable"
        ? ![
            "access_denied",
            "source_unavailable",
            "timeout",
            "rate_limited",
            "destination_unsupported",
          ].includes(row.error_code)
        : row.error_code !== null) ||
      (!c.enabled && row.state !== "not_connected") ||
      (c.enabled && row.state === "not_connected") ||
      (row.state === "available" ? count === 0 : count > 0)
    )
      fail();
    covered.add(c.id);
  }
  if (covered.size !== registry.size) fail();
  if (
    used.size > 1 &&
    [...used.keys()].some(
      (id) => !registry.get(id).permissions.cross_source_comparison,
    )
  )
    fail();
  return {
    offers,
    connectors: [...registry.values()],
    coverage: body.coverage.map((r) => ({ ...r })),
    coverage_scope: "registered_connectors",
  };
}
module.exports = {
  connector,
  connectorRegistry,
  validateUnits,
  normalizePlatformOffers,
  validateQuote,
  sourceSnapshot,
  components,
  https,
  merchant,
};
