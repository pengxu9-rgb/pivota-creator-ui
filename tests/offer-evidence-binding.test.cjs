"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const history=require("../src/lib/pokemon/commerceHistory.cjs");
const {selectionMatches,handoffMatches,sellerEvidenceBinding}=require("../src/lib/pokemon/bnsChatState.cjs");
const v=require("./commerceSamples.cjs");
const now=Date.parse("2026-10-22T01:00:02Z"),cardId=v.research().card_id;
const evidenceFields=["seller_condition","source_status_text","listing_status","evidence_ref","certificate_number_claim","certificate","listing_quantity","lot_quantity"];
function richOffer(){return {...v.offer(),title:"Pikachu 173/165 BGS10 Black Label",grade:{...v.offer().grade,company:"BGS",kind:"slab",evidence:"structured_seller_claim",review_required:false,review_reasons:[],special_label:"black_label"},
  seller_condition:"PRIVATE_SELLER_CONDITION",source_status_text:"PRIVATE_SOURCE_STATUS",listing_status:"active",evidence_ref:"PRIVATE_PROVENANCE_REFERENCE",
  certificate_number_claim:"12345678",certificate:{number_claim:"12345678",status:"not_checked",physical_authenticity:"not_verified"},listing_quantity:1};}
const researchRequest=()=>({card_id:cardId,query:"Pikachu 173/165 PSA10",platforms:["mercari"]});
const selectRequest=o=>({card_id:cardId,offer_id:o.offer_id,expected_observed_at:o.observed_at,expected_price_minor:o.price_minor,currency:o.currency});
function finish(doc,operation,request,response){
  const held=history.begin(doc,{version:doc.version,request_id:randomUUID(),operation,request},now);
  return history.finish(held,{event_id:held.commercePending.id,operation,request,response},now);
}
function researched(o){return finish({id:randomUUID(),version:0,title:"Test conversation",updatedAt:now,messages:[]},"research",researchRequest(),{...v.research(),offers:[o]});}
const selection=o=>({...v.selection(),offer:structuredClone(o)});
function selected(o){return finish(researched(o),"select",selectRequest(o),selection(o));}
function quote(o){
  const response=v.preview();response.quote.listing.grade=structuredClone(o.grade);
  for(const field of ["title","source","native_id","url","identity_status"])response.quote.listing[field]=o[field];
  for(const field of evidenceFields)if(Object.hasOwn(o,field))response.quote.listing[field]=structuredClone(o[field]);
  return response;
}
const handoffRequest=()=>({selection_id:v.selection().selection_id,forwarder:"buyship",destination:{country:"HK"}});
const changes=[
  ["special label",o=>{o.grade.special_label="gold_label";}],
  ["review flag",o=>{o.grade.review_required=true;}],
  ["review reason",o=>{o.grade.review_reasons=["condition_title_conflict"];}],
  ["grade provenance",o=>{o.grade.evidence="seller_title_claim";}],
  ["seller condition",o=>{o.seller_condition="CHANGED_PRIVATE_CONDITION";}],
  ["source status",o=>{o.source_status_text="CHANGED_PRIVATE_SOURCE_STATUS";}],
  ["listing status",o=>{o.listing_status="changed";}],
  ["evidence reference",o=>{o.evidence_ref="CHANGED_PRIVATE_PROVENANCE";}],
  ["certificate number",o=>{o.certificate.number_claim="87654321";}],
  ["legacy certificate claim",o=>{o.certificate_number_claim="87654321";}],
  ["certificate status",o=>{o.certificate.status="number_missing";o.certificate.number_claim=null;}],
  ["physical authenticity claim",o=>{o.certificate.physical_authenticity="verified";}],
  ["lot quantity",o=>{o.listing_quantity=2;}],
];

test("legacy optional defaults preserve eligible informational selection and handoff",()=>{
  const o=v.offer(),s=selection(o),response=v.preview();
  assert.equal(selectionMatches(s,o,now),true);
  assert.equal(handoffMatches(response,o,cardId,"buyship",{country:"HK"},undefined,s.expires_at,now),true);
  const explicit={...o,grade:{...o.grade,kind:"slab",review_required:false,review_reasons:[],special_label:null},
    seller_condition:null,source_status_text:null,listing_status:null,evidence_ref:null,certificate_number_claim:null,
    certificate:{number_claim:null,status:"number_missing",physical_authenticity:"not_verified"},listing_quantity:null};
  assert.deepEqual(sellerEvidenceBinding(explicit),sellerEvidenceBinding(o));
  assert.equal(selectionMatches(selection(explicit),o,now),true);
  const doc=finish(selected(o),"handoff",handoffRequest(),response);
  assert.equal(doc.messages.at(-1).commerce.status,"quote_ready_for_review");
});

test("client and server reject changed grade, review, provenance, condition and certificate evidence",()=>{
  const o=richOffer(),research=researched(o);
  for(const [label,change] of changes){
    const changed=structuredClone(o);change(changed);
    assert.equal(selectionMatches(selection(changed),o,now),false,label);
    assert.equal(selectionMatches(selection(o),changed,now),false,label+" original changed");
    assert.throws(()=>finish(research,"select",selectRequest(o),selection(changed)),/invalid_commerce_response/,label);
  }
});

test("raw versus unknown kind is bound even when all old grade fields match",()=>{
  const o={...v.offer(),grade:{company:null,value:null,certificate_verified:false,kind:"unknown",review_required:false,review_reasons:[]}};
  const changed={...o,grade:{...o.grade,kind:"raw"}};
  assert.equal(selectionMatches(selection(changed),o,now),false);
  assert.throws(()=>finish(researched(o),"select",selectRequest(o),selection(changed)),/invalid_commerce_response/);
  const response=quote(o);response.quote.listing.grade.kind="raw";
  assert.equal(handoffMatches(response,o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),false);
  assert.throws(()=>finish(selected(o),"handoff",handoffRequest(),response),/invalid_commerce_response/);
});

