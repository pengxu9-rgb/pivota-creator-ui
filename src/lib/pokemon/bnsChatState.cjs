'use strict';
const {validateCommerceResponse,validateOffer}=require('./commerceContract.cjs');
const {offerEvidence,canSelectForTarget}=require('./offerEvidence.cjs');
const {sellerIdentityTuple}=require('./sellerEvidence.cjs');
const {identityView}=require('./listingEvidence.cjs');
function listingSemanticBinding(o){
  const e=o?.identity_evidence,fields=['language','set_code','collector_number','finish','edition'];
  return [o?.card_id??null,e?[e.status,e.target_card_id,fields.map(k=>e.target?.[k]??null),fields.map(k=>e.claims[k]),
    [...e.matched_fields].sort(),[...e.missing_fields].sort(),[...e.conflicting_fields].sort(),e.listing_url,e.basis]:null,
    (o?.listing_photos??[]).map(p=>[p.url,p.role,p.listing_url]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
}
function urlQuoteIdentityStatus(o){return identityView(o).exact?'unverified_candidate':o?.identity_status;}
// Only hashes of this tuple belong in persisted commerce history. Normalized
// absence keeps legacy DTOs compatible without inventing seller provenance.
function sellerEvidenceBinding(offer,includeCapture=true){
  const o=offer||{},g=o.grade||{},certificate=o.certificate||{};
  const number=certificate.number_claim===undefined?o.certificate_number_claim??null:certificate.number_claim;
  const reasons=g.review_reasons===undefined?[]:Array.isArray(g.review_reasons)?[...new Set(g.review_reasons)].sort():g.review_reasons;
  return [g.company??null,g.value??null,g.certificate_verified??false,
    g.kind===undefined?(g.company&&g.value?'slab':'unknown'):g.kind,g.evidence??null,g.review_required===undefined?false:g.review_required,
    reasons,g.special_label??null,
    o.seller_condition??null,o.source_status_text??null,o.listing_status??null,includeCapture?o.evidence_ref??null:null,
    o.certificate_number_claim??null,number,certificate.status===undefined?(number?'not_checked':'number_missing'):certificate.status,
    certificate.physical_authenticity===undefined?'not_verified':certificate.physical_authenticity,o.listing_quantity??null,o.lot_quantity??null];
}
function handoffView(result,now=Date.now(),selectionExpiresAt) {
  validateCommerceResponse('handoff',result);
  const selectionExpired=!!selectionExpiresAt&&Date.parse(selectionExpiresAt)<=now;
  if(selectionExpired)return {kind:'expired',title:'Recheck the listing',message:'This listing selection expired. Research the listing and choose it again.',canRetry:false};
  if(result.quote){
    if(Date.parse(result.quote.buyship.expires_at)<=now)return {kind:'expired',title:'Quote expired',message:'Request a fresh preview before reviewing current delivered costs.',canRetry:true};
    return {kind:'quote',title:'Review delivered costs',message:'This is an informational quote. No order or payment was created.',canRetry:false};
  }
  const p=result.provider_result;
  if(p?.status==='variant_selection_required')return {kind:'variant',title:p.code==='variant_changed'?'Options changed — choose again':'Choose a listing option',message:p.message,canRetry:false};
  if(p)return {kind:p.status==='refused'?'refused':'unavailable',title:p.status==='refused'?'Quote cannot continue':'Quote unavailable',message:p.message,canRetry:p.retryable};
  return {kind:'manual',title:'Manual URL handoff',message:result.message,canRetry:false};
}
function selectionMatches(selection,offer,now=Date.now()) {
  if(!selection||!offer||!Number.isFinite(now)||!Number.isFinite(Date.parse(selection.expires_at))||Date.parse(selection.expires_at)<=now)return false;
  try{validateCommerceResponse('select',selection);validateOffer(offer);}catch{return false;}
  if(!offerEvidence(offer,now).canSelect||!offerEvidence(selection.offer,now).canSelect)return false;
  const evidence=o=>[o.offer_id,o.source,o.native_id,o.title,o.url,o.observed_at,o.fresh_until??null,o.price_minor,o.currency,o.availability,o.identity_status,o.scope,sellerEvidenceBinding(o),sellerIdentityTuple(o),listingSemanticBinding(o)];
  return JSON.stringify(evidence(selection.offer))===JSON.stringify(evidence(offer));
}
function preferencePatch(budget,currency,grade,country) {
  const match=String(grade).match(/^(PSA|BGS|CGC|ARS|PGC) (\d{1,2}(?:\.\d)?)$/);
  return {budget_minor:budget,currency,destination:country,grade_company:match?match[1]:null,grade_value:match?match[2]:null};
}
function observationIsCurrent(observedAt,originalAt,quotedAt,now=Date.now(),selectionExpiresAt){
  const observed=Date.parse(observedAt),original=Date.parse(originalAt),quoted=Date.parse(quotedAt),expires=selectionExpiresAt?Date.parse(selectionExpiresAt):Infinity;
  return [observed,original,quoted,now].every(Number.isFinite)&&observed>=original&&observed<=quoted&&quoted<=now&&now<expires;
}
function handoffMatches(result,offer,cardId,forwarder,destination,variantKey,selectionExpiresAt,now=Date.now()){
  try{validateOffer(offer);validateCommerceResponse('handoff',result);}catch{return false;}
  if(!offer||!result||!canSelectForTarget(offer,cardId,now)||result.product_url!==offer.url||result.forwarder?.id!==forwarder)return false;
  if(selectionExpiresAt&&(!Number.isFinite(Date.parse(selectionExpiresAt))||Date.parse(selectionExpiresAt)<=now))return false;
  if(!result.quote)return true;
  const q=result.quote,l=q.listing,d=q.buyship.destination;
  return q.card_id===cardId&&!!l&&l.url===offer.url&&l.title===offer.title&&l.source===offer.source&&l.native_id===offer.native_id&&observationIsCurrent(l.observed_at,offer.observed_at,q.buyship.quoted_at,now,selectionExpiresAt)&&(l.ask?l.ask.subunit_amount===offer.price_minor&&l.ask.currency===offer.currency:offer.price_minor===null)&&l.identity_status===urlQuoteIdentityStatus(offer)&&JSON.stringify(sellerEvidenceBinding(l,false))===JSON.stringify(sellerEvidenceBinding(offer,false))&&(!variantKey||q.buyship.variant_key===variantKey)&&!!d&&d.country===destination.country&&(d.state||'')===(destination.state||'');
}
module.exports={handoffView,selectionMatches,preferencePatch,handoffMatches,observationIsCurrent,sellerEvidenceBinding,listingSemanticBinding,urlQuoteIdentityStatus};
