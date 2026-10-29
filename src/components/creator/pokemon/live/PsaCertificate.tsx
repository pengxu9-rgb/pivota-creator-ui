"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { pokemonApi as api } from "../../pokemonClient";
import type {CommerceTransport} from "@/lib/pokemon/commerceTypes";
import s from "./CommercePanel.module.css";
export type PsaVerification = { schema: "pokemon.psa-cert.v1"; provider: "psa";
  status: "found" | "not_found" | "invalid" | "unavailable" | "mismatch";
  certificate_number: string | null; checked_at: string; expires_at: string | null; cached: boolean; record_found: boolean;
  record: null | { certificate_number: string; subject: string | null; card_number: string | null; year: string | null;
    brand: string | null; variety: string | null; grade: string | null; grade_description: string | null; item_status: string | null };
  comparison: { status: string; matched_fields: string[]; mismatched_fields: string[]; missing_fields: string[] };
  certificate_verified: false; authenticity_verified: false; physical_authenticity_verified: false; reason: string | null; message: string };
export default function PsaCertificate({ offerId, initialCertificate = "", autoStart = false, onBusyChange, onStop, onResult, transport = api }: {
  offerId?: string; initialCertificate?: string; autoStart?: boolean; onBusyChange?: (busy: boolean) => void; transport?:CommerceTransport; onStop?:()=>void;onResult?:(result:PsaVerification)=>void;
}) {
  const [certificate, setCertificate] = useState(initialCertificate), [result, setResult] = useState<PsaVerification | null>(null),
    [pending, setPending] = useState(false), [error, setError] = useState("");
  const flight = useRef<AbortController | null>(null), initial = useRef({ autoStart, initialCertificate }),resultCallback=useRef(onResult);resultCallback.current=onResult;
  useEffect(() => () => flight.current?.abort(), []);
  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const lookup = useCallback(async (number: string) => {
    flight.current?.abort(); const c = new AbortController(); flight.current = c;
    setPending(true); setError(""); setResult(null);
    try {
      const value = await transport<{ verification: PsaVerification }>("commerce/psa", { certificate_number: number,
        ...(offerId ? { offer_id: offerId } : {}) }, c.signal);
      if (!c.signal.aborted) {require("@/lib/pokemon/commerceContract.cjs").validatePsaVerification(value.verification);setResult(value.verification);resultCallback.current?.(value.verification);}
    } catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Certificate lookup could not finish."); }
    finally { if (flight.current === c) { setPending(false); flight.current = null; } }
  }, [offerId,transport]);
  useEffect(() => {
    const first = initial.current;
    if (!first.autoStart || !/^[0-9]{7,12}$/.test(first.initialCertificate)) return;
    const timer = setTimeout(() => { void lookup(first.initialCertificate); }, 0);
    return () => clearTimeout(timer);
  }, [lookup]);
  return <section className={s.certificate} aria-label="PSA certificate record lookup">
    <h3>PSA certificate record</h3>
    <p className={s.note}>Check the number printed on the slab. A matching PSA record does not authenticate the physical slab or prove that the listing contains that card.</p>
    <form onSubmit={(e) => { e.preventDefault(); void lookup(certificate); }}>
      <label>Certificate number<input inputMode="numeric" value={certificate} pattern="[0-9]{7,12}" minLength={7} maxLength={12}
        disabled={pending} onChange={(e) => { setCertificate(e.target.value); setResult(null); }} required placeholder="7–12 digits" /></label>
      <button disabled={pending || !/^[0-9]{7,12}$/.test(certificate)}>{pending ? "Checking PSA…" : "Look up PSA record"}</button>
    </form>
    {pending&&<button type="button" onClick={()=>{flight.current?.abort();flight.current=null;setPending(false);setResult(null);setError("PSA check stopped. Refresh before continuing.");onStop?.();}}>Stop PSA check</button>}
    {error && <p className={s.error} role="alert">{error}</p>}
    {pending && <p role="status">Looking up this certificate number. No grading submission or payment is made.</p>}
    {result && <div className={result.status === "mismatch" ? s.error : s.receipt} role="status">
      <h4>{({ found: "PSA record found", not_found: "No PSA record found", invalid: "Certificate number not accepted", unavailable: "PSA lookup unavailable", mismatch: "PSA record differs from the seller claim" })[result.status]}</h4>
      <p>{result.message}</p>
      {result.record && <dl>{Object.entries(result.record).filter(([, value]) => value !== null).map(([field, value]) =>
        <div key={field}><dt>{field.replaceAll("_", " ")}</dt><dd>{value}</dd></div>)}</dl>}
      {result.comparison.status === "matched" && <p>Compared record fields match the server-held seller claim: {result.comparison.matched_fields.join(", ")}.</p>}
      {result.comparison.mismatched_fields.length > 0 && <p>Different fields: {result.comparison.mismatched_fields.join(", ")}.</p>}
      {result.comparison.missing_fields.length > 0 && <p>Fields still missing for comparison: {result.comparison.missing_fields.join(", ")}.</p>}
      {result.comparison.status === "not_compared" && <p>This record has not been matched to a marketplace offer.</p>}
      <small>Checked {new Date(result.checked_at).toLocaleString()}{result.cached ? " · cached PSA response" : ""}
        {result.expires_at ? " · Recheck after " + new Date(result.expires_at).toLocaleString() : ""}</small>
      <p><strong>Physical authenticity remains unverified.</strong></p>
    </div>}
  </section>;
}
