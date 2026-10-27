"use strict";
function groupOffers(
  offers,
  {
    unit = "",
    platform = "",
    currency = "",
    sort = "source",
    clock = Date.now(),
  } = {},
) {
  if (
    !["source", "recent", "ask"].includes(sort) ||
    (sort === "ask" && !currency)
  )
    throw Error("Choose one currency before sorting prices.");
  const groups = new Map();
  for (const o of offers) {
    if (
      (unit && o.unit_id !== unit) ||
      (platform && o.platform.id !== platform) ||
      (currency && o.currency !== currency)
    )
      continue;
    // Listing totals are comparable only for the same exact unit, currency and
    // reported lot size. Unreported quantity never becomes one card.
    const freshness =
      o.valid_until === null
        ? "unreported"
        : Date.parse(o.valid_until) > clock
          ? "current"
          : "expired";
    const key = JSON.stringify([
      o.unit_id,
      o.currency,
      o.listing_quantity,
      o.availability,
      freshness,
    ]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        unit_id: o.unit_id,
        currency: o.currency,
        listing_quantity: o.listing_quantity,
        availability: o.availability,
        freshness,
        offers: [],
      });
    groups.get(key).offers.push(o);
  }
  for (const g of groups.values()) {
    if (sort === "recent")
      g.offers.sort(
        (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at),
      );
    if (
      sort === "ask" &&
      g.listing_quantity !== null &&
      g.availability === "available" &&
      g.freshness === "current"
    )
      g.offers.sort((a, b) =>
        a.ask_minor === null
          ? b.ask_minor === null
            ? 0
            : 1
          : b.ask_minor === null
            ? -1
            : a.ask_minor - b.ask_minor,
      );
  }
  return [...groups.values()];
}
module.exports = { groupOffers };
