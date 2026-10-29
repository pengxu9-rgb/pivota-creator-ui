"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createRequire}=require("node:module"),localRequire=createRequire(path.resolve(__dirname,"../package.json"));
const {validateOffer,validateCommerceResponse}=require("../src/lib/pokemon/commerceContract.cjs");
const {sellerProfileUrl,sellerView}=require("../src/lib/pokemon/sellerEvidence.cjs");
const {groupComparableOffers,listingObservations,listingCoverage,offerEvidence}=require("../src/lib/pokemon/offerEvidence.cjs");
const {selectionMatches,handoffMatches}=require("../src/lib/pokemon/bnsChatState.cjs");
const {exactListing,photo}=require("./listingEvidenceSamples.cjs");
const sample=require("./commerceSamples.cjs"),clock=Date.parse("2026-10-22T01:00:02Z"),cardId=sample.research().card_id;
const clone=structuredClone;
function reputation(changes={}){return {rating:{value:4.8,scale:5},review_count:127,positive_feedback_percent:null,feedback_score:null,evidence_ref:"fixture:seller-metrics",observed_at:"2026-10-22T01:00:00Z",...changes};}
function seller(id="seller-a",changes={}){return {id,display_name:id==="seller-a"?"Alice Cards":"Bob Cards",url:`https://jp.mercari.com/user/profile/${id}`,evidence_ref:"fixture:exact-listing-seller",observed_at:"2026-10-22T01:00:00Z",reputation:reputation(),...changes};}
function offer(id="m1001",changes={}){return {...sample.offer(),offer_id:`offer-${id}`,native_id:id,url:`https://jp.mercari.com/item/${id}`,listing_quantity:1,seller:seller(),...changes};}
function selection(o){return {...sample.selection(),offer:clone(o)};}
const component=()=>{
  const ts=localRequire("typescript"),filename=path.resolve(__dirname,"../src/components/creator/pokemon/shopper/OfferEvidenceBoard.tsx");
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const m={exports:{}};
  vm.runInNewContext(compiled,{exports:m.exports,module:m,Date,Intl,require(id){if(id.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};if(id.startsWith("@/lib/"))return localRequire(path.resolve(__dirname,"../src/lib",id.slice("@/lib/".length)));return localRequire(id);}});
  return m.exports.default;
};
const Board=component(),React=localRequire("react"),{renderToStaticMarkup}=localRequire("react-dom/server");
const render=(offers,props={})=>renderToStaticMarkup(React.createElement(Board,{offers,cardId,clock,onSelect(){},onCertificate(){},...props}));
const articles=html=>html.match(/<article\b[\s\S]*?<\/article>/g)||[];
const chooseButtons=html=>html.match(/<button\b[^>]*class="choose"[^>]*>[\s\S]*?<\/button>/g)||[];

test("seller DTO preserves source evidence and accepts absent or null legacy seller",()=>{
  for(const o of [sample.offer(),offer("m1",{seller:null}),offer()])assert.equal(validateOffer(o),o);
  const r={...sample.research(),offers:[offer()]};assert.equal(validateCommerceResponse("research",r),r);
  assert.equal(sellerView(offer()).label,"Alice Cards");
  assert.deepEqual(sellerView(sample.offer()).reputationLines,[]);
  assert.equal(sellerView(sample.offer()).reputationLabel,"Seller reputation not reported");
});

test("malformed canonical seller identities, capture times and extra verification claims fail closed",()=>{
  for(const edit of [{id:null,display_name:null,url:null},{id:""},{display_name:" Alice "},{id:"a\nb"},
    {evidence_ref:""},{observed_at:"2026-10-22T01:00:01Z"},{observed_at:"2026-10-22"},
    {observed_at:"2026-10-22T01:00:00"},{verified:true},{reputation:undefined}]){
    assert.throws(()=>validateOffer(offer("bad",{seller:{...seller(),...edit}})),/invalid_commerce_response/,JSON.stringify(edit));
  }
  for(const native_id of [undefined,null,""])assert.throws(()=>validateOffer({...offer(),native_id}),/invalid_commerce_response/);
  const precise=offer("precise",{observed_at:"2026-10-22T01:00:00.000001Z",seller:seller("a",{observed_at:"2026-10-22T01:00:00.000002Z",reputation:null})});
  assert.throws(()=>validateOffer(precise),/invalid_commerce_response/,"submillisecond future seller capture must not round into equality");
});

