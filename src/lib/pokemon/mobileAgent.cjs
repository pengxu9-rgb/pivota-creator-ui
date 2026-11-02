"use strict";
const { commerceIntent, catalogQuery, cardResearchQuery } = require("./commerceChat.cjs");
function mutationReady({ready,pending=false,conversationBusy=false,bookmarkUnverified=false}){
  return ready===true&&!pending&&!conversationBusy&&!bookmarkUnverified;
}
function savedBudget(preferences){
  return {budget:Number.isSafeInteger(preferences?.budget_minor)&&preferences.budget_minor>0&&preferences.budget_minor<=1e12?preferences.budget_minor:null,
    currency:typeof preferences?.currency==='string'&&/^[A-Z]{3}$/.test(preferences.currency)?preferences.currency:null};
}
function hasBudget(budget,currency){return Number.isSafeInteger(budget)&&budget>0&&budget<=1e12&&typeof currency==='string'&&/^[A-Z]{3}$/.test(currency);}
function budgetFormDraft(budget,currency){
  const complete=hasBudget(budget,currency),digits=complete?new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits:0;
  const raw=complete?String(budget).padStart(digits+1,'0'):'';
  return {amount:complete?(digits?`${raw.slice(0,-digits)}.${raw.slice(-digits)}`.replace(/\.?0+$/,''):raw):'',currency:typeof currency==='string'&&/^[A-Z]{3}$/.test(currency)?currency:''};
}
function budgetMinorFromDraft(text,currency){
  if(typeof text!=='string'||text.length>64||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency))return null;
  const match=text.trim().match(/^(\d*)(?:\.(\d*))?$/);if(!match||!((match[1]||'')+(match[2]||'')))return null;
  const digits=new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits,fraction=match[2]||'';
  // Additional zeroes are exact; never round away a nonzero minor-unit fraction.
  if(/[1-9]/.test(fraction.slice(digits)))return null;
  const minor=BigInt(match[1]||'0')*10n**BigInt(digits)+BigInt(fraction.slice(0,digits).padEnd(digits,'0')||'0');
  return minor>0n&&minor<=1000000000000n?Number(minor):null;
}
function nativePsaGrade(preferences){return preferences?.grade_company==='PSA'&&typeof preferences.grade_value==='string'?preferences.grade_value:'';}
function requestedResearchGrade(text,preferences){return text.normalize('NFKC').match(/\bPSA\s*(\d+(?:\.\d+)?)\b/i)?.[1]??nativePsaGrade(preferences);}
function gradeForResearch({cardId,draft,currentCardId,researchCardId,currentGrade,preferences}){
  if(draft?.cards.some(card=>card.card_id===cardId))return draft.grade;
  if(currentCardId===cardId&&researchCardId===cardId)return currentGrade;
  return nativePsaGrade(preferences);
}
function urlsForResearch({cardId,explicit,draft,active}){
  if(Array.isArray(explicit))return [...explicit];
  if(draft?.cards.some(card=>card.card_id===cardId))return [...(draft.product_urls||[])];
  return active?.cardId===cardId?[...active.urls]:[];
}
function visibleOffers(offers, grade, currency) {
  return offers.filter(o => o.scope === "listing" && (o.currency || "unreported") === currency &&
    (o.price_minor === null || Number.isSafeInteger(o.price_minor) && o.price_minor >= 0) &&
    (!grade || o.grade?.company?.toUpperCase() === "PSA" && o.grade.value === grade || o.grade?.review_required===true || o.grade?.review_reasons?.length>0));
}
function money(amount, currency) {
  if (!Number.isSafeInteger(amount) || !currency) return "Price unavailable";
  const format = new Intl.NumberFormat("en-US", { style: "currency", currency });
  return format.format(amount / 10 ** format.resolvedOptions().maximumFractionDigits);
}
function selectionRequest(cardId, offer) {
  return { card_id: cardId, offer_id: offer.offer_id, expected_observed_at: offer.observed_at,
    expected_price_minor: offer.price_minor, currency: offer.currency };
}
function sameEvidence(a, b) {
  return a.url === b.url && a.source === b.source && a.price_minor === b.price_minor &&
    a.currency === b.currency && a.grade?.company === b.grade?.company && a.grade?.value === b.grade?.value;
}
function latestCatalogMessage(messages){
  return [...messages].reverse().find(m=>m.role==='assistant'&&!m.commerce&&m.status==='accepted'&&!m.catalogStatusOnly);
}
module.exports = { latestCatalogMessage, savedBudget, hasBudget, budgetFormDraft, budgetMinorFromDraft, nativePsaGrade, requestedResearchGrade, gradeForResearch, urlsForResearch, mutationReady, visibleOffers, money, selectionRequest, sameEvidence, commerceIntent, catalogQuery, cardResearchQuery };
