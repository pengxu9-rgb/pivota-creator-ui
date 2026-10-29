"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const ts=require("typescript"),React=require("react"),{renderToStaticMarkup}=require("react-dom/server");
const {validateCommerceResponse}=require("../src/lib/pokemon/commerceContract.cjs");
const {sourceReadinessView,photosAllowed}=require("../src/lib/pokemon/sourceReadiness.cjs");
const {readiness}=require("./sourceReadinessSamples.cjs"),sample=require("./commerceSamples.cjs");
const clone=structuredClone;
function loadComponent(relative){
  const filename=path.resolve(__dirname,"../src/components/creator/pokemon/shopper",relative),m={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{module:m,exports:m.exports,Date,Intl,require(id){
    if(id.endsWith(".module.css"))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
    if(id.startsWith("@/lib/"))return require(path.resolve(__dirname,"../src/lib",id.slice(6)));
    return require(id);
  }});return m.exports.default;
}
const Journey=loadComponent("OfferJourney.tsx"),render=props=>renderToStaticMarkup(React.createElement(Journey,props));
function research(){return {...sample.research(),source_readiness:readiness()};}
test("source readiness accepts captured offers after access closes but rejects contradictory capability or photo permission",()=>{
  const valid=research();assert.equal(validateCommerceResponse("research",valid),valid);
  const captured=clone(valid);captured.source_readiness=readiness({enabled:false,blocker:"source_window_closed"});assert.equal(validateCommerceResponse("research",captured),captured);
  for(const mutate of [r=>r.source_readiness.pop(),r=>r.source_readiness.push(r.source_readiness[0]),r=>r.source_readiness[0].secret="private",r=>r.source_readiness[1].method="none",r=>r.source_readiness[1].listing_read_enabled=false,r=>r.source_readiness[1].blocker="source_disabled",r=>r.source_readiness[0].photo_display="authorized_only",r=>r.source_readiness[1].blocker="invented",r=>r.source_readiness[1].message="secret\nvalue"]){const r=research();mutate(r);assert.throws(()=>validateCommerceResponse("research",r),/invalid_commerce_response/);}
  const withPhoto=research();withPhoto.offers[0].listing_photos=[{url:"https://static.mercdn.net/item/detail/orig/photos/m12345678901_1.jpg",role:"listing_photo",listing_url:withPhoto.offers[0].url,evidence_ref:"synthetic:listing-photo",observed_at:withPhoto.offers[0].observed_at}];
  assert.doesNotThrow(()=>validateCommerceResponse("research",withPhoto));withPhoto.source_readiness=readiness({photos:false});assert.throws(()=>validateCommerceResponse("research",withPhoto));
});
test("beta and unreported access present an honest blocked journey before any research response",()=>{
  const beta=render({browsingBeta:true});assert.match(beta,/Seller offers are not enabled in this beta/);assert.match(beta,/BNS quote requests are off/);assert.match(beta,/Orders and payments disabled/);assert.doesNotMatch(beta,/<a |<input|<button/);
  const absent=render({});assert.match(absent,/Live source access has not been confirmed/);assert.match(absent,/approved source|Approved listing access/);assert.doesNotMatch(absent,/Listing reads enabled/);
  const stale=render({research:{...research(),source_readiness:readiness({enabled:false,blocker:"source_revoked"})}});assert.match(stale,/Source access was withdrawn/);assert.doesNotMatch(stale,/Listing reads enabled/);
  const synthetic=render({research:{...research(),mode:"synthetic_fixture"}});assert.match(synthetic,/Offline journey example|No marketplace or buying service was contacted/);
});
test("readiness never equates an enabled source with inventory or physical authenticity",()=>{
  const html=render({research:research()});assert.match(html,/Listing reads enabled/);assert.match(html,/does not guarantee stock, card authenticity or whole-market coverage/);assert.match(html,/Compare item prices/);assert.match(html,/Recheck your exact listing/);assert.match(html,/Review the BNS next step/);assert.doesNotMatch(html,/Order complete|Pay now|Complete purchase/);
  assert.equal(photosAllowed(undefined,"mercari"),false);assert.equal(photosAllowed({source_readiness:[{}]},"mercari"),false);assert.equal(photosAllowed(research(),"mercari"),true);assert.equal(photosAllowed(research(),"snkrdunk"),false);
  assert.equal(sourceReadinessView({source_readiness:[{}]}).live,false);
});

