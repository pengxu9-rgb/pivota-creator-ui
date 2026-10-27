'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const history=require('../src/lib/pokemon/commerceHistory.cjs');
const sample=require('./commerceSamples.cjs'),{exactListing}=require('./listingEvidenceSamples.cjs');
const clock=Date.parse('2026-10-22T01:00:02Z'),card=sample.research().card_id,other='ja:SV2A:174/165:holo';
function finish(doc,operation,request,response){
  const held=history.begin(doc,{version:doc.version,request_id:randomUUID(),operation,request},clock);
  return history.finish(held,{event_id:held.commercePending.id,operation,request,response},clock);
}
function researched(offer){return finish({id:randomUUID(),version:0,title:'Fixture',messages:[],updatedAt:clock},'research',{card_id:card,query:'Pikachu'},{...sample.research(),offers:[offer]});}
const select=o=>({card_id:card,offer_id:o.offer_id,expected_observed_at:o.observed_at,expected_price_minor:o.price_minor,currency:o.currency});

test('server history rejects a valid exact proof for a different requested card',()=>{
  const wrong=exactListing(sample.offer(),other),doc=researched(wrong);
  // Even a trusted sidecar response that is internally valid and matches the
  // original returned offer must not substitute another catalog printing.
  assert.throws(()=>finish(doc,'select',select(wrong),{...sample.selection(),offer:wrong}),/invalid_commerce_response/);
});

test('server history rejects a candidate carrying a different reported card binding',()=>{
  const wrong={...sample.offer(),card_id:other};
  assert.throws(()=>finish(researched(wrong),'select',select(wrong),{...sample.selection(),offer:wrong}),/invalid_commerce_response/);
});

test('requested exact proof retains the independent URL quote while mismatched restored anchors fail closed',()=>{
  const offer=exactListing(sample.offer(),card);offer.listing_quantity=undefined;
  const selected=finish(researched(offer),'select',select(offer),{...sample.selection(),offer});
  const request={selection_id:sample.selection().selection_id,forwarder:'buyship',destination:{country:'HK'}},response=sample.preview();
  assert.equal(finish(selected,'handoff',request,response).messages.at(-1).commerce.status,'quote_ready_for_review');
  const corrupted=structuredClone(selected);corrupted.commerceAnchor.card_id=other;
  assert.throws(()=>finish(corrupted,'handoff',request,response),/invalid_commerce_response/);
  assert.equal(response.quote.listing.identity_status,'unverified_candidate');
  assert.equal(response.order_created,false);
});
