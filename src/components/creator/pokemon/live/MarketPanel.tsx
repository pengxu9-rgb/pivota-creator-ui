"use client";
import { useEffect, useState } from "react";
import { pokemonApi as api } from "../../pokemonClient";
import type { Market } from "@/lib/pokemon/marketTypes";
import MarketOffers from "./MarketOffers";
import s from "./Live.module.css";
export const amount = require("@/lib/pokemon/moneyFormat.cjs").formatMinor as (
  minor: number,
  currency: string,
) => string;
export default function MarketPanel({ cardId }: { cardId: string }) {
  const [destination, setDestination] = useState(""),
    [reload, setReload] = useState(0),
    [clock, setClock] = useState(() => Date.now());
  const key = JSON.stringify([cardId, destination, reload]);
  const [state, setState] = useState<{
    key: string;
    value: Market | null;
    error: string;
  }>({ key: "", value: null, error: "" });
  useEffect(() => {
    const c = new AbortController();
    setState({ key, value: null, error: "" });
    api<Market>(
      "catalog/market",
      { card_id: cardId, destination: destination || null },
      c.signal,
    )
      .then((value) => {
        if (
          value.schema !== "pokemon.live-market.v2" ||
          value.card_id !== cardId ||
          value.destination !== (destination || null) ||
          !Array.isArray(value.units) ||
          !Array.isArray(value.offers) ||
          !Array.isArray(value.connectors) ||
          !Array.isArray(value.coverage)
        )
          throw Error("Market response failed validation.");
        if (!c.signal.aborted) {
          setClock(Date.now());
          setState({ key, value, error: "" });
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setState({ key, value: null, error: e.message });
      });
    return () => c.abort();
  }, [cardId, destination, key]);
  const current = state.key === key ? state : null;
  useEffect(() => {
    const times =
      state.value?.offers
        .flatMap((o) => [
          ...o.quotes.map((q) => Date.parse(q.expires_at)),
          ...(o.valid_until ? [Date.parse(o.valid_until)] : []),
        ])
        .filter((t) => t > clock) || [];
    if (!times.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(2147483647, Math.max(0, Math.min(...times) - Date.now() + 1)),
    );
    return () => clearTimeout(timer);
  }, [state.value, clock]);
  return (
    <section className={s.personalPanel} aria-label="Current market data">
      <div className={`${s.sectionHead} ${s.marketHeader}`}>
        <div>
          <h2>Offers across platforms</h2>
          <p>
            Compare exact printings and conditions. Listing asks, delivered
            quotes and completed sales stay separate.
          </p>
        </div>
        <button
          disabled={!current?.value && !current?.error}
          onClick={() => setReload((r) => r + 1)}
        >
          Refresh market data
        </button>
      </div>
      <label>
        Delivered quote destination
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          <option value="">Listing asks only</option>
          <option value="HK">Hong Kong</option>
          <option value="US">United States</option>
        </select>
      </label>
      {!current?.value && !current?.error && (
        <p role="status">Checking current listing coverage…</p>
      )}
      {current?.error && (
        <div role="alert">
          <p>{current.error}</p>
          <button onClick={() => setReload((r) => r + 1)}>
            Retry market read
          </button>
        </div>
      )}
      {current?.value && (
        <MarketOffers key={key} market={current.value} clock={clock} />
      )}
      <p>
        Each purchase path must identify its merchant of record and bind a
        current locked quote to your explicit consent. Checkout and order
        connectors are awaiting verified API contracts.
      </p>
    </section>
  );
}