// Real commerce hook and validators, with only React scheduling and IO replaced.
// There is no network or cloud/provider configuration in this rehearsal.
function flowHarness({inactive=false,missingReadiness=false,changed=false,unsafe=false}={}){
  const cells=[],effects=[],requests=[];let cursor=0,dirty=true,value,handoffs=0;
  const hooks={useState(initial){const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==="function"?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==="function"?next(cells[i].value):next;dirty=true;}];},useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}}};
  const before=new Date(Date.now()-1000).toISOString(),expires=new Date(Date.now()+300000).toISOString();
  function listing(id,price,grade="10"){return {...sample.offer(),offer_id:id,native_id:id,url:"https://jp.mercari.com/item/"+id,price_minor:price,observed_at:before,fresh_until:expires,grade:{company:"PSA",value:grade,certificate_verified:false},seller:{id:"seller-"+id,display_name:null,url:null,evidence_ref:"synthetic:seller",observed_at:before,reputation:null}};}
  const offers=[listing("m11111111111",2500),listing("m22222222222",2000),listing("m33333333333",1000,"9")];
  const data={...research(),checked_at:before,offers,source_readiness:readiness({enabled:!inactive})};
  if(missingReadiness)delete data.source_readiness;
  async function transport(operation,payload){requests.push({operation,payload:clone(payload)});
    if(operation==="commerce/research")return clone(data);
    if(operation==="commerce/select")return {...sample.selection(),expires_at:expires,offer:clone(offers.find(o=>o.offer_id===payload.offer_id))};
    if(operation==="commerce/handoff"){
      if(changed)throw Error("The source listing changed. Review its current price and choose it again.");
      const selected=offers[1];handoffs++;
      if(handoffs===1){const result=sample.handoff();result.product_url=selected.url;return result;}
      const result=sample.preview();result.product_url=selected.url;result.quote.listing={...result.quote.listing,title:selected.title,native_id:selected.native_id,url:selected.url,observed_at:before};
      result.quote.buyship.canonical_url=selected.url;result.quote.buyship.quoted_at=new Date().toISOString();result.quote.buyship.expires_at=expires;
      if(unsafe)result.order_created=true;
      return result;
    }throw Error("Unexpected transport operation "+operation);
  }
  const file=path.resolve(__dirname,"../src/components/creator/pokemon/live/useCommerceFlow.ts"),m={exports:{}},code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{module:m,exports:m.exports,Date,AbortController,Error,Set,Map,setTimeout:()=>0,clearTimeout(){},require(id){if(id==="react")return hooks;if(id==="../../pokemonClient")return {pokemonApi:transport};if(id.startsWith("@/lib/"))return require(path.resolve(__dirname,"../src/lib",id.slice(6)));throw Error(id);}});
  function update(){cursor=0;dirty=false;value=m.exports.default({transport});while(effects.length)effects.shift()();}
  async function settle(){for(let n=0;n<20;n++){if(dirty)update();await Promise.resolve();}if(dirty)update();}
  return {requests,offers,get value(){return value;},settle,async research(){await settle();await value.researchOffers({card_id:data.card_id,query:"Pikachu PSA 10",platforms:["mercari"]});await settle();value.setGrade("10");await settle();},dispose(){cells.forEach(c=>c?.cleanup?.());}};
}
test("real commerce state flow keeps same-platform sellers separate, chooses explicit variant and stops at an informational quote",async t=>{
  const h=flowHarness();t.after(()=>h.dispose());await h.research();assert.deepEqual(h.value.rows.map(o=>o.offer_id),h.offers.slice(0,2).map(o=>o.offer_id));
  await h.value.selectOffer(h.offers[1].offer_id);await h.settle();assert.equal(h.value.selection.offer.seller.id,"seller-m22222222222");assert.equal(h.value.receipt,null);
  await h.value.prepareHandoff();await h.settle();assert.equal(h.value.receipt.status,"variant_selection_required");
  const before=h.requests.length;await h.value.prepareHandoff();await h.settle();assert.equal(h.requests.length,before,"variant must be explicitly chosen");
  h.value.pickVariant(0);await h.settle();await h.value.prepareHandoff();await h.settle();
  assert.equal(h.value.error,"");assert.equal(h.value.receipt.status,"quote_ready_for_review");assert.equal(h.value.receipt.product_url,h.offers[1].url);assert.equal(h.value.receipt.order_created,false);assert.equal(h.value.receipt.purchasable,false);
  assert.equal(h.requests.at(-1).payload.variant_key,"sku-1");assert.ok(h.requests.every(r=>["commerce/research","commerce/select","commerce/handoff"].includes(r.operation)));assert.match(render({research:h.value.research,selection:h.value.selection,receipt:h.value.receipt}),/Review delivered costs/);
});
test("inactive source retains captured comparison rows while preventing further select and BNS requests",async t=>{
  for(const options of [{inactive:true},{missingReadiness:true}]){const h=flowHarness(options);t.after(()=>h.dispose());await h.research();assert.equal(h.value.rows.length,2);const count=h.requests.length;
  await h.value.selectOffer(h.offers[1].offer_id);await h.settle();assert.equal(h.requests.length,count);assert.match(h.value.error,/source is not active/);assert.equal(h.value.selection,null);}
});
test("a changed listing or unsafe order response clears the selection and never presents quote success",async t=>{
  for(const options of [{changed:true},{unsafe:true}]){
    const h=flowHarness(options);t.after(()=>h.dispose());await h.research();await h.value.selectOffer(h.offers[1].offer_id);await h.settle();await h.value.prepareHandoff();await h.settle();
    if(options.unsafe){h.value.pickVariant(0);await h.settle();await h.value.prepareHandoff();await h.settle();}
    assert.equal(h.value.receipt,null);assert.equal(h.value.selection,null);assert.ok(h.value.error);assert.ok(h.requests.every(r=>!r.operation.includes("order")&&!r.operation.includes("pay")));
  }
});
