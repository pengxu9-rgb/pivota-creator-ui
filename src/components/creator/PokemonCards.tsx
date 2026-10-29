"use client";
import { useEffect, useRef } from "react";
import type { Card,Comparison,Preferences } from "@/lib/pokemon/types";
import styles from "./PokemonCreatorAgent.module.css";
const {comparisonRecords,canChooseComparison}=require("@/lib/pokemon/comparisonRecords.cjs");

export function Source({label,value,url}:{label:string;value?:string;url?:string}){
  const safe=url&&/^https:\/\/(?:www\.pokemon-card\.com\/|github\.com\/tcgdex\/cards-database\/blob\/)/.test(url);
  return <p className={styles.source}>{label}: {value||"Not recorded"}{safe&&<> · <a href={url} target="_blank" rel="noopener noreferrer">Inspect source</a></>}</p>;
}
export function CardOption({card,reasons=[],saved,disabled,checked,onSave,onDetails,onCompare,onFeedback,onRemove}:{card:Card;reasons?:string[];saved:boolean;disabled:boolean;checked?:boolean;onSave?:()=>void;onDetails:()=>void;onCompare?:()=>void;onFeedback?:(reaction:"like"|"dismiss")=>void;onRemove?:()=>void}){
  return <article className={styles.card} data-card-id={card.card_id}>
    <p className={styles.eyebrow}>{card.language==="ja"?"Japanese":"English"} · {card.set_code} · {card.collector_number}</p>
    <h3>{card.name}</h3><p className={styles.muted}>{card.rarity||"Rarity not recorded"}</p>
    <p className={styles.credit}>{card.current_illustrators?.map(c=>c.value).join(", ")||"Illustrator not recorded"}</p>
    <p className={styles.reason}>{reasons[0]||"An exact catalog record to explore."}</p>
    <div className={styles.cardActions}>{onSave&&<button data-bookmark-card={card.card_id} aria-pressed={saved} disabled={disabled} onClick={onSave}>{saved?"Saved ✓":"Save card"}</button>}<button data-details-card={card.card_id} disabled={disabled} onClick={onDetails}>Details</button>{onCompare&&<button data-compare-card={card.card_id} aria-pressed={checked||false} disabled={disabled} onClick={onCompare}>{checked?"Comparing ✓":"Compare"}</button>}</div>
    {(onFeedback||onRemove)&&<div className={styles.secondaryActions}>{onFeedback&&<><button data-like-card={card.card_id} disabled={disabled} onClick={()=>onFeedback("like")}>Like</button><button data-dismiss-card={card.card_id} disabled={disabled} onClick={()=>onFeedback("dismiss")}>Dismiss</button></>}{onRemove&&<button data-remove-card={card.card_id} disabled={disabled} onClick={onRemove}>Remove</button>}</div>}
  </article>;
}
export function CardDetails({card,onClose,onSave,saved,onTarget,onReview,disabled,blockers=[],historical=false}:{card:Card;onClose:()=>void;onSave?:()=>void;saved:boolean;onTarget?:()=>void;onReview?:()=>void;disabled:boolean;blockers?:string[];historical?:boolean}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const prior=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>prior?.focus();},[]);
  return <dialog ref={ref} className={styles.drawer} aria-label="Card details" onCancel={e=>{e.preventDefault();onClose();}}>
    <div className={styles.drawerHead}><p className={styles.eyebrow}>{historical?"Saved or earlier snapshot":"Current catalog record"}</p><button autoFocus aria-label="Close details" onClick={onClose}>Close</button></div>
    <h2>{card.name}</h2><p className={styles.muted}>{card.card_id}</p><dl><dt>Release</dt><dd>{card.set_name||card.set_code}</dd><dt>Source date</dt><dd>{card.release_date||"Not recorded"}</dd><dt>Number</dt><dd>{card.collector_number}</dd><dt>Rarity</dt><dd>{card.rarity||"Not recorded"}</dd><dt>Illustrator</dt><dd>{card.current_illustrators?.map(c=>c.value).join(", ")||"Not recorded"}</dd></dl>
    {card.title_review&&<p className={styles.notice}>{card.title_review.explanation} Original title: {card.title_review.original_title}.</p>}
    {card.identity_review&&<p className={styles.notice}>{card.identity_review.original_name} → {card.identity_review.corrected_name}. {card.identity_review.reason}</p>}
    {!!blockers.length&&<p className={styles.notice}>Review needed: {blockers.map(b=>b.replaceAll("_"," ")).join("; ")}.</p>}
    <p className={styles.notice}>Catalog planning only. Physical printing, condition, grade, price and availability remain unverified.</p>
    <div className={styles.actions}>{onSave&&<button disabled={disabled} data-detail-save={card.card_id} onClick={onSave}>{saved?"Saved ✓":"Save card"}</button>}{onTarget&&<button id="set-target" className={styles.primary} disabled={disabled||!!blockers.length} onClick={onTarget}>Set as current target</button>}{onReview&&<button id="review-card" className={styles.primary} disabled={disabled} onClick={onReview}>Review in chat</button>}</div>
    {historical&&<p className={styles.muted}>Saved cards are possibilities, not owned cards or confirmed targets. Review current evidence before confirming.</p>}
    <details><summary>Catalog sources</summary><Source label="Catalog source" value={card.provenance} url={card.catalog_source_url}/><Source label="Release source" value={card.release_provenance} url={card.release_source_url}/>{card.current_illustrators?.map((c,i)=><Source key={i} label={c.value} value={c.source_ref} url={c.source_url}/>)}{card.identity_review&&<Source label="Official identity review" value={card.identity_review.corrected_name} url={card.identity_review.official_url}/>}</details>
  </dialog>;
}
export function ComparisonBlock({comparison,onDetails,disabled}:{comparison:Comparison;onDetails:(side:"left"|"right",id:string)=>void;disabled:boolean}){
  return <section className={styles.comparisonBlock} aria-label="Card comparison"><h3>Compare the recorded differences</h3><p>Catalog evidence only. No seller price or physical-copy comparison.</p><div className={styles.comparison}>{(["left","right"] as const).map(side=>{const records:(Card&{variant:string})[]=comparisonRecords(comparison,side);return <div key={side}><p className={styles.eyebrow}>Option {side==="left"?"A":"B"}</p>{records.map(card=><article key={card.card_id}><h4>{card.name}</h4><p>{card.set_code} · {card.language} · {card.collector_number}</p><p className={styles.muted}>Source version: {card.variant}. Physical edition unverified.</p><p>Rarity and illustrator are not supplied by this comparison.</p><button data-focus-card={card.card_id} disabled={disabled||!canChooseComparison(comparison,side,card.card_id)} onClick={()=>onDetails(side,card.card_id)}>View details</button><Source label="Catalog source" value={card.provenance}/></article>)}{!records.length&&<p>No usable catalog records supplied for this side. Refresh or refine the comparison.</p>}{comparison[side]?.records_truncated&&<p>Results truncated. Refine this side before choosing.</p>}</div>;})}</div><p>{comparison.artwork?.scope}</p><p className={styles.muted}>{comparison.next_question}</p></section>;
}
export function preferenceSummary(p:Preferences){return [p.budget_minor!==undefined?`${p.currency} ${p.budget_minor/(p.currency==="JPY"?1:100)} budget`:null,p.grade_company?`${p.grade_company} ${p.grade_value||""}`:null,p.destination?`Destination ${p.destination}`:null,p.collecting?.preferred_illustrators?.length?p.collecting.preferred_illustrators.join(", "):null].filter(Boolean).join(" · ");}
