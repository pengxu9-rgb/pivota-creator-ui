"use client";
import {useEffect,useRef,useState} from "react";
import type {Offer,CommerceTransport} from "@/lib/pokemon/commerceTypes";
import useConversationRecovery from "./useConversationRecovery";
import useCommerceFlow from "./useCommerceFlow";
import BnsReview from "./BnsReview";
import OfferEvidenceBoard from "../shopper/OfferEvidenceBoard";
import PsaCertificate from "./PsaCertificate";
import s from "./CommercePanel.module.css";
const {money}=require("@/lib/pokemon/mobileAgent.cjs");
export type CommerceCommand={id:string;kind:string;index?:number;country?:string|null;state?:string|null;certificate_number?:string};
const when=(v:string)=>new Date(v).toLocaleString();
export default function CommercePanel({cardId,cardName,initialQuery,initialUrls=[],autoStart=false,chatCommand,onBusyChange,onSelectedOffer,inChat=false,transport}:{cardId:string;cardName:string;initialQuery?:string;initialUrls?:string[];autoStart?:boolean;chatCommand?:CommerceCommand|null;onBusyChange?:(busy:boolean)=>void;onSelectedOffer?:(id:string|null)=>void;inChat?:boolean;transport?:CommerceTransport}){
  const [query,setQuery]=useState(initialQuery||cardName),[urls,setUrls]=useState(initialUrls.join("\n")),[platforms,setPlatforms]=useState(["mercari","ebay","snkrdunk"]),[psaPending,setPsaPending]=useState(false),[hint,setHint]=useState(""),[psaOffer,setPsaOffer]=useState<Offer|null>(null);
  const recovery=useConversationRecovery(transport);
  const f=useCommerceFlow({transport,canStart:()=>!psaPending&&!recovery.isBlocked()}),first=useRef(true),handled=useRef("");
  useEffect(()=>{setPsaOffer(null);},[f.research]);
  const busy=!!f.pending||psaPending||recovery.blocked,currencies=[...new Set(f.research?.offers.map(o=>o.currency||"unreported")||[])];
  async function research(){await f.researchOffers({card_id:cardId,query,platforms,...(urls.trim()?{product_urls:urls.split(/\s+/).filter(Boolean)}:{})});}
  useEffect(()=>{if(first.current){first.current=false;if(autoStart)void research();}},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{onBusyChange?.(busy);return()=>onBusyChange?.(false);},[busy,onBusyChange]);
  useEffect(()=>{onSelectedOffer?.(f.selection?.offer.offer_id||null);},[f.selection,onSelectedOffer]);
  useEffect(()=>{
    if(!chatCommand||handled.current===chatCommand.id)return;handled.current=chatCommand.id;
    if(chatCommand.kind==="select"){const row=f.rows[chatCommand.index??-1];if(row)void f.selectOffer(row.offer_id);else f.setError("Choose an offer number from the current comparison.");}
    if(chatCommand.kind==="variant")f.pickVariant(chatCommand.index??-1);
    if(chatCommand.kind==="handoff"){
      if(chatCommand.country&&chatCommand.country!==f.country||chatCommand.state&&chatCommand.state!==f.region){if(chatCommand.country)f.setCountry(chatCommand.country);if(chatCommand.state)f.setRegion(chatCommand.state);setHint("Destination updated. Review it and continue explicitly.");}
      else void f.prepareHandoff();
    }
  },[chatCommand]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className={`${s.panel} ${inChat?s.chatPanel:""}`} aria-label="Current listing check">
    <div className={s.heading}><span className={s.step}>CURRENT CHECK</span><h2>Compare seller offers</h2><p>Catalog printing: <strong>{cardName}</strong>. Seller claims and physical identity still need verification.</p></div>
    <details open={!f.research}><summary>Listing request · {query}</summary><form onSubmit={e=>{e.preventDefault();void research();}}><label>Listing search<input value={query} maxLength={240} disabled={busy} onChange={e=>{setQuery(e.target.value);f.reset();}} required/></label><label>Optional product URLs<textarea value={urls} disabled={busy} onChange={e=>{setUrls(e.target.value);f.reset();}} placeholder="One Mercari, eBay or SNKRDUNK product URL per line"/></label><fieldset disabled={busy}><legend>Marketplaces</legend>{["mercari","ebay","snkrdunk"].map(v=><label className={s.check} key={v}><input type="checkbox" checked={platforms.includes(v)} onChange={()=>{setPlatforms(p=>p.includes(v)?p.filter(x=>x!==v):[...p,v]);f.reset();}}/>{v==="ebay"?"eBay":v==="mercari"?"Mercari":"SNKRDUNK"}</label>)}</fieldset><button disabled={busy||!platforms.length}>{f.pending==="research"?"Checking listings…":"Research current offers"}</button></form></details>
    {recovery.pending&&<p role="status">Stopping and refreshing the current conversation…</p>}{recovery.failed&&<div role="alert"><p>The current conversation could not be confirmed. Reload it before continuing.</p><button type="button" onClick={()=>location.reload()}>Reload current conversation</button></div>}{f.pending&&<button type="button" onClick={()=>void recovery.recover(f.stop)}>Stop current check</button>}{f.error&&<p className={s.error} role="alert">{f.error}</p>}{hint&&<p role="status">{hint}</p>}
    {f.research&&<><div className={s.coverage}>{f.research.platforms.map(p=><div key={p.source}><strong>{p.source}</strong><span>{p.status.replaceAll("_"," ")}</span><small>{p.message}</small></div>)}</div><p className={s.note}>Checked {when(f.research.checked_at)}. Asking prices are not completed sales or an investment valuation.</p>
      <div className={s.resultsHead}><label>Seller grade claim<select disabled={busy} value={f.grade} onChange={e=>f.setGrade(e.target.value)}><option value="">All conditions</option><option value="9">PSA 9 + flagged observations</option><option value="10">PSA 10 + flagged observations</option></select></label><label>Currency group<select disabled={busy} value={f.currency} onChange={e=>f.setCurrency(e.target.value)}>{currencies.map(v=><option key={v}>{v}</option>)}</select></label></div><p className={s.note}>Different grades and currencies stay separate. No offer is selected automatically.</p>
      {!f.rows.length&&<p>No listings match this view. Revise the search or paste a supported listing URL.</p>}
      <OfferEvidenceBoard research={f.research} offers={f.rows} cardId={cardId} selectedId={f.selectedOfferId} busy={busy} clock={f.clock} onSelect={id=>void f.selectOffer(id)} certificateResults={f.certificateResults} onCertificate={setPsaOffer}/>
      {psaOffer&&<PsaCertificate key={psaOffer.offer_id} offerId={psaOffer.offer_id} initialCertificate={psaOffer.certificate?.number_claim||psaOffer.certificate_number_claim||""} transport={transport} onBusyChange={setPsaPending} onResult={result=>f.recordCertificateResult(psaOffer.offer_id,result)}/>}
      {f.chosen&&<div className={s.handoff}><h3>Review buying path</h3><strong>{f.chosen.title}</strong><PsaCertificate key={f.bindingKey} offerId={f.selection?.offer.offer_id} transport={transport} onStop={()=>void recovery.recover(f.stop)} onBusyChange={setPsaPending} onResult={result=>{if(f.selection?.offer.offer_id)f.recordCertificateResult(f.selection.offer.offer_id,result);}}/><div className={s.resultsHead}><label>Buying path<select value={f.forwarder} disabled={busy} onChange={e=>f.setForwarder(e.target.value)}><option value="">Choose buying path</option>{f.research.forwarders.map(p=><option key={p.id} value={p.id} disabled={!p.quote_available&&!p.manual_handoff_available}>{p.label}{p.quote_available?" · quote available":p.manual_handoff_available?" · URL handoff":" · unavailable"}</option>)}</select></label><label>Destination<select value={f.country} disabled={busy} onChange={e=>f.setCountry(e.target.value)}>{[["HK","Hong Kong"],["US","United States"],["SG","Singapore"],["KR","South Korea"],["JP","Japan"],["GB","United Kingdom"]].map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label></div>{f.country==="US"&&<label>US state<input value={f.region} disabled={busy} maxLength={2} onChange={e=>f.setRegion(e.target.value.toUpperCase())}/></label>}
        {f.selectionExpired&&<p>Selection expired. Research and choose again before continuing.</p>}<button disabled={busy||f.selectionExpired||!f.forwarder} onClick={()=>void f.prepareHandoff()}>{f.pending==="handoff"?"Checking…":f.research.forwarders.find(p=>p.id===f.forwarder)?.quote_available?"Check delivered quote":"Prepare URL handoff"}</button>
        {f.receipt&&<BnsReview receipt={f.receipt} selectionExpiresAt={f.selection?.expires_at} clock={f.clock} variantKey={f.variantKey} variantExpired={f.variantExpired} onChooseVariant={f.pickVariant} onContinue={()=>void f.prepareHandoff()} onRefresh={()=>void research()} pending={busy} country={f.country} allowManual={!!f.research.forwarders.find(p=>p.id===f.forwarder)?.manual_handoff_available}/>}
      </div>}
    </>}
    <p className={s.note}>Orders and payments are disabled. Live checks must be refreshed after reopening.</p>
  </section>;
}
