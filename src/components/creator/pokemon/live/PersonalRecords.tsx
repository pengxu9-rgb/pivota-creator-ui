"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  pokemonApi as api,
  POKEMON_CHAT_PATH as ROOT,
} from "../../pokemonClient";
import { amount } from "./MarketPanel";
import s from "./Live.module.css";
const {
  changePersonal,
  validatePersonalList,
} = require("@/lib/pokemon/personalChange.cjs");
type Condition = {
  kind: "unspecified" | "raw" | "graded";
  description: string | null;
  grade_company: string | null;
  grade: string | null;
};
type RecordValue = {
  id: string;
  card_id: string;
  version: number;
  condition: Condition;
  quantity?: number;
  notes?: string;
  market?: string;
  currency?: string;
  threshold_minor?: number;
  evaluation_status?: string;
  expiresAt: number;
};
const unspecified: Condition = {
  kind: "unspecified",
  description: null,
  grade_company: null,
  grade: null,
};
const conditionLabel = (c: Condition) =>
  c.kind === "graded"
    ? c.grade_company + " " + c.grade
    : c.kind === "raw"
      ? "Raw · " + c.description?.replaceAll("_", " ")
      : "Condition unspecified";
function ConditionFields({
  value,
  onChange,
  disabled,
}: {
  value: Condition;
  onChange: (v: Condition) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Condition (user reported)</legend>
      <label>
        Card form
        <select
          value={value.kind}
          onChange={(e) =>
            onChange(
              e.target.value === "raw"
                ? {
                    kind: "raw",
                    description: "unknown",
                    grade_company: null,
                    grade: null,
                  }
                : e.target.value === "graded"
                  ? {
                      kind: "graded",
                      description: null,
                      grade_company: "",
                      grade: "",
                    }
                  : unspecified,
            )
          }
        >
          <option value="unspecified">Unspecified</option>
          <option value="raw">Raw</option>
          <option value="graded">Graded</option>
        </select>
      </label>
      {value.kind === "raw" && (
        <label>
          Raw condition
          <select
            value={value.description || "unknown"}
            onChange={(e) =>
              onChange({ ...value, description: e.target.value })
            }
          >
            {[
              "unknown",
              "near_mint",
              "lightly_played",
              "moderately_played",
              "heavily_played",
              "damaged",
            ].map((v) => (
              <option key={v} value={v}>
                {v.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      )}
      {value.kind === "graded" && (
        <div className={s.personalFields}>
          <label>
            Grading company
            <input
              maxLength={40}
              value={value.grade_company || ""}
              onChange={(e) =>
                onChange({ ...value, grade_company: e.target.value })
              }
            />
          </label>
          <label>
            Grade
            <input
              maxLength={20}
              value={value.grade || ""}
              onChange={(e) => onChange({ ...value, grade: e.target.value })}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
export function PersonalForm({
  cardId,
  kind = "collection",
  existing,
  onSaved,
  onCancel,
  onBusyChange,
  onReconciled,
  canMutate,
  disabled = false,
}: {
  cardId: string;
  kind?: "collection" | "alert";
  existing?: RecordValue;
  onSaved?: () => void;
  onCancel?: () => void;
  onBusyChange?: (busy: boolean) => void;
  onReconciled?: (records: RecordValue[] | null, unverified: boolean) => void;
  canMutate?: () => boolean;
  disabled?: boolean;
}) {
  const [id] = useState(() => existing?.id || crypto.randomUUID()),
    [condition, setCondition] = useState(existing?.condition || unspecified),
    [quantity, setQuantity] = useState(String(existing?.quantity || 1)),
    [notes, setNotes] = useState(existing?.notes || ""),
    [market, setMarket] = useState(existing?.market || ""),
    [currency, setCurrency] = useState(existing?.currency || "JPY"),
    [threshold, setThreshold] = useState(
      existing?.threshold_minor
        ? String(
            existing.threshold_minor / (existing.currency === "JPY" ? 1 : 100),
          )
        : "",
    ),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const flight = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const change = <T,>(setter: (v: T) => void, v: T) => {
    setter(v);
    setConsent(false);
    setSuccess(false);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      flight.current ||
      unknown ||
      disabled ||
      !consent ||
      success ||
      (canMutate && !canMutate())
    )
      return;
    const quantityNumber = Number(quantity),
      digits = currency === "JPY" ? 0 : 2;
    if (
      (kind === "alert" &&
        !(digits === 0 ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/).test(threshold)) ||
      (kind === "collection" &&
        (!Number.isSafeInteger(quantityNumber) ||
          quantityNumber < 1 ||
          quantityNumber > 999))
    ) {
      setError("Enter a valid quantity or threshold amount.");
      return;
    }
    const [whole, fraction = ""] = threshold.split("."),
      thresholdMinor =
        Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
    if (
      kind === "alert" &&
      (!market || !Number.isSafeInteger(thresholdMinor) || thresholdMinor <= 0)
    ) {
      setError("Choose a market and a positive threshold.");
      return;
    }
    const normalizedCondition = {
      ...condition,
      grade_company: condition.grade_company?.trim() || null,
      grade: condition.grade?.trim() || null,
    };
    const payload = {
      id,
      ...(existing ? { version: existing.version } : { card_id: cardId }),
      condition: normalizedCondition,
      ...(kind === "collection"
        ? { quantity: quantityNumber, notes, ownership_attested: consent }
        : {
            market,
            currency,
            threshold_minor: thresholdMinor,
            monitoring_consent: consent,
          }),
    };
    flight.current = true;
    setBusy(true);
    setError("");
    onBusyChange?.(true);
    const result = await changePersonal({
      api,
      operation: kind + (existing ? "-update" : "-add"),
      payload,
      listOperation: kind + "-list",
      confirmed: (records: RecordValue[]) =>
        records.some(
          (r) =>
            r.id === id &&
            r.card_id === cardId &&
            JSON.stringify(r.condition) ===
              JSON.stringify(normalizedCondition) &&
            (kind === "collection"
              ? r.quantity === quantityNumber && r.notes === notes.trim()
              : r.market === market &&
                r.currency === currency &&
                r.threshold_minor === thresholdMinor),
        ),
    });
    flight.current = false;
    if (!mounted.current) return;
    setBusy(false);
    setUnknown(result.unverified);
    setConsent(false);
    onBusyChange?.(false);
    onReconciled?.(result.records, result.unverified);
    if (result.error) setError(result.error.message);
    if (result.confirmed) {
      setSuccess(true);
      onSaved?.();
    }
  }
  const locked = busy || unknown || disabled || success;
  return (
    <form
      onSubmit={submit}
      className={s.personalPanel}
      aria-label={
        kind === "collection"
          ? "Record owned card"
          : "Save price alert preference"
      }
    >
      <h2>
        {existing ? "Edit " : ""}
        {kind === "collection"
          ? "Record a card you own"
          : "Price alert preference"}
      </h2>
      <p>
        {kind === "collection"
          ? "This is your ownership report. It does not establish a verified purchase, authenticity or physical printing."
          : "Save a target now. Monitoring stays paused until a verified feed and an exact condition/grade unit are connected."}
      </p>
      <ConditionFields
        disabled={locked}
        value={condition}
        onChange={(v) => change(setCondition, v)}
      />
      {kind === "collection" ? (
        <>
          <label>
            Quantity
            <input
              type="number"
              min={1}
              max={999}
              step={1}
              disabled={locked}
              value={quantity}
              onChange={(e) => change(setQuantity, e.target.value)}
            />
          </label>
          <label>
            Notes
            <textarea
              maxLength={1000}
              disabled={locked}
              value={notes}
              onChange={(e) => change(setNotes, e.target.value)}
            />
          </label>
        </>
      ) : (
        <>
          <div className={s.personalFields}>
            <label>
              Market
              <select
                disabled={locked}
                value={market}
                onChange={(e) => change(setMarket, e.target.value)}
              >
                <option value="">Choose market</option>
                <option value="JP">Japan</option>
                <option value="HK">Hong Kong</option>
                <option value="US">United States</option>
              </select>
            </label>
            <label>
              Currency
              <select
                disabled={locked}
                value={currency}
                onChange={(e) => change(setCurrency, e.target.value)}
              >
                <option>JPY</option>
                <option>HKD</option>
                <option>USD</option>
              </select>
            </label>
          </div>
          <label>
            Listing ask at or below
            <input
              inputMode="decimal"
              disabled={locked}
              value={threshold}
              onChange={(e) => change(setThreshold, e.target.value)}
            />
          </label>
        </>
      )}
      <label className={s.personalConsent}>
        <input
          type="checkbox"
          disabled={locked}
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        {kind === "collection"
          ? "I report that I own this exact catalog card."
          : "Save this preference for future price monitoring."}
      </label>
      <button type="submit" disabled={locked || !consent}>
        {busy
          ? "Checking saved state…"
          : kind === "collection"
            ? "Save ownership record"
            : "Save paused alert"}
      </button>
      {onCancel && (
        <button type="button" disabled={busy || unknown} onClick={onCancel}>
          Cancel edit
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {unknown && (
        <button type="button" onClick={() => window.location.reload()}>
          Reload current records
        </button>
      )}
      {success && (
        <p role="status">
          {kind === "collection"
            ? "Ownership record confirmed in your collection."
            : "Preference confirmed. Price monitoring is paused."}{" "}
          <Link
            href={ROOT + (kind === "collection" ? "/collection" : "/watchlist")}
          >
            View saved records
          </Link>
        </p>
      )}
    </form>
  );
}
export function CardPersonalTools({ cardId }: { cardId: string }) {
  const [mode, setMode] = useState<"collection" | "alert" | null>(null),
    [locked, setLocked] = useState(false);
  return (
    <section className={s.personalPanel} aria-label="Personal card records">
      <div className={s.personalActions}>
        <button disabled={locked} onClick={() => setMode("collection")}>
          Record owned card
        </button>
        <button disabled={locked} onClick={() => setMode("alert")}>
          Set price alert preference
        </button>
      </div>
      {mode && (
        <PersonalForm
          key={cardId + ":" + mode}
          cardId={cardId}
          kind={mode}
          onBusyChange={setLocked}
          onReconciled={(_, unknown) => setLocked(unknown)}
          onCancel={() => setMode(null)}
        />
      )}
    </section>
  );
}
export default function PersonalRecords({
  kind = "collection",
}: {
  kind?: "collection" | "alert";
}) {
  const [records, setRecords] = useState<RecordValue[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [unknown, setUnknown] = useState(false),
    [reload, setReload] = useState(0),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState<RecordValue | null>(null),
    [details, setDetails] = useState<{
      key: string;
      cards: { card: { card_id: string; name: string } }[];
      error: string;
    }>({ key: "", cards: [], error: "" });
  const generation = useRef(0),
    flight = useRef(false),
    unknownRef = useRef(false);
  useEffect(() => {
    const mine = ++generation.current,
      c = new AbortController();
    setRecords(null);
    setError("");
    setUnknown(false);
    api<RecordValue[]>(kind + "-list", {}, c.signal)
      .then((r) => {
        validatePersonalList(r, kind);
        if (mine === generation.current && !c.signal.aborted) {
          setRecords(r);
          setUnknown(false);
          unknownRef.current = false;
          flight.current = false;
          setPage((p) =>
            Math.min(p, Math.max(0, Math.ceil(r.length / 12) - 1)),
          );
        }
      })
      .catch((e) => {
        if (mine === generation.current && !c.signal.aborted) {
          setError(e.message);
          setUnknown(true);
          unknownRef.current = true;
          flight.current = true;
        }
      });
    return () => {
      c.abort();
      generation.current++;
    };
  }, [kind, reload]);
  const visible = records?.slice(page * 12, (page + 1) * 12) || [],
    key = JSON.stringify([...new Set(visible.map((r) => r.card_id))]);
  useEffect(() => {
    const c = new AbortController(),
      ids: string[] = JSON.parse(key);
    setDetails({ key, cards: [], error: "" });
    if (!ids.length) return () => c.abort();
    api<{
      schema: string;
      cards: { card: { card_id: string; name: string } }[];
    }>("catalog/card", { card_ids: ids }, c.signal)
      .then((r) => {
        if (
          r.schema !== "pokemon.live-card-details.v1" ||
          !Array.isArray(r.cards) ||
          r.cards.length !== ids.length ||
          r.cards.some((d, i) => d.card.card_id !== ids[i])
        )
          throw Error("Current catalog details failed validation.");
        if (!c.signal.aborted) setDetails({ key, cards: r.cards, error: "" });
      })
      .catch((e) => {
        if (!c.signal.aborted) setDetails({ key, cards: [], error: e.message });
      });
    return () => c.abort();
  }, [key]);
  async function remove(record: RecordValue) {
    if (flight.current || unknown) return;
    flight.current = true;
    setBusy(true);
    setError("");
    const mine = generation.current;
    const result = await changePersonal({
      api,
      operation: kind + "-remove",
      payload: { id: record.id, version: record.version },
      listOperation: kind + "-list",
      confirmed: (rows: RecordValue[]) => !rows.some((r) => r.id === record.id),
    });
    flight.current = false;
    if (mine !== generation.current) return;
    setBusy(false);
    setRecords(result.records);
    setUnknown(result.unverified);
    unknownRef.current = result.unverified;
    flight.current = result.unverified;
    if (result.confirmed && editing?.id === record.id) setEditing(null);
    if (result.error) setError(result.error.message);
    if (result.records)
      setPage((p) =>
        Math.min(p, Math.max(0, Math.ceil(result.records.length / 12) - 1)),
      );
  }
  return (
    <section
      className={s.personalPanel}
      aria-label={
        kind === "collection" ? "Your owned cards" : "Paused price alerts"
      }
    >
      <h2>
        {kind === "collection" ? "Your owned cards" : "Paused price alerts"}
      </h2>
      <p>
        {kind === "collection"
          ? "User-reported cards only. Purchase-derived holdings will appear after verified order history is connected."
          : "These are saved monitoring preferences. No price checks or notifications are running yet."}
      </p>
      {error && <p role="alert">{error}</p>}
      {!records && !error && <p role="status">Loading your records…</p>}
      <button
        disabled={busy}
        onClick={() => {
          setEditing(null);
          setReload((r) => r + 1);
        }}
      >
        Reload current records
      </button>
      {records?.length === 0 && (
        <p>
          No {kind === "collection" ? "ownership records" : "alert preferences"}{" "}
          yet. Open an exact card to add one.
        </p>
      )}
      {details.key === key && details.error && (
        <p role="alert">Current catalog details: {details.error}</p>
      )}
      {visible.map((r) => (
        <article className={s.personalRecord} key={r.id}>
          <h3>
            {details.key === key
              ? details.cards.find((d) => d.card.card_id === r.card_id)?.card
                  .name || "Current catalog details unavailable"
              : "Checking current catalog record…"}
          </h3>
          <p>{r.card_id}</p>
          <p>{conditionLabel(r.condition)} · User reported</p>
          {kind === "collection" ? (
            <>
              <p>Quantity: {r.quantity}</p>
              {r.notes && <p>{r.notes}</p>}
            </>
          ) : (
            <>
              <p>
                {r.market} · Listing ask ≤{" "}
                {amount(r.threshold_minor!, r.currency!)}
              </p>
              <p>Paused: awaiting verified feed and exact unit.</p>
            </>
          )}
          <p>Preview record expires {new Date(r.expiresAt).toLocaleString()}</p>
          <Link href={ROOT + "/card/" + encodeURIComponent(r.card_id)}>
            Open current card
          </Link>
          <div className={s.personalActions}>
            <button disabled={busy || unknown} onClick={() => setEditing(r)}>
              Edit record
            </button>
            <button disabled={busy || unknown} onClick={() => remove(r)}>
              Remove record
            </button>
          </div>
        </article>
      ))}
      {records && records.length > 12 && (
        <div className={s.personalActions}>
          <button
            disabled={page === 0 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous records
          </button>
          <span>
            Page {page + 1} of {Math.ceil(records.length / 12)}
          </span>
          <button
            disabled={(page + 1) * 12 >= records.length || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Next records
          </button>
        </div>
      )}
      {editing && (
        <PersonalForm
          key={editing.id + ":" + editing.version}
          cardId={editing.card_id}
          kind={kind}
          existing={editing}
          disabled={unknown || busy}
          canMutate={() => !flight.current && !unknownRef.current}
          onBusyChange={(v) => {
            setBusy(v);
            flight.current = v || unknownRef.current;
            if (v) setRecords(null);
          }}
          onReconciled={(r, u) => {
            setRecords(r);
            setUnknown(u);
            unknownRef.current = u;
            flight.current = u;
          }}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </section>
  );
}
