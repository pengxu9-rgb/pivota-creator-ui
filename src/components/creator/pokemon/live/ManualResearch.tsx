"use client";
import { useEffect, useState } from "react";
import { pokemonApi as api } from "../../pokemonClient";
import CommercePanel from "./CommercePanel";
import s from "./CommercePanel.module.css";
export default function ManualResearch() {
  const [ready, setReady] = useState(false), [error, setError] = useState("");
  useEffect(() => { const c = new AbortController();
    void api("bootstrap", {}, c.signal).then(() => { if (!c.signal.aborted) setReady(true); })
      .catch((e) => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, []);
  return <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px", color: "#252031" }}>
    <h1 style={{fontSize:28,fontWeight:700,letterSpacing:-1}}>Pot <small style={{fontSize:14,fontWeight:400,letterSpacing:0}}> / card evidence</small></h1>
    <p className={s.demo} role="status"><strong>Local read-only listing check.</strong> Real source observations, grouped by seller-claimed grade. Confirm the exact printing independently. Certificate checks remain separate from physical authenticity. Orders and payments disabled.</p>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {!ready && !error && <p role="status">Starting your private research session…</p>}
    {ready && <CommercePanel cardId="research:unverified" cardName="Unverified listing · choose the exact printing before comparing" initialQuery="Charizard ex SV4a 349/190" />}
  </main>;
}