test("select cannot accept unchanged sold, unknown, expired or review-needed research evidence",()=>{
  const cases=[{availability:"sold_out"},{availability:"unavailable"},{availability:"withdrawn"},{availability:"unknown"},
    {fresh_until:null},{fresh_until:new Date(now).toISOString()},{scope:"product_summary"},{price_minor:null},
    {grade:{...v.offer().grade,review_required:true}},{grade:{...v.offer().grade,review_reasons:["source_conflict"]}}];
  for(const change of cases){
    const o={...v.offer(),...change};
    assert.equal(selectionMatches(selection(o),o,now),false,JSON.stringify(change));
    assert.throws(()=>finish(researched(o),"select",selectRequest(o),selection(o)),/invalid_commerce_response/);
  }
  for(const expires_at of [new Date(now).toISOString(),"invalid"]){
    const o=v.offer(),s={...selection(o),expires_at};
    assert.equal(selectionMatches(s,o,now),false);
    assert.throws(()=>finish(researched(o),"select",selectRequest(o),s),/invalid_commerce_response/);
  }
});

test("eligible original observations do not license changed sold, unknown, expired or review responses",()=>{
  const o=v.offer(),research=researched(o);
  for(const change of [{availability:"sold_out"},{availability:"unknown"},{fresh_until:new Date(now).toISOString()},
    {grade:{...o.grade,review_required:true}},{identity_status:"unresolved"}]){
    const response=selection({...o,...change});
    assert.equal(selectionMatches(response,o,now),false);
    assert.throws(()=>finish(research,"select",selectRequest(o),response),/invalid_commerce_response/);
  }
});

test("a quote must preserve the selected enriched evidence on both client and server",()=>{
  const o=richOffer(),doc=selected(o),response=quote(o);
  assert.equal(handoffMatches(response,o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),true);
  assert.equal(finish(doc,"handoff",handoffRequest(),response).messages.at(-1).commerce.status,"quote_ready_for_review");
  for(const [label,change] of changes.filter(([label])=>label!=="evidence reference")){
    const altered=quote(o);change(altered.quote.listing);
    assert.equal(handoffMatches(altered,o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),false,label);
    assert.throws(()=>finish(doc,"handoff",handoffRequest(),altered),/invalid_commerce_response/,label);
  }
  assert.equal(handoffMatches(v.preview(),o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),false,"legacy quote may not silently drop rich selected fields");
});

test("a fresh quote may advance its HTML capture without changing selected semantic evidence",()=>{
  const o=richOffer(),doc=selected(o),response=quote(o);
  response.quote.listing.observed_at="2026-10-22T01:00:01Z";
  response.quote.buyship.quoted_at="2026-10-22T01:00:02Z";
  response.quote.listing.evidence_ref="FRESH_HTML_CAPTURE_SHA";
  assert.equal(handoffMatches(response,o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),true);
  const result=finish(doc,"handoff",handoffRequest(),response);
  assert.equal(result.messages.at(-1).commerce.status,"quote_ready_for_review");
  assert.equal(response.quote.listing.evidence_ref,"FRESH_HTML_CAPTURE_SHA");
  assert.equal(JSON.stringify(result).includes("FRESH_HTML_CAPTURE_SHA"),false,"fresh provenance stays in the transient quote, not history");
  const altered=structuredClone(response);altered.quote.listing.grade.special_label="gold_label";
  assert.equal(handoffMatches(altered,o,cardId,"buyship",{country:"HK"},undefined,v.selection().expires_at,now),false);
  assert.throws(()=>finish(doc,"handoff",handoffRequest(),altered),/invalid_commerce_response/);
});

test("review-reason order is canonical and no raw private evidence enters metadata history",()=>{
  const o=richOffer(),a={...o,grade:{...o.grade,review_reasons:["title_conflict","source_conflict"]}},b={...o,grade:{...o.grade,review_reasons:["source_conflict","title_conflict"]}};
  assert.deepEqual(sellerEvidenceBinding(a),sellerEvidenceBinding(b));
  const doc=finish(selected(o),"handoff",handoffRequest(),quote(o));
  const stored=JSON.stringify(doc),visible=JSON.stringify(history.publicMessages(doc.messages));
  for(const privateValue of [o.url,o.title,o.seller_condition,o.source_status_text,o.evidence_ref,o.certificate.number_claim,o.grade.special_label,o.grade.evidence,v.selection().selection_id]){
    assert.equal(stored.includes(privateValue),false,privateValue);
    assert.equal(visible.includes(privateValue),false,privateValue);
  }
  assert.equal(visible.includes("commerceInternal"),false);
  assert.match(doc.commerceAnchor.quote_binding_hash,/^[a-f0-9]{64}$/);
  assert.ok(doc.commerceAnchor.offer_hashes.every(row=>/^[a-f0-9]{64}$/.test(row.evidence_hash)));
});

test("grade review refusals retain only the closed safe error code in history",()=>{
  const o=v.offer(),doc=researched(o),request=selectRequest(o);
  const held=history.begin(doc,{version:doc.version,request_id:randomUUID(),operation:"select",request},now);
  const result=history.finish(held,{event_id:held.commercePending.id,operation:"select",request,error:"grade_review_required"},now);
  assert.equal(result.messages.at(-1).commerce.status,"failed");
  assert.equal(result.messages.at(-1).commerce.error_code,"grade_review_required");
  assert.equal(result.commerceAnchor,null);
  assert.doesNotThrow(()=>history.validateSummary(result.messages.at(-1).commerce));
});
