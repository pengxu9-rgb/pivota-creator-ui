"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{randomUUID}=require("node:crypto");
const {validateOffer,validateCommerceResponse}=require("../src/lib/pokemon/commerceContract.cjs");
const {listingPhotoUrl,listingPhotos}=require("../src/lib/pokemon/listingEvidence.cjs");
const {offerEvidence,groupComparableOffers,comparableAskStats,offerSection,filterComparisonOffers,comparisonSections}=require("../src/lib/pokemon/offerEvidence.cjs");
const {selectionMatches,handoffMatches}=require("../src/lib/pokemon/bnsChatState.cjs");
const history=require("../src/lib/pokemon/commerceHistory.cjs");
const sample=require("./commerceSamples.cjs"),{exactListing,photo}=require("./listingEvidenceSamples.cjs");
const clock=Date.parse("2026-10-22T01:00:02Z"),card=sample.research().card_id,clone=structuredClone;
function exact(id="one",price=2000,changes={}){const o={...sample.offer(),offer_id:id,native_id:id,url:`https://jp.mercari.com/item/${id}`,price_minor:price,...changes};return exactListing(o,card);}
function selection(o){return {...sample.selection(),offer:clone(o)};}
function finish(doc,op,request,response){const held=history.begin(doc,{version:doc.version,request_id:randomUUID(),operation:op,request},clock);return history.finish(held,{event_id:held.commercePending.id,operation:op,request,response},clock);}
function researched(o){return finish({id:randomUUID(),version:0,title:"Fixture",updatedAt:clock,messages:[]},"research",{card_id:card,query:"Pikachu"},{...sample.research(),offers:[o]});}
const selectRequest=o=>({card_id:card,offer_id:o.offer_id,expected_observed_at:o.observed_at,expected_price_minor:o.price_minor,currency:o.currency});

test("exact identity is backed by all five structured fields; legacy candidates do not get promoted",()=>{
  const o=exact();assert.equal(validateOffer(o),o);assert.equal(offerEvidence(o,clock).priceComparable,true);
  const forged={...sample.offer(),identity_status:"exact_match",card_id:card,listing_quantity:1};
  assert.throws(()=>validateOffer(forged),/invalid_commerce_response/);assert.equal(offerEvidence(forged,clock).canSelect,false);
  for(const claims of [{...o.identity_evidence.claims,edition:null},{...o.identity_evidence.claims,collector_number:"174/165"}]){
    assert.throws(()=>validateOffer({...o,identity_evidence:{...o.identity_evidence,claims}}),/invalid_commerce_response/);
  }
  assert.equal(validateOffer(sample.offer()).identity_status,"unverified_candidate");assert.equal(offerEvidence(sample.offer(),clock).priceComparable,false);
});

test("contradictory identity stays visible as review evidence and cannot be selected",()=>{
  const o=exact();o.identity_status="identity_conflict";o.identity_evidence.status="conflict";
  o.identity_evidence.claims.collector_number="174/165";o.identity_evidence.matched_fields=o.identity_evidence.matched_fields.filter(f=>f!=="collector_number");o.identity_evidence.conflicting_fields=["collector_number"];
  assert.doesNotThrow(()=>validateOffer(o));assert.equal(offerSection(o,clock),"review");assert.equal(offerEvidence(o,clock).canSelect,false);
  assert.match(groupComparableOffers([o],card,clock)[0].label,/conflicts/);
  for(const edit of [{status:"candidate"},{conflicting_fields:[]},{missing_fields:["edition"]},{matched_fields:["language","language"]}])assert.throws(()=>validateOffer({...o,identity_evidence:{...o.identity_evidence,...edit}}),/invalid_commerce_response/);
});

test("identity provenance is URL scoped, timestamp bounded and cannot claim authenticity",()=>{
  const o=exact();
  for(const edit of [{listing_url:"https://jp.mercari.com/item/other"},{evidence_ref:null},{target_card_id:"ja:OTHER:1:holo"},{basis:"unavailable"},{authenticity_verified:true},{observed_at:"2026-10-22T01:00:00.000001Z"},{observed_at:"2026-02-31T00:00:00Z"}])assert.throws(()=>validateOffer({...o,identity_evidence:{...o.identity_evidence,...edit}}),/invalid_commerce_response/);
  const p=exact();p.observed_at="2026-10-22T01:00:00.000001Z";p.identity_evidence.observed_at="2026-10-22T01:00:00.000002Z";assert.throws(()=>validateOffer(p),/invalid_commerce_response/);
});