test("seller profiles are exact marketplace profile URLs and cannot redirect identities off platform",()=>{
  for(const [source,url] of [["mercari","https://jp.mercari.com/user/profile/123"],["ebay_us","https://www.ebay.com/usr/alice.cards"],["ebay","https://ebay.com/str/cardshop/"],["snkrdunk","https://snkrdunk.com/users/abc_123"]])assert.equal(sellerProfileUrl(url,source),url);
  for(const url of ["https://evil.example/user/profile/123","https://jp.mercari.com.evil.example/user/profile/123","http://jp.mercari.com/user/profile/123","https://name:secret@jp.mercari.com/user/profile/123","https://jp.mercari.com/user/profile/123?token=x","https://jp.mercari.com/user/profile/123#x","https://jp.mercari.com/item/m1","https://jp.mercari.com/user/profile/%31","javascript:alert(1)"]){
    assert.equal(sellerProfileUrl(url,"mercari"),null,url);assert.throws(()=>validateOffer(offer("bad",{seller:seller("a",{url})})),/invalid_commerce_response/);
  }
  for(const url of ["https://ebay.com/usr/..","https://ebay.com/usr/.alice","https://ebay.com/usr/-alice"])assert.equal(sellerProfileUrl(url,"ebay_us"),null,url);
});

test("product summaries and generic platform merchants cannot become individual listing sellers",()=>{
  const summary=offer("summary",{scope:"product_summary"});assert.throws(()=>validateOffer(summary),/invalid_commerce_response/);
  assert.doesNotThrow(()=>validateOffer({...summary,seller:null}));assert.equal(sellerView(summary).reported,false);assert.match(render([summary]),/Seller not reported/);
  for(const [source,name] of [["mercari","メルカリ"],["ebay_us","eBay"],["ebay","ＥＢＡＹ"],["snkrdunk","ＳＮＫＲＤＵＮＫ"]]){
    const platform=offer("platform",{source,seller:seller(name,{display_name:name,url:null})});
    assert.throws(()=>validateOffer(platform),/invalid_commerce_response/,name);assert.equal(sellerView(platform).reported,false,name);
  }
  assert.doesNotThrow(()=>validateOffer(offer("profile",{source:"snkrdunk",seller:seller("snkrdunk",{display_name:"SNKRDUNK",url:"https://snkrdunk.com/users/reported-user"})})),"an actual reported allowed user profile can distinguish a seller using the brand name");
});

test("reported zero metrics are distinct from absent metrics and different scales stay explicit",()=>{
  const zero=offer("zero",{seller:seller("a",{reputation:reputation({rating:{value:0,scale:5},review_count:0})})});
  assert.doesNotThrow(()=>validateOffer(zero));assert.deepEqual(sellerView(zero).reputationLines,["Rating 0 / 5","0 reviews"]);
  const ebay=offer("e1",{source:"ebay_us",url:"https://www.ebay.com/itm/e1",seller:seller("a",{url:"https://www.ebay.com/usr/a",reputation:reputation({rating:null,review_count:null,positive_feedback_percent:99.8,feedback_score:450})})});
  assert.doesNotThrow(()=>validateOffer(ebay));assert.deepEqual(sellerView(ebay).reputationLines,["99.8% positive feedback","Feedback score 450"]);
  const unknown=offer("none",{seller:seller("a",{reputation:null})});assert.deepEqual(sellerView(unknown).reputationLines,[]);assert.match(sellerView(unknown).reputationLabel,/not reported/);
});

