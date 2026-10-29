"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createRequire}=require("node:module"),localRequire=createRequire(path.resolve(__dirname,"../package.json"));
const {validateOffer,validateCommerceResponse}=require("../src/lib/pokemon/commerceContract.cjs");
const {DISCLOSURE,purchaseDestination}=require("../src/lib/pokemon/purchaseLink.cjs");
const {selectionMatches,handoffMatches}=require("../src/lib/pokemon/bnsChatState.cjs");
const {exactListing}=require("./listingEvidenceSamples.cjs"),sample=require("./commerceSamples.cjs");
const cardId=sample.research().card_id,clock=Date.parse("2026-10-22T01:00:02Z");
const product="https://www.ebay.com/itm/123456789012",affiliate=product+"?mkevt=1&mkcid=1&campid=5331234567&toolid=10001&customid=pilot_1";
function ebay(changes={}) {return {...sample.offer(),source:"ebay_us",native_id:"v1|123456789012|0",url:product,
  currency:"USD",purchase_link:{kind:"epn_affiliate",url:affiliate,disclosure:DISCLOSURE},...changes};}
function component(relative,stubs={}) {
  const ts=localRequire("typescript"),filename=path.resolve(__dirname,"../src/components/creator",relative),moduleValue={exports:{}};
  const compiled=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(compiled,{exports:moduleValue.exports,module:moduleValue,Date,Intl,require(id){
    if(id in stubs)return stubs[id];
    if(id.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(id.startsWith("@/lib/"))return localRequire(path.resolve(__dirname,"../src/lib",id.slice("@/lib/".length)));
    if(id.startsWith(".")){const child=path.resolve(path.dirname(filename),id+".tsx");if(fs.existsSync(child))return {__esModule:true,default:component(path.relative(path.resolve(__dirname,"../src/components/creator"),child),stubs)};}
    return localRequire(id);
  }});
  return moduleValue.exports.default;
}
const React=localRequire("react"),{renderToStaticMarkup}=localRequire("react-dom/server");
function render(offers,research,props={}) {
  return renderToStaticMarkup(React.createElement(component("pokemon/shopper/OfferEvidenceBoard.tsx"),{offers,research,cardId,clock,onSelect(){},...props}));
}

test("official EPN link remains separate from canonical selection and BNS URL",()=>{
  const offer=ebay();assert.doesNotThrow(()=>validateOffer(offer));
  assert.equal(purchaseDestination(offer).url,affiliate);assert.equal(offer.url,product);
  assert.equal(selectionMatches({...sample.selection(),offer},offer,clock),true);
  const receipt={...sample.handoff(),status:"manual_handoff_required",product_url:product};delete receipt.provider_result;
  assert.equal(handoffMatches(receipt,offer,cardId,"buyship",{country:"HK"},null,sample.selection().expires_at,clock),true);
  assert.equal(handoffMatches({...receipt,product_url:affiliate},offer,cardId,"buyship",{country:"HK"},null,sample.selection().expires_at,clock),false);
  const html=render([offer]);assert.match(html,/View on eBay ↗/);assert.match(html,/rel="sponsored noopener noreferrer"/);
  assert.ok(html.includes(DISCLOSURE));assert.ok(html.includes(`href="${product}"`));
  assert.equal((html.match(/We may earn a commission/g)||[]).length,1);
});

test("affiliate links cannot change listing identity, marketplace, disclosure or outbound host",()=>{
  const urls=[affiliate.replace("123456789012?","999999999999?"),affiliate.replace("www.ebay.com","evil.example"),
    affiliate.replace("www.ebay.com","www.ebay.com.evil.example"),affiliate.replace("www.ebay.com","u@www.ebay.com"),
    affiliate.replace("www.ebay.com","www.ebay.com:443"),affiliate.replace("https:","http:"),
    affiliate+"#",affiliate+"#tracking",affiliate+"&redirect=https%3A%2F%2Fevil.example",affiliate+"&campid=5331234567",
    affiliate.replace("campid=5331234567","campid=123"),affiliate.replace("customid=pilot_1","customid=peng%40example.com"),
    affiliate.replace("mkevt=1","mkevt=2"),affiliate.replace("mkcid=1","mkcid=2"),affiliate+"&var=8",
    affiliate.replace("/itm/","/foo/../itm/"),affiliate.replace("/itm/","/%69tm/"),
    affiliate+"&hash=%0D%0AX-Test",affiliate.replace("/itm/","/itm/\\")];
  for(const url of urls){const o=ebay({purchase_link:{kind:"epn_affiliate",url,disclosure:DISCLOSURE}});
    assert.throws(()=>validateOffer(o),/invalid_commerce_response/,url);assert.equal(purchaseDestination(o),null,url);}
  for(const change of [{source:"mercari"},{native_id:"v1|123456789012|42"},{scope:"product_summary"},{synthetic:true},
    {url:product+"?tracking=1"},{purchase_link:{kind:"epn_affiliate",url:affiliate,disclosure:"Verified cheapest"}},
    {purchase_link:null},{purchase_link:{kind:"epn_affiliate",url:affiliate,disclosure:DISCLOSURE,token:"secret"}}]){
    assert.throws(()=>validateOffer(ebay(change)),/invalid_commerce_response/);
  }
});

test("absent affiliate configuration uses direct eBay clickout without commission claims",()=>{
  const offer=ebay();delete offer.purchase_link;assert.doesNotThrow(()=>validateOffer(offer));
  assert.deepEqual(purchaseDestination(offer),{url:product,affiliate:false,disclosure:null});
  const research={...sample.research(),offers:[offer],marketplace_connections:[
    {source:"ebay_us",status:"enabled",message:"Browse is enabled; affiliate access is separately configured."}]};
  const html=render([offer],research);assert.match(html,/View on eBay ↗/);
  assert.match(html,/eBay official API \(Browse\)/);assert.doesNotMatch(html,/API \+ EPN|sponsored|We may earn/);
});

test("synthetic price examples cannot expose live marketplace destinations",()=>{
  const offer=ebay({synthetic:true});delete offer.purchase_link;
  offer.seller={id:"fixture-seller",display_name:"Fixture seller",url:"https://www.ebay.com/usr/fixture-seller",
    evidence_ref:"fixture:seller",observed_at:offer.observed_at,reputation:null};
  offer.listing_photos=[{url:"https://images.example.invalid/listings/ebay-fixture.jpg",role:"listing_photo",
    listing_url:offer.url,evidence_ref:"fixture:photo",observed_at:offer.observed_at}];
  assert.doesNotThrow(()=>validateOffer(offer));
  assert.equal(purchaseDestination(offer),null);
  const html=render([offer],undefined,{onCertificate(){throw Error("Synthetic certificate action must be hidden");}});
  assert.match(html,/Synthetic example · external links and certificate lookup disabled/);
  assert.doesNotMatch(html,/View on eBay|Open original listing|Seller profile ↗|Check certificate record/);
  assert.doesNotMatch(html,/<a\b[^>]*href="https:\/\/(?:www\.)?ebay\.com/);
  assert.doesNotMatch(html,/<img\b[^>]*src="https:\/\/images\.example\.invalid/);
});

test("eBay content stays in separate groups with no derived price statistics or pin controls",()=>{
  const a=exactListing(ebay()),b=exactListing(ebay({offer_id:"ebay-two",native_id:"v1|123456789013|0",url:product.replace(/012$/,"013")}));
  delete a.purchase_link;delete b.purchase_link;
  const mercari=exactListing({...sample.offer(),offer_id:"mercari-one",currency:"USD"});
  const html=render([a,b,mercari]);assert.match(html,/aria-label="eBay listings · /);assert.match(html,/aria-label="Other marketplace listings · /);
  assert.doesNotMatch(html,/class="stats"|class="lowest"/);
  const ebayArticles=(html.match(/<article\b[\s\S]*?<\/article>/g)||[]).filter(row=>row.includes("eBay listing"));
  assert.equal(ebayArticles.length,2);assert.ok(ebayArticles.every(row=>!row.includes("Pin to compare")));
});

test("not-connected Fanatics and eBay configuration states never manufacture offers or application status",()=>{
  const research={...sample.research(),offers:[],marketplace_connections:[
    {source:"ebay_us",status:"not_configured",message:"eBay production API and EPN accounts are not configured."},
    {source:"fanatics_collect",status:"not_configured",message:"Fanatics Collect partner access is not configured."}]};
  assert.doesNotThrow(()=>validateCommerceResponse("research",research));const html=render([],research);
  assert.match(html,/Fanatics Collect/);assert.match(html,/Not connected/);assert.doesNotMatch(html,/<article|Application pending|View on eBay|\$[0-9]/);
  for(const changes of [[{source:"fanatics_collect",status:"application_submitted",message:"Pending"}],
    [research.marketplace_connections[0],research.marketplace_connections[0]],
    [{source:"fanatics_collect",status:"not_configured",message:"",token:"secret"}]]){
    assert.throws(()=>validateCommerceResponse("research",{...research,marketplace_connections:changes}),/invalid_commerce_response/);
  }
});


test("backend-produced offline official Browse response passes the frontend contract unchanged",()=>{
  // Generated from the actual Python CommerceLoop + BrowseClient with fake transport only.
  const fixture=require("./fixtures/official-ebay-research.offline.json");
  assert.doesNotThrow(()=>validateCommerceResponse("research",structuredClone(fixture)));
  assert.equal(fixture.offers[0].purchase_link.url,affiliate);
  assert.equal(fixture.offers[0].url,product);
  assert.equal(purchaseDestination(fixture.offers[0]).url,affiliate);
  assert.equal(fixture.offers[0].grade.certificate_verified,false);
  assert.equal(fixture.offers[0].authenticity_verified,false);
});

test("actual mobile comparison renders not-connected provider state even with zero offers",()=>{
  const research={...sample.research(),offers:[],marketplace_connections:[
    {source:"ebay_us",status:"not_configured",message:"Official eBay access is not configured."},
    {source:"fanatics_collect",status:"not_configured",message:"Fanatics Collect partner access is not configured."}]};
  const state={ready:true,pending:"",error:"",thread:{workspace:{result:{candidate_cards:[],preferences:{}}}},messages:[],cards:[],history:[],bookmarks:[],compareIds:[],feedback:{},sheet:"compare",budget:null,budgetCurrency:null,gradePreference:"",
    card:{card_id:cardId,name:"Pikachu",collector_number:"173/165",set_code:"SV2A",language:"ja"},
    flow:{research,receipt:null,country:"HK",region:"",bindingKey:"",rows:[],clock,grade:"",currency:"",forwarder:"",certificateResults:{}}};
  const Mobile=component("pokemon/shopper/MobileAgent.tsx",{
    "next/link":{__esModule:true,default:({children,...props})=>React.createElement("a",props,children)},
    "./useMobileAgent":{__esModule:true,default:()=>state},
    "./OfferEvidenceBoard":{__esModule:true,default:component("pokemon/shopper/OfferEvidenceBoard.tsx")},
    "../live/LiveCollector":{CurrentCards:({children})=>children,CatalogArtwork:()=>null},
    "../live/PsaCertificate":{__esModule:true,default:()=>null},
    "../live/BnsReview":{__esModule:true,default:()=>null},
  });
  const html=renderToStaticMarkup(React.createElement(Mobile,{}));
  assert.match(html,/Marketplace connections/);assert.match(html,/eBay official API/);assert.match(html,/Fanatics Collect/);
  assert.match(html,/Not connected/);assert.match(html,/No matching candidates returned/);assert.doesNotMatch(html,/View on eBay|Application pending/);
});