test("listing photos require exact-listing provenance and safe platform media URLs",()=>{
  const o=exact();o.listing_photos=[photo(o)];assert.equal(validateOffer(o),o);assert.equal(listingPhotos(o).length,1);
  for(const [source,url] of [["mercari","https://static.mercdn.net/item/detail/orig/photos/m1_1.jpg"],["ebay_us","https://i.ebayimg.com/images/g/abc/s-l1600.webp"],["snkrdunk","https://images.snkrdunk.com/item/foo.png"]])assert.equal(listingPhotoUrl(url,source),url);
  for(const url of ["http://static.mercdn.net/item/detail/orig/photos/a.jpg","https://127.0.0.1/a.jpg","https://evil.example/a.jpg","https://images.snkrdunk.com/a.jpg","https://static.mercdn.net/item/detail/orig/photos/a.svg","https://static.mercdn.net/item/detail/orig/photos/a.jpg?q=token","https://static.mercdn.net/item/detail/orig/photos/%61.jpg","https://static.mercdn.net/item/detail/orig/photos/../a.jpg","https://name:secret@static.mercdn.net/item/detail/orig/photos/a.jpg"]){
    assert.equal(listingPhotoUrl(url,"mercari"),null,url);assert.throws(()=>validateOffer({...o,listing_photos:[photo(o,{url})]}),/invalid_commerce_response/);
  }
  for(const changes of [{role:"catalog_artwork"},{listing_url:"https://jp.mercari.com/item/other"},{evidence_ref:""},{observed_at:"2026-10-22T01:00:01Z"}])assert.throws(()=>validateOffer({...o,listing_photos:[photo(o,changes)]}),/invalid_commerce_response/);
  assert.throws(()=>validateOffer({...o,listing_photos:[photo(o),photo(o)]}),/invalid_commerce_response/);
  assert.deepEqual(listingPhotos({...o,listing_photos:[photo(o,{url:"javascript:alert(1)"})]}),[]);
});

test("synthetic media host is fixture only and never a live source exception",()=>{
  const o=exact(),url="https://images.example.invalid/listings/fixture/card.png";
  assert.equal(listingPhotoUrl(url,"mercari"),null);assert.equal(listingPhotoUrl(url,"mercari",true),url);
  assert.throws(()=>validateOffer({...o,listing_photos:[photo(o,{url})]}),/invalid_commerce_response/);
  assert.doesNotThrow(()=>validateOffer({...o,synthetic:true,listing_photos:[photo(o,{url})]}));
});

test("asking-price statistics use one exact cohort, distinct eligible listings and no sold-value claim",()=>{
  const a=exact("a",12000),b=exact("b",10000),duplicate={...clone(a),offer_id:"duplicate"};
  const group=groupComparableOffers([a,b,duplicate],card,clock)[0],stats=comparableAskStats(group,clock);
  assert.deepEqual([stats.minimum_minor,stats.median_minor,stats.maximum_minor,stats.listingCount],[10000,11000,12000,2]);
  assert.equal(comparableAskStats(groupComparableOffers([a],card,clock)[0],clock),null);
  assert.equal(comparableAskStats({...group,offers:[a,exact("usd",100,{currency:"USD"})]},clock),null);
  assert.equal(comparableAskStats({...group,offers:[a,{...b,grade:{...b.grade,value:"9"}}]},clock),null);
  assert.equal(comparableAskStats(group,clock,{b:{status:"not_found"}}),null);
  const candidate={...b,identity_status:"unverified_candidate"};delete candidate.identity_evidence;
  assert.equal(comparableAskStats({...group,offers:[a,candidate]},clock),null,"a forged group flag is not proof of comparability");
  assert.equal(comparableAskStats(groupComparableOffers([exact("odd-a",10000),exact("odd-b",10001)],card,clock)[0],clock).median_minor,10000.5);
});

test("section and source filters preserve every inactive or review observation without global currency sorting",()=>{
  const high=exact("high",3000),low=exact("low",2000),candidate={...sample.offer(),offer_id:"candidate"},sold=exact("sold",1,{availability:"sold_out"}),withdrawn=exact("withdrawn",2,{availability:"withdrawn"}),usd=exact("usd",1,{currency:"USD"});
  const all=[high,low,candidate,sold,withdrawn,usd];
  assert.deepEqual(comparisonSections(all,clock),{available:3,review:1,sold:2});
  assert.deepEqual(filterComparisonOffers(all,{section:"sold"},card,clock).map(o=>o.offer_id),["sold","withdrawn"]);
  assert.deepEqual(filterComparisonOffers(all,{section:"all",sort:"source"},card,clock).map(o=>o.offer_id),["high","low","usd","candidate","sold","withdrawn"]);
  assert.deepEqual(filterComparisonOffers(all,{section:"available",sort:"price"},card,clock).map(o=>o.offer_id),["low","high","usd"],"USD is not sorted against JPY");
  assert.equal(filterComparisonOffers(all,{section:"available"},card,clock,{high:{status:"not_found"}}).length,2);
});

