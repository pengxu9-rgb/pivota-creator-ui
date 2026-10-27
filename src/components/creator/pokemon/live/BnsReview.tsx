"use client";
import {useState} from "react";
import type {Handoff} from "@/lib/pokemon/commerceTypes";
import s from "./BnsReview.module.css";
const {handoffView}=require("@/lib/pokemon/bnsChatState.cjs");
const {money}=require("@/lib/pokemon/mobileAgent.cjs");
const amount=(m?:{currency:string;subunit_amount:number}|null)=>m?`${money(m.subunit_amount,m.currency)} ${m.currency}`:"Not reported";
const when=(v:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
const fees:Record<string,string>={items:"Item",local_shipping:"Local shipping",international_shipping:"International shipping",duties:"Duties",bns_service_fee:"Buy&Ship service fee"};
export default function BnsReview({receipt,selectionExpiresAt,clock=Date.now(),variantKey="",variantExpired=false,onChooseVariant,onContinue,onRefresh,pending=false,allowManual=false,country="HK"}:{receipt:Handoff;selectionExpiresAt?:string;clock?:number;variantKey?:string;variantExpired?:boolean;onChooseVariant?:(index:number)=>void;onContinue?:()=>void;onRefresh?:()=>void;pending?:boolean;allowManual?:boolean;country?:string}){
  const [copied,setCopied]=useState(false),view=handoffView(receipt,clock,selectionExpiresAt),provider=receipt.provider_result,quote=receipt.quote;
  async function copy(){try{await navigator.clipboard.writeText(receipt.product_url);setCopied(true);}catch{setCopied(false);}}
  return <section className={s.review} aria-label="Forwarder review" data-review-state={view.kind}>
    {receipt.mode==="synthetic_fixture"&&<p className={s.notice}><strong>Offline example.</strong> Sample data, no marketplace or provider contacted.</p>}
    <span className={s.eyebrow}>2 · DELIVERED QUOTE REVIEW · NO ORDER OR PAYMENT</span><h3>{view.title}</h3><p role="status">{view.message}</p>
    {view.kind==="variant"&&<div className={s.variants}>
      <p>These are options within the selected seller listing. They do not resolve an ambiguous catalog printing.</p>
      {provider?.details.variants?.map((v,i)=><label key={v.variant_key} className={s.variant}><input type="radio" name="bns-option" checked={variantKey===v.variant_key} disabled={pending||variantExpired||v.availability!=="in_stock"} onChange={()=>onChooseVariant?.(i)}/><span><strong>Option {i+1}</strong><span>{Object.entries(v.options).map(([k,value])=>`${k}: ${value}`).join(" · ")||"No option label supplied"}</span><small>{v.availability==="in_stock"?"Provider reports in stock":v.availability==="out_of_stock"?"Out of stock":"Stock unknown"}</small><b>{amount(v.price)}</b></span></label>)}
      {variantExpired?<p className={s.notice}>These choices expired. Recheck the listing before choosing again.</p>:<p>Choosing an option does not request a quote. Continue explicitly to check its current price and stock.</p>}
      <button type="button" disabled={pending||!variantKey||variantExpired} onClick={onContinue}>{pending?"Checking…":"Check quote for this option"}</button>
      {variantExpired&&onRefresh&&<button type="button" disabled={pending} onClick={onRefresh}>Research and choose again</button>}
    </div>}
    {provider&&<div className={s.hints}>
      {provider.reason_codes.length>0&&<p>{provider.reason_codes.map(r=>r.replaceAll("_"," ").toLowerCase()).join(" · ")}</p>}
      {provider.details.supported_currencies&&<p>Supported account currencies: {provider.details.supported_currencies.join(", ")}</p>}
      {provider.details.field_errors?.map(e=><p key={e.field}>{e.message}</p>)}
      {view.canRetry&&<button type="button" disabled={pending} onClick={onContinue}>Retry quote check</button>}
    </div>}
    {view.kind==="quote"&&quote&&<div className={s.quote}>
      <h4>Item prices before delivery and fees</h4><dl><div><dt>Marketplace asking price</dt><dd>{amount(quote.listing?.ask)}</dd></div><div><dt>BNS-resolved item ask</dt><dd>{amount(quote.buyship.resolve_price)}</dd></div></dl>
      {quote.buyship.resolve_price_differs_from_observation&&<p className={s.notice}>The provider-resolved item ask changed from the source observation. Review both amounts.</p>}
      {quote.listing?.ask&&quote.buyship.resolve_price&&quote.listing.ask.currency!==quote.buyship.resolve_price.currency&&<p className={s.notice}>The currencies differ. These amounts are not a savings comparison.</p>}
      {!!Object.keys(quote.buyship.variant_options||{}).length&&<p>Quoted option: {Object.entries(quote.buyship.variant_options||{}).map(([k,v])=>`${k}: ${v}`).join(" · ")}</p>}
      {quote.buyship.destination&&<p>Destination: {quote.buyship.destination.country}{quote.buyship.destination.state?` · ${quote.buyship.destination.state}`:""} · quantity one</p>}
      <p>Unit price in account currency: <strong>{amount(quote.buyship.unit_price)}</strong></p>
      <h4>Delivered-cost preview</h4><dl>{Object.entries(quote.buyship.components).map(([name,m])=><div key={name}><dt>{fees[name]||name.replaceAll("_"," ")}</dt><dd>{amount(m)}</dd></div>)}<div className={s.total}><dt>Total</dt><dd>{amount(quote.buyship.grand_total)}</dd></div></dl>
      <p>Quoted {when(quote.buyship.quoted_at)}<br/>Expires {when(quote.buyship.expires_at)}{selectionExpiresAt&&Date.parse(selectionExpiresAt)<Date.parse(quote.buyship.expires_at)?<><br/>Recheck selection by {when(selectionExpiresAt)}</>:null}</p><small>Quote {quote.buyship.quote_id}</small>
      <p className={s.notice}>This quote binds the selected URL, provider option, quantity and destination. It does not independently confirm the seller&apos;s identity. Card identity, seller grade, certificate and physical authenticity remain unverified.</p>
    </div>}
    {view.kind==="expired"&&onRefresh&&<button type="button" disabled={pending} onClick={onRefresh}>Research and choose again</button>}
    <details className={s.link}><summary>Selected listing URL</summary><input aria-label="Selected product URL" readOnly value={receipt.product_url}/><button type="button" onClick={()=>void copy()}>{copied?"Link copied":"Copy listing URL"}</button></details>
    {view.kind==="manual"&&<p>No current delivered-cost quote is available. Stock, destination support and product eligibility are not established by this URL handoff.</p>}
    {view.kind==="manual"&&allowManual&&country==="HK"&&receipt.forwarder.id==="buyship"&&<p>Copy this listing URL, open the Buy&Ship request form and paste it there. Opening the form does not submit a request or confirm a price.</p>}
    {view.kind==="manual"&&allowManual&&country==="HK"&&receipt.forwarder.id==="buyship"&&<a className={s.manualEntry} href="https://www.buyandship.today/account/v2020/buyforyou/new/" target="_blank" rel="noopener noreferrer">Open Buy&Ship request entry ↗</a>}
    <p className={s.limit}>Orders and payments are disabled. A refusal or unavailable response is not provider acceptance.</p>
  </section>;
}