test("metrics cannot invent a score, omit a scale, exceed bounds or postdate the seller capture",()=>{
  const invalid=[{rating:{value:4.8}},{rating:{value:6,scale:5}},{rating:{value:NaN,scale:5}},{rating:{value:4,scale:0}},
    {rating:{value:4,scale:1001}},{review_count:-1},{review_count:0.5},{feedback_score:Infinity},{positive_feedback_percent:101},
    {rating:null,review_count:null},{observed_at:"2026-10-22T01:00:01Z"},{trust_score:99}];
  for(const edit of invalid)assert.throws(()=>validateOffer(offer("bad",{seller:seller("a",{reputation:reputation(edit)})})),/invalid_commerce_response/,JSON.stringify(edit));
});

test("same-platform sellers and the same seller's distinct listings stay separate alongside another platform",()=>{
  const a=offer("m1"),b=offer("m2",{seller:seller("seller-b")}),a2=offer("m3"),e=offer("e1",{source:"ebay_us",url:"https://www.ebay.com/itm/e1",seller:seller("seller-a",{url:"https://www.ebay.com/usr/seller-a",reputation:null})});
  const offers=[a,b,a2,e],groups=groupComparableOffers(offers,cardId,clock);
  assert.equal(groups.length,1);assert.deepEqual(groups[0].offers,offers);
  assert.deepEqual(listingCoverage(offers),{listings:4,platforms:2,reportedSellerIdentities:3,listingsWithoutSellerIdentity:0,observations:4,duplicateObservations:0,conflictingListings:0});
  assert.equal(groups[0].priceComparable,false,"seller identity does not verify the catalog match");
});

test("legacy eBay source aliases are one platform and do not manufacture a second seller or listing",()=>{
  const e=offer("e1",{source:"ebay_us",url:"https://www.ebay.com/itm/e1",seller:seller("seller-a",{url:"https://www.ebay.com/usr/seller-a",reputation:null})});
  const alias={...clone(e),source:"ebay",offer_id:"legacy-alias"};
  const coverage=listingCoverage([e,alias]);assert.equal(coverage.listings,1);assert.equal(coverage.platforms,1);assert.equal(coverage.reportedSellerIdentities,1);assert.equal(coverage.duplicateObservations,1);
});

test("display names alone do not count as stable seller identities or imply complete seller coverage",()=>{
  const offers=[offer("m1",{seller:seller(null,{display_name:"Alice",url:null,reputation:null})}),offer("m2",{seller:null})];
  assert.equal(listingCoverage(offers).reportedSellerIdentities,0);assert.equal(listingCoverage(offers).listingsWithoutSellerIdentity,2);
  const html=render(offers);assert.match(html,/Returned sample only/);assert.match(html,/2 listings lack a stable seller ID/);assert.match(html,/Seller not reported/);assert.doesNotMatch(html,/Rating 0|trust score 0/);
});

test("identical observations of one platform listing are shown once without collapsing other listings",()=>{
  const a=offer("m1"),duplicate={...clone(a),offer_id:"another-route-id"},b=offer("m2",{seller:seller("seller-b")});
  const normalized=listingObservations([a,duplicate,b]);assert.equal(normalized.duplicateObservations,1);assert.deepEqual(normalized.offers,[a,b]);
  assert.equal(listingCoverage([a,duplicate,b]).listings,2);assert.equal((render([a,duplicate,b]).match(/<article /g)||[]).length,2);
});

test("conflicting captures of one listing retain both versions and disable selection instead of choosing a price",()=>{
  const a=offer("m1"),changed={...clone(a),offer_id:"changed-route-id",price_minor:1,seller:seller("seller-b")};
  const normalized=listingObservations([a,changed]);assert.equal(normalized.conflictingListings,1);assert.equal(normalized.offers.length,2);
  assert.ok(normalized.offers.every(o=>offerEvidence(o,clock).reviewRequired&&!offerEvidence(o,clock).canSelect));
  const groups=groupComparableOffers([a,changed],cardId,clock);assert.ok(groups.every(g=>!g.priceComparable));assert.equal(groups.flatMap(g=>g.offers).length,2);
  assert.equal(offerEvidence(a,clock).canSelect,true,"normalization does not mutate the original DTO");
  const html=render([a,changed]);assert.match(html,/Conflicting observations of 1 listings? require review/);assert.match(html,/Needs review/);assert.equal(chooseButtons(html).length,2);assert.ok(chooseButtons(html).every(button=>/disabled=""/.test(button)));
});

