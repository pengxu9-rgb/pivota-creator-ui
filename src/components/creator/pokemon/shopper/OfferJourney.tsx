"use client";
import type {Research,Selection,Handoff} from "@/lib/pokemon/commerceTypes";
import s from "./OfferJourney.module.css";
const {sourceReadinessView,sourceReadAllowed}=require("@/lib/pokemon/sourceReadiness.cjs");
const {handoffView}=require("@/lib/pokemon/bnsChatState.cjs");
export default function OfferJourney({research,selection,receipt,browsingBeta=false,clock=Date.now()}:{research?:Research|null;selection?:Selection|null;receipt?:Handoff|null;browsingBeta?:boolean;clock?:number}){
  const readiness=sourceReadinessView(research,browsingBeta),expired=!!selection&&Date.parse(selection.expires_at)<=clock;
  const handoff=receipt?handoffView(receipt,clock,selection?.expires_at):null;
  const canCheck=readiness.live&&(!selection||sourceReadAllowed(research,selection.offer.source));
  const forwarders=research?.forwarders||[],quotes=forwarders.some(p=>p.quote_available),manual=forwarders.some(p=>p.manual_handoff_available);
  return <section className={s.journey} aria-label="Seller offer journey">
    <div className={s.status} role="status"><strong>{readiness.title}</strong><p>{readiness.message}</p></div>
    {readiness.sources.length>0&&<details className={s.sources}><summary>Source access and photo permissions</summary>{readiness.sources.map((source:any)=><div key={source.source}><strong>{source.label}<span>{source.status}</span></strong><small>{source.method} · {source.photos}</small><p>{source.message}</p></div>)}</details>}
    <ol className={s.steps}>
      <li><span>1</span><div><strong>Compare item prices</strong><p>{browsingBeta?"Seller offers need an approved source. Catalog artwork remains a reference.":"Compare the same printing, language, grade and currency. Keep each seller listing separate; shipping comes later."}</p></div></li>
      <li><span>2</span><div><strong>Recheck your exact listing</strong><p>{browsingBeta?"Seller price and availability checks are switched off here. Catalog cards are not current seller listings.":selection?(expired?"Selection expired. Research and choose the listing again.":"Listing selected. Continuing rechecks its price, availability and card evidence; a selection does not reserve stock."):"Choose a seller listing before requesting a fresh availability and price check."}</p></div></li>
      <li><span>3</span><div><strong>Review the BNS next step</strong><p>{browsingBeta?"BNS quote requests are off in this beta.":handoff?`${handoff.title}. Review the selected URL, option and destination.`:!canCheck?"A new BNS check needs active source access and a selected listing.":quotes?"A supported quote can be checked after your listing choice and destination. Choose any provider option explicitly.":manual?"A manual URL request is available. Opening BNS does not submit an order or confirm its price.":"BNS quoting and handoff are not enabled for this check."}</p></div></li>
    </ol>
    <p className={s.limit}>Orders and payments disabled. A quote or copied URL is not an order, a stock reservation or card authentication.</p>
  </section>;
}
