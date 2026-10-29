"use client";
import React, { useState } from "react";
import type { Market } from "@/lib/pokemon/marketTypes";
import s from "./Live.module.css";
const { groupOffers } = require("@/lib/pokemon/offerView.cjs");
const { formatMinor } = require("@/lib/pokemon/moneyFormat.cjs");
const coverageLabel: Record<string, string> = {
  available: "Data returned",
  empty: "No listings or quotes returned",
  unavailable: "Read unavailable",
  not_connected: "Not connected",
  not_requested: "Not requested",
};
export default function MarketOffers({
  market,
  clock,
}: {
  market: Market;
  clock: number;
}) {
  const [unit, setUnit] = useState(""),
    [platform, setPlatform] = useState(""),
    [currency, setCurrency] = useState(""),
    [sort, setSort] = useState("source");
  const platforms = [
    ...new Map(market.offers.map((o) => [o.platform.id, o.platform])).values(),
  ];
  const currencies = [
    ...new Set(market.offers.flatMap((o) => (o.currency ? [o.currency] : []))),
  ];
  const groups = groupOffers(market.offers, {
    unit,
    platform,
    currency,
    sort,
    clock,
  }) as {
    key: string;
    unit_id: string;
    currency: string | null;
    listing_quantity: number | null;
    availability: string;
    freshness: string;
    offers: Market["offers"];
  }[];
  return (
    <div className={s.marketBoard}>
      {market.coverage.length > 0 && (
        <div className={s.feedCoverage} aria-label="Platform feed coverage">
          {market.coverage.map((c) => (
            <div key={c.connector_id}>
              <strong>
                {
                  market.connectors.find((p) => p.id === c.connector_id)!
                    .display_name
                }
              </strong>
              <span>
                {coverageLabel[c.state]}
                {c.error_code ? " · " + c.error_code.replaceAll("_", " ") : ""}
              </span>
              <small>Checked {new Date(c.checked_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
      {market.offers.length > 0 && (
        <div className={s.marketFilters}>
          <label>
            Condition or grade
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">All units, shown separately</option>
              {market.units.map((u) => (
                <option key={u.unit_id} value={u.unit_id}>
                  {u.grade_company} {u.grade_value} · {u.condition_bucket}
                </option>
              ))}
            </select>
          </label>
          <label>
            Platform
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">All reported platforms</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name === null
                    ? "Source · " + p.id
                    : p.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                if (!e.target.value) setSort("source");
              }}
            >
              <option value="">All currencies, shown separately</option>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Order listings
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="source">Source order</option>
              <option value="recent">Recently observed</option>
              <option value="ask" disabled={!currency}>
                Lowest listing ask within each group
              </option>
            </select>
          </label>
        </div>
      )}
      {groups.length === 0 && (
        <p role="status">
          {market.offers.length
            ? "No returned offers match these filters."
            : "No current permitted listings were returned for this card. No price estimate is available."}
        </p>
      )}
      {groups.map((g) => {
        const u = market.units.find((u) => u.unit_id === g.unit_id)!;
        return (
          <section
            className={s.offerGroup}
            key={g.key}
            aria-label={[
              u.grade_company,
              u.grade_value,
              u.condition_bucket,
              g.currency,
              g.listing_quantity === null
                ? "quantity unreported"
                : g.listing_quantity + " cards per listing",
            ].join(" · ")}
          >
            <div className={s.offerGroupHead}>
              <h3>
                {u.grade_company} {u.grade_value} · {u.condition_bucket}
              </h3>
              <p>
                {g.currency === null ? "Currency unreported" : g.currency} ·{" "}
                {g.listing_quantity === null
                  ? "Cards per listing unreported"
                  : g.listing_quantity + " cards per listing"}{" "}
                · {g.offers.length} offers ·{" "}
                {g.availability.replaceAll("_", " ")} ·{" "}
                {g.freshness === "current"
                  ? "Availability check current"
                  : g.freshness === "expired"
                    ? "Availability check expired"
                    : "Availability validity unreported"}
              </p>
            </div>
            {g.listing_quantity === null && (
              <p className={s.muted}>
                Lot size is unreported. A per-card price comparison is
                unavailable.
              </p>
            )}
            <div className={s.offerRows}>
              {g.offers.map((o) => (
                <article
                  className={s.offerRow}
                  key={o.listing_key}
                  data-listing-key={o.listing_key}
                >
                  <div className={s.offerIdentity}>
                    <p className={s.platformName}>
                      {o.platform.display_name === null
                        ? "Source · " + o.platform.id
                        : o.platform.display_name}
                    </p>
                    <h4>{o.title}</h4>
                    {o.seller ? (
                      <p>
                        {o.seller.display_name !== null ? (
                          <>
                            <span>{o.seller.display_name}</span>
                            <small>Seller ID · {o.seller.id}</small>
                          </>
                        ) : (
                          "Seller ID · " + o.seller.id
                        )}
                        {o.seller.url && (
                          <>
                            {" "}
                            ·{" "}
                            <a
                              href={o.seller.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Seller profile
                            </a>
                          </>
                        )}
                      </p>
                    ) : (
                      <p>Seller details not provided</p>
                    )}
                    <small>
                      Listing ID · {o.native_id}
                      {o.connector_name !== null &&
                        " · Via " + o.connector_name}
                    </small>
                  </div>
                  <div className={s.offerPrice}>
                    <p>Listing ask</p>
                    <strong>
                      {o.ask_minor === null
                        ? "Not recorded"
                        : formatMinor(o.ask_minor, o.currency)}
                    </strong>
                    <small>
                      Total for this listing; shipping and fees are separate.
                    </small>
                  </div>
                  <div className={s.offerAvailability}>
                    <p>
                      Availability observed ·{" "}
                      {o.availability.replaceAll("_", " ")}
                    </p>
                    <small>
                      {o.stock_quantity === null
                        ? "Stock quantity not reported"
                        : "Stock · " + o.stock_quantity + " listings"}
                    </small>
                    <small>
                      Observed {new Date(o.observed_at).toLocaleString()}
                    </small>
                    {o.valid_until && (
                      <small>
                        {Date.parse(o.valid_until) > clock
                          ? "Availability check valid until "
                          : "Availability check expired · "}
                        {new Date(o.valid_until).toLocaleString()}
                      </small>
                    )}
                    <a href={o.url} target="_blank" rel="noreferrer">
                      View source listing
                    </a>
                  </div>
                  {o.quotes.length > 0 ? (
                    <div
                      className={s.offerQuotes}
                      aria-label="Delivered quote options"
                    >
                      {o.quotes.map((q) => (
                        <div
                          className={s.offerQuote}
                          key={q.connector_id + ":" + q.quote_id}
                        >
                          <p>
                            <strong>{q.provider_name}</strong> · {q.destination}{" "}
                            · {q.purchase_quantity} listings
                          </p>
                          <p>
                            Merchant of record ·{" "}
                            {q.merchant_of_record.display_name}
                          </p>
                          {Date.parse(q.expires_at) > clock &&
                          (!o.valid_until ||
                            Date.parse(o.valid_until) > clock) ? (
                            <>
                              <p className={s.quoteTotal}>
                                Delivered quote ·{" "}
                                {formatMinor(q.total_minor, q.currency)}
                              </p>
                              <small>
                                Expires{" "}
                                {new Date(q.expires_at).toLocaleString()}
                              </small>
                              <details>
                                <summary>Quote cost breakdown</summary>
                                {Object.entries(q.components).map(
                                  ([name, value]) => (
                                    <p key={name}>
                                      {name.replaceAll("_", " ")} ·{" "}
                                      {formatMinor(value, q.currency)}
                                    </p>
                                  ),
                                )}
                              </details>
                            </>
                          ) : (
                            <p role="status">
                              {Date.parse(q.expires_at) <= clock
                                ? "Delivered quote expired. Refresh to check for a current quote."
                                : "Delivered quote unavailable. Refresh the listing availability first."}
                            </p>
                          )}
                          <small>Checkout is not enabled here.</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    market.destination && (
                      <p className={s.offerQuotes}>
                        No current delivered quote is available for this
                        listing.
                      </p>
                    )
                  )}
                </article>
              ))}
            </div>
          </section>
        );
      })}
      <p className={s.muted}>
        Checked {new Date(market.checked_at).toLocaleString()}.{" "}
        {market.coverage_scope === "reported_sources_only" &&
          "The backend has not reported a full connector inventory. "}
        Completed-sale data is not connected. Seller quality and physical-card
        authenticity are not scored.
      </p>
    </div>
  );
}
