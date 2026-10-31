"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {pokemonApi as api} from "../../pokemonClient";
import useCommerceFlow from "../live/useCommerceFlow";
import useConversationCommerce from "../live/useConversationCommerce";
import type {Offer} from "@/lib/pokemon/commerceTypes";
import type {Card,Conversation,ConversationSummary,Bookmark,CollectorAction} from "@/lib/pokemon/types";
const shared=require("@/lib/pokemon/mobileAgent.cjs");
const {changeBookmark}=require("@/lib/pokemon/bookmarkChange.cjs");
const {preferencePatch}=require("@/lib/pokemon/bnsChatState.cjs");
const ROOT="/creator/pokemon-collector/shopper";
type Sheet="offers"|"compare"|"preferences"|"saved"|"history"|"handoff"|"psa"|null;
export type CatalogDraft={text:string;cards:Card[];product_urls:string[];grade:string};
export default function useMobileAgent({browsingBeta=false}:{browsingBeta?:boolean}={}){
  const router=useRouter(),params=useSearchParams(),desired=params.get("conversation");
  const [psaPending,setPsaPending]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(""),[thread,setThread]=useState<Conversation|null>(null),
    [history,setHistory]=useState<ConversationSummary[]>([]),[bookmarks,setBookmarks]=useState<Bookmark[]>([]),[bookmarkUnverified,setBookmarkUnverified]=useState(false),
    [draft,setDraft]=useState<CatalogDraft|null>(null),[card,setCard]=useState<Card|null>(null),[sheet,setSheet]=useState<Sheet>(null),[certificate,setCertificate]=useState(""),[certificateOfferId,setCertificateOfferId]=useState(""),
    [budget,setBudget]=useState<number|null>(null),[budgetCurrency,setBudgetCurrency]=useState<string|null>(null),[gradePreference,setGradePreference]=useState(""),[compareIds,setCompareIds]=useState<string[]>([]);
  const generation=useRef(0),refreshRead=useRef(0),flight=useRef<AbortController|null>(null),running=useRef(false),loaded=useRef<string|null>(null),nativeGrade=useRef(""),researchUrlContext=useRef<{cardId:string;urls:string[]}|null>(null),threadRef=useRef(thread);threadRef.current=thread;
  const transport=useConversationCommerce(thread,adopt,()=>setReady(false));
  const flow=useCommerceFlow({transport,canStart:()=>canAct()});
  function hydrate(value:Conversation,syncGrade=false){
    const grade=shared.nativePsaGrade(value.workspace?.result?.preferences);
    // Empty conversation adoption during the first research must preserve its explicit grade.
    if(syncGrade||grade!==nativeGrade.current)flow.setGrade(grade);nativeGrade.current=grade;
    const p=value.workspace?.result?.preferences;if(!p){setBudget(null);setBudgetCurrency(null);setGradePreference("");flow.setCountry("HK");flow.setRegion("");return;}
    const stored=shared.savedBudget(p);setBudget(stored.budget);setBudgetCurrency(stored.currency);setGradePreference(p.grade_company&&p.grade_value?`${p.grade_company} ${p.grade_value}`:"");
    if(p.destination)flow.setCountry(p.destination);
  }
  function adopt(value:Conversation,syncGrade=false){
    const old=threadRef.current;threadRef.current=value;setThread(value);loaded.current=value.id;
    if(syncGrade||old?.id!==value.id||old?.workspace?.version!==value.workspace?.version)hydrate(value,syncGrade);
    setHistory(prev=>[{id:value.id,title:value.title,updatedAt:value.updatedAt,expiresAt:value.expiresAt},...prev.filter(h=>h.id!==value.id)].sort((a,b)=>b.updatedAt-a.updatedAt));
    // The reply is already loaded. Updating its address must not request a new
    // server-rendered page (private proxies do not relay Next's Flight headers).
    // Next's native-history wrapper keeps useSearchParams in sync without a fetch.
    if(desired!==value.id&&typeof window!=="undefined")window.history.replaceState(null,"",ROOT+"?conversation="+encodeURIComponent(value.id));
  }
  function clearCurrent(){flow.reset();researchUrlContext.current=null;setCard(null);setDraft(null);setCertificate("");setCertificateOfferId("");setSheet(null);setCompareIds([]);}
  useEffect(()=>{
    if(desired&&loaded.current===desired)return;
    const c=new AbortController(),mine=++generation.current;flight.current?.abort();flight.current=c;running.current=true;
    setReady(false);setPending("");setError("");setThread(null);threadRef.current=null;clearCurrent();nativeGrade.current="";flow.setGrade("");
    void(async()=>{
      try{
        const boot=await api<{synthetic_demo?:boolean}>("bootstrap",{},c.signal);if(boot.synthetic_demo)throw Error("This route requires a connected catalog session.");
        const [saved,chats,current]=await Promise.all([api<Bookmark[]>("bookmark-list",{},c.signal),api<ConversationSummary[]>("chat-list",{},c.signal),desired?api<Conversation>("chat-get",{id:desired},c.signal):Promise.resolve(null)]);
        if(mine!==generation.current||c.signal.aborted)return;
        setBookmarks(saved);setBookmarkUnverified(false);setHistory(chats);setThread(current);threadRef.current=current;loaded.current=current?.id||null;if(current)hydrate(current,true);else{setBudget(null);setBudgetCurrency(null);setGradePreference("");flow.setCountry("HK");flow.setRegion("");}setReady(true);
      }catch(e){if(mine===generation.current&&!c.signal.aborted)setError(e instanceof Error?e.message:"This session is unavailable.");}
      finally{if(mine===generation.current)running.current=false;}
    // A self-authored URL update may arrive after the next turn has started.
    // Cancel this bootstrap only; actual navigation aborts the current turn at
    // the start of this effect, and unmount has its own global cancellation.
    })();return()=>{c.abort();};
  // Adopting an already-loaded conversation keeps the current check mounted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[desired]);
  useEffect(()=>()=>{generation.current++;flight.current?.abort();},[]);
  useEffect(()=>{setCertificate("");setCertificateOfferId("");if(sheet==="psa")setSheet(null);},[flow.bindingKey]); // eslint-disable-line react-hooks/exhaustive-deps
  function canAct(){return shared.mutationReady({ready,pending:running.current||flow.running.current||psaPending,conversationBusy:threadRef.current?.busy,bookmarkUnverified});}
  async function task(kind:string,work:(signal:AbortSignal,current:()=>boolean)=>Promise<void>){
    if(!canAct())return;
    running.current=true;const c=new AbortController(),mine=++generation.current;flight.current=c;setPending(kind);setError("");
    const current=()=>mine===generation.current&&!c.signal.aborted;
    try{await work(c.signal,current);}catch(e){if(current())setError(e instanceof Error?e.message:"This request could not finish.");}
    finally{if(mine===generation.current){running.current=false;setPending("");}}
  }
  async function refreshConversation(){
    if(running.current)return;
    const active=threadRef.current,mine=generation.current;if(!active){setError("Open a conversation or start a new chat.");return;}
    // Recovery reads can finish out of order; only the latest may update readiness.
    const read=++refreshRead.current,current=()=>mine===generation.current&&threadRef.current?.id===active.id&&read===refreshRead.current;
    setPending("history");setError("");
    try{const value=await api<Conversation>("chat-get",{id:active.id});if(current()){adopt(value);setReady(!value.busy);if(value.busy)setError("The previous check is still settling. Refresh this conversation before continuing.");else flow.clearStoppedError();}}
    catch(e){if(current()){setReady(false);setError(e instanceof Error?e.message:"Reload the private session.");}}
    finally{if(current())setPending("");}
  }
  async function stop(){
    const active=threadRef.current,mine=++generation.current;flight.current?.abort();running.current=true;setPending("stopping");flow.stop();setReady(false);
    const current=()=>mine===generation.current&&threadRef.current?.id===active?.id;
    try{
      if(active){try{await api("chat-cancel",{id:active.id});}catch{/* A current read settles the result; provider work is never repeated. */}
        const value=await api<Conversation>("chat-get",{id:active.id});if(current()){adopt(value);if(value.busy)throw Error("The previous check is still settling. Refresh this conversation before continuing.");flow.clearStoppedError();setError("");setReady(true);}
      }else if(current()){flow.clearStoppedError();setError("");setReady(true);}
    }catch(e){if(current())setError(e instanceof Error?e.message:"Refresh this conversation before continuing.");}
    finally{if(current()){running.current=false;setPending("");}}
  }
  async function agentTurn(text:string){
    clearCurrent();
    await task("agent",async(signal,current)=>{
      let active=threadRef.current;
      try{if(!active)active=await api<Conversation>("chat-create",{},signal);const reply=await api<Conversation>("chat-send",{id:active.id,version:active.version,text},signal);if(current())adopt(reply,true);}
      catch(e){if(active&&current()){try{const latest=await api<Conversation>("chat-get",{id:active.id},signal);if(current())adopt(latest);}catch{if(current())setReady(false);}}throw e;}
    });
  }
  async function catalogAction(action:CollectorAction){
    const active=threadRef.current;if(!canAct()||!active?.workspace)return;
    clearCurrent();
    await task("agent",async(signal,current)=>{try{const value=await api<Conversation>("chat-action",{id:active.id,version:active.version,action},signal);if(current())adopt(value,true);}catch(e){try{const latest=await api<Conversation>("chat-get",{id:active.id},signal);if(current())adopt(latest,true);}catch{if(current())setReady(false);}throw e;}});
  }
  async function findCatalog(text:string,urls:string[]=[]){
    if(!canAct())return;clearCurrent();const q=shared.catalogQuery(text.normalize("NFKC"));
    if(!q){setError("Name the catalog printing before checking a product URL.");return;}
    const grade=shared.requestedResearchGrade(text,threadRef.current?.workspace?.result?.preferences);flow.setGrade(grade);
    await task("catalog",async(signal,current)=>{const result=await api<{cards:Card[]}>("catalog/search",{q,offset:0},signal);if(current())setDraft({text,cards:result.cards.slice(0,12),product_urls:urls,grade});});
  }
  async function researchCard(value:Card,urls?:string[]){
    if(browsingBeta){setSheet("offers");return;}
    if(!canAct())return;
    const productUrls=shared.urlsForResearch({cardId:value.card_id,explicit:urls,draft,active:researchUrlContext.current});
    researchUrlContext.current={cardId:value.card_id,urls:productUrls};
    const grade=shared.gradeForResearch({cardId:value.card_id,draft,currentCardId:card?.card_id,researchCardId:flow.research?.card_id,currentGrade:flow.grade,preferences:threadRef.current?.workspace?.result?.preferences});
    flow.setGrade(grade);setDraft(null);setCard(value);setCertificate("");setSheet("compare");setError("");
    await flow.researchOffers({card_id:value.card_id,query:shared.cardResearchQuery(value,grade?`PSA ${grade}`:""),platforms:["mercari","snkrdunk","ebay"],...(productUrls.length?{product_urls:productUrls}:{})});
  }
  async function historicalResearch(id:string){
    let value:Card|undefined;
    await task("catalog",async(signal,current)=>{const d=await api<{card:Card}>("catalog/card",{card_id:id},signal);if(current())value=d.card;});
    if(value)await researchCard(value,[]);
  }
  function openCertificate(offer:Offer){setCertificateOfferId(offer.offer_id);setCertificate(offer.certificate?.number_claim||offer.certificate_number_claim||"");setSheet("psa");}
  async function prepareHandoff(){setError("");await flow.prepareHandoff();}
  useEffect(()=>{if(flow.receipt)setSheet(current=>current==="compare"||current==="handoff"?"handoff":current);},[flow.receipt]);
  async function send(text:string){
    const value=text.trim();if(!value||!canAct())return;
    const intent=shared.commerceIntent(value);
    if(!intent){await agentTurn(value);return;}
    if(browsingBeta){setSheet("offers");return;}
    if(intent.kind==="research"){
      if(/^(?:refresh|refresh offers|check again)[.!]?$/i.test(value)&&card)await researchCard(card);else await findCatalog(value,intent.product_urls||[]);
    }else if(intent.kind==="select"){
      // Visible board filters and sorting are local presentation state. Never
      // interpret a numeric chat choice against a different source-order array.
      setSheet("compare");flow.setError("Choose the listing’s Select button in the current comparison so the exact seller URL is clear.");
    }else if(intent.kind==="variant"){setSheet("handoff");flow.pickVariant(intent.index);}
    else if(intent.kind==="handoff"){
      if(intent.country&&intent.country!==flow.country||intent.state&&intent.state!==flow.region){if(intent.country)flow.setCountry(intent.country);if(intent.state)flow.setRegion(intent.state);setSheet("compare");flow.setError("Destination updated. Review the selected listing and continue explicitly.");return;}
      await prepareHandoff();
    }else if(intent.kind==="psa"){setCertificate(intent.certificate_number||"");setSheet("psa");}
  }
  async function saveCard(value:Card,messageId?:string){
    const existing=bookmarks.find(b=>b.card.card_id===value.card_id);
    await task("save",async(signal,current)=>{
      let active=threadRef.current,sourceMessage=messageId;
      if(!existing&&!sourceMessage){if(!active)active=await api<Conversation>("chat-create",{},signal);active=await api<Conversation>("chat-send",{id:active.id,version:active.version,text:"Inspect catalog record "+value.card_id},signal);sourceMessage=[...active.messages].reverse().find(m=>m.status==="accepted"&&m.cards?.some(c=>c.card_id===value.card_id))?.id;}
      if(!existing&&(!active||!sourceMessage))throw Error("The catalog agent could not confirm this record for saving.");
      const result=await changeBookmark({api,cardId:value.card_id,existingId:existing?.id,signal,payload:existing?{id:existing.id}:{conversation_id:active!.id,message_id:sourceMessage,card_id:value.card_id}});
      if(!current())return;if(result.bookmarks)setBookmarks(result.bookmarks);setBookmarkUnverified(result.unverified);
      if(active){const latest=await api<Conversation>("chat-get",{id:active.id},signal);if(current())adopt(latest);}if(result.error)throw result.error;
    });
  }
  async function updatePreferences(nextBudget:number,currency:string,grade:string,country:string,region:string){
    if(!canAct())return;
    if(!threadRef.current?.workspace){setError("Ask a collecting question before sending preferences to the catalog agent.");return;}
    await catalogAction({type:"preferences",preferences:preferencePatch(nextBudget,currency,grade,country)});flow.setRegion(region);
  }
  function newChat(){if(running.current||flow.running.current||psaPending)return;if(desired){running.current=true;setReady(false);}generation.current++;flight.current?.abort();loaded.current=null;setThread(null);threadRef.current=null;clearCurrent();nativeGrade.current="";flow.setGrade("");setBudget(null);setBudgetCurrency(null);setGradePreference("");flow.setCountry("HK");flow.setRegion("");setError("");router.replace(ROOT,{scroll:false});}
  function resume(id:string){if(running.current||flow.running.current||psaPending)return;setSheet(null);if(id!==thread?.id)router.replace(ROOT+"?conversation="+encodeURIComponent(id),{scroll:false});}
  function toggleCompare(id:string){if(!canAct())return;setCompareIds(prev=>prev.includes(id)?prev.filter(v=>v!==id):prev.length<2?[...prev,id]:[prev[1],id]);}
  const messages=thread?.messages||[],cards=[...new Map([...messages.flatMap(m=>m.cards||[]),...(draft?.cards||[]),...bookmarks.map(b=>b.card),...(card?[card]:[])].map(c=>[c.card_id,c])).values()].slice(0,100),
    latestCatalogMessage=shared.latestCatalogMessage(messages) as Conversation["messages"][number]|undefined,feedback=thread?.workspace?.collecting_feedback||{};
  const restoringConversation=!ready&&!!desired&&!thread;
  return {ready,restoringConversation,error:error||flow.error,pending:pending||flow.pending||(psaPending?"psa":""),thread,history,bookmarks,bookmarkUnverified,messages,cards,draft,card,sheet,certificate,certificateOfferId,openCertificate,budget,budgetCurrency,gradePreference,compareIds,feedback,latestCatalogMessage,flow,
    transport,setPsaPending,setSheet,setError,setCertificate,send,researchCard,historicalResearch,prepareHandoff,saveCard,updatePreferences,newChat,resume,toggleCompare,catalogAction,refreshConversation,stop};
}
