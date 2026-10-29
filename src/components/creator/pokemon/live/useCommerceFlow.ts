"use client";
import {useEffect,useRef,useState} from "react";
import {pokemonApi} from "../../pokemonClient";
import type {CommerceTransport,Research,Selection,Handoff,Offer,VariantChoice} from "@/lib/pokemon/commerceTypes";
import type {PsaVerification} from "./PsaCertificate";
const {validateCommerceResponse}=require("@/lib/pokemon/commerceContract.cjs");
const {sourceReadAllowed}=require("@/lib/pokemon/sourceReadiness.cjs");
const {visibleOffers}=require("@/lib/pokemon/mobileAgent.cjs");
const {canSelectForTarget,certificateBlocksSelection}=require("@/lib/pokemon/offerEvidence.cjs");
const {variantScope,chooseVariant,variantKeyFor}=require("@/lib/pokemon/bnsVariantChoice.cjs");
const {selectionMatches,handoffMatches}=require("@/lib/pokemon/bnsChatState.cjs");
const STOPPED_ERROR="The check was stopped. Refresh before continuing.";
export default function useCommerceFlow({transport=pokemonApi,canStart=()=>true}:{transport?:CommerceTransport;canStart?:()=>boolean}={}) {
  const config=useRef({transport,canStart});config.current={transport,canStart};
  const [research,setResearch]=useState<Research|null>(null),[selection,setSelection]=useState<Selection|null>(null),[receipt,setReceipt]=useState<Handoff|null>(null),
    [selectedOfferId,setSelectedOfferId]=useState(""),[grade,setGradeState]=useState(""),[currency,setCurrencyState]=useState("JPY"),
    [country,setCountryState]=useState("HK"),[region,setRegionState]=useState(""),[forwarder,setForwarderState]=useState(""),
    [variantChoice,setVariantChoice]=useState<VariantChoice|null>(null),[pending,setPending]=useState(""),[error,setError]=useState(""),[clock,setClock]=useState(Date.now()),[receivedAt,setReceivedAt]=useState(0),[certificateResults,setCertificateResults]=useState<Record<string,PsaVerification>>({});
  const flight=useRef<AbortController|null>(null),generation=useRef(0),running=useRef(false);
  const rows:Offer[]=visibleOffers(research?.offers||[],grade,currency),chosen=rows.find(o=>o.offer_id===selectedOfferId),
    selectionExpired=!!selection&&Date.parse(selection.expires_at)<=clock,
    scope=variantScope(selection?.selection_id||"",forwarder,country,region),
    variantExpired=!!receipt?.provider_result?.details.variants?.length&&receivedAt+300000<=clock,
    variantKey:string=variantExpired?"":variantKeyFor(receipt?.provider_result,variantChoice,scope)||"";
  useEffect(()=>()=>{generation.current++;flight.current?.abort();},[]);
  useEffect(()=>{
    const deadlines=[...(research?.offers.map(o=>o.fresh_until?Date.parse(o.fresh_until):0)||[]),...Object.values(certificateResults).map(r=>r.expires_at?Date.parse(r.expires_at):0),selection?Date.parse(selection.expires_at):0,receipt?.quote?Date.parse(receipt.quote.buyship.expires_at):0,receipt?.provider_result?.details.variants?.length?receivedAt+300000:0].filter(t=>t>Date.now());
    if(!deadlines.length)return;
    const timer=setTimeout(()=>setClock(Date.now()),Math.max(1,Math.min(...deadlines)-Date.now()+5));return()=>clearTimeout(timer);
  },[selection,receipt,receivedAt,clock,research,certificateResults]);
  function invalidateSelection(){setSelection(null);setReceipt(null);setVariantChoice(null);setReceivedAt(0);setError("");}
  function reset(){generation.current++;flight.current?.abort();running.current=false;setPending("");setResearch(null);setCertificateResults({});setSelectedOfferId("");invalidateSelection();}
  function stop(){generation.current++;flight.current?.abort();running.current=false;setPending("");invalidateSelection();setError(STOPPED_ERROR);}
  function clearStoppedError(){setError(current=>current===STOPPED_ERROR?"":current);}
  function contextChanged(){generation.current++;flight.current?.abort();running.current=false;setPending("");invalidateSelection();}
  function setGrade(value:string){if(value!==grade){contextChanged();setGradeState(value);setSelectedOfferId("");}}
  function setCurrency(value:string){if(value!==currency){contextChanged();setCurrencyState(value);setSelectedOfferId("");}}
  function setCountry(value:string){if(value!==country){contextChanged();setCountryState(value);setRegionState("");}}
  function setRegion(value:string){if(value!==region){contextChanged();setRegionState(value);}}
  function setForwarder(value:string){if(value!==forwarder){contextChanged();setForwarderState(value);}}
  function chooseOffer(id:string){if(running.current)return;const offer=rows.find(o=>o.offer_id===id);if(!offer||!research||!sourceReadAllowed(research,offer.source)||!canSelectForTarget(offer,research.card_id,Date.now(),certificateResults[id]))return;setSelectedOfferId(id);if(id!==selectedOfferId)invalidateSelection();}
  async function task(kind:string,work:(signal:AbortSignal,current:()=>boolean)=>Promise<void>){
    if(running.current||!config.current.canStart())return;
    running.current=true;const c=new AbortController(),mine=++generation.current;flight.current=c;setPending(kind);setError("");
    const current=()=>mine===generation.current&&!c.signal.aborted;
    try{await work(c.signal,current);}catch(e){if(current()){invalidateSelection();setError(e instanceof Error?e.message:"This check could not finish. Refresh before continuing.");}}
    finally{if(mine===generation.current){running.current=false;setPending("");setClock(Date.now());}}
  }
  async function researchOffers(payload:{card_id:string;query:string;platforms:string[];product_urls?:string[]}){
    if(running.current||!config.current.canStart())return;
    setResearch(null);setCertificateResults({});setSelectedOfferId("");invalidateSelection();
    await task("research",async(signal,current)=>{
      const result=await config.current.transport<Research>("commerce/research",payload,signal);validateCommerceResponse("research",result);
      if(result.card_id!==payload.card_id)throw Error("The research did not match this catalog printing.");
      if(!current())return;setResearch(result);setForwarderState(result.forwarders.find(p=>p.id==="buyship"&&(p.quote_available||p.manual_handoff_available))?.id||result.forwarders.find(p=>p.quote_available||p.manual_handoff_available)?.id||"");
      const currencies=[...new Set(result.offers.map(o=>o.currency||"unreported"))];if(!currencies.includes(currency))setCurrencyState(currencies[0]||"JPY");
    });
  }
  async function selectOffer(id=selectedOfferId){
    if(running.current||!config.current.canStart())return;
    const offer=rows.find(o=>o.offer_id===id);if(!research||!offer){setError("Choose an exact listing from the current comparison.");return;}
    if(!sourceReadAllowed(research,offer.source)){invalidateSelection();setError("This source is not active. Captured offers remain visible, but selection and BNS checks need approved source access.");return;}
    if(!canSelectForTarget(offer,research.card_id,Date.now(),certificateResults[id])){setError("This observation is sold, unavailable, expired or needs review. It cannot be selected.");return;}
    setSelectedOfferId(id);invalidateSelection();
    await task("select",async(signal,current)=>{
      const value=await config.current.transport<Selection>("commerce/select",{card_id:research.card_id,offer_id:offer.offer_id,expected_observed_at:offer.observed_at,expected_price_minor:offer.price_minor,currency:offer.currency},signal);
      validateCommerceResponse("select",value);if(!selectionMatches(value,offer))throw Error("The selected listing changed. Research it again.");if(current())setSelection(value);
    });
  }
  function pickVariant(index:number){
    if(pending||selectionExpired||variantExpired)return;
    const next=chooseVariant(receipt?.provider_result,index,scope);
    if(!next){setError("Choose a current in-stock option from the provider response.");return;}
    setVariantChoice(next);setError("");
  }
  async function prepareHandoff(){
    if(running.current||!config.current.canStart())return;
    if(!research||!chosen){setError("Choose an exact listing before continuing.");return;}
    if(!sourceReadAllowed(research,chosen.source)){invalidateSelection();setError("This source is not active. Recheck its access before selecting or requesting a BNS quote.");return;}
    if(!canSelectForTarget(chosen,research.card_id,Date.now(),certificateResults[chosen.offer_id])){invalidateSelection();setError("This listing needs fresh, available evidence without a grading or certificate conflict before handoff.");return;}
    const path=research.forwarders.find(p=>p.id===forwarder);
    if(!path||!path.quote_available&&!path.manual_handoff_available){setError("Choose a buying path available for this check.");return;}
    if(country==="US"&&!/^[A-Z]{2}$/.test(region)){setError("Add a two-letter US state before continuing.");return;}
    if(selectionExpired){setError("This selection expired. Refresh the research and choose the listing again.");return;}
    if(variantExpired){invalidateSelection();setError("The listing options expired. Choose the listing again before requesting another preview.");return;}
    if(receipt?.provider_result?.details.variants?.length&&!variantKey){setError("Choose an in-stock listing option before requesting another preview.");return;}
    const retained=selectionMatches(selection,chosen)?selection:null,key=variantKey;setReceipt(null);setVariantChoice(null);setReceivedAt(0);
    await task("handoff",async(signal,current)=>{
      let selected=retained;
      if(!selected){
        selected=await config.current.transport<Selection>("commerce/select",{card_id:research.card_id,offer_id:chosen.offer_id,expected_observed_at:chosen.observed_at,expected_price_minor:chosen.price_minor,currency:chosen.currency},signal);
        validateCommerceResponse("select",selected);if(!selectionMatches(selected,chosen))throw Error("The listing evidence changed. Research it again.");
        if(!current())return;setSelection(selected);
      }
      const result=await config.current.transport<Handoff>("commerce/handoff",{selection_id:selected.selection_id,forwarder,destination:{country,...(country==="US"?{state:region}:{})},...(key?{variant_key:key}:{})},signal);
      validateCommerceResponse("handoff",result);if((result.quote||result.provider_result?.status==="variant_selection_required")&&!path.quote_available)throw Error("This buying path did not offer a quote capability. Refresh before continuing.");if(!handoffMatches(result,chosen,research.card_id,forwarder,{country,...(country==="US"?{state:region}:{})},key,selected.expires_at))throw Error("The handoff did not match this listing and destination. Research and choose again.");
      if(current()){setReceipt(result);setReceivedAt(Date.now());}
    });
  }
  function recordCertificateResult(offerId:string,result:PsaVerification){
    const offer=research?.offers.find(o=>o.offer_id===offerId);if(!offer||offer.grade.company!=="PSA")return;
    const claim=offer.certificate?.number_claim||offer.certificate_number_claim;
    if(claim&&claim!==result.certificate_number)return;
    setCertificateResults(previous=>({...previous,[offerId]:result}));
    if(certificateBlocksSelection(result)&&selectedOfferId===offerId){setSelectedOfferId("");invalidateSelection();}
  }
  const bindingKey=JSON.stringify([research?.card_id,selectedOfferId,selection?.selection_id,selectionExpired,country,region,forwarder,grade,currency]);
  return {research,selection,receipt,selectedOfferId,chosen,rows,grade,currency,country,region,forwarder,pending,error,clock,selectionExpired,variantExpired,variantKey,running,bindingKey,
    certificateResults,recordCertificateResult,setGrade,setCurrency,setCountry,setRegion,setForwarder,setError,chooseOffer,researchOffers,selectOffer,pickVariant,prepareHandoff,reset,stop,clearStoppedError,invalidateSelection};
}