test("research coverage is a checked sample and its counts cannot exceed the actual response",()=>{
  const o=exact(),r={...sample.research(),offers:[o],coverage:{returned_listings:1,exact_match_listings:1,candidate_listings:0,conflicting_listings:0,sold_listings:0,listings_with_photos:0,search_limit_per_source:3,exhaustive:false,live_coverage_verified:false}};
  assert.equal(validateCommerceResponse("research",r),r);
  for(const changes of [{returned_listings:2},{exact_match_listings:0},{candidate_listings:1},{exhaustive:true},{live_coverage_verified:true},{search_limit_per_source:100}])assert.throws(()=>validateCommerceResponse("research",{...r,coverage:{...r.coverage,...changes}}),/invalid_commerce_response/);
});

test("exact evidence for a different requested printing cannot enter the available cohort",()=>{
  const other="ja:SV2A:174/165:holo",a=exactListing(exact("other-a",1000),other),b=exactListing(exact("other-b",2000),other);
  assert.doesNotThrow(()=>validateOffer(a));
  assert.equal(offerSection(a,clock,undefined,card),"review");
  assert.deepEqual(comparisonSections([a,b],clock,{},card),{available:0,review:2,sold:0});
  assert.deepEqual(filterComparisonOffers([a,b],{section:"available"},card,clock),[]);
  const group=groupComparableOffers([a,b],card,clock)[0];assert.equal(group.priceComparable,false);assert.equal(comparableAskStats(group,clock),null);
  const correctlyBound=groupComparableOffers([a,b],other,clock)[0];assert.equal(comparableAskStats(correctlyBound,clock,{},card),null);
});

test("selection binds changed printing proof, seller identity and photo evidence in client and history",()=>{
  const o=exact();o.listing_photos=[photo(o)];const doc=researched(o);
  assert.equal(selectionMatches(selection(o),o,clock),true);
  const twoPhotos={...clone(o),listing_photos:[photo(o),photo(o,{url:"https://static.mercdn.net/item/detail/orig/photos/m1_2.jpg"})]};
  const reordered={...clone(twoPhotos),listing_photos:[...twoPhotos.listing_photos].reverse()};
  assert.equal(selectionMatches(selection(twoPhotos),reordered,clock),true,"photo ordering alone does not change the offered evidence set");
  const photoChanged=clone(o);photoChanged.listing_photos[0].url="https://static.mercdn.net/item/detail/orig/photos/m1_2.jpg";
  const printChanged=clone(o);printChanged.identity_evidence.target.edition="first_edition";printChanged.identity_evidence.claims.edition="first_edition";
  for(const altered of [photoChanged,printChanged]){
    assert.equal(selectionMatches(selection(altered),o,clock),false);
    assert.throws(()=>finish(doc,"select",selectRequest(o),selection(altered)),/invalid_commerce_response/);
  }
});

test("a proven comparison match may use a separately scoped candidate-only URL quote without promoting it",()=>{
  const o=exactListing(sample.offer(),card),response=sample.preview();o.listing_quantity=undefined;
  const selected=finish(researched(o),"select",selectRequest(o),selection(o));
  assert.equal(handoffMatches(response,o,card,"buyship",{country:"HK"},undefined,selection(o).expires_at,clock),true);
  const completed=finish(selected,"handoff",{selection_id:sample.selection().selection_id,forwarder:"buyship",destination:{country:"HK"}},response);
  assert.equal(completed.messages.at(-1).commerce.status,"quote_ready_for_review");assert.equal(response.quote.listing.identity_status,"unverified_candidate");assert.equal(response.order_created,false);
  for(const change of [r=>r.quote.listing.native_id="other",r=>r.quote.listing.identity_status="exact_match",r=>r.quote.listing.ask.subunit_amount++,r=>r.quote.listing.grade.value="9",r=>r.quote.listing.observed_at="2026-10-21T01:00:00Z"]){
    const changed=clone(response);change(changed);assert.equal(handoffMatches(changed,o,card,"buyship",{country:"HK"},undefined,selection(o).expires_at,clock),false);
  }
  const forged={...o};delete forged.identity_evidence;assert.equal(handoffMatches(response,forged,card,"buyship",{country:"HK"},undefined,selection(o).expires_at,clock),false);
});

test("chat history binds seller changes without persisting raw seller or physical-copy evidence",()=>{
  const o=exact();o.seller={id:"private-fixture-seller-a",display_name:"Private Fixture Seller",url:null,evidence_ref:"private-seller-source",observed_at:o.observed_at,reputation:null};o.listing_photos=[photo(o)];
  const research=researched(o),changed=clone(o);changed.seller.id="private-fixture-seller-b";
  assert.throws(()=>finish(research,"select",selectRequest(o),selection(changed)),/invalid_commerce_response/);
  const selected=finish(research,"select",selectRequest(o),selection(o)),stored=JSON.stringify(selected);
  for(const secret of [o.seller.id,o.seller.display_name,o.seller.evidence_ref,o.listing_photos[0].url,o.identity_evidence.evidence_ref])assert.equal(stored.includes(secret),false,secret);
});
