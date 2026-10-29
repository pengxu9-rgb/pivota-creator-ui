"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {CommerceTransport} from "@/lib/pokemon/commerceTypes";
import type { Card } from "@/lib/pokemon/types";
import { pokemonApi as api } from "../../pokemonClient";
import useConversationRecovery from "./useConversationRecovery";
import CommercePanel, { type CommerceCommand } from "./CommercePanel";
import PsaCertificate from "./PsaCertificate";
import s from "./CommercePanel.module.css";
const { catalogQuery, cardResearchQuery } = require("@/lib/pokemon/commerceChat.cjs");
export type ChatCommerceRequest = CommerceCommand & { text: string; card?: Card; product_urls?: string[] };
export default function CommerceChat({ command, onBusyChange, transport }: {
  command: ChatCommerceRequest | null; onBusyChange: (busy: boolean) => void; transport:CommerceTransport;
}) {
  const [card, setCard] = useState<Card | null>(null), [choices, setChoices] = useState<Card[]>([]),
    [search, setSearch] = useState(""), [status, setStatus] = useState(""), [searching, setSearching] = useState(false),
    [request, setRequest] = useState<{ id: string; query: string; urls: string[] } | null>(null),
    [panelCommand, setPanelCommand] = useState<CommerceCommand | null>(null),
    [certificate, setCertificate] = useState<{ id: string; value: string; offerId?: string } | null>(null),
    [selectedOffer, setSelectedOffer] = useState<string | null>(null),
    [panelBusy, setPanelBusy] = useState(false), [psaBusy, setPsaBusy] = useState(false),
    [unused] = useState(false);
  const recovery=useConversationRecovery(transport);
  const handled = useRef<string | null>(null), flight = useRef<AbortController | null>(null), queryText = useRef(""), researchUrls = useRef<string[]>([]), section = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => { flight.current?.abort(); onBusyChange(false); }, [onBusyChange]);
  useEffect(() => { setCertificate(null); }, [selectedOffer]);
  useEffect(() => { onBusyChange(searching || panelBusy || psaBusy || recovery.blocked); }, [searching, panelBusy, psaBusy, recovery.blocked, onBusyChange]);
  useEffect(() => { if (command) { const timer = setTimeout(() => section.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); return () => clearTimeout(timer); } }, [command]);
  const findCards = useCallback(async (value: string) => {
    flight.current?.abort(); const c = new AbortController(); flight.current = c;
    setSearching(true); setChoices([]);
    setStatus("Checking the catalog for the exact card before researching listings…");
    try {
      const result = await api<{ cards: Card[]; total: number }>("catalog/search", { q: value, offset: 0 }, c.signal);
      if (c.signal.aborted) return;
      setChoices(result.cards.slice(0, 12));
      setStatus(result.cards.length ? "Choose the exact catalog card below. A listing search cannot establish its printing or identity." : "No exact catalog candidates found. Try a card name, set or collector number below.");
    } catch (e) { if (!c.signal.aborted) setStatus(e instanceof Error ? e.message : "The catalog could not be reached."); }
    finally { if (flight.current === c) { setSearching(false); flight.current = null; } }
  }, []);
  function research(chosen: Card, text: string, urls: string[], id: string) {
    setCard(chosen); setChoices([]); setCertificate(null); setPanelCommand(null); setSelectedOffer(null);
    setStatus("I’ll check Mercari, eBay and SNKRDUNK for this card. Source failures, seller grade claims and current asks remain separate.");
    setRequest({ id, query: cardResearchQuery(chosen, text), urls });
  }
  useEffect(() => {
    if (!command || handled.current === command.id) return;
    handled.current = command.id;
    if (command.card) { queryText.current = command.text; researchUrls.current = command.product_urls || []; research(command.card, command.text, command.product_urls || [], command.id); return; }
    if (command.kind === "psa") {
      setCertificate({ id: command.id, value: command.certificate_number || "", ...(selectedOffer ? { offerId: selectedOffer } : {}) });
      setStatus(selectedOffer ? "I’ll compare the PSA record with the server-held seller grade claim. The physical slab still needs inspection." : "I can look up the PSA record. Choose a marketplace offer to compare its seller grade claim.");
      return;
    }
    if (command.kind === "select" || command.kind === "handoff" || command.kind === "variant") {
      if (!card || !request) { setStatus("Choose an exact catalog card and research its offers first. Then use the exact seller listing’s Select button before asking for a quote."); return; }
      setPanelCommand(command); return;
    }
    if (command.kind === "research") {
      queryText.current = command.text; researchUrls.current = command.product_urls || [];
      const q = catalogQuery(command.text);
      setSearch(q);
      const normalized = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      if (card && (!q || normalized(card.name + card.collector_number).includes(normalized(q)))) {
        research(card, command.text, command.product_urls || [], command.id);
      } else {
        setCard(null); setRequest(null); setCertificate(null); setSelectedOffer(null);
        if (q) void findCards(q);
        else setStatus("Choose a card from the catalog or search below. I need its exact printing before researching the product URL.");
      }
    }
  }, [card, command, findCards, request, selectedOffer]);
  if (!command) return null;
  return <div ref={section} className={s.chatTranscript} aria-label="Agent listing and quote conversation">
    {recovery.pending&&<p role="status">Stopping and refreshing the current conversation…</p>}{recovery.failed&&<p role="alert">The current conversation could not be confirmed. <button type="button" onClick={()=>location.reload()}>Reload current conversation</button></p>}
    <section><strong>Current listing check</strong><p role="status">{status}</p>
      {!card && <form onSubmit={(e) => { e.preventDefault(); if (search.trim()) void findCards(search.trim()); }}>
        <label>Find the exact catalog card<input value={search} maxLength={240} disabled={searching}
          onChange={(e) => setSearch(e.target.value)} placeholder="Pikachu 173/165" /></label>
        <button disabled={searching || !search.trim()}>{searching ? "Checking catalog…" : "Find card"}</button>
      </form>}
      <div className={s.cardChoices}>{choices.map((candidate) => <button key={candidate.card_id} disabled={searching}
        onClick={() => research(candidate, queryText.current, researchUrls.current, crypto.randomUUID())}>
        {candidate.name}<small>{candidate.language === "ja" ? "Japanese" : "English"} · {candidate.set_code} · {candidate.collector_number} · {candidate.card_id}</small>
      </button>)}</div>
      {card && <div className={s.context}><p><strong>Selected catalog card:</strong> {card.name}<br />{card.language === "ja" ? "Japanese" : "English"} · {card.set_code} · {card.collector_number}</p>
        <button disabled={searching||panelBusy||psaBusy||recovery.blocked} onClick={() => { setCard(null); setRequest(null); setSelectedOffer(null); setCertificate(null); setStatus("Choose a different exact card from the catalog."); }}>Change card</button></div>}
      {certificate && <PsaCertificate transport={transport} key={certificate.id} initialCertificate={certificate.value} offerId={certificate.offerId} autoStart onStop={()=>void recovery.recover(()=>{setCertificate(null);setSelectedOffer(null);})} onBusyChange={setPsaBusy} />}
      {card && request && <CommercePanel key={request.id} cardId={card.card_id} cardName={card.name}
        transport={transport} initialQuery={request.query} initialUrls={request.urls} autoStart inChat chatCommand={panelCommand}
        onBusyChange={setPanelBusy} onSelectedOffer={setSelectedOffer} />}
      <p className={s.note}>Use Select listing or Select for review on the exact seller listing. Offer numbers in chat open the comparison for that explicit choice. You can then ask “quote to Hong Kong”, “choose variant 2”, or “PSA cert 12345678”. Live listing steps stay in this tab and must be refreshed after reopening. No order or payment is created.</p>
    </section>
  </div>;
}