test("conflicting grades of the same listing remain separate grade groups and both require review",()=>{
  const a=offer("m1"),b={...clone(a),offer_id:"other-grade",grade:{...a.grade,value:"9"}};
  const groups=groupComparableOffers([a,b],cardId,clock);assert.equal(groups.length,2);assert.ok(groups.every(g=>!g.priceComparable&&g.offers.length===1&&!offerEvidence(g.offers[0],clock).canSelect));
});

test("selection binds seller identity while reputation and capture refreshes do not change the selected seller",()=>{
  const o=offer(),s=selection(o);assert.equal(selectionMatches(s,o,clock),true);
  for(const sellerChange of [{id:"new-id"},{display_name:"New owner"},{url:"https://jp.mercari.com/user/profile/changed"}])assert.equal(selectionMatches(s,{...o,seller:{...o.seller,...sellerChange}},clock),false);
  const refreshed=clone(o);refreshed.seller.evidence_ref="fixture:new-capture";refreshed.seller.observed_at="2026-10-22T00:59:59Z";refreshed.seller.reputation=reputation({rating:{value:4.9,scale:5},observed_at:"2026-10-22T00:59:59Z"});
  assert.equal(selectionMatches(s,refreshed,clock),true);
  assert.equal(selectionMatches(s,{...o,seller:{...o.seller,reputation:{...o.seller.reputation,review_count:-1}}},clock),false,"malformed current canonical DTO is not an identity refresh");
  const legacy=sample.offer();assert.equal(selectionMatches(selection({...legacy,seller:null}),legacy,clock),true);
  assert.equal(handoffMatches(sample.preview(),{...legacy,seller:seller()},cardId,"buyship",{country:"HK"},undefined,sample.selection().expires_at,clock),true,"old quote binding remains exact URL evidence, not new seller verification");
});

test("real board render separates seller, listing, item ask, quote stage and authenticity uncertainty",()=>{
  const html=render([offer("m1"),offer("m2",{seller:seller("seller-b",{reputation:null})})]);
  assert.match(html,/Alice Cards/);assert.match(html,/Bob Cards/);assert.match(html,/Seller profile/);assert.match(html,/Rating 4.8 \/ 5/);assert.match(html,/127 reviews/);assert.match(html,/Seller reputation not reported/);
  assert.match(html,/2 listings · 2 reported sellers · 1 platform/);assert.match(html,/Shipping and provider fees come later/);assert.match(html,/2 · Quotes after selection/);assert.match(html,/Purchase-only quotes and delivered totals are different/);assert.match(html,/No order or payment is created here/);
  assert.match(html,/<dt>Certificate<\/dt><dd>Number not reported<\/dd>/);assert.match(html,/Authenticity not verified/);assert.match(html,/PSA 10 · seller claim/);assert.doesNotMatch(html,/Best offer|Best seller|authenticity verified/);
});

test("sold and flagged offers remain visible and disabled regardless of strong seller metrics",()=>{
  const sold=offer("sold",{availability:"sold_out"}),review=offer("review",{grade:{...sample.offer().grade,review_required:true,review_reasons:["source_conflict"]}});
  const html=render([sold,review]);assert.equal((html.match(/<article /g)||[]).length,2);assert.match(html,/aria-label="Sold \/ unavailable"/);assert.match(html,/<strong class="dangerText">Sold<\/strong>/);assert.match(html,/Needs review/);
  assert.equal(chooseButtons(html).length,2);assert.ok(chooseButtons(html).every(button=>/disabled=""/.test(button)),"sold and flagged choice actions are disabled independently of pin controls");
});

test("seller names are escaped and unsafe profile links are not rendered even by a direct fixture caller",()=>{
  const escaped=render([offer("safe",{seller:seller("a",{display_name:"<img src=x onerror=alert(1)>"})})]);assert.match(escaped,/&lt;img/);assert.doesNotMatch(escaped,/<img src="x"/);
  const unsafe=render([offer("unsafe",{seller:seller("a",{url:"javascript:alert(1)"})})]);assert.doesNotMatch(unsafe,/href="javascript|Seller profile ↗/);assert.match(unsafe,/Seller not reported/);
});

test("a valid exact match for another printing stays in review with choice disabled and no price winner",()=>{
  const other="ja:SV2A:174/165:holo",offers=[exactListing(offer("other-a"),other),exactListing(offer("other-b",{price_minor:1000}),other)],html=render(offers);
  assert.equal(articles(html).length,2);assert.match(html,/<option value="available">Comparable available \(0\)<\/option>/);assert.match(html,/<option value="review">Needs verification \(2\)<\/option>/);
  assert.match(html,/Different catalog printing/);assert.doesNotMatch(html,/class="lowest"|class="stats"/);assert.ok(chooseButtons(html).every(button=>/disabled=""/.test(button)));
});

test("certificate-conflicted exact offers leave the available section and cannot claim the lowest eligible ask",()=>{
  const good=exactListing(offer("good",{price_minor:2000}),cardId),bad=exactListing(offer("bad",{price_minor:1}),cardId);
  const record={schema:"pokemon.psa-cert.v1",provider:"psa",status:"not_found",certificate_number:"12345678",checked_at:"2026-10-22T01:00:00Z",expires_at:null,cached:false,record_found:false,
    certificate_verified:false,authenticity_verified:false,physical_authenticity_verified:false,reason:"not_found",message:"No PSA record found.",record:null,comparison:{status:"not_compared",matched_fields:[],mismatched_fields:[],missing_fields:[]}};
  assert.doesNotThrow(()=>validateCommerceResponse("psa",{schema:"pokemon.agent-commerce.v1",mode:"on_demand_research",verification:record}));
  const html=render([good,bad],{certificateResults:{[bad.offer_id]:record}}),rows=articles(html),goodRow=rows.find(row=>row.includes("listing good,")),badRow=rows.find(row=>row.includes("listing bad,"));
  assert.match(html,/<option value="available">Comparable available \(1\)<\/option>/);assert.match(html,/<option value="review">Needs verification \(1\)<\/option>/);
  assert.ok(goodRow&&badRow);assert.ok(!/disabled=""/.test(chooseButtons(goodRow)[0]));assert.match(chooseButtons(badRow)[0],/disabled=""/);
  assert.match(badRow,/No record found/);assert.doesNotMatch(badRow,/class="lowest"/);assert.doesNotMatch(html,/class="stats"/,"one eligible ask has no distribution summary");
});

test("pinning affordances stay separate from the explicitly selected quote listing",()=>{
  const a=exactListing(offer("pin-a"),cardId),b=exactListing(offer("pin-b"),cardId),html=render([a,b],{selectedId:a.offer_id});
  const pinButtons=html.match(/<button\b[^>]*>Pin to compare<\/button>/g)||[];
  assert.equal(pinButtons.length,2);assert.ok(pinButtons.every(button=>/aria-pressed="false"/.test(button)),"selecting a quote listing does not pin it");
  assert.equal(chooseButtons(html).length,2);assert.match(chooseButtons(html)[0],/aria-pressed="true">Selected<\/button>/);assert.match(chooseButtons(html)[1],/aria-pressed="false">Select listing<\/button>/);
});

test("offered-copy photos are shown only from validated listing attachments, never substituted catalog art",()=>{
  const missing=offer("missing",{image_url:"https://catalog.example/art.jpg"}),missingHtml=render([missing]);
  assert.doesNotMatch(missingHtml,/<img\b|catalog\.example/);assert.match(missingHtml,/No photos of this offered copy were extracted/);assert.match(missingHtml,/Catalog artwork is not physical-copy evidence/);
  const o=offer("photo");o.listing_photos=[photo(o)];const html=render([o]);assert.equal((html.match(/<img\b/g)||[]).length,2);
  assert.match(html,/offered copy/);assert.match(html,/physical-copy connection unverified/);assert.match(html,/referrerPolicy="no-referrer"/);
  const unsafe=render([{...o,listing_photos:[photo(o,{url:"https://catalog.example/art.jpg"})]}]);assert.doesNotMatch(unsafe,/<img\b|catalog\.example/);assert.match(unsafe,/No listing<br\/>photo/);
});
